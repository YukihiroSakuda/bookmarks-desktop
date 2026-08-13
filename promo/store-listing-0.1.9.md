# Store 掲載情報 — 0.1.9

Partner Center の「この更新プログラムの新機能（What's new in this version）」欄に貼り付ける文章。

Store 版でこれまで動作していなかった2機能（ログイン時の自動起動、エクスプローラーの右クリックメニュー）が使えるようになった回。MSIX コンテナはアプリからのレジストリ書き込みを仮想化するため、アプリが自分で登録する方式は Store 版では効果がなかった。今回パッケージのマニフェストで宣言する方式に変更した（詳細は `docs/msix-release.md`）。

## 日本語

```
■ 新機能
・Windows へのサインイン時に自動で起動できるようになりました。ウィンドウは開かず通知領域に常駐するので、ショートカットキーですぐ呼び出せます。オン/オフは「設定 > アプリ > スタートアップ」で切り替えられます。
・ファイルやフォルダーを右クリックして「Add to Bookmarks」から登録できるようになりました。パスが入力済みの状態で追加画面が開きます。

■ 改善
・ファイルやフォルダーを開く処理を Windows 標準の方式に変更し、一瞬コンソールが開くことがある問題を解消しました。
・タスクバーなどに表示されるアイコンを各サイズで最適化しました。
```

## English

```
New
- The app can now start automatically when you sign in to Windows. It stays in the notification area instead of opening a window, so your shortcut key brings it up instantly. Turn it on or off under Settings > Apps > Startup.
- Right-click any file or folder and choose "Add to Bookmarks" to save it. The bookmark form opens with the path already filled in.

Improved
- Files and folders now open through the standard Windows shell, which removes the console window that could briefly flash.
- Taskbar and shell icons are now generated at each exact size for sharper rendering.
```

## スクリーンショット

UI 変更なし（追加されたのは OS 側の統合機能のみ）。既存のスクリーンショット（`promo/screenshots/`）の差し替えは不要。

右クリックメニューを訴求したい場合のみ、エクスプローラーのコンテキストメニューに「Add to Bookmarks」が出ている状態のスクリーンショットを1枚追加するとよい。

## 審査時に説明を求められた場合の要点

- 自動起動は `uap5:StartupTask` による宣言で、ユーザーが設定アプリからいつでも無効化できる
- 右クリックメニューは `desktop4:FileExplorerContextMenus` と `IExplorerCommand` 実装（`bookmarks_context_menu.dll`）によるもので、選択されたパスを引数にアプリ本体を起動するだけ
- ネットワーク送信は行わず、データはローカルの SQLite に保存される（プライバシーポリシー記載のとおり）
