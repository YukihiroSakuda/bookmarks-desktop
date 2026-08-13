//! Windows packaging (MSIX) helpers.
//!
//! The Store build runs inside an MSIX container, where HKCU writes are
//! virtualized into the package's private hive (`SystemAppData\Helium\User.dat`)
//! and never reach the real registry. Launch-at-login and the Explorer context
//! menu therefore cannot be self-registered there — they are declared in
//! `msix/AppxManifest.xml` instead (`windows.startupTask` and
//! `windows.fileExplorerContextMenus`). These helpers let the app tell the two
//! deployment modes apart.

/// True when the process runs with MSIX package identity (Store build).
// Only consulted by release builds, which are the only ones that self-register.
#[cfg_attr(debug_assertions, allow(dead_code))]
pub fn is_packaged() -> bool {
    use windows::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    let mut len: u32 = 0;
    // Querying with a zero-length buffer fails either way; the error code is
    // what distinguishes "no package" from "packaged, buffer too small".
    let err = unsafe { GetCurrentPackageFullName(&mut len, None) };
    err != APPMODEL_ERROR_NO_PACKAGE
}

/// True when Windows launched this process through the manifest's
/// `windows.startupTask` extension (i.e. at login), which is the packaged
/// equivalent of the `--hidden` argument used by the `Run` registry entry.
///
/// Startup tasks cannot carry command-line arguments, so the activation kind is
/// the only signal available.
pub fn launched_by_startup_task() -> bool {
    use windows::ApplicationModel::Activation::ActivationKind;
    use windows::ApplicationModel::AppInstance;

    match AppInstance::GetActivatedEventArgs() {
        Ok(args) => args.Kind() == Ok(ActivationKind::StartupTask),
        // Unpackaged, or not activated through an extension.
        Err(_) => false,
    }
}
