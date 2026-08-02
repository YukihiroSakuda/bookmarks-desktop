<#
.SYNOPSIS
  Fully removes the sideloaded test package, clears the icon cache, and
  reinstalls from src-tauri/msix/output/bookmarks.msix.
  Run this in an elevated (Administrator) PowerShell window.
#>

$ErrorActionPreference = "Stop"

$msixPath = "D:\my-app\bookmarks-desktop\src-tauri\msix\output\bookmarks.msix"

Write-Host "Stopping app.exe if running (it hides to the tray, so a normal window close won't quit it)..."
Get-Process -Name "app" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "Removing existing package..."
Get-AppxPackage -Name "YukihiroSakuda.BookmarksTags" -ErrorAction SilentlyContinue | Remove-AppxPackage

Write-Host "Clearing icon cache..."
Stop-Process -Name explorer -Force
Remove-Item "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*.db" -Force -ErrorAction SilentlyContinue
Start-Process explorer

Write-Host "Installing $msixPath ..."
Add-AppxPackage -Path $msixPath

Write-Host "Done."
