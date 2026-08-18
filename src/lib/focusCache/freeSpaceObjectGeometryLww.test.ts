// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import { tryPersistLocalStorage } from '../freeSpacePersistWrite';
import {
  resetActiveFreeSpaceGeometryForTests,
  setFreeSpaceGeometryActive,
} from '../freeSpaceActiveGeometry';
import {
  applyFreeSpaceRemotePositions,
  registerFreeSpaceRemotePositionApply,
} from '../freeSpaceRemotePositionApply';
import {
  collectAcceptedGeometryPatches,
  mergeIncomingFreeSpaceObject,
  overlayBestLocalGeometry,
} from './freeSpaceObjectGeometryLww';
import { mergeFreeSpaceObjects } from '../freeSpaceLocalMerge';

function geom(
  x: number,
  y: number,
  w: number,
  h: number,
  updatedAt: number,
) {
  return { x, y, w, h, updatedAt };
}

function note(
  id: string,
  updatedAt: number,
  body = 'x',
  geometry?: ProjectSpaceObject['geometry'],
): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: body === 'x' ? 'Note' : body,
    content: { type: 'note', body },
    createdAt: 1,
    updatedAt,
    ...(geometry ? { geometry } : {}),
  };
}

const emptyProtected = new Set<string>();

function installMemoryLocalStorage(): void {
  const mem = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return mem.has(key) ? mem.get(key)! : null;
    },
    setItem(key: string, value: string) {
      mem.set(key, String(value));
    },
    clear() {
      mem.clear();
    },
    removeItem(key: string) {
      mem.delete(key);
    },
    key(i: number) {
      return [...mem.keys()][i] ?? null;
    },
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
}

beforeEach(() => {
  installMemoryLocalStorage();
  resetActiveFreeSpaceGeometryForTests();
  registerFreeSpaceRemotePositionApply(null);
});

afterEach(() => {
  resetActiveFreeSpaceGeometryForTests();
  registerFreeSpaceRemotePositionApply(null);
});

describe('PR C field-level geometry LWW', () => {
  it('A. remote newer geometry / local newer content → local content + remote geometry', () => {
    const local = note('a', 200, 'new title', geom(1, 1, 10, 10, 100));
    const cloud = note('a', 150, 'old title', geom(9, 9, 40, 40, 300));
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.contentAccepted).toBe(false);
    expect(merged.geometryAccepted).toBe(true);
    expect(merged.nextObject.content).toEqual({ type: 'note', body: 'new title' });
    expect(merged.nextObject.updatedAt).toBe(200);
    expect(merged.nextObject.geometry).toEqual(geom(9, 9, 40, 40, 300));
    expect(merged.positionPatch).toEqual({ x: 9, y: 9, w: 40, h: 40 });
  });

  it('B. remote newer content / local newer geometry → remote content + local geometry', () => {
    const local = note('a', 150, 'old title', geom(1, 1, 10, 10, 300));
    const cloud = note('a', 200, 'new title', geom(9, 9, 40, 40, 100));
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.contentAccepted).toBe(true);
    expect(merged.geometryAccepted).toBe(false);
    expect(merged.nextObject.content).toEqual({ type: 'note', body: 'new title' });
    expect(merged.nextObject.updatedAt).toBe(200);
    expect(merged.nextObject.geometry).toEqual(geom(1, 1, 10, 10, 300));
    expect(merged.positionPatch).toBeNull();
  });

  it('C. equal geometry.updatedAt → keep local, no PositionMap patch', () => {
    const local = note('a', 100, 'local', geom(1, 1, 10, 10, 50));
    const cloud = note('a', 100, 'cloud', geom(9, 9, 40, 40, 50));
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.geometryAccepted).toBe(false);
    expect(merged.nextObject.geometry).toEqual(geom(1, 1, 10, 10, 50));
    expect(merged.positionPatch).toBeNull();
  });

  it('D. local geometry absent, remote exists → remote applies', () => {
    const local = note('a', 200, 'local');
    const cloud = note('a', 100, 'cloud', geom(4, 5, 6, 7, 1));
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.contentAccepted).toBe(false);
    expect(merged.geometryAccepted).toBe(true);
    expect(merged.nextObject.geometry).toEqual(geom(4, 5, 6, 7, 1));
    expect(merged.positionPatch).toEqual({ x: 4, y: 5, w: 6, h: 7 });
  });

  it('E. remote geometry absent → PositionMap unchanged, local geometry kept', () => {
    const local = note('a', 100, 'local', geom(1, 1, 10, 10, 50));
    const cloud = note('a', 200, 'cloud');
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.contentAccepted).toBe(true);
    expect(merged.geometryAccepted).toBe(false);
    expect(merged.nextObject.content).toEqual({ type: 'note', body: 'cloud' });
    expect(merged.nextObject.geometry).toEqual(geom(1, 1, 10, 10, 50));
    expect(merged.positionPatch).toBeNull();
  });

  it('F. active local drag id → no PositionMap patch', () => {
    const local = note('a', 100, 'local', geom(1, 1, 10, 10, 50));
    const cloud = note('a', 100, 'cloud', geom(9, 9, 40, 40, 999));
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
      geometryBlockedIds: new Set(['a']),
    });
    expect(merged.geometryAccepted).toBe(false);
    expect(merged.positionPatch).toBeNull();
    expect(merged.nextObject.geometry).toEqual(geom(1, 1, 10, 10, 50));
  });

  it('G. active momentum id uses the same ownership set → no PositionMap patch', () => {
    setFreeSpaceGeometryActive('a', true);
    const local = note('a', 100, 'local', geom(1, 1, 10, 10, 50));
    const cloud = note('a', 100, 'cloud', geom(9, 9, 40, 40, 999));
    const patches = collectAcceptedGeometryPatches([local], [cloud], new Set(['a']));
    expect(patches).toEqual({});
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
      geometryBlockedIds: new Set(['a']),
    });
    expect(merged.geometryAccepted).toBe(false);
    expect(merged.positionPatch).toBeNull();
  });

  it('H. local final commit G2, stale Realtime echo G1 → G1 rejected', () => {
    const local = note('a', 100, 'local', geom(20, 20, 30, 30, 200));
    const cloud = note('a', 100, 'echo', geom(1, 1, 10, 10, 100));
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.geometryAccepted).toBe(false);
    expect(merged.nextObject.geometry?.updatedAt).toBe(200);
    expect(merged.positionPatch).toBeNull();
  });

  it('I. idle client B receives G2 → PositionMap patches to G2 exactly once', () => {
    const local = note('a', 100, 'b', geom(1, 1, 10, 10, 100));
    const g2 = note('a', 100, 'b', geom(50, 60, 70, 80, 200));
    const first = collectAcceptedGeometryPatches([local], [g2]);
    expect(first).toEqual({ a: { x: 50, y: 60, w: 70, h: 80 } });
    const after = [{ ...local, geometry: g2.geometry }];
    const second = collectAcceptedGeometryPatches(after, [g2]);
    expect(second).toEqual({});
  });

  it('J. remote apply does not enqueue UPDATE', () => {
    const applied: string[] = [];
    let enqueueCalls = 0;
    registerFreeSpaceRemotePositionApply(patches => {
      applied.push(...Object.keys(patches));
    });
    const local = [note('a', 200, 'new title', geom(1, 1, 10, 10, 100))];
    const cloud = note('a', 150, 'old title', geom(9, 9, 40, 40, 300));
    applyFreeSpaceRemotePositions(collectAcceptedGeometryPatches(local, [cloud]));
    expect(applied).toEqual(['a']);
    expect(enqueueCalls).toBe(0);
  });

  it('K. remote apply persists PositionMap for reload without enqueue', () => {
    const sectionId = 'prc-pos-section';
    const posKey = boardScopedFreeSpaceKeys(sectionId, 'main').positions;
    const local = [note('a', 100, 'b', geom(1, 1, 10, 10, 100))];
    const g2 = note('a', 100, 'b', geom(50, 60, 70, 80, 200));
    const patches = collectAcceptedGeometryPatches(local, [g2]);
    registerFreeSpaceRemotePositionApply(next => {
      const disk = JSON.parse(localStorage.getItem(posKey) ?? '{}') as Record<string, unknown>;
      const merged = { ...disk, ...next };
      tryPersistLocalStorage(posKey, JSON.stringify(merged), 'freeSpacePositions');
    });
    applyFreeSpaceRemotePositions(patches);
    const persisted = JSON.parse(localStorage.getItem(posKey) ?? '{}');
    expect(persisted.a).toMatchObject({ x: 50, y: 60, w: 70, h: 80 });
    expect(JSON.parse(localStorage.getItem(posKey)!).a).toMatchObject({ x: 50, y: 60, w: 70, h: 80 });
  });

  it('M. same-origin storage precedes Realtime → React keeps G1, cloud G2 patches PositionMap once', () => {
    const g1 = geom(10, 10, 200, 80, 1);
    const g2 = geom(400, 300, 200, 80, 50);
    const reactB = note('n1', 100, 'body', g1);
    const fromA = note('n1', 100, 'body', g2);

    const { merged } = mergeFreeSpaceObjects([reactB], [fromA]);
    expect(merged[0]?.geometry).toEqual(g1);

    let positionMap: Record<string, { x: number; y: number; w: number; h: number }> = {
      n1: { x: 10, y: 10, w: 200, h: 80 },
    };
    expect(positionMap.n1).toEqual({ x: 10, y: 10, w: 200, h: 80 });

    const localAfterLs = overlayBestLocalGeometry('n1', merged[0], merged, [fromA]);
    expect(localAfterLs?.geometry).toEqual(g1);

    const cloud = note('n1', 100, 'body', g2);
    const lww = mergeIncomingFreeSpaceObject({
      local: localAfterLs,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(lww.geometryAccepted).toBe(true);
    expect(lww.positionPatch).toEqual({ x: 400, y: 300, w: 200, h: 80 });

    const patches = collectAcceptedGeometryPatches(merged, [cloud]);
    expect(patches).toEqual({ n1: { x: 400, y: 300, w: 200, h: 80 } });

    const applied: Record<string, unknown>[] = [];
    registerFreeSpaceRemotePositionApply(next => {
      applied.push(next);
      positionMap = { ...positionMap, ...next };
    });
    applyFreeSpaceRemotePositions(patches);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual(patches);
    expect(positionMap.n1).toEqual({ x: 400, y: 300, w: 200, h: 80 });
  });

  it('N. equal cloud after this window already accepted G2 → zero patch, no enqueue', () => {
    const g2 = geom(400, 300, 200, 80, 50);
    const local = note('n1', 100, 'body', g2);
    let enqueueCalls = 0;
    const applied: unknown[] = [];
    registerFreeSpaceRemotePositionApply(next => {
      applied.push(next);
    });
    const patches = collectAcceptedGeometryPatches([local], [note('n1', 100, 'body', g2)]);
    expect(patches).toEqual({});
    applyFreeSpaceRemotePositions(patches);
    expect(applied).toEqual([]);
    expect(enqueueCalls).toBe(0);
  });

  it('O. content storage merge survives; geometry does not bypass the apply path', () => {
    const g1 = geom(10, 10, 200, 80, 1);
    const g2 = geom(400, 300, 200, 80, 50);

    const { merged: newerContent } = mergeFreeSpaceObjects(
      [note('n1', 100, 'old', g1)],
      [note('n1', 200, 'new', g2)],
    );
    expect(newerContent[0]?.content).toEqual({ type: 'note', body: 'new' });
    expect(newerContent[0]?.updatedAt).toBe(200);
    expect(newerContent[0]?.geometry).toEqual(g1);

    const { merged: equalContent } = mergeFreeSpaceObjects(
      [note('n1', 100, 'one', g1)],
      [note('n1', 100, 'two', g2)],
    );
    expect(equalContent[0]?.content).toEqual({ type: 'note', body: 'two' });
    expect(equalContent[0]?.geometry).toEqual(g1);

    expect(collectAcceptedGeometryPatches(newerContent, [note('n1', 200, 'new', g2)])).toEqual({
      n1: { x: 400, y: 300, w: 200, h: 80 },
    });
  });

  it('P. durable LS G2 does not poison cloud G2 vs this window G1', () => {
    const g1 = geom(10, 10, 200, 80, 1);
    const g2 = geom(400, 300, 200, 80, 50);
    const react = note('n1', 100, 'body', g1);
    const durable = note('n1', 100, 'body', g2);
    const cloud = note('n1', 100, 'body', g2);
    const local = overlayBestLocalGeometry('n1', react, [react], [durable]);
    expect(local?.geometry).toEqual(g1);
    expect(local?.updatedAt).toBe(100);
    const merged = mergeIncomingFreeSpaceObject({
      local,
      cloud,
      protectedEntityIds: emptyProtected,
    });
    expect(merged.geometryAccepted).toBe(true);
    expect(merged.positionPatch).toEqual({ x: 400, y: 300, w: 200, h: 80 });
  });
});
