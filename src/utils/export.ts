import { BookmarkUI } from '@/types/bookmark';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function exportBookmarksToHtml(bookmarks: BookmarkUI[]): string {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${bookmarks.map(bookmark => {
  const addDate = Math.floor(new Date(bookmark.createdAt).getTime() / 1000);
  const safeDateAttr = isNaN(addDate) ? '' : ` ADD_DATE="${addDate}"`;
  return `    <DT><A HREF="${escapeHtml(bookmark.url)}"${safeDateAttr}>${escapeHtml(bookmark.title)}</A>`;
}).join('\n')}
</DL><p>`;

  return html;
}

export async function downloadHtml(html: string, filename: string = 'bookmarks.html'): Promise<void> {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    const handle = await (window as Window & typeof globalThis & {
      showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: 'HTML file', accept: { 'text/html': ['.html'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
} 