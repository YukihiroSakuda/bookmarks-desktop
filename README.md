# Bookmarks

PostgreSQL ストレージのブックマーク管理アプリ + ブラウザ拡張機能。

## 機能一覧

### ブックマーク管理

- ブックマークの追加・編集・削除
- URL 入力時のタイトル自動取得
- ピン留め機能（上部に固定表示）
- アクセス回数の自動記録
- ドラッグ&ドロップによるカスタム並べ替え
- リスト表示（1〜4 カラム）

### 暗号化メモ

- ブックマークごとにメモを添付可能（最大 10,000 文字）
- AES-256-CBC でサーバーサイド暗号化
- メモ内容はカード上に常時表示

### タグ管理

- タグの追加・編集・削除
- タグによるフィルタリング（単一 / 複数選択）
- タグルール: URL やタイトルのパターンに基づく自動タグ付け

### 検索

- タイトル + URL によるリアルタイム検索
- 検索履歴（最大 10 件、localStorage 保存）
- `Ctrl+N` で新規ブックマーク追加

### インポート / エクスポート

- HTML ファイル形式でのエクスポート
- ブラウザからエクスポートした HTML ファイルのインポート（重複チェック付き）

### ブラウザ拡張機能

- Chrome / Edge 対応（Manifest V3）
- ワンクリックで現在のページをブックマーク追加
- 重複 URL の自動検知

### UI / UX

- shadcn/ui ベースのモダンなデザイン（モノクロ + 青アクセント）
- ダークモード対応（Light / System / Dark）
- レスポンシブ対応
- ファビコンの自動取得・表示

## 技術スタック

| カテゴリ          | 技術                                                   |
| ----------------- | ------------------------------------------------------ |
| フレームワーク    | Next.js 15 (App Router)                                |
| 言語              | TypeScript                                             |
| UI                | React 19 / Tailwind CSS 3 / shadcn/ui (New York style) |
| データベース      | PostgreSQL                                             |
| ドラッグ&ドロップ | dnd-kit                                                |
| アイコン          | Lucide React                                           |
| 拡張機能          | Vite + React (Manifest V3)                             |

## セットアップ

### 前提条件

- Node.js 18+

### 1. リポジトリのクローン

```bash
git clone https://github.com/YukihiroSakuda/bookmarks-local.git
cd bookmarks-local
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.local` を作成:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/bookmarks
MEMO_ENCRYPTION_KEY=your-32-byte-hex-key
```

`DATABASE_URL` は PostgreSQL の接続文字列。

`MEMO_ENCRYPTION_KEY` は AES-256 用の 32 バイト鍵（64 文字の 16 進数文字列）。

生成例:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でアクセス。データベースファイル (`data/bookmarks.db`) は初回起動時に自動作成されます。
http://localhost:3000 でアクセス。必要なテーブルは初回接続時に自動作成されます。

### 5. ブラウザ拡張機能（オプション）

```bash
cd extension
npm install
```

`extension/.env` を作成:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=http://localhost:3000
```

```bash
npm run build
```

- Chrome: `chrome://extensions` → 「パッケージ化されていない拡張機能を読み込む」→ `extension/dist` を選択
- Edge: `edge://extensions` → 「展開して読み込み」→ `extension/dist` を選択

## 本番デプロイ

### Web アプリ（Azure App Service / Node.js）

1. Azure App Service にリポジトリを接続
2. 環境変数を設定:

- `DATABASE_URL`
- `MEMO_ENCRYPTION_KEY`

3. デプロイ

### GitHub Actions CI/CD

`main` への push で Web アプリを自動デプロイするワークフローを追加しています。

ワークフロー: [.github/workflows/azure-webapp.yml](.github/workflows/azure-webapp.yml)

事前に GitHub リポジトリの Secrets に以下を設定してください。

- `AZURE_WEBAPP_PUBLISH_PROFILE`

取得例:

```bash
az webapp deployment list-publishing-profiles \
  --name bookmarks-local-kltd-20260527 \
  --resource-group rg-bookmarks-local-jpe-20260527 \
  --xml
```

このワークフローは次を行います。

- Pull Request: `npm ci` と `npm run build` で CI 実行
- `main` push: ビルド成功後に Azure App Service へ自動デプロイ

アプリ設定の `DATABASE_URL` と `MEMO_ENCRYPTION_KEY` は Azure App Service 側に保持し、GitHub Actions 側ではデプロイ時に publish profile だけを使います。

### ブラウザ拡張機能

1. `extension/.env` の `VITE_APP_URL` を本番 URL に変更
2. `extension/public/manifest.json` の `host_permissions` と `content_scripts.matches` を本番ドメインに変更
3. `cd extension && npm run build`
4. Chrome Web Store / Edge Add-ons に `extension/dist` をアップロード

## プロジェクト構造

```
src/
  ├── app/                # Next.js App Router
  │   ├── page.tsx        # メインページ（ブックマーク一覧）
  │   └── api/            # REST API ルート
  ├── components/         # UI コンポーネント
  │   └── ui/             # shadcn/ui ベースコンポーネント
  ├── hooks/              # カスタムフック（状態管理の中心）
  ├── lib/                # PostgreSQL クライアント (db.ts)、ユーティリティ
  ├── types/              # 型定義（DB ↔ UI 変換関数含む）
  └── utils/              # エクスポート等のユーティリティ
extension/                # ブラウザ拡張機能（別プロジェクト）
docs/                     # 仕様書・テストチェックリスト
```

## コマンド

| コマンド                        | 説明                       |
| ------------------------------- | -------------------------- |
| `npm run dev`                   | 開発サーバー起動           |
| `npm run build`                 | プロダクションビルド       |
| `npm run start`                 | プロダクションサーバー起動 |
| `npm run lint`                  | ESLint 実行                |
| `cd extension && npm run build` | 拡張機能ビルド             |

## ライセンス

MIT License
