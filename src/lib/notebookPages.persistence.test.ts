/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTEBOOK_SCHEMA_VERSION_V1,
  addNotebookPage,
  applyNotebookPersist,
  deleteNotebookPage,
  hydrateNotebookPages,
  migrateLegacyNotebook,
  notebookManifestChanged,
  notebookManifestFingerprint,
  prepareNotebookForCloudPersist,
  renameNotebookPage,
  reorderNotebookPagesInSection,
  switchNotebookPage,
  type NotebookContentWithPages,
} from './notebookPages';

function sampleNotebook(body: string, extra: Partial<NotebookContentWithPages> = {}): NotebookContentWithPages {
  return {
    type: 'notebook',
    body,
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
    ...extra,
  };
}

describe('notebook pages persistence V1', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('A: legacy migration preserves body into documentBody', () => {
    const legacy = sampleNotebook('# Lecture\n\nFirst note.');
    const migrated = migrateLegacyNotebook(legacy);
    expect(migrated.schemaVersion).toBe(NOTEBOOK_SCHEMA_VERSION_V1);
    expect(migrated.pages?.[0]?.documentBody).toBe('# Lecture\n\nFirst note.');
    expect(migrated.body).toBe('# Lecture\n\nFirst note.');
  });

  it('B: existing V1 documentBody is not overwritten by stale content.body', () => {
    const v1: NotebookContentWithPages = {
      ...sampleNotebook('# Stale body'),
      schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['page-1'] }],
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-1',
          kind: 'document',
          title: 'Page 1',
          documentBody: '# Authoritative\n\nCloud text.',
        },
      ],
      activeSectionId: 'sec-1',
      activePageId: 'page-1',
    };
    const hydrated = hydrateNotebookPages(v1);
    expect(hydrated.pages?.[0]?.documentBody).toBe('# Authoritative\n\nCloud text.');
    expect(hydrated.body).toBe('# Authoritative\n\nCloud text.');
  });

  it('C: multiple pages retain distinct documentBody after persist/hydrate', () => {
    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const pageA = nb.activePageId!;

    nb = switchNotebookPage(nb, pageA, 'ECON-A');
    nb = addNotebookPage(nb, secId, 'ECON-A', 'Economics');
    const pageB = nb.activePageId!;
    nb = switchNotebookPage(nb, pageB, 'MATH-A');
    nb = addNotebookPage(nb, secId, 'MATH-A', 'Math');
    const pageC = nb.activePageId!;
    nb = switchNotebookPage(nb, pageC, 'NOTES-A');

    const hydrated = hydrateNotebookPages(nb);
    expect((hydrated.pages ?? []).find(p => p.id === pageA)?.documentBody).toBe('ECON-A');
    expect((hydrated.pages ?? []).find(p => p.id === pageB)?.documentBody).toBe('MATH-A');
    expect((hydrated.pages ?? []).find(p => p.id === pageC)?.documentBody).toBe('NOTES-A');
  });

  it('D: rename survives serialize/hydrate', () => {
    const base = migrateLegacyNotebook(sampleNotebook(''));
    const secId = base.activeSectionId!;
    const withB = addNotebookPage(base, secId, '', 'Page 2');
    const pageBId = withB.activePageId!;
    const renamed = renameNotebookPage(withB, pageBId, 'Economics');
    const hydrated = hydrateNotebookPages(renamed);
    expect((hydrated.pages ?? []).find(p => p.id === pageBId)?.title).toBe('Economics');
  });

  it('E: pageIds ordering survives serialize/hydrate', () => {
    const base = migrateLegacyNotebook(sampleNotebook(''));
    const secId = base.activeSectionId!;
    const pgA = base.activePageId!;
    let nb = addNotebookPage(base, secId, '', 'B');
    const pgB = nb.activePageId!;
    nb = addNotebookPage(nb, secId, '', 'C');
    const pgC = nb.activePageId!;
    nb = reorderNotebookPagesInSection(nb, secId, [pgC, pgA, pgB]);
    const hydrated = hydrateNotebookPages(nb);
    expect(hydrated.sections?.[0]?.pageIds).toEqual([pgC, pgA, pgB]);
  });

  it('F: passive hydrate does not change manifest fingerprint', () => {
    const nb = migrateLegacyNotebook(sampleNotebook('hello'));
    const before = notebookManifestFingerprint(nb);
    const after = notebookManifestFingerprint(hydrateNotebookPages(nb));
    expect(after).toBe(before);
  });

  it('G: navigation switch stores page bodies without cross-contamination', () => {
    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const pgA = nb.activePageId!;
    nb = switchNotebookPage(nb, pgA, 'AAA');
    nb = addNotebookPage(nb, secId, 'AAA', 'Page 2');
    const pgB = nb.activePageId!;
    nb = switchNotebookPage({ ...nb, body: 'BBB' }, pgA, 'BBB');
    expect((nb.pages ?? []).find(p => p.id === pgA)?.documentBody).toBe('AAA');
    expect((nb.pages ?? []).find(p => p.id === pgB)?.documentBody).toBe('BBB');
    nb = switchNotebookPage(nb, pgB, 'AAA');
    expect(nb.body).toBe('BBB');
  });

  it('H: cloud persist strips navigation fields; manifest compares without body drift', () => {
    const nb = migrateLegacyNotebook(sampleNotebook('local'));
    const secId = nb.activeSectionId!;
    const withB = addNotebookPage(nb, secId, 'local', 'Two');
    const cloud = prepareNotebookForCloudPersist(withB, withB.activePageId);
    expect(cloud.activePageId).toBeUndefined();
    expect(cloud.activeSectionId).toBeUndefined();
    expect(cloud.pages?.length).toBe(2);
    const localStale = { ...withB, body: 'stale-projection', updatedAt: 1 };
    expect(
      notebookManifestChanged(
        migrateLegacyNotebook(localStale),
        migrateLegacyNotebook({ ...withB, body: 'stale-projection' }),
      ),
    ).toBe(false);
  });

  it('I: applyNotebookPersist writes editor body to active document page only', () => {
    const base = migrateLegacyNotebook(sampleNotebook(''));
    const secId = base.activeSectionId!;
    const pgA = base.activePageId!;
    let nb = addNotebookPage(base, secId, 'OLD-A', 'B');
    const pgB = nb.activePageId!;
    nb = switchNotebookPage(nb, pgA, 'OLD-A');
    const edited = applyNotebookPersist({ ...nb, body: 'NEW-A' });
    expect((edited.pages ?? []).find(p => p.id === pgA)?.documentBody).toBe('NEW-A');
    expect((edited.pages ?? []).find(p => p.id === pgB)?.documentBody).toBe('OLD-A');
  });

  it('H: cloud persist without actives hydrates all pages on device B', () => {
    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const pgA = nb.activePageId!;
    nb = switchNotebookPage(nb, pgA, 'ECON-A');
    nb = addNotebookPage(nb, secId, 'ECON-A', 'Math');
    nb = switchNotebookPage(nb, nb.activePageId!, 'MATH-A');

    const cloud = prepareNotebookForCloudPersist(applyNotebookPersist(nb), nb.activePageId);
    expect(cloud.activePageId).toBeUndefined();

    const deviceB = hydrateNotebookPages(cloud);
    expect((deviceB.pages ?? []).length).toBe(2);
    expect((deviceB.pages ?? []).find(p => p.title === 'Math')?.documentBody).toBe('MATH-A');
    expect((deviceB.pages ?? []).find(p => p.id === pgA)?.documentBody).toBe('ECON-A');
  });

  it('P0 regression: stale parent prop must not drop page-2 manifest on editor persist', () => {
    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const page1Id = nb.activePageId!;
    nb = renameNotebookPage(nb, page1Id, 'Page 1');

    nb = switchNotebookPage(nb, page1Id, 'SYNC-PAGE-1-A');
    nb = addNotebookPage(nb, secId, 'SYNC-PAGE-1-A', 'Page 2');
    const page2Id = nb.activePageId!;
    nb = switchNotebookPage(nb, page2Id, 'SYNC-PAGE-2-A');

    const effectiveContent = nb;
    // Parent React prop lagging: only page-1 cloud snapshot (page 2 not in parent yet).
    const staleParentProp = prepareNotebookForCloudPersist(
      applyNotebookPersist(switchNotebookPage(migrateLegacyNotebook(sampleNotebook('')), page1Id, 'SYNC-PAGE-1-A')),
      page1Id,
    );
    expect((staleParentProp.pages ?? []).length).toBe(1);

    const buggyPersist = applyNotebookPersist({ ...staleParentProp, body: 'SYNC-PAGE-2-A' });
    expect((buggyPersist.pages ?? []).length).toBe(1);
    expect(buggyPersist.pages?.find(p => p.id === page2Id)).toBeUndefined();

    const fixedPersist = applyNotebookPersist({ ...effectiveContent, body: 'SYNC-PAGE-2-A' });
    expect((fixedPersist.pages ?? []).length).toBe(2);
    expect(fixedPersist.pages?.find(p => p.id === page1Id)?.documentBody).toBe('SYNC-PAGE-1-A');
    expect(fixedPersist.pages?.find(p => p.id === page2Id)?.documentBody).toBe('SYNC-PAGE-2-A');

    const forCloud = prepareNotebookForCloudPersist(fixedPersist, page2Id);
    expect(forCloud.pages?.length).toBe(2);
    expect(forCloud.body).toBe('SYNC-PAGE-2-A');
  });

  it('delete page removes manifest entry and returns ink key for write pages', () => {
    const base = migrateLegacyNotebook(sampleNotebook(''));
    const secId = base.activeSectionId!;
    const withWrite = addNotebookPage(base, secId, '', 'Ink', 'write');
    const writeId = withWrite.activePageId!;
    const { content: deleted, deletedInkKeys } = deleteNotebookPage(withWrite, writeId, '');
    expect((deleted.pages ?? []).find(p => p.id === writeId)).toBeUndefined();
    expect(deleted.sections?.[0]?.pageIds.includes(writeId)).toBe(false);
    expect(deletedInkKeys).toEqual([writeId]);
  });
});

describe('notebook pages feature flag opt-out', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('VITE_NOTEBOOK_V1_PAGES=false disables migration', () => {
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'false');
    const legacy = sampleNotebook('plain');
    const hydrated = hydrateNotebookPages(legacy);
    expect(hydrated.pages).toBeUndefined();
    expect(hydrated.body).toBe('plain');
  });
});
