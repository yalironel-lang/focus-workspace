/**
 * Read-only Notebook TipTap → canonical ZikukAiContext adapter (M0.1).
 *
 * Does NOT mutate the editor, trigger persistence, call onUserEdit,
 * serialize dialect bodies, or perform network I/O.
 */

import type { CaptureNotebookAiContextInput, CaptureNotebookAiContextResult, ZikukAiContext } from './types';
import { extractFocus } from './extractFocus';
import { extractSurroundings } from './extractSurroundings';

function hostIsValid(host: CaptureNotebookAiContextInput['host']): boolean {
  return (
    typeof host.userId === 'string' &&
    host.userId.length > 0 &&
    typeof host.sectionId === 'string' &&
    host.sectionId.length > 0 &&
    typeof host.notebookObjectId === 'string' &&
    host.notebookObjectId.length > 0 &&
    typeof host.pageId === 'string' &&
    host.pageId.length > 0 &&
    typeof host.pageKey === 'string' &&
    host.pageKey.length > 0
  );
}

/**
 * Capture a detached, JSON-serializable AI context snapshot from the live editor.
 * The Editor reference is never stored on the result.
 */
export function captureNotebookAiContext(
  input: CaptureNotebookAiContextInput,
): CaptureNotebookAiContextResult {
  const { editor, host } = input;

  if (!hostIsValid(host)) {
    return { ok: false, error: 'missing_host' };
  }
  if (!editor || editor.isDestroyed) {
    return { ok: false, error: 'editor_destroyed' };
  }
  const doc = editor.state?.doc;
  if (!doc) {
    return { ok: false, error: 'no_doc' };
  }

  const focus = extractFocus(editor);
  const anchorPos =
    focus.kind === 'empty'
      ? editor.state.selection.from
      : 'from' in focus
        ? focus.from
        : editor.state.selection.from;

  const surroundings = extractSurroundings(doc, anchorPos);

  const context: ZikukAiContext = {
    version: 1,
    capturedAt: new Date().toISOString(),
    identity: { userId: host.userId },
    academic: {
      sectionId: host.sectionId,
      ...(host.sectionTitle !== undefined ? { sectionTitle: host.sectionTitle } : {}),
    },
    surface: {
      type: 'notebook',
      notebookObjectId: host.notebookObjectId,
      pageId: host.pageId,
      pageKey: host.pageKey,
    },
    focus,
    surroundings,
  };

  // Detach: deep-clone via JSON so callers cannot mutate shared structures.
  const detached = JSON.parse(JSON.stringify(context)) as ZikukAiContext;
  return { ok: true, context: detached };
}
