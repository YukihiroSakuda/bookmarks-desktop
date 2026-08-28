---
title: "Bookmarks - ブックマークグループ（ワンクリック一括起動）"
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

「今日はこの作業をする」と決めた瞬間に、その作業に必要なURLとローカルフォルダが**ワンクリックで全部開いている**状態をつくる。ブックマークを1件ずつ開く操作を、作業単位のセットを開く操作に置き換える。

### Problem Statement

現行の Bookmarks には、**複数のブックマークをまとめて扱う手段が「タグによる絞り込み表示」しかない**。

1. **作業開始時の起動コストが高い** — 1つの案件を再開するのに、ドキュメント・管理画面・リポジトリ・作業フォルダなど 5〜8 件を1件ずつクリックして開く必要がある。1回あたり 20〜40 秒、クリック 5〜8 回
2. **タグは分類であって作業セットではない** — タグは「AWS」「社内ツール」のような属性の分類として使われており、「案件Aの朝イチで開くもの」という**順序と組み合わせを持つセット**を表現できない。タグで絞り込んでも、結局そこから1件ずつ開くことに変わりはない
3. **開き忘れが起きる** — 手作業で開くため、毎回どれかが抜ける。抜けたことに気づくのは作業の途中
4. **ローカルフォルダが特に散らかる** — `kind = 'path'` のブックマークを複数開くと、現在の `open_path` は1件につき1つの Explorer ウィンドウを開く。フォルダ3件で3ウィンドウがデスクトップに散乱し、ウィンドウ整理という余計な作業が発生する

### Value Proposition

- **ワンクリックで作業環境が立ち上がる** — Groups ビューでグループを1回クリックすれば、URLはブラウザのタブに、ローカルフォルダは1つの Explorer ウィンドウのタブとして一斉に開く
- **セットが記憶される** — 何を開くべきかを人間が覚えておく必要がなくなり、開き忘れが構造的に消える
- **デスクトップが散らからない** — フォルダは1ウィンドウ内のタブにまとまる。Windows 11 の Explorer タブを活かした、この種のツールでは珍しい体験
- **既存画面を1行も変えない** — グループは独立した Groups ビューに置く。Bookmarks ビューは現状のまま維持され、タグ（分類）とグループ（作業セット）が同じ画面で混ざって見えることもない

## User Personas

### Primary Persona: エンジニア（個人利用）
- **Demographics:** 25〜40歳、ソフトウェアエンジニア、Windows 11 デスクトップ、技術リテラシー高
- **Goals:** 複数案件を並行して持ち、案件を切り替えるたびに必要なリンクとフォルダを開き直す。切り替えコストを限りなくゼロにしたい
- **Pain Points:** 案件切り替えのたびに同じクリック作業を繰り返す。開き忘れて手戻りする。Explorer ウィンドウが増えすぎて目的のフォルダを見失う

## User Journey Maps

### Primary Journey: 朝イチの作業立ち上げ

1. **Awareness:** 案件Aを再開するとき、毎回同じ6件（Jira / 社内Wiki / GitHub / 管理画面 / ローカルの作業フォルダ2つ）を開いていることに気づく
2. **Consideration:** タグ「案件A」で絞り込むところまではできるが、そこから6回クリックする必要があり、結局手間が減っていない
3. **Adoption:** ヘッダーで Groups ビューに切り替え、「案件A 朝イチ」を作成。カード内の検索欄に打ち込んで6件をまとめて登録
4. **Usage:** 翌朝アプリを開くと、前回終えた Groups ビューのまま立ち上がる。「案件A 朝イチ」のカードを1クリック。ブラウザに4タブ、Explorer 1ウィンドウに2タブが開き、作業を開始できる
5. **Retention:** 案件が進むにつれメンバーを差し替える。グループ管理ダイアログで並び替え・追加・削除

### Secondary Journey: グループの手入れ

1. 案件Bの構成が変わり、ブックマークを1件追加したい
2. Groups ビューで「案件B」のカードを開き、検索欄にタイトルの一部を打って候補から選ぶ
3. ドラッグで開く順序を先頭に移動
4. 次回起動時、その順序どおりに開く
5. Bookmarks ビューに戻る。一覧の見た目は機能導入前とまったく変わっていない

---

## Feature Requirements

### Must Have Features

#### Feature 1: グループの作成・編集・削除

- **User Story:** ユーザーとして、複数のブックマークに名前をつけた「セット」として保存したい。そうすれば、作業単位で呼び出せる
- **Acceptance Criteria:**
  - [ ] Given Groups ビューを表示している, When 「Create group」から名前を入力する, Then 空のグループカードが作られ、その場でメンバー追加に進める
  - [ ] Given グループが存在する, When 同じ名前で別のグループを作ろうとする, Then 「同名のグループがすでに存在します」と表示され、作成されない
  - [ ] Given グループにブックマークが所属している, When そのグループを削除する, Then グループと所属関係のみが消え、**ブックマーク本体は1件も削除されない**
  - [ ] Given ブックマークがグループに所属している, When そのブックマークを削除する, Then グループからも自動的に外れ、グループ自体は残る
  - [ ] Given 1件のブックマークが存在する, When 複数のグループに追加する, Then どのグループからも開くことができる（多対多）

#### Feature 2: Groups ビュー（独立したページ）

- **User Story:** ユーザーとして、グループの一覧・起動・編集が1つの画面で完結してほしい。そうすれば、普段のブックマーク一覧が複雑にならない
- **設計方針:** グループは **Bookmarks ビューに一切表示しない**。ヘッダーの `BookmarkHeader` 下半分はすでに「見出し + ヒント + Clear all + Tag Manager + Tag Rule + タグチップ行 + SortControls」で密度が高く、ここへ同じ構造をもう一式重ねると、密度が倍になるうえ、タグとグループが同じ見た目で縦に並んで「分類」と「作業セット」の違いがかえって伝わらなくなる。またグループ専用のダイアログ（当初案の `GroupManager`）も設けない。ダイアログでやろうとしていたことがビューそのものになるため
- **Acceptance Criteria:**
  - [ ] Given アプリを開いている, When ヘッダーの Bookmarks / Groups を切り替える, Then 対応するビューが表示され、ページ遷移（リロード）は発生しない
  - [ ] Given Groups ビューを見たままアプリを閉じた, When 次にアプリを開く（トレイ / サモンショートカット経由を含む）, Then Groups ビューで立ち上がる
  - [ ] Given Bookmarks ビューを表示している, When 機能導入前と見比べる, Then レイアウト・行数・カードのボタン数が**一切変わっていない**
  - [ ] Given Groups ビューを表示している, When グループが1件もない, Then 空状態と「Create group」の導線が表示される
  - [ ] Given Groups ビューにグループカードがある, When カード本体をクリックする, Then そのグループが起動する
  - [ ] Given グループカードを開いている, When メンバー一覧を見る, Then 所属ブックマークがタイトル・種別アイコン付きで開く順に並んでいる

#### Feature 2b: メンバーの追加と削除

- **User Story:** ユーザーとして、キーボードだけで数件をまとめてグループに入れたい。そうすれば、グループ作成が数十秒で終わる
- **Acceptance Criteria:**
  - [ ] Given グループカードの検索欄にフォーカスがある, When タイトルまたは URL の一部を打つ, Then 未所属のブックマークが候補として絞り込まれる
  - [ ] Given 候補が表示されている, When Enter または候補のクリックで選ぶ, Then そのブックマークがメンバーの末尾に追加され、検索欄は空に戻って**続けて次を打てる**
  - [ ] Given すでに所属しているブックマークがある, When 検索する, Then それは候補に出ない（重複追加が構造的に起きない）
  - [ ] Given メンバー一覧が表示されている, When メンバー行の削除ボタンを押す, Then グループから外れ、**ブックマーク本体は削除されない**
  - [ ] Given メンバーを追加・削除した, When 操作した, Then Save ボタンを押さずに保存される

#### Feature 3: ワンクリック一括起動

- **User Story:** ユーザーとして、グループを1クリックするだけで所属する全ブックマークを開きたい。そうすれば、作業開始の手間がゼロになる
- **Acceptance Criteria:**
  - [ ] Given URL 4件を含むグループがある, When グループカードをクリックする, Then 既定ブラウザに4件が指定順で開く
  - [ ] Given ローカルフォルダ2件を含むグループがある, When グループカードをクリックする, Then Explorer が**1ウィンドウ**開き、その中に2つのタブとして表示される（Feature 4 の条件を満たす場合）
  - [ ] Given URL とフォルダが混在するグループがある, When グループカードをクリックする, Then URL 群がブラウザに、フォルダ群が Explorer に、それぞれまとめて開く
  - [ ] Given グループを開いた, When 起動が完了する, Then 所属する各ブックマークの `access_count` が1増え、`last_accessed_at` が更新される（recency ソートに反映される）
  - [ ] Given 存在しないパスを含むグループがある, When グループを開く, Then 開けたものは開かれ、開けなかった項目だけが件数付きのトーストで報告される（1件の失敗で全体が中断しない）
  - [ ] Given 設定した閾値（既定10件）を超える件数のグループである, When グループカードをクリックする, Then 「N件を開きます。よろしいですか？」の確認ダイアログが出る

#### Feature 4: ローカルフォルダを Explorer のタブに分けて開く

- **User Story:** ユーザーとして、複数のローカルフォルダを1つの Explorer ウィンドウのタブとして開きたい。そうすれば、デスクトップがウィンドウで散らからない
- **Acceptance Criteria:**
  - [ ] Given Windows 11 22H2 以降で、フォルダ3件を含むグループがある, When グループを開く, Then Explorer ウィンドウが1つだけ開き、3つのタブが作られる
  - [ ] Given Windows 10 または 22H2 未満である, When グループを開く, Then タブ化は試行されず、各フォルダが個別ウィンドウで開き、その旨が一度だけ通知される
  - [ ] Given タブ化の途中で失敗した（Explorer ウィンドウを見つけられない等）, When 失敗を検知する, Then 残りのフォルダは個別ウィンドウで開かれ、処理は完了する（無反応で終わらない）
  - [ ] Given 設定で「Open folders in separate windows」を有効にした, When グループを開く, Then タブ化は一切試行されず、常に個別ウィンドウで開く
  - [ ] Given タブ化の処理が走っている, When 処理中である, Then アプリの UI はフリーズせず、進行中であることが表示される

#### Feature 5: グループカードの並び替えと編集導線

- **User Story:** ユーザーとして、よく使うグループを Groups ビューの手前に置きたい。そうすれば、案件が増えても目的のグループが上にある
- **Acceptance Criteria:**
  - [ ] Given グループカードが複数ある, When ドラッグして並び替える, Then 順序が保存され、次回以降も維持される
  - [ ] Given グループカードにホバーしている, When 編集ボタンを押す, Then Feature 1 の編集（名前・色）をその場で行える
  - [ ] Given カード全体がクリックで起動する, When 編集/削除ボタンを押す, Then 起動は発生しない（イベントが伝播しない）

### Should Have Features

#### Feature 6: グループ内の並び順（開く順序）

- **User Story:** ユーザーとして、グループ内で開く順序を決めたい。そうすれば、最後に開いたタブが最前面という挙動を利用して、開始したい画面を手前に持ってこられる
- **Acceptance Criteria:**
  - [ ] Given グループ管理ダイアログを開いている, When メンバーをドラッグして並び替える, Then 順序が保存される
  - [ ] Given 並び順を設定したグループがある, When グループを開く, Then その順序どおりに開かれる

#### Feature 7: グループのショートカットキーと色

- **User Story:** パワーユーザーとして、キーボードだけでグループを起動したい
- **Acceptance Criteria:**
  - [ ] Given グループにショートカットを割り当てた, When アプリのウィンドウにフォーカスがある状態でそのキーを押す, Then グループが起動する
  - [ ] Given すでに別のブックマーク/グループが使っているキーを割り当てようとした, When 保存する, Then 重複が検知され、保存されない
  - [ ] Given グループに色を設定した, When チップが描画される, Then タグと同じ8色パレットの淡いトーンで描画される

### Could Have Features

#### Feature 8: Bookmarks ビューからの割り当て導線
- ブックマークカードのホバーボタン列に4つ目のボタンを足し、一覧を見ながらグループに入れられるようにする。**今回は見送る**: Bookmarks ビューを触らないという本 PRD の前提が崩れるうえ、ホバーボタンは現在3つ（pin / edit / delete）で、4列表示ではカードの横幅を圧迫する（`BookmarkCard.tsx:159-173`）。Groups ビューの検索欄で用は足りるため、実利用で不足が確認されてから検討する

#### Feature 9: グループでのブックマーク絞り込み
- Bookmarks ビューを「このグループのメンバーだけ」に絞る。Groups ビューのカード内にメンバーが並ぶため優先度は低い

#### Feature 10: エクスポート/インポートへのグループ同梱
- `export_data` / `import_data` の JSON にグループとメンバーを含める。HTML エクスポートは対象外

#### Feature 11: ブラウザ拡張からのグループ起動
- ローカル HTTP サーバー（37373）に `GET /groups` と `POST /groups/:id/open` を追加

### Won't Have (This Phase)

- グループのネスト（グループの中のグループ）
- グループ単位の共有・公開リンク
- 起動時のウィンドウ位置・サイズの復元（セッション復元）
- ブラウザ側のタブグループ API との連携（タブをブラウザのタブグループにまとめる）
- macOS / Linux でのタブ化（Explorer タブは Windows 固有。将来対応時は Finder タブを別途設計）

---

## Detailed Feature Specifications

### Feature: ワンクリック一括起動

**Description:** グループに所属する全ブックマークを、種別ごとに適切な方法で一斉に開く。起動処理は Rust 側（`open_group` コマンド）に集約する。順序制御・待機・スレッド分離・失敗の握り潰しをフロント側の `Promise` チェーンでやると読みにくく壊れやすいため、フロントは「開いてほしい」と依頼して結果レポートを受け取るだけにする。

**User Flow:**
1. ユーザーが Groups ビューでグループカードをクリック
2. 件数が閾値超過なら確認ダイアログ（既定10件）
3. アプリが `open_group` を呼び、進行中表示に切り替わる
4. Rust がメンバーを `position` 順に取得し、`kind` で2群に分ける
5. URL 群 → `tauri_plugin_opener::open_url` を順に実行（既定ブラウザがタブを作る）
6. フォルダ群 → Explorer タブ戦略（後述）で開く
7. 全項目の `access_count` / `last_accessed_at` を1トランザクションで更新
8. 結果レポート（成功件数 / 失敗項目 / 実際に使われたフォルダ起動モード）をフロントに返し、トーストで表示

**Business Rules:**
- 1件の失敗は全体を中断しない。失敗は収集して最後にまとめて報告する
- URL の連続オープンには短い間隔（100ms 程度）を置く。ブラウザによっては高速な連続起動でタブ順が乱れる／一部が無視されるため
- `access_count` の更新は**開けたものだけ**を対象にする。存在しないパスを recency 上位に押し上げない
- グループが空のときカードは押せるが「このグループにはブックマークがありません」と返す
- 起動処理は Rust の非同期タスクで走らせ、アプリの UI スレッドをブロックしない

**Edge Cases:**
- 全メンバーが削除済み → 空グループと同じ扱い
- 同じ URL が2件ある → 重複排除しない（ユーザーが意図的に入れた可能性がある）
- グループが50件を超える → 確認ダイアログに件数を明示。上限は設けないが、既定閾値で必ず1回止まる
- 起動中に再度グループカードをクリック → 実行中は無効化し、二重起動を防ぐ

### Feature: ローカルフォルダを Explorer のタブに分けて開く

**Description:** ここが本機能で唯一、技術的に確実でない部分である。**Windows には File Explorer のタブを作る公開 API が存在しない**（Windows 11 22H2 でタブ UI は追加されたが、コマンドラインからも COM からもタブ指定で開く手段は提供されていない）。したがってタブ化は UI 操作の自動化として実装し、確実に動く個別ウィンドウ方式をフォールバックとして常に用意する。

**戦略（3段階）:**

| 段階 | 内容 | 確実性 |
|------|------|--------|
| 前提判定 | OS ビルドが Windows 11 22H2（build 22621）以降か、設定でタブ化が有効かを確認 | 確実 |
| タブ化 | 1件目を `open_path` で開き、その Explorer ウィンドウに対して以降のパスを `Ctrl+T` → `Ctrl+L` → パス入力 → `Enter` のキー入力で送る | **不確実** |
| フォールバック | 上記が前提を満たさない／途中で失敗した場合、残りを個別ウィンドウで開く | 確実 |

**実装上の要点:**
- 対象ウィンドウの特定は **`EnumWindows` でウィンドウクラス `CabinetWClass` を列挙し、1件目を開く前後の差分を取る**（実装時に当初案の `IShellWindows` から変更）。「今しがた現れたウィンドウ」を直接同定できるうえ、`IWebBrowser2` 経由でパスを突き合わせる必要がなく、「フォルダー ウィンドウを別のプロセスで開く」設定下でも列挙結果が変わらない
- キー送出は `SendInput`（`Win32_UI_Input_KeyboardAndMouse` フィーチャの追加が必要）。パス文字列は1文字ずつ `KEYEVENTF_UNICODE` で送る。クリップボード経由（`Ctrl+V`）はユーザーのクリップボードを破壊するため使わない。日本語を含むパスも IME を経由せずに入力できる
- `SetForegroundWindow` はフォアグラウンド権限を持つプロセスからしか成功しない。ユーザーのクリック起点で走るため本アプリはフォアグラウンドにあり、通常は成功する。失敗したらフォールバックへ
- 各ステップ間に待機（`Ctrl+T` 後 150ms、アドレスバー確定後 250ms 程度）が必要。したがってこの処理は**必ず専用スレッド**で実行し、UI をブロックしない
- タブ化が成功したかどうかを厳密に検証する手段はない。「`SendInput` が成功を返した」ところまでしか確認できないため、**ユーザーに「タブで開けました」と断言しない**。トーストは「Opened N folders」に留める

**Business Rules:**
- フォルダが1件だけのときはタブ化を試行しない（従来どおり `open_path`）
- タブ化の可否は起動のたびに判定する。設定のトグルが最優先で、OFF なら一切試行しない
- 既存の Explorer ウィンドウは再利用しない。グループ起動は常に新しいウィンドウを1つ開き、その中にタブを足す。ユーザーが別作業で開いていたウィンドウにタブを差し込むのは、意図しない副作用になる

**Edge Cases:**
- 「フォルダー ウィンドウを別のプロセスで開く」設定が有効 → `IShellWindows` の列挙結果が変わる可能性がある。列挙に失敗したらフォールバック
- ユーザーが処理中に別ウィンドウをクリックしてフォーカスを奪う → キー入力が別アプリに飛ぶ危険がある。各ステップの直前にフォアグラウンドウィンドウが目的の Explorer であることを確認し、違えば**即座に中断してフォールバック**（誤爆防止として必須）
- UNC パス・ネットワークドライブ → アドレスバー入力は同じく通る想定だが、応答が遅くタイムアウトしうる。失敗はフォールバックで吸収
- 存在しないパス → 事前に `Path::exists()` で除外し、タブ化の対象に入れない
- 将来の Windows 更新で Explorer の UI が変わる → タブ化が黙って壊れうる。設定 OFF で従来動作に戻せることを Settings のヘルプ文に明記する

---

## Technical Design

> このセクションは既存アーキテクチャとの接続点を示すもので、実装詳細の確定ではない。

### データモデル（`src-tauri/src/db.rs`）

```sql
CREATE TABLE IF NOT EXISTS bookmark_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  shortcut TEXT,
  open_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmark_group_items (
  group_id TEXT NOT NULL REFERENCES bookmark_groups(id) ON DELETE CASCADE,
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, bookmark_id)
);
```

- **テーブル名を `groups` にしない。** `GROUPS` は SQLite の予約語（ウィンドウ関数のフレーム指定）であり、クォートなしで書くと将来のパーサ変更で壊れうる
- `ON DELETE CASCADE` により「ブックマークを消すとグループから外れる」「グループを消してもブックマークは残る」が DB 側で保証される。`PRAGMA foreign_keys = ON` は既存スキーマで有効済み
- 既存 DB への追加は `CREATE TABLE IF NOT EXISTS` で足りる。`add_column_if_missing` を使うのは `user_settings` への2列のみ

### 設定（`user_settings` への追加列）

| 列 | 型 | 既定 | 意味 |
|----|----|------|------|
| `group_folder_open_mode` | TEXT | `'tabs'` | `'tabs'` / `'windows'`。フォルダのタブ化を試行するか |
| `group_open_confirm_threshold` | INTEGER | 10 | この件数を超えたら確認ダイアログ |

Settings ダイアログに露出するため、**`src/lib/settingsText.ts` の en / ja 両方にエントリが必要**（`satisfies Record<UiLang, unknown>` により、片方の記述漏れは型エラーになる）。

### Tauri コマンド（`src-tauri/src/commands.rs`）

| コマンド | 用途 |
|----------|------|
| `list_groups` | グループとメンバー ID を返す |
| `create_group` / `update_group` / `delete_group` | CRUD |
| `set_group_members` | メンバーの全置換。ドラッグでの順序変更に使う |
| `add_bookmarks_to_group` | 検索欄からのメンバー追加（重複はスキップ） |
| `remove_bookmark_from_group` | メンバー行の削除 |
| `reorder_groups` | グループカードの並び順 |
| `open_group` | 一括起動。結果レポートを返す |

Explorer タブ化のロジックは `commands.rs` に混ぜず、**`src-tauri/src/explorertabs.rs` として独立させる**。`shortcutdir.rs` が Windows 固有の COM 処理を1ファイルに閉じ込めているのと同じ方針。`#[cfg(windows)]` と非 Windows 用スタブを対にする。

### `tauriFetch` のルート（`src/lib/tauriFetch.ts`）

```
GET    /api/groups                 → list_groups
POST   /api/groups                 → create_group
PUT    /api/groups/:id             → update_group
DELETE /api/groups/:id             → delete_group
POST   /api/groups/reorder         → reorder_groups
PUT    /api/groups/:id/members     → set_group_members
POST   /api/groups/:id/members     → add_bookmarks_to_group
DELETE /api/groups/:id/members/:bid → remove_bookmark_from_group
POST   /api/groups/:id/open        → open_group
```

### フロントエンド

| ファイル | 役割 |
|----------|------|
| `src/types/group.ts` | `Group` / `GroupUI` と `convertToUI` / `convertToDB`（既存の snake_case ↔ camelCase 規約に従う） |
| `src/hooks/useBookmarkGroups.ts` | グループ CRUD・メンバー編集・起動。`src/hooks/index.ts` に追加 |
| `src/components/GroupsView.tsx` | Groups ビュー本体。カードの並びと空状態 |
| `src/components/GroupCard.tsx` | 1グループ。クリックで起動、メンバー一覧、追加用の検索欄、編集/削除 |
| `src/components/ViewSwitcher.tsx` | ヘッダーの Bookmarks / Groups 切替 |
| `src/app/page.tsx` | フックの合成と、アクティブビューによる出し分け |

**`BookmarkHeader.tsx` / `BookmarkCard.tsx` / `BookmarkForm.tsx` / `BookmarkList.tsx` は変更しない。** ビュー切替は `ViewSwitcher` をヘッダーの外側（`page.tsx`）に置いて実現し、既存ヘッダーの中身には手を入れない。これが守れているかを P3 の完了条件にする。

ビュー切替に Next.js のルートは切らない。Tauri の単一ウィンドウでルートを増やす利点がなく、`page.tsx` での条件レンダリングで足りる。アクティブビューの永続化は `ui_lang` と同じく localStorage（キー `active_view`）で行う。ユーザー設定というより UI の状態であり、DB に列を足す性質のものではない。

`src/lib/appCache.ts` のキャッシュ対象にグループを追加し、起動直後の描画でチップが後から降ってこないようにする。色は `src/lib/tagColors.ts` の8色パレットを共用する（新しいパレットを増やさない）。

### UI デザイン上の判断

`.claude/skills/ui-design-guidelines.md` に従う。特に:
- ビュー切替は選択中を `text-blue-500 font-medium` にする（`HelpDialog` / `SettingsDialog` の左ナビと同じ扱い）。ヘッダーのボタン群とは別の階層であることが分かる位置に置く
- グループカードは既存のブックマークカードと同じ `bg-card border shadow-sm rounded-xl`。**カード全体がクリック可能で起動する**ため、編集/削除ボタンはホバーで出す（`BookmarkCard` の既存パターンを踏襲）
- グループの色は `src/lib/tagColors.ts` の8色パレットを共用する（新しいパレットを増やさない）
- 起動中の状態表示は青で統一（`SavingOrderOverlay.tsx` の既存パターンを流用できる）
- Settings への追加項目は2ペイン構成のどのカテゴリに入れるかを決める（「Windows integration」相当が近い）

---

## Implementation Phases

| Phase | 内容 | 完了条件 |
|-------|------|----------|
| ✅ **P1: 土台** | スキーマ2テーブル、CRUD コマンド、`tauriFetch` ルート、`useBookmarkGroups` | グループを作成・編集・削除でき、再起動後も残る |
| ✅ **P2: 起動（確実な方）** | `open_group`（URL 順次 + フォルダは個別ウィンドウ）、確認ダイアログ、アクセス数更新 | グループ1クリックで全部開く。フォルダはウィンドウで開く |
| ✅ **P3: ビュー分離** | `ViewSwitcher`、`GroupsView`、`GroupCard`、アクティブビューの永続化 | Groups ビューで完結し、**Bookmarks ビューの差分がゼロ**である |
| ✅ **P4: Explorer タブ化** | `explorertabs.rs`、設定2列と Settings UI、フォールバック経路 | Win11 22H2+ でタブにまとまる。OFF / 非対応環境で P2 の挙動に戻る |
| ⬜ **P5: 仕上げ** | グループ内並び替え、グループカードの並び替え、ショートカット | Should Have を満たす。色は P3 で実装済み。バックエンド（`set_group_members` / `reorder_groups`）は用意済みで、残るのは dnd-kit の配線 |

P4 は単独で切り離せる設計にする。**P4 が期待どおり動かなくても P1〜P3 は完成した機能として成立する**ことが、この分割の目的である。

### 実装時の検証状況

| 対象 | 結果 |
|------|------|
| `npx tsc --noEmit` / `npm run lint` / `npm run build` | 通過 |
| `cargo check --target x86_64-pc-windows-gnu`（`cfg(windows)` を含む全体） | 通過 |
| `BookmarkCard` / `BookmarkForm` / `BookmarkList` の差分 | **ゼロ**（前提どおり） |
| `BookmarkHeader` の差分 | **13行**。`SettingsDialog` がこのコンポーネント内にあるため、グループ設定を渡すための props の受け渡しのみ。描画には一切変更なし |
| 実機での動作（Explorer タブ化を含む） | **未検証**。Windows 実機が必要 |

`BookmarkHeader` を完全なゼロ差分にするには `SettingsDialog` をこのコンポーネントの外に出すリファクタが要る。既存コードへの変更が増えるため、props の受け渡し13行の方を選んだ。

---

## Success Metrics

### Key Performance Indicators

| 指標 | 現状 | 目標 |
|------|------|------|
| 作業セット1つを開くのに要する操作回数 | 5〜8 クリック | **1 クリック** |
| 作業セット1つを開くのに要する時間 | 20〜40 秒 | 5 秒以内 |
| フォルダ3件を開いたときの Explorer ウィンドウ数 | 3 | **1**（タブ化有効時） |
| タブ化の成功率（Win11 22H2+、10回試行） | — | 9/10 以上。下回る場合は既定を `windows` に変更する |
| 開き忘れの発生 | 都度発生 | 0（セットが固定されるため構造的に発生しない） |

### Tracking Requirements

本アプリにテレメトリは存在せず、今後も導入しない。上記は `docs/testing/manual-test-checklist.md` に手動計測の手順として追記し、リリース前に実測する。DB 側では `bookmark_groups.open_count` / `last_opened_at` を記録するので、ユーザー自身が実際にどのグループを使っているかは Group Manager 上で確認できる。

---

## Constraints and Assumptions

### Constraints

- **Explorer のタブを作る公開 API は存在しない。** タブ化は UI 自動化であり、Windows の更新で予告なく壊れうる。この制約は回避不能であり、設計はこれを前提にする
- タブ化は Windows 11 22H2（build 22621）以降でのみ意味を持つ
- テストフレームワークが未整備で、`tauri-driver` も設定されていない。したがって検証は手動チェックリストに依存する
- MSIX（Store）ビルドでも同一コードが動く必要がある。`SendInput` はデスクトップブリッジで禁止 API ではないが、**Windows App Certification Kit を P4 の完了条件として通す**
- ブラウザ側のタブ配置は制御できない。「既定ブラウザに順番に URL を渡す」以上のことはしない

### Assumptions

- ユーザーは Windows 11 デスクトップを主環境とする（既存の Windows 固有機能群と同じ前提）
- 1グループのメンバー数は通常 3〜10 件。数百件は想定しない
- タグ（分類）とグループ（作業セット）は別概念として並存させたい、というのが利用者の意図である
- グループ起動はユーザーのクリック起点で走るため、本アプリはフォアグラウンドにある

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Explorer タブ化が公開 API 不在のため安定しない | High | **High** | 個別ウィンドウ方式を常に用意し、失敗時は自動フォールバック。設定で完全 OFF にできる。P4 を独立フェーズにし、失敗しても P1〜P3 は出荷可能 |
| キー入力が意図しないウィンドウに送られる | **Critical** | Medium | 各ステップ直前にフォアグラウンドウィンドウが目的の Explorer かを確認し、違えば即中断。クリップボードは使わない（`Ctrl+V` 経由にしない） |
| Windows 更新でタブ化が黙って壊れる | Medium | Medium | 「断言しない」トースト文言。Settings に OFF の導線と説明を置く。壊れても個別ウィンドウで開くだけで、機能全体は死なない |
| 起動処理が UI をブロックする | High | Medium | `open_group` を非同期タスク＋専用スレッドで実行。進行中オーバーレイを表示し、二重起動を無効化 |
| 大量 URL の一斉起動でブラウザが一部を無視する | Medium | Medium | 100ms 間隔で順次起動。既定10件で確認ダイアログを挟む |
| タグとグループの概念が利用者の中で混ざる | Medium | Low | ビューを分けたことで同じ画面に並ばない。Help ダイアログに「タグ=分類 / グループ=作業セット」の一節を en / ja 両方で追加 |
| `groups` を予約語のままテーブル名にして将来壊れる | Medium | Low | `bookmark_groups` / `bookmark_group_items` を採用（本 PRD で確定済み） |
| MSIX ビルドで `SendInput` が WACK に引っかかる | Medium | Low | P4 の完了条件に WACK 実行を含める。落ちた場合は MSIX ビルドのみ既定を `windows` にする |
| 一覧を見ている最中のグループ起動が2クリックになる（ビュー切替 + クリック） | Low | High | アクティブビューを永続化し、前回 Groups で終えていれば次回もそこに着地する。想定ワークフロー（アプリを開いて作業を立ち上げる）では実質1クリックを保つ |
| Bookmarks ビューを触らない前提が実装中に崩れる | Medium | Medium | P3 の完了条件を「`BookmarkHeader` / `BookmarkCard` / `BookmarkForm` / `BookmarkList` の差分がゼロ」と定義し、diff で機械的に確認する |
| `page.tsx` が肥大化する | Medium | Medium | 状態はフックに閉じ込め、`page.tsx` は合成のみ（既存方針の継続） |

## Open Questions

1. Groups ビューのカードは、メンバー一覧を常時展開するか折りたたむか。グループが10件を超えると縦に伸びすぎるが、`.claude/skills/ui-design-guidelines.md` は「トグルによる情報の出し入れ」を避ける方針。実装時に実データで判断する
2. Explorer タブ化の各ステップ待機時間の具体値。実機での計測が必要（現時点の 150ms / 250ms は仮）
3. グループ起動時、URL とフォルダのどちらを先に開くか。最後に開いたものが最前面に来るため、体験上の既定を決める必要がある。**フォルダを先、URL を後**を推奨（作業開始時に最初に見たいのはたいていブラウザ側のため）
