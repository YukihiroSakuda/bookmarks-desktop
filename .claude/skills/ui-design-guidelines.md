# UI Design Guidelines — Bookmarks App

このスキルはBookmarksアプリのUIデザインコンセプトと実装ルールを定義する。新しいコンポーネントや画面を追加・変更する際はこのガイドラインに従うこと。

## カラーシステム

### 基本方針
- **モノクロベース**: 背景・カード・ボーダーはすべて無彩色（グレースケール）
- **アクセントカラーは青のみ**: `text-blue-500` / `bg-blue-500` を唯一の有彩色として使用
- 緑・赤・黄など他の有彩色はアクセントとして使わない（`destructive` のみ例外）
- フィードバック表示（コピー完了など）も青で統一

### ダークモード
- 背景とカードのコントラストを十分に確保する（明度差 6% 以上）
- 現在の値: background 5% / card 11% / border 22%
- 純黒（0%）は使わない。暗くても 5% 程度の明度を持たせる

### CSS変数（globals.css）
- 色はすべて HSL の CSS 変数で定義（shadcn/ui 準拠）
- Tailwind の `bg-card`, `text-foreground`, `border-border` など意味的クラスを使う
- ハードコードされた色（`bg-gray-800` 等）は使わない

## 青の使い所

以下の場面で `text-blue-500` または `bg-blue-500` を使用する:
- ロゴの一部: `Book<span class="text-blue-500">marks</span>`
- セクション見出しのプレフィックス: `<span class="text-blue-500">#</span>`
- アクティブ状態のボタン / ピン: `isActive && "text-blue-500"`
- 選択中のタグ: `bg-blue-500 text-white`
- 選択中のメニュー項目: `text-blue-500`
- フィードバックテキスト（Copied! など）: `text-blue-500`

## コンポーネントスタイル

### カード
- `bg-card border shadow-sm rounded-xl backdrop-blur-sm`
- ホバー: `hover:bg-accent`
- リスト表示: `p-2`, グリッド表示: `p-4`

### ボタン
- shadcn/ui の Button をラップした `src/components/Button.tsx` を使用
- variant: `primary`（塗り）/ `secondary`（枠線）/ `ghost`（透明）
- icon-only ボタンは `size="icon"` が自動適用される
- アイコンは Lucide React から統一的に使用

### タグ
- 形状: `rounded-full px-2 py-1 text-xs font-medium`
- **OFF（非選択）: 無色**（`TAG_CHIP_OFF` = `bg-secondary border border-input`）。色に関わらず全タグ共通。フィルタバー全体が色で埋まると、実際に ON にしている数個が埋もれるため、色は ON の印としてだけ使う
- **ON（選択・カード上のタグ）: その色の淡いトーン**（`bg-<color>-500/10` + `text-<color>-700 dark:text-<color>-300` + `border-<color>-500/30`）。塗りつぶしにはしない。カードにタグが3つ並んでもタイトルが読める静けさを保つ
- **タグの色（唯一の多色の例外）**: タグは Tag Manager で色を変更できる。パレットと具体的なクラスは `src/lib/tagColors.ts` に集約する（8色固定、任意の色は不可）
  - **既定色は青**（`DEFAULT_TAG_COLOR`）。色を設定していないタグ・機能導入前からのタグはすべて青として描画する。「色なし」という状態は UI 上には存在しない

### モーダル / ポップオーバー
- 背景オーバーレイ: `bg-background/50 backdrop-blur-sm`
- パネル: `bg-popover rounded-2xl border shadow-lg p-6`
- **項目が多いダイアログは左ナビ + 本文の2ペイン**にする（`HelpDialog` / `SettingsDialog`）。ナビは `w-44`〜`w-56 shrink-0 border-r`、選択中は `text-blue-500 font-medium bg-blue-500/5`。縦に積み続けて下端が画面外に出るくらいなら、カテゴリで割る
  - ナビは**スクロール移動**で、全セクションは常に描画しておく（`HelpDialog` / `SettingsDialog` とも同じ）。クリックで飛べて、かつ読み流しても全部に行き当たる。クリックしないと存在しない、という作りにはしない（「トグルによる情報の出し入れ」を避けるのと同じ理由）
  - 本文側に見出し（`border-l-2 border-blue-500 pl-2.5`）とセクション間の `border-t` を置き、スクロール中でも今どのカテゴリにいるか分かるようにする。ダイアログ自体は `h-[80vh]` 程度で高さを固定し、中身だけがスクロールする

### 入力フィールド
- `rounded-md border border-input bg-transparent`
- フォーカス: `focus-visible:ring-1 focus-visible:ring-ring`
- プレースホルダー: `placeholder:text-muted-foreground`

## テキスト

### フォント
- プライマリ: Outfit（`--font-outfit`）
- 日本語フォールバック: Noto Sans JP（`--font-noto-sans-jp`）

### サイズ使い分け
- カードタイトル: `text-sm font-medium`
- タグ / バッジ / メモ（compact）: `text-xs`
- セクション見出し: `text-sm font-medium`
- ページタイトル: `text-4xl font-bold`

### 言語
- UIラベル・ボタンテキスト: 英語
- ユーザー向けメッセージ（確認ダイアログ・エラー）: 日本語

## レイアウト

### レスポンシブ
- リスト表示の列数: 1〜4列（ユーザー設定、`sm:` / `md:` / `lg:` ブレークポイント）
- グリッド表示: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6`
- リスト表示でカード幅 400px 未満の場合はタグを非表示（ResizeObserver）

### 構造パターン
- ヘッダー → フィルター（タグ） → ソートコントロール → リスト
- テーマ切替はヘッダーの歯車（Settings）ダイアログ内に配置

## インタラクション

### フィードバック
- 即座に視覚的フィードバックを返す（色の変化、テキスト表示）
- コピー完了: アイコン → 青色「Copied!」テキスト（2秒後に戻る）
- ローディング: `...` テキストまたは Loader2 スピナー

### 表示ポリシー
- メモは常に復号して表示する（表示/非表示の切替は設けない）
- compact（リスト）: インラインでバッジ風表示（`bg-muted rounded px-2 py-0.5`）
- 通常（グリッド）: `border-t` 区切り線の下に全文表示

### 確認ダイアログ
- 破壊的操作（削除）のみ `window.confirm` で確認
- 追加・編集はモーダルフォーム

## やらないこと

- 複数色のアクセントカラー混在（例外はユーザーが設定したタグの色のみ。上記「タグ」を参照）
- 過剰なアニメーション（`transition-opacity`, `transition-colors` 程度に留める）
- トグルによる情報の出し入れ（メモなど、データがあれば常に見せる）
- 説明過多なヘルプテキスト（ラベルとアイコンで十分伝える）
