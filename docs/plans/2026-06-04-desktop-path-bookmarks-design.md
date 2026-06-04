# 設計: デスクトップ化 + フォルダパス・ブックマーク

- **日付**: 2026-06-04
- **ステータス**: 承認済み（実装計画づくりへ）

## 背景 / 目的

エクスプローラ上のアドレス（フォルダ／ファイルのパス）を保存して、そこから開けるようにしたい。
本質的な狙いは **URL とフォルダパスを同じ一覧でタグ管理・検索したい** こと。Windows 標準のショートカットでは URL と混在させたタグ横断管理ができないため、本アプリに統合する価値がある。

## 重要な制約と決定

| 論点 | 決定 | 理由 |
|---|---|---|
| Webアプリのままフォルダを開けるか | **不可** | ブラウザは `http(s)` ページから `file://`（ローカル）を必ずブロックする（全ブラウザ共通のサンドボックス仕様）。 |
| 「開く」の実現方法 | **デスクトップアプリ化** | デスクトップアプリは OS の「中の人」として動くため、エクスプローラと同様に登録もコピペも不要でフォルダを直接開ける。 |
| フレームワーク | **Tauri** | 軽量・小サイズを重視。裏側を Rust で作り直すコストは許容。 |
| データベース | **SQLite**（PostgreSQL から変更） | ファイル1個で完結、サーバー不要でデスクトップ向き。「軽さ」「個人管理データ」の方針に合致。既存データの移行は不要。 |
| メモ暗号化 | **廃止** | ローカル保存のため不要。実装を簡素化。 |
| ブラウザ拡張 | **残す（改修）** | ブラウザで見ているページをワンクリックでデスクトップアプリに登録。送り先を Supabase → ローカル受け口へ付け替える。 |
| 利用形態 | ツールは複数人で使うが**データは各自が個人管理**。各自の PC で保存・各自の PC で開く。 |
| スコープ外 | `extension/` の Supabase 依存は撤去するが、拡張プロジェクト自体は維持。 |

## 全体アーキテクチャ

```
┌──────────────┐  ①「このページを登録」ボタン
│ ブラウザ拡張   │  (残す/改修)
└──────┬───────┘
       │ ②POST http://127.0.0.1:PORT/add  (URL・タイトル) + CORS制限/トークン
       ▼
┌─────────────────────────────────────────────┐
│  Tauri デスクトップアプリ (.exe) ※起動中であること   │
│  ┌──────────┐  invoke()   ┌─────────────┐     │
│  │ React UI  │ ──────────▶ │ Rust バックエンド │     │
│  └──────────┘ ◀────────── └──────┬──────┘     │
│                       ┌──────────┼─────────┐  │
│                       ▼          ▼         ▼  │
│                  localhost受け口  SQLite  explorer.exe │
│                                (平文)    (中の人)   │
└─────────────────────────────────────────────┘
```

3つの構成要素:

1. **フロントエンド（既存 React UI を再利用）** — `src/components`・`src/hooks` の画面ロジックはそのまま。データ取得を `fetch('/api/...')` から Tauri `invoke('コマンド名')` に差し替える。差し替えは薄い中間レイヤー `src/lib/api.ts` に集約し、各 hook の変更を最小化。
2. **Rust バックエンド** — 既存 Next.js API ルートを Tauri コマンドとして再実装 + 新規 `open_path` コマンド + 拡張連携の localhost 受け口。
3. **SQLite + explorer.exe** — ローカルの `bookmarks.db` 1ファイル。フォルダは Rust が `explorer.exe` を直接起動。

## フロントエンドの載せ方

**Next.js を静的書き出し（`output: 'export'`）** して Tauri に載せる。

- 画面は `/` の1枚・ほぼクライアント完結のため静的化と相性が良い。
- `next/image`（favicon、既に `unoptimized`）、`next/font`（Outfit / Noto Sans JP）、shadcn/ui、Tailwind はそのまま使える。
- フロントのコード変更はデータ取得を `invoke` に差し替える程度で最小。
- Vite 移行案は不採用（移植コストが大きく、メリット小）。

## データモデル

URL とフォルダを区別する **`kind` 列**（`'url' | 'path'`）を1つ追加。パス文字列は既存 `url` フィールドに格納（フィールド名を変えず再利用 → `bookmark.url` をそのまま使える）。フォルダ／ファイルは列を分けず `kind='path'` で統一し、開く瞬間に Rust 側で実体を判定する。

### SQLite スキーマ（5テーブル、暗号化廃止）

```
bookmarks
  id            TEXT PRIMARY KEY        -- uuid
  kind          TEXT NOT NULL           -- 'url' | 'path'   ★新規
  title         TEXT NOT NULL
  url           TEXT NOT NULL           -- URL または パス文字列
  is_pinned     INTEGER NOT NULL DEFAULT 0   -- 0/1 (SQLite に bool 型なし)
  access_count  INTEGER NOT NULL DEFAULT 0
  last_accessed_at TEXT
  custom_order  INTEGER
  memo          TEXT                    -- 平文（暗号化廃止）★簡素化
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

tags             id TEXT PK, name TEXT UNIQUE
bookmarks_tags   bookmark_id TEXT, tag_id TEXT   (複合PK)
user_settings    id INTEGER PK CHECK(id=1), sort_*, columns ...（1行）
tag_rules        id TEXT PK, match_type, target_field, pattern, tag, created_at
```

**廃止**: `encrypted_memo` / `memo_iv` 列、`/api/memo/encrypt` `/decrypt`、`MEMO_ENCRYPTION_KEY`。

**型変換**: 既存の snake_case(DB)↔camelCase(UI) 変換を踏襲。`is_pinned` の 0/1 ↔ boolean 変換を追加。`kind` を UI 型に追加。

## UI / 操作

UI ガイドライン（モノクロ + 青アクセント、メモ常時表示、フィードバック青）に準拠。

1. **追加フォーム（`BookmarkForm.tsx`）**
   - 種類の自動判定: `C:\…` / `\\server\…` / `file://…` → `kind='path'`、それ以外 → `'url'`。`URL / フォルダ` 切替で手動上書き可。
   - 「参照」ボタン: Tauri ネイティブ・フォルダ選択ダイアログでパスを選べる（手入力不要）。
   - タイトル自動入力: URL はページタイトル取得、パスは末尾のフォルダ名／ファイル名を初期値に。
2. **アイコン（`BookmarkCard.tsx` FaviconDisplay）**
   - `kind='url'` → favicon（フォールバック Globe）
   - `kind='path'` → lucide `Folder`（ファイルは `File`）
3. **クリック挙動**
   - `kind='url'` → 新規タブで開く（従来通り）
   - `kind='path'` → `invoke('open_path', { path })` でエクスプローラ起動
   - 両者とも `access_count` 加算
   - サブ表示行: URL はホスト名、パスはパス文字列を省略表示
4. **変更不要で恩恵を受ける部分**: 検索（title + url）はパスにも自動で効く。タグ・ピン・並び替え・メモは URL/パス共通。

## エラー処理 / セキュリティ

- Rust コマンドは `Result<T, String>` を返し、`src/lib/api.ts` で受けて `sonner` トースト表示（青基調）。
- `open_path`: 実体の有無を確認 → 無ければエラー。フォルダ/ファイルを判定し `explorer` を適切な引数で起動（ファイルは選択状態表示）。
- localhost 受け口: `127.0.0.1` のみバインド。任意の Web サイトからの登録 POST を防ぐため **CORS を拡張機能オリジンに限定 + 簡易トークン**。

## 段階実装（フェーズ分け）

- **フェーズ1: 土台** — Tauri 化（Next.js 静的書き出し）+ SQLite + 既存機能を全て Rust コマンドへ移植 + フロントのデータ取得を `invoke` 化。完了時点で「今の機能がそのままデスクトップアプリとして動く」（URL のみ・暗号化なし）。
- **フェーズ2: パス対応** — `kind` 列、フォルダアイコン、`open_path`、フォーム（自動判定・参照ボタン）。本題のフォルダ管理が完成。
- **フェーズ3: 拡張機能** — 送り先を Supabase → localhost 受け口へ付け替え。ワンクリック登録を復活。

各フェーズ単体で動作確認可能。

## テスト（基盤未導入のため軽量に）

- Rust ユニットテスト: パス種別自動判定、`open_path` のフォルダ/ファイル判定、インメモリ SQLite の CRUD。
- `docs/testing/manual-test-checklist.md` にデスクトップ版・パス機能の手動チェック項目を追記。
- 重い E2E は導入しない。

## 未確定 / 今後の検討事項

- localhost 受け口のポート番号（固定 or 範囲）と拡張機能との共有方法（トークンの配布方式）。
- デスクトップアプリ未起動時の拡張からの登録挙動（現状は「アプリを起動してください」表示）。
- Tauri のフォルダ選択・opener・HTTP サーバーに使う具体的なクレート/プラグイン選定（実装計画で確定）。
