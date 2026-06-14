# capture.ps1 — Bookmarks アプリのウィンドウを PNG にキャプチャする
#
# 使い方:
#   powershell -File capture.ps1 -OutFile ..\assets\hero.png
#   powershell -File capture.ps1 -OutFile ..\assets\shortcut.png -Crop "100,200,600,300"
#
# 仕組み:
#   - "Bookmarks" というメインウィンドウタイトルを持つプロセスを探す
#     (インストール版は app.exe、tauri:dev 版は bookmarks.exe のどちらでも可)
#   - Win32 PrintWindow + PW_RENDERFULLCONTENT でウィンドウ単位キャプチャ
#   - WebView2 が黒く描画される環境では CopyFromScreen にフォールバック
#   - SetProcessDPIAware を呼ぶため、高 DPI でも実ピクセルで保存される

param(
    [Parameter(Mandatory = $true)][string]$OutFile,
    # "x,y,width,height" 形式。キャプチャ後にその矩形だけ切り出す(省略可)
    [string]$Crop = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CaptureNative {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
    delegate bool EnumProc(IntPtr h, IntPtr lp);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    // タイトル完全一致 + 可視 + 非クローク(別仮想デスクトップ等でない)の
    // ウィンドウを探す。FindWindow は無題の隠しウィンドウを誤マッチするため不可。
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

[CaptureNative]::SetProcessDPIAware() | Out-Null

$hwnd = [CaptureNative]::FindAppWindow("Bookmarks")
if ($hwnd -eq [IntPtr]::Zero) { throw "Bookmarks window not found. Is the app running?" }

$rect = New-Object CaptureNative+RECT
[CaptureNative]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { throw "Invalid window rect ($w x $h)." }

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
# 0x2 = PW_RENDERFULLCONTENT (WebView2/DirectComposition の内容も描画する)
$ok = [CaptureNative]::PrintWindow($hwnd, $hdc, 0x2)
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()

# PrintWindow が黒画像を返す環境の検出: サンプル画素がすべて黒なら失敗とみなす
function Test-AllBlack([System.Drawing.Bitmap]$b) {
    foreach ($fx in 0.2, 0.5, 0.8) {
        foreach ($fy in 0.2, 0.5, 0.8) {
            $p = $b.GetPixel([int]($b.Width * $fx), [int]($b.Height * $fy))
            if ($p.R -gt 0 -or $p.G -gt 0 -or $p.B -gt 0) { return $false }
        }
    }
    return $true
}

if (-not $ok -or (Test-AllBlack $bmp)) {
    Write-Warning "PrintWindow failed or returned black; falling back to CopyFromScreen."
    $bmp.Dispose()
    # バックグラウンドプロセスは SetForegroundWindow を拒否されるため、
    # Alt キー送出 + 一時的な TOPMOST 化で確実に最前面へ出す
    [CaptureNative]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)        # ALT down
    [CaptureNative]::SetForegroundWindow($hwnd) | Out-Null
    [CaptureNative]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)        # ALT up
    $HWND_TOPMOST = [IntPtr](-1); $HWND_NOTOPMOST = [IntPtr](-2)
    $SWP_NOMOVE_NOSIZE = 0x0001 -bor 0x0002
    [CaptureNative]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, $SWP_NOMOVE_NOSIZE) | Out-Null
    Start-Sleep -Milliseconds 500
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $gfx.Dispose()
    [CaptureNative]::SetWindowPos($hwnd, $HWND_NOTOPMOST, 0, 0, 0, 0, $SWP_NOMOVE_NOSIZE) | Out-Null
}

if ($Crop) {
    $parts = $Crop -split "," | ForEach-Object { [int]$_ }
    if ($parts.Count -ne 4) { throw "Crop must be 'x,y,width,height'." }
    $cropRect = New-Object System.Drawing.Rectangle($parts[0], $parts[1], $parts[2], $parts[3])
    $cropped = $bmp.Clone($cropRect, $bmp.PixelFormat)
    $bmp.Dispose()
    $bmp = $cropped
}

if ([System.IO.Path]::IsPathRooted($OutFile)) { $outPath = $OutFile }
else { $outPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutFile)) }
$dir = [System.IO.Path]::GetDirectoryName($outPath)
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "Saved: $outPath ($w x $h)"
