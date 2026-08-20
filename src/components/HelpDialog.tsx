"use client";

import { HelpCircle, Download, Loader2, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

// ---- helpers ----------------------------------------------------------------

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-5 mb-1.5 first:mt-0">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed mb-2">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-1 mb-3 ml-1">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-sm text-muted-foreground leading-relaxed flex gap-2">
      <span className="text-blue-500 mt-0.5 shrink-0">•</span>
      <span>{children}</span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-muted border border-border rounded align-middle">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            <Kbd>{k}</Kbd>
            {i < keys.length - 1 && <span className="text-xs text-muted-foreground">+</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

const EDGE_ADDON_URL =
  "https://microsoftedge.microsoft.com/addons/detail/bookmarks/jppmhgioeccjkicfjkddfofellogpjoa";
/**
 * Primary call to action for the recommended (store) install path. External
 * links go through the opener plugin — a plain <a> navigates the Tauri webview.
 */
function StoreButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1">
      <button
        type="button"
        onClick={() => {
          openUrl(href).catch((e) => console.error(e));
        }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <ExternalLink size={16} />
        {children}
      </button>
    </div>
  );
}

/** Secondary action — the manual ZIP install is a fallback, so keep it quiet. */
function DownloadExtensionButton({ label }: { label: string }) {
  const [saving, setSaving] = useState(false);

  const handleClick = async () => {
    setSaving(true);
    try {
      await invoke("save_extension_zip");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 mb-1">
      <button
        onClick={handleClick}
        disabled={saving}
        className="inline-flex items-center gap-2 px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-60 text-xs font-medium rounded-md transition-colors"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {label}
      </button>
    </div>
  );
}

// ---- section definitions ----------------------------------------------------

const SECTIONS_JA = [
  { id: "basic",     label: "基本操作" },
  { id: "search",    label: "検索" },
  { id: "tags",      label: "タグフィルター" },
  { id: "tagmgr",   label: "タグ管理" },
  { id: "tagrule",  label: "タグルール" },
  { id: "display",  label: "表示設定" },
  { id: "reorder",  label: "手動並び替え" },
  { id: "importex", label: "インポート / エクスポート" },
  { id: "explorer", label: "エクスプローラ連携" },
  { id: "memo",     label: "メモ" },
  { id: "shortcuts", label: "ショートカット" },
  { id: "theme",    label: "テーマ" },
  { id: "extension", label: "ブラウザ拡張機能" },
];

const SECTIONS_EN = [
  { id: "basic",     label: "Basics" },
  { id: "search",    label: "Search" },
  { id: "tags",      label: "Tag Filter" },
  { id: "tagmgr",   label: "Tag Manager" },
  { id: "tagrule",  label: "Tag Rules" },
  { id: "display",  label: "Display" },
  { id: "reorder",  label: "Reordering" },
  { id: "importex", label: "Import / Export" },
  { id: "explorer", label: "Explorer" },
  { id: "memo",     label: "Memo" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "theme",    label: "Theme" },
  { id: "extension", label: "Extension" },
];

// ---- content ----------------------------------------------------------------

function ContentJA({ registerRef }: { registerRef: (id: string) => (el: HTMLElement | null) => void }) {
  return (
    <>
      <section ref={registerRef("basic")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">基本操作</h2>
        <H3>ブックマークの追加</H3>
        <P>右上の <Strong>Add Bookmark</Strong> ボタンで追加フォームを開きます。</P>
        <Ul>
          <Li>URLを入力するとページタイトルが自動取得されます。</Li>
          <Li>タグとメモは任意で設定できます。</Li>
          <Li>保存後、タグルールが設定されている場合は自動的にタグが付与されます。</Li>
        </Ul>
        <H3>ブックマークを開く</H3>
        <P>各行のタイトルリンクをクリックすると、新しいタブでURLが開きます。アクセスするたびにアクセス回数が自動でカウントされます。</P>
        <H3>編集・削除</H3>
        <P>操作ボタンは各行の右端に表示されています。</P>
        <Ul>
          <Li><Strong>鉛筆アイコン</Strong> — 編集フォームを開きます。</Li>
          <Li><Strong>ゴミ箱アイコン</Strong> — 確認ダイアログ（Delete bookmark?）が表示され、Delete で削除します。</Li>
        </Ul>
        <H3>ピン留め</H3>
        <P>ピンアイコンをクリックするとブックマークが一覧の最上部に固定されます。ピン留めされたブックマークは <Strong>Pinned Bookmarks</Strong> セクションにまとめて表示されます。再度クリックで解除できます。ピン留め／解除するとカードがセクション間を移動し、移動先まで自動でスクロールするので、状態の変化を見失いません。</P>
        <H3>常駐（システムトレイ）</H3>
        <P>ウィンドウを閉じてもアプリは終了せず、システムトレイに常駐します。トレイアイコンをクリックするか、右クリックメニューの <Strong>Open Bookmarks</Strong> を選ぶとウィンドウが復元されます。完全に終了する場合はトレイメニューの <Strong>Quit</Strong> を選んでください。また、Windowsへのログイン時にもトレイに隠れた状態で自動的に起動します。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("search")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">検索</h2>
        <H3>キーワード検索</H3>
        <P>ヘッダーの検索バーにキーワードを入力すると、<Strong>タイトル・URL・メモ</Strong> を対象に絞り込まれます。</P>
        <H3>フォルダの中も検索</H3>
        <P><Strong>ブックマークしたフォルダの中にあるファイル名・フォルダ名</Strong> も検索対象になります。<Strong>2文字以上</Strong> 入力すると、一覧の下に「In your folders」として、どのブックマークの中で見つかったかごとにまとめて表示されます。</P>
        <Ul>
          <Li>クリックするとファイルは既定のアプリで、フォルダはエクスプローラで開きます。</Li>
          <Li>行にマウスを乗せると出るアイコンから、そのファイルが入っているフォルダを開けます。</Li>
          <Li>1つのフォルダで20件を超えて見つかったときは「Show N more」で残りを表示できます。</Li>
        </Ul>
        <P>検索するたびにフォルダを直接見に行くため、<Strong>結果は常に最新</Strong> です。ファイルの一覧を保存しておく仕組みではないので、バックアップにファイル名が含まれることもありません。</P>
        <P>速く安全に終わらせるため、次の範囲に限って探します。</P>
        <Ul>
          <Li>フォルダの <Strong>3階層下まで</Strong>（1つのフォルダにつき最大2万件まで）。多すぎて全部を見られなかった場合はその旨が表示されます。</Li>
          <Li><Strong>node_modules</Strong> や <Strong>.git</Strong> など、中身が膨大になりがちなフォルダは除外します。</Li>
          <Li>ドライブ直下（<Strong>C:</Strong> など）、ネットワークドライブ、リムーバブルドライブは対象外です。</Li>
        </Ul>
        <H3>キー入力で検索を開始</H3>
        <P>一覧のどこにフォーカスがあっても、文字キーを打ち始めるだけで検索バーにフォーカスが移り、その文字から入力が始まります。入力欄にフォーカスがあるときや、修飾キー（Ctrl / Alt / Shift / ⌘）付きの組み合わせを押したときは無効です（ブックマークのショートカットや編集キーを優先）。</P>
        <H3>検索履歴</H3>
        <Ul>
          <Li>ブックマークをクリックしたときの検索キーワードが履歴として保存されます。</Li>
          <Li>検索バーをクリックすると過去の検索候補が表示され、クリックで再利用できます。</Li>
          <Li>履歴が表示されている間は <Kbd>Alt</Kbd>+<Kbd>↓</Kbd> / <Kbd>Alt</Kbd>+<Kbd>↑</Kbd> で候補を選択し、<Kbd>Enter</Kbd> で確定できます（無印の <Kbd>↓</Kbd> はカードへの移動に使うため、履歴の選択には使いません）。</Li>
          <Li>履歴は個別に削除するか、「Clear all」で一括削除できます。</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("tags")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">タグフィルター</h2>
        <H3>タグで絞り込む</H3>
        <P>ヘッダー下部のタグ一覧からタグをクリックすると、そのタグを持つブックマークだけが表示されます。</P>
        <H3>複数タグの同時選択</H3>
        <P><Kbd>Ctrl</Kbd> + クリック（Macは <Kbd>⌘</Kbd> + クリック）で複数のタグを同時に選択できます。選択した<Strong>いずれか</Strong>のタグを持つブックマークが OR 絞り込みで表示されます。</P>
        <H3>フィルターの解除</H3>
        <Ul>
          <Li>個別タグ: 選択中のタグをもう一度クリックで解除。</Li>
          <Li>全解除: 「Clear all tags」ボタンをクリック。</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("tagmgr")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">タグ管理</h2>
        <H3>Tag Manager を開く</H3>
        <P>ヘッダーの <Strong>Tag Manager</Strong> ボタンから管理パネルを開きます。</P>
        <H3>操作一覧</H3>
        <Ul>
          <Li><Strong>タグの追加</Strong> — 新しいタグ名を入力して Enter または追加ボタンで作成。</Li>
          <Li><Strong>タグのリネーム</Strong> — タグ名をクリックして編集。変更は全ブックマークに即時反映されます。</Li>
          <Li><Strong>タグの削除</Strong> — タグを削除すると、そのタグが付いた全ブックマークから除去されます。タグに紐づくタグルールも合わせて削除するか選択できます。</Li>
          <Li><Strong>タグの色</Strong> — タグ名の左の丸をクリックして8色から選択。色を付けたタグは、フィルターバーでもカードの上でもその色で表示されます。色なしのタグは従来どおりの表示です。</Li>
          <Li><Strong>タグの並び替え</Strong> — 左のグリップをドラッグして並び順を変更。フィルターバーのタグもこの順序で並びます（並び替えていないタグは名前順）。</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("tagrule")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">タグルール（自動タグ付け）</h2>
        <H3>概要</H3>
        <P>URLやタイトルに含まれるキーワードに基づいてタグを<Strong>自動付与</Strong>するルールを設定できます。ヘッダーの <Strong>Tag Rule</Strong> ボタンから管理します。</P>
        <H3>ルールの設定項目</H3>
        <Ul>
          <Li><Strong>対象フィールド</Strong> — URL またはタイトルのどちらを対象にするか選択。</Li>
          <Li><Strong>マッチ条件</Strong> — 「含む」「先頭一致」「後方一致」から選択。</Li>
          <Li><Strong>パターン</Strong> — マッチさせるキーワードを入力。</Li>
          <Li><Strong>付与するタグ</Strong> — 条件に一致したときに付与するタグを選択。</Li>
        </Ul>
        <H3>適用タイミング</H3>
        <Ul>
          <Li>ルール保存時: 既存の全ブックマークに即時適用されます。</Li>
          <Li>ブックマーク追加・編集時: 保存のタイミングで自動適用されます。</Li>
        </Ul>
        <H3>ルールの削除</H3>
        <P>ルールを削除するとき、そのルールで付与したタグをブックマークから一括削除するかどうか選択できます。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("display")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">表示設定</h2>
        <H3>カラム数の変更</H3>
        <P>ヘッダー右上の歯車（<Strong>Settings</Strong>）アイコンを開き、<Strong>Display Columns</Strong> で 1〜4列のレイアウトを切り替えられます。設定は自動保存され、次回起動時も保持されます。</P>
        <H3>ソート</H3>
        <P>ソートコントロールから並び順を変更できます。</P>
        <Ul>
          <Li><Strong>Created Date</Strong> — ブックマークを追加した順。</Li>
          <Li><Strong>Title</Strong> — タイトルのアルファベット・あいうえお順。</Li>
          <Li><Strong>Access Count</Strong> — よく開くブックマークを上位に表示。</Li>
          <Li><Strong>Custom</Strong> — 手動並び替えで設定した順序（後述）。</Li>
        </Ul>
        <P>各ソートキーに対して <Strong>昇順 / 降順</Strong> を切り替えられます。設定は保存されます。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("reorder")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">手動並び替え</h2>
        <H3>並び替えモードの切替</H3>
        <P>ソートコントロールの <Strong>Custom</Strong> を選択し、<Strong>Edit</Strong> スイッチをオンにするとモードに切り替わります。モード中は検索バーとフィルターが無効になります。</P>
        <H3>順序の変更</H3>
        <P>各行をドラッグ＆ドロップして自由に並び替えます。ピン留めブックマークとそれ以外は別々のグループとして並び替えできます。</P>
        <H3>保存</H3>
        <P><Strong>Edit</Strong> スイッチをオフにすると順序が自動保存されます。保存中はオーバーレイが表示されます。並び替えた順序を表示するにはソートを <Strong>Custom</Strong> に設定してください。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("importex")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">インポート / エクスポート</h2>
        <P>インポート・エクスポートはヘッダー右上の歯車（<Strong>Settings</Strong>）アイコンを開き、<Strong>Data</Strong> セクションのボタンから実行します。ブラウザと互換性のある <Strong>HTML</Strong> 形式と、すべての情報を保持する <Strong>JSON</Strong> 形式の2種類があります。</P>
        <H3>インポート（Import）</H3>
        <P>ブラウザからエクスポートしたHTMLファイルを取り込みます。</P>
        <Ul>
          <Li>Chrome / Edge / Firefox のブックマークエクスポート形式（Netscape HTML）に対応。</Li>
          <Li>タイトル・URL・追加日時が取り込まれます。</Li>
          <Li>既存と同じURLはスキップされます。</Li>
        </Ul>
        <H3>エクスポート（Export）</H3>
        <P>現在のブックマーク一覧をNetscape Bookmark Format（HTML）でダウンロードします。</P>
        <Ul>
          <Li>エクスポートされたHTMLはブラウザのブックマーク管理からインポートできます。</Li>
          <Li>メモ・タグ・ショートカットはエクスポートされません。</Li>
        </Ul>
        <H3>バックアップ（Backup） / 復元（Restore） — JSON</H3>
        <P>HTML形式では失われる情報も含め、アプリのすべてのデータを <Strong>JSON</Strong> ファイルで保存・復元できます。PCの移行や定期バックアップに適しています。</P>
        <Ul>
          <Li><Strong>Backup</Strong> — ブックマーク（タグ・メモ・ショートカット・並び順を含む）、タグ、タグルール、設定をまとめてJSONファイルに書き出します。</Li>
          <Li><Strong>Restore</Strong> — JSONバックアップファイルを選択して取り込みます。<Strong>現在のすべてのデータが置き換えられます</Strong>（この操作は取り消せません）。実行前に確認ダイアログが表示されます。</Li>
        </Ul>
        <H3>データの保存先</H3>
        <P>データはすべてこのPC内に保存され、外部サーバーには一切送信されません。</P>
        <Ul>
          <Li><Strong>データベース</Strong>（ブックマーク・タグ・タグルール・設定） — <Strong>%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db</Strong></Li>
          <Li><Strong>テーマ・検索履歴・一覧キャッシュ</Strong> — <Strong>%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\EBWebView\</Strong>（WebView2のプロファイル）</Li>
          <Li><Strong>ログ</Strong> — <Strong>%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\logs\</Strong></Li>
        </Ul>
        <P><Strong>Microsoft Store 版とインストーラー版（.exe / .msi）は同じフォルダを使います</Strong>ので、どちらに入れ替えてもブックマークはそのまま引き継がれます。アンインストールしてもこれらのフォルダは残るため、完全に消したい場合は手動で削除してください。別のPCへ移す場合は上の <Strong>Backup</Strong> でJSONを書き出し、移行先で <Strong>Restore</Strong> してください。</P>
        <H3>全件削除（Delete All）</H3>
        <P>同じ <Strong>Settings</Strong> ダイアログの <Strong>Danger Zone</Strong> から、すべてのブックマークとタグを完全に削除できます。誤操作を防ぐため、確認入力欄に <Strong>delete all</Strong> と入力した上で確認すると実行されます。この操作は取り消せません。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("explorer")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">エクスプローラ連携</h2>
        <H3>概要</H3>
        <P>Windowsエクスプローラから直接ファイルやフォルダをブックマークに登録できます。</P>
        <H3>方法1: 右クリックメニュー</H3>
        <P>アプリ起動時にレジストリへ自動登録されます。</P>
        <Ul>
          <Li>エクスプローラでファイルまたはフォルダを右クリック。</Li>
          <Li><Strong>Add to Bookmarks</Strong> を選択。</Li>
          <Li>アプリが起動済みの場合は既存ウィンドウにフォームが開き、未起動の場合は起動後に自動でフォームが開きます。</Li>
        </Ul>
        <H3>方法2: ドラッグ＆ドロップ</H3>
        <Ul>
          <Li>アプリウィンドウが開いている状態で、エクスプローラからファイルまたはフォルダをアプリ画面上にドロップ。</Li>
          <Li>パスとファイル名（タイトル）が自動入力された状態で追加フォームが開きます。</Li>
        </Ul>
        <H3>共通の動作</H3>
        <P>どちらの方法でも登録フォームはパスとタイトル（ファイル・フォルダ名）が自動入力されます。必要に応じてタグやメモを追加してから <Strong>Add Bookmark</Strong> を押してください。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("memo")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">メモ</h2>
        <H3>概要</H3>
        <P>各ブックマークにメモを添付できます。メモはローカルのデータベースにのみ保存され、外部に送信されることはありません。メモ内のテキストは検索バーの絞り込み対象にも含まれます。</P>
        <H3>制限事項</H3>
        <Ul>
          <Li>最大 <Strong>10,000文字</Strong> まで入力可能。</Li>
          <Li>エクスポート時には含まれません。</Li>
        </Ul>
        <H3>表示</H3>
        <P>メモが設定されているブックマークの行にはメモアイコン付き「Memo」バッジが表示されます。バッジにホバーするとメモの内容がツールチップで確認でき、クリックするとクリップボードにコピーされます。編集フォームからいつでも変更・削除できます。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("shortcuts")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">ショートカット</h2>
        <div className="rounded-lg border overflow-hidden mb-3">
          <ShortcutRow keys={["文字キー"]} label="検索バーにフォーカスして入力開始" />
          <ShortcutRow keys={["Tab"]} label="次のブックマークカードへフォーカス移動" />
          <ShortcutRow keys={["Shift", "Tab"]} label="前のブックマークカードへフォーカス移動" />
          <ShortcutRow keys={["Esc"]} label="モーダルを閉じる / 操作をキャンセル" />
          <ShortcutRow keys={["Ctrl", "Alt", "Space"]} label="アプリを前面に表示（グローバル、初期値）" />
        </div>
        <P>前面表示ショートカットはシステム全体に登録される唯一のグローバルショートカットです。<Strong>設定</Strong>ダイアログの <Strong>Bring App to Front</Strong> 欄から変更できます。他アプリと衝突しにくい <Strong>Ctrl+Alt</Strong> または <Strong>Ctrl+Shift</Strong> の組み合わせを推奨します。</P>
        <H3>矢印キーでのカード移動</H3>
        <P>カードにフォーカスがある状態で矢印キーを押すと、別のカードへフォーカスを移動できます。</P>
        <Ul>
          <Li><Strong>←→</Strong> — Tabキーと同じ表示順で前後のカードに移動します。</Li>
          <Li><Strong>↑↓</Strong> — 列の位置がなるべく揃った直近の行のカードに移動します。列数の変更やピン留め／未ピン留めの区切りをまたいでも正しく動作します。</Li>
          <Li><Strong>Home / End</Strong> — 一覧の先頭／最後尾のカードに直接移動します。</Li>
          <Li>入力欄にフォーカスがある間やダイアログ表示中は無効です（入力欄では本来のカーソル移動として動作します）。</Li>
        </Ul>
        <H3>ブックマークごとのショートカット（アプリ内）</H3>
        <P>各ブックマークにキーを割り当てると、<Strong>アプリが表示されている間</Strong>にそのキーでページ／フォルダを開けます。割り当てたキーはカード右側に常時バッジ表示されます。</P>
        <Ul>
          <Li>追加／編集フォームの <Strong>Shortcut</Strong> 欄をクリックし、使いたいキーの組み合わせを押します。</Li>
          <Li><Strong>修飾キー（Ctrl / Alt / Shift）が最低1つ必要</Strong>です。メインキーは英字・数字・ファンクションキー（F1〜F12）に対応します。</Li>
          <Li>キー入力待ちの状態で <Kbd>Esc</Kbd> を押すとキャプチャを取り消します（既存の割り当ては変わりません）。<Strong>X</Strong> ボタンを押すと割り当てを解除します。</Li>
          <Li>検索バーなど入力欄にフォーカスがある間は無効です（コピー等の編集キーを優先）。</Li>
          <Li><Strong>重複不可</Strong> — 同じ組み合わせを複数のブックマークには割り当てられません（フォームで警告し保存をブロックします）。</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("theme")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">テーマ</h2>
        <H3>切り替え方法</H3>
        <P>ヘッダー右上の歯車（<Strong>Settings</Strong>）アイコンを開き、<Strong>Theme</Strong> から切り替えます。</P>
        <H3>選択肢</H3>
        <Ul>
          <Li><Strong>Light</Strong> — 常にライトモード。</Li>
          <Li><Strong>System</Strong> — OSのテーマ設定に自動追従（デフォルト）。</Li>
          <Li><Strong>Dark</Strong> — 常にダークモード。</Li>
        </Ul>
        <P>設定は <Strong>localStorage</Strong> に保存され、次回起動時も保持されます。</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("extension")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">ブラウザ拡張機能</h2>
        <H3>概要</H3>
        <P>閲覧中のページをワンクリックでブックマークに追加できる Chrome / Edge 拡張機能です。URL とタイトルはアクティブタブから自動入力され、タグやメモも拡張ポップアップ内で設定できます。</P>
        <H3>動作条件</H3>
        <Ul>
          <Li>Chrome または Edge（Manifest V3 対応）。</Li>
          <Li>アプリが起動していること。</Li>
        </Ul>
        <H3>インストール（推奨）— Edge アドオンストア</H3>
        <P>Microsoft Edge をお使いの場合は、ストアからそのままインストールできます。デベロッパーモードは不要で、更新も自動です。下のボタンでストアのページを開き、<Strong>入手</Strong> をクリックしてください。</P>
        <StoreButton href={EDGE_ADDON_URL}>Edge アドオンストアで開く</StoreButton>
        <H3>インストール（Chrome など）— ZIPを読み込む</H3>
        <P>ストアに未対応のブラウザでは、ZIPを手動で読み込みます。</P>
        <Ul>
          <Li>このセクション末尾のボタンからZIPファイルをダウンロードして解凍する。</Li>
          <Li>Chrome は <Strong>chrome://extensions</Strong>、Edge は <Strong>edge://extensions</Strong> をアドレスバーに入力して開く。</Li>
          <Li>右上の <Strong>デベロッパーモード</Strong> をオンにする。</Li>
          <Li><Strong>パッケージ化されていない拡張機能を読み込む</Strong> をクリックし、解凍したフォルダを選択する。</Li>
        </Ul>
        <H3>起動時の案内について（ZIPで読み込んだ場合）</H3>
        <P>この拡張機能はデベロッパーモードで未パッケージのまま読み込まれているため、Chrome / Edge の起動時に確認メッセージが表示されることがあります。継続利用する場合は、この拡張機能を有効のまま使用してください。拡張機能が無効になった場合や反応しない場合は <Strong>chrome://extensions</Strong> または <Strong>edge://extensions</Strong> を開き、再度有効化して必要に応じて <Strong>再読み込み</Strong> してください。</P>
        <H3>使い方</H3>
        <Ul>
          <Li>保存したいページでツールバーの拡張機能アイコンをクリック。</Li>
          <Li>URL とタイトルを確認し、必要に応じてタグやメモを入力する。</Li>
          <Li>既に保存済みのURLは重複として検知される。</Li>
          <Li><Strong>Shortcut</Strong> 欄でブックマークにショートカットキーを割り当てることができる（アプリ内での動作と同じ）。</Li>
          <Li><Strong>Add Bookmark</Strong> を押すと、そのまま拡張内から保存できる。</Li>
        </Ul>
        <DownloadExtensionButton label="ZIPをダウンロード（手動インストール用）" />
      </section>
    </>
  );
}

function ContentEN({ registerRef }: { registerRef: (id: string) => (el: HTMLElement | null) => void }) {
  return (
    <>
      <section ref={registerRef("basic")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Basics</h2>
        <H3>Adding a Bookmark</H3>
        <P>Click the <Strong>Add Bookmark</Strong> button in the top-right to open the form.</P>
        <Ul>
          <Li>The page title is automatically fetched when you enter a URL.</Li>
          <Li>Tags and memos are optional.</Li>
          <Li>After saving, tag rules are automatically applied if configured.</Li>
        </Ul>
        <H3>Opening a Bookmark</H3>
        <P>Click the title link in each row to open the URL in a new tab. The access count is automatically incremented each time.</P>
        <H3>Editing / Deleting</H3>
        <P>Action buttons appear at the right end of each row.</P>
        <Ul>
          <Li><Strong>Pencil icon</Strong> — opens the edit form.</Li>
          <Li><Strong>Trash icon</Strong> — shows a confirmation dialog; click Delete to remove.</Li>
        </Ul>
        <H3>Pinning</H3>
        <P>Click the pin icon to fix a bookmark at the top of the list. Pinned bookmarks are grouped under the <Strong>Pinned Bookmarks</Strong> section. Click again to unpin. Pinning or unpinning moves the card between sections and scrolls it into view, so the change is easy to follow.</P>
        <H3>Tray &amp; Startup</H3>
        <P>Closing the window doesn&apos;t quit the app — it keeps running in the system tray. Click the tray icon, or choose <Strong>Open Bookmarks</Strong> from its right-click menu, to bring the window back. Choose <Strong>Quit</Strong> from the tray menu to exit completely. The app also launches automatically (hidden in the tray) when you log in to Windows.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("search")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Search</h2>
        <H3>Keyword Search</H3>
        <P>Type in the search bar to filter bookmarks by <Strong>title, URL, and memo</Strong>.</P>
        <H3>Search Inside Folders</H3>
        <P>Search also reaches <Strong>the file and folder names inside the folders you have bookmarked</Strong>. Type <Strong>two or more characters</Strong> and any matches appear below your bookmarks under &ldquo;In your folders&rdquo;, grouped by the bookmark they came from.</P>
        <Ul>
          <Li>Click a result to open the file in its default app, or the folder in File Explorer.</Li>
          <Li>Hover a row to reveal an icon that opens the folder containing that file.</Li>
          <Li>When one folder holds more than 20 matches, &ldquo;Show N more&rdquo; reveals the rest.</Li>
        </Ul>
        <P>Each search looks in the folders directly rather than consulting a stored list, so <Strong>results are never out of date</Strong> — and no file names are written to your backup.</P>
        <P>To keep it quick, the search is limited to the following.</P>
        <Ul>
          <Li><Strong>Three levels deep</Strong>, and at most 20,000 entries per folder. If a folder was too large to search fully, the app says so.</Li>
          <Li>Folders that tend to hold enormous numbers of files — <Strong>node_modules</Strong>, <Strong>.git</Strong> and the like — are skipped.</Li>
          <Li>Whole drives (<Strong>C:</Strong> for example), network drives and removable drives are not searched.</Li>
        </Ul>
        <H3>Type to Search</H3>
        <P>Wherever focus is in the list, just start typing — the search bar takes focus and your keystroke goes into it. This is disabled while a text field is focused, or when you press a modifier combo (Ctrl / Alt / Shift / ⌘), so bookmark shortcuts and editing keys keep working.</P>
        <H3>Search History</H3>
        <Ul>
          <Li>Keywords are saved when you click a bookmark while searching.</Li>
          <Li>Click the search bar to see past searches; click any entry to reuse it.</Li>
          <Li>While the history list is showing, use <Kbd>Alt</Kbd>+<Kbd>↓</Kbd> / <Kbd>Alt</Kbd>+<Kbd>↑</Kbd> to highlight an entry and <Kbd>Enter</Kbd> to select it (plain <Kbd>↓</Kbd> is reserved for card navigation, so it&apos;s not used for history selection).</Li>
          <Li>Delete entries individually or use &ldquo;Clear all&rdquo; to wipe history.</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("tags")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Tag Filter</h2>
        <H3>Filter by Tag</H3>
        <P>Click a tag from the list below the header to show only bookmarks with that tag.</P>
        <H3>Multi-Tag Selection</H3>
        <P><Kbd>Ctrl</Kbd>+click (or <Kbd>⌘</Kbd>+click on Mac) to select multiple tags at once. Bookmarks matching <Strong>any</Strong> of the selected tags are shown (OR filter).</P>
        <H3>Clearing Filters</H3>
        <Ul>
          <Li>Individual tag: click the selected tag again to deselect.</Li>
          <Li>Clear all: click the &ldquo;Clear all tags&rdquo; button.</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("tagmgr")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Tag Manager</h2>
        <H3>Open Tag Manager</H3>
        <P>Click the <Strong>Tag Manager</Strong> button in the header to open the management panel.</P>
        <H3>Actions</H3>
        <Ul>
          <Li><Strong>Add tag</Strong> — type a name and press Enter or click the Add button.</Li>
          <Li><Strong>Rename tag</Strong> — click the edit icon to rename. Changes apply to all bookmarks immediately.</Li>
          <Li><Strong>Delete tag</Strong> — removes the tag from all associated bookmarks. You can choose to also delete any related tag rules.</Li>
          <Li><Strong>Tag color</Strong> — click the circle next to a tag to pick one of eight colors. Colored tags keep that color in the filter bar and on bookmark cards; tags without a color look exactly as before.</Li>
          <Li><Strong>Reorder tags</Strong> — drag the grip on the left to change the order. The filter bar follows the same order (tags never reordered stay alphabetical).</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("tagrule")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Tag Rules (Auto-tagging)</h2>
        <H3>Overview</H3>
        <P>Set rules to <Strong>automatically assign tags</Strong> based on keywords in URLs or titles. Manage via the <Strong>Tag Rule</Strong> button in the header.</P>
        <H3>Rule Settings</H3>
        <Ul>
          <Li><Strong>Target field</Strong> — choose URL or Title.</Li>
          <Li><Strong>Match type</Strong> — &ldquo;contains&rdquo;, &ldquo;starts with&rdquo;, or &ldquo;ends with&rdquo;.</Li>
          <Li><Strong>Pattern</Strong> — the keyword to match against.</Li>
          <Li><Strong>Tag</Strong> — the tag to assign when the rule matches.</Li>
        </Ul>
        <H3>When Rules Are Applied</H3>
        <Ul>
          <Li>On rule save: immediately applied to all existing bookmarks.</Li>
          <Li>On bookmark add/edit: automatically applied when saving.</Li>
        </Ul>
        <H3>Deleting Rules</H3>
        <P>When deleting a rule, you can choose to bulk-remove the tags that were added by that rule from all bookmarks.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("display")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Display Settings</h2>
        <H3>Column Layout</H3>
        <P>Open the gear (<Strong>Settings</Strong>) icon in the header and use <Strong>Display Columns</Strong> to switch between 1–4 column layouts. Settings are saved automatically.</P>
        <H3>Sort</H3>
        <P>Change the sort order from the sort controls.</P>
        <Ul>
          <Li><Strong>Created Date</Strong> — sorted by when the bookmark was added.</Li>
          <Li><Strong>Title</Strong> — alphabetical order.</Li>
          <Li><Strong>Access Count</Strong> — most visited bookmarks first.</Li>
          <Li><Strong>Custom</Strong> — manual order set via drag &amp; drop (see below).</Li>
        </Ul>
        <P>Each sort key supports <Strong>ascending / descending</Strong> order. Settings are saved.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("reorder")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Manual Reordering</h2>
        <H3>Toggle Reorder Mode</H3>
        <P>Select <Strong>Custom</Strong> in the sort controls, then turn on the <Strong>Edit</Strong> switch. Search and filters are disabled during reorder mode.</P>
        <H3>Reordering</H3>
        <P>Drag and drop rows to rearrange freely. Pinned and unpinned bookmarks are reordered in separate groups.</P>
        <H3>Saving</H3>
        <P>Turn off the <Strong>Edit</Strong> switch to auto-save the order. An overlay is shown while saving. Set sort to <Strong>Custom</Strong> to view your custom order.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("importex")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Import / Export</h2>
        <P>Import and export are available from the gear (<Strong>Settings</Strong>) icon in the header, under the <Strong>Data</Strong> section. There are two formats: browser-compatible <Strong>HTML</Strong>, and <Strong>JSON</Strong> which preserves everything.</P>
        <H3>Import</H3>
        <P>Import bookmarks from a browser-exported HTML file.</P>
        <Ul>
          <Li>Supports Netscape HTML format from Chrome, Edge, and Firefox.</Li>
          <Li>Title, URL, and date added are imported.</Li>
          <Li>Duplicate URLs are skipped.</Li>
        </Ul>
        <H3>Export</H3>
        <P>Download your bookmarks as a Netscape Bookmark Format (HTML) file.</P>
        <Ul>
          <Li>The exported HTML can be imported into your browser&apos;s bookmark manager.</Li>
          <Li>Memos, tags, and shortcuts are not included in exports.</Li>
        </Ul>
        <H3>Backup / Restore — JSON</H3>
        <P>Save and restore <Strong>all</Strong> app data as a <Strong>JSON</Strong> file, including information that HTML drops. Ideal for migrating to a new PC or keeping periodic backups.</P>
        <Ul>
          <Li><Strong>Backup</Strong> — writes bookmarks (including tags, memos, shortcuts, and order), tags, tag rules, and settings to a single JSON file.</Li>
          <Li><Strong>Restore</Strong> — pick a JSON backup file to import. This <Strong>replaces all current data</Strong> (cannot be undone). A confirmation dialog is shown first.</Li>
        </Ul>
        <H3>Where Your Data Is Stored</H3>
        <P>Everything is kept on this PC and is never sent to an external server.</P>
        <Ul>
          <Li><Strong>Database</Strong> (bookmarks, tags, tag rules, settings) — <Strong>%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db</Strong></Li>
          <Li><Strong>Theme, search history, list cache</Strong> — <Strong>%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\EBWebView\</Strong> (WebView2 profile)</Li>
          <Li><Strong>Logs</Strong> — <Strong>%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\logs\</Strong></Li>
        </Ul>
        <P><Strong>The Microsoft Store build and the installer build (.exe / .msi) use these same folders</Strong>, so your bookmarks carry over when you switch between them. Uninstalling does not delete these folders — remove them manually to erase everything. To move to another PC, use <Strong>Backup</Strong> above to write a JSON file and <Strong>Restore</Strong> it there.</P>
        <H3>Delete All</H3>
        <P>The same <Strong>Settings</Strong> dialog has a <Strong>Danger Zone</Strong> that permanently deletes all bookmarks and tags. To prevent mistakes, you must type <Strong>delete all</Strong> in the confirmation field before confirming. This action cannot be undone.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("explorer")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Explorer Integration</h2>
        <H3>Overview</H3>
        <P>Register files and folders as bookmarks directly from Windows Explorer.</P>
        <H3>Method 1: Right-click Context Menu</H3>
        <P>Automatically registered in the Windows Registry when the app starts.</P>
        <Ul>
          <Li>Right-click any file or folder in Explorer.</Li>
          <Li>Select <Strong>Add to Bookmarks</Strong>.</Li>
          <Li>If the app is already running, the form opens in the existing window. If not, the app launches and the form opens automatically.</Li>
        </Ul>
        <H3>Method 2: Drag &amp; Drop</H3>
        <Ul>
          <Li>With the app window open, drag a file or folder from Explorer and drop it onto the app.</Li>
          <Li>The add form opens with the path and filename pre-filled.</Li>
        </Ul>
        <H3>Common Behavior</H3>
        <P>In both methods, the form opens with the path and title (file/folder name) pre-filled. Add tags or a memo as needed, then click <Strong>Add Bookmark</Strong>.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("memo")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Memo</h2>
        <H3>Overview</H3>
        <P>Attach a memo to any bookmark. Memos are stored only in the local database and are never sent anywhere. Memo text is also included in the search bar&apos;s filtering.</P>
        <H3>Limitations</H3>
        <Ul>
          <Li>Maximum <Strong>10,000 characters</Strong>.</Li>
          <Li>Not included in exports.</Li>
        </Ul>
        <H3>Display</H3>
        <P>Bookmarks with memos show a &ldquo;Memo&rdquo; badge. Hover to preview the content in a tooltip; click to copy to clipboard. Edit or delete memos from the edit form.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("shortcuts")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Shortcuts</h2>
        <div className="rounded-lg border overflow-hidden mb-3">
          <ShortcutRow keys={["Any key"]} label="Focus search and start typing" />
          <ShortcutRow keys={["Tab"]} label="Move focus to the next bookmark card" />
          <ShortcutRow keys={["Shift", "Tab"]} label="Move focus to the previous bookmark card" />
          <ShortcutRow keys={["Esc"]} label="Close modal / cancel action" />
          <ShortcutRow keys={["Ctrl", "Alt", "Space"]} label="Bring app to front (global, default)" />
        </div>
        <P>The bring-to-front shortcut is the one global shortcut registered system-wide. Change it in the <Strong>Settings</Strong> dialog under <Strong>Bring App to Front</Strong>. Prefer a <Strong>Ctrl+Alt</Strong> or <Strong>Ctrl+Shift</Strong> combo to avoid clashing with other apps.</P>
        <H3>Arrow Key Card Navigation</H3>
        <P>With a card focused, arrow keys move focus to another card.</P>
        <Ul>
          <Li><Strong>Left/Right</Strong> — move to the previous/next card in the same order as Tab.</Li>
          <Li><Strong>Up/Down</Strong> — jump to the closest card in the row above/below whose column lines up best. Works correctly across column-count changes and the pinned/unpinned section boundary.</Li>
          <Li><Strong>Home / End</Strong> — jump straight to the first/last card in the list.</Li>
          <Li>Disabled while a text field is focused or a dialog is open (text fields keep their native cursor movement instead).</Li>
        </Ul>
        <H3>Per-Bookmark Shortcuts (In-App)</H3>
        <P>Assign a key to a bookmark to open its page/folder <Strong>while the app is open</Strong>. Assigned keys are always shown as a badge on the right of the card.</P>
        <Ul>
          <Li>Click the <Strong>Shortcut</Strong> field in the add/edit form and press your desired key combination.</Li>
          <Li><Strong>At least one modifier (Ctrl / Alt / Shift) is required.</Strong> The main key can be a letter, digit, or function key (F1–F12).</Li>
          <Li>Press <Kbd>Esc</Kbd> while capturing to cancel without changing the current assignment. Press the <Strong>X</Strong> button to remove the assignment entirely.</Li>
          <Li>Inactive while a text field is focused (so editing keys like copy/paste keep working).</Li>
          <Li><Strong>Must be unique</Strong> — the same combo can&apos;t be assigned to multiple bookmarks (the form warns and blocks saving).</Li>
        </Ul>
      </section>

      <div className="border-t" />

      <section ref={registerRef("theme")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Theme</h2>
        <H3>How to Switch</H3>
        <P>Open the gear (<Strong>Settings</Strong>) icon in the header and choose from <Strong>Theme</Strong>.</P>
        <H3>Options</H3>
        <Ul>
          <Li><Strong>Light</Strong> — always light mode.</Li>
          <Li><Strong>System</Strong> — follows OS theme setting (default).</Li>
          <Li><Strong>Dark</Strong> — always dark mode.</Li>
        </Ul>
        <P>Settings are saved in <Strong>localStorage</Strong> and persist across sessions.</P>
      </section>

      <div className="border-t" />

      <section ref={registerRef("extension")}>
        <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">Browser Extension</h2>
        <H3>Overview</H3>
        <P>A Chrome/Edge extension that saves the current page with one click. The active tab&rsquo;s URL and title are prefilled, and tags or memo can be edited directly in the popup.</P>
        <H3>Requirements</H3>
        <Ul>
          <Li>Chrome or Edge (Manifest V3).</Li>
          <Li>The app must be running.</Li>
        </Ul>
        <H3>Install (recommended) — Edge Add-ons Store</H3>
        <P>On Microsoft Edge you can install it straight from the store: no Developer mode, and updates are automatic. Use the button below to open the store page, then click <Strong>Get</Strong>.</P>
        <StoreButton href={EDGE_ADDON_URL}>Open in Edge Add-ons</StoreButton>
        <H3>Install (Chrome and others) — Load the ZIP</H3>
        <P>For browsers without a store listing, load the ZIP manually.</P>
        <Ul>
          <Li>Download and unzip the ZIP file at the end of this section.</Li>
          <Li>Open <Strong>chrome://extensions</Strong> in Chrome or <Strong>edge://extensions</Strong> in Edge.</Li>
          <Li>Enable <Strong>Developer mode</Strong> (top-right toggle).</Li>
          <Li>Click <Strong>Load unpacked</Strong> and select the unzipped folder.</Li>
        </Ul>
        <H3>Startup Notice (ZIP install only)</H3>
        <P>Because this extension is loaded unpacked with Developer mode enabled, Chrome or Edge may show a notice when the browser starts. To keep using the extension, leave it enabled. If it becomes disabled or stops responding, open <Strong>chrome://extensions</Strong> or <Strong>edge://extensions</Strong>, enable it again, and reload it if needed.</P>
        <H3>Usage</H3>
        <Ul>
          <Li>Click the extension icon in the toolbar on any page you want to save.</Li>
          <Li>Review the URL and title, then add tags or memo if needed.</Li>
          <Li>Duplicate URLs are detected in the popup.</Li>
          <Li>Use the <Strong>Shortcut</Strong> field to assign a key combo to the bookmark (works the same as in the main app).</Li>
          <Li>Click <Strong>Add Bookmark</Strong> to save directly from the extension.</Li>
        </Ul>
        <DownloadExtensionButton label="Download ZIP (manual install)" />
      </section>
    </>
  );
}

// ---- main component ---------------------------------------------------------

export function HelpDialog() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("basic");
  const [lang, setLang] = useState<"ja" | "en">("ja");
  const contentRef = useRef<HTMLDivElement | null>(null);
  // State-backed container node: a callback ref guarantees the scroll-spy effect
  // re-runs once the (portaled) content element is actually mounted in the DOM.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const setContentNode = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setContainerEl(node);
  }, []);

  const SECTIONS = lang === "ja" ? SECTIONS_JA : SECTIONS_EN;

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (el && container) {
      const top = container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
      container.scrollTo({ top, behavior: "smooth" });
    }
  };

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  // Scroll spy: keep the sidebar entry in sync with the section in view.
  useEffect(() => {
    const container = containerEl;
    if (!open || !container) return;

    const handleScroll = () => {
      // At the very bottom, force-select the last section so short trailing
      // sections can still become active.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        setActiveId(SECTIONS[SECTIONS.length - 1].id);
        return;
      }
      const threshold = container.getBoundingClientRect().top + 24;
      let current = SECTIONS[0].id;
      for (const { id } of SECTIONS) {
        const el = sectionRefs.current[id];
        if (el && el.getBoundingClientRect().top - threshold <= 1) {
          current = id;
        }
      }
      setActiveId(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    // Run once after layout settles (the dialog open animation transforms the
    // content, so an immediate read can be off).
    const raf = requestAnimationFrame(handleScroll);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [open, containerEl, SECTIONS]);

  const handleLangChange = (newLang: "ja" | "en") => {
    setLang(newLang);
    setActiveId("basic");
    contentRef.current?.scrollTo({ top: 0 });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        icon={HelpCircle}
        onClick={() => setOpen(true)}
        aria-label="ヘルプ"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl h-[82vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">
                Book<span className="text-blue-500">marks</span>{lang === "ja" ? " — 使い方ガイド" : " — Help"}
              </DialogTitle>
              <div className="flex items-center border rounded-md overflow-hidden text-sm mr-6">
                <button
                  onClick={() => handleLangChange("ja")}
                  className={cn(
                    "px-3 py-1 transition-colors",
                    lang === "ja" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  JA
                </button>
                <button
                  onClick={() => handleLangChange("en")}
                  className={cn(
                    "px-3 py-1 transition-colors",
                    lang === "en" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  EN
                </button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* sidebar */}
            <nav className="w-56 shrink-0 border-r overflow-y-auto py-3">
              {SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={cn(
                    "w-full text-left px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
                    activeId === id
                      ? "text-blue-500 font-medium bg-blue-500/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* content */}
            <div ref={setContentNode} className="flex-1 overflow-y-auto px-7 py-5 space-y-2">
              {lang === "ja" ? (
                <ContentJA registerRef={registerRef} />
              ) : (
                <ContentEN registerRef={registerRef} />
              )}
              <div className="h-4" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
