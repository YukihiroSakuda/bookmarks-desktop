import { UiLang } from "@/lib/uiLanguage";

/**
 * Every string the settings dialog shows, in both languages.
 *
 * Kept as one table in its own module rather than as ternaries inline: the
 * dialog is long enough already, and a table makes a missing translation a type
 * error instead of a stray English sentence someone spots in a screenshot.
 *
 * Sentences that need emphasis in the middle are split into before/strong/after
 * rather than carrying markup, because where the emphasis falls in a sentence is
 * not the same in both languages.
 */
export const SETTINGS_TEXT = {
  ja: {
    title: "設定",
    sections: {
      appearance: "表示",
      shortcuts: "ショートカット",
      files: "ファイルショートカット",
      data: "データ",
      about: "このアプリについて",
    },
    displayColumns: "列数",
    theme: "テーマ",
    themes: { light: "ライト", system: "システム", dark: "ダーク" },
    bringToFront: "アプリを最前面に出す",
    pressCombo: "キーの組み合わせを押してください…",
    perBookmark: "ブックマークごとのショートカット",
    assigned: (n: number) => `${n} 件設定済み`,
    noneAssigned: "未設定",
    noShortcutsYet: "まだ設定されていません。",
    perBookmarkNote:
      "アプリが開いている間だけ有効です。各ブックマークの編集フォームで割り当てます。",
    fileShortcuts: "ファイルショートカット",
    off: "オフ",
    on: "オン",
    fileShortcutsNote:
      "ブックマークしたファイルとフォルダへのショートカットを1つの Windows フォルダにまとめ、どのアプリのファイルダイアログからでも選べるようにします。クイックアクセスにピン留めするとそこから開けます。URL は含まれません。",
    folderSearch: "フォルダ内のファイル検索",
    folderSearchNote:
      "検索時に、ブックマークしたフォルダの中のファイル名も検索対象に含めます。",
    change: "変更",
    openFolder: "開く",
    syncNow: "今すぐ同期",
    syncing: "同期中…",
    pinToQuickAccess: "クイックアクセスにピン留め",
    unpinFromQuickAccess: "クイックアクセスから外す",
    working: "処理中…",
    data: "データ",
    importLabel: "インポート",
    importing: "インポート中…",
    exportLabel: "エクスポート",
    htmlNote:
      "HTML のインポート／エクスポートはブラウザのブックマークと互換です（メモ・タグ・ショートカットは含まれません）。",
    backup: "バックアップ",
    backingUp: "バックアップ中…",
    restore: "復元",
    restoring: "復元中…",
    jsonNote:
      "JSON バックアップにはすべて（タグ・メモ・ショートカット・設定）が含まれます。復元すると現在のデータはすべて置き換わります。",
    fetchIcons: (n: number) => `未取得のアイコンを取得（${n}）`,
    fetchingIcons: (done: number, total: number) => `取得中 ${done} / ${total}…`,
    allIconsFetched: "アイコンはすべて取得済み",
    stop: "中止",
    iconsNote:
      "サイトアイコンは追加時に一度だけ各サイトから取得し、ローカルに保存します。1件ずつ追加したものはその場で取得され、インポートしたものはここでまとめて取得します。",
    dangerZone: "取り扱い注意",
    deleteAllBookmarks: "すべてのブックマークを削除",
    deleteAll: "すべて削除",
    aboutNote:
      "ストア版とインストーラー版は同じデータフォルダを使うため、どちらに切り替えてもブックマークは引き継がれます。",
    cancel: "キャンセル",
    deleteConfirmTitle: "すべてのブックマークを削除しますか？",
    deleteConfirmBefore: "この操作は",
    deleteConfirmStrong: "取り消せません",
    deleteConfirmAfter: "。すべてのブックマークが完全に削除されます。",
    typeConfirmBefore: "確認のため ",
    typeConfirmAfter: " と入力してください",
    restoreConfirmTitle: "バックアップから復元しますか？",
    restoreConfirmBefore: "バックアップファイルの内容で",
    restoreConfirmStrong: "現在のデータをすべて置き換えます",
    restoreConfirmAfter:
      "（ブックマーク・タグ・ルール・設定）。取り消せません。",

    // --- toasts ---
    iconsStopped: (n: number) => `中止しました。${n} 件のアイコンを取得しました。`,
    iconsDone: (updated: number, total: number) =>
      `${total} 件中 ${updated} 件のアイコンを取得しました。`,
    iconsFailed: "アイコンを取得できませんでした。",
    pickFolderFailed: "フォルダを選択できませんでした。",
    pickFolderFailedWith: (e: string) => `フォルダを選択できませんでした: ${e}`,
    openFolderFailedWith: (e: string) => `フォルダを開けませんでした: ${e}`,
    quickAccessFailed: "クイックアクセスを変更できませんでした。",
    quickAccessFailedWith: (e: string) => `クイックアクセスを変更できませんでした: ${e}`,
    quickAccessPinned: "クイックアクセスにピン留めしました。",
    quickAccessUnpinned: "クイックアクセスから外しました。",
    quickAccessManual:
      "クイックアクセスを変更できませんでした。フォルダを右クリックして操作してください。",
    syncFailed: "ショートカットを同期できませんでした。",
    syncFailedWith: (e: string) => `同期できませんでした: ${e}`,
    syncDone: "ショートカットフォルダを更新しました。",
    syncDoneSkipped: (n: number) =>
      `ショートカットフォルダを更新しました。${n} 件はスキップしました。`,
    imported: (n: number) =>
      `${n} 件のブックマークをインポートしました。アイコンは「未取得のアイコンを取得」で集められます。`,
    exported: (n: number) => `${n} 件のブックマークをエクスポートしました。`,
    exportFailed: "エクスポートできませんでした。もう一度お試しください。",
    backupSaved: "バックアップを保存しました。",
    backupFailed: "バックアップできませんでした。もう一度お試しください。",
    restored: (n: number) => `バックアップから ${n} 件のブックマークを復元しました。`,
    restoreFailed: "復元できませんでした。もう一度お試しください。",
  },

  en: {
    title: "Settings",
    sections: {
      appearance: "Appearance",
      shortcuts: "Shortcuts",
      files: "File shortcuts",
      data: "Data",
      about: "About",
    },
    displayColumns: "Display Columns",
    theme: "Theme",
    themes: { light: "Light", system: "System", dark: "Dark" },
    bringToFront: "Bring App to Front",
    pressCombo: "Press a key combination…",
    perBookmark: "Per-Bookmark Shortcuts",
    assigned: (n: number) => `${n} assigned`,
    noneAssigned: "None assigned",
    noShortcutsYet: "No shortcuts assigned yet.",
    perBookmarkNote:
      "Active while the app is open. Assign keys in each bookmark's edit form.",
    fileShortcuts: "File shortcuts",
    off: "Off",
    on: "On",
    fileShortcutsNote:
      "Puts a shortcut to every bookmarked file and folder in one Windows folder, so they can be picked from any app's file dialog. Pin it to Quick Access to reach it there. URLs are not included.",
    folderSearch: "Search inside bookmarked folders",
    folderSearchNote:
      "When searching, also match file names inside bookmarked folders.",
    change: "Change",
    openFolder: "Open",
    syncNow: "Sync now",
    syncing: "Syncing...",
    pinToQuickAccess: "Pin to Quick Access",
    unpinFromQuickAccess: "Unpin from Quick Access",
    working: "Working...",
    data: "Data",
    importLabel: "Import",
    importing: "Importing...",
    exportLabel: "Export",
    htmlNote:
      "HTML import/export is compatible with browser bookmarks (memos, tags, and shortcuts are not included).",
    backup: "Backup",
    backingUp: "Backing up...",
    restore: "Restore",
    restoring: "Restoring...",
    jsonNote:
      "JSON backup includes everything (tags, memos, shortcuts, settings). Restore replaces all current data.",
    fetchIcons: (n: number) => `Fetch missing icons (${n})`,
    fetchingIcons: (done: number, total: number) => `Fetching ${done} / ${total}...`,
    allIconsFetched: "All icons fetched",
    stop: "Stop",
    iconsNote:
      "Site icons are fetched from each site once and stored locally. Bookmarks added one at a time get theirs right away; imported ones are collected here.",
    dangerZone: "Danger Zone",
    deleteAllBookmarks: "Delete all bookmarks",
    deleteAll: "Delete All",
    aboutNote:
      "Store and installer builds share the same data folder, so bookmarks carry over between them.",
    cancel: "Cancel",
    deleteConfirmTitle: "Delete all bookmarks?",
    deleteConfirmBefore: "This action ",
    deleteConfirmStrong: "cannot be undone",
    deleteConfirmAfter: ". All bookmarks will be permanently deleted.",
    typeConfirmBefore: "Type ",
    typeConfirmAfter: " to confirm",
    restoreConfirmTitle: "Restore from backup?",
    restoreConfirmBefore: "This ",
    restoreConfirmStrong: "replaces all current data",
    restoreConfirmAfter:
      " (bookmarks, tags, rules, and settings) with the contents of the backup file. This cannot be undone.",

    // --- toasts ---
    iconsStopped: (n: number) => `Stopped. ${n} icons fetched.`,
    iconsDone: (updated: number, total: number) =>
      `${updated} of ${total} icons fetched.`,
    iconsFailed: "Failed to fetch icons.",
    pickFolderFailed: "Could not choose a folder.",
    pickFolderFailedWith: (e: string) => `Could not choose a folder: ${e}`,
    openFolderFailedWith: (e: string) => `Could not open the folder: ${e}`,
    quickAccessFailed: "Could not change Quick Access.",
    quickAccessFailedWith: (e: string) => `Could not change Quick Access: ${e}`,
    quickAccessPinned: "Pinned to Quick Access.",
    quickAccessUnpinned: "Unpinned from Quick Access.",
    quickAccessManual:
      "Could not change Quick Access. Right-click the folder and do it from there.",
    syncFailed: "Could not sync the shortcuts.",
    syncFailedWith: (e: string) => `Could not sync: ${e}`,
    syncDone: "Shortcut folder updated.",
    syncDoneSkipped: (n: number) => `Shortcut folder updated. ${n} skipped.`,
    imported: (n: number) =>
      `${n} bookmarks imported. Use "Fetch missing icons" for their icons.`,
    exported: (n: number) => `${n} bookmarks exported successfully!`,
    exportFailed: "Export failed. Please try again.",
    backupSaved: "Backup saved successfully!",
    backupFailed: "Backup failed. Please try again.",
    restored: (n: number) => `Restored ${n} bookmarks from backup.`,
    restoreFailed: "Restore failed. Please try again.",
  },
} as const satisfies Record<UiLang, unknown>;

export type SettingsText = (typeof SETTINGS_TEXT)[UiLang];
