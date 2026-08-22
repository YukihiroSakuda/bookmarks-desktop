# Store 掲載情報 — 0.2.0

Partner Center の「この更新プログラムの新機能（What's new in this version）」欄に貼り付ける文章。

パッチではなくマイナーを当てた回。**既定の並び順の意味が変わり**、設定画面を作り直し、設定とヘルプが日英対応になった。加えて、ブックマークしたファイルを**他アプリのファイルダイアログから選べるようにする**機能が入っている。

> **公開中の 0.1.10 との差分**: Store の 0.1.10 は 2026-08-21 23:40 のビルドで、タグの色・ローカル保存のファビコン・重複検知（`store-listing-0.1.11.md` に書いた内容）は**すでに含まれている**。今回の掲載文はそれ以降の4点だけを扱う。`store-listing-0.1.11.md` は消化済みとして扱ってよい。

審査で説明を求められるとすれば **ユーザーのプロフィールフォルダーへの書き込み**（ショートカットフォルダー）まわり。後述の要点を用意しておくこと。

## 日本語

```
■ 新機能
・ブックマークしたファイルやフォルダーを、他のアプリのファイルダイアログから直接選べるようになりました。設定 →「File shortcuts」をオンにすると、ショートカットを集めた Windows フォルダーが1つ作られます。クイックアクセスにピン留めすれば、メールへの添付やアップロードのときに左側の一覧から1クリックで開けます。既定はオフです。
・並び順に「Most Used」が加わりました。開いた回数を「最後に開いてからの経過日数」で割り引いた順に並びます（30日で半分）。半年前に何百回も開いたものより、今週数回開いたものが上に来ます。計算方法はヘルプに記載しています。
・設定とヘルプを日本語と英語で切り替えられるようになりました。各画面の右上にある EN / JA で切り替わり、次回以降も保たれます。

■ 改善
・設定画面を作り直しました。左に「Appearance / Shortcuts / File shortcuts / Data / About」の一覧が並び、クリックでその位置まで移動します。縦に長い1枚だった以前の画面より目的の項目に届きやすくなっています。
・並び順のボタンの名前を分かりやすくしました（Name / Most Used / Date Added / My Order）。並びも使う順に整えています。
・新規インストール時の既定の並び順は「Name」の昇順です。これまでお使いの並び順の設定はそのまま引き継がれます。
```

## English

```
New
- Bookmarked files and folders can now be picked straight from other apps' file dialogs. Turn on Settings > File shortcuts and the app keeps one Windows folder filled with shortcuts to them. Pin it to Quick Access and it is one click away in the left pane when you attach a file to an email or upload one. Off by default.
- A new sort: Most Used. It divides how often you opened a bookmark by how long ago you last opened it, halving every 30 days, so five visits this week outrank two hundred from six months ago. Help explains the calculation.
- Settings and Help can be read in Japanese or English. Switch with EN / JA at the top right of either window; your choice is remembered.

Improved
- The settings window was rebuilt. A list down the left — Appearance, Shortcuts, File shortcuts, Data, About — jumps to each section, instead of one long column that ran past the bottom of the screen.
- The sort buttons say what they do: Name, Most Used, Date Added, My Order, in that order.
- New installations start sorted by Name, ascending. If you have already chosen a sort, it is kept.
```

## スクリーンショット

**1枚追加を推奨。** この版で一番説明が要るのはファイルショートカットで、これは**アプリの外**で効く機能なので、アプリの画面だけでは伝わらない。

1. **他アプリのファイルダイアログ** — 「ファイルを開く」ダイアログの左ペインにクイックアクセスとしてピン留めされた Bookmarks フォルダーがあり、中にブックマークしたファイルが並んでいる構図。この機能の価値がこの1枚に集約される
2. **設定画面**（差し替え） — 左ナビが見えている新しいレイアウト。旧スクリーンショットは1カラムの設定画面なので実物と食い違う

Most Used と日英切替は静止画で差が出にくいため、専用の1枚は不要。

## 審査時に説明を求められた場合の要点

今回はファイルシステムへの書き込みが増えているため、そこに絞って説明できるようにしておく。

- **新しい capability は追加していない**（`runFullTrust` のまま）。マニフェストの変更はバージョン番号だけ
- **既定でオフ。** ユーザーが設定画面で明示的にオンにするまで、フォルダーは作られず何も書かれない
- **書き込み先はユーザーのプロフィール内**（既定 `%USERPROFILE%\Bookmarks`、設定で変更可）。システム領域や他アプリの領域には触れない
- **自分が作ったものしか消さない。** 生成した `.lnk` はフォルダー内のマニフェスト（`.bookmarks-shortcuts.json`）に記録し、削除対象はそこに載っているものだけ。ユーザーが自分で置いたファイルは、同じフォルダーを指定していても決して削除されない
- **機能をオフにすると撤収する。** 作成したショートカット、（他に何も残っていなければ）フォルダー自体、クイックアクセスのピン留めを取り消す
- **クイックアクセスの操作はシェルの標準動詞**（`pintohome` / `unpinfromhome`）を使用。ユーザーがボタンを押したときのみ実行される
- **通信は一切増えていない。** この機能はローカルのファイル操作だけで完結する
- Most Used のスコアは**保存していない**。既存の列（アクセス回数・最終アクセス日時）から表示のたびに計算しているだけで、収集するデータは増えていない

## リリース時の確認

- [ ] 5箇所のバージョンが `0.2.0`（`AppxManifest.xml` のみ `0.2.0.0`）
- [ ] `bookmarks.msix` が未署名（テスト署名したまま提出しない）
- [ ] WACK を通した
- [ ] スクリーンショットを追加・差し替えた（上記2枚）
- [ ] 既存 DB（0.1.10 で作成したもの）で起動し、保存済みの `accessCount` が「Most Used」として復元されることを確認した
- [ ] File shortcuts をオン→オフし、フォルダーとピン留めが撤収されることを確認した
- [ ] パッケージ版で自動起動と右クリックメニューが動くことを確認した（MSIX は sideload 版と別経路）
