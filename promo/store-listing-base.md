# Store 掲載情報 — 説明文（バージョン非依存）

Partner Center の「ストアの掲載情報」のうち、**バージョンごとに変わらない欄**の原稿。
バージョンごとの「この更新プログラムの新機能」は `store-listing-<version>.md` に分けてある。

これを置く理由: 説明文は Partner Center の中にしか無く、リポジトリからは「今なんと書いてあるか」が
分からなかった。リリースのたびに「説明文も直すべきか」を判断できるよう、ここを正とする。

> **初版（0.2.0 時点）は現行の掲載文との差分ではなく、書き下ろし。** Store のページは JS 描画で
> 本文を機械的に取得できなかったため、現行文との突き合わせは Partner Center 上で行うこと。

## 何を変えたか（0.2.0 で説明文に手を入れる理由）

`kind='path'` が入った時点でこのアプリは「リンクの管理」ではなくなっていたが、0.2.0 の
ファイルショートカット機能で**アプリの外**でも使えるようになった。これは他のブックマーク管理
ツールに無い性質で、説明文の主語を変えるだけの差がある。

「新機能」欄は既にインストールした人しか読まない。新規の訪問者が読むのは説明文なので、
今回の目玉をそちらに移す。

---

## 短い説明 / Short description

```
ウェブページも、PCの中のファイルやフォルダーも、同じ1つの場所にまとめて開けるブックマークアプリ。オンにすれば、集めたファイルを他のアプリの「開く」「添付」ダイアログからも直接選べます。データはすべてお使いのPC内に保存されます。
```

```
One place for the pages you use and the files you work in. Bookmark web pages, local files, and folders side by side — and, if you turn it on, reach those files straight from any other app's Open or Attach dialog. Everything stays on your PC.
```

## 説明 / Description

```
Bookmarks & Tags は、よく使うウェブページと、PCの中のファイル・フォルダーを、同じ一覧にまとめて置いておくためのアプリです。

■ ウェブもローカルも、同じ一覧に
URLだけでなく、ローカルのファイルやフォルダーもブックマークできます。クリックすればファイルは既定のアプリで、フォルダーはエクスプローラーで開きます。エクスプローラーからドラッグしたり、右クリックの「Add to Bookmarks」からも追加できます。

■ 他のアプリのファイルダイアログから使える
Windows のクイックアクセスはフォルダーしかピン留めできないため、あちこちに散らばったファイルをまとめる方法がありませんでした。この機能をオンにすると、ブックマークしたファイルへのショートカットを集めた Windows フォルダーが1つ作られます。クイックアクセスにピン留めしておけば、メールへの添付でも、アップロードでも、左のペインから1クリックで目的のファイルに届きます。
（既定はオフです。オフに戻せば、作られたショートカットもフォルダーもピン留めも撤収されます）

■ 探すのが速い
どこからでも呼び出せるショートカットキー（既定 Ctrl+Alt+Space）で最前面に出て、そのまま入力すれば絞り込みが始まります。タイトル・URL・メモに加えて、ブックマークしたフォルダーの中のファイル名まで検索します。索引は作らないので結果が古くなることがなく、探す範囲はあなたが選んだ場所だけなので余計なものが出てきません。

■ タグで整理
タグは色を付けて並び替えられます。URLやタイトルのパターンで自動的にタグを付けるルールも設定できます。

■ よく使うものが上に来る
「Most Used」で並べると、開いた回数を最後に開いてからの経過日数で割り引いた順に並びます。半年前によく使ったものではなく、いま使っているものが上に来ます。

■ データはお使いのPCの中だけ
開発者や第三者のサーバーには何も送りません。外部への通信は、ブックマークを追加したときにそのサイトからタイトルとアイコンを読む1回だけです。ブラウザ拡張機能もお使いのPCの中で完結します。

■ そのほか
・ブラウザ拡張機能（Chrome / Edge）から、見ているページをワンクリックで登録
・ブックマークごとにショートカットキーを割り当て
・メモを付けられます
・ブラウザからエクスポートしたHTMLの読み込み、JSONでのバックアップと復元
・ダークモード対応
・設定とヘルプは日本語と英語を切り替えられます
```

```
Bookmarks & Tags keeps the web pages you use and the files you work in side by side, in one list.

■ Web and local, in the same list
Bookmark URLs, local files, and folders together. Click a file and it opens in its usual app; click a folder and it opens in Explorer. Add them by dragging from Explorer, or with "Add to Bookmarks" on the right-click menu.

■ Reach your files from other apps
Windows Quick Access can only pin folders, never a set of files scattered across your disk. Turn this on and the app keeps one Windows folder filled with shortcuts to every bookmarked file. Pin it to Quick Access and your files are one click away in the left pane — attaching to an email, uploading, opening in any app at all.
(Off by default. Switch it off and the shortcuts, the folder, and the pin are all withdrawn.)

■ Fast to search
A shortcut key from anywhere (Ctrl+Alt+Space by default) brings the window forward, and typing starts narrowing straight away. Search covers titles, URLs, and memos — and the file names inside the folders you bookmarked. Nothing is indexed, so results are never stale, and the search only looks where you chose, so there is no noise.

■ Tags
Give tags a colour and an order of your own. Rules can apply tags automatically from patterns in a URL or title.

■ What you actually use, on top
Sort by Most Used and the count of how often you opened something is divided down by how long ago you last opened it — so this week's work outranks last spring's.

■ Your data stays on your PC
Nothing is sent to the developer or any third party. The only outbound request is to the site you bookmark, once, to read its title and icon. The browser extension talks only to the app on your own machine.

■ Also
- Chrome / Edge extension: save the page you are on in one click
- Assign a shortcut key to any bookmark
- Attach a memo to any bookmark
- Import HTML exported from a browser; back up and restore as JSON
- Dark mode
- Settings and Help in Japanese or English
```

## 製品の機能 / Product features

Partner Center の「製品の機能」欄（短い箇条書き）。

```
・ウェブページもローカルのファイル・フォルダーも同じ一覧に
・集めたファイルを他アプリの「開く」「添付」ダイアログから直接選べる
・どこからでも呼び出せるショートカットキー
・ブックマークしたフォルダーの中のファイル名まで検索
・色と並び順を設定できるタグ、自動タグ付けルール
・最近よく使っているものが上に来る並び順
・Chrome / Edge 拡張機能でワンクリック登録
・データはすべてPC内。外部サーバーへの送信なし
```

```
- Web pages, local files, and folders in one list
- Reach your bookmarked files from any app's Open or Attach dialog
- A shortcut key that brings it up from anywhere
- Search reaches into the folders you bookmarked
- Tags with colours and your own order, plus automatic tagging rules
- A sort that puts what you use lately on top
- One-click saving from the Chrome / Edge extension
- Everything stays on your PC — nothing is sent to a server
```

## 検索キーワード / Search terms

7個までの短い語。0.2.0 で**探されかたが変わる**ので見直しが要る。「ブックマーク管理」で
探す人はファイルダイアログの機能に辿り着かないが、「クイックアクセス」「よく使うファイル」で
探している人には刺さる。

```
ブックマーク
お気に入り
クイックアクセス
よく使うファイル
ファイル 整理
ランチャー
タグ
```

## 変更しない欄

| 欄 | 0.2.0 での扱い |
| -- | -------------- |
| アプリ名 | 据え置き（`Bookmarks & Tags`） |
| カテゴリ | 据え置き |
| プライバシーポリシー URL | **据え置き。** 0.2.0 では通信も capability も増えていない（0.1.11 の回とは違う） |
| 年齢区分・価格・提供国 | 据え置き |

## 見直しの目安

説明文に手を入れるべきなのは、次のいずれかに当てはまる回:

- **アプリの用途そのものが増えた**（0.2.0 のファイルショートカットがこれ）
- **探されかたが変わる**（検索キーワードを足したくなる）
- **スクリーンショットと実物が食い違う**（0.2.0 の設定画面がこれ）
- プライバシー・通信の記述が実態とずれた（0.1.11 の回がこれ）

単なる機能追加や修正の回は、`store-listing-<version>.md` の What's new だけでよい。
