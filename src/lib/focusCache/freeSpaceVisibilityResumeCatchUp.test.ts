// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  getActiveFreeSpaceGeometryIds,
  resetActiveFreeSpaceGeometryForTests,
  setFreeSpaceGeometryActive,
} from '../freeSpaceActiveGeometry';
import {
  applyFreeSpaceRemotePositions,
  registerFreeSpaceRemotePositionApply,
} from '../freeSpaceRemotePositionApply';
import * as updateEnqueue from './freeSpaceObjectUpdateEnqueue';
import { collectAcceptedGeometryPatches } from './freeSpaceObjectGeometryLww';
import {
  attachFreeSpaceVisibilityResumeCatchUp,
  createCoalescedVisibilityResumeCatchUp,
  shouldRunFreeSpaceVisibilityResumeCatchUp,
} from './freeSpaceVisibilityResumeCatchUp';

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
  geometry?: ProjectSpaceObject['geometry'],
): ProjectSpaceObject {
  return {
    id,
    type: 'note',
    title: 'Note',
    content: { type: 'note', body: 'x' },
    createdAt: 1,
    updatedAt,
    ...(geometry ? { geometry } : {}),
  };
}

type FakeDoc = {
  state: 'visible' | 'hidden' | 'prerender';
  listeners: Set<() => void>;
};

function createFakeDocument(initial: FakeDoc['state'] = 'visible'): FakeDoc {
  return { state: initial, listeners: new Set() };
}

function attachWithFake(
  doc: FakeDoc,
  input: {
    isCurrent: () => boolean;
    runCatchUp: () => void;
  },
): () => void {
  return attachFreeSpaceVisibilityResumeCatchUp({
    ...input,
    getVisibilityState: () => doc.state,
    addEventListener: (_type, listener) => {
      doc.listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      doc.listeners.delete(listener);
    },
  });
}

function setVisibility(doc: FakeDoc, next: FakeDoc['state']): void {
  doc.state = next;
  for (const listener of [...doc.listeners]) listener();
}

/**
 * Same geometry apply path the hook uses after catch-up:
 * collectAcceptedGeometryPatches → applyFreeSpaceRemotePositions.
 */
function applyResumeCatchUpGeometry(input: {
  local: ProjectSpaceObject[];
  cloud: ProjectSpaceObject[];
  geometryBlockedIds?: Set<string>;
}): Record<string, { x: number; y: number; w: number; h: number }> {
  const patches = collectAcceptedGeometryPatches(
    input.local,
    input.cloud,
    input.geometryBlockedIds,
  );
  applyFreeSpaceRemotePositions(patches);
  return patches;
}

afterEach(() => {
  resetActiveFreeSpaceGeometryForTests();
  registerFreeSpaceRemotePositionApply(null);
  vi.restoreAllMocks();
});

describe('shouldRunFreeSpaceVisibilityResumeCatchUp', () => {
  it('A. hidden → visible is the only resume transition', () => {
    expect(shouldRunFreeSpaceVisibilityResumeCatchUp(true, 'visible')).toBe(true);
    expect(shouldRunFreeSpaceVisibilityResumeCatchUp(true, 'hidden')).toBe(false);
    expect(shouldRunFreeSpaceVisibilityResumeCatchUp(false, 'visible')).toBe(false);
    expect(shouldRunFreeSpaceVisibilityResumeCatchUp(false, 'hidden')).toBe(false);
  });
});

describe('attachFreeSpaceVisibilityResumeCatchUp', () => {
  it('A. hidden → visible triggers one catch-up pull', () => {
    const doc = createFakeDocument('hidden');
    const pulls: number[] = [];
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => pulls.push(1),
    });
    expect(pulls).toEqual([]);
    setVisibility(doc, 'visible');
    expect(pulls).toHaveLength(1);
  });

  it('B. visible → visible does not produce repeated catch-up spam', () => {
    const doc = createFakeDocument('visible');
    const pulls: number[] = [];
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => pulls.push(1),
    });
    setVisibility(doc, 'visible');
    setVisibility(doc, 'visible');
    expect(pulls).toEqual([]);
  });

  it('B. hide then stay-visible events still pull only once per hidden → visible', () => {
    const doc = createFakeDocument('visible');
    const pulls: number[] = [];
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => pulls.push(1),
    });
    setVisibility(doc, 'hidden');
    setVisibility(doc, 'visible');
    setVisibility(doc, 'visible');
    expect(pulls).toHaveLength(1);
  });

  it('C. listener cleanup on unmount prevents later pull', () => {
    const doc = createFakeDocument('hidden');
    const pulls: number[] = [];
    const detach = attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => pulls.push(1),
    });
    detach();
    setVisibility(doc, 'visible');
    expect(pulls).toEqual([]);
    expect(doc.listeners.size).toBe(0);
  });

  it('D. resume uses current section/board scope and skips stale hook scope', () => {
    const doc = createFakeDocument('hidden');
    const scope = { sectionId: 's1', boardId: 'main' };
    const pulls: Array<{ sectionId: string; boardId: string }> = [];
    attachWithFake(doc, {
      isCurrent: () => scope.sectionId === 's1' && scope.boardId === 'main',
      runCatchUp: () => pulls.push({ ...scope }),
    });
    setVisibility(doc, 'visible');
    expect(pulls).toEqual([{ sectionId: 's1', boardId: 'main' }]);

    scope.sectionId = 's2';
    scope.boardId = 'other';
    setVisibility(doc, 'hidden');
    setVisibility(doc, 'visible');
    expect(pulls).toEqual([{ sectionId: 's1', boardId: 'main' }]);
  });

  it('D. live scope ids are the ones passed into runCatchUp', () => {
    const doc = createFakeDocument('hidden');
    const scope = { sectionId: 'sec-a', boardId: 'board-a' };
    const pulls: Array<{ sectionId: string; boardId: string }> = [];
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => pulls.push({ ...scope }),
    });
    scope.sectionId = 'sec-b';
    scope.boardId = 'board-b';
    setVisibility(doc, 'visible');
    expect(pulls).toEqual([{ sectionId: 'sec-b', boardId: 'board-b' }]);
  });

  it('does not pull while remaining hidden', () => {
    const doc = createFakeDocument('hidden');
    const pulls: number[] = [];
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => pulls.push(1),
    });
    setVisibility(doc, 'hidden');
    expect(pulls).toEqual([]);
  });
});

describe('createCoalescedVisibilityResumeCatchUp', () => {
  it('I. rapid hide/show while catch-up is in flight does not duplicate pulls', () => {
    const runs: number[] = [];
    const coalesce = createCoalescedVisibilityResumeCatchUp(() => {
      runs.push(1);
    });
    coalesce.request();
    coalesce.request();
    coalesce.request();
    expect(runs).toHaveLength(1);
    expect(coalesce.isOutstanding()).toBe(true);
    coalesce.end();
    coalesce.request();
    expect(runs).toHaveLength(2);
  });

  it('I. helper may fire on every resume; coalesce keeps one outstanding pull', () => {
    const executes: number[] = [];
    const coalesce = createCoalescedVisibilityResumeCatchUp(() => {
      executes.push(1);
    });
    const doc = createFakeDocument('hidden');
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => coalesce.request(),
    });
    setVisibility(doc, 'visible');
    setVisibility(doc, 'hidden');
    setVisibility(doc, 'visible');
    setVisibility(doc, 'hidden');
    setVisibility(doc, 'visible');
    expect(executes).toHaveLength(1);
    coalesce.end();
    setVisibility(doc, 'hidden');
    setVisibility(doc, 'visible');
    expect(executes).toHaveLength(2);
  });
});

describe('resume catch-up uses existing PR C geometry pipeline', () => {
  it('E. resume pull with newer remote geometry patches PositionMap', () => {
    let positionMap: Record<string, { x: number; y: number; w: number; h: number }> = {
      n1: { x: 10, y: 10, w: 200, h: 80 },
    };
    const applied: unknown[] = [];
    registerFreeSpaceRemotePositionApply(next => {
      applied.push(next);
      positionMap = { ...positionMap, ...next };
    });

    const doc = createFakeDocument('hidden');
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => {
        applyResumeCatchUpGeometry({
          local: [note('n1', 100, geom(10, 10, 200, 80, 1))],
          cloud: [note('n1', 100, geom(400, 300, 200, 80, 50))],
        });
      },
    });
    setVisibility(doc, 'visible');
    expect(applied).toHaveLength(1);
    expect(positionMap.n1).toEqual({ x: 400, y: 300, w: 200, h: 80 });
  });

  it('F. resume pull with equal/older geometry does not patch', () => {
    const applied: unknown[] = [];
    registerFreeSpaceRemotePositionApply(next => {
      applied.push(next);
    });
    const doc = createFakeDocument('hidden');
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => {
        const equal = applyResumeCatchUpGeometry({
          local: [note('n1', 100, geom(10, 10, 200, 80, 50))],
          cloud: [note('n1', 100, geom(400, 300, 200, 80, 50))],
        });
        expect(equal).toEqual({});
        const older = applyResumeCatchUpGeometry({
          local: [note('n1', 100, geom(10, 10, 200, 80, 50))],
          cloud: [note('n1', 100, geom(400, 300, 200, 80, 1))],
        });
        expect(older).toEqual({});
      },
    });
    setVisibility(doc, 'visible');
    expect(applied).toEqual([]);
  });

  it('G. active local geometry id still blocks resume geometry', () => {
    setFreeSpaceGeometryActive('n1', true);
    const applied: unknown[] = [];
    registerFreeSpaceRemotePositionApply(next => {
      applied.push(next);
    });
    const doc = createFakeDocument('hidden');
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => {
        const patches = applyResumeCatchUpGeometry({
          local: [note('n1', 100, geom(10, 10, 200, 80, 1))],
          cloud: [note('n1', 100, geom(400, 300, 200, 80, 999))],
          geometryBlockedIds: new Set([...getActiveFreeSpaceGeometryIds()]),
        });
        expect(patches).toEqual({});
      },
    });
    setVisibility(doc, 'visible');
    expect(applied).toEqual([]);
  });

  it('H. resume apply does not enqueue UPDATE', () => {
    const enqueueSpy = vi.spyOn(
      updateEnqueue,
      'enqueueFreeSpaceObjectUpdatesAfterLocalPersist',
    );
    const applied: unknown[] = [];
    registerFreeSpaceRemotePositionApply(next => {
      applied.push(next);
    });
    const doc = createFakeDocument('hidden');
    attachWithFake(doc, {
      isCurrent: () => true,
      runCatchUp: () => {
        applyResumeCatchUpGeometry({
          local: [note('n1', 100, geom(10, 10, 200, 80, 1))],
          cloud: [note('n1', 100, geom(400, 300, 200, 80, 50))],
        });
      },
    });
    setVisibility(doc, 'visible');
    expect(applied).toHaveLength(1);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
