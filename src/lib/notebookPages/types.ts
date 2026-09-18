import type { NotebookPagePresentation } from './pagePresentation';

export const NOTEBOOK_SCHEMA_VERSION_V1 = 1;

export const LEGACY_DEFAULT_SECTION_ID = 'sec-notes';
export const LEGACY_DEFAULT_PAGE_ID = 'page-1';
export const LEGACY_DEFAULT_SECTION_TITLE = 'Notes';
export const LEGACY_DEFAULT_PAGE_TITLE = 'Page 1';

export type NotebookPageKind = 'document' | 'write';

export type {
  NotebookPagePresentation,
  NotebookPagePaperStyle,
  NotebookLayoutTemplateId,
} from './pagePresentation';

export interface NotebookSection {
  id: string;
  title: string;
  pageIds: string[];
  /** Reserved for Scratch section metadata (Phase 1: unused). */
  isScratchSection?: boolean;
}

export interface NotebookPage {
  id: string;
  sectionId: string;
  kind: NotebookPageKind;
  title?: string;
  /** Document page body (serialized blocks). */
  documentBody?: string;
  /** Codec for this exact documentBody; absent is legacy. */
  documentBodyCodecVersion?: number;
  /** Write page IDB ink key (legacy alias: page-ink). */
  inkPageKey?: string;
  /** Optional PDF on canvas for past-exam practice (write pages only). */
  linkedPdfObjectId?: string;
  /**
   * Optional visual/layout presentation for this page only.
   * Absent = inherit notebook paperStyle + layout 'free' at read time (never write on hydrate).
   * Never part of documentBody / codec / TipTap JSON.
   */
  presentation?: NotebookPagePresentation;
}

export interface NotebookPagesFields {
  /** Codec for top-level body projection only, never a global page codec. */
  bodyCodecVersion?: number;
  schemaVersion?: number;
  sections?: NotebookSection[];
  pages?: NotebookPage[];
  activeSectionId?: string;
  activePageId?: string;
}

export type NotebookContentWithPages = NotebookPagesFields & {
  type: 'notebook';
  body: string;
  /** Legacy ink mode — page 1 migrates to kind `write` with inkPageKey `page-ink`. */
  writingMode?: 'text' | 'ink';
};
