/**
 * Safe PDF download / print-document filename from Notebook title.
 */

const INVALID = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Sanitize a Notebook title into a PDF basename (no extension). */
export function sanitizeNotebookPdfBasename(title: string | null | undefined): string {
  const raw = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Notebook';
  let base = raw
    .replace(INVALID, '')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || RESERVED.test(base)) return 'Notebook';
  if (base.length > 120) base = base.slice(0, 120).trim();
  return base || 'Notebook';
}

/** Full filename including `.pdf`. */
export function notebookPdfFilename(title: string | null | undefined): string {
  return `${sanitizeNotebookPdfBasename(title)}.pdf`;
}
