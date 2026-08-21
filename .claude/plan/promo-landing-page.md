# Implementation Plan: アプリ訴求用HTMLランディングページ (promo-landing-page)

## Task Type
- [x] Frontend (静的HTML — Gemini視点で設計)
- [x] ツール/スクリプト (スクリーンショット撮影 — Codex視点で設計)
- [ ] Backend (本体コード変更なし)

> **Note**: `~/.claude/bin/codeagent-wrapper` が本マシンに存在しないため、Codex/Gemini の外部モデル呼び出しはスキップ。Claude が両視点（技術的実現性 + UX/ビジュアル）の分析を統合して本プランを作成した。

## 要件（確定済み）

| 項目 | 決定 |
|------|------|
| 形式 | スタンドアロン HTML ランディングページ（1枚、ビルド不要） |
| 言語 | 日本語のみ |
| スクリーンショット | **実アプリ（Tauri）を起動して撮影**し、ページに埋め込む |
| 配置 | `promo/index.html` + `promo/assets/*.png`（新規ディレクトリ） |

### 配置場所の根拠
- `public/` に置くと Tauri ビルドに同梱されインストーラが肥大化するため**不可**
- `docs/` は仕様書・テストチェックリスト用途のため避ける
- `promo/` をリポジトリ直下に新設。GitHub Pages 配信したくなった場合も移動が容易

## Technical Solution

### 1. ビジュアルアイデンティティ（アプリと統一）
アプリの実装から抽出したデザイントークンをランディングページに踏襲する:

- **配色**: モノクロベース + 青アクセント（`blue-500` = `#3b82f6`）のみ。`ui-design-guidelines.md` のルールに従い、装飾色は青以外使わない
- **フォント**: Outfit（見出し・英字）+ Noto Sans JP（本文）。Google Fonts CDN から読み込み、フォールバックは `system-ui, sans-serif`
- **角丸**: `0.5rem`（アプリの `--radius` と同値）
- **背景**: ライト基調（`hsl(0 0% 96.1%)`）、カードは白。ダークモード対応セクションはスクリーンショットで見せる（ページ自体のダーク切替は不要 = スコープ外）

### 2. ページ構成（日本語コピー含む）

```
┌─ Sticky Header ─────────────────────────────┐
│ Book[marks]ロゴ（marksを青）   [ダウンロード] │
├─ Hero ──────────────────────────────────────┤
│ H1: 「ブックマークを、一瞬で。どこからでも。」 │
│ Sub: アカウント不要・完全ローカル・無料(MIT)  │
│ [メイン画面スクリーンショット hero.png]       │
├─ 3つの特徴（アイコン+短文）──────────────────┤
│ ⌨ グローバルホットキー（Ctrl+Alt+Space）     │
│ 🔒 完全ローカル保存（SQLite・外部送信なし）   │
│ 🌐 ブラウザ拡張 & エクスプローラ連携          │
├─ 機能グリッド（2×3カード、各スクショ付き）────┤
│ ・タグ & 自動タグ付けルール                   │
│ ・メモ（検索対象・ホバープレビュー）          │
│ ・リアルタイム検索 + 検索履歴                 │
│ ・ブックマーク毎のショートカットキー          │
│ ・ピン留め & ドラッグ並べ替え                 │
│ ・インポート/エクスポート/JSONバックアップ    │
├─ デスクトップ × ブラウザ拡張 連携セクション ──┤
│ 図解: 拡張 → localhost:37373 → アプリ即時反映 │
│ [拡張ポップアップのスクリーンショット]        │
├─ ダークモード見せ場 ─────────────────────────┤
│ [ライト/ダーク並列スクリーンショット]         │
├─ Download CTA ──────────────────────────────┤
│ インストール3ステップ + GitHubリンク          │
└─ Footer: MIT License / © Yukihiro Sakuda ────┘
```

### 3. スクリーンショット撮影戦略（最重要・要注意ポイント）

**Web モード（`npm run dev`）ではバックエンドが無くデータが表示されないため、必ず Tauri アプリで撮影する。**

- 起動: `npm run tauri:dev`（またはインストール済みの release exe）
- **データの注意**: Tauri dev は本番と同じ identifier (`com.yukihirosakuda.bookmarks`) のため**ユーザーの実データが表示される**
- **デモデータ戦略（推奨・可逆）**: アプリ内蔵 HTTP サーバー `http://127.0.0.1:37373` の API を使い、
  1. 撮影用デモブックマーク（10件程度、見栄えの良いタイトル・タグ・メモ付き）を POST で追加 → **作成された ID を記録**
  2. 撮影完了後、記録した ID のみ DELETE で削除（既存データは一切触らない）
  3. ⚠ 実行フェーズ開始時に、実データへの一時追加について**ユーザーへ確認を取ってから**実施する
- 撮影方法: PowerShell スクリプト `promo/tools/capture.ps1`
  - `Get-Process` で "Bookmarks" ウィンドウの `MainWindowHandle` を取得
  - Win32 `PrintWindow` (PW_RENDERFULLCONTENT) でウィンドウ単位キャプチャ → PNG 保存
  - DPI スケーリング対策として `SetProcessDPIAware` を呼ぶ
- 拡張ポップアップ: `extension/dist/index.html` をブラウザで直接開き（アプリ起動中なら 37373 に接続できる）、agent-browser でスクリーンショット
- ダークモード: Settings から Dark に切替 → 撮影 → 元のテーマに戻す

### 必要ショット一覧

| ファイル | 内容 | 用途 |
|----------|------|------|
| `hero.png` | メイン画面（2カラム・ピン留め・タグ行が見える状態） | Hero |
| `search.png` | 検索バーに入力し絞り込まれた状態 | 機能カード |
| `tagrule.png` | Tag Rule ダイアログ | 機能カード |
| `memo.png` | Memo バッジのホバーツールチップ | 機能カード |
| `shortcut.png` | ショートカットバッジ付きカード（フォームの Shortcut 欄でも可） | 機能カード |
| `extension.png` | 拡張ポップアップ | 連携セクション |
| `dark.png` | ダークモードのメイン画面 | ダークモード見せ場 |

## Implementation Steps

1. **`promo/` ディレクトリ作成 + 撮影スクリプト** — `promo/tools/capture.ps1`（PrintWindow 方式）と `promo/tools/demo-data.ps1`（37373 API でデモデータ投入/削除、作成 ID を JSON で記録）を作成。成果物: 動作するツール2本
2. **撮影セッション** — ユーザー確認後、`npm run tauri:dev` 起動 → デモデータ投入 → 7ショット撮影（ライト6 + ダーク1 + 拡張1）→ デモデータ削除 → テーマ復元。成果物: `promo/assets/*.png`
3. **ランディングページ実装** — `promo/index.html` 単一ファイル（CSS 埋め込み、JS は最小限のスクロールアニメーションのみ）。上記ページ構成・日本語コピー・デザイントークンで実装。成果物: ブラウザで開ける完成ページ
4. **検証** — agent-browser で `promo/index.html` を開きフルページスクリーンショット確認（レイアウト崩れ・画像パス・レスポンシブ 375px/768px/1280px）。`ui-design-guidelines.md` 準拠チェック（青以外のアクセント色が無いこと）。成果物: 検証済みページ
5. **README へのリンク追記（任意）** — README 冒頭に `promo/index.html` への言及を1行追加

## Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `promo/index.html` | **新規** | ランディングページ本体（自己完結 HTML） |
| `promo/assets/*.png` | **新規** | スクリーンショット7枚 |
| `promo/tools/capture.ps1` | **新規** | ウィンドウキャプチャスクリプト |
| `promo/tools/demo-data.ps1` | **新規** | デモデータ投入/クリーンアップ（37373 API） |
| `README.md` | 修正（任意） | ランディングページへの言及1行 |
| 本体コード（`src/`, `src-tauri/`） | **変更なし** | — |

### 参照（コンテンツソース）
- 機能一覧・コピーの元ネタ: `README.md:6-67`, `src/components/HelpDialog.tsx:100-385`（日本語ヘルプ）
- デザイントークン: `src/app/globals.css:5-59`, `.claude/skills/ui-design-guidelines.md`
- 拡張連携の仕組み: `src-tauri/src/server.rs`（port 37373）

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Tauri dev がユーザー実データを表示（プライバシー） | デモデータを 37373 API 経由で追加→ID 指定で削除（可逆）。実行前にユーザー確認 |
| タグルールがデモデータに意図しないタグを自動付与 | デモデータ削除時にタグも確認。投入前に既存ルールを GET で確認 |
| PrintWindow が WebView2 を黒く描画する環境がある | PW_RENDERFULLCONTENT フラグ使用。失敗時は画面座標ベースの CopyFromScreen にフォールバック（ウィンドウを前面化して撮影） |
| 高 DPI でぼやけ/サイズずれ | SetProcessDPIAware + 実ピクセルで保存。1200×800 のウィンドウサイズを維持 |
| Google Fonts オフライン時 | `font-display: swap` + system-ui フォールバック |
| `public/` 誤配置によるインストーラ肥大 | `promo/` 直下に配置（Tauri ビルド対象外であることを手順に明記） |
| 拡張ポップアップの直接表示が崩れる | popup は固定幅前提のため、ブラウザ側でビューポートを popup 相当（~400px）に制限して撮影 |

## SESSION_ID (for /ccg:execute use)
- CODEX_SESSION: N/A（codeagent-wrapper 未導入のためスキップ）
- GEMINI_SESSION: N/A（同上）
