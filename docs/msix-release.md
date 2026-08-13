# Microsoft Store（MSIX）リリース手順

Store 版の更新手順。GitHub Releases 側（`.exe` / `.msi`）は `npm run tauri:build` の成果物をそのまま配布するだけなので、ここでは MSIX の提出までを扱う。

- パッケージ ID: `YukihiroSakuda.BookmarksTags`（PFN: `YukihiroSakuda.BookmarksTags_qvmk1q0kegjem`）
- 提出物: `src-tauri/msix/output/bookmarks.msix`（**未署名**。署名は Partner Center 側で行われる）

## 1. バージョンを揃える

| ファイル | 形式 | 例 |
| -------- | ---- | -- |
| `src-tauri/tauri.conf.json` | `X.Y.Z` | `0.1.8` |
| `package.json` | `X.Y.Z` | `0.1.8` |
| `src-tauri/Cargo.toml` | `X.Y.Z` | `0.1.8` |
| `src-tauri/msix/AppxManifest.xml` | `X.Y.Z.0` | `0.1.8.0` |

MSIX のバージョンは4桁で、**末尾は必ず 0**（Store の予約枠）。かつ公開中のバージョンより大きい必要がある。AppxManifest の更新漏れが起きやすいので、リリース前に必ず確認すること。

## 2. パッケージをビルド

```powershell
# フルビルド（Rust の release ビルドから）
powershell -File scripts/build-msix.ps1

# npm run tauri:build 済みの出力を再利用する場合
powershell -File scripts/build-msix.ps1 -SkipBuild
```

出力は `src-tauri/msix/output/bookmarks.msix`。スクリプトは Tauri release ビルド → **コンテキストメニュー DLL のビルド**（`src-tauri/context-menu`）→ staging 作成 → アイコン（unplated 変種を含む）配置 → `makepri` で `resources.pri` 生成 → `makeappx pack` を行う。Windows SDK（`makeappx.exe` / `makepri.exe`）が必要。

`-SkipBuild` は `app.exe` と `bookmarks_context_menu.dll` の**両方**が既にビルド済みであることを前提にする。DLL だけ作り直したい場合は:

```powershell
cargo build --release --manifest-path src-tauri/context-menu/Cargo.toml
powershell -File scripts/build-msix.ps1 -SkipBuild
```

> **AppxManifest.xml を編集するときの注意**: XML コメント内に `--` を含めるとコメントとして不正になり、`makepri` が `PRI191: Appx manifest not found or is invalid` で失敗する（コマンドライン引数の `--hidden` などを書きたくなるので踏みやすい）。

## 3. ローカル動作確認（推奨）

未署名のままでは `Add-AppxPackage` できないため、テスト証明書で署名してからインストールする。

```powershell
& "C:\Program Files (x86)\Windows Kits\10\bin\<SDKバージョン>\x64\signtool.exe" sign `
  /fd SHA256 /f src-tauri\msix\test-cert.pfx /p test1234 `
  src-tauri\msix\output\bookmarks.msix
```

`src-tauri/msix/test-cert.pfx` は subject が `CN=2B8E7D66-F9F9-4697-A28E-23DF034A4A87`（AppxManifest の `Publisher` と一致）。gitignore 済みでリポジトリには含まれない。

インストールは**管理者権限の PowerShell** で:

- 初回のみ: `powershell -File scripts/trust-test-cert.ps1`（証明書を信頼ストアに入れてから install）
- 2回目以降: `powershell -File scripts/reinstall-test.ps1`（アプリ強制終了 → 旧パッケージ削除 → アイコンキャッシュ削除 → 再install）

> **注意**
> - テスト版は Store 版と同じパッケージ識別子なので、インストールすると **Store 版が置き換わる**。確認後は Store から入れ直すこと。
> - **提出用パッケージは未署名でなければならない。** テスト署名した `.msix` は提出に使えないので、確認後に `powershell -File scripts/build-msix.ps1 -SkipBuild` で必ずパックし直す。

### 自動起動・右クリックメニューの確認項目

MSIX コンテナは HKCU 書き込みを仮想化するため、この2機能は sideload 版とは**別の仕組み**（manifest 宣言）で動く。パッケージ版では毎回ここを確認する。

| 確認 | 期待結果 |
| ---- | -------- |
| 設定 > アプリ > スタートアップ | 「Bookmarks & Tags」が並び、既定でオン |
| サインインし直す | ウィンドウを出さずタスクトレイに常駐（`ActivationKind::StartupTask` を検出） |
| ファイル/フォルダを右クリック | 「Add to Bookmarks」が表示され、クリックでアプリが起動しパスが入力済みになる |
| `where.exe bookmarks-tags` | `%LOCALAPPDATA%\Microsoft\WindowsApps\bookmarks-tags.exe`（実行エイリアス）が出る |

右クリックが出ない場合はハンドラの読み込み失敗が疑わしい。`taskkill /f /im explorer.exe` → 再起動で再読み込みされる。DLL は COM サロゲート（`dllhost.exe`）で動くので、デバッグ時はそのプロセスを見る。

> レジストリ（`HKCU\Software\Classes\*\shell\AddToBookmarks` や `Run\Bookmarks`）は Store 版では**書かれないのが正常**。そこに値が入っている場合は sideload 版が書いたもの。

## 4. WACK（Windows アプリ認定キット）で検証

`C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe`。**管理者権限が必須**（非管理者で起動すると "The requested operation requires elevation" で失敗する）。スタートメニューの「Windows アプリ認定キット」から GUI で実行するのが確実。

```powershell
# 管理者 PowerShell で
& "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe" reset
& "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe" test `
  -appxpackagepath src-tauri\msix\output\bookmarks.msix `
  -reportoutputpath "$env:TEMP\wack-report.xml"
```

WACK は検証中にパッケージをインストールするため、**テスト署名済みの状態で実施 → 通過後に未署名で再パック**という順序になる。

## 5. Partner Center に提出

1. [Partner Center](https://partner.microsoft.com/dashboard) → Bookmarks & Tags → 新しい申請（Update）
2. **パッケージ**: 未署名の `bookmarks.msix` をアップロード
3. **ストアの掲載情報**: 更新内容（What's new）を記入。UI が変わった場合はスクリーンショットも差し替える
4. **プライバシーポリシー URL**: `docs/privacy-policy.md` を更新した場合、登録済み URL の指す先が最新かを確認する
5. 年齢区分・価格・提供国などは通常据え置きのまま申請を送信

審査は通常、数時間〜数日。

## 6. 公開後の確認

```powershell
Get-AppxPackage -Name YukihiroSakuda.BookmarksTags | Select-Object Version, SignatureKind
# Version が新しいバージョン、SignatureKind が Store になっていればOK
```

## チェックリスト

- [ ] `AppxManifest.xml` のバージョンを `X.Y.Z.0` に更新した
- [ ] `build-msix.ps1` でパッケージを生成した（`bookmarks_context_menu.dll` が staging に入っていること）
- [ ] テスト署名してローカル動作を確認した（自動起動・右クリックメニューを含む）
- [ ] WACK を通した
- [ ] **未署名で再パックした**（テスト署名したまま提出しない）
- [ ] Partner Center にアップロードし、更新内容・スクリーンショットを反映した
- [ ] 公開後に `Get-AppxPackage` でバージョンと SignatureKind を確認した
