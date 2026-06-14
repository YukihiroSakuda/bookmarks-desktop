# restore-db.ps1 — 撮影用デモ DB を破棄し、退避しておいた実 DB を復元する
#
# 使い方:
#   powershell -ExecutionPolicy Bypass -File restore-db.ps1
#
# 前提: 撮影セッション開始時に bookmarks.db を promo-backup\ へ退避済みであること

$ErrorActionPreference = "Stop"

$dir = "$env:APPDATA\com.yukihirosakuda.bookmarks"
$backup = Join-Path $dir "promo-backup\bookmarks.db"
$live = Join-Path $dir "bookmarks.db"

if (-not (Test-Path $backup)) { throw "Backup not found: $backup — nothing to restore." }

# 1. アプリを終了(ウィンドウを閉じてもプロセスが残ることがあるため最終的に停止)
$procs = @(Get-Process -Name app, bookmarks -ErrorAction SilentlyContinue)
foreach ($p in $procs) {
    $p.CloseMainWindow() | Out-Null
    if (-not $p.WaitForExit(5000)) {
        Stop-Process -Id $p.Id -Force -Confirm:$false
        Start-Sleep -Seconds 1
    }
    Write-Output "Stopped: $($p.ProcessName) (PID $($p.Id))"
}
Start-Sleep -Milliseconds 500

# 2. デモ DB を削除し、実 DB を戻す
if (Test-Path $live) { Remove-Item $live -Force -Confirm:$false }
foreach ($suffix in "-wal", "-shm") {
    $f = "$live$suffix"
    if (Test-Path $f) { Remove-Item $f -Force -Confirm:$false }
}
Move-Item $backup $live
Write-Output "Restored: $live ($((Get-Item $live).Length) bytes)"

# 3. 空になった退避フォルダを掃除
$backupDir = Join-Path $dir "promo-backup"
if ((Get-ChildItem $backupDir | Measure-Object).Count -eq 0) {
    Remove-Item $backupDir -Force -Confirm:$false
}

# 4. アプリを再起動
$exe = "$env:LOCALAPPDATA\bookmarks\app.exe"
if (Test-Path $exe) {
    Start-Process $exe
    Write-Output "App relaunched."
} else {
    Write-Warning "Installed app not found at $exe — launch it manually."
}
