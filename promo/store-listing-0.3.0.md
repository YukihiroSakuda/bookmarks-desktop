# Store 掲載情報 — 0.3.0

Partner Center の「この更新プログラムの新機能（What's new in this version）」欄に貼り付ける文章。

データの安全性（自動バックアップ・不具合修正）と検索の強化の回。説明文（`store-listing-base.md`）は
「見直しの目安」に当たらないため据え置き — 用途も探されかたも変わらない。ただしプライバシーポリシーは
自動バックアップとログの記述を足したので、下の「プライバシーポリシー」を参照。

## 日本語

```
■ 新機能
・自動バックアップ：1日1回と、「復元」「すべて削除」の直前に、データのバックアップを自動で保存するようになりました。間違えて消したり上書きしたりしても、設定 →「データ」の「復元」で元に戻せます。
・複数キーワード検索：スペースで区切ると、すべての語を含むものだけに絞り込みます（例：「github actions」）。語の順番は問わず、"…" で囲むと並びどおりに探せます。フォルダー内のファイル名検索も同じです。
・タグの「すべて一致」：タグを2つ以上選ぶと、いずれかを含むもの（Any）と、すべてを含むもの（All）を切り替えられます。

■ 修正
・タグルールを作成・削除したとき、対象のブックマークに割り当てたショートカットキーが消えてしまう問題を修正しました。
・ブラウザーから HTML を取り込むとき、同じページが複数のフォルダーにあると重複して登録される問題、元の登録日が失われる問題、タグルールが適用されない問題を修正しました。取り込みに失敗した場合はメッセージが表示されます。
・絞り込み中に「My Order」で並べ替えると、別のブックマークが動くことがある問題を修正しました。

■ 改善
・ブラウザー拡張機能との通信と、アプリ画面のセキュリティを強化しました。
```

## English

```
New
- Automatic backups: your data is now backed up automatically once a day and right before Restore or Delete all. If something is deleted or overwritten by mistake, Settings > Data > Restore brings it back.
- Several search words: separate words with spaces to show only what contains all of them (for example "github actions"), in any order. Put words in quotes to match them side by side. Searching file names inside bookmarked folders works the same way.
- Match all tags: with two or more tags selected, switch between bookmarks with any of them (Any) and only those with all of them (All).

Fixed
- Creating or deleting a tag rule no longer removes the keyboard shortcuts of the bookmarks it applies to.
- Importing bookmarks from a browser's HTML file no longer adds a page twice when it sits in several folders, keeps each bookmark's original date, and applies your tag rules. A failed import now says so.
- Reordering with "My Order" while a search or tag filter is active could move the wrong bookmark. Fixed.

Improved
- Tightened the security of the connection to the browser extension and of the app's own window.
```

## スクリーンショット

差し替え不要。追加された UI は、タグを2つ以上選んだときだけ出る「Match Any / All」と、
設定の「データ」にある「自動バックアップのフォルダを開く」ボタンで、現行のスクリーンショットの範囲は変わらない。

## プライバシーポリシー

`docs/privacy-policy.md` を更新した（2026-11-20）。通信は増えていない。端末内に保存するものとして
**自動バックアップ**（`%APPDATA%\com.yukihirosakuda.bookmarks\backups\`）と**ログ**
（`%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\logs\`）を追記し、全データを消すにはバックアップも
消す必要があることを書き足した。Partner Center に登録済みの URL がこのファイルを指していれば
操作は不要。指していない場合は登録先の内容を差し替える。

## 審査時に説明を求められた場合の要点

- 新しい capability は追加していない（`runFullTrust` のまま）。マニフェストの変更はバージョン番号だけ
- 新しい通信は無い。自動バックアップとログはどちらも端末内のファイルで、送信しない
- ローカルサーバー（`127.0.0.1:37373`）は Host ヘッダの検証を追加しただけで、受け付ける相手は狭まった
- アプリ画面に Content Security Policy を設定した。外部のスクリプト・画像は読み込まない

## リリース時の確認

- [ ] 5箇所のバージョンが `0.3.0`（`AppxManifest.xml` のみ `0.3.0.0`）
- [ ] `bookmarks.msix` が未署名（テスト署名したまま提出しない）
- [ ] WACK を通した
- [ ] 一覧・設定画面・ヘルプが表示され、ブックマークを開ける（CSP で画面が欠けていない）
- [ ] 起動後に `%APPDATA%\com.yukihirosakuda.bookmarks\backups\` に `auto-daily-*.json` ができる
- [ ] 「github actions」のような2語の検索で絞り込める。タグを2つ選ぶと Match Any / All が出る
- [ ] ブラウザー拡張機能からブックマークを追加できる（Host 検証の後も拡張機能が通る）
- [ ] 右クリックメニュー・自動起動（MSIX 版の確認項目）
