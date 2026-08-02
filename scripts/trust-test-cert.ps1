<#
.SYNOPSIS
  Trusts the local MSIX test-signing certificate and installs the package.
  Run this in an elevated (Administrator) PowerShell window.
#>

$ErrorActionPreference = "Stop"

$pfxPath = "D:\my-app\bookmarks-desktop\src-tauri\msix\test-cert.pfx"
$msixPath = "D:\my-app\bookmarks-desktop\src-tauri\msix\output\bookmarks.msix"
$pw = ConvertTo-SecureString -String "test1234" -Force -AsPlainText

Write-Host "Importing test cert into LocalMachine\Root..."
Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation "Cert:\LocalMachine\Root" -Password $pw

Write-Host "Importing test cert into LocalMachine\TrustedPeople..."
Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation "Cert:\LocalMachine\TrustedPeople" -Password $pw

Write-Host "Installing MSIX package..."
Add-AppxPackage -Path $msixPath

Write-Host "Done."
