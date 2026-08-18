// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PositionMap } from '../hooks/useBlockPositions';
import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import {
  mergeFreeSpaceObjects,
  mergePositionMaps,
  persistWithPendingDeletes,
} from './freeSpaceLocalMerge';

function makeObj(id: string, updatedAt: number, body = ''): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: `title-${id}`,
    content: { type: 'note', body } as ProjectObjectContent,
    createdAt: 1,
    updatedAt,
  };
}

const ids = (objs: ProjectSpaceObject[]) => objs.map(o => o.id).sort();

describe('mergeFreeSpaceObjects — existing behaviour (no deletedIds)', () => {
  it('unions concurrent additions from both sides', () => {
    const base = [makeObj('a', 10)];
    const incoming = [makeObj('b', 20)];
    const { merged, conflicts } = mergeFreeSpaceObjects(base, incoming);
    expect(ids(merged)).toEqual(['a', 'b']);
    expect(conflicts).toEqual([]);
  });

  it('newer incoming update wins over the disk copy', () => {
    const base = [makeObj('a', 10, 'old')];
    const incoming = [makeObj('a', 20, 'new')];
    const { merged, conflicts } = mergeFreeSpaceObjects(base, incoming);
    expect(merged).toHaveLength(1);
    expect((merged[0].content as { body: string }).body).toBe('new');
    expect(conflicts).toEqual([]);
  });

  it('older incoming loses to a newer disk copy and records a conflict', () => {
    const base = [makeObj('a', 30, 'disk-newer')];
    const incoming = [makeObj('a', 20, 'stale')];
    const { merged, conflicts } = mergeFreeSpaceObjects(base, incoming);
    expect(merged).toHaveLength(1);
    expect((merged[0].content as { body: string }).body).toBe('disk-newer');
    expect(conflicts).toHaveLength(1);
  });

  it('same updatedAt with different content — incoming wins and records a conflict', () => {
    const base = [makeObj('a', 10, 'one')];
    const incoming = [makeObj('a', 10, 'two')];
    const { merged, conflicts } = mergeFreeSpaceObjects(base, incoming);
    expect(merged).toHaveLength(1);
    expect((merged[0].content as { body: string }).body).toBe('two');
    expect(conflicts).toHaveLength(1);
  });

  it('O. sibling geometry is not copied onto an existing local object', () => {
    const g1 = { x: 10, y: 10, w: 200, h: 80, updatedAt: 1 };
    const g2 = { x: 400, y: 300, w: 200, h: 80, updatedAt: 50 };
    const base: ProjectSpaceObject[] = [{ ...makeObj('a', 10, 'one'), geometry: g1 }];
    const incomingEqual: ProjectSpaceObject[] = [{ ...makeObj('a', 10, 'two'), geometry: g2 }];
    const { merged: equalMerged } = mergeFreeSpaceObjects(base, incomingEqual);
    expect((equalMerged[0].content as { body: string }).body).toBe('two');
    expect(equalMerged[0].geometry).toEqual(g1);

    const incomingNewer: ProjectSpaceObject[] = [{ ...makeObj('a', 20, 'new'), geometry: g2 }];
    const { merged: newerMerged } = mergeFreeSpaceObjects(base, incomingNewer);
    expect((newerMerged[0].content as { body: string }).body).toBe('new');
    expect(newerMerged[0].geometry).toEqual(g1);
  });

  it('legacy object without geometry stays without geometry when sibling LS has geometry', () => {
    const g2 = { x: 400, y: 300, w: 200, h: 80, updatedAt: 50 };
    const base = [makeObj('a', 10, 'one')];
    const incoming: ProjectSpaceObject[] = [{ ...makeObj('a', 10, 'two'), geometry: g2 }];
    const { merged } = mergeFreeSpaceObjects(base, incoming);
    expect(merged[0].geometry).toBeUndefined();
    expect((merged[0].content as { body: string }).body).toBe('two');
  });

  it('storage-event style merge (in-memory as base, remote as incoming) still unions', () => {
    const inMemory = [makeObj('local', 10)];
    const remote = [makeObj('local', 10), makeObj('remote', 15)];
    const { merged } = mergeFreeSpaceObjects(inMemory, remote);
    expect(ids(merged)).toEqual(['local', 'remote']);
  });
});

describe('mergeFreeSpaceObjects — deletedIds', () => {
  it('delete beats a stale disk copy: deleted id on disk never resurrects', () => {
    const disk = [makeObj('keep', 10), makeObj('deleted', 10)];
    const pending = [makeObj('keep', 10)];
    const { merged } = mergeFreeSpaceObjects(disk, pending, new Set(['deleted']));
    expect(ids(merged)).toEqual(['keep']);
  });

  it('deleted id is excluded even if still present in the pending snapshot', () => {
    const disk = [makeObj('deleted', 10)];
    const pending = [makeObj('deleted', 99), makeObj('keep', 10)];
    const { merged } = mergeFreeSpaceObjects(disk, pending, new Set(['deleted']));
    expect(ids(merged)).toEqual(['keep']);
  });

  it('concurrent additions from another tab still merge alongside a delete', () => {
    const disk = [makeObj('deleted', 10), makeObj('other-tab', 20)];
    const pending = [makeObj('mine', 30)];
    const { merged } = mergeFreeSpaceObjects(disk, pending, new Set(['deleted']));
    expect(ids(merged)).toEqual(['mine', 'other-tab']);
  });

  it('empty deletedIds set behaves exactly like omitting the parameter', () => {
    const base = [makeObj('a', 10)];
    const incoming = [makeObj('a', 20), makeObj('b', 5)];
    const without = mergeFreeSpaceObjects(base, incoming);
    const withEmpty = mergeFreeSpaceObjects(base, incoming, new Set());
    expect(withEmpty).toEqual(without);
  });
});

describe('mergePositionMaps', () => {
  const pos = (x: number, y: number) => ({ x, y, w: 100, h: 100 });

  it('existing overlay behaviour is unchanged without deletedIds', () => {
    const disk: PositionMap = { a: pos(1, 1), b: pos(2, 2) };
    const pending: PositionMap = { b: pos(9, 9), c: pos(3, 3) };
    expect(mergePositionMaps(disk, pending)).toEqual({
      a: pos(1, 1),
      b: pos(9, 9),
      c: pos(3, 3),
    });
  });

  it('deleted ids are removed from both disk and pending sides', () => {
    const disk: PositionMap = { deleted: pos(1, 1), keep: pos(2, 2) };
    const pending: PositionMap = { deleted: pos(5, 5), mine: pos(3, 3) };
    expect(mergePositionMaps(disk, pending, new Set(['deleted']))).toEqual({
      keep: pos(2, 2),
      mine: pos(3, 3),
    });
  });

  it('empty deletedIds set behaves exactly like omitting the parameter', () => {
    const disk: PositionMap = { a: pos(1, 1) };
    const pending: PositionMap = { b: pos(2, 2) };
    expect(mergePositionMaps(disk, pending, new Set())).toEqual(
      mergePositionMaps(disk, pending),
    );
  });
});

describe('persistWithPendingDeletes', () => {
  it('passes a snapshot of the pending ids to the persist attempt', () => {
    const live = new Set(['a', 'b']);
    let seen: ReadonlySet<string> | undefined;
    persistWithPendingDeletes(live, deletedIds => {
      seen = deletedIds;
      return true;
    });
    expect(seen && [...seen].sort()).toEqual(['a', 'b']);
  });

  it('drains the live set after a successful persist commit', () => {
    const live = new Set(['a', 'b']);
    const ok = persistWithPendingDeletes(live, () => true);
    expect(ok).toBe(true);
    expect(live.size).toBe(0);
  });

  it('retains the live set after a failed persist so the delete retries', () => {
    const live = new Set(['a']);
    const ok = persistWithPendingDeletes(live, () => false);
    expect(ok).toBe(false);
    expect([...live]).toEqual(['a']);
  });

  it('passes undefined and stays a no-op when nothing is pending deletion', () => {
    const live = new Set<string>();
    let seen: ReadonlySet<string> | undefined = new Set(['sentinel']);
    const ok = persistWithPendingDeletes(live, deletedIds => {
      seen = deletedIds;
      return true;
    });
    expect(ok).toBe(true);
    expect(seen).toBeUndefined();
    expect(live.size).toBe(0);
  });
});
