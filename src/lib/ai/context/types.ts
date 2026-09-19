/**
 * ZIKUK AI — canonical context contract (M0.1).
 *
 * Provider-independent, JSON-serializable snapshots of what the student is
 * looking at. No prompts, models, keys, or chat-message shapes.
 *
 * INTERNAL METADATA (must NOT automatically be sent to external AI providers;
 * the future Gateway/provider serialization layer must sanitize payloads):
 * - identity.userId — ZIKUK scoping / future retrieval authorization only
 * - capturedAt — snapshot/debug semantics only; not model prompt content
 */

import type { Editor } from '@tiptap/core';

export type ZikukAiContext = {
  version: 1;
  /** Internal snapshot metadata — do not auto-include in provider prompts. */
  capturedAt: string;
  identity: ZikukAiIdentity;
  academic: ZikukAiAcademic;
  /** M0.1: notebook only. Future surfaces add union members without redesign. */
  surface: ZikukAiNotebookSurface;
  focus: ZikukAiFocus;
  surroundings: ZikukAiSurroundings;
};

export type ZikukAiIdentity = {
  /**
   * Internal ZIKUK metadata for application scoping and future retrieval auth.
   * Must not automatically be transmitted to external AI providers.
   */
  userId: string;
};

export type ZikukAiAcademic = {
  /** sections.id — product “course/workspace”. */
  sectionId: string;
  /** Optional display label when the caller already has it. */
  sectionTitle?: string;
};

export type ZikukAiNotebookSurface = {
  type: 'notebook';
  notebookObjectId: string;
  pageId: string;
  /** TipTap candidate pageKey (production: same as pageId). */
  pageKey: string;
};

export type ZikukAiBlockKind =
  | 'paragraph'
  | 'title'
  | 'section'
  | 'quote'
  | 'step'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'callout'
  | 'math'
  | 'other';

export type ZikukAiSurroundingBlockKind =
  | ZikukAiBlockKind
  | 'image'
  | 'handwriting'
  | 'table'
  | 'divider'
  | 'other';

export type ZikukAiNormalizedContent =
  | { type: 'text'; text: string }
  | { type: 'math'; latex: string }
  | { type: 'image'; assetKey: string; alt?: string }
  | { type: 'handwriting'; assetKey: string }
  | { type: 'table'; rows: number; cols: number; textPreview: string }
  | { type: 'empty' };

export type ZikukAiFocus =
  | { kind: 'empty' }
  | {
      kind: 'text';
      text: string;
      from: number;
      to: number;
      blockKind: ZikukAiBlockKind;
      calloutTone?: string;
    }
  | {
      kind: 'math_block';
      latex: string;
      from: number;
      to: number;
      blockKind: 'math';
    }
  | {
      kind: 'math_inline';
      latex: string;
      from: number;
      to: number;
      blockKind: ZikukAiBlockKind;
      calloutTone?: string;
    }
  | {
      kind: 'image';
      assetKey: string;
      alt: string;
      from: number;
      to: number;
    }
  | {
      kind: 'handwriting';
      assetKey: string;
      from: number;
      to: number;
    }
  | {
      kind: 'table';
      mode: 'whole_table' | 'cell_text';
      rows: number;
      cols: number;
      text?: string;
      from: number;
      to: number;
    }
  | {
      kind: 'unsupported';
      reason: string;
      from: number;
      to: number;
    };

export type ZikukAiSurroundingBlock = {
  role: 'previous' | 'current' | 'next';
  blockKind: ZikukAiSurroundingBlockKind;
  content: ZikukAiNormalizedContent;
};

export type ZikukAiSurroundings = {
  /** At most previous + current + next. */
  blocks: ZikukAiSurroundingBlock[];
  /** True if any text/latex/preview was truncated to bounds. */
  truncated: boolean;
};

export type CaptureNotebookAiContextHost = {
  userId: string;
  sectionId: string;
  sectionTitle?: string;
  notebookObjectId: string;
  pageId: string;
  pageKey: string;
};

export type CaptureNotebookAiContextInput = {
  /** Read-only. NEVER stored on the resulting context. */
  editor: Editor;
  host: CaptureNotebookAiContextHost;
};

export type CaptureNotebookAiContextResult =
  | { ok: true; context: ZikukAiContext }
  | { ok: false; error: 'missing_host' | 'editor_destroyed' | 'no_doc' };
