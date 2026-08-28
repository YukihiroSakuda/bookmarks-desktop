//! Opening a set of local folders, preferably as tabs in one Explorer window.
//!
//! **Windows exposes no API for creating a File Explorer tab.** Tabs arrived in
//! Windows 11 22H2 as UI only — neither the command line nor the shell COM
//! interfaces can target one. So the tab path here is input automation: open
//! the first folder normally, then drive `Ctrl+T` / `Ctrl+L` / path / `Enter`
//! at that window for the rest.
//!
//! That is unverifiable by construction — nothing reports back whether a tab
//! was really created — and a future Explorer change can break it silently.
//! Two consequences shape this module:
//!
//! * **One window per folder is always the fallback**, taken whenever anything
//!   is off (old build, setting disabled, window not found, focus stolen). The
//!   caller gets told which mode actually ran, and never claims "opened in
//!   tabs" on the strength of a `SendInput` return value.
//! * **Focus is re-checked before every keystroke.** Synthetic input goes
//!   wherever focus happens to be, so if the user clicks away mid-run we stop
//!   immediately rather than type a path into whatever they clicked on.

/// Open `paths`, as tabs in a single window when `want_tabs` and the platform
/// allow it. Returns the mode actually used: `"tabs"` or `"windows"`.
pub fn open_folders(paths: &[String], want_tabs: bool) -> Result<String, String> {
    if paths.is_empty() {
        return Ok("windows".into());
    }
    #[cfg(windows)]
    {
        if want_tabs && paths.len() > 1 && supports_tabs() {
            match windows_impl::open_as_tabs(paths) {
                Ok(()) => return Ok("tabs".into()),
                // Partial progress: `rest` is the first path the tab attempt
                // never opened. Falling back over the whole list would open the
                // earlier ones a second time.
                Err(rest) => return open_each_in_window(&paths[rest..]),
            }
        }
    }
    #[cfg(not(windows))]
    let _ = want_tabs;

    open_each_in_window(paths)
}

fn open_each_in_window(paths: &[String]) -> Result<String, String> {
    let mut last_err: Option<String> = None;
    let mut opened = 0;
    for p in paths {
        match tauri_plugin_opener::open_path(p, None::<&str>) {
            Ok(()) => opened += 1,
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    if opened == 0 {
        return Err(last_err.unwrap_or_else(|| "フォルダを開けませんでした".into()));
    }
    Ok("windows".into())
}

/// File Explorer grew tabs in Windows 11 22H2 (build 22621). Below that the
/// automation has nothing to drive, so it is never attempted.
#[cfg(windows)]
fn supports_tabs() -> bool {
    // Read the build from the registry rather than the version APIs: those are
    // subject to manifest-based compatibility shimming, the registry value is
    // not.
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
    else {
        return false;
    };
    let Ok(build): Result<String, _> = key.get_value("CurrentBuildNumber") else {
        return false;
    };
    build.parse::<u32>().map(|b| b >= 22621).unwrap_or(false)
}

#[cfg(windows)]
mod windows_impl {
    use std::thread::sleep;
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
        VIRTUAL_KEY, VK_CONTROL, VK_L, VK_RETURN, VK_T,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetForegroundWindow, IsWindowVisible, SetForegroundWindow,
    };

    /// Explorer's browser window class. Stable since Windows XP, and unchanged
    /// by the Windows 11 tab UI (tabs live inside one CabinetWClass window).
    const EXPLORER_CLASS: &str = "CabinetWClass";

    /// After Ctrl+T, before the new tab accepts an address.
    const AFTER_NEW_TAB: Duration = Duration::from_millis(150);
    /// After committing an address, before the next Ctrl+T.
    const AFTER_NAVIGATE: Duration = Duration::from_millis(250);
    /// How long to wait for the first folder's window to appear.
    const WINDOW_WAIT: Duration = Duration::from_millis(3000);

    struct Collector {
        windows: Vec<HWND>,
    }

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        let collector = &mut *(lparam.0 as *mut Collector);
        if IsWindowVisible(hwnd).as_bool() {
            let mut buf = [0u16; 128];
            let len = GetClassNameW(hwnd, &mut buf);
            if len > 0 {
                let class = String::from_utf16_lossy(&buf[..len as usize]);
                if class == EXPLORER_CLASS {
                    collector.windows.push(hwnd);
                }
            }
        }
        true.into()
    }

    fn explorer_windows() -> Vec<HWND> {
        let mut collector = Collector { windows: Vec::new() };
        unsafe {
            let _ = EnumWindows(
                Some(collect),
                LPARAM(&mut collector as *mut Collector as isize),
            );
        }
        collector.windows
    }

    /// Open the first path, find the window it produced, then add the rest as
    /// tabs in that window.
    ///
    /// The new window is identified by diffing the set of Explorer windows
    /// before and after, rather than by asking the shell what it opened. That
    /// keeps working when Explorer is configured to launch folder windows in a
    /// separate process, where the COM-based enumeration can come up empty.
    /// On failure returns the index of the first path that was *not* opened,
    /// so the caller can fall back over only what is left.
    pub fn open_as_tabs(paths: &[String]) -> Result<(), usize> {
        let before = explorer_windows();

        if tauri_plugin_opener::open_path(&paths[0], None::<&str>).is_err() {
            return Err(0);
        }

        let Some(hwnd) = wait_for_new_window(&before) else {
            // The first folder is open, just not findable. Everything after it
            // is still outstanding.
            return Err(1);
        };

        for (index, path) in paths.iter().enumerate().skip(1) {
            if add_tab(hwnd, path).is_err() {
                return Err(index);
            }
        }
        Ok(())
    }

    fn wait_for_new_window(before: &[HWND]) -> Option<HWND> {
        let deadline = Instant::now() + WINDOW_WAIT;
        while Instant::now() < deadline {
            sleep(Duration::from_millis(100));
            let now = explorer_windows();
            if let Some(hwnd) = now.iter().find(|h| !before.iter().any(|b| b.0 == h.0)) {
                return Some(*hwnd);
            }
        }
        None
    }

    /// Drive one Ctrl+T / Ctrl+L / type / Enter cycle against `hwnd`.
    ///
    /// Focus is asserted before each burst. Synthetic input lands wherever
    /// focus is, so a user clicking away mid-run would otherwise get a file
    /// path typed into their editor.
    fn add_tab(hwnd: HWND, path: &str) -> Result<(), ()> {
        focus(hwnd)?;
        chord(VK_T)?;
        sleep(AFTER_NEW_TAB);

        focus(hwnd)?;
        chord(VK_L)?;
        sleep(AFTER_NEW_TAB);

        focus(hwnd)?;
        type_text(path)?;
        tap(VK_RETURN)?;
        sleep(AFTER_NAVIGATE);
        Ok(())
    }

    fn focus(hwnd: HWND) -> Result<(), ()> {
        unsafe {
            if GetForegroundWindow() != hwnd {
                // Fails when this process has lost the right to set the
                // foreground window — which is exactly the case where typing
                // would go somewhere unintended.
                let _ = SetForegroundWindow(hwnd);
                sleep(Duration::from_millis(80));
                if GetForegroundWindow() != hwnd {
                    return Err(());
                }
            }
        }
        Ok(())
    }

    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// One UTF-16 code unit as a synthetic keypress. Unicode input bypasses the
    /// keyboard layout and the IME, so Japanese paths type correctly. The
    /// clipboard would be simpler and is deliberately not used — it belongs to
    /// the user, not to us.
    fn unicode(unit: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: if up {
                        KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                    } else {
                        KEYEVENTF_UNICODE
                    },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn send(inputs: &[INPUT]) -> Result<(), ()> {
        let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize == inputs.len() {
            Ok(())
        } else {
            Err(())
        }
    }

    fn chord(vk: VIRTUAL_KEY) -> Result<(), ()> {
        send(&[
            key(VK_CONTROL, false),
            key(vk, false),
            key(vk, true),
            key(VK_CONTROL, true),
        ])
    }

    fn tap(vk: VIRTUAL_KEY) -> Result<(), ()> {
        send(&[key(vk, false), key(vk, true)])
    }

    fn type_text(text: &str) -> Result<(), ()> {
        let inputs: Vec<INPUT> = text
            .encode_utf16()
            .flat_map(|unit| [unicode(unit, false), unicode(unit, true)])
            .collect();
        if inputs.is_empty() {
            return Ok(());
        }
        send(&inputs)
    }
}
