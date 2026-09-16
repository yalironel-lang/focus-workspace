/**
 * M7.5B — Intentional link open for Notebook TipTap.
 * Always sanitize first; never open unsafe schemes; never mutate the document.
 */

import { sanitizeUrl } from './urlSanitizer';

/** Product class on rendered link marks (editor + preview). */
export const NB_TIPTAP_LINK_CLASS = 'nb-tiptap-link';

/**
 * Open a Notebook link after sanitizeUrl.
 * Returns false when the href is rejected (unsafe / invalid).
 * HTTP(S) open in a new tab with noopener/noreferrer; opener cleared.
 * mailto / tel / relative / hash follow the same sanitize contract and open
 * via window.open with noopener when the browser supports it.
 */
export function openNotebookLink(rawHref: unknown): boolean {
  const href = sanitizeUrl(rawHref);
  if (!href) return false;

  const opened = window.open(href, '_blank', 'noopener,noreferrer');
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      // Cross-origin / browser policy — noopener feature string is the primary guard.
    }
  }
  return true;
}
