# Implementation Plan: File Shortcuts Folder

ブックマークしたローカルファイル/フォルダへのショートカット (`.lnk`) を、Windows 上の
単一フォルダに出力し続ける機能。

## Task Type
- [x] Backend (Rust: COM による `.lnk` 生成、リコンサイル、DB マイグレーション)
- [x] Frontend (Settings ダイアログの Data セクションに設定 UI を追加)

**Status: 事前検証（MSIX）完了。フェーズ1 から着手可能。**

---

## 1. 解こうとしている問題

他アプリの**ファイル選択ダイアログの中**（メール添付、Slack 投稿、Web アップロード、
Photoshop の配置、動画編集の素材読み込み）では、このアプリは構造的に何の役にも立たない。
ブックマークをクリックしても既定アプリでファイルが開くだけで、ダイアログには何も入らない。
結果、ユーザーはダイアログ内で自力でフォルダ階層を掘ることになる。

Windows のクイックアクセスは**フォルダしか固定できない**ため、「複数の場所に散らばった、
よく使うファイルの集合」を固定する手段が存在しない。

→ ブックマーク済みファイルへのショートカットを1つのフォルダに集め、それをクイックアクセスに
固定すれば、あらゆるダイアログの左ペインから1クリックで到達できる。

**前提の実機確認は完了済み**: ファイル選択ダイアログ上でショートカットが表示され、
選択すると実体に解決されることをユーザーが確認済み。

## 2. 確定した決定事項

| 項目 | 決定 | 理由 |
|------|------|------|
| 構造 | **フラットな単一フォルダ**（タグごとのサブフォルダは作らない） | タグ分割案はサニタイズ・リネーム追従・フォルダ削除処理が必要で、実装量と事故リスクが跳ね上がる。フラットなら「DB とフォルダ内容の差分適用」だけで済む |
| 対象 | **`kind = 'path'` のみ**（ファイルとフォルダ）。URL は対象外 | ダイアログで `.url` は選べずノイズ。URL 比率が高いユーザーでは棚が機能しなくなる。URL を開くのは召喚ホットキーの方が速い |
| URL を含める設定 | **作らない** | 使う人がいない設定を増やさない。デザイン方針（トグルで出し入れしない）にも反する |
| 重複 | ブックマーク1件 = ショートカット1個 | タグ数に応じた重複が発生しない |
| 既定 | **OFF**。オンにするまでフォルダを作らない | ユーザーのファイルシステムに勝手にフォルダを生やさない |
| 生成先 | 既定 `%USERPROFILE%\Bookmarks\`、設定で変更可 | **確定** |
| ショートカット名 | **実ファイル名（拡張子込み）**。ブックマークのタイトルは使わない | **確定**。ダイアログのフィルタ照合と拡張子の視認性。タイトルだと `案件A 仕様` のように拡張子が失われ、棚としての識別性が落ちる |
| 機能名 | **File shortcuts**（"Tag folders" / "ミラー" とは名乗らない） | 「アプリに200件あるのにフォルダには20件」という食い違いを、名前の時点で発生させない |
| 並び順対応 | ショートカットの更新日時 = ブックマークの `last_accessed_at` | ダイアログで「更新日時の降順」にすると最近使ったものが上に来る。フラット構造の唯一の弱点を緩和する |
| 同名衝突 | 衝突時のみ `見積書 (案件A).xlsx` のように親フォルダ名を括弧付与 | ID 付与より読める |
| JSON バックアップ | **この設定は含めない**（フェーズ2で決定） | 復元した別 PC で、断りなくプロファイルにフォルダを作り始めてしまう。生成先のパスも PC ごとに違う |
| 空パスの扱い | 空文字列 = 既定の場所（フェーズ2で決定） | 設定画面に「既定に戻す」を別フラグなしで持たせられる。文字通り解釈するとドライブ直下に書きかねない |
| OFF にしたとき | **生成したショートカットを撤去する**（フェーズ3で決定）。マニフェスト記載分のみ削除し、空になったフォルダも削除。ユーザー自身のファイルがあれば残す。**あわせてクイックアクセスのピンも外す**（フェーズ4.5で追加） | 消えるのは再生成可能なショートカットだけで、失うデータが無い。放置すると死んだショートカットの入ったフォルダがプロファイルに残り続ける。フォルダを消してピンを残すと、エクスプローラーのサイドバーにリンク切れの項目が残る |

## 3. 技術設計

### 3.1 データ

`user_settings` に2列追加（既存の `add_column_if_missing` パターンをそのまま使う）:

```rust
add_column_if_missing(&conn, "user_settings", "shortcut_dir_enabled", "INTEGER NOT NULL DEFAULT 0")?;
add_column_if_missing(&conn, "user_settings", "shortcut_dir_path", "TEXT")?;
```

`shortcut_dir_path` が NULL のときは `%USERPROFILE%\Bookmarks` を既定として解決する。

### 3.2 マニフェスト — 削除事故を防ぐ唯一の仕組み

生成先フォルダ直下に `.bookmarks-shortcuts.json` を置き、**このアプリが作ったファイルだけ**を記録する。

```json
{
  "version": 1,
  "entries": { "<bookmark_id>": "見積書 (案件A).xlsx.lnk" }
}
```

- **削除対象はマニフェストに載っているファイルのみ。** 載っていないファイルには一切触れない
- マニフェストが存在しないディレクトリでは、**削除を一切行わない**（新規作成のみ）。
  ユーザーが生成先に既存のフォルダ（ドキュメント等）を指定しても、そこの中身を消さない
- `.lnk` を読み返してターゲットを判定する方式は採らない（COM 読み出しが増える上に、
  ユーザーが手で置いた無関係な `.lnk` と区別できない）

### 3.3 リコンサイル

```
期待セット = SELECT id, title, url FROM bookmarks WHERE kind = 'path'
現状セット = マニフェストの entries
      ↓ 差分
不足 → .lnk 生成 + マニフェストに追加
余剰 → マニフェスト記載のファイルを削除 + entries から除去
名前変更 → 旧ファイル削除 → 新規生成
      ↓
マニフェスト書き戻し
```

- 実行は別スレッド（`tauri::async_runtime::spawn_blocking`）。UI をブロックしない
- **300ms デバウンス**。連続操作（インポート等）で何度も走らせない
- 失敗（パスが長すぎる、権限がない）は**そのブックマークだけスキップしてログに残す**。
  全体を止めない

### 3.4 `.lnk` 生成

`windows` crate は既に依存にあるので、features を追加するだけ:

```toml
windows = { version = "0.61", features = [
  # 既存 …
  "Win32_UI_Shell",
  "Win32_System_Com",
  "Win32_System_Com_StructuredStorage",
] }
```

手順: ワーカースレッドで `CoInitializeEx(COINIT_APARTMENTTHREADED)` →
`CoCreateInstance(&ShellLink)` → `IShellLinkW::SetPath` / `SetWorkingDirectory` /
`SetDescription`（ブックマークのメモ or タイトル）→ `IPersistFile::Save`。

更新日時は COM 不要で、保存後に `std::fs::File::set_times(FileTimes)` で
`last_accessed_at`（無い場合は `created_at`）を書き込む。

### 3.5 ショートカットの名前

**実ファイル名（拡張子込み）を使う**。ブックマークのタイトルは使わない。

- 理由: ダイアログのフィルタ照合と視認性。タイトルが「案件A 仕様」だと拡張子が失われ、
  棚としての識別性が落ちる
- フォルダの場合はフォルダ名
- 衝突時のみ ` (親フォルダ名)` を挿入。それでも衝突する場合は末尾に ID 先頭6桁

### 3.6 同期のトリガ

`tagfolder::request_sync(&app)` を呼ぶ箇所（すべて `commands.rs`）:

| 関数 | 行 | 備考 |
|------|-----|------|
| `create_bookmark` | 187 | |
| `update_bookmark` | 224 | パス・タイトル変更で名前が変わる |
| `delete_bookmark` | 267 | |
| `delete_all_bookmarks` | 275 | |
| `import_data` | 951 | 復元後にフル同期 |
| `increment_access` | 298 | **更新日時の書き換えのみ**（フル同期は不要） |

加えて **起動時に必ずフル リコンサイル**を1回走らせる（`lib.rs` の setup）。
拡張機能経由の書き込み（`server.rs:217`）は URL ブックマークのみなので通常は影響しないが、
起動時同期があれば取りこぼしても次回起動で必ず整合する。

### 3.7 新規/変更ファイル

| ファイル | 変更 |
|---------|------|
| `src-tauri/src/shortcutdir.rs` | **新規**。マニフェスト、リコンサイル、`.lnk` 生成、名前解決 |
| `src-tauri/src/db.rs` | 列2つ追加 |
| `src-tauri/src/commands.rs` | `get_settings` / `update_settings` に2項目追加、同期フック、`sync_shortcut_dir` / `open_shortcut_dir` コマンド |
| `src-tauri/src/lib.rs` | モジュール登録、コマンド登録、起動時同期 |
| `src-tauri/Cargo.toml` | `windows` features 追加 |
| `src/lib/tauriFetch.ts` | `/api/shortcut-dir` ルート追加 |
| `src/components/SettingsDialog.tsx` | Data セクションに UI |
| `src/types/userSettings.ts` | 型と変換関数に2項目 |

### 3.8 UI（Settings → Data）

```
File shortcuts                                      [ OFF | ON ]
ブックマークしたファイルとフォルダへのショートカットを Windows の
フォルダに出力します（URL は対象外）。
生成先: C:\Users\Yukihiro\Bookmarks       [ Change ] [ Open ]
                                          [ Sync now ]
```

デザインは既存 Data セクション（Import/Export、Backup/Restore、Fetch missing icons）の
`Button variant="secondary" size="sm"` + `text-xs text-muted-foreground` の説明文パターンを踏襲。
新しい色や装飾は追加しない。

初回 ON 時に、クイックアクセスへの固定を促す一文を出す（実際の固定操作はユーザーが行う）。

## 4. フェーズ

| # | 内容 | 完了条件 | 目安 |
|---|------|---------|------|
| 0 | MSIX の書き込み検証 | **完了**（9章） | — |
| 1 | `shortcutdir.rs`: マニフェスト + リコンサイル + `.lnk` 生成（COM）。設定 UI なし、固定パスに手動コマンドで出力 | **完了**。ユニットテスト9件で検証（`.lnk` を読み戻してターゲット解決まで確認） | 1日 |
| 2 | DB 列 + 設定の読み書き + 同期フック + 起動時リコンサイル | **完了**。`load_config` のテストを追加（計10件） | 0.5日 |
| 3 | Settings UI（ON/OFF、生成先変更、Open、Sync now） | **完了**。`tsc` / ESLint / Rust テスト12件が通過。実機での目視確認はフェーズ5 | 0.5日 |
| 4 | 更新日時 = `last_accessed_at`、同名衝突の括弧付与、パス長・権限エラーのスキップ処理 | **完了**。テスト14件（`shortcutdir`）／全体23件が通過 | 0.5日 |
| 4.5 | クイックアクセスへのピン留め／解除トグル（プラン追加） | **完了**。ピン→重複しない→解除の往復をテストで固定 | 1h |
| 5 | `docs/testing/manual-test-checklist.md` 更新、README 追記、CLAUDE.md 追記 | **完了**。Outlook / Excel / Chrome での実機確認はチェックリスト化済み（未実施） | 0.5日 |

**合計 3日程度。** フェーズ1〜3が揃わないと価値が出ないので、リリース単位は「1〜4」。

## 5. リスク

| リスク | 影響 | 対策 |
|--------|------|------|
| ~~MSIX（ストア版）で書き込みが仮想化される~~ | — | **解消済み。** インストール済みストア版のコンテナ内から `%USERPROFILE%` へ書き込み、実パスに着地することを確認（9章） |
| 生成先に既存フォルダを指定され、中身を消す | **データ損失** | マニフェスト方式（3.2）。マニフェストの無いディレクトリでは削除しない。マニフェスト記載外のファイルには触れない |
| COM 初期化のスレッド事情 | `.lnk` 生成が失敗 | 同期は専用ワーカースレッドで実行し、そのスレッド内で `CoInitializeEx` する |
| パス長 260 制限 | 一部のショートカットが作れない | 該当分のみスキップ + ログ。全体は止めない |
| ブックマーク数が多い場合の初回生成 | 起動が遅くなる | 起動時同期は非同期。差分適用なので2回目以降は通常0〜数件 |
| ユーザーが Explorer 側でショートカットを消す/動かす | 次回同期で復活して驚く | 意図した挙動（DB が正）。設定文で「アプリの内容が反映されます」と示す。**逆流の取り込みは今回やらない** |
| ダイアログのフィルタ次第でショートカットが出ない | 一部アプリで効かない | ユーザーが実機確認済み。フェーズ5で Outlook / Excel / Chrome アップロードの3種を再確認しチェックリスト化 |

## 6. やらないこと（今回のスコープ外）

- タグごとのサブフォルダ分割
- URL ブックマークの `.url` 出力
- 逆流の取り込み（タグフォルダに放り込んだファイルを自動でブックマーク化）
- ジャンクション/シンボリックリンク方式（バックアップツールが辿る事故が怖い）
- favicon を `.ico` に書き出してショートカットのアイコンにする

## 7. 確定事項（着手前の確認は完了）

1. ショートカット名 → **実ファイル名（拡張子込み）**
2. 生成先の既定 → **`%USERPROFILE%\Bookmarks`**
3. MSIX 検証 → **着手前に実施し、問題なしを確認**（9章）

## 8. 着手順

フェーズ1（`shortcutdir.rs` の実装）から開始する。

## 9. 事前検証の結果 — MSIX の書き込み仮想化

**結論: 仮想化は起きない。ストア版でもこの機能は成立する。**

### 検証方法

MSIX をビルドせず、**この PC にインストール済みのストア版パッケージ**を使って検証した。

1. `Get-AppxPackage` でインストール済みパッケージを確認
   → `YukihiroSakuda.BookmarksTags` 0.1.9.0、PFN `YukihiroSakuda.BookmarksTags_qvmk1q0kegjem`
2. `%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db` が実パスに存在することを確認
3. パッケージコンテナ `%LOCALAPPDATA%\Packages\<PFN>\` 配下を再帰検索し、
   `bookmarks.db` の影が**存在しない**ことを確認 → ファイル書き込みのリダイレクトは無い
4. 決定的な確認として `Invoke-CommandInDesktopPackage` で
   **パッケージのコンテナ・コンテキスト内から** `%USERPROFILE%\Bookmarks\probe.txt` へ書き込み
5. 結果: 実パス `C:\Users\Yukihiro\Bookmarks\probe.txt` に着地。
   コンテナ内には何も生成されなかった
6. 検証用ファイルとディレクトリは削除済み

### 意味

`runFullTrust` かつ PSF 無しの構成では、`%APPDATA%` も `%USERPROFILE%` も
リダイレクトされない。生成先を `%USERPROFILE%\Bookmarks` にして問題ない。
ストア版と GitHub Releases 版で生成先が食い違うこともない。

### 再現コマンド（要管理者権限）

```powershell
Invoke-CommandInDesktopPackage `
  -PackageFamilyName "YukihiroSakuda.BookmarksTags_qvmk1q0kegjem" `
  -AppId "Bookmarks" `
  -Command "C:\Windows\System32\cmd.exe" `
  -Args '/c echo probe > "%USERPROFILE%\Bookmarks\probe.txt"'
```
