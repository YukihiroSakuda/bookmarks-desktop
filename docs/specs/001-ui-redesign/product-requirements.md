---
title: "Bookmarks - UI刷新 & 個人向けモダン化"
status: draft
version: "2.0"
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
- [x] No technical implementation details included
- [x] A new team member could understand this PRD

---

## Product Overview

### Vision

日常的に使うリンクやリファレンスを、直感的に整理・発見できるモダンな個人向けブックマーク管理ツール。

### Problem Statement

現行の BookmarkHub には以下の課題がある：

1. **UIが古く見える** — コンポーネントが素のTailwind CSSで構築されており、洗練されたUIライブラリを活用していない。日常的に使いたいと思えるデザインになっていない
2. **ダッシュボード機能がない** — よく使うブックマーク、最近追加されたもの、アクセス統計などを一覧できる画面がなく、情報へのアクセスが遅い
3. **操作効率が低い** — キーボードショートカット未対応、一括操作がない。大量のブックマークを管理する際の生産性が低下する
4. **ブックマーク追加が手間** — アプリ画面を開いて手動入力する必要があり、閲覧中のページをすぐに保存できない
5. **コードの保守性が低い** — page.tsxが約1400行で、状態管理・データフェッチ・UI描画が混在。新機能追加やバグ修正のコストが高い

### Value Proposition

- **モダンで統一されたUI** — shadcn/ui採用により、一貫性のある美しいデザインを少ない開発コストで実現
- **ダッシュボードで即座に情報アクセス** — よく使うリンク、最近のブックマーク、統計をひと目で把握
- **キーボード駆動の高速操作** — パワーユーザーが手を止めずに操作可能
- **ブラウザ拡張でワンクリック保存** — Chrome / Edge で閲覧中のページを即座にブックマーク
- **保守しやすいコードベース** — カスタムフック・状態管理ライブラリで責務を分離し、開発速度を維持

## User Personas

### Primary Persona: エンジニア（個人利用）
- **Demographics:** 25〜40歳、ソフトウェアエンジニア、技術リテラシー高
- **Goals:** 業務で頻繁にアクセスするツール・ドキュメント・リファレンスを素早く見つけたい。ブラウザのブックマークより整理しやすいツールが欲しい
- **Pain Points:** ブラウザのブックマークは端末間で同期しづらい。大量のブックマークから目的のものを探すのに時間がかかる。ブックマーク追加が面倒で結果的に整理されない

## User Journey Maps

### Primary Journey: 日常的なブックマーク利用

1. **Awareness:** 業務中にアクセスしたいURLがブラウザブックマークに見つからない。ブックマークが整理されておらず、目的のリンクを探すのに時間がかかる
2. **Consideration:** ブラウザブックマーク、Notion、Raindrop.ioと比較。専用ツールなら検索・タグ・ダッシュボードが一体化されていることに気づく
3. **Adoption:** ブラウザ拡張をインストール。既存データをマイグレーション。ダッシュボードでよく使うブックマークをピン留め
4. **Usage:** ブラウザ拡張でワンクリック保存。ダッシュボードからワンクリックでリンクにアクセス。Ctrl+Kで検索。タグで絞り込み
5. **Retention:** アクセス頻度の統計が見えることでツールの価値を実感。ブラウザ拡張の手軽さで継続利用

### Secondary Journey: 既存データの移行

1. **Awareness:** BookmarkHubに蓄積したブックマークを新アプリでも使いたい
2. **Adoption:** マイグレーション機能を使い、既存Supabaseデータを新環境にインポート
3. **Usage:** 移行後、タグやピン留め状態がそのまま引き継がれていることを確認
4. **Retention:** データを失わずにシームレスに移行できたことで安心して新アプリに定着

## Feature Requirements

### Must Have Features

#### Feature 1: モダンUIコンポーネントへの刷新
- **User Story:** ユーザーとして、洗練されたUIで快適にブックマーク管理したい。そうすれば、日常的にツールを使い続けるモチベーションが維持できる
- **Acceptance Criteria:**
  - [ ] Given ユーザーがアプリにアクセスした, When ページが表示される, Then すべてのボタン・入力・モーダルがshadcn/uiコンポーネントで描画されている
  - [ ] Given ユーザーがダークモードを選択した, When テーマが切り替わる, Then すべてのコンポーネントが一貫したダークテーマで表示される
  - [ ] Given モバイルデバイスでアクセスした, When 画面幅が768px未満, Then レイアウトがモバイル向けに適切にリフローする

#### Feature 2: ダッシュボード画面
- **User Story:** ユーザーとして、ログイン直後によく使うブックマークや最新の追加を一覧したい。そうすれば、目的のリンクに最速でアクセスできる
- **Acceptance Criteria:**
  - [ ] Given ユーザーがログインした, When ダッシュボードが表示される, Then 「ピン留めブックマーク」「最近追加」「アクセス頻度Top」の3セクションが表示される
  - [ ] Given ダッシュボードが表示されている, When ブックマークカードをクリックする, Then 新しいタブでURLが開き、アクセスカウントが1増加する
  - [ ] Given ダッシュボードが表示されている, When 「すべて表示」をクリックする, Then ブックマーク一覧画面に遷移し、該当フィルタが適用されている

#### Feature 3: キーボードショートカット & 一括操作
- **User Story:** パワーユーザーとして、マウスを使わずにブックマークを追加・検索・管理したい。そうすれば、作業の流れを止めずに操作できる
- **Acceptance Criteria:**
  - [ ] Given ブックマーク一覧が表示されている, When Ctrl+Kを押す, Then 検索ダイアログが開き、入力フォーカスが当たる
  - [ ] Given ブックマーク一覧が表示されている, When Ctrl+Nを押す, Then 新規追加フォームがモーダルで開く
  - [ ] Given 複数のブックマークをチェックボックスで選択した, When 一括削除ボタンをクリックする, Then 確認ダイアログが表示され、OKで選択したブックマークがすべて削除される
  - [ ] Given 複数のブックマークを選択した, When 一括タグ追加を実行する, Then 選択したすべてのブックマークに指定タグが追加される

#### Feature 4: ブラウザ拡張（Chrome / Edge対応）
- **User Story:** ユーザーとして、閲覧中のWebページをワンクリックでBookmarksに保存したい。そうすれば、わざわざアプリ画面を開かなくてもブックマークを追加できる
- **Acceptance Criteria:**
  - [ ] Given ブラウザ拡張がインストールされている, When ツールバーのアイコンをクリックする, Then 現在のページのURLとタイトルが自動入力されたポップアップが表示される
  - [ ] Given ポップアップが表示されている, When タグを選択して保存ボタンを押す, Then ブックマークがSupabaseに保存され、成功通知が表示される
  - [ ] Given ポップアップが表示されている, When 既に同じURLが登録されている, Then 「登録済み」の表示がされ、重複保存されない
  - [ ] Given Chrome / Edge で拡張をインストールした, When 拡張が有効化される, Then どちらのブラウザでも同一の機能が利用できる（Manifest V3）

#### Feature 5: データマイグレーション
- **User Story:** 既存BookmarkHubユーザーとして、蓄積したブックマーク・タグ・設定を新アプリに引き継ぎたい。そうすれば、ゼロから登録し直す必要がない
- **Acceptance Criteria:**
  - [ ] Given 旧BookmarkHubのSupabaseにデータがある, When マイグレーション機能を実行する, Then ブックマーク・タグ・タグ紐づけ・ユーザー設定がすべて新環境にコピーされる
  - [ ] Given マイグレーション完了後, When ブックマーク一覧を開く, Then ピン留め状態、アクセスカウント、カスタム順序が元のまま維持されている
  - [ ] Given マイグレーション中にエラーが発生した, When 処理が中断される, Then エラー内容が表示され、部分的にインポートされたデータはロールバックされる

#### Feature 6: 機密メモ欄
- **User Story:** ユーザーとして、ブックマークごとにパスワードやログイン情報などの機密メモを保存したい。そうすれば、Webサービスの認証情報をブックマークと一緒に管理できる
- **Acceptance Criteria:**
  - [ ] Given ブックマーク編集画面を開いた, When メモ欄にテキストを入力して保存する, Then メモがブックマークに紐づいて保存される
  - [ ] Given メモが保存されたブックマークを表示した, When カード上のメモ欄を確認する, Then メモ内容はデフォルトでマスク表示（●●●●）されている
  - [ ] Given マスク表示されたメモがある, When 「表示」ボタンをクリックする, Then メモ内容が平文で表示される
  - [ ] Given メモ内容が表示されている, When 「コピー」ボタンをクリックする, Then メモ内容がクリップボードにコピーされ、成功通知が表示される
  - [ ] Given メモが保存されている, When データベース上の値を直接確認する, Then メモ内容はサーバーサイドで暗号化された状態で保存されている
  - [ ] Given 検索を実行した, When メモ欄の内容に一致するキーワードを入力する, Then メモ内容は検索対象に含まれない（機密保護のため）

#### Feature 7: コードベースのリファクタリング

- **User Story:** 開発者として、保守しやすいコード構造にしたい。そうすれば、新機能の追加やバグ修正を迅速に行える
- **Acceptance Criteria:**
  - [ ] Given page.tsxをリファクタリングした, When 各ファイルの行数を確認する, Then どのファイルも300行以下に分割されている
  - [ ] Given 状態管理をカスタムフックに分離した, When ブックマークのCRUD操作を行う, Then 既存の全機能が正常に動作する（リグレッションなし）
  - [ ] Given リファクタリング完了後, When ビルドを実行する, Then TypeScriptエラーとlintエラーがゼロである

### Should Have Features

#### Feature 8: 高度な検索・フィルタリング
- **User Story:** ユーザーとして、タイトルだけでなくURL・タグを横断検索したい
- **Acceptance Criteria:**
  - [ ] Given 検索ダイアログが開いている, When 検索語を入力する, Then タイトル・URL・タグ名にマッチするブックマークがリアルタイムで表示される
  - [ ] Given 検索結果が表示されている, When タグフィルタを追加する, Then 検索結果がさらに絞り込まれる

#### Feature 9: コレクション（個人用フォルダ）
- **User Story:** ユーザーとして、ブックマークをテーマ別にグループ化したい。そうすれば、目的に応じてブックマークを整理・閲覧できる
- **Acceptance Criteria:**
  - [ ] Given ユーザーが「コレクション作成」を実行した, When コレクション名を入力して保存する, Then サイドバーにコレクションが表示される
  - [ ] Given コレクションが存在する, When ブックマークをコレクションに追加する, Then そのコレクションを開いたとき対象ブックマークが表示される
  - [ ] Given コレクションを削除した, When 確認ダイアログでOKを押す, Then コレクションが削除され、中のブックマーク自体は削除されない

### Could Have Features

#### Feature 10: コレクションの公開リンク
- コレクションを外部に公開URLとして共有できる機能

### Won't Have (This Phase)

- **チーム共有機能** — 個人利用に集中する。チームコレクション、権限管理、招待機能は作らない
- **モバイルネイティブアプリ** — Webのレスポンシブ対応で十分とし、ネイティブアプリは作らない
- **全文検索（ページ内容の検索）** — ブックマークのメタ情報検索のみ対応。ページ本文のクロール・インデックスは行わない
- **OGP画像表示** — カード表示はファビコンのみ。OGP画像の取得・表示は行わない
- **コメント機能** — ブックマークの管理に集中し、コミュニケーション機能は見送る

## Detailed Feature Specifications

### Feature: 機密メモ欄

**Description:** ブックマークごとにパスワードやログイン情報などの機密テキストを保存できるメモ欄。機密情報を扱うため、保存時の暗号化・表示時のマスク・クリップボードコピーなど、セキュリティに配慮した設計が必要。

**User Flow:**
1. ユーザーがブックマーク追加/編集フォームを開く
2. 「メモ（機密）」欄にパスワードやログイン情報を入力
3. 保存ボタンをクリック → メモがサーバーサイドで暗号化されてDBに保存
4. ブックマーク一覧/詳細でメモは「●●●●」とマスク表示
5. 「表示」ボタンで平文表示 → 「コピー」ボタンでクリップボードにコピー

**Business Rules:**
- メモ内容はSupabaseのDB保存時にサーバーサイドで暗号化する（AES-256等）
- UI上ではデフォルトでマスク表示。明示的な操作でのみ平文表示
- 平文表示後、一定時間（30秒）経過で自動的にマスク表示に戻る
- クリップボードにコピーした内容は一定時間（60秒）後に自動クリア
- メモ内容は検索対象から除外する（機密情報がサジェストに表示されることを防止）
- ブックマークのHTML エクスポートにメモ内容は含めない
- RLSにより本人のメモのみアクセス可能

**Edge Cases:**
- メモが空の場合 → メモセクション自体を非表示にし、UIをクリーンに保つ
- 非常に長いメモ（1万文字超）→ 最大文字数を制限し、超過時にバリデーションエラー
- ブラウザ拡張からのメモ入力 → 拡張ポップアップにもメモ入力欄を設ける
- スクリーンショットやショルダーハッキング → マスク表示がデフォルトであること、自動再マスクで対策

### Feature: ブラウザ拡張（Chrome / Edge対応）

**Description:** Manifest V3ベースのブラウザ拡張。ツールバーのアイコンクリックでポップアップが開き、閲覧中ページのURL・タイトルを自動取得してBookmarksアプリに保存する。

**User Flow:**
1. ユーザーが閲覧中のWebページでツールバーの拡張アイコンをクリック
2. ポップアップにURL・タイトルが自動入力された状態で表示
3. 必要に応じてタグを選択・追加
4. 「保存」ボタンをクリック
5. Supabaseにブックマークが保存され、成功通知が表示
6. ポップアップが自動で閉じる

**Business Rules:**
- 拡張はSupabase Authのセッションを使い、未ログイン時は「ログインしてください」メッセージを表示
- 同一URLが既に登録されている場合は「登録済み」表示し、重複保存しない
- タグ一覧はSupabaseから取得し、既存タグの選択と新規タグの入力に対応
- Chrome Web Store と Edge Add-ons の両方にPublish可能（Manifest V3）

**Edge Cases:**
- ローカルファイル（file://）やchrome://ページ → 拡張APIの制限により保存不可。エラーメッセージ表示
- ネットワークオフライン → 保存失敗を通知し、リトライを促す
- セッション期限切れ → ポップアップ内でログインを促すリンクを表示

## Success Metrics

### Key Performance Indicators

- **Adoption:** マイグレーション完了後、1週間以内にダッシュボードを3回以上訪問
- **Engagement:** 週あたりのブックマークアクセス回数が20回以上。ブラウザ拡張経由の追加が全追加の50%以上
- **Quality:** ページ読み込み時間が2秒以内、エラー発生率が0.1%以下
- **Efficiency:** キーボードショートカット利用率が操作全体の30%以上

### Tracking Requirements

| Event | Properties | Purpose |
|-------|------------|---------|
| bookmark_created | user_id, source (manual/import/extension) | 追加経路の分析 |
| bookmark_accessed | user_id, bookmark_id, referrer (dashboard/list/search) | アクセスパターンの分析 |
| search_executed | user_id, query_length, result_count | 検索利用率と精度の分析 |
| shortcut_used | user_id, shortcut_key | ショートカット利用率 |
| bulk_action | user_id, action_type, item_count | 一括操作の利用パターン |
| extension_popup_opened | user_id, current_url | 拡張の利用頻度 |
| migration_completed | user_id, bookmark_count, tag_count | マイグレーション成功率 |

---

## Constraints and Assumptions

### Constraints
- **既存インフラ:** Supabaseを継続利用。データベース移行は行わない
- **ブラウザサポート:** Chrome / Edge の最新2バージョン（Manifest V3）
- **開発リソース:** 少人数（1〜2名）での開発を想定
- **OGP画像:** 取得しない。ファビコン（Google Favicon API）のみ

### Assumptions
- ユーザーはSupabase Authでログイン可能
- 旧BookmarkHubと新BookmarksのSupabaseスキーマは互換性がある（マイグレーションスクリプトで変換可能）
- ブラウザ拡張はChromiumベース（Chrome / Edge）のみ対応すれば十分

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| UI刷新でリグレッション発生 | High | Medium | リファクタリングを段階的に実施。各ステップでビルド・動作確認 |
| page.tsxリファクタリングで既存機能が壊れる | High | Medium | リファクタリング前に手動テストシナリオを整備。段階的に分割 |
| ブラウザ拡張のSupabase Auth連携が複雑 | Medium | Medium | Manifest V3のService Workerでセッション管理。公式ドキュメントに従う |
| マイグレーションでデータ欠損 | High | Low | ドライラン機能を実装。本実行前にデータ件数を検証 |
| 機密メモの漏洩（DB侵害・XSS等） | Critical | Low | サーバーサイド暗号化（AES-256）、RLS、CSP設定、クリップボード自動クリア、エクスポート除外 |
| 機密メモの暗号鍵管理 | High | Medium | 環境変数で鍵管理。Supabase Vault等のシークレット管理サービス活用を検討 |

## Open Questions

（すべて解決済み）

---

## Supporting Research

### Competitive Analysis

主要な競合サービスの比較：

| サービス | 強み | 弱み |
|----------|------|------|
| Raindrop.io | 豊富なビュー、ブラウザ拡張、2600+連携 | UIがやや古い、無料版の制限 |
| Toby | ビジュアルなタブ管理、ドラッグ&ドロップ | 有料プラン（$8/月）が必要 |
| Pinboard | ミニマル、全文検索、アーカイブ | UIが古い、モダンさに欠ける |
| Notion | 万能、柔軟なデータ構造 | ブックマーク専用ではない、動作が重い |

**差別化ポイント:** モダンなダッシュボードUI + キーボード駆動の高速操作 + ブラウザ拡張のワンクリック保存

### UI Design Trends

- **カード+リスト切り替え** — ほぼ全ての競合が採用。ファビコンを活用したビジュアル表示がトレンド
- **サイドバーナビゲーション** — コレクション・タグ一覧をサイドバーに配置するパターンが主流
- **ダークモード対応** — 必須要件。class-basedダークモードが定番
- **コマンドパレット（Ctrl+K）** — Notion、Linear等の影響でSaaSでは標準的なUXパターンに
