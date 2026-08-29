---
title: "Bookmarks - アプリ内ファイルビュー（段階1・2）"
status: draft
version: "1.0"
---

# Product Requirements Document

## Validation Checklist

### CRITICAL GATES (Must Pass)

- [x] All required sections are complete
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Problem statement is specific and measurable
- [x] Every feature has testable acceptance criteria (Gherkin format)
- [x] No contradictions between sections

### QUALITY CHECKS (Should Pass)

- [x] Problem is validated by evidence (not assumptions)
- [x] Context → Problem → Solution flow makes sense
- [x] Every persona has at least one user journey
- [x] All MoSCoW categories addressed (Must/Should/Could/Won't)
- [x] Every metric has corresponding tracking events
- [x] No feature redundancy (check for duplicates)
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

ブックマークとタグとグループを知っているファイルビューを、アプリの中に持つ。Explorer を外から操るのをやめ、フォルダを**自分のタブ**で開く。

### Problem Statement

#### 1. `explorertabs.rs` は原理的に不安定である

002 で実装した「グループのフォルダを1つのウィンドウのタブで開く」は、**Windows にタブを作る API がない**ため、キー入力の自動化で実現している。フォアグラウンドを検証し、失敗すれば個別ウィンドウにフォールバックするよう作ったが、次の性質は消せない。

- 成功したかどうかを**検証する手段がない**。`SendInput` が成功を返したところまでしか分からない
- Windows の更新で**黙って壊れうる**
- 処理中にユーザーがフォーカスを奪うと中断するしかない
- Windows 11 22H2 未満では機能しない

今回作った中で、唯一これだけが「将来どうなるか分からない」部分として残っている。

**アプリが自前のタブを持てば、この問題は消える。** 自分のウィンドウの中のタブなので、作るのも数えるのも閉じるのも確実にできる。最も脆い部分が、最も堅い部分になる。

#### 2. Explorer はブックマークを知らない

`kind = 'path'` のブックマークにはタグとメモが付いている。しかし Explorer でそのフォルダを開いた瞬間、その情報は消える。タグ付けした本人が、ファイルを見ている場所ではタグを見られない。

#### 3. 検索結果からフォルダを「見る」手段がない

`folder_search` はブックマークしたフォルダの中をファイル名で検索する。しかしヒットしたファイルの**周辺**を見るには Explorer を開き直すしかない。検索とブラウズが切れている。

### Value Proposition

- **グループのフォルダが確実にタブで開く** — 自前のタブなので OS のバージョンにも Windows の更新にも依存しない
- **ファイルを見ている場所にタグとメモがある** — ブックマーク済みのフォルダを開けば、そのタグがそこに出る
- **検索からブラウズへ繋がる** — 検索結果からその場所を開ける
- **シェルの品質は捨てない** — コンテキストメニューとファイル操作は Windows 自身に任せる（段階3以降）

## User Personas

### Primary Persona: エンジニア（個人利用）
- **Demographics:** 25〜40歳、Windows 11 デスクトップ
- **Goals:** 案件ごとのフォルダを行き来する。Explorer のウィンドウが散らかるのが嫌
- **Pain Points:** グループでフォルダを開いてもタブになったりならなかったりする。フォルダを見ている間はタグが見えない

## User Journey Maps

### Primary Journey: グループを開いて作業する

1. **Awareness:** グループ「案件A 朝イチ」を起動する
2. **Consideration:** これまでは Explorer が別ウィンドウで開いたり、タブになったりしなかったりした
3. **Adoption:** 設定でフォルダの開き方を「アプリ内のタブ」にする
4. **Usage:** グループを起動すると、URL はブラウザに、フォルダは**アプリ内に2つのタブ**として開く。タブは必ず2つできる
5. **Retention:** フォルダのタグがタブの上に出ている。ファイルをダブルクリックすれば既定のアプリで開く

### Secondary Journey: 検索から周辺を見る

1. 検索欄に打つと `folder_search` がブックマークしたフォルダの中のファイルを出す
2. ヒットしたファイルの「場所を開く」を押す
3. アプリ内のタブでそのフォルダが開き、周辺のファイルが見える

---

## Feature Requirements

### Must Have Features

#### Feature 1: Files ビュー（タブ付きのファイル一覧）

- **User Story:** ユーザーとして、フォルダの中身をアプリの中で見たい。そうすれば、Explorer のウィンドウを増やさずに済む
- **Acceptance Criteria:**
  - [ ] Given アプリを開いている, When ヘッダーで Files ビューに切り替える, Then タブ付きのファイル一覧が表示される
  - [ ] Given Files ビューを表示している, When フォルダを開く, Then そのフォルダのファイルとサブフォルダが名前・サイズ・更新日時とともに一覧される
  - [ ] Given ファイル一覧を表示している, When サブフォルダをダブルクリックする, Then **同じタブの中で**そのフォルダに移動する
  - [ ] Given ファイル一覧を表示している, When ファイルをダブルクリックする, Then 既定のアプリで開く（既存の `open_path` を使う）
  - [ ] Given フォルダを深く辿った, When パンくずの上位をクリックする, Then その階層に戻る
  - [ ] Given タブが複数ある, When タブを閉じる, Then 残りのタブは影響を受けない
  - [ ] Given タブが1つもない, When Files ビューを開く, Then 空状態と「フォルダを開く」導線が表示される
  - [ ] Given アプリを再起動した, When Files ビューを開く, Then 前回のタブが復元されている
  - [ ] Given 存在しなくなったフォルダのタブを復元した, When 表示される, Then タブは残り、「このフォルダは見つかりません」と表示される（起動が失敗しない）

#### Feature 2: 巨大なフォルダで固まらない

- **User Story:** ユーザーとして、数万ファイルのフォルダを開いてもアプリが固まってほしくない
- **設計方針:** `folder_search.rs` が採った方針をそのまま引き継ぐ。**インデックスを持たず、都度読み、上限で必ず打ち切る。** 自前のキャッシュは「いつ古くなるか」という問いを抱え込むだけで、Windows が既にやっている仕事の劣化版になる
- **Acceptance Criteria:**
  - [ ] Given 50,000 ファイルを含むフォルダを開いた, When 一覧が表示される, Then UI はブロックせず、上限までの件数が表示される
  - [ ] Given 上限に達した, When 表示される, Then 「N件中 M件を表示しています」と件数が明示される（黙って切り捨てない）
  - [ ] Given 一覧の読み込み中である, When 表示される, Then 読み込み中であることが分かる
  - [ ] Given 遅いネットワークドライブを開いた, When 応答がない, Then UI は操作可能なままで、タブを閉じられる
  - [ ] Given 一覧が表示されている, When スクロールする, Then 数千行でも滑らかにスクロールする（仮想スクロール）

#### Feature 3: グループのフォルダをアプリ内タブで開く

- **User Story:** ユーザーとして、グループのフォルダが確実にタブで開いてほしい。そうすれば、開き方が毎回変わることがなくなる
- **Acceptance Criteria:**
  - [ ] Given 設定でフォルダの開き方を「アプリ内のタブ」にした, When フォルダ3件を含むグループを起動する, Then Files ビューに**必ず3つのタブ**が開き、そのビューに切り替わる
  - [ ] Given 設定が「1つのウィンドウのタブ」または「個別のウィンドウ」である, When グループを起動する, Then 002 のとおり Explorer が使われる（**既存の挙動は消さない**）
  - [ ] Given アプリ内タブで開いた, When 開いた, Then Explorer のウィンドウは1つも増えない
  - [ ] Given グループに存在しないパスが含まれる, When 起動する, Then そのフォルダのタブは開かず、失敗として報告される（002 の報告経路をそのまま使う）
  - [ ] Given 同じフォルダのタブが既に開いている, When グループを起動する, Then タブは重複せず、既存のタブが選択される

#### Feature 4: ブックマークを知っているファイルビュー

- **User Story:** ユーザーとして、ファイルを見ている場所でそのフォルダのタグを見たい
- **Acceptance Criteria:**
  - [ ] Given ブックマーク済みのフォルダを開いている, When タブを表示する, Then そのブックマークのタグとメモが一覧の上に表示される
  - [ ] Given ブックマークされていないフォルダを開いている, When タブを表示する, Then 「ブックマークに追加」の導線が表示される
  - [ ] Given ファイル一覧を表示している, When ファイルを選んで「ブックマークに追加」する, Then `kind = 'path'` のブックマークが作られ、タグルールが適用される
  - [ ] Given 検索結果（`folder_search`）が表示されている, When 「場所を開く」を押す, Then そのファイルを含むフォルダが Files ビューのタブで開く

### Should Have Features

#### Feature 5: 並べ替えと表示切り替え
- 名前 / サイズ / 更新日時での並べ替え。フォルダを先に固定するかの切り替え
- 隠しファイルの表示切り替え（既定は非表示）

#### Feature 6: タブの操作
- ドラッグでタブの並び替え、`Ctrl+T` / `Ctrl+W`、タブの複製

### Could Have Features

#### Feature 7: シェルのコンテキストメニュー（段階3）
- `IContextMenu` で**本物のシェルメニュー**を出す。7-Zip や TortoiseSVN の項目もそのまま出る

#### Feature 8: ファイル操作（段階4）
- `IFileOperation` によるコピー・移動・削除・リネーム。シェルの進捗 UI、衝突時の確認、**元に戻す**まで込みで手に入る

#### Feature 9: サムネイル（段階5）
- `IShellItemImageFactory::GetImage` → HBITMAP → PNG → data URI

### Won't Have (This Phase)

- **ファイルの作成・変更・削除・リネーム**。段階1・2は**完全な読み取り専用**。これが「ファイラを作る」ことにならないための線引きであり、UI 上も明示する
- **シェルビューのホスト**（後述の技術判断を参照）
- 複数ペイン、フォルダ比較、同期
- アーカイブの中身の閲覧
- FTP / SFTP などのリモート接続
- `explorertabs.rs` の削除 — Explorer で開きたい人のために残す

---

## Detailed Feature Specifications

### 技術判断: シェルビューをホストしない

Tablacus Explorer のようなファイラは、シェルビュー（`IShellBrowser` / `IShellView`）そのものをホストしている。それにより Explorer と同じ一覧が、コンテキストメニュー・シェル拡張・ドラッグ&ドロップ・サムネイル込みで手に入る。

**本アプリではこの方式を採らない。**

UI は WebView2 であり、ネイティブのシェルビューを DOM の中に置くことはできない。実現するには webview に重ねてネイティブの子 HWND を配置し、位置・サイズ・Z オーダー・フォーカスを手で同期し続けることになる。可能ではあるが、レイアウトが変わるたびに壊れる種類の作りであり、Next.js + WebView2 という既存のアーキテクチャと正面から衝突する。

**代わりに、一覧は自前で描き、自前で書くと必ず品質が落ちる部分だけをシェルに委ねる。**

| 部分 | 手段 | 段階 |
|------|------|------|
| ファイル一覧 | Rust で `std::fs::read_dir`、React で描画 | 1 |
| ファイルを開く | 既存の `open_path`（`ShellExecuteW` 経由） | 1 |
| コンテキストメニュー | `IContextMenu` | 3 |
| コピー・移動・削除 | `IFileOperation` | 4 |
| アイコン・サムネイル | `IShellItemImageFactory::GetImage` | 5 |

**確認済み: これらはすべて `Win32_UI_Shell`（既に有効な feature）の中にある。** 新しい依存もクレートの feature 追加も不要。

段階3〜5 に進まなくても段階1・2 は機能として成立する。この分割の目的は、**ファイラを作る覚悟を決める前に、タブの確実性という一番の目的を先に取る**ことにある。

### Feature: ファイル一覧の読み取り

**Description:** ディレクトリを読んで返すだけの、状態を持たないコマンド。

**Business Rules:**
- **インデックスもキャッシュも持たない。** `folder_search.rs` の判断をそのまま引き継ぐ。Windows が既にディレクトリのメタデータをキャッシュしており、自前のキャッシュは「いつ無効になるか」を抱え込む劣化版にしかならない
- 1回の読み取りに**必ず上限**を設ける（初期値 5,000 件）。超えた場合は総数とともに報告し、黙って切り捨てない
- **リパースポイントを辿らない。** `folder_search.rs` が同じ制約を持つ。ジャンクションを辿ると同じ場所を無限に読みうる
- 読み取りはブロッキングスレッドで行う。ネットワークドライブは秒単位で応答しないことがあり、UI スレッドを止められない
- 隠しファイルとシステムファイルは既定で除外する

**Edge Cases:**
- アクセス権のないフォルダ → 「アクセスできません」を表示し、タブは残す
- 読み取り中にフォルダが削除された → 同上。アプリは落ちない
- 応答しないネットワークドライブ → タイムアウトし、タブを閉じられる状態を保つ
- ドライブのルート（`C:\`）→ 通常のフォルダとして扱う
- 数万ファイル → 上限で打ち切り、件数を明示

### Feature: タブ

**Business Rules:**
- タブの状態（開いているパスと順序）は **localStorage** に持つ。`active_view` と同じく、これはウィンドウの状態であってユーザー設定ではなく、DB に列を足す性質のものではない
- 復元したタブのパスが存在しなくても**タブは残す**。消してしまうと、一時的に切断されたネットワークドライブのタブが黙って消える
- 同じパスのタブは重複させない。既に開いていればそれを選択する

---

## Technical Design

### 新しい Rust コマンド（`src-tauri/src/fileview.rs`）

```
list_directory(path, options) -> { entries, total, truncated, error }
```

`folder_search.rs` とは別モジュールにする。あちらは「複数のブックマーク済みフォルダを横断して名前で検索する」ためのもので、こちらは「1つのフォルダを読む」。走査の性質が違うため、`Limits` のような概念だけを参考にして実装は共有しない。

エントリは以下を返す:

```rust
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified_at: Option<String>,  // folder_search の modified_at と同じ形式
}
```

### `tauriFetch` のルート

```
GET /api/files?path=<path>   → list_directory
```

### 設定

`user_settings.group_folder_open_mode` に **3つ目の値 `'in-app'`** を足す。既存の `'tabs'` / `'windows'` はそのまま残す。既定は変えない（既存ユーザーの挙動を勝手に変えない）。

`src/lib/settingsText.ts` の en / ja 両方にエントリが必要。

### フロントエンド

| ファイル | 役割 |
|----------|------|
| `src/types/file.ts` | `FileEntry` と変換 |
| `src/hooks/useFileTabs.ts` | タブの状態、localStorage への永続化、パスの重複排除 |
| `src/hooks/useDirectory.ts` | 1タブ分のディレクトリ読み取りと状態（読み込み中 / エラー / 打ち切り） |
| `src/components/FilesView.tsx` | Files ビュー本体。タブバーと空状態 |
| `src/components/FileTab.tsx` | 1タブ。パンくず、一覧、ブックマーク情報 |
| `src/components/FileList.tsx` | 仮想スクロールする一覧 |
| `src/components/ViewSwitcher.tsx` | 3つ目のビューを追加 |

仮想スクロールにライブラリを足すかは実装時に判断する。数千行なら固定行高の自前実装で足りる可能性が高く、依存を増やす前に測る。

### 既存コードへの影響

- `ViewSwitcher.tsx` — ビューが3つになる
- `groups.rs` の `open_group` — `folder_mode == "in-app"` のとき、フォルダを開かずパスの一覧を返し、フロントがタブとして開く
- `explorertabs.rs` — **変更しない。** Explorer で開きたい人のために残す
- `BookmarkCard` / `BookmarkForm` / `BookmarkList` — **触らない**（002 で確立した前提を継続）

---

## Implementation Phases

| Phase | 内容 | 完了条件 |
|-------|------|----------|
| **P1: 読み取り** | `fileview.rs` の `list_directory`、上限、リパースポイント回避、ブロッキングスレッド | 巨大フォルダとネットワークドライブで UI が固まらない |
| **P2: ビューとタブ** | `FilesView` / `FileTab` / `FileList`、パンくず、仮想スクロール、localStorage 永続化 | フォルダを辿れて、タブが復元される |
| **P3: グループ連携** | `group_folder_open_mode = 'in-app'`、設定 UI、`open_group` の分岐 | グループのフォルダが必ずタブで開く |
| **P4: ブックマーク連携** | タグ・メモの表示、「ブックマークに追加」、検索結果からの「場所を開く」 | ファイルを見ている場所にタグがある |

段階3以降（`IContextMenu` / `IFileOperation` / サムネイル）は本 PRD の範囲外とし、P1〜P4 を実際に使ってから判断する。

---

## Success Metrics

### Key Performance Indicators

| 指標 | 現状 | 目標 |
|------|------|------|
| グループのフォルダがタブで開く成功率 | `SendInput` 依存で不明（検証手段がない） | **10/10**（自前のタブなので確実に数えられる） |
| Windows 11 22H2 未満での動作 | タブ化は不可 | 動作する（OS に依存しない） |
| 5万ファイルのフォルダを開いたときの UI 応答 | — | 操作可能なまま、1秒以内に初回描画 |
| フォルダを開くのに増える Explorer ウィンドウ数 | 1〜3 | **0** |

### Tracking Requirements

テレメトリは導入しない（001〜003 と同じ方針）。`docs/testing/manual-test-checklist.md` に手動計測手順を追記する。「タブで開く成功率」は、**自前のタブなら実際に数えられる**点が `explorertabs.rs` との決定的な違いである。

---

## Constraints and Assumptions

### Constraints

- WebView2 の中にネイティブのシェルビューを置けない。これが設計全体を決めている
- 段階1・2 は読み取り専用。ファイル操作は `IFileOperation` を入れるまで提供しない
- テストフレームワークが未整備。検証は手動チェックリストと、純粋関数のユニットテストに依存する
- `npm run build` を `tauri:dev` の実行中に走らせない（`CLAUDE.md` の既知の落とし穴）

### Assumptions

- 1タブで開くフォルダは通常 10〜1,000 件程度。数万件は例外的
- ユーザーは Explorer を完全には捨てない。他アプリのファイルダイアログは Explorer のままである
- 読み取り専用でも「グループのフォルダが確実にタブで開く」だけで価値がある

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **スコープがファイラ作りに膨張する** | **High** | **High** | 段階1・2 を読み取り専用と明示的に定義する。`IContextMenu` / `IFileOperation` は本 PRD の範囲外。P4 まで作って実利用してから次を判断する |
| 読み取り専用であることが伝わらず「リネームできない」と受け取られる | Medium | High | 一覧の空き領域に「読み取り専用のビューです」と常時表示し、右クリックには「エクスプローラーで開く」を出す |
| 巨大フォルダやネットワークドライブで固まる | High | Medium | ブロッキングスレッド、件数上限、タイムアウト。上限に達したら件数を明示 |
| 自前の一覧がシェルに見劣りする（アイコン、サムネイル、シェル拡張） | Medium | High | 見劣りする部分は最初から段階3〜5 として切り出してある。段階1・2 の目的はタブの確実性であって Explorer の置き換えではない、と受け入れ条件でも明示する |
| 既存の Explorer 統合（右クリック登録、Quick Access、`.lnk` ミラー）の価値が下がる | Medium | Medium | どれも削除しない。他アプリのファイルダイアログ向けの `.lnk` ミラーは、アプリ内ビューでは代替できないので価値が残る |
| リパースポイントを辿って無限に読む | High | Low | `folder_search.rs` と同じく辿らない |
| 仮想スクロールのために依存を増やす | Low | Medium | 固定行高の自前実装で足りるか先に測る |

## Open Questions

1. Files ビューを ViewSwitcher の3つ目にするか、Groups の中のタブとして持つか。3つ目が素直だが、ヘッダーの切り替えが3つになる
2. `group_folder_open_mode` の既定値を将来 `'in-app'` に変えるか。確実性では優れるが、Explorer を使いたい人の期待を裏切る。**当面は既定を変えない**
3. 仮想スクロールを自前で書くか、ライブラリを入れるか。実測してから決める
4. ファイルのアイコンを段階1でどうするか。拡張子ベースの汎用アイコンで始め、`IShellItemImageFactory` は段階5 に置く案が有力
