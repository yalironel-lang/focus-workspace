export const NOTEBOOK_SCHEMA_VERSION_V1 = 1;

export const LEGACY_DEFAULT_SECTION_ID = 'sec-notes';
export const LEGACY_DEFAULT_PAGE_ID = 'page-1';
export const LEGACY_DEFAULT_SECTION_TITLE = 'Notes';
export const LEGACY_DEFAULT_PAGE_TITLE = 'Page 1';

export type NotebookPageKind = 'document' | 'write';

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
  /** Write page IDB ink key (legacy alias: page-ink). */
  inkPageKey?: string;
  /** Optional PDF on canvas for past-exam practice (write pages only). */
  linkedPdfObjectId?: string;
}

export interface NotebookPagesFields {
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
