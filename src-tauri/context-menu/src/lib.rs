//! Explorer "Add to Bookmarks" context menu handler for the MSIX (Store) build.
//!
//! The unpackaged build registers its verb by writing
//! `HKCU\Software\Classes\*\shell\AddToBookmarks` at startup. Inside an MSIX
//! container those writes are virtualized into the package's private hive and
//! never reach Explorer, so the packaged build declares this DLL as an
//! `IExplorerCommand` handler in `msix/AppxManifest.xml`
//! (`windows.comServer` + `windows.fileExplorerContextMenus`) instead.
//!
//! Invoking the verb launches the app through its `bookmarks-tags.exe`
//! execution alias with `--path <selected item>` — the same argument the
//! registry verb passes — so the single-instance handler needs no changes.

use std::ffi::c_void;
use std::path::PathBuf;

use windows_core::{
    implement, w, Error, Interface, Ref, Result, BOOL, GUID, HRESULT, IUnknown, PCWSTR, PWSTR,
};
use windows::Win32::Foundation::{
    CLASS_E_CLASSNOTAVAILABLE, CLASS_E_NOAGGREGATION, E_FAIL, E_NOTIMPL, E_POINTER, HMODULE,
    MAX_PATH, S_FALSE,
};
use windows::Win32::System::Com::{CoTaskMemFree, IBindCtx, IClassFactory, IClassFactory_Impl};
use windows::Win32::System::LibraryLoader::{
    GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
    GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
};
use windows::Win32::UI::Shell::{
    IEnumExplorerCommand, IExplorerCommand, IExplorerCommand_Impl, IShellItemArray, SHStrDupW,
    ECF_DEFAULT, ECS_ENABLED, SIGDN_FILESYSPATH,
};

/// Must match the `Clsid` in `msix/AppxManifest.xml`.
const CLSID_ADD_TO_BOOKMARKS: GUID = GUID::from_u128(0xf981b3c2_d892_4a14_a921_1fa9d161337e);

// ---------- The command ----------

#[implement(IExplorerCommand)]
struct AddToBookmarks;

impl IExplorerCommand_Impl for AddToBookmarks_Impl {
    fn GetTitle(&self, _items: Ref<'_, IShellItemArray>) -> Result<PWSTR> {
        // Explorer takes ownership of the returned buffer, so it has to be
        // CoTaskMemAlloc'd — SHStrDupW does that.
        unsafe { SHStrDupW(w!("Add to Bookmarks")) }
    }

    fn GetIcon(&self, _items: Ref<'_, IShellItemArray>) -> Result<PWSTR> {
        let Some(exe) = package_exe() else {
            return Err(Error::from(E_FAIL));
        };
        let source: Vec<u16> = format!("{},0\0", exe.display()).encode_utf16().collect();
        unsafe { SHStrDupW(PCWSTR(source.as_ptr())) }
    }

    fn GetToolTip(&self, _items: Ref<'_, IShellItemArray>) -> Result<PWSTR> {
        // No tooltip: Explorer falls back to the title.
        Err(Error::from(E_NOTIMPL))
    }

    fn GetCanonicalName(&self) -> Result<GUID> {
        Ok(GUID::zeroed())
    }

    fn GetState(&self, _items: Ref<'_, IShellItemArray>, _ok_to_be_slow: BOOL) -> Result<u32> {
        Ok(ECS_ENABLED.0 as u32)
    }

    fn Invoke(&self, items: Ref<'_, IShellItemArray>, _ctx: Ref<'_, IBindCtx>) -> Result<()> {
        let items = items.ok()?;

        // The registry verb passes a single `%1`, and the app keeps one pending
        // path, so only the first selected item is forwarded.
        if unsafe { items.GetCount()? } == 0 {
            return Ok(());
        }
        let item = unsafe { items.GetItemAt(0)? };
        let display = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH)? };
        let path = unsafe { display.to_string() };
        unsafe { CoTaskMemFree(Some(display.0 as *const c_void)) };

        let path = path.map_err(|e| Error::new(E_FAIL, format!("invalid item path: {e}")))?;
        launch_app(&path)
    }

    fn GetFlags(&self) -> Result<u32> {
        Ok(ECF_DEFAULT.0 as u32)
    }

    fn EnumSubCommands(&self) -> Result<IEnumExplorerCommand> {
        Err(Error::from(E_NOTIMPL))
    }
}

/// Starts the app with the selected path. Uses the `bookmarks-tags.exe`
/// execution alias declared in the manifest: unlike the versioned
/// `C:\Program Files\WindowsApps\...\app.exe` path it is stable across Store
/// updates, and launching through it keeps the app's package identity.
fn launch_app(path: &str) -> Result<()> {
    let launcher = alias_exe()
        .or_else(package_exe)
        .ok_or_else(|| Error::new(E_FAIL, "could not locate the Bookmarks executable"))?;

    std::process::Command::new(&launcher)
        .arg("--path")
        .arg(path)
        .spawn()
        .map_err(|e| Error::new(E_FAIL, format!("failed to launch {}: {e}", launcher.display())))?;

    Ok(())
}

/// `%LOCALAPPDATA%\Microsoft\WindowsApps\bookmarks-tags.exe` — the app execution
/// alias installed from the package manifest. The name has to match the
/// `desktop:ExecutionAlias` there.
fn alias_exe() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let alias = PathBuf::from(local)
        .join("Microsoft")
        .join("WindowsApps")
        .join("bookmarks-tags.exe");
    alias.exists().then_some(alias)
}

/// `app.exe` sitting next to this DLL inside the package.
fn package_exe() -> Option<PathBuf> {
    let mut buf = [0u16; MAX_PATH as usize];
    let len = unsafe { GetModuleFileNameW(Some(this_module()?), &mut buf) } as usize;
    if len == 0 || len >= buf.len() {
        return None;
    }
    let dll = PathBuf::from(String::from_utf16_lossy(&buf[..len]));
    Some(dll.parent()?.join("app.exe"))
}

/// Handle of this DLL, resolved from the address of a function inside it —
/// avoids having to capture it in `DllMain`.
fn this_module() -> Option<HMODULE> {
    let mut module = HMODULE::default();
    unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            PCWSTR(this_module as *const () as *const u16),
            &mut module,
        )
        .ok()?
    };
    Some(module)
}

// ---------- COM plumbing ----------

#[implement(IClassFactory)]
struct ClassFactory;

impl IClassFactory_Impl for ClassFactory_Impl {
    fn CreateInstance(
        &self,
        outer: Ref<'_, IUnknown>,
        iid: *const GUID,
        object: *mut *mut c_void,
    ) -> Result<()> {
        if !outer.is_null() {
            return Err(Error::from(CLASS_E_NOAGGREGATION));
        }
        let command: IExplorerCommand = AddToBookmarks.into();
        unsafe { command.query(iid, object).ok() }
    }

    fn LockServer(&self, _lock: BOOL) -> Result<()> {
        Ok(())
    }
}

#[no_mangle]
unsafe extern "system" fn DllGetClassObject(
    clsid: *const GUID,
    iid: *const GUID,
    object: *mut *mut c_void,
) -> HRESULT {
    if object.is_null() {
        return E_POINTER;
    }
    *object = std::ptr::null_mut();
    if clsid.is_null() || iid.is_null() {
        return E_POINTER;
    }
    if *clsid != CLSID_ADD_TO_BOOKMARKS {
        return CLASS_E_CLASSNOTAVAILABLE;
    }

    let factory: IClassFactory = ClassFactory.into();
    factory.query(iid, object)
}

#[no_mangle]
extern "system" fn DllCanUnloadNow() -> HRESULT {
    // The handler runs in a COM surrogate that is torn down on its own; keeping
    // the DLL loaded avoids races with in-flight command objects.
    S_FALSE
}
