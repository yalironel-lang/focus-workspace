/**
 * Milestone 4 — TipTap production editor candidate.
 * Renders inside the real Notebook writing column.
 * Memory-only: never writes documentBody / Free Space / Supabase / sync.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { Redo2, Undo2 } from 'lucide-react';
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
import { hasVersionedNotebookRecord } from '../../../lib/notebookDialect';
import {
  NotebookTiptapCandidateSelectionToolbar,
  candidateFloatingToolbarEscapeRef,
} from './NotebookTiptapCandidateSelectionToolbar';
import {
  insertCandidateBlockAtTarget,
} from '../../../lib/notebookTiptap/candidateBlockCommands';
import {
  NB_PRODUCT_CHROME,
  nbProductDirSelectStyle,
  nbProductGroupDividerStyle,
  nbProductGroupStyle,
  nbProductIconBtnStyle,
  nbProductToolbarShellStyle,
} from './notebookProductToolbarChrome';
import {
  NOTEBOOK_IMAGE_FILE_ACCEPT,
  resolveNbImageInsertTarget,
  type NbImageInsertTarget,
} from '../../../lib/notebookTiptap/candidateImageInsert';
import {
  resolveNbHandwritingInsertTarget,
  type NbHandwritingInsertTarget,
} from '../../../lib/notebookTiptap/candidateHandwritingInsert';
import { openNotebookLink } from '../../../lib/notebookTiptap/openNotebookLink';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import { NotebookTiptapProductBlockMenu } from './NotebookTiptapProductBlockMenu';

import { isNotebookEngineeringChromeEnabled } from '../../../lib/notebookTiptap/featureFlag';
import { resetCandidateEditorHistory } from '../../../lib/notebookTiptap/candidatePageHistory';
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
  /**
   * M7.2A — product image insertion.
   * Called with a user-selected image File after the native picker.
   * Parent stores via existing nbImageSet pipeline and inserts nbImageRef.
   * Cancelled picker must not call this.
   */
  onInsertImageFile?: (
    file: File,
    ctx: { insertTarget: NbImageInsertTarget },
  ) => void | Promise<void>;
  /**
   * M7.2B — replace the selected nbImageRef asset while keeping position/width.
   * Cancelled picker must not call this. Parent stores via existing nbImageSet pipeline.
   */
  onReplaceImageFile?: (
    file: File,
    ctx: {
      pos: number;
      pageKey: string;
      prevKey: string;
      width: number | null;
    },
  ) => void | Promise<void>;
  /**
   * M7.3A — product handwriting insertion via Add menu → Handwriting.
   * Parent creates a newHandwritingKey and inserts nbHandwriting via existing model.
   */
  onInsertHandwriting?: (ctx: { insertTarget: NbHandwritingInsertTarget }) => void;
  /** Atmosphere tokens for HandwritingBlock Edit/Draw surface. */
  handwritingTokens?: AtmosphereTokens | null;
  handwritingUserId?: string;
  handwritingSectionId?: string;
  onDismissTextEditing?: () => void;
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
  onInsertImageFile,
  onReplaceImageFile,
  onInsertHandwriting,
  handwritingTokens,
  handwritingUserId,
  handwritingSectionId,
  onDismissTextEditing,
}: NotebookTiptapCandidateEditorProps) {
  const sourceRef = useRef(sourceDocumentBody);
  const userEditedRef = useRef(false);
  const [userEdited, setUserEdited] = useState(false);
  const [snap, setSnap] = useState<CandidateSerializeSnapshot | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageInsertTargetRef = useRef<NbImageInsertTarget | null>(null);
  const onReplaceImageFileRef = useRef(onReplaceImageFile);
  onReplaceImageFileRef.current = onReplaceImageFile;
  const onDismissTextEditingRef = useRef(onDismissTextEditing);
  onDismissTextEditingRef.current = onDismissTextEditing;

  const pageSource = useMemo(
    () => sourceDocumentBody,
    [pageKey, sourceDocumentBody],
  );

  const prevPageKeyRef = useRef(pageKey);
  /**
   * Live page identity for onUpdate / emissions.
   * Synced synchronously when `pageKey` changes (parent flushes the old page
   * before updating this prop). Never rely on the create-time useEditor closure.
   */
  const pageKeyRef = useRef(pageKey);
  const sourceBodyCodecVersionRef = useRef(sourceBodyCodecVersion);
  sourceBodyCodecVersionRef.current = sourceBodyCodecVersion;
  type CandidateEmittedItem = {
    pageKey: string;
    body: string;
    codecVersion: number;
    emittedAt: number;
  };
  const recentEmissionsRef = useRef<CandidateEmittedItem[]>([]);

  if (prevPageKeyRef.current !== pageKey) {
    prevPageKeyRef.current = pageKey;
    pageKeyRef.current = pageKey;
    recentEmissionsRef.current = [];
  } else {
    pageKeyRef.current = pageKey;
  }

  useEffect(() => {
    if (prevPageKeyRef.current !== pageKey) {
      prevPageKeyRef.current = pageKey;
      pageKeyRef.current = pageKey;
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
      if (effectiveCodecVersion === undefined && hasVersionedNotebookRecord(pageSource)) {
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
        handleKeyDown: (_view, event) => {
          // M7.4A: physical Escape while floating toolbar is open must dismiss it
          // (and Turn into), even when ProseMirror owns the focused contenteditable.
          if (candidateFloatingToolbarEscapeRef.current?.(event)) {
            return true;
          }
          return false;
        },
        handleDOMEvents: {
          // M7.5B: ordinary click on linked text stays editor interaction (no navigate).
          // Cmd/Ctrl+Click intentionally opens via sanitizeUrl + safe opener.
          click: (_view, event) => {
            const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
            if (!anchor) return false;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
              openNotebookLink(anchor.getAttribute('href'));
            }
            return true;
          },
        },
        handleClick: (_view, _pos, event) => {
          if ((event.target as HTMLElement | null)?.closest('a')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed, transaction }) => {
        if (!transaction.docChanged) return;
        // Fail-closed / non-editable: never bridge to persistence (protects empty hydrate fallback).
        if (!ed.isEditable) return;
        userEditedRef.current = true;
        setUserEdited(true);
        // Live identity — never the create-time pageKey closed over by useEditor.
        const emitPageKey = pageKeyRef.current;
        const targetCodec = onUserEditRef.current ? 1 : sourceBodyCodecVersionRef.current;
        const next = attemptSerialize(ed.getJSON(), true, targetCodec);
        setSnap(next);
        onSnapshot?.(next);
        // M5.2 — guarded real persistence (fail-closed).
        // Only fires when: docChanged + serialization succeeded + prop provided.
        // Does NOT fire on: mount, hydration, programmatic setContent, selection, focus, blur.
        if (next.status === 'SAFE' && next.body !== null) {
          const persistFn = onUserEditRef.current;
          if (persistFn) {
            recentEmissionsRef.current = [
              {
                pageKey: emitPageKey,
                body: next.body,
                codecVersion: 1,
                emittedAt: Date.now(),
              },
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
    // Establish the hydrated doc as a non-undoable baseline (M7.5A page-local history).
    userEditedRef.current = false;
    setUserEdited(false);
    editor.commands.setContent(load.content, { emitUpdate: false });
    resetCandidateEditorHistory(editor);
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

  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.notebookImageProduct;
    storage.pageKey = pageKey;
    storage.replaceImageFile = (file, ctx) => onReplaceImageFileRef.current?.(file, ctx);
    return () => {
      storage.replaceImageFile = undefined;
    };
  }, [editor, pageKey, onReplaceImageFile]);

  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage.notebookHandwritingProduct;
    storage.pageKey = pageKey;
    storage.objectId = objectId ?? '';
    storage.userId = handwritingUserId;
    storage.sectionId = handwritingSectionId;
    storage.tokens = handwritingTokens ?? null;
    storage.onDismissTextEditing = () => onDismissTextEditingRef.current?.();
    return () => {
      storage.onDismissTextEditing = undefined;
    };
  }, [
    editor,
    pageKey,
    objectId,
    handwritingUserId,
    handwritingSectionId,
    handwritingTokens,
  ]);

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
      // 1. Target check: Do not intercept clicks on controls, toolbars, QA panel, ProseMirror content, or node views
      if (
        target?.closest(
          '.ProseMirror, button, select, input, [role="toolbar"], [data-nb-product-toolbar], [data-nb-candidate-toolbar], [data-nb-candidate-qa-panel], [data-nb="nbImageRef"], [data-nb="nbHandwriting"], [data-nb="nbDivider"], [data-nb="nbMath"], [data-nb-node-view-wrapper], [data-node-view-wrapper], [data-nb-resize-handle], [data-nb-image-reset], .nb-img-block',
        )
      ) {
        return;
      }

      // 2. Geometry check: click MUST be strictly below the ProseMirror document bottom boundary.
      // Clicks on horizontal whitespace or page padding beside paragraphs must NOT hijack caret.
      const editorDom = editor.view?.dom;
      if (editorDom) {
        const rect = editorDom.getBoundingClientRect();
        if ((rect.height > 0 || rect.bottom > 0) && e.clientY <= rect.bottom) {
          return;
        }
      }

      const { doc } = editor.state;
      const last = doc.lastChild;
      const lastIsAtom =
        last &&
        (last.type.name === 'nbImageRef' ||
          last.type.name === 'nbHandwriting' ||
          last.type.name === 'nbDivider' ||
          last.type.name === 'nbMath' ||
          last.isAtom);

      if (lastIsAtom) {
        // Final document node is an atom: append and focus one editable paragraph at the end
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
        // Document already ends in an editable paragraph: focus its end position;
        // DO NOT create duplicate blank paragraphs!
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
        span[data-nb-math="true"] {
          direction: ltr;
          unicode-bidi: isolate;
          font-family: 'KaTeX_Math', 'Cambria Math', 'STIX Two Math', 'Latin Modern Math', serif;
          font-style: italic;
          letter-spacing: 0.02em;
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
        /* M6.4C: restrained document table chrome (visible grid, not spreadsheet). */
        .nb-tiptap-candidate-prosemirror .tableWrapper {
          margin: 0.65em 0;
          overflow-x: auto;
        }
        .nb-tiptap-candidate-prosemirror table.nb-table,
        .nb-tiptap-candidate-prosemirror table[data-nb="nbTable"] {
          border-collapse: collapse;
          width: 100%;
          table-layout: fixed;
          border: 1px solid rgba(148, 163, 184, 0.55);
        }
        .nb-tiptap-candidate-prosemirror td.nb-table-cell,
        .nb-tiptap-candidate-prosemirror th.nb-table-header,
        .nb-tiptap-candidate-prosemirror td[data-nb="nbTableCell"],
        .nb-tiptap-candidate-prosemirror th[data-nb="nbTableHeader"] {
          border: 1px solid rgba(148, 163, 184, 0.55);
          min-width: 3.25rem;
          min-height: 2rem;
          padding: 8px 10px;
          vertical-align: top;
        }
        .nb-tiptap-candidate-prosemirror .tableWrapper.ProseMirror-selectednode,
        .nb-tiptap-candidate-prosemirror table.ProseMirror-selectednode {
          outline: 2px solid rgba(56, 189, 248, 0.55);
          outline-offset: 2px;
        }
        .nb-tiptap-candidate-prosemirror td.nb-table-cell:focus-within,
        .nb-tiptap-candidate-prosemirror th.nb-table-header:focus-within {
          background: rgba(56, 189, 248, 0.06);
        }
        /* M7.5B: restrained document-editor link treatment (dark Notebook UI).
         * !important beats Tailwind preflight anchor inherit rules inside the product shell. */
        .nb-tiptap-candidate-prosemirror a.nb-tiptap-link,
        .nb-tiptap-candidate-prosemirror a[href] {
          color: #7dd3fc !important;
          text-decoration: underline !important;
          text-decoration-thickness: 1px;
          text-underline-offset: 2px;
          text-decoration-skip-ink: auto;
          cursor: text;
        }
        .nb-tiptap-candidate-prosemirror a.nb-tiptap-link:hover,
        .nb-tiptap-candidate-prosemirror a[href]:hover {
          color: #bae6fd !important;
          text-decoration-thickness: 1.5px;
        }
        .nb-tiptap-candidate-prosemirror a.nb-tiptap-link:focus-visible,
        .nb-tiptap-candidate-prosemirror a[href]:focus-visible {
          color: #e0f2fe !important;
          outline: 1px solid rgba(125, 211, 252, 0.55);
          outline-offset: 1px;
          border-radius: 2px;
        }
      `}</style>

      {load.error ? (
        <div
          data-nb-candidate-load-error="1"
          data-nb-page-load-safe-error="1"
          role="alert"
          style={{
            padding: 16,
            borderRadius: 10,
            background: 'rgba(248,113,113,0.12)',
            color: '#fecaca',
            fontSize: 14,
            lineHeight: 1.45,
            maxWidth: 520,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Unable to open this page safely</div>
          <div style={{ opacity: 0.95 }}>
            Your original content has not been changed.
          </div>
          <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>
            Try reloading the page. If the problem continues, use recovery options or contact support.
          </div>
          <button
            type="button"
            data-nb-page-load-reload="1"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={{
              marginTop: 14,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(252,165,165,0.45)',
              background: 'rgba(15,23,42,0.35)',
              color: '#fecaca',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
          {isNotebookEngineeringChromeEnabled() ? (
            <pre
              data-nb-page-load-error-detail="1"
              style={{ whiteSpace: 'pre-wrap', marginTop: 12, fontSize: 11, opacity: 0.7 }}
            >
              {load.error}
            </pre>
          ) : null}
        </div>
      ) : (
        <>
          {/* Product document tools — sticky within Notebook scroll viewport ([data-nb-body-scroll]). */}
          <div
            data-nb-product-toolbar="1"
            data-nb-product-toolbar-sticky="1"
            data-nb-product-toolbar-polish="1"
            style={nbProductToolbarShellStyle()}
          >
            <div data-nb-product-toolbar-group="history" style={nbProductGroupStyle()}>
              <button
                type="button"
                data-nb-product-undo="1"
                aria-label="Undo"
                title="Undo"
                style={nbProductIconBtnStyle()}
                onMouseDown={e => e.preventDefault()}
                onClick={() => run(() => editor!.chain().focus().undo().run())}
                onMouseEnter={e => {
                  e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Undo2 size={15} strokeWidth={2.1} aria-hidden />
              </button>
              <button
                type="button"
                data-nb-product-redo="1"
                aria-label="Redo"
                title="Redo"
                style={nbProductIconBtnStyle()}
                onMouseDown={e => e.preventDefault()}
                onClick={() => run(() => editor!.chain().focus().redo().run())}
                onMouseEnter={e => {
                  e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Redo2 size={15} strokeWidth={2.1} aria-hidden />
              </button>
            </div>

            <div aria-hidden style={nbProductGroupDividerStyle()} />

            <div data-nb-product-toolbar-group="add" style={nbProductGroupStyle()}>
              <NotebookTiptapProductBlockMenu
                onBeforeOpen={() => {
                  if (!editor || editor.isDestroyed) return;
                  // Capture caret/boundary before the menu interaction can blur focus.
                  pendingImageInsertTargetRef.current = resolveNbImageInsertTarget(editor.state);
                }}
                onAction={action => {
                  if (!editor || editor.isDestroyed) return;
                  if (action.kind === 'image') {
                    if (!onInsertImageFile) return;
                    if (!pendingImageInsertTargetRef.current) {
                      pendingImageInsertTargetRef.current = resolveNbImageInsertTarget(editor.state);
                    }
                    imageFileInputRef.current?.click();
                    return;
                  }
                  if (action.kind === 'handwriting') {
                    if (!onInsertHandwriting) return;
                    const insertTarget =
                      pendingImageInsertTargetRef.current ??
                      resolveNbHandwritingInsertTarget(editor.state);
                    pendingImageInsertTargetRef.current = null;
                    onInsertHandwriting({ insertTarget });
                    return;
                  }
                  run(() => {
                    const insertTarget =
                      pendingImageInsertTargetRef.current ??
                      resolveNbImageInsertTarget(editor.state);
                    pendingImageInsertTargetRef.current = null;
                    // + Add = CREATE at captured target (never convert non-empty content).
                    insertCandidateBlockAtTarget(editor, action.target, insertTarget);
                  });
                }}
              />
            </div>

            <input
              ref={imageFileInputRef}
              type="file"
              accept={NOTEBOOK_IMAGE_FILE_ACCEPT}
              data-nb-product-image-input="1"
              aria-hidden="true"
              tabIndex={-1}
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                if (!file) {
                  pendingImageInsertTargetRef.current = null;
                  return;
                }
                if (!onInsertImageFile) {
                  pendingImageInsertTargetRef.current = null;
                  return;
                }
                const insertTarget =
                  pendingImageInsertTargetRef.current ??
                  (editor ? resolveNbImageInsertTarget(editor.state) : { kind: 'split' as const });
                pendingImageInsertTargetRef.current = null;
                void onInsertImageFile(file, { insertTarget });
              }}
            />

            <div aria-hidden style={nbProductGroupDividerStyle()} />

            <div data-nb-product-toolbar-group="direction" style={nbProductGroupStyle()}>
              <select
                data-nb-product-dir="1"
                aria-label="Text direction"
                title="Text direction"
                value={markState?.dir ?? 'auto'}
                style={nbProductDirSelectStyle()}
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
                onFocus={e => {
                  e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
                  e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${NB_PRODUCT_CHROME.focusRing}`;
                }}
                onBlur={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <option value="auto">Auto</option>
                <option value="ltr">LTR</option>
                <option value="rtl">RTL</option>
              </select>
            </div>
          </div>

          <EditorContent editor={editor} />
          {editor ? <NotebookTiptapCandidateSelectionToolbar editor={editor} /> : null}
        </>
      )}

      {isNotebookEngineeringChromeEnabled() && !load.error ? (
        <>
          <NotebookCandidateQaPanel
            getSnapshot={getSnapshot}
            failClosed={Boolean(load.error)}
          />
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
            <span data-nb-dir-persist={persistenceMode}>
              {onUserEdit ? 'persist: guarded' : 'dir not persisted'}
            </span>
            <span>page={pageKey}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
