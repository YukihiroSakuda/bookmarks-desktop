import { BookmarkUI } from '@/types/bookmark';

export function exportBookmarksToHtml(bookmarks: BookmarkUI[]): string {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${bookmarks.map(bookmark => `    <DT><A HREF="${bookmark.url}" ADD_DATE="${Math.floor(new Date(bookmark.createdAt).getTime() / 1000)}">${bookmark.title}</A>`).join('\n')}
</DL><p>`;

  return html;
}

export function downloadHtml(html: string, filename: string = 'bookmarks.html'): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
} 