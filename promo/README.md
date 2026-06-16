# promo/ — アプリ訴求用ランディングページ / スライド

ビルド不要のスタンドアロン HTML（ブラウザで直接開ける）が2種類あります。
このディレクトリは Tauri ビルド対象外です(`public/` に置くとインストーラに同梱されるため不可)。

| ファイル | 形式 | 用途 |
|----------|------|------|
| `index.html` | 縦スクロール LP（A4 縦・資料型 PDF） | Web 掲載・読ませる／印刷して配る |
| `slides.html` | 16:9 スライド（1スライド = 1ページ PDF・全5枚） | 投影・プレゼン・PDF をめくって配る |

`slides.html` は表紙 →「呼び出しと検索」→「整理」→「追加と保存」→ 締め、の5枚構成。
**本文は `index.html` の記載内容をそのまま使用**（言い換えず転記）し、同じデザイントークン
（モノクロ + 青アクセント）と `assets/` の画像（`hero` / `tagrule` / `extension` / `shortcut`
の4枚）を共有します。`index.html` を更新したら本ファイルの文言も合わせてください。

## 必要なスクリーンショット(`assets/` に配置)

控えめな資料とするため、`index.html` はテキストベースの機能一覧 +「画面で見る」3図版の構成。
使用する画像は以下の4枚(未撮影の2枚は HTML 側でプレースホルダ表示になる)。

| ファイル | 内容 | 撮影時の状態 |
|----------|------|------|
「画面で見る」3図版は、似た絵にならないよう **UI文脈とスケールを意図的にずらす**:
ダイアログ(中・縦) / ブラウザ全体(大・横・アプリ外) / カード拡大(マクロ・細横)。

| ファイル | 内容 | 撮影時の状態 / 構図 |
|----------|------|------|
| `hero.png` | メイン画面全体 | ピン留め・タグ行・Memo/ショートカットバッジが見える状態 ✅撮影済み |
| `tagrule.png` | Tag Rule ダイアログ | **モーダルダイアログを中央クロップ**(背景アプリは暗転/ブラー)。自動タグ付けルールが2〜3件並んだ状態(例: `URL に github → dev`)。フォーム主体の絵 |
| `extension.png` | ブラウザ拡張 | **ブラウザの画面**。Chrome/Edge のブラウザ窓 + 拡張ポップアップ(タイトル/URL/タグ自動入力の追加フォーム)、タブ・アドレスバーが写る |
| `explorer.png` | エクスプローラ連携 | **エクスプローラの画面**。ファイル/フォルダを右クリックしたメニューで「Bookmarksに追加」、またはアプリへドラッグ&ドロップしている様子 |

## 撮影手順(実データを写さないための DB 一時退避方式)

実 DB と撮影は **必ず以下の手順** で分離する(内蔵 API に DELETE が無いため、
デモデータを後から消す手段は DB 差し替えのみ):

1. アプリを終了し、`%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db` を
   同フォルダの `promo-backup\` へ移動
2. アプリを起動(空 DB が自動生成される)
3. `powershell -ExecutionPolicy Bypass -File tools\demo-data.ps1` でデモデータ投入
4. 撮影(下記ツール or 任意の方法)
5. `powershell -ExecutionPolicy Bypass -File tools\restore-db.ps1` で実 DB を復元

## 配布用の単一ファイル生成

スクリーンショットを `assets/` に揃えたら、`tools/build.ps1` で配布用の単一ファイルを生成します。

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1            # LP: HTML + PDF
powershell -ExecutionPolicy Bypass -File tools\build.ps1 -PdfOnly   # LP: PDF のみ
powershell -ExecutionPolicy Bypass -File tools\build.ps1 -HtmlOnly  # LP: HTML のみ
powershell -ExecutionPolicy Bypass -File tools\build.ps1 -Slides    # スライド: 16:9 HTML + PDF
```

生成物は `dist/`（Git 管理外）に出力されます。

| ファイル | 内容 | 配布のしやすさ |
|----------|------|------|
| `dist/bookmarks-promo.html` | `index.html` を元に `assets/*.png` を base64 埋め込みした自己完結 HTML。フォントのみ Google Fonts CDN を参照（オフライン時は system-ui で表示） | 1ファイル。ブラウザで開く |
| `dist/bookmarks-promo.pdf` | 上記 HTML から出力した A4 縦・資料型 PDF。**背景色・画像・フォントをすべて埋め込んだ単一ファイル** | 1ファイル。どこでも開ける・印刷できる |
| `dist/bookmarks-slides.pdf` | `-Slides` 指定時。**16:9（1スライド = 1ページ・全5枚）の投影／配布向け PDF** | 1ファイル。投影・めくって配る |

> PDF は背景色を保持するため `agent-browser`（Playwright）ではなく Chrome/Edge の
> `--print-to-pdf` を使用します。`index.html` の `@media print` は改ページ位置（カードを
> 分断しない）を、`slides.html` は `@page { size: 1280px 720px }` で 1スライド = 1ページの
> 16:9 を制御しています。

## ツール

| スクリプト | 用途 |
|-----------|------|
| `tools/demo-data.ps1` | 空 DB に撮影用デモブックマーク12件を投入(既存データがあると中断する安全弁付き) |
| `tools/capture.ps1` | `-OutFile <path>` でアプリウィンドウを PNG 保存。`-Crop "x,y,w,h"` で切り出し |
| `tools/ui.ps1` | ドットソースして使う UI 操作ヘルパー(ウィンドウ配置・クリック・キー送出) |
| `tools/restore-db.ps1` | デモ DB を破棄して実 DB を復元、アプリ再起動 |
| `tools/build.ps1` | 配布用の単一ファイル（HTML / PDF）を生成 |

撮影例:

```powershell
cd promo\tools
. .\ui.ps1
Set-BookmarksWindow -X 100 -Y 100 -W 1200 -H 800
powershell -ExecutionPolicy Bypass -File capture.ps1 -OutFile ..\assets\hero.png
```
