/**
 * DEV-only TipTap editable Notebook sandbox.
 * Memory-only edits — no persistence, no documentBody writeback, no Supabase.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { bodyToTiptapDoc } from '../../../lib/notebookTiptap/blocksToTiptapDoc';
import { tiptapDocToBody } from '../../../lib/notebookTiptap/tiptapDocToBody';
import {
  isNotebookTiptapConversionError,
  type NotebookTiptapErrorCode,
} from '../../../lib/notebookTiptap/errors';
import { createNotebookTiptapSandboxExtensions } from '../../../lib/notebookTiptap/sandboxExtensions';
import { NB_FONT_STACK, NB_INK } from '../../../lib/notebookTiptap/visualTokens';
import { DEFAULT_NOTEBOOK_FONT_SIZE } from '../../../lib/notebookInlineMarks';
import {
  hasBidiControlChars,
  normalizeTextDir,
  type NotebookTextDir,
} from '../../../lib/notebookTiptap/direction';

export type SerializeStatus = 'SAFE' | 'UNSERIALIZABLE';

export type SandboxSerializeSnapshot = {
  status: SerializeStatus;
  body: string | null;
  errorCode?: NotebookTiptapErrorCode;
  errorMessage?: string;
  json: JSONContent;
};

export type NotebookTiptapSandboxEditorProps = {
  /** Fixture documentBody used only as initial (and reset) content. Never written. */
  initialDocumentBody: string;
  /** Bump to force re-init from initialDocumentBody (e.g. Reset fixture). */
  resetToken?: number;
  objectId?: string;
  className?: string;
  onReady?: (info: { editable: true; docChildCount: number }) => void;
  /** Test hook: observe in-memory serialize attempts (never persistence). */
  onSerializeAttempt?: (snap: SandboxSerializeSnapshot) => void;
};

function attemptSerialize(doc: JSONContent): SandboxSerializeSnapshot {
  try {
    const body = tiptapDocToBody(doc);
    return { status: 'SAFE', body, json: doc };
  } catch (err) {
    if (isNotebookTiptapConversionError(err)) {
      return {
        status: 'UNSERIALIZABLE',
        body: null,
        errorCode: err.code,
        errorMessage: err.message,
        json: doc,
      };
    }
    return {
      status: 'UNSERIALIZABLE',
      body: null,
      errorCode: 'malformed_input',
      errorMessage: err instanceof Error ? err.message : String(err),
      json: doc,
    };
  }
}

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

export function NotebookTiptapSandboxEditor({
  initialDocumentBody,
  resetToken = 0,
  objectId,
  className,
  onReady,
  onSerializeAttempt,
}: NotebookTiptapSandboxEditorProps) {
  const extensions = useMemo(
    () => createNotebookTiptapSandboxExtensions({ objectId, enableDelimiterMathIsolate: true }),
    [objectId],
  );

  const [serialize, setSerialize] = useState<SandboxSerializeSnapshot>(() =>
    attemptSerialize(bodyToTiptapDoc(initialDocumentBody)),
  );

  const editor = useEditor(
    {
      extensions,
      content: bodyToTiptapDoc(initialDocumentBody),
      editable: true,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: 'nb-tiptap-sandbox-prosemirror',
          'data-nb-tiptap-sandbox': '1',
          style: [
            `font-family: ${NB_FONT_STACK}`,
            `color: ${NB_INK.primary}`,
            'outline: none',
            'min-height: 120px',
          ].join(';'),
        },
      },
      onUpdate: ({ editor: ed }) => {
        const snap = attemptSerialize(ed.getJSON());
        setSerialize(snap);
        onSerializeAttempt?.(snap);
      },
    },
    [extensions],
  );

  // Reset from fixture when token changes — memory only.
  useEffect(() => {
    if (!editor) return;
    const next = bodyToTiptapDoc(initialDocumentBody);
    editor.commands.setContent(next, { emitUpdate: false });
    const snap = attemptSerialize(next);
    setSerialize(snap);
    onSerializeAttempt?.(snap);
  }, [editor, resetToken, initialDocumentBody, onSerializeAttempt]);

  useEffect(() => {
    if (!editor || !onReady) return;
    onReady({ editable: true, docChildCount: editor.state.doc.childCount });
  }, [editor, onReady]);

  const markState = useEditorState({
    editor,
    selector: ctx => {
      if (!ctx.editor) {
        return { bold: false, italic: false, underline: false, strike: false, dir: 'auto' as NotebookTextDir };
      }
      return {
        bold: ctx.editor.isActive('bold'),
        italic: ctx.editor.isActive('italic'),
        underline: ctx.editor.isActive('underline'),
        strike: ctx.editor.isActive('strike'),
        dir: normalizeTextDir(ctx.editor.getAttributes('nbParagraph').dir ??
          ctx.editor.getAttributes('nbBullet').dir ??
          ctx.editor.getAttributes('nbOrdered').dir ??
          ctx.editor.getAttributes('nbTask').dir ??
          ctx.editor.getAttributes('nbTitle').dir ??
          ctx.editor.getAttributes('nbSection').dir ??
          ctx.editor.getAttributes('nbQuote').dir ??
          ctx.editor.getAttributes('nbStep').dir ??
          ctx.editor.getAttributes('nbCallout').dir ??
          'auto'),
      };
    },
  });

  const run = useCallback(
    (fn: () => void) => {
      if (!editor) return;
      fn();
    },
    [editor],
  );

  const setBlockDir = useCallback(
    (dir: NotebookTextDir) => {
      if (!editor) return;
      editor.chain().focus().updateAttributes(editor.state.selection.$from.parent.type.name, { dir }).run();
    },
    [editor],
  );

  const bodyHasBidiControls =
    serialize.status === 'SAFE' && serialize.body != null ? hasBidiControlChars(serialize.body) : false;

  return (
    <div
      className={className}
      data-nb-tiptap-sandbox-root="1"
      style={{ fontFamily: NB_FONT_STACK, color: NB_INK.primary }}
    >
      <style>{`
        .nb-tiptap-math-src-isolate {
          direction: ltr;
          unicode-bidi: isolate;
        }
      `}</style>
      <div
        data-nb-sandbox-toolbar="1"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}
      >
        <button
          type="button"
          style={markState?.bold ? toolBtnActive : toolBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().toggleBold().run())}
        >
          B
        </button>
        <button
          type="button"
          style={markState?.italic ? toolBtnActive : toolBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().toggleItalic().run())}
        >
          I
        </button>
        <button
          type="button"
          style={markState?.underline ? toolBtnActive : toolBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().toggleUnderline().run())}
        >
          U
        </button>
        <button
          type="button"
          style={markState?.strike ? toolBtnActive : toolBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().toggleStrike().run())}
        >
          S
        </button>
        <span style={{ width: 8 }} />
        <button
          type="button"
          style={toolBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().undo().run())}
        >
          Undo
        </button>
        <button
          type="button"
          style={toolBtn}
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().redo().run())}
        >
          Redo
        </button>
        <span style={{ width: 8 }} />
        <select
          aria-label="Font size"
          defaultValue={String(DEFAULT_NOTEBOOK_FONT_SIZE)}
          style={{ ...toolBtn, fontWeight: 500 }}
          onMouseDown={e => e.preventDefault()}
          onChange={e => {
            const px = e.target.value;
            run(() => {
              if (!px) editor!.chain().focus().unsetFontSize().run();
              else editor!.chain().focus().setFontSize(`${px}px`).run();
            });
          }}
        >
          {[12, 14, 16, 18, 20, 24, 32].map(n => (
            <option key={n} value={n}>
              {n}px
            </option>
          ))}
        </select>
        <button
          type="button"
          style={toolBtn}
          title="Text color"
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().setColor('#fca5a5').run())}
        >
          Color
        </button>
        <button
          type="button"
          style={toolBtn}
          title="Highlight"
          onMouseDown={e => e.preventDefault()}
          onClick={() => run(() => editor!.chain().focus().toggleHighlight({ color: '#fef08a' }).run())}
        >
          HL
        </button>
        <span style={{ width: 8 }} />
        <select
          aria-label="Block type"
          defaultValue=""
          style={{ ...toolBtn, fontWeight: 500, minWidth: 100 }}
          onMouseDown={e => e.preventDefault()}
          onChange={e => {
            const v = e.target.value;
            e.target.value = '';
            run(() => {
              if (v === 'nbParagraph') editor!.chain().focus().setNode('nbParagraph', { variant: null }).run();
              if (v === 'nbTitle') editor!.chain().focus().setNode('nbTitle').run();
              if (v === 'nbSection') editor!.chain().focus().setNode('nbSection').run();
              if (v === 'nbBullet') editor!.chain().focus().setNode('nbBullet', { depth: 0 }).run();
              if (v === 'nbOrdered') editor!.chain().focus().setNode('nbOrdered', { number: 1 }).run();
              if (v === 'nbTask') editor!.chain().focus().setNode('nbTask', { checked: false }).run();
              if (v === 'nbQuote') editor!.chain().focus().setNode('nbQuote').run();
              if (v === 'nbStep') editor!.chain().focus().setNode('nbStep').run();
              if (v === 'nbCallout') editor!.chain().focus().setNode('nbCallout', { tone: 'concept' }).run();
            });
          }}
        >
          <option value="" disabled>
            Block…
          </option>
          <option value="nbParagraph">Paragraph</option>
          <option value="nbTitle">Title</option>
          <option value="nbSection">Section</option>
          <option value="nbBullet">Bullet</option>
          <option value="nbOrdered">Ordered</option>
          <option value="nbTask">Task</option>
          <option value="nbQuote">Quote</option>
          <option value="nbStep">Step</option>
          <option value="nbCallout">Callout</option>
        </select>
        <span style={{ width: 8 }} />
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Dir</span>
        <select
          data-nb-sandbox-dir="1"
          aria-label="Text direction"
          value={markState?.dir ?? 'auto'}
          style={{ ...toolBtn, fontWeight: 500, minWidth: 72 }}
          onMouseDown={e => e.preventDefault()}
          onChange={e => setBlockDir(normalizeTextDir(e.target.value))}
        >
          <option value="auto">Auto</option>
          <option value="ltr">LTR</option>
          <option value="rtl">RTL</option>
        </select>
      </div>

      <div
        style={{
          padding: '8px 4px',
          borderRadius: 8,
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(2,6,23,0.35)',
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <div data-nb-sandbox-inspector="1" style={{ marginTop: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <strong style={{ letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
            Live serialize
          </strong>
          <span
            data-nb-serialize-status={serialize.status}
            style={{
              fontWeight: 700,
              color: serialize.status === 'SAFE' ? '#34d399' : '#f87171',
            }}
          >
            {serialize.status}
          </span>
          <span
            data-nb-dir-persist="not-persisted"
            style={{ fontSize: 11, color: '#fbbf24' }}
            title="Block dir attrs are TipTap-only; dialect body does not store direction yet"
          >
            direction metadata: not persisted
          </span>
          {bodyHasBidiControls ? (
            <span data-nb-bidi-controls="1" style={{ color: '#94a3b8', fontSize: 11 }}>
              bidi controls present (preserved; ZIKUK does not inject)
            </span>
          ) : (
            <span data-nb-bidi-controls="0" style={{ color: '#64748b', fontSize: 11 }}>
              no bidi control chars in body
            </span>
          )}
          {serialize.errorCode ? (
            <code style={{ color: '#fca5a5' }}>
              {serialize.errorCode}: {serialize.errorMessage}
            </code>
          ) : null}
        </div>
        <details>
          <summary style={{ color: '#64748b', cursor: 'pointer' }}>TipTap JSON</summary>
          <pre
            data-nb-sandbox-json="1"
            style={{
              whiteSpace: 'pre-wrap',
              background: '#0f172a',
              padding: 8,
              borderRadius: 6,
              maxHeight: 160,
              overflow: 'auto',
              color: '#cbd5e1',
            }}
          >
            {JSON.stringify(serialize.json, null, 2)}
          </pre>
        </details>
        <details open={serialize.status === 'SAFE'}>
          <summary style={{ color: '#64748b', cursor: 'pointer' }}>
            Canonical documentBody (in-memory only)
          </summary>
          <pre
            data-nb-sandbox-body="1"
            style={{
              whiteSpace: 'pre-wrap',
              background: '#0f172a',
              padding: 8,
              borderRadius: 6,
              maxHeight: 160,
              overflow: 'auto',
              color: '#cbd5e1',
            }}
          >
            {serialize.status === 'SAFE' ? serialize.body : '(unserializable — nothing persisted)'}
          </pre>
        </details>
      </div>
    </div>
  );
}
