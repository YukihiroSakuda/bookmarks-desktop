# ui.ps1 — 撮影セッション中の UI 操作ヘルパー(ドットソースして使う)
#
#   . .\ui.ps1
#   Set-BookmarksWindow -X 0 -Y 0 -W 1200 -H 800
#   Invoke-UiaButton -Name "Tag Rule"
#   Send-KeysToApp "/design"
#   Move-MouseTo 640 320            # ホバー(メモプレビュー用)
#   Click-At 640 320

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

if (-not ([System.Management.Automation.PSTypeName]'UiNative').Type) {
    Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class UiNative {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
    delegate bool EnumProc(IntPtr h, IntPtr lp);

    // タイトル完全一致 + 可視 + 非クロークのウィンドウを探す
    public static IntPtr FindAppWindow(string title) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, lp) => {
            var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
            if (sb.ToString() == title && IsWindowVisible(h)) {
                int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
                if (cloaked == 0) { found = h; return false; }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@
}
[UiNative]::SetProcessDPIAware() | Out-Null

function Get-BookmarksHwnd {
    $hwnd = [UiNative]::FindAppWindow("Bookmarks")
    if ($hwnd -eq [IntPtr]::Zero) { throw "Bookmarks window not found." }
    return $hwnd
}

# バックグラウンドプロセスは SetForegroundWindow を拒否されるため Alt キーを
# 送出してから呼ぶ(フォアグラウンドロックの回避)
function Set-ForegroundReliably([IntPtr]$Hwnd) {
    [UiNative]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)   # ALT down
    [UiNative]::SetForegroundWindow($Hwnd) | Out-Null
    [UiNative]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)   # ALT up
}

function Set-BookmarksWindow([int]$X = 0, [int]$Y = 0, [int]$W = 1200, [int]$H = 800) {
    $hwnd = Get-BookmarksHwnd
    [UiNative]::MoveWindow($hwnd, $X, $Y, $W, $H, $true) | Out-Null
    Set-ForegroundReliably $hwnd
    Start-Sleep -Milliseconds 300
}

function Focus-App {
    Set-ForegroundReliably (Get-BookmarksHwnd)
    Start-Sleep -Milliseconds 200
}

# UIA でボタン名を指定してクリック(WebView2 のアクセシビリティツリー経由)
function Invoke-UiaButton([Parameter(Mandatory = $true)][string]$Name, [int]$TimeoutSec = 10) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle((Get-BookmarksHwnd))
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Button)),
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $Name))
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if ($el) { break }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)
    if (-not $el) { throw "Button '$Name' not found via UIA." }

    $invoke = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
    Start-Sleep -Milliseconds 400
}

# UIA 要素の画面上の位置を返す(クリック座標やホバー位置の特定に使う)
function Get-UiaElementRect([Parameter(Mandatory = $true)][string]$Name) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle((Get-BookmarksHwnd))
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $el) { throw "Element '$Name' not found." }
    return $el.Current.BoundingRectangle
}

function Send-KeysToApp([Parameter(Mandatory = $true)][string]$Keys) {
    Focus-App
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Start-Sleep -Milliseconds 400
}

function Move-MouseTo([int]$X, [int]$Y) {
    [UiNative]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 100
}

function Click-At([int]$X, [int]$Y) {
    Focus-App
    Move-MouseTo $X $Y
    [UiNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)  # LEFTDOWN
    [UiNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)  # LEFTUP
    Start-Sleep -Milliseconds 400
}
