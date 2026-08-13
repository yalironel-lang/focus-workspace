// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { Json } from '../database.types';
import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import type { FreeSpaceObjectCloudRow } from './freeSpaceObjectCloud';
import {
  buildFreshMountedBoardPersistPlan,
  buildProtectedEntityIds,
  collectFreeSpacePullGuardIds,
  computeMountedBoardPullApply,
  filterCloudWinnersForReactPatch,
  filterStillValidCloudWinners,
  isFreeSpacePullScopeCurrent,
  mergeAcceptedIntoObjectList,
  persistMountedBoardPullWinners,
  resolveLocalObjectForCompare,
  shouldAcceptCloudObject,
} from './freeSpaceObjectPull';
import { mergeFreeSpaceObjects } from '../freeSpaceLocalMerge';

function note(
  id: string,
  updatedAt: number,
  body = 'x',
): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 'Note',
    content: { type: 'note', body },
    createdAt: 1,
    updatedAt,
  };
}

function cloudRow(partial: {
  id: string;
  board_id: string;
  object: unknown;
  user_id?: string;
  section_id?: string;
  created_at?: string;
  updated_at?: string;
}): FreeSpaceObjectCloudRow {
  return {
    id: partial.id,
    user_id: partial.user_id ?? 'user-1',
    section_id: partial.section_id ?? 'section-1',
    board_id: partial.board_id,
    object: partial.object as Json,
    created_at: partial.created_at ?? '2020-01-01T00:00:00Z',
    updated_at: partial.updated_at ?? '2020-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('buildProtectedEntityIds', () => {
  it('unions dirty, pendingDeleted, pending create/update, tombstones', () => {
    const set = buildProtectedEntityIds({
      dirtyIds: ['d1'],
      pendingDeletedIds: ['del1'],
      pendingCreateEntityIds: ['c1'],
      pendingUpdateEntityIds: ['u1'],
      tombstoneObjectIds: ['t1'],
    });
    expect([...set].sort()).toEqual(['c1', 'd1', 'del1', 't1', 'u1']);
  });
});

describe('resolveLocalObjectForCompare', () => {
  it('prefers higher updatedAt between React and durable', () => {
    const react = [note('a', 200, 'react')];
    const durable = [note('a', 100, 'ls')];
    expect(resolveLocalObjectForCompare('a', react, durable)?.updatedAt).toBe(200);
    expect(resolveLocalObjectForCompare('a', react, durable)?.content).toEqual({
      type: 'note',
      body: 'react',
    });
  });

  it('prefers durable when durable is newer than React', () => {
    expect(
      resolveLocalObjectForCompare('a', [note('a', 100)], [note('a', 200, 'ls')])?.updatedAt,
    ).toBe(200);
  });

  it('falls back to durable when absent from React', () => {
    const durable = [note('a', 100)];
    expect(resolveLocalObjectForCompare('a', [], durable)?.updatedAt).toBe(100);
  });
});

describe('shouldAcceptCloudObject / PR7 LWW', () => {
  const empty = new Set<string>();

  it('accepts cloud-only unprotected', () => {
    expect(
      shouldAcceptCloudObject({
        cloud: note('a', 50),
        local: undefined,
        protectedEntityIds: empty,
      }),
    ).toBe(true);
  });

  it('accepts cloud newer', () => {
    expect(
      shouldAcceptCloudObject({
        cloud: note('a', 200),
        local: note('a', 100),
        protectedEntityIds: empty,
      }),
    ).toBe(true);
  });

  it('keeps local when local newer', () => {
    expect(
      shouldAcceptCloudObject({
        cloud: note('a', 100),
        local: note('a', 200),
        protectedEntityIds: empty,
      }),
    ).toBe(false);
  });

  it('keeps local on equal updatedAt', () => {
    expect(
      shouldAcceptCloudObject({
        cloud: note('a', 100, 'cloud'),
        local: note('a', 100, 'local'),
        protectedEntityIds: empty,
      }),
    ).toBe(false);
  });

  it('skips protected even if cloud newer', () => {
    expect(
      shouldAcceptCloudObject({
        cloud: note('a', 999),
        local: note('a', 1),
        protectedEntityIds: new Set(['a']),
      }),
    ).toBe(false);
  });
});

describe('computeMountedBoardPullApply', () => {
  const sectionId = 'section-1';

  it('1. cloud-only unprotected object → accepted', () => {
    const cloud = note('new', 10);
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'new', board_id: 'main', object: cloud })],
      reactObjects: [],
      durableObjects: [],
      protectedEntityIds: new Set(),
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.id).toBe('new');
    expect(result.nextDurableObjects).toEqual([expect.objectContaining({ id: 'new' })]);
  });

  it('2. cloud newer than local → accepted', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 200, 'cloud') })],
      reactObjects: [note('a', 100, 'local')],
      durableObjects: [note('a', 100, 'local')],
      protectedEntityIds: new Set(),
    });
    expect(result.accepted[0]?.content).toEqual({ type: 'note', body: 'cloud' });
  });

  it('3. local newer → kept', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 100) })],
      reactObjects: [note('a', 200)],
      durableObjects: [note('a', 200)],
      protectedEntityIds: new Set(),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.nextDurableObjects).toBeNull();
    expect(result.skippedLocalWinsIds).toContain('a');
  });

  it('4. equal version → local kept', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 100, 'cloud') })],
      reactObjects: [note('a', 100, 'local')],
      durableObjects: [note('a', 100, 'local')],
      protectedEntityIds: new Set(),
    });
    expect(result.accepted).toHaveLength(0);
  });

  it('5. pending CREATE → cloud skipped', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 999) })],
      reactObjects: [note('a', 1)],
      durableObjects: [note('a', 1)],
      protectedEntityIds: buildProtectedEntityIds({ pendingCreateEntityIds: ['a'] }),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.skippedProtectedIds).toContain('a');
  });

  it('6. pending UPDATE → cloud skipped', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 999) })],
      reactObjects: [note('a', 1)],
      durableObjects: [note('a', 1)],
      protectedEntityIds: buildProtectedEntityIds({ pendingUpdateEntityIds: ['a'] }),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.skippedProtectedIds).toContain('a');
  });

  it('7. tombstone → cloud skipped', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 999) })],
      reactObjects: [],
      durableObjects: [],
      protectedEntityIds: buildProtectedEntityIds({ tombstoneObjectIds: ['a'] }),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.skippedProtectedIds).toContain('a');
  });

  it('8. pendingDeleted → cloud skipped', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 999) })],
      reactObjects: [],
      durableObjects: [note('a', 1)],
      protectedEntityIds: buildProtectedEntityIds({ pendingDeletedIds: ['a'] }),
    });
    expect(result.accepted).toHaveLength(0);
  });

  it('9. dirtyIdsRef → cloud skipped', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 150) })],
      reactObjects: [note('a', 200)],
      durableObjects: [note('a', 100)],
      protectedEntityIds: buildProtectedEntityIds({ dirtyIds: ['a'] }),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.skippedProtectedIds).toContain('a');
  });

  it('10. Case H pre-durable debounce race', () => {
    // T0 durable 100; T1 React 200 + dirty; T3 LS still 100; no pending UPDATE; cloud 150
    const protectedIds = buildProtectedEntityIds({ dirtyIds: ['a'] });
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 150, 'cloud') })],
      reactObjects: [note('a', 200, 'local-edit')],
      durableObjects: [note('a', 100, 'old')],
      protectedEntityIds: protectedIds,
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.nextDurableObjects).toBeNull();
    // React comparison source would still be 200 even without dirty — belt+suspenders
    const withoutDirtyButReactNewer = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'a', board_id: 'main', object: note('a', 150, 'cloud') })],
      reactObjects: [note('a', 200, 'local-edit')],
      durableObjects: [note('a', 100, 'old')],
      protectedEntityIds: new Set(),
    });
    expect(withoutDirtyButReactNewer.accepted).toHaveLength(0);
  });

  it('11. cloud absence does not remove local object', () => {
    const durable = [note('keep', 50), note('also', 60)];
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'new', board_id: 'main', object: note('new', 1) })],
      reactObjects: durable,
      durableObjects: durable,
      protectedEntityIds: new Set(),
    });
    expect(result.nextDurableObjects?.map(o => o.id).sort()).toEqual(['also', 'keep', 'new']);
    expect(mergeAcceptedIntoObjectList(durable, result.accepted).map(o => o.id).sort()).toEqual([
      'also',
      'keep',
      'new',
    ]);
  });

  it('12. malformed object skipped', () => {
    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'main',
      rows: [cloudRow({ id: 'bad', board_id: 'main', object: { not: 'an-object' } })],
      reactObjects: [],
      durableObjects: [],
      protectedEntityIds: new Set(),
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.skippedMalformed).toBe(1);
  });

  it('16. cross-tab safety: other board rows ignored; only mounted may apply', () => {
    const boardBKey = boardScopedFreeSpaceKeys(sectionId, 'board-b').objects;
    localStorage.setItem(boardBKey, JSON.stringify([note('b-obj', 100, 'b-local')]));

    const result = computeMountedBoardPullApply({
      sectionId,
      mountedBoardId: 'board-a',
      rows: [
        cloudRow({ id: 'a-obj', board_id: 'board-a', object: note('a-obj', 50, 'a-cloud') }),
        cloudRow({ id: 'b-obj', board_id: 'board-b', object: note('b-obj', 999, 'b-cloud') }),
      ],
      reactObjects: [],
      durableObjects: [],
      protectedEntityIds: new Set(),
    });

    expect(result.ignoredOtherBoardRows).toBe(1);
    expect(result.accepted.map(o => o.id)).toEqual(['a-obj']);
    expect(result.accepted.find(o => o.id === 'b-obj')).toBeUndefined();

    // Persist only mounted board-a; board-b LS untouched
    const ok = persistMountedBoardPullWinners({
      sectionId,
      boardId: 'board-a',
      nextDurableObjects: result.nextDurableObjects!,
    });
    expect(ok).toBe(true);
    expect(localStorage.getItem(boardBKey)).toBe(JSON.stringify([note('b-obj', 100, 'b-local')]));
    const boardAKey = boardScopedFreeSpaceKeys(sectionId, 'board-a').objects;
    expect(JSON.parse(localStorage.getItem(boardAKey)!)).toEqual([
      expect.objectContaining({ id: 'a-obj', updatedAt: 50 }),
    ]);
  });
});

describe('stale scope protection', () => {
  it('14/15. generation / section / board mismatch → not current', () => {
    const captured = { sectionId: 's1', boardId: 'main', generation: 1 };
    expect(
      isFreeSpacePullScopeCurrent(captured, { sectionId: 's1', boardId: 'main', generation: 1 }),
    ).toBe(true);
    expect(
      isFreeSpacePullScopeCurrent(captured, { sectionId: 's1', boardId: 'main', generation: 2 }),
    ).toBe(false);
    expect(
      isFreeSpacePullScopeCurrent(captured, { sectionId: 's2', boardId: 'main', generation: 1 }),
    ).toBe(false);
    expect(
      isFreeSpacePullScopeCurrent(captured, { sectionId: 's1', boardId: 'other', generation: 1 }),
    ).toBe(false);
  });
});

describe('mergeFreeSpaceObjects unchanged', () => {
  it('19. still uses incoming-wins on equal tie (global semantics untouched)', () => {
    const local = [note('a', 100, 'local')];
    const incoming = [note('a', 100, 'incoming')];
    const { merged } = mergeFreeSpaceObjects(local, incoming);
    expect(merged[0]?.content).toEqual({ type: 'note', body: 'incoming' });
  });
});

describe('persistMountedBoardPullWinners', () => {
  it('writes only the given board key', () => {
    const sectionId = 'section-1';
    const otherKey = boardScopedFreeSpaceKeys(sectionId, 'other').objects;
    localStorage.setItem(otherKey, '[]');
    const ok = persistMountedBoardPullWinners({
      sectionId,
      boardId: 'main',
      nextDurableObjects: [note('x', 1)],
    });
    expect(ok).toBe(true);
    expect(localStorage.getItem(otherKey)).toBe('[]');
  });
});

describe('C1/C2 apply-window revalidation', () => {
  it('1. C1: cloud 150 accepted at compute then local edit 200 before React patch → not applied', () => {
    const provisional = [note('a', 150, 'cloud')];
    // Simulate post-compute local edit: React 200 + dirty
    const still = filterStillValidCloudWinners({
      candidates: provisional,
      reactObjects: [note('a', 200, 'local-edit')],
      durableObjects: [note('a', 100, 'old')],
      protectedEntityIds: buildProtectedEntityIds({ dirtyIds: ['a'] }),
    });
    expect(still).toHaveLength(0);

    const reactPatch = filterCloudWinnersForReactPatch({
      candidates: provisional,
      prevReactObjects: [note('a', 200, 'local-edit')],
      protectedEntityIds: buildProtectedEntityIds({ dirtyIds: ['a'] }),
    });
    expect(reactPatch).toHaveLength(0);
  });

  it('2. newly dirty after initial guard snapshot → winner dropped before LS write', () => {
    const provisional = [note('a', 150, 'cloud')];
    const plan = buildFreshMountedBoardPersistPlan({
      provisionalAccepted: provisional,
      reactObjects: [note('a', 100)],
      freshDurableObjects: [note('a', 100)],
      protectedEntityIds: buildProtectedEntityIds({ dirtyIds: ['a'] }),
    });
    expect(plan).toBeNull();
  });

  it('3. newly pendingDeleted after initial guard snapshot → winner dropped', () => {
    const plan = buildFreshMountedBoardPersistPlan({
      provisionalAccepted: [note('a', 999, 'cloud')],
      reactObjects: [],
      freshDurableObjects: [note('a', 1)],
      protectedEntityIds: buildProtectedEntityIds({ pendingDeletedIds: ['a'] }),
    });
    expect(plan).toBeNull();
  });

  it('4. C2 sibling safety: fresh durable B=75 preserved when applying A=200', () => {
    const plan = buildFreshMountedBoardPersistPlan({
      provisionalAccepted: [note('a', 200, 'cloud-a')],
      reactObjects: [note('a', 100), note('b', 50)],
      // Concurrent local persist updated B to 75 after provisional compute
      freshDurableObjects: [note('a', 100, 'old-a'), note('b', 75, 'b-new')],
      protectedEntityIds: new Set(),
    });
    expect(plan).not.toBeNull();
    const byId = new Map(plan!.nextDurableObjects.map(o => [o.id, o]));
    expect(byId.get('a')?.updatedAt).toBe(200);
    expect(byId.get('b')?.updatedAt).toBe(75);
    expect(byId.get('b')?.content).toEqual({ type: 'note', body: 'b-new' });
  });

  it('5. fresh durable version beats precomputed cloud', () => {
    const plan = buildFreshMountedBoardPersistPlan({
      provisionalAccepted: [note('a', 150, 'cloud')],
      reactObjects: [note('a', 100)],
      freshDurableObjects: [note('a', 200, 'local-newer')],
      protectedEntityIds: new Set(),
    });
    expect(plan).toBeNull();
  });

  it('6. React functional patch re-check: prev newer → cloud not applied', () => {
    const prev = [note('a', 200, 'react')];
    const winners = filterCloudWinnersForReactPatch({
      candidates: [note('a', 150, 'cloud')],
      prevReactObjects: prev,
      protectedEntityIds: new Set(),
    });
    expect(winners).toHaveLength(0);
    const patched = winners.length
      ? mergeAcceptedIntoObjectList(prev, winners)
      : prev;
    expect(patched[0]?.updatedAt).toBe(200);
    expect(patched[0]?.content).toEqual({ type: 'note', body: 'react' });
  });

  it('7. LS persistence failure → caller must leave React unchanged', () => {
    // Empty sectionId fails closed inside persist helper (no write).
    const ok = persistMountedBoardPullWinners({
      sectionId: '',
      boardId: 'main',
      nextDurableObjects: [note('a', 200)],
    });
    expect(ok).toBe(false);
    // Hook contract: on false, skip setObjects — React stays at pre-pull snapshot.
    const prevReact = [note('a', 100)];
    expect(prevReact[0]?.updatedAt).toBe(100);
    expect(localStorage.length).toBe(0);
  });

  it('8. guard read failure → fail-closed (no apply inputs)', async () => {
    const result = await collectFreeSpacePullGuardIds({
      userId: null,
      sectionId: 'section-1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/pending_ops/);
  });

  it('9. stale generation/scope still produces zero writes', () => {
    const captured = { sectionId: 's1', boardId: 'main', generation: 1 };
    const stale = !isFreeSpacePullScopeCurrent(captured, {
      sectionId: 's1',
      boardId: 'main',
      generation: 2,
    });
    expect(stale).toBe(true);
    // Hook short-circuits before persist when stale — no LS mutation in this path
    const key = boardScopedFreeSpaceKeys('s1', 'main').objects;
    expect(localStorage.getItem(key)).toBeNull();
  });
});
