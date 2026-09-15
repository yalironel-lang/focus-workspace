/**
 * TipTap/ProseMirror read-only Notebook viewer (Milestone 1 shadow surface).
 * VIEWER ONLY — editable false, no persistence, no documentBody mutation.
 */

import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { bodyToTiptapDoc } from '../../../lib/notebookTiptap/blocksToTiptapDoc';
import { createNotebookTiptapViewerExtensions } from '../../../lib/notebookTiptap/viewerExtensions';
import { NB_FONT_STACK, NB_INK } from '../../../lib/notebookTiptap/visualTokens';

export type NotebookTiptapReadonlyViewerProps = {
  /** Authoritative Notebook documentBody (never written back). */
  documentBody: string;
  /** Optional codec version for versioned body decoding */
  codecVersion?: number;
  /** Optional object id for local handwriting cache paint. */
  objectId?: string;
  className?: string;
  /** Test/debug: called once with whether editor.isEditable === false. */
  onReady?: (info: { editable: false; docChildCount: number }) => void;
};

export function NotebookTiptapReadonlyViewer({
  documentBody,
  codecVersion,
  objectId,
  className,
  onReady,
}: NotebookTiptapReadonlyViewerProps) {
  const bodyRef = useRef(documentBody);
  bodyRef.current = documentBody;

  const extensions = useMemo(
    () => createNotebookTiptapViewerExtensions({ objectId }),
    [objectId],
  );

  const initialContent = useMemo(
    () => bodyToTiptapDoc(documentBody, codecVersion),
    [documentBody, codecVersion],
  );

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: 'nb-tiptap-readonly-prosemirror',
          'data-nb-tiptap-readonly': '1',
          style: [
            `font-family: ${NB_FONT_STACK}`,
            `color: ${NB_INK.primary}`,
            'outline: none',
            'caret-color: transparent',
          ].join(';'),
        },
      },
      // No onUpdate / onBlur — viewer must not emit content changes.
    },
    [extensions],
  );

  // Sync content when documentBody prop changes without mutating the source string.
  useEffect(() => {
    if (!editor) return;
    const next = bodyToTiptapDoc(documentBody, codecVersion);
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, documentBody, codecVersion]);

  useEffect(() => {
    if (!editor || !onReady) return;
    onReady({
      editable: false,
      docChildCount: editor.state.doc.childCount,
    });
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    // Hard guarantee: never become editable.
    if (editor.isEditable) editor.setEditable(false);
  }, [editor]);

  return (
    <div
      className={className}
      data-nb-tiptap-viewer="readonly"
      style={{
        fontFamily: NB_FONT_STACK,
        color: NB_INK.primary,
        padding: '8px 4px',
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
