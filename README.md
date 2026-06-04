# Bookmarks

Tauri v2 デスクトップアプリ + ブラウザ拡張機能によるブックマーク管理ツール（Windows）。  
データは SQLite に保存されるため、外部サーバー不要でオフライン利用可能。

## 機能一覧

### ブックマーク管理

- ブックマークの追加・編集・削除
- URL 入力時のタイトル自動取得
- ピン留め機能（上部に固定表示）
- アクセス回数の自動記録
- ドラッグ&ドロップによるカスタム並べ替え
- リスト表示（1〜4 カラム）

### デスクトップパスブックマーク

- ファイル・フォルダのパスをブックマークとして登録
- ファイルはデフォルトアプリで開く、フォルダはエクスプローラで開く
- Windows エクスプローラからファイル・フォルダをドラッグ&ドロップして追加
- エクスプローラの右クリックメニュー（「Add to Bookmarks」）から直接登録

### メモ

- ブックマークごとにメモを添付可能
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
- アプリ内蔵の HTTP サーバー（localhost:37373）経由で連携（Supabase 不要）
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
| デスクトップ      | Tauri v2                                               |
| バックエンド      | Rust / rusqlite (SQLite bundled) / Axum                |
| フレームワーク    | Next.js 15 (App Router)                                |
| 言語              | TypeScript / Rust                                      |
| UI                | React 19 / Tailwind CSS 3 / shadcn/ui (New York style) |
| ドラッグ&ドロップ | dnd-kit                                                |
| アイコン          | Lucide React                                           |
| 拡張機能          | Vite + React (Manifest V3)                             |

## セットアップ

### 前提条件

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (rustup)
- [Tauri v2 前提条件](https://v2.tauri.app/start/prerequisites/)（Windows: Microsoft Visual Studio C++ Build Tools）

### 1. リポジトリのクローン

```bash
git clone https://github.com/YukihiroSakuda/bookmarks.git
cd bookmarks
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 開発サーバーの起動

```bash
npm run tauri:dev
```

Tauri ウィンドウが起動します。SQLite データベースは初回起動時にアプリデータフォルダへ自動作成されます。

### 4. プロダクションビルド

```bash
npm run tauri:build
```

`src-tauri/target/release/bundle/` にインストーラーが生成されます。

### 5. ブラウザ拡張機能

アプリのヘルプダイアログから `extension.zip` をダウンロードし、解凍後に拡張機能として読み込みます。

- Chrome: `chrome://extensions` → 「パッケージ化されていない拡張機能を読み込む」→ 解凍フォルダを選択
- Edge: `edge://extensions` → 「展開して読み込み」→ 解凍フォルダを選択

拡張機能はアプリ起動中に自動起動する HTTP サーバー（localhost:37373）に接続します。**アプリを起動した状態で**ブラウザ拡張機能を使用してください。

拡張機能を手動でビルドする場合:

```bash
cd extension
npm install
npm run build
```

## プロジェクト構造

```
src/
  ├── app/                # Next.js App Router
  │   ├── page.tsx        # メインページ（ブックマーク一覧）
  │   └── api/            # REST API ルート（Tauri IPC 経由）
  ├── components/         # UI コンポーネント
  │   └── ui/             # shadcn/ui ベースコンポーネント
  ├── hooks/              # カスタムフック（状態管理の中心）
  ├── lib/                # tauriFetch、ユーティリティ
  ├── shared/             # ブックマーク API・フォームロジック
  ├── types/              # 型定義（DB ↔ UI 変換関数含む）
  └── utils/              # エクスポート等のユーティリティ
src-tauri/
  ├── src/
  │   ├── commands.rs     # Tauri IPC コマンド（CRUD・設定・パス操作）
  │   ├── db.rs           # SQLite 初期化・スキーマ
  │   ├── lib.rs          # Tauri アプリエントリ・シングルインスタンス
  │   └── server.rs       # 内蔵 HTTP サーバー (Axum, :37373)
  └── Cargo.toml
extension/                # ブラウザ拡張機能（別プロジェクト）
docs/                     # 仕様書・テストチェックリスト
public/
  └── extension.zip       # ビルド済み拡張機能（ヘルプからダウンロード）
```

## コマンド

| コマンド                        | 説明                               |
| ------------------------------- | ---------------------------------- |
| `npm run tauri:dev`             | Tauri 開発モード起動               |
| `npm run tauri:build`           | Tauri プロダクションビルド         |
| `npm run dev`                   | Next.js 開発サーバーのみ起動       |
| `npm run build`                 | Next.js ビルド                     |
| `npm run lint`                  | ESLint 実行                        |
| `cd extension && npm run build` | 拡張機能ビルド                     |

## ライセンス

MIT License
