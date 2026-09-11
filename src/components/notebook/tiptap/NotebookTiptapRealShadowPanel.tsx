/**
 * DEV-only TipTap shadow for a REAL Notebook page.
 * Editable + memory-only. Never writes documentBody / Free Space / Supabase.
 * Resets when pageKey changes (safest page-switch behavior).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { bodyToTiptapDoc } from '../../../lib/notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from '../../../lib/notebookTiptap/sandboxExtensions';
import {
  buildShadowSnapshot,
  tryCanonicalBody,
  type ShadowSerializeSnapshot,
} from '../../../lib/notebookTiptap/shadowDiff';
import { NB_FONT_STACK, NB_INK } from '../../../lib/notebookTiptap/visualTokens';
import { DEFAULT_NOTEBOOK_FONT_SIZE } from '../../../lib/notebookInlineMarks';
import {
  hasBidiControlChars,
  normalizeTextDir,
  type NotebookTextDir,
} from '../../../lib/notebookTiptap/direction';

export type NotebookTiptapRealShadowPanelProps = {
  /** Same body string the CE editor uses for the active page. Never mutated. */
  sourceDocumentBody: string;
  /** Changes when active Notebook page changes — forces shadow reset. */
  pageKey: string;
  objectId?: string;
  className?: string;
  onSnapshot?: (snap: ShadowSerializeSnapshot) => void;
  onReady?: (info: {
    editable: true;
    pageKey: string;
    sourceLength: number;
    loadOk: boolean;
  }) => void;
};

const toolBtn: CSSProperties = {
  background: 'rgba(51,65,85,0.85)',
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  minWidth: 28,
};

const toolBtnActive: CSSProperties = {
  ...toolBtn,
  background: 'rgba(96,165,250,0.35)',
  borderColor: 'rgba(96,165,250,0.55)',
};

export function NotebookTiptapRealShadowPanel({
  sourceDocumentBody,
  pageKey,
  objectId,
  className,
  onSnapshot,
  onReady,
}: NotebookTiptapRealShadowPanelProps) {
  const [open, setOpen] = useState(true);
  const sourceRef = useRef(sourceDocumentBody);
  const userEditedRef = useRef(false);
  const [userEdited, setUserEdited] = useState(false);
  const [snap, setSnap] = useState<ShadowSerializeSnapshot | null>(null);

  const pageSource = useMemo(() => sourceDocumentBody, [pageKey, sourceDocumentBody]);

  useEffect(() => {
    sourceRef.current = pageSource;
    userEditedRef.current = false;
    setUserEdited(false);
  }, [pageKey, pageSource]);

  const extensions = useMemo(
    () => createNotebookTiptapSandboxExtensions({ objectId }),
    [objectId],
  );

  const load = useMemo(() => {
    const t0 = performance.now();
    try {
      return {
        content: bodyToTiptapDoc(pageSource),
        error: null as string | null,
        ms: Math.round(performance.now() - t0),
      };
    } catch (err) {
      return {
        content: bodyToTiptapDoc(''),
        error: err instanceof Error ? err.message : String(err),
        ms: Math.round(performance.now() - t0),
      };
    }
  }, [pageSource, pageKey]);

  const editor = useEditor(
    {
      extensions,
      content: load.content,
      editable: !load.error,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: 'nb-tiptap-real-shadow-prosemirror',
          'data-nb-tiptap-real-shadow': '1',
          style: [
            `font-family: ${NB_FONT_STACK}`,
            `color: ${NB_INK.primary}`,
            'outline: none',
            'min-height: 100px',
          ].join(';'),
        },
      },
      onUpdate: ({ editor: ed, transaction }) => {
        if (!transaction.docChanged) return;
        userEditedRef.current = true;
        setUserEdited(true);
        const next = buildShadowSnapshot({
          originalBody: sourceRef.current,
          doc: ed.getJSON(),
          userEdited: true,
        });
        setSnap(next);
        onSnapshot?.(next);
      },
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    userEditedRef.current = false;
    setUserEdited(false);
    editor.setEditable(!load.error);
    if (load.error) {
      setSnap(null);
      return;
    }
    editor.commands.setContent(load.content, { emitUpdate: false });
    const next = buildShadowSnapshot({
      originalBody: pageSource,
      doc: editor.getJSON(),
      userEdited: false,
    });
    setSnap(next);
    onSnapshot?.(next);
  }, [editor, pageKey, pageSource, load.content, load.error, onSnapshot]);

  useEffect(() => {
    if (!onReady) return;
    onReady({
      editable: true,
      pageKey,
      sourceLength: pageSource.length,
      loadOk: !load.error,
    });
  }, [onReady, pageKey, pageSource.length, load.error]);

  const markState = useEditorState({
    editor,
    selector: ctx => {
      if (!ctx.editor) {
        return { bold: false, italic: false, underline: false, strike: false, dir: 'auto' as NotebookTextDir };
      }
      const parent = ctx.editor.state.selection.$from.parent;
      return {
        bold: ctx.editor.isActive('bold'),
        italic: ctx.editor.isActive('italic'),
        underline: ctx.editor.isActive('underline'),
        strike: ctx.editor.isActive('strike'),
        dir: normalizeTextDir(parent.attrs.dir),
      };
    },
  });

  const canonicalHint = useMemo(() => tryCanonicalBody(pageSource), [pageSource]);

  const statusLabel = !snap
    ? load.error
      ? 'LOAD_FAIL'
      : '…'
    : snap.status === 'UNSERIALIZABLE'
      ? 'UNSERIALIZABLE'
      : snap.dirtyKind === 'same'
        ? 'SAFE'
        : snap.dirtyKind === 'canonical_only'
          ? 'SAFE (canonical Δ)'
          : 'DIFF';

  const statusColor =
    statusLabel === 'SAFE'
      ? '#34d399'
      : statusLabel.startsWith('SAFE')
        ? '#fbbf24'
        : statusLabel === 'DIFF'
          ? '#60a5fa'
          : '#f87171';

  const bodyHasBidi =
    snap?.status === 'SAFE' && snap.body != null ? hasBidiControlChars(snap.body) : false;

  return (
    <div
      className={className}
      data-nb-tiptap-real-shadow-root="1"
      data-nb-shadow-page={pageKey}
      style={{
        marginTop: 12,
        borderRadius: 12,
        border: '1px solid rgba(96,165,250,0.35)',
        background: 'rgba(15,23,42,0.96)',
        color: '#e2e8f0',
        fontFamily: 'ui-sans-serif, system-ui',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ ...toolBtn, fontWeight: 600 }}
        >
          {open ? 'Hide' : 'Show'} TipTap shadow
        </button>
        <strong style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Real Notebook shadow (DEV · memory only)
        </strong>
        <span data-nb-shadow-status={statusLabel} style={{ fontWeight: 700, color: statusColor, fontSize: 12 }}>
          {statusLabel}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          page={pageKey} · init {load.ms}ms · userEdited={userEdited ? 'yes' : 'no'}
        </span>
      </div>

      {open ? (
        <div style={{ marginTop: 10 }} onKeyDown={e => e.stopPropagation()}>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8' }}>
            CE remains authoritative. Edits here never save. Page switch resets the shadow.
            Direction is TipTap-only (not persisted).
          </p>

          {load.error ? (
            <div
              data-nb-shadow-load-error="1"
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(248,113,113,0.12)',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Fail-closed: cannot load this Notebook body into TipTap. CE untouched.
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{load.error}</pre>
            </div>
          ) : (
            <>
              <div data-nb-shadow-toolbar="1" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <button type="button" style={markState?.bold ? toolBtnActive : toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}>B</button>
                <button type="button" style={markState?.italic ? toolBtnActive : toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}>I</button>
                <button type="button" style={markState?.underline ? toolBtnActive : toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleUnderline().run()}>U</button>
                <button type="button" style={markState?.strike ? toolBtnActive : toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleStrike().run()}>S</button>
                <button type="button" style={toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>Undo</button>
                <button type="button" style={toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
                <select
                  aria-label="Font size"
                  defaultValue={String(DEFAULT_NOTEBOOK_FONT_SIZE)}
                  style={{ ...toolBtn, fontWeight: 500 }}
                  onMouseDown={e => e.preventDefault()}
                  onChange={e => {
                    const px = e.target.value;
                    if (!px) editor?.chain().focus().unsetFontSize().run();
                    else editor?.chain().focus().setFontSize(`${px}px`).run();
                  }}
                >
                  {[12, 14, 16, 18, 20, 24].map(n => (
                    <option key={n} value={n}>{n}px</option>
                  ))}
                </select>
                <select
                  data-nb-shadow-dir="1"
                  aria-label="Text direction"
                  value={markState?.dir ?? 'auto'}
                  style={{ ...toolBtn, fontWeight: 500, minWidth: 72 }}
                  onMouseDown={e => e.preventDefault()}
                  onChange={e => {
                    if (!editor) return;
                    const dir = normalizeTextDir(e.target.value);
                    editor
                      .chain()
                      .focus()
                      .updateAttributes(editor.state.selection.$from.parent.type.name, { dir })
                      .run();
                  }}
                >
                  <option value="auto">Auto</option>
                  <option value="ltr">LTR</option>
                  <option value="rtl">RTL</option>
                </select>
              </div>

              <div
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid rgba(148,163,184,0.2)',
                  background: 'rgba(2,6,23,0.45)',
                  maxHeight: 280,
                  overflow: 'auto',
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </>
          )}

          {snap ? (
            <div data-nb-shadow-inspector="1" style={{ marginTop: 10, fontSize: 12 }}>
              <div style={{ color: '#94a3b8', marginBottom: 4 }}>
                dirtyKind=<code>{snap.dirtyKind}</code>
                {snap.diff.same
                  ? ' · same as source'
                  : ` · Δ lines ${snap.diff.changedLineCount} (first #${snap.diff.firstChangedLine ?? '—'})`}
                {' · '}
                <span data-nb-dir-persist="not-persisted" style={{ color: '#fbbf24' }}>
                  dir not persisted
                </span>
                {bodyHasBidi ? (
                  <span data-nb-bidi-controls="1" style={{ color: '#94a3b8' }}>
                    {' '}
                    · bidi controls present (preserved)
                  </span>
                ) : (
                  <span data-nb-bidi-controls="0"> · no bidi controls</span>
                )}
              </div>
              {snap.diff.firstChangedPreview ? (
                <pre
                  data-nb-shadow-diff-preview="1"
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: '#0f172a',
                    padding: 8,
                    borderRadius: 6,
                    color: '#cbd5e1',
                    maxHeight: 80,
                    overflow: 'auto',
                  }}
                >
                  {snap.diff.firstChangedPreview}
                </pre>
              ) : null}
              {snap.status === 'UNSERIALIZABLE' ? (
                <code style={{ color: '#fca5a5' }}>
                  {snap.errorCode}: {snap.errorMessage}
                </code>
              ) : null}
              <details>
                <summary style={{ cursor: 'pointer', color: '#64748b' }}>
                  Serialized body preview (in-memory)
                </summary>
                <pre
                  data-nb-shadow-serialized="1"
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: '#0f172a',
                    padding: 8,
                    borderRadius: 6,
                    maxHeight: 120,
                    overflow: 'auto',
                  }}
                >
                  {snap.body ?? '(unserializable)'}
                </pre>
              </details>
              <details>
                <summary style={{ cursor: 'pointer', color: '#64748b' }}>
                  Original source body (immutable)
                </summary>
                <pre
                  data-nb-shadow-source="1"
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: '#0f172a',
                    padding: 8,
                    borderRadius: 6,
                    maxHeight: 120,
                    overflow: 'auto',
                  }}
                >
                  {pageSource}
                </pre>
              </details>
              {canonicalHint != null && canonicalHint !== pageSource ? (
                <p style={{ color: '#fbbf24', fontSize: 11, marginTop: 6 }}>
                  Note: adapter canonicalization alone would rewrite this body (not a user edit).
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
