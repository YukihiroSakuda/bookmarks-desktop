# build.ps1 — 配布用の単一ファイルを生成する
#
#   powershell -ExecutionPolicy Bypass -File build.ps1            # HTML + PDF を生成
#   powershell -ExecutionPolicy Bypass -File build.ps1 -HtmlOnly  # 自己完結 HTML のみ
#   powershell -ExecutionPolicy Bypass -File build.ps1 -PdfOnly   # PDF のみ
#
# 生成物 (promo\dist\):
#   bookmarks-promo.html … assets\*.png を base64 で埋め込んだ自己完結 HTML（画像は同梱、
#                           フォントのみ Google Fonts CDN を参照。オフライン時は system-ui 表示）
#   bookmarks-promo.pdf  … 上記 HTML から Chrome/Edge ヘッドレスで出力した PDF
#                           （背景色・画像・使用フォントをすべて埋め込んだ完全な単一ファイル）

param(
    [switch]$HtmlOnly,
    [switch]$PdfOnly,
    [string]$ChromePath
)

$ErrorActionPreference = "Stop"

$promoDir = Split-Path $PSScriptRoot -Parent
$srcHtml  = Join-Path $promoDir "index.html"
$assetDir = Join-Path $promoDir "assets"
$distDir  = Join-Path $promoDir "dist"
New-Item -ItemType Directory -Force $distDir | Out-Null

$outHtml = Join-Path $distDir "bookmarks-promo.html"
$outPdf  = Join-Path $distDir "bookmarks-promo.pdf"

# ---- 1. assets\*.png を base64 データ URI として埋め込む ----
$html = [System.IO.File]::ReadAllText($srcHtml, [System.Text.Encoding]::UTF8)

$refs = [regex]::Matches($html, 'assets/([^"'']+\.(?:png|jpg|jpeg|svg|webp))') |
    ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique

$missing = @()
foreach ($name in $refs) {
    $file = Join-Path $assetDir $name
    if (Test-Path $file) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = ([System.IO.Path]::GetExtension($file)).TrimStart('.').ToLower()
        $mime = switch ($ext) {
            "jpg"  { "image/jpeg" }
            "jpeg" { "image/jpeg" }
            "svg"  { "image/svg+xml" }
            "webp" { "image/webp" }
            default { "image/png" }
        }
        $uri = "data:$mime;base64," + [System.Convert]::ToBase64String($bytes)
        $html = $html.Replace("assets/$name", $uri)
    } else {
        $missing += $name
    }
}

if ($missing.Count -gt 0) {
    Write-Warning ("未配置の画像（リンク切れのまま出力されます）: " + ($missing -join ", "))
    Write-Warning "promo\assets\ に画像を用意してから再実行してください。"
}

# UTF-8 (BOM なし) で書き出す
[System.IO.File]::WriteAllText($outHtml, $html, (New-Object System.Text.UTF8Encoding $false))
$kb = [math]::Round((Get-Item $outHtml).Length / 1KB)
Write-Output "HTML: $outHtml ($kb KB, 画像 $($refs.Count - $missing.Count)/$($refs.Count) 枚を埋め込み)"

if ($HtmlOnly) { return }

# ---- 2. 自己完結 HTML から PDF を生成（背景色を保持するため Chrome/Edge を使用）----
if (-not $ChromePath) {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    $ChromePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ChromePath) {
    Write-Warning "Chrome / Edge が見つからないため PDF 生成をスキップしました。"
    return
}

$fileUrl = "file:///" + ($outHtml -replace '\\', '/')
$tmpProfile = Join-Path $env:TEMP ("bm-promo-" + [Guid]::NewGuid().ToString("N"))
$errLog = Join-Path $env:TEMP ("bm-promo-" + [Guid]::NewGuid().ToString("N") + ".log")

# Start-Process を使う（PowerShell 5.1 はネイティブ exe の stderr を致命扱いするため、
# & 呼び出しだと Chrome の無害な警告で中断してしまう）。
# --no-pdf-header-footer: ページ上下の URL/日付を消す
# --virtual-time-budget: CDN フォント・画像の読み込みを待つ
$chromeArgs = @(
    "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
    "--print-to-pdf=$outPdf", "--virtual-time-budget=15000",
    "--user-data-dir=$tmpProfile", $fileUrl
)
Start-Process -FilePath $ChromePath -ArgumentList $chromeArgs -Wait -WindowStyle Hidden `
    -RedirectStandardError $errLog

if (Test-Path $tmpProfile) { Remove-Item $tmpProfile -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue }
if (Test-Path $errLog) { Remove-Item $errLog -Force -Confirm:$false -ErrorAction SilentlyContinue }

if ($PdfOnly -and (Test-Path $outHtml)) { Remove-Item $outHtml -Force -Confirm:$false }

if (Test-Path $outPdf) {
    $pkb = [math]::Round((Get-Item $outPdf).Length / 1KB)
    Write-Output "PDF:  $outPdf ($pkb KB)"
} else {
    Write-Warning "PDF の生成に失敗しました。Chrome/Edge のバージョンを確認してください。"
}
