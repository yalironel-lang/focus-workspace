/**
 * Notebook V1 Phase 1 — run: npx tsx src/lib/notebookPages.test.ts
 */
import { PAGE_INK_BLOCK_KEY } from './handwritingTypes';
import {
  LEGACY_DEFAULT_PAGE_ID,
  LEGACY_DEFAULT_SECTION_ID,
  LEGACY_DEFAULT_SECTION_TITLE,
  NOTEBOOK_SCHEMA_VERSION_V1,
  addNotebookPage,
  applyNotebookPersist,
  getNotebookPreviewMeta,
  getNotebookWorkspaceBreadcrumb,
  hydrateNotebookPages,
  migrateLegacyNotebook,
  sanitizeNotebookPagesFields,
  serializePageToBody,
  type NotebookContentWithPages,
} from './notebookPages';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

type SampleNotebook = {
  type: 'notebook';
  body: string;
  paperStyle: 'ruled';
  notebookMode: 'normal';
  notebookSurface: 'spatial';
  writingMode?: 'text' | 'ink';
};

function sampleNotebook(body: string, writingMode?: 'text' | 'ink'): SampleNotebook {
  return {
    type: 'notebook',
    body,
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
    ...(writingMode !== undefined ? { writingMode } : {}),
  };
}

// Legacy text notebook → Section "Notes" / Page 1 (document)
const legacy = sampleNotebook('# Lecture\n\nFirst note.');
const migrated = migrateLegacyNotebook(legacy as NotebookContentWithPages);
assert(migrated.schemaVersion === NOTEBOOK_SCHEMA_VERSION_V1, 'schemaVersion set');
assert(migrated.sections?.length === 1, 'one section');
assert(migrated.sections?.[0]?.title === LEGACY_DEFAULT_SECTION_TITLE, 'section title Notes');
assert(migrated.sections?.[0]?.id === LEGACY_DEFAULT_SECTION_ID, 'section id');
assert(migrated.pages?.length === 1, 'one page');
assert(migrated.pages?.[0]?.kind === 'document', 'document page');
assert(migrated.pages?.[0]?.documentBody === legacy.body, 'documentBody mirrors body');
assert(migrated.activeSectionId === LEGACY_DEFAULT_SECTION_ID, 'active section');
assert(migrated.activePageId === LEGACY_DEFAULT_PAGE_ID, 'active page');

// Ink notebook → write page with page-ink key
const ink = sampleNotebook('', 'ink');
const inkMigrated = migrateLegacyNotebook(ink as NotebookContentWithPages);
assert(inkMigrated.pages?.[0]?.kind === 'write', 'ink → write page');
assert(inkMigrated.pages?.[0]?.inkPageKey === PAGE_INK_BLOCK_KEY, 'legacy inkPageKey page-ink');

// New write pages use page id as ink key
const docBase = migrateLegacyNotebook(sampleNotebook('') as NotebookContentWithPages);
const secId = docBase.activeSectionId!;
const inkPage = addNotebookPage(docBase, secId, '', 'PS Work', 'write');
const writePage = (inkPage.pages ?? []).find(p => p.kind === 'write');
assert(writePage?.inkPageKey === writePage?.id, 'new write page uses page id ink key');

// serializePageToBody
assert(
  serializePageToBody({ id: 'p', sectionId: 's', kind: 'document', documentBody: 'abc' }) === 'abc',
  'serialize document body',
);
assert(
  serializePageToBody({ id: 'p', sectionId: 's', kind: 'write', inkPageKey: PAGE_INK_BLOCK_KEY }, 'legacy') === 'legacy',
  'serialize write keeps legacy body',
);

// Idempotent migration
const again = migrateLegacyNotebook(migrated);
assert(again.pages?.[0]?.documentBody === migrated.pages?.[0]?.documentBody, 'idempotent migrate');

// documentBody is authoritative — stale body must not overwrite on hydrate
const stale = {
  ...migrated,
  body: '# Updated\n',
  pages: [{ ...migrated.pages![0]!, documentBody: '# Old\n' }],
};
const resynced = hydrateNotebookPages(stale as NotebookContentWithPages);
assert(resynced.pages?.[0]?.documentBody === '# Old\n', 'documentBody preserved over stale body');
assert(resynced.body === '# Old\n', 'derived body from documentBody');

// Sanitize preserves valid pages
const sanitized = sanitizeNotebookPagesFields({
  schemaVersion: 1,
  sections: [{ id: 's1', title: 'S', pageIds: ['p1'] }],
  pages: [{ id: 'p1', sectionId: 's1', kind: 'document', documentBody: 'x' }],
  activeSectionId: 's1',
  activePageId: 'p1',
});
assert(sanitized.pages?.length === 1 && sanitized.activePageId === 'p1', 'sanitize pages');

// Flag OFF: persist must not add pages (opt-out via env)
process.env.VITE_NOTEBOOK_V1_PAGES = 'false';
// Re-import would be needed for tsx runner; skip when default-on — covered by vitest opt-out test.
const flagOffNote = 'flag off covered by notebookPages.persistence.test.ts';
void flagOffNote;

// Preview metadata (workspace card)
const previewContent = {
  ...migrated,
  body: '# Lecture\n\nFirst note.\n\nSecond line.',
  sections: [
    { id: 's1', title: 'Week 1', pageIds: ['p1', 'p2'] },
    { id: 's2', title: 'Week 2', pageIds: ['p3'] },
  ],
  pages: [
    { id: 'p1', sectionId: 's1', kind: 'document', documentBody: 'A' },
    { id: 'p2', sectionId: 's1', kind: 'document', documentBody: 'B' },
    { id: 'p3', sectionId: 's2', kind: 'document', documentBody: 'C' },
  ],
  activeSectionId: 's1',
  activePageId: 'p2',
} as NotebookContentWithPages;
const preview = getNotebookPreviewMeta(previewContent);
assert(preview.sectionTitle === 'Week 1', 'preview section title');
assert(preview.pageTitle === 'Page 2', 'preview page title');
assert(preview.pageIndexInSection === 2, 'preview page index');
assert(preview.pagesInSection === 2, 'preview pages in section');
assert(preview.totalPages === 3, 'preview total pages');
assert(preview.snippet.includes('Lecture'), 'preview snippet from body');
assert(
  getNotebookWorkspaceBreadcrumb(previewContent) === 'Week 1 › Page 2',
  'workspace breadcrumb',
);

console.log('notebookPages.test.ts: all passed');
