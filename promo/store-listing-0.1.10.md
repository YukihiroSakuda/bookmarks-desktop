# Store 掲載情報 — 0.1.10

Partner Center の「この更新プログラムの新機能（What's new in this version）」欄に貼り付ける文章。

検索の射程を「ブックマークしたフォルダの中身」まで広げた回。URL とローカルフォルダを同じ一覧で持てるという本アプリの構造を、はじめて検索側で活かした変更にあたる。

索引（インデックス）は作らない設計を選んでいる。検索のたびにフォルダを直接見に行くため結果が古くならず、ファイル名がディスクにもバックアップにも残らない。実測でも、一度読んだフォルダなら 7 ミリ秒程度で返る（自前の索引を持っても縮むのはこの数ミリ秒だけで、代わりに陳腐化・肥大・バックアップ混入の問題を抱えることになる）。

## 日本語

```
■ 新機能
・ブックマークしたフォルダの中にあるファイル名も検索できるようになりました。検索バーに2文字以上入力すると、一覧の下に「In your folders」として、どのブックマークの中で見つかったかごとにまとめて表示されます。クリックするとファイルは既定のアプリで、フォルダはエクスプローラーで開きます。
・検索結果の行も、Tab キーや矢印キー、Home / End での移動の対象になります。ブックマークのカードと同じ操作でそのまま行き来できます。

■ この検索について
・ファイルの一覧を保存する仕組みではなく、検索するたびにフォルダを直接見に行きます。そのため結果が古くなることがなく、ファイル名がバックアップに含まれることもありません。
・速く終わらせるため、フォルダの3階層下までを対象とし、node_modules や .git など中身が膨大になりがちなフォルダは除外します。ドライブ全体（C: など）やネットワークドライブは対象外です。
・全体を見きれなかった場合は、その旨を画面に表示します。

■ 改善
・ヘルプに「フォルダの中も検索」の説明を追加しました。
```

## English

```
New
- Search now reaches inside the folders you have bookmarked. Type two or more characters and matching file and folder names appear below your bookmarks under "In your folders", grouped by the bookmark they came from. Click one to open the file in its default app, or the folder in File Explorer.
- Result rows join the same keyboard navigation as your bookmark cards — Tab, the arrow keys, Home and End move through both.

About this search
- Nothing is indexed or stored. Each search looks in the folders directly, so results are never out of date and no file names are written to your backup.
- To keep it fast, it looks three levels deep and skips folders that tend to hold huge numbers of files, such as node_modules and .git. Whole drives (C:, for example) and network drives are not searched.
- If a folder was too large to search fully, the app says so rather than quietly leaving results out.

Improved
- Added a Help section describing folder search.
```

## スクリーンショット

**差し替えを推奨。** 今回は UI に新しい領域（検索結果の下部セクション）が増えているため、既存のスクリーンショット（`promo/screenshots/`）では新機能が伝わらない。

追加したい1枚: 検索バーにキーワードを入れ、上にブックマークカード・下に「In your folders」のファイル一覧が並んだ状態。この機能の要点である「URL のブックマークとフォルダの中身が同じ画面に並ぶ」ことが一目で分かる構図が望ましい。

## 審査時に説明を求められた場合の要点

- ファイルシステムへのアクセスは、**ユーザーが自分でブックマークとして登録したフォルダに限られる**。アプリが勝手に探索範囲を広げることはない
- 読み取るのはファイル名・パス・更新日時のみで、**ファイルの中身は読まない**
- 読み取った情報は保存しない。検索結果を画面に出すためだけに使い、ネットワークに送信することもない（プライバシーポリシー記載のとおり、データはローカルの SQLite に留まる）
- 既に `runFullTrust` を宣言済みで、今回の変更で新しい capability は追加していない

## リリース時の確認

- [ ] 5箇所のバージョンが `0.1.10`（`AppxManifest.xml` のみ `0.1.10.0`）
- [ ] `bookmarks.msix` が未署名（テスト署名したまま提出しない）
- [ ] WACK を通した
- [ ] スクリーンショットを差し替えた
