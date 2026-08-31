# Store 掲載情報 — 0.2.1

Partner Center の「この更新プログラムの新機能（What's new in this version）」欄に貼り付ける文章。

小さな改善2点のパッチ回。UI の見た目に変わりはない。

## 日本語

```
■ 改善
・ショートカットキーでアプリを最前面に呼び出したとき、タグの絞り込みも検索欄と一緒にクリアされるようになりました。呼び出すたびに前回のタグ選択が残らず、まっさらな状態から探せます。
・ブックマークしたフォルダーの中のファイル名を検索対象に含めるかどうかを、設定 →「File shortcuts」で切り替えられるようになりました。既定はオンです。
```

## English

```
Improved
- Bringing the app to front with the shortcut key now clears the tag filter along with the search box, so it never reopens scoped to whatever tags were selected last time.
- Whether search also matches file names inside bookmarked folders can now be turned on or off under Settings > File shortcuts. On by default.
```

## スクリーンショット

UI の見た目は変わらないため、差し替え不要。

## 審査時に説明を求められた場合の要点

- 新しい capability は追加していない（`runFullTrust` のまま）。マニフェストの変更はバージョン番号だけ
- フォルダー内検索のオン/オフは既存のローカル検索機能（ネットワーク送信なし）の切り替えに過ぎず、書き込み・通信の範囲は変わらない

## リリース時の確認

- [ ] 5箇所のバージョンが `0.2.1`（`AppxManifest.xml` のみ `0.2.1.0`）
- [ ] `bookmarks.msix` が未署名（テスト署名したまま提出しない）
- [ ] WACK を通した
- [ ] ショートカットキーでアプリを呼び出したとき、タグの絞り込みが検索欄と一緒にクリアされることを確認した
- [ ] 設定でフォルダー内検索をオフにすると、検索結果からフォルダー内ファイルのセクションが消えることを確認した
