/**
 * Milestone 4 — TipTap production editor candidate.
 * Renders inside the real Notebook writing column.
 * Memory-only: never writes documentBody / Free Space / Supabase / sync.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { bodyToTiptapDoc } from '../../../lib/notebookTiptap/blocksToTiptapDoc';
import { tiptapDocToBody } from '../../../lib/notebookTiptap/tiptapDocToBody';
import {
  isNotebookTiptapConversionError,
  type NotebookTiptapErrorCode,
} from '../../../lib/notebookTiptap/errors';
import { createNotebookTiptapSandboxExtensions } from '../../../lib/notebookTiptap/sandboxExtensions';
import { NB_FONT_STACK } from '../../../lib/notebookTiptap/visualTokens';
import {
  normalizeTextDir,
  type NotebookTextDir,
} from '../../../lib/notebookTiptap/direction';
import { NotebookTiptapCandidateSelectionToolbar } from './NotebookTiptapCandidateSelectionToolbar';
import {
  CANDIDATE_BLOCK_MENU,
  runCandidateBlockCommand,
  type CandidateBlockTarget,
} from '../../../lib/notebookTiptap/candidateBlockCommands';

export type CandidateSerializeStatus = 'SAFE' | 'UNSERIALIZABLE';

export type CandidateDirtyKind = 'pristine' | 'user_edit' | 'unserializable';

export type CandidateSerializeSnapshot = {
  status: CandidateSerializeStatus;
  body: string | null;
  errorCode?: NotebookTiptapErrorCode;
  errorMessage?: string;
  json: JSONContent;
  dirtyKind: CandidateDirtyKind;
  userEdited: boolean;
};

export type NotebookTiptapCandidateEditorProps = {
  /** Real active-page body (same as CE). Never mutated / never written back. */
  sourceDocumentBody: string;
  /** Changes on Notebook page switch — discards candidate edits. */
  pageKey: string;
  objectId?: string;
  className?: string;
  onReady?: (info: {
    editable: true;
    pageKey: string;
    sourceLength: number;
    persistence: false;
  }) => void;
  /** Test/DEV hook — TipTap editor instance (memory-only). */
  onEditorReady?: (editor: import('@tiptap/core').Editor | null) => void;
  onSnapshot?: (snap: CandidateSerializeSnapshot) => void;
};

function attemptSerialize(
  doc: JSONContent,
  userEdited: boolean,
): CandidateSerializeSnapshot {
  try {
    const body = tiptapDocToBody(doc);
    return {
      status: 'SAFE',
      body,
      json: doc,
      userEdited,
      dirtyKind: userEdited ? 'user_edit' : 'pristine',
    };
  } catch (err) {
    if (isNotebookTiptapConversionError(err)) {
      return {
        status: 'UNSERIALIZABLE',
        body: null,
        errorCode: err.code,
        errorMessage: err.message,
        json: doc,
        userEdited,
        dirtyKind: 'unserializable',
      };
    }
    return {
      status: 'UNSERIALIZABLE',
      body: null,
      errorCode: 'malformed_input',
      errorMessage: err instanceof Error ? err.message : String(err),
      json: doc,
      userEdited,
      dirtyKind: 'unserializable',
    };
  }
}

const toolBtn: CSSProperties = {
  background: 'rgba(15,23,42,0.55)',
  color: 'inherit',
  border: '1px solid rgba(148,163,184,0.35)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  minWidth: 28,
  opacity: 0.92,
};

/**
 * TipTap candidate editor for the real Notebook writing column.
 * Intentionally has NO persistence callback props.
 */
export function NotebookTiptapCandidateEditor({
  sourceDocumentBody,
  pageKey,
  objectId,
  className,
  onReady,
  onEditorReady,
  onSnapshot,
}: NotebookTiptapCandidateEditorProps) {
  const sourceRef = useRef(sourceDocumentBody);
  const userEditedRef = useRef(false);
  const [userEdited, setUserEdited] = useState(false);
  const [snap, setSnap] = useState<CandidateSerializeSnapshot | null>(null);

  const pageSource = useMemo(
    () => sourceDocumentBody,
    [pageKey, sourceDocumentBody],
  );

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
    try {
      return { content: bodyToTiptapDoc(pageSource), error: null as string | null };
    } catch (err) {
      return {
        content: bodyToTiptapDoc(''),
        error: err instanceof Error ? err.message : String(err),
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
          class: 'nb-tiptap-candidate-prosemirror',
          'data-nb-tiptap-candidate': '1',
          style: [
            `font-family: ${NB_FONT_STACK}`,
            'color: inherit',
            'outline: none',
            'min-height: 240px',
            'caret-color: currentColor',
          ].join(';'),
        },
      },
      onUpdate: ({ editor: ed, transaction }) => {
        if (!transaction.docChanged) return;
        userEditedRef.current = true;
        setUserEdited(true);
        const next = attemptSerialize(ed.getJSON(), true);
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
    const next = attemptSerialize(editor.getJSON(), false);
    setSnap(next);
    onSnapshot?.(next);
  }, [editor, pageKey, pageSource, load.content, load.error, onSnapshot]);

  useEffect(() => {
    if (!onReady) return;
    onReady({
      editable: true,
      pageKey,
      sourceLength: pageSource.length,
      persistence: false,
    });
  }, [onReady, pageKey, pageSource.length]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  const markState = useEditorState({
    editor,
    selector: ctx => {
      if (!ctx.editor) {
        return { dir: 'auto' as NotebookTextDir };
      }
      const parent = ctx.editor.state.selection.$from.parent;
      return { dir: normalizeTextDir(parent.attrs.dir) };
    },
  });

  const run = useCallback(
    (fn: () => void) => {
      if (!editor) return;
      fn();
    },
    [editor],
  );

  const dirtyLabel =
    snap?.dirtyKind === 'unserializable'
      ? 'UNSERIALIZABLE'
      : snap?.dirtyKind === 'user_edit' || userEdited
        ? 'EDITED (memory only)'
        : 'PRISTINE';

  return (
    <div
      className={className}
      data-nb-tiptap-candidate-root="1"
      data-nb-candidate-page={pageKey}
      data-nb-candidate-persistence="never"
      /* Bubble-phase only: let TipTap receive keys first; then keep CE/ancestors from seeing them.
         Never stopPropagation in capture — that blocks ProseMirror before it handles Enter. */
      onKeyDown={e => e.stopPropagation()}
      onCopy={e => e.stopPropagation()}
      style={{
        fontFamily: NB_FONT_STACK,
        color: 'inherit',
        position: 'relative',
        minHeight: 280,
      }}
    >
      <style>{`
        .nb-tiptap-math-src-isolate {
          direction: ltr;
          unicode-bidi: isolate;
        }
      `}</style>

      <div
        data-nb-candidate-badge="1"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          background: 'rgba(245,158,11,0.18)',
          border: '1px solid rgba(245,158,11,0.45)',
          color: '#fbbf24',
        }}
      >
        TipTap candidate · Unsaved
      </div>

      {load.error ? (
        <div
          data-nb-candidate-load-error="1"
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'rgba(248,113,113,0.12)',
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          Fail-closed: cannot load this page body into TipTap. CE remains available when candidate is off.
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{load.error}</pre>
        </div>
      ) : (
        <>
          {/* Temp DEV-only: undo/dir + caret block morph — NOT final product UI.
              Selection formatting + Block/Academic menu: floating toolbar (M4.2). */}
          <div
            data-nb-candidate-toolbar="1"
            data-nb-candidate-toolbar-temp="1"
            title="Temporary DEV tools — not final product UI. Select text for the formatting toolbar."
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 10,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                opacity: 0.55,
                marginInlineEnd: 4,
              }}
            >
              Temp DEV tools
            </span>
            <button type="button" style={toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => run(() => editor!.chain().focus().undo().run())}>Undo</button>
            <button type="button" style={toolBtn} onMouseDown={e => e.preventDefault()} onClick={() => run(() => editor!.chain().focus().redo().run())}>Redo</button>
            <select
              data-nb-candidate-block-dev="1"
              aria-label="Block type (DEV caret morph)"
              defaultValue=""
              style={{ ...toolBtn, fontWeight: 500, minWidth: 120 }}
              onMouseDown={e => e.preventDefault()}
              onChange={e => {
                const v = e.target.value as CandidateBlockTarget | '';
                e.target.value = '';
                if (!v) return;
                run(() => {
                  runCandidateBlockCommand(editor!, v);
                });
              }}
            >
              <option value="" disabled>Block / Academic…</option>
              {CANDIDATE_BLOCK_MENU.map(item => (
                <option key={item.id} value={item.id}>
                  {item.group === 'academic' ? `◆ ${item.label}` : item.label}
                </option>
              ))}
            </select>
            <select
              data-nb-candidate-dir="1"
              aria-label="Text direction"
              value={markState?.dir ?? 'auto'}
              style={{ ...toolBtn, fontWeight: 500, minWidth: 72 }}
              onMouseDown={e => e.preventDefault()}
              onChange={e => {
                const dir = normalizeTextDir(e.target.value);
                run(() => {
                  editor!
                    .chain()
                    .focus()
                    .updateAttributes(editor!.state.selection.$from.parent.type.name, { dir })
                    .run();
                });
              }}
            >
              <option value="auto">Auto</option>
              <option value="ltr">LTR</option>
              <option value="rtl">RTL</option>
            </select>
          </div>

          <EditorContent editor={editor} />
          {editor ? <NotebookTiptapCandidateSelectionToolbar editor={editor} /> : null}
        </>
      )}

      <div
        data-nb-candidate-status="1"
        style={{
          marginTop: 12,
          fontSize: 11,
          opacity: 0.75,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span data-nb-candidate-dirty={dirtyLabel}>{dirtyLabel}</span>
        {snap ? (
          <span data-nb-candidate-serialize={snap.status}>
            serialize={snap.status}
            {snap.errorCode ? ` (${snap.errorCode})` : ''}
          </span>
        ) : null}
        <span data-nb-dir-persist="not-persisted">dir not persisted</span>
        <span>page={pageKey}</span>
      </div>
    </div>
  );
}
