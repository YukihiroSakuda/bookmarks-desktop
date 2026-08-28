//! Read back which folders are currently open in File Explorer.
//!
//! This is the input side of capturing a work session: the set of folders the
//! user has open *is* the folder half of what they are working on, so it does
//! not have to be recalled and typed in.
//!
//! Unlike creating a tab (`explorertabs`), reading is a supported operation.
//! The shell publishes its open browser windows through `IShellWindows`, and
//! each one reports where it is pointing via `IWebBrowser2::LocationURL`. No
//! automation, nothing undocumented — so `explorertabs`' caveats do not apply
//! here.
//!
//! `IShellWindows` also enumerates Internet Explorer windows and shell views
//! with no filesystem location behind them (This PC, Control Panel, Recycle
//! Bin). Everything is filtered on `LocationURL` being a `file:` URL, which
//! excludes all of those in one test rather than trying to name them.

use serde::Serialize;

/// One open Explorer window.
#[derive(Serialize, Clone)]
pub struct OpenFolder {
    /// Filesystem path the window is showing.
    pub path: String,
    /// Leaf name, for display when the path is long.
    pub name: String,
    /// The window, so a later "close the session" can target it. Serialized as
    /// a number because that is all the frontend does with it — pass it back.
    pub hwnd: isize,
}

#[cfg(target_os = "windows")]
pub fn list_open_folders() -> Result<Vec<OpenFolder>, String> {
    windows_impl::list()
}

#[cfg(not(target_os = "windows"))]
pub fn list_open_folders() -> Result<Vec<OpenFolder>, String> {
    // Explorer is a Windows concept; elsewhere there is simply nothing open.
    Ok(Vec::new())
}

/// Turn a `file:` URL from the shell into a filesystem path.
///
/// Kept out of the Windows-only module so it can be reasoned about (and
/// eventually tested) without a shell: percent-decoding and the leading-slash
/// rule are where this goes wrong, not the COM call.
fn path_from_file_url(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("file:///")
        .or_else(|| url.strip_prefix("file://"))?;

    let decoded = percent_encoding::percent_decode_str(rest)
        .decode_utf8()
        .ok()?
        .into_owned();

    // A UNC path arrives as `file://server/share`, so the host is part of the
    // path and the `\\` prefix has to be put back. A local path arrives as
    // `file:///C:/x` and the leading slash is already gone above.
    let path = if url.starts_with("file:///") {
        decoded.replace('/', "\\")
    } else {
        format!("\\\\{}", decoded.replace('/', "\\"))
    };

    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::{path_from_file_url, OpenFolder};
    use windows::core::Interface;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Shell::{IShellWindows, IWebBrowser2, ShellWindows};

    /// COM must be initialized on the calling thread and torn down on the same
    /// one. Mirrors `shortcutdir::ComGuard`.
    struct ComGuard;

    impl ComGuard {
        fn new() -> Result<Self, String> {
            unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
                .ok()
                .map_err(|e| format!("COM init failed: {e}"))?;
            Ok(Self)
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    pub fn list() -> Result<Vec<OpenFolder>, String> {
        let _com = ComGuard::new()?;

        let windows: IShellWindows =
            unsafe { CoCreateInstance(&ShellWindows, None, CLSCTX_ALL) }
                .map_err(|e| format!("ShellWindows is unavailable: {e}"))?;

        let count = unsafe { windows.Count() }.map_err(|e| e.to_string())?;

        let mut out: Vec<OpenFolder> = Vec::new();
        for index in 0..count {
            // The shell's collections index on VT_I4, so the VARIANT is built
            // from an i32 — an i64 silently matches nothing. Same trap as the
            // Quick Access code in `shortcutdir`.
            let Ok(dispatch) = (unsafe { windows.Item(&VARIANT::from(index)) }) else {
                continue;
            };
            let Ok(browser) = dispatch.cast::<IWebBrowser2>() else {
                continue;
            };
            let Ok(url) = (unsafe { browser.LocationURL() }) else {
                continue;
            };

            // Not a `file:` URL means an Internet Explorer window or a shell
            // view with no path behind it. Both are correctly skipped.
            let Some(path) = path_from_file_url(&url.to_string()) else {
                continue;
            };

            // Two windows on the same folder are one entry: the user is
            // capturing places, not windows.
            if out.iter().any(|f| f.path.eq_ignore_ascii_case(&path)) {
                continue;
            }

            let hwnd = unsafe { browser.HWND() }.map(|h| h.0).unwrap_or(0);
            let name = std::path::Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());

            out.push(OpenFolder { path, name, hwnd });
        }

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::path_from_file_url;

    #[test]
    fn decodes_a_local_path() {
        assert_eq!(
            path_from_file_url("file:///C:/Work/ProjectA").as_deref(),
            Some("C:\\Work\\ProjectA")
        );
    }

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(
            path_from_file_url("file:///C:/My%20Docs/%E8%A8%AD%E8%A8%88").as_deref(),
            Some("C:\\My Docs\\設計")
        );
    }

    #[test]
    fn restores_the_unc_prefix() {
        assert_eq!(
            path_from_file_url("file://server/share/dir").as_deref(),
            Some("\\\\server\\share\\dir")
        );
    }

    #[test]
    fn rejects_non_file_urls() {
        // An Internet Explorer window, and a shell view with no path.
        assert_eq!(path_from_file_url("https://example.com"), None);
        assert_eq!(path_from_file_url(""), None);
    }
}
