# Store 掲載情報 — 0.1.11

Partner Center の「この更新プログラムの新機能（What's new in this version）」欄に貼り付ける文章。

タグに色と並び順を与えた回。加えて、これまでカードを描画するたびに外部のアイコンサービスへ問い合わせていたファビコンを、**ブックマーク先のサイト自身から1回だけ取得してローカルに保存する**方式へ変えた。表示のための通信が無くなり、オフラインでもアイコンが出る。

この変更に伴い**プライバシーポリシーを改訂している**（通信の記述が実態と合っていなかった）。審査で通信まわりを問われる可能性が高い回なので、後述の要点を用意しておくこと。

## 日本語

```
■ 新機能
・タグに色を付けられるようになりました。Tag Manager でタグ名の左の丸をクリックすると8色から選べます。付けた色は、絞り込みバーでもブックマークのカード上でも同じ色で表示されます。既定は青です。
・タグを並び替えられるようになりました。Tag Manager で行をドラッグすると順序が変わり、絞り込みバーのタグも同じ順序で並びます。

■ 改善
・サイトのアイコン（ファビコン）を、ブックマークを追加したときにそのサイト自身から取得して保存するようになりました。表示のたびに取得することが無くなったため、オフラインでもアイコンが表示されます。
・インポートしたブックマークのアイコンは、設定 →「データ」→「Fetch missing icons」からまとめて取得できます。進捗が表示され、途中で止められます。
・ローカルのフォルダやファイルも、既に登録済みのものを再度追加しようとすると重複として検知されるようになりました。区切り文字や大文字小文字、末尾の￥、file:// 形式の違いは同じパスとして扱われます。
```

## English

```
New
- Tags can have a color. In Tag Manager, click the circle next to a tag to pick one of eight colors. The tag keeps that color in the filter bar and on your bookmark cards. Blue is the default.
- Tags can be reordered. Drag a row in Tag Manager to change the order, and the filter bar follows it.

Improved
- Site icons are now fetched from the site itself when you add a bookmark, and stored in the app. Displaying your bookmarks no longer fetches anything, so icons show up even offline.
- Icons for imported bookmarks can be collected from Settings > Data > "Fetch missing icons", with progress and a Stop button.
- Local folders and files are now checked for duplicates too. Differences in separators, letter case, a trailing backslash, or file:// form are treated as the same path.
```

## スクリーンショット

**差し替えを推奨。** タグの色は静止画で最も伝わりやすい変更で、現行のスクリーンショット（`promo/screenshots/`）はすべて色の付いていないタグで撮られている。

撮り直したい2枚:

1. **メイン画面** — 色の異なるタグが4〜5種類見えている状態。絞り込みバーに複数の色付きタグが並び、カード上にも同じ色のタグが乗っている構図。1枚でこの版の主題が伝わる
2. **Tag Manager** — カラーパレットを開いた状態。8色のスウォッチとドラッグ用のグリップが同時に写ると、色と並び替えの両方が一度に説明できる

ファビコンについては、スクリーンショット上は従来と同じ見た目（アイコンが出ている）にしかならないため、専用の1枚は不要。

## 審査時に説明を求められた場合の要点

今回はネットワークの挙動が変わっているため、そこに絞って説明できるようにしておく。

- **通信先はユーザーがブックマークしたサイトのみ。** 追加時にそのページを1回取得し、タイトルとアイコン（`<link rel="icon">`、無ければ `/favicon.ico`）を読む。ブラウザでそのページを開いたときと同じ通信であり、第三者のサービスは経由しない
- **以前は第三者のアイコンサービスを利用していたが、この版で廃止した。** 外部にブックマーク先のホスト名が渡る経路が無くなっており、プライバシー面では**後退ではなく前進**にあたる
- **取得したアイコンはローカルの SQLite に保存**され、以降の表示に通信は不要。オフラインでも表示される
- **インポート時は一切通信しない。** 大量のサイトへ一斉に接続することを避けるため、まとめての取得は設定画面のボタンを押したときだけ実行される（同時6件、中断可能）
- ローカルのファイル／フォルダのブックマークは、いかなる場合も通信を発生させない
- 収集・送信するデータは無く、開発者側に届く情報も無い。新しい capability は追加していない（`runFullTrust` のまま）
- プライバシーポリシー（`docs/privacy-policy.md`、Store 掲載の URL と同一）に「Connecting to the sites you bookmark」の節を追加し、上記をそのまま記載済み

## リリース時の確認

- [ ] 5箇所のバージョンが `0.1.11`（`AppxManifest.xml` のみ `0.1.11.0`）
- [ ] `bookmarks.msix` が未署名（テスト署名したまま提出しない）
- [ ] WACK を通した
- [ ] スクリーンショットを差し替えた（上記2枚）
- [ ] Store 掲載のプライバシーポリシー URL が改訂後の内容を指している
- [ ] 既存 DB（0.1.10 で作成したもの）で起動し、`tags` への列追加が走ることを確認した
- [ ] アイコン未取得の既存ブックマークで「Fetch missing icons」を実行し、進捗と Stop が動くことを確認した
