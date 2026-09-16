/**
 * TipTap extensions for the editable Notebook sandbox (DEV only).
 * Closed schema + editable NodeViews + keymap/paste guards + undo.
 * No persistence hooks.
 */

import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize, BackgroundColor } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { UndoRedo } from '@tiptap/extensions';
import Gapcursor from '@tiptap/extension-gapcursor';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  NbBullet,
  NbCallout,
  NbDivider,
  NbHandwriting,
  NbImageRef,
  NbMath,
  NbOrdered,
  NbParagraph,
  NbQuote,
  NbSection,
  NbStep,
  NbTask,
  NbTitle,
  MathMark,
  NbInlineMath,
  LinkMark,
} from './extensions';
import { createNotebookTableExtensions } from './tableExtensions';
import {
  SandboxBulletView,
  SandboxCalloutView,
  SandboxDividerView,
  SandboxImageRefView,
  SandboxMathAtomView,
  SandboxOrderedView,
  SandboxParagraphView,
  SandboxQuoteView,
  SandboxSectionView,
  SandboxStepView,
  SandboxTaskView,
  SandboxTitleView,
  createSandboxHandwritingView,
} from './sandboxNodeViews';
import {
  NotebookSandboxDocumentFlow,
  NotebookSandboxGuards,
  NotebookSandboxKeymap,
} from './sandboxKeymap';
import { NotebookSandboxPaste } from './sandboxPaste';
import { NotebookSandboxInlineMathIsolate } from './sandboxInlineMathIsolate';
import { NotebookImageProduct } from './notebookImageProduct';
import { NotebookHandwritingProduct } from './notebookHandwritingProduct';

export type NotebookTiptapSandboxOptions = {
  objectId?: string;
  enableDelimiterMathIsolate?: boolean;
};

export function createNotebookTiptapSandboxExtensions(options: NotebookTiptapSandboxOptions = {}) {
  const hwView = createSandboxHandwritingView(options.objectId);
  return [
    Document,
    Text,
    Gapcursor,
    UndoRedo,
    NotebookImageProduct,
    NotebookHandwritingProduct,
    NotebookSandboxKeymap,
    NotebookSandboxGuards,
    NotebookSandboxDocumentFlow,
    ...(options.enableDelimiterMathIsolate ? [NotebookSandboxInlineMathIsolate] : []),
    NbParagraph.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxParagraphView);
      },
    }),
    NbTitle.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxTitleView);
      },
    }),
    NbSection.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxSectionView);
      },
    }),
    NbQuote.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxQuoteView);
      },
    }),
    NbStep.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxStepView);
      },
    }),
    NbMath.extend({
      atom: true,
      selectable: true,
      draggable: false,
      addNodeView() {
        return ReactNodeViewRenderer(SandboxMathAtomView);
      },
    }),
    NbBullet.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxBulletView);
      },
    }),
    NbOrdered.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxOrderedView);
      },
    }),
    NbTask.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxTaskView);
      },
    }),
    NbCallout.extend({
      addNodeView() {
        return ReactNodeViewRenderer(SandboxCalloutView);
      },
    }),
    NbDivider.extend({
      atom: true,
      selectable: true,
      addNodeView() {
        return ReactNodeViewRenderer(SandboxDividerView);
      },
    }),
    NbImageRef.extend({
      atom: true,
      selectable: true,
      addNodeView() {
        return ReactNodeViewRenderer(SandboxImageRefView);
      },
    }),
    NbHandwriting.extend({
      atom: true,
      selectable: true,
      addNodeView() {
        return ReactNodeViewRenderer(hwView);
      },
    }),
    ...createNotebookTableExtensions(),
    // After tables so cell paste wins over prosemirror-tables HTML import.
    NotebookSandboxPaste,
    NbInlineMath,
    Bold,
    Italic,
    Strike,
    Underline,
    TextStyle,
    Color,
    FontSize,
    BackgroundColor,
    Highlight.configure({ multicolor: true }),
    MathMark,
    LinkMark,
  ];
}
