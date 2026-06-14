# demo-data.ps1 — スクリーンショット撮影用デモブックマークを投入する
#
# 使い方:
#   powershell -File demo-data.ps1            # デモデータを追加し、作成 ID を demo-ids.json に記録
#
# ⚠ 重要 — クリーンアップについて:
#   内蔵 HTTP サーバー (127.0.0.1:37373) には DELETE エンドポイントが無いため、
#   このスクリプトでは削除できない。撮影は必ず「DB 一時退避方式」で行うこと:
#     1. アプリを終了する
#     2. %APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db をバックアップ退避
#     3. アプリを再起動(空の DB が自動生成される)→ 本スクリプトでデモデータ投入
#     4. 撮影
#     5. アプリを終了し、退避した DB を元に戻してアプリを再起動
#   この方式なら実データは一切変更されない。

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:37373"

try { Invoke-RestMethod -Uri "$base/api/tags" -TimeoutSec 3 | Out-Null }
catch { throw "Local API (port 37373) is not responding. Is the app running?" }

# 撮影前の状態確認: 既存ブックマークが多い場合は誤って実 DB に投入している可能性が高い
$existing = Invoke-RestMethod -Uri "$base/api/bookmarks"
if ($existing.Count -gt 0) {
    Write-Warning "DB already contains $($existing.Count) bookmark(s). Expected an empty demo DB."
    Write-Warning "Did you forget to swap the database? Aborting."
    exit 1
}

$demo = @(
    @{ title = "GitHub"; url = "https://github.com"; is_pinned = $true;
       tags = @("Dev"); shortcut = "CmdOrCtrl+Alt+KeyG";
       memo = "PRレビューは毎朝チェック。issue のラベル運用ルールは wiki 参照。" },
    @{ title = "Figma"; url = "https://www.figma.com"; is_pinned = $true;
       tags = @("Design"); shortcut = "CmdOrCtrl+Alt+KeyF" },
    @{ title = "Notion"; url = "https://www.notion.so"; is_pinned = $true;
       tags = @("Work");
       memo = "議事録テンプレは Workspace > Docs > Templates にある。" },
    @{ title = "MDN Web Docs"; url = "https://developer.mozilla.org/ja/";
       tags = @("Dev", "Docs");
       memo = "JS / CSS のリファレンスはまずここ。日本語版あり。" },
    @{ title = "Tailwind CSS - Rapidly build modern websites"; url = "https://tailwindcss.com";
       tags = @("Dev", "Docs", "Design") },
    @{ title = "Zenn|エンジニアのための情報共有コミュニティ"; url = "https://zenn.dev";
       tags = @("Tech", "News") },
    @{ title = "Qiita - エンジニアに関する知識を記録・共有"; url = "https://qiita.com";
       tags = @("Tech", "News") },
    @{ title = "Claude"; url = "https://claude.ai";
       tags = @("AI", "Tools"); shortcut = "CmdOrCtrl+Alt+KeyC";
       memo = "コードレビューとドラフト作成に常用。" },
    @{ title = "YouTube"; url = "https://www.youtube.com";
       tags = @("Media") },
    @{ title = "design-assets"; url = "D:\Projects\design-assets"; kind = "path";
       tags = @("Design", "Work");
       memo = "バナー素材・ロゴの最新版はこのフォルダ。" },
    @{ title = "経費精算_2026.xlsx"; url = "D:\Work\経費精算_2026.xlsx"; kind = "path";
       tags = @("Work") },
    @{ title = "Vercel"; url = "https://vercel.com";
       tags = @("Dev", "Tools") }
)

$created = @()
foreach ($b in $demo) {
    $json = $b | ConvertTo-Json -Depth 4
    $res = Invoke-RestMethod -Uri "$base/api/bookmarks" -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
    $created += @{ id = $res.id; title = $b.title }
    Write-Output "Created: $($b.title) ($($res.id))"
}

$idsFile = Join-Path $PSScriptRoot "demo-ids.json"
$created | ConvertTo-Json | Out-File -FilePath $idsFile -Encoding utf8
Write-Output "Recorded $($created.Count) IDs to $idsFile"
