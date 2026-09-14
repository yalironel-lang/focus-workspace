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

import { NotebookCandidateQaPanel } from './NotebookCandidateQaPanel';
import {
  type NotebookQaDiagContext,
  buildNotebookQaDiagSnapshot,
  recordTransitionIfNeeded,
} from '../../../lib/notebookTiptap/candidateQaDiagnostics';

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
  sourceBodyCodecVersion?: number;
  /** Changes on Notebook page switch — discards candidate edits. */
  pageKey: string;
  objectId?: string;
  className?: string;
  onReady?: (info: {
    editable: true;
    pageKey: string;
    sourceLength: number;
    persistence: boolean;
  }) => void;
  /** Test/DEV hook — TipTap editor instance (memory-only). */
  onEditorReady?: (editor: import('@tiptap/core').Editor | null) => void;
  onSnapshot?: (snap: CandidateSerializeSnapshot) => void;
  /**
   * M5.2 — guarded real persistence callback.
   * Called ONLY when:
   *   1. A genuine user content mutation occurs (transaction.docChanged)
   *   2. Serialization to canonical body succeeds (fail-closed)
   *   3. This prop is provided (persistence flag ON at mount site)
   *
   * The body is always codec V1. Caller routes through existing pushContent pipeline.
   * NOT called on: mount, hydration, programmatic setContent, selection, focus, blur.
   */
  onUserEdit?: (body: string, codecVersion: number) => void;
  /** DEV-only diagnostics context for copying in-memory snapshot and transition trace */
  qaDiagContext?: NotebookQaDiagContext;
};

function attemptSerialize(
  doc: JSONContent,
  userEdited: boolean,
  codecVersion?: number,
): CandidateSerializeSnapshot {
  try {
    const body = tiptapDocToBody(doc, codecVersion);
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
 * When onUserEdit is provided (M5.2 persist flag ON), genuine user edits are
 * routed through the existing pushContent persistence pipeline via that callback.
 * When absent, behavior is memory-only (M4 contract).
 */
export function NotebookTiptapCandidateEditor({
  sourceDocumentBody,
  sourceBodyCodecVersion,
  pageKey,
  objectId,
  className,
  onReady,
  onEditorReady,
  onSnapshot,
  onUserEdit,
  qaDiagContext,
}: NotebookTiptapCandidateEditorProps) {
  const sourceRef = useRef(sourceDocumentBody);
  const userEditedRef = useRef(false);
  const [userEdited, setUserEdited] = useState(false);
  const [snap, setSnap] = useState<CandidateSerializeSnapshot | null>(null);

  const pageSource = useMemo(
    () => sourceDocumentBody,
    [pageKey, sourceDocumentBody],
  );

  const prevPageKeyRef = useRef(pageKey);
  type CandidateEmittedItem = {
    pageKey: string;
    body: string;
    codecVersion: number;
    emittedAt: number;
  };
  const recentEmissionsRef = useRef<CandidateEmittedItem[]>([]);

  if (prevPageKeyRef.current !== pageKey) {
    prevPageKeyRef.current = pageKey;
    recentEmissionsRef.current = [];
  }

  useEffect(() => {
    if (prevPageKeyRef.current !== pageKey) {
      prevPageKeyRef.current = pageKey;
      recentEmissionsRef.current = [];
      userEditedRef.current = false;
      setUserEdited(false);
    }
    sourceRef.current = pageSource;
  }, [pageKey, pageSource]);

  const extensions = useMemo(
    () => createNotebookTiptapSandboxExtensions({ objectId }),
    [objectId],
  );

  const load = useMemo(() => {
    // Render-time self-echo guard: if this update matches what this exact editor instance recently emitted
    // for this page, allow load to interpret the body using the known emitted codec version even if
    // the parent reflection temporarily arrived with undefined codecVersion.
    const matchingEcho = recentEmissionsRef.current.find(
      e => e.pageKey === pageKey && e.body === pageSource,
    );
    const isRenderSelfEcho = matchingEcho !== undefined;

    const effectiveCodecVersion =
      isRenderSelfEcho && sourceBodyCodecVersion === undefined
        ? matchingEcho.codecVersion
        : sourceBodyCodecVersion;

    try {
      // DEV fail-closed guard: versioned text record (~nb1:) must NEVER be parsed with undefined codecVersion
      if (effectiveCodecVersion === undefined && pageSource.includes('~nb1:')) {
        throw new Error('Corrupt state: received versioned Notebook text (~nb1:) with undefined codecVersion');
      }
      return {
        content: bodyToTiptapDoc(pageSource, effectiveCodecVersion),
        error: null as string | null,
        isSelfEcho: isRenderSelfEcho,
        matchedEchoCodecVersion: matchingEcho?.codecVersion,
      };
    } catch (err) {
      return {
        content: bodyToTiptapDoc(''),
        error: err instanceof Error ? err.message : String(err),
        isSelfEcho: false,
        matchedEchoCodecVersion: undefined,
      };
    }
  }, [pageSource, pageKey, sourceBodyCodecVersion]);

  // Stable ref so closure in onUpdate always has the latest prop without re-creating editor.
  const onUserEditRef = useRef(onUserEdit);
  onUserEditRef.current = onUserEdit;

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
        const targetCodec = onUserEditRef.current ? 1 : sourceBodyCodecVersion;
        const next = attemptSerialize(ed.getJSON(), true, targetCodec);
        setSnap(next);
        onSnapshot?.(next);
        // M5.2 — guarded real persistence (fail-closed).
        // Only fires when: docChanged + serialization succeeded + prop provided.
        // Does NOT fire on: mount, setContent, selection, focus, blur.
        if (next.status === 'SAFE' && next.body !== null) {
          const persistFn = onUserEditRef.current;
          if (persistFn) {
            recentEmissionsRef.current = [
              { pageKey, body: next.body, codecVersion: 1, emittedAt: Date.now() },
              ...recentEmissionsRef.current.slice(0, 9),
            ];
            try {
              persistFn(next.body, 1);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('[TipTap M5.2] onUserEdit threw — persistence skipped', err);
            }
          }
        } else if (next.status === 'UNSERIALIZABLE') {
          // Fail-closed: log error but do NOT call onUserEdit; previous valid body remains intact.
          // eslint-disable-next-line no-console
          console.error(
            '[TipTap M5.2] Serialization failed — persistence blocked to protect existing body',
            next.errorCode,
            next.errorMessage,
          );
        }
      },
    },
    [extensions],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!load.error);
    if (load.error) {
      setSnap(null);
      return;
    }

    // Self-echo guard: if this update matches what this exact editor instance recently emitted
    // for this page, skip setContent to preserve live editor state, selection, and undo history.
    const matchingEcho = recentEmissionsRef.current.find(
      e =>
        e.pageKey === pageKey &&
        e.body === pageSource &&
        e.codecVersion === (sourceBodyCodecVersion ?? e.codecVersion),
    );
    const isSelfEcho = load.isSelfEcho || matchingEcho !== undefined;

    if (isSelfEcho) {
      // Update snapshot without resetting editor doc
      const next = attemptSerialize(
        editor.getJSON(),
        userEditedRef.current,
        sourceBodyCodecVersion ?? load.matchedEchoCodecVersion ?? matchingEcho?.codecVersion ?? 1,
      );
      setSnap(next);
      onSnapshot?.(next);
      return;
    }

    // Genuine external update, page switch, or initial load:
    userEditedRef.current = false;
    setUserEdited(false);
    editor.commands.setContent(load.content, { emitUpdate: false });
    const next = attemptSerialize(editor.getJSON(), false, sourceBodyCodecVersion);
    setSnap(next);
    onSnapshot?.(next);
  }, [editor, pageKey, pageSource, sourceBodyCodecVersion, load.content, load.error, onSnapshot]);

  useEffect(() => {
    if (!onReady) return;
    onReady({
      editable: true,
      pageKey,
      sourceLength: pageSource.length,
      persistence: Boolean(onUserEdit),
    });
  }, [onReady, pageKey, pageSource.length, onUserEdit]);

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

  const persistenceMode = onUserEdit ? 'guarded' : 'never';

  const dirtyLabel =
    snap?.dirtyKind === 'unserializable'
      ? 'UNSERIALIZABLE'
      : snap?.dirtyKind === 'user_edit' || userEdited
        ? onUserEdit
          ? 'EDITED (saving…)'
          : 'EDITED (memory only)'
        : 'PRISTINE';

  const candidateInfo = useMemo(
    () => ({
      pageKey,
      sourceBody: pageSource,
      sourceBodyCodecVersion,
      failClosed: Boolean(load.error),
      failClosedMessage: load.error,
    }),
    [pageKey, pageSource, sourceBodyCodecVersion, load.error],
  );

  // DEV-only transition trace recording
  if (qaDiagContext) {
    recordTransitionIfNeeded(
      qaDiagContext,
      candidateInfo,
      load.error ? 'fail-closed' : 'render',
      editor,
    );
  }

  const getSnapshot = useCallback(() => {
    if (!qaDiagContext) {
      const fallbackCtx: NotebookQaDiagContext = {
        objectId: objectId ?? 'unknown',
        propsContent: {
          activePageId: pageKey,
          body: pageSource,
          bodyCodecVersion: sourceBodyCodecVersion,
        },
        migratedContent: {
          type: 'notebook',
          pages: [],
          activePageId: pageKey,
          body: pageSource,
          bodyCodecVersion: sourceBodyCodecVersion,
        },
        navigationOverlay: null,
        effectiveContent: {
          activePageId: pageKey,
          body: pageSource,
          bodyCodecVersion: sourceBodyCodecVersion,
        },
        resolvedNavigation: {
          activePageId: pageKey,
          activeSectionId: null,
        },
      };
      return buildNotebookQaDiagSnapshot(fallbackCtx, candidateInfo, editor);
    }
    return buildNotebookQaDiagSnapshot(qaDiagContext, candidateInfo, editor);
  }, [qaDiagContext, candidateInfo, editor, objectId, pageKey, pageSource, sourceBodyCodecVersion]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editor || editor.isDestroyed || !editor.isEditable) return;
      const target = e.target as HTMLElement | null;
      // Do not intercept clicks on controls, toolbars, QA panel, or atom blocks themselves
      if (
        target?.closest(
          'button, select, input, [role="toolbar"], [data-nb-candidate-toolbar], [data-nb-candidate-qa-panel], [data-nb-candidate-badge], [data-nb="nbImageRef"], [data-nb="nbHandwriting"], [data-nb="nbDivider"], [data-nb="nbMath"], .nb-img-block',
        )
      ) {
        return;
      }
      const { doc } = editor.state;
      const last = doc.lastChild;
      if (
        last &&
        (last.type.name === 'nbImageRef' ||
          last.type.name === 'nbHandwriting' ||
          last.type.name === 'nbDivider' ||
          last.type.name === 'nbMath')
      ) {
        const insertPos = doc.content.size;
        editor
          .chain()
          .focus()
          .insertContentAt(insertPos, {
            type: 'nbParagraph',
            attrs: { variant: null, dir: 'auto' },
            content: [],
          })
          .setTextSelection(insertPos + 1)
          .run();
      } else {
        editor.chain().focus('end').run();
      }
    },
    [editor],
  );

  return (
    <div
      className={className}
      data-nb-tiptap-candidate-root="1"
      data-nb-candidate-page={pageKey}
      data-nb-candidate-source-codec={sourceBodyCodecVersion !== undefined ? String(sourceBodyCodecVersion) : 'undefined'}
      data-nb-candidate-persistence={persistenceMode}
      /* Bubble-phase only: let TipTap receive keys first; then keep CE/ancestors from seeing them.
         Never stopPropagation in capture — that blocks ProseMirror before it handles Enter. */
      onKeyDown={e => e.stopPropagation()}
      onCopy={e => e.stopPropagation()}
      onClick={handleContainerClick}
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
        .ProseMirror-gapcursor {
          display: none;
          pointer-events: none;
          position: absolute;
        }
        .ProseMirror-gapcursor:after {
          content: "";
          display: block;
          position: absolute;
          top: -2px;
          width: 20px;
          border-top: 1px solid #38bdf8;
          animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
        }
        @keyframes ProseMirror-cursor-blink {
          to {
            visibility: hidden;
          }
        }
        .ProseMirror-focused .ProseMirror-gapcursor {
          display: block;
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
        TipTap candidate · {onUserEdit ? 'M5.2 Guarded Persist' : 'Unsaved'}
      </div>

      <NotebookCandidateQaPanel
        getSnapshot={getSnapshot}
        failClosed={Boolean(load.error)}
      />

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
        <span data-nb-dir-persist={persistenceMode}>{onUserEdit ? 'persist: guarded' : 'dir not persisted'}</span>
        <span>page={pageKey}</span>
      </div>
    </div>
  );
}
