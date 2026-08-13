<#
.SYNOPSIS
  Builds the Tauri desktop app and packages it as an unsigned .msix for
  Microsoft Store submission (Partner Center signs the final package).

.PREREQUISITES
  - src-tauri/msix/AppxManifest.xml has its {{IDENTITY_NAME}}, {{PUBLISHER_ID}},
    and {{PUBLISHER_DISPLAY_NAME}} placeholders filled in from Partner Center
    (Dashboard > App identity).
  - Windows SDK installed (provides makeappx.exe). Installed automatically
    with Visual Studio's "Desktop development with C++" workload, or via the
    standalone Windows SDK installer.

.USAGE
  powershell -File scripts/build-msix.ps1            # full build + package
  powershell -File scripts/build-msix.ps1 -SkipBuild  # repackage only (reuse last `tauri build` output)
#>

param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MsixDir = Join-Path $RepoRoot "src-tauri\msix"
$ManifestPath = Join-Path $MsixDir "AppxManifest.xml"
$StagingDir = Join-Path $MsixDir "staging"
$OutDir = Join-Path $MsixDir "output"
$ReleaseDir = Join-Path $RepoRoot "src-tauri\target\release"
$ContextMenuManifest = Join-Path $RepoRoot "src-tauri\context-menu\Cargo.toml"
$ContextMenuDll = Join-Path $RepoRoot "src-tauri\context-menu\target\release\bookmarks_context_menu.dll"

# ---- Sanity checks ----

$manifestContent = Get-Content $ManifestPath -Raw
if ($manifestContent -match "{{[A-Z_]+}}") {
  Write-Error "AppxManifest.xml still has unfilled {{...}} placeholders. Fill in the Partner Center identity values first: $ManifestPath"
}

function Find-SdkTool($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $found = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\$name" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $found) {
    Write-Error "$name not found. Install the Windows SDK (or Visual Studio's Desktop development with C++ workload) and re-run."
  }
  return $found.FullName
}

$makeappxPath = Find-SdkTool "makeappx.exe"
$makepriPath = Find-SdkTool "makepri.exe"

# ---- Build ----

if (-not $SkipBuild) {
  Write-Host "Building Tauri app (npm run tauri:build)..."
  Push-Location $RepoRoot
  try {
    npm run tauri:build
    if ($LASTEXITCODE -ne 0) { Write-Error "tauri build failed" }
  } finally {
    Pop-Location
  }

  # Explorer context menu handler (IExplorerCommand). Packaged-only: the
  # unpackaged build registers its verb through HKCU instead.
  Write-Host "Building context menu handler (bookmarks_context_menu.dll)..."
  cargo build --release --manifest-path $ContextMenuManifest
  if ($LASTEXITCODE -ne 0) { Write-Error "context menu handler build failed" }
}

$exePath = Join-Path $ReleaseDir "app.exe"
if (-not (Test-Path $exePath)) {
  Write-Error "app.exe not found at $exePath. Run without -SkipBuild first."
}
if (-not (Test-Path $ContextMenuDll)) {
  Write-Error "bookmarks_context_menu.dll not found at $ContextMenuDll. Run without -SkipBuild first."
}

# ---- Stage package contents ----

Write-Host "Staging package contents..."
if (Test-Path $StagingDir) { Remove-Item $StagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $StagingDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StagingDir "Assets") | Out-Null

Copy-Item $ManifestPath $StagingDir
Copy-Item $exePath $StagingDir
Copy-Item $ContextMenuDll $StagingDir

$resourcesDir = Join-Path $ReleaseDir "resources"
if (Test-Path $resourcesDir) {
  Copy-Item $resourcesDir (Join-Path $StagingDir "resources") -Recurse
}

$IconsDir = Join-Path $RepoRoot "src-tauri\icons"
$assetsDir = Join-Path $StagingDir "Assets"
Get-ChildItem (Join-Path $IconsDir "Square*.png"), (Join-Path $IconsDir "StoreLogo.png") |
  Copy-Item -Destination $assetsDir

# Taskbar / jump list use "unplated" target-size variants of Square44x44Logo
# instead of the plated tile logo. Without them, Windows fills the icon's
# transparent padding with BackgroundColor, which can make the icon
# invisible against a same-colored background.
$unplatedSources = @{
  16  = "Square30x30Logo.png"
  24  = "Square30x30Logo.png"
  32  = "Square44x44Logo.png"
  48  = "Square71x71Logo.png"
  256 = "Square284x284Logo.png"
}
foreach ($size in $unplatedSources.Keys) {
  $src = Join-Path $IconsDir $unplatedSources[$size]
  $dest = Join-Path $assetsDir "Square44x44Logo.targetsize-$size`_altform-unplated.png"
  Copy-Item $src $dest
}

# ---- Generate resource index (resources.pri) ----
# Required for Windows to resolve qualifier-based asset variants (scale,
# targetsize, altform) declared above; without it they're silently ignored.

Write-Host "Generating resources.pri..."
$priConfigPath = Join-Path $MsixDir "priconfig.xml"
if (-not (Test-Path $priConfigPath)) {
  & $makepriPath createconfig /cf $priConfigPath /dq en-US /pv 10.0.0 /o
  if ($LASTEXITCODE -ne 0) { Write-Error "makepri createconfig failed" }
}

Push-Location $StagingDir
try {
  & $makepriPath new /pr $StagingDir /cf $priConfigPath /of (Join-Path $StagingDir "resources.pri") /o
  if ($LASTEXITCODE -ne 0) { Write-Error "makepri new failed" }
} finally {
  Pop-Location
}

# ---- Pack ----

if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null
$msixPath = Join-Path $OutDir "bookmarks.msix"

Write-Host "Packing $msixPath..."
& $makeappxPath pack /d $StagingDir /p $msixPath /o
if ($LASTEXITCODE -ne 0) { Write-Error "makeappx pack failed" }

Write-Host ""
Write-Host "Done: $msixPath"
Write-Host "Next: validate with the Windows App Certification Kit before uploading to Partner Center."
