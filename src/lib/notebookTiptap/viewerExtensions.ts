/**
 * TipTap extensions for the read-only Notebook shadow viewer.
 * Builds on Milestone 0 closed schema + React NodeViews for visual parity.
 */

import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize, BackgroundColor } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
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
  NbInlineMath,
  LinkMark,
} from './extensions';
import {
  NbBulletView,
  NbCalloutView,
  NbDividerView,
  NbImageRefView,
  NbMathView,
  NbOrderedView,
  NbParagraphView,
  NbQuoteView,
  NbSectionView,
  NbStepView,
  NbTaskView,
  NbTitleView,
  createNbHandwritingView,
  NbInlineMathView,
} from './nodeViews';

export type NotebookTiptapViewerOptions = {
  /** Optional notebook object id for local handwriting cache paint. */
  objectId?: string;
};

/** Closed schema + NodeViews for visual parity (editable must stay false at useEditor). */
export function createNotebookTiptapViewerExtensions(options: NotebookTiptapViewerOptions = {}) {
  const hwView = createNbHandwritingView(options.objectId);
  return [
    Document,
    Text,
    NbParagraph.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbParagraphView);
      },
    }),
    NbTitle.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbTitleView);
      },
    }),
    NbSection.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbSectionView);
      },
    }),
    NbQuote.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbQuoteView);
      },
    }),
    NbStep.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbStepView);
      },
    }),
    NbMath.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbMathView);
      },
    }),
    NbBullet.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbBulletView);
      },
    }),
    NbOrdered.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbOrderedView);
      },
    }),
    NbTask.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbTaskView);
      },
    }),
    NbCallout.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbCalloutView);
      },
    }),
    NbDivider.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbDividerView);
      },
    }),
    NbImageRef.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbImageRefView);
      },
    }),
    NbHandwriting.extend({
      addNodeView() {
        return ReactNodeViewRenderer(hwView);
      },
    }),
    NbInlineMath.extend({
      addNodeView() {
        return ReactNodeViewRenderer(NbInlineMathView);
      },
    }),
    Bold,
    Italic,
    Strike,
    Underline,
    TextStyle,
    Color,
    FontSize,
    BackgroundColor,
    Highlight.configure({ multicolor: true }),
    LinkMark,
  ];
}
