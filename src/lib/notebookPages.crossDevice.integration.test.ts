/**
 * Two-device notebook persistence simulation (no browser auth required).
 *
 * Models:
 * - Device A/B isolated localStorage
 * - Cloud free_space_objects row
 * - Object-level LWW on updatedAt
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTEBOOK_SCHEMA_VERSION_V1,
  addNotebookPage,
  applyNotebookPersist,
  hydrateNotebookPages,
  migrateLegacyNotebook,
  prepareNotebookForCloudPersist,
  renameNotebookPage,
  switchNotebookPage,
  type NotebookContentWithPages,
} from './notebookPages';
import { shouldAcceptCloudObject } from './focusCache/freeSpaceObjectGeometryLww';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

function sampleNotebook(body = ''): NotebookContentWithPages {
  return {
    type: 'notebook',
    body,
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
  };
}

type DeviceStore = {
  localObjects: Map<string, ProjectSpaceObject>;
  storageKey: string;
};

type CloudStore = {
  objects: Map<string, ProjectSpaceObject>;
};

function makeNotebookObject(
  id: string,
  content: NotebookContentWithPages,
  updatedAt: number,
): ProjectSpaceObject {
  return {
    id,
    type: 'notebook',
    title: 'Test Notebook',
    content: content as ProjectSpaceObject['content'],
    createdAt: updatedAt,
    updatedAt,
  };
}

function persistDeviceLocal(device: DeviceStore, object: ProjectSpaceObject): void {
  device.localObjects.set(object.id, object);
}

function uploadToCloud(cloud: CloudStore, object: ProjectSpaceObject): void {
  cloud.objects.set(object.id, structuredClone(object));
}

function pullFromCloud(
  device: DeviceStore,
  cloud: CloudStore,
  objectId: string,
): ProjectSpaceObject | null {
  const cloudObj = cloud.objects.get(objectId);
  if (!cloudObj) return device.localObjects.get(objectId) ?? null;
  const local = device.localObjects.get(objectId);
  if (
    shouldAcceptCloudObject({
      cloud: cloudObj,
      local,
      protectedEntityIds: new Set(),
    })
  ) {
    const hydrated = {
      ...cloudObj,
      content: hydrateNotebookPages(cloudObj.content as NotebookContentWithPages),
    };
    device.localObjects.set(objectId, hydrated);
    return hydrated;
  }
  return local ?? null;
}

function pageBody(content: NotebookContentWithPages, title: string): string | undefined {
  return (content.pages ?? []).find(p => p.title === title)?.documentBody;
}

describe('notebook cross-device integration', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('A→B: multi-page manifest survives cloud persist without navigation fields', () => {
    const cloud: CloudStore = { objects: new Map() };
    const deviceA: DeviceStore = { localObjects: new Map(), storageKey: 'device-a' };
    const notebookId = 'ps-notebook-test-1';
    let updatedAt = 1_000;

    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const pageAId = nb.activePageId!;

    nb = renameNotebookPage(nb, pageAId, 'Economics');
    nb = switchNotebookPage(nb, pageAId, 'ECON-A');
    nb = addNotebookPage(nb, secId, 'ECON-A', 'Math');
    nb = renameNotebookPage(nb, nb.activePageId!, 'Math');
    const mathId = (nb.pages ?? []).find(p => p.title === 'Math')!.id;

    nb = switchNotebookPage(nb, mathId, 'MATH-A');
    nb = addNotebookPage(nb, secId, 'MATH-A', 'Notes');
    nb = renameNotebookPage(nb, nb.activePageId!, 'Notes');
    const notesId = (nb.pages ?? []).find(p => p.title === 'Notes')!.id;

    nb = switchNotebookPage(nb, notesId, 'NOTES-A');
    nb = addNotebookPage(nb, secId, 'NOTES-A', undefined, 'write');

    updatedAt = 2_000;
    const forCloud = prepareNotebookForCloudPersist(applyNotebookPersist(nb), notesId);
    expect(forCloud.activePageId).toBeUndefined();
    expect(forCloud.activeSectionId).toBeUndefined();
    expect((forCloud.pages ?? []).length).toBe(4);

    const objA = makeNotebookObject(notebookId, forCloud, updatedAt);
    persistDeviceLocal(deviceA, objA);
    uploadToCloud(cloud, objA);

    const deviceB: DeviceStore = { localObjects: new Map(), storageKey: 'device-b' };
    const pulledB = pullFromCloud(deviceB, cloud, notebookId)!;
    const contentB = pulledB.content as NotebookContentWithPages;

    expect(contentB.schemaVersion).toBe(NOTEBOOK_SCHEMA_VERSION_V1);
    expect((contentB.pages ?? []).length).toBe(4);
    expect((contentB.sections ?? [])[0]?.pageIds.length).toBe(4);
    expect(pageBody(contentB, 'Economics')).toBe('ECON-A');
    expect(pageBody(contentB, 'Math')).toBe('MATH-A');
    expect(pageBody(contentB, 'Notes')).toBe('NOTES-A');
    expect((contentB.pages ?? []).some(p => p.kind === 'write')).toBe(true);
  });

  it('B→A: sequential edit wins LWW without destroying other pages', () => {
    const cloud: CloudStore = { objects: new Map() };
    const deviceA: DeviceStore = { localObjects: new Map(), storageKey: 'device-a' };
    const deviceB: DeviceStore = { localObjects: new Map(), storageKey: 'device-b' };
    const notebookId = 'ps-notebook-test-2';

    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const pageAId = nb.activePageId!;
    nb = renameNotebookPage(nb, pageAId, 'Economics');
    nb = switchNotebookPage(nb, pageAId, 'ECON-A');
    nb = addNotebookPage(nb, secId, 'ECON-A', 'Math');
    nb = switchNotebookPage(nb, nb.activePageId!, 'MATH-A');

    const t1 = 1_000;
    const cloudT1 = prepareNotebookForCloudPersist(applyNotebookPersist(nb), nb.activePageId);
    uploadToCloud(cloud, makeNotebookObject(notebookId, cloudT1, t1));
    persistDeviceLocal(deviceA, makeNotebookObject(notebookId, cloudT1, t1));

    pullFromCloud(deviceB, cloud, notebookId);
    let localB = deviceB.localObjects.get(notebookId)!;
    let contentB = localB.content as NotebookContentWithPages;
    const mathPageId = (contentB.pages ?? []).find(p => p.title === 'Math')!.id;
    contentB = switchNotebookPage(contentB, mathPageId, 'MATH-A');
    contentB = applyNotebookPersist({ ...contentB, body: 'MATH-B' });
    contentB = addNotebookPage(contentB, secId, 'MATH-B', 'Device B Page');
    const t2 = 5_000;
    const cloudT2 = prepareNotebookForCloudPersist(contentB, contentB.activePageId);
    uploadToCloud(cloud, makeNotebookObject(notebookId, cloudT2, t2));
    persistDeviceLocal(deviceB, makeNotebookObject(notebookId, cloudT2, t2));

    const pulledA = pullFromCloud(deviceA, cloud, notebookId)!;
    const contentA = pulledA.content as NotebookContentWithPages;
    expect(pageBody(contentA, 'Math')).toBe('MATH-B');
    expect(pageBody(contentA, 'Economics')).toBe('ECON-A');
    expect((contentA.pages ?? []).some(p => p.title === 'Device B Page')).toBe(true);
    expect(pulledA.updatedAt).toBe(t2);
  });

  it('full A→B→A: exact acceptance scenario (pages, order, text, sequential edits)', () => {
    const cloud: CloudStore = { objects: new Map() };
    const deviceA: DeviceStore = { localObjects: new Map(), storageKey: 'device-a' };
    const deviceB: DeviceStore = { localObjects: new Map(), storageKey: 'device-b' };
    const notebookId = 'ps-notebook-acceptance';

    // --- DEVICE A: create notebook with Economics, Math, Notes + write page ---
    let nb = migrateLegacyNotebook(sampleNotebook(''));
    const secId = nb.activeSectionId!;
    const pageAId = nb.activePageId!;

    nb = renameNotebookPage(nb, pageAId, 'Economics');
    nb = switchNotebookPage(nb, pageAId, 'ECON-A');
    nb = addNotebookPage(nb, secId, 'ECON-A', 'Math');
    nb = renameNotebookPage(nb, nb.activePageId!, 'Math');
    const mathId = (nb.pages ?? []).find(p => p.title === 'Math')!.id;

    nb = switchNotebookPage(nb, mathId, 'MATH-A');
    nb = addNotebookPage(nb, secId, 'MATH-A', 'Notes');
    nb = renameNotebookPage(nb, nb.activePageId!, 'Notes');
    const notesId = (nb.pages ?? []).find(p => p.title === 'Notes')!.id;

    nb = switchNotebookPage(nb, notesId, 'NOTES-A');
    nb = addNotebookPage(nb, secId, 'NOTES-A', undefined, 'write');
    const writePageId = nb.activePageId!;

    const tA1 = 2_000;
    const cloudA1 = prepareNotebookForCloudPersist(applyNotebookPersist(nb), notesId);
    uploadToCloud(cloud, makeNotebookObject(notebookId, cloudA1, tA1));
    persistDeviceLocal(deviceA, makeNotebookObject(notebookId, cloudA1, tA1));

    // --- DEVICE B: pull and assert initial sync ---
    const pulledB1 = pullFromCloud(deviceB, cloud, notebookId)!;
    const contentB1 = pulledB1.content as NotebookContentWithPages;
    const sectionB = contentB1.sections![0]!;

    expect(contentB1.pages?.map(p => p.title)).toEqual(['Economics', 'Math', 'Notes', 'Page 4']);
    expect(sectionB.pageIds).toEqual(contentB1.pages!.map(p => p.id));
    expect(pageBody(contentB1, 'Economics')).toBe('ECON-A');
    expect(pageBody(contentB1, 'Math')).toBe('MATH-A');
    expect(pageBody(contentB1, 'Notes')).toBe('NOTES-A');
    expect((contentB1.pages ?? []).some(p => p.kind === 'write')).toBe(true);

    // --- DEVICE B: edit Math, add page, simulate write-page active ---
    let contentB2 = switchNotebookPage(contentB1, mathId, 'MATH-A');
    contentB2 = applyNotebookPersist({ ...contentB2, body: 'MATH-B' });
    contentB2 = addNotebookPage(contentB2, secId, 'MATH-B', 'DEVICE-B-PAGE');
    const tB2 = 5_000;
    const cloudB2 = prepareNotebookForCloudPersist(contentB2, contentB2.activePageId);
    uploadToCloud(cloud, makeNotebookObject(notebookId, cloudB2, tB2));
    persistDeviceLocal(deviceB, makeNotebookObject(notebookId, cloudB2, tB2));

    // --- DEVICE A: pull after B edits ---
    const pulledA2 = pullFromCloud(deviceA, cloud, notebookId)!;
    const contentA2 = pulledA2.content as NotebookContentWithPages;

    expect(pageBody(contentA2, 'Math')).toBe('MATH-B');
    expect(pageBody(contentA2, 'Economics')).toBe('ECON-A');
    expect(pageBody(contentA2, 'Notes')).toBe('NOTES-A');
    expect((contentA2.pages ?? []).some(p => p.title === 'DEVICE-B-PAGE')).toBe(true);
    expect(contentA2.pages?.map(p => p.title)).toEqual([
      'Economics',
      'Math',
      'Notes',
      'Page 4',
      'DEVICE-B-PAGE',
    ]);
    expect(pulledA2.updatedAt).toBe(tB2);

    // Stale local on A must not win on passive reopen
    const staleA = makeNotebookObject(
      notebookId,
      prepareNotebookForCloudPersist(
        { ...contentA2, pages: contentA2.pages!.map(p => (p.id === mathId ? { ...p, documentBody: 'MATH-A' } : p)) },
        mathId,
      ),
      1_000,
    );
    persistDeviceLocal(deviceA, staleA);
    const pulledA3 = pullFromCloud(deviceA, cloud, notebookId)!;
    expect(pageBody(pulledA3.content as NotebookContentWithPages, 'Math')).toBe('MATH-B');

    // Write page still present after round-trip
    expect((pulledA3.content as NotebookContentWithPages).pages?.some(p => p.id === writePageId)).toBe(true);
  });

  it('existing Notes notebook: stale Device B accepts newer multi-page cloud', () => {
    const cloud: CloudStore = { objects: new Map() };
    const deviceA: DeviceStore = { localObjects: new Map(), storageKey: 'device-a' };
    const deviceB: DeviceStore = { localObjects: new Map(), storageKey: 'device-b' };
    const notebookId = 'ps-notes-existing';

    // Pre-existing single-page Notes notebook on both devices (legacy shape migrated).
    let nb = migrateLegacyNotebook(sampleNotebook('old'));
    nb = renameNotebookPage(nb, nb.activePageId!, 'Page 1');
    const secId = nb.activeSectionId!;
    const page1Id = nb.activePageId!;

    const tStale = 1_000;
    persistDeviceLocal(deviceB, makeNotebookObject(notebookId, nb, tStale));
    persistDeviceLocal(deviceA, makeNotebookObject(notebookId, nb, tStale));

    // Device A: edit page 1 + add page 2 (physical acceptance scenario).
    nb = switchNotebookPage(nb, page1Id, 'SYNC-PAGE-1-A');
    nb = addNotebookPage(nb, secId, 'SYNC-PAGE-1-A', 'Page 2');
    const page2Id = nb.activePageId!;
    nb = switchNotebookPage(nb, page2Id, 'SYNC-PAGE-2-A');

    const tCloud = 5_000;
    const cloudPayload = prepareNotebookForCloudPersist(applyNotebookPersist(nb), page2Id);
    uploadToCloud(cloud, makeNotebookObject(notebookId, cloudPayload, tCloud));
    persistDeviceLocal(deviceA, makeNotebookObject(notebookId, cloudPayload, tCloud));

    const pulledB = pullFromCloud(deviceB, cloud, notebookId)!;
    const contentB = pulledB.content as NotebookContentWithPages;
    expect((contentB.pages ?? []).length).toBe(2);
    expect(pageBody(contentB, 'Page 1')).toBe('SYNC-PAGE-1-A');
    expect(pageBody(contentB, 'Page 2')).toBe('SYNC-PAGE-2-A');
    expect(pulledB.updatedAt).toBe(tCloud);
  });

  it('stale Device B local cannot overwrite newer cloud on pull', () => {
    const cloud: CloudStore = { objects: new Map() };
    const notebookId = 'ps-notebook-test-3';
    const secId = 'sec-notes';

    const cloudContent = prepareNotebookForCloudPersist(
      migrateLegacyNotebook({
        ...sampleNotebook(''),
        schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
        sections: [{ id: secId, title: 'Notes', pageIds: ['p1'] }],
        pages: [{ id: 'p1', sectionId: secId, kind: 'document', documentBody: 'CLOUD-NEW' }],
      }),
      'p1',
    );
    uploadToCloud(cloud, makeNotebookObject(notebookId, cloudContent, 5_000));

    const deviceB: DeviceStore = { localObjects: new Map(), storageKey: 'device-b' };
    persistDeviceLocal(
      deviceB,
      makeNotebookObject(
        notebookId,
        prepareNotebookForCloudPersist(
          migrateLegacyNotebook({
            ...sampleNotebook('STALE'),
            schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
            sections: [{ id: secId, title: 'Notes', pageIds: ['p1'] }],
            pages: [{ id: 'p1', sectionId: secId, kind: 'document', documentBody: 'STALE-LOCAL' }],
          }),
          'p1',
        ),
        1_000,
      ),
    );

    const pulled = pullFromCloud(deviceB, cloud, notebookId)!;
    expect((pulled.content as NotebookContentWithPages).pages?.[0]?.documentBody).toBe('CLOUD-NEW');
  });
});
