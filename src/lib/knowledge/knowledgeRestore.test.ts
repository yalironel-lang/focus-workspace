// @vitest-environment happy-dom
/**
 * M7.0 — Restore safety: no false success; tombstone survives persist failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestLocalStorage } from './testLocalStorage';
ensureTestLocalStorage();
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { FreeSpaceObjectTombstone } from './knowledgeTypes';
import { TOMBSTONES_STORE, idbPut, resetKnowledgeJournalDbForTests } from './knowledgeJournalIdb';
import { restoreFromTombstone } from './knowledgeRestore';
import { deleteTombstonePermanently, listTombstones } from './tombstoneStore';
import { hwSet, hwGet, resetNotebookHandwritingStoreForTests } from '../notebookHandwritingStore';
import { nbImageSaveBlob, nbImageLoadBlob } from '../notebookImageStore';
import { emptyHandwritingData } from '../handwritingTypes';


const cancelDeletes = vi.hoisted(() => vi.fn(async () => ({ ok: true, removed: 1 })));
const enqueueCreate = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const cascadeSpy = vi.hoisted(() => vi.fn(async () => ({ handwriting: 0, images: 0 })));

vi.mock('../focusCache/freeSpaceObjectDeleteEnqueue', () => ({
  cancelPendingFreeSpaceObjectDeletes: cancelDeletes,
  enqueueFreeSpaceObjectDeletesAfterLocalDelete: vi.fn(),
  enqueueFreeSpaceObjectDelete: vi.fn(),
}));

vi.mock('../focusCache/freeSpaceObjectCreateEnqueue', () => ({
  enqueueFreeSpaceObjectCreate: enqueueCreate,
  FREE_SPACE_OBJECT_ENTITY_TYPE: 'free_space_object',
  buildFreeSpaceObjectWritePayload: vi.fn(),
}));

vi.mock('../notebookDeleteCascade', () => ({
  cascadeDeleteNotebookAssets: cascadeSpy,
}));

vi.mock('../notebookImageStore', async importOriginal => {
  const mod = await importOriginal<typeof import('../notebookImageStore')>();
  const mem = new Map<string, Blob>();
  return {
    ...mod,
    nbImageLoadBlob: vi.fn(async (key: string) => mem.get(key)),
    nbImageSaveBlob: vi.fn(async (key: string, blob: Blob) => {
      mem.set(key, blob);
      return true;
    }),
    nbImageDelete: vi.fn(async (key: string) => {
      mem.delete(key);
    }),
  };
});

const SECTION = 'sec-m70-restore';
const BOARD = 'main';
const USER = 'user-m70';

function objectsKey() {
  return boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
}

function notebookObject(overrides?: Partial<ProjectSpaceObject>): ProjectSpaceObject {
  return {
    id: 'nb-m70-1',
    type: 'notebook',
    title: 'Restore Safety NB',
    content: {
      type: 'notebook',
      body: 'UNIQUE_RESTORE_MARKER page-one',
      schemaVersion: 1,
      sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1', 'page-2'] }],
      pages: [
        {
          id: 'page-1',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'Page 1',
          documentBody: 'UNIQUE_RESTORE_MARKER page-one',
          documentBodyCodecVersion: 1,
        },
        {
          id: 'page-2',
          sectionId: 'sec-notes',
          kind: 'document',
          title: 'Page 2',
          documentBody: 'page-two-body',
          documentBodyCodecVersion: 1,
        },
      ],
      activeSectionId: 'sec-notes',
      activePageId: 'page-1',
    },
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeTombstone(payload: ProjectSpaceObject): FreeSpaceObjectTombstone {
  const now = Date.now();
  return {
    id: `ts-m70-${payload.id}`,
    kind: 'free_space_object',
    sectionId: SECTION,
    boardId: BOARD,
    deletedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    label: payload.title || 'Notebook',
    objectId: payload.id,
    objectType: payload.type,
    payload,
    position: { x: 10, y: 20, w: 400, h: 300 },
  };
}

async function resetKnowledgeDb(): Promise<void> {
  await resetKnowledgeJournalDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('fw_knowledge_journal_v1');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('delete knowledge db failed'));
    req.onblocked = () => resolve();
  });
  await resetKnowledgeJournalDbForTests();
}

function withFailingObjectsWrite<T>(fn: () => Promise<T>): Promise<T> {
  const key = objectsKey();
  ensureTestLocalStorage();
  const original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = ((k: string, value: string) => {
    if (k === key) throw new DOMException('QuotaExceededError');
    return original(k, value);
  }) as Storage['setItem'];
  return fn().finally(() => {
    localStorage.setItem = original;
  });
}

beforeEach(async () => {
  ensureTestLocalStorage();
  localStorage.clear();
  cancelDeletes.mockClear();
  enqueueCreate.mockClear();
  cascadeSpy.mockClear();
  resetNotebookHandwritingStoreForTests();
  await resetKnowledgeDb();
});

afterEach(() => {
  ensureTestLocalStorage();
  localStorage.clear();
});

describe('M7.0 restore safety', () => {
  it('1. successful restore → durable object, tombstone removed, ok:true', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    window.localStorage.setItem(objectsKey(), JSON.stringify([]));

    const result = await restoreFromTombstone(ts, { userId: USER });
    expect(result).toEqual({ ok: true });

    const objects = JSON.parse(window.localStorage.getItem(objectsKey())!) as ProjectSpaceObject[];
    expect(objects).toHaveLength(1);
    expect(objects[0]!.id).toBe(payload.id);
    expect(objects[0]!.content.type).toBe('notebook');
    if (objects[0]!.content.type === 'notebook') {
      expect(objects[0]!.content.body).toContain('UNIQUE_RESTORE_MARKER');
      expect(objects[0]!.content.pages).toHaveLength(2);
    }

    const remaining = await listTombstones(SECTION);
    expect(remaining.find(r => r.id === ts.id)).toBeUndefined();
    expect(cancelDeletes).toHaveBeenCalled();
    expect(enqueueCreate).toHaveBeenCalled();
  });

  it('2–3. persistence failure → ok:false, tombstone remains, no false success', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    window.localStorage.setItem(objectsKey(), JSON.stringify([]));

    const result = await withFailingObjectsWrite(() => restoreFromTombstone(ts, { userId: USER }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason.length).toBeGreaterThan(0);

    expect(JSON.parse(window.localStorage.getItem(objectsKey())!)).toEqual([]);
    const remaining = await listTombstones(SECTION);
    expect(remaining.some(r => r.id === ts.id)).toBe(true);
    expect(enqueueCreate).not.toHaveBeenCalled();
  });

  it('4. restore retry after failure can succeed safely', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    window.localStorage.setItem(objectsKey(), JSON.stringify([]));

    const first = await withFailingObjectsWrite(() => restoreFromTombstone(ts, { userId: USER }));
    expect(first.ok).toBe(false);
    expect((await listTombstones(SECTION)).some(r => r.id === ts.id)).toBe(true);

    const second = await restoreFromTombstone(ts, { userId: USER });
    expect(second).toEqual({ ok: true });
    const objects = JSON.parse(window.localStorage.getItem(objectsKey())!) as ProjectSpaceObject[];
    expect(objects[0]!.id).toBe(payload.id);
    expect((await listTombstones(SECTION)).find(r => r.id === ts.id)).toBeUndefined();
  });

  it('5. Notebook pages/content survive successful restore', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    window.localStorage.setItem(objectsKey(), JSON.stringify([]));

    await restoreFromTombstone(ts, { userId: USER });
    const objects = JSON.parse(window.localStorage.getItem(objectsKey())!) as ProjectSpaceObject[];
    const nb = objects[0]!;
    expect(nb.content.type).toBe('notebook');
    if (nb.content.type !== 'notebook') return;
    expect(nb.content.pages?.map(p => p.id)).toEqual(['page-1', 'page-2']);
    expect(nb.content.pages?.[1]?.documentBody).toBe('page-two-body');
    expect(nb.content.activePageId).toBe('page-1');
  });

  it('6. incomplete tombstone payload fails closed (no empty notebook)', async () => {
    const ts = makeTombstone(notebookObject());
    (ts as { payload: Partial<ProjectSpaceObject> }).payload = { id: ts.objectId } as ProjectSpaceObject;
    await idbPut(TOMBSTONES_STORE, ts);
    window.localStorage.setItem(objectsKey(), JSON.stringify([]));

    const result = await restoreFromTombstone(ts, { userId: USER });
    expect(result.ok).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(objectsKey())!)).toEqual([]);
    expect((await listTombstones(SECTION)).some(r => r.id === ts.id)).toBe(true);
  });

  it('7. permanent delete cascades notebook assets', async () => {
    const payload = notebookObject({
      content: {
        type: 'notebook',
        body: '::hw::hw-keep::\n::img::img-keep::alt::',
      },
    });
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);

    await deleteTombstonePermanently(ts, { userId: USER });
    expect(cascadeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        sectionId: SECTION,
        objectId: payload.id,
      }),
    );
    expect((await listTombstones(SECTION)).find(r => r.id === ts.id)).toBeUndefined();
  });

  it('7b. permanent delete keeps tombstone if notebook cascade throws', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    cascadeSpy.mockRejectedValueOnce(new Error('cascade boom'));

    await expect(deleteTombstonePermanently(ts, { userId: USER })).rejects.toThrow(/cascade boom/);
    expect((await listTombstones(SECTION)).some(r => r.id === ts.id)).toBe(true);
  });

  it('idempotent: equivalent object present clears tombstone without duplicating', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    localStorage.setItem(objectsKey(), JSON.stringify([{ ...payload, updatedAt: 999 }]));

    const result = await restoreFromTombstone(ts, { userId: USER });
    expect(result).toEqual({ ok: true });
    const objects = JSON.parse(localStorage.getItem(objectsKey())!) as ProjectSpaceObject[];
    expect(objects).toHaveLength(1);
    expect((await listTombstones(SECTION)).find(r => r.id === ts.id)).toBeUndefined();
  });

  it('same-id conflicting object does NOT clear tombstone', async () => {
    const payload = notebookObject();
    const ts = makeTombstone(payload);
    await idbPut(TOMBSTONES_STORE, ts);
    const conflicting: ProjectSpaceObject = {
      ...payload,
      content: { type: 'notebook', body: 'DIFFERENT_HOLLOW_BODY' },
    };
    localStorage.setItem(objectsKey(), JSON.stringify([conflicting]));

    const result = await restoreFromTombstone(ts, { userId: USER });
    expect(result.ok).toBe(false);
    expect((await listTombstones(SECTION)).some(r => r.id === ts.id)).toBe(true);
    const objects = JSON.parse(localStorage.getItem(objectsKey())!) as ProjectSpaceObject[];
    expect(objects).toHaveLength(1);
    expect(objects[0]!.content.type === 'notebook' && objects[0]!.content.body).toBe(
      'DIFFERENT_HOLLOW_BODY',
    );
  });
});
describe('M7.0 soft-delete assets survive until permanent delete', () => {
  it('handwriting + image blobs remain after tombstone write (no cascade)', async () => {
    const hwKey = 'hw-survives';
    const imageKey = 'img-survives';
    await hwSet('nb-m70-1', hwKey, { ...emptyHandwritingData(), updatedAt: 1 });
    await nbImageSaveBlob(imageKey, new Blob([new Uint8Array([9])], { type: 'image/png' }));

    const ts = makeTombstone(
      notebookObject({
        content: {
          type: 'notebook',
          body: `::hw::${hwKey}::\n::img::${imageKey}::alt::`,
        },
      }),
    );
    await idbPut(TOMBSTONES_STORE, ts);

    expect(await hwGet('nb-m70-1', hwKey)).not.toBeNull();
    expect(await nbImageLoadBlob(imageKey)).toBeDefined();
    expect(cascadeSpy).not.toHaveBeenCalled();
  });
});
