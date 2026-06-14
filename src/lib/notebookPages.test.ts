/**
 * Notebook V1 Phase 1 — run: npx tsx src/lib/notebookPages.test.ts
 */
import { PAGE_INK_BLOCK_KEY } from './handwritingTypes';
import {
  LEGACY_DEFAULT_PAGE_ID,
  LEGACY_DEFAULT_SECTION_ID,
  LEGACY_DEFAULT_SECTION_TITLE,
  NOTEBOOK_SCHEMA_VERSION_V1,
  applyNotebookPersist,
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
assert(inkMigrated.pages?.[0]?.inkPageKey === PAGE_INK_BLOCK_KEY, 'inkPageKey page-ink');

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
assert(again.pages?.[0]?.documentBody === migrated.body, 'idempotent migrate');

// Body wins over stale documentBody on re-migrate
const stale = {
  ...migrated,
  body: '# Updated\n',
  pages: [{ ...migrated.pages![0]!, documentBody: '# Old\n' }],
};
const resynced = migrateLegacyNotebook(stale as NotebookContentWithPages);
assert(resynced.pages?.[0]?.documentBody === '# Updated\n', 'body resyncs documentBody');

// Sanitize preserves valid pages
const sanitized = sanitizeNotebookPagesFields({
  schemaVersion: 1,
  sections: [{ id: 's1', title: 'S', pageIds: ['p1'] }],
  pages: [{ id: 'p1', sectionId: 's1', kind: 'document', documentBody: 'x' }],
  activeSectionId: 's1',
  activePageId: 'p1',
});
assert(sanitized.pages?.length === 1 && sanitized.activePageId === 'p1', 'sanitize pages');

// Flag OFF: persist must not add pages (default in tsx runner)
const flagOff = applyNotebookPersist(sampleNotebook('plain') as NotebookContentWithPages);
assert(flagOff.pages === undefined, 'flag off: no pages written');
assert(flagOff.body === 'plain', 'flag off: body unchanged');

// Flag OFF hydrate is no-op
const flagOffHydrate = hydrateNotebookPages(migrated as NotebookContentWithPages);
assert(flagOffHydrate === migrated, 'flag off hydrate noop');

console.log('notebookPages.test.ts: all passed');
