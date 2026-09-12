import { afterEach, expect, it, vi } from 'vitest';
import { serializeNotebookBlocks } from '../notebookDialect';
import { writeNotebookSnapshot } from '../knowledge/notebookSnapshotStore';
import { restoreNotebookSnapshot } from '../knowledge/knowledgeRestore';
import { idbPut } from '../knowledge/knowledgeJournalIdb';
import { deriveBodyFromActivePage } from '../notebookPages/hydrate';
import type { NotebookSnapshot } from '../knowledge/knowledgeTypes';
vi.mock('../knowledge/knowledgeJournalIdb', () => ({ SNAPSHOTS_STORE: 'snapshots', idbPut: vi.fn().mockResolvedValue(undefined), idbGetByIndex: vi.fn().mockResolvedValue([]), idbDelete: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const body = serializeNotebookBlocks([{ id: 'p', kind: 'paragraph', text: '# literal' }], 1);
it.each([undefined, 1])('existing snapshot copies retain exact codec version %s', async version => {
  vi.mocked(idbPut).mockClear();
  await writeNotebookSnapshot({ sectionId: 's', boardId: 'b', objectId: 'o', objectTitle: 'Notebook', body, bodyCodecVersion: version, editGeneration: 1 });
  expect(idbPut).toHaveBeenCalledOnce();
  const row = vi.mocked(idbPut).mock.calls[0][1] as NotebookSnapshot;
  expect(row.body).toBe(body); expect(row.bodyCodecVersion).toBe(version);
  if (version === undefined) expect(row).not.toHaveProperty('bodyCodecVersion');
});
it.each([undefined, 1])('snapshot body projection cannot inherit stale codec metadata: %s', async version => {
  const write = vi.fn();
  vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(JSON.stringify([{ id: 'o', type: 'notebook', content: { type: 'notebook', body: 'old', bodyCodecVersion: 99 } }])), setItem: write });
  await restoreNotebookSnapshot({ id: 'snapshot', sectionId: 's', boardId: 'b', objectId: 'o', objectTitle: 'Notebook', body, bodyCodecVersion: version, createdAt: 1, editGeneration: 1 });
  const saved = JSON.parse(write.mock.calls[0][1]);
  expect(saved[0].content.body).toBe(body); expect(saved[0].content.bodyCodecVersion).toBe(version);
});
it.each([undefined, 1])('snapshot restore with multi-page notebook updates active page and survives deriveBodyFromActivePage: %s', async version => {
  const write = vi.fn();
  const initialContent = {
    type: 'notebook',
    schemaVersion: 1,
    activeSectionId: 's',
    activePageId: 'p1',
    body: 'old-body',
    bodyCodecVersion: 99,
    sections: [{ id: 's', title: 'Notes', pageIds: ['p1', 'p2'] }],
    pages: [
      { id: 'p1', sectionId: 's', kind: 'document', title: 'Page 1', documentBody: 'old-body', documentBodyCodecVersion: 99 },
      { id: 'p2', sectionId: 's', kind: 'document', title: 'Page 2', documentBody: 'other', documentBodyCodecVersion: 1 },
    ],
  };
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(JSON.stringify([{ id: 'o', type: 'notebook', content: initialContent }])),
    setItem: write,
  });
  await restoreNotebookSnapshot({
    id: 'snapshot',
    sectionId: 's',
    boardId: 'b',
    objectId: 'o',
    objectTitle: 'Notebook',
    body,
    bodyCodecVersion: version,
    createdAt: 1,
    editGeneration: 1,
  });
  const saved = JSON.parse(write.mock.calls[0][1]);
  const restoredContent = saved[0].content;
  expect(restoredContent.body).toBe(body);
  expect(restoredContent.bodyCodecVersion).toBe(version);
  expect(restoredContent.pages[0].documentBody).toBe(body);
  expect(restoredContent.pages[0].documentBodyCodecVersion).toBe(version);
  expect(restoredContent.pages[1].documentBody).toBe('other');
  expect(restoredContent.pages[1].documentBodyCodecVersion).toBe(1);

  const derived = deriveBodyFromActivePage(restoredContent);
  expect(derived.body).toBe(body);
  expect(derived.bodyCodecVersion).toBe(version);
});
