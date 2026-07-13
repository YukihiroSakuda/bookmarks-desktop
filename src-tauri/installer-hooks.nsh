; The app now stays resident in the system tray after its window is closed
; (see lib.rs's CloseRequested handler), so a running instance can hold a
; lock on app.exe during an upgrade/reinstall. Without this, the installer's
; uninstall step can't fully replace the binary, leaving the user to close
; the app manually and re-run the installer a second time.
;
; Force-close any running instance before install/uninstall so the whole
; upgrade completes in a single pass. taskkill's exit code is ignored (it
; simply means no matching process was running).

!macro NSIS_HOOK_PREINSTALL
  ExecWait 'taskkill /F /IM app.exe'
  Sleep 500
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait 'taskkill /F /IM app.exe'
  Sleep 500
!macroend
