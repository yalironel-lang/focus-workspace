/**
 * Cross-device A/B simulation for workspace state + boards.
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDeskLocalSnapshot,
  deskLocalUpdatedAt,
  parseDeskCloudState,
  readDeskLocalSnapshot,
  type DeskCloudState,
} from './desk/deskPersistence';
import {
  applyMathZoneLocalSnapshot,
  mathLocalUpdatedAt,
  parseMathZoneCloudState,
  readMathZoneLocalSnapshot,
} from './mathZone/mathZoneStorage';
import { shouldAcceptCloudObject } from './focusCache/freeSpaceObjectGeometryLww';
import {
  cloudRowToLocalBoard,
  mergeBoardLww,
  type FreeSpaceBoard,
} from './focusCache/freeSpaceBoardPull';
import type { FreeSpaceBoardCloudRow } from './focusCache/freeSpaceBoardCloud';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

const deskStorage = new Map<string, string>();
const mathStorage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => deskStorage.get(k) ?? mathStorage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (k.startsWith('fw_math') || k.startsWith('fw_custom') || k.startsWith('fw_block') || k.startsWith('fw_workspace') || k.startsWith('fw_desk')) {
      if (k.startsWith('fw_math')) mathStorage.set(k, v);
      else deskStorage.set(k, v);
    } else {
      deskStorage.set(k, v);
    }
  },
  removeItem: (k: string) => {
    deskStorage.delete(k);
    mathStorage.delete(k);
  },
});

type CloudWorkspaceRow = {
  userId: string;
  scope: 'desk' | 'math_zone';
  workspaceId: string;
  state: Record<string, unknown>;
  updatedAt: number;
};

type CloudStore = { rows: Map<string, CloudWorkspaceRow> };

function wsKey(userId: string, scope: string, workspaceId: string): string {
  return `${userId}/${scope}/${workspaceId}`;
}

function uploadWorkspace(cloud: CloudStore, row: CloudWorkspaceRow): void {
  cloud.rows.set(wsKey(row.userId, row.scope, row.workspaceId), structuredClone(row));
}

function pullWorkspace(
  cloud: CloudStore,
  userId: string,
  scope: 'desk' | 'math_zone',
  workspaceId: string,
  localAt: number,
): CloudWorkspaceRow | null {
  const row = cloud.rows.get(wsKey(userId, scope, workspaceId));
  if (!row || row.updatedAt <= localAt) return null;
  return row;
}

describe('cross-device persistence matrix', () => {
  beforeEach(() => {
    deskStorage.clear();
    mathStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('desk: A creates block → B hydrates same content', () => {
    const cloud: CloudStore = { rows: new Map() };
    const userId = 'user-desk-1';

    const tA = 2000;
    const stateA: DeskCloudState = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'block-text-1',
          type: 'text',
          size: 'half',
          order: 0,
          content: { type: 'text', body: 'Hello from Device A' },
          createdAt: tA,
        },
      ],
      positions: { 'block-text-1': { x: 100, y: 200, w: 340, h: 0 } },
      layout: [{ id: 'capture', enabled: true, size: 'full', order: 0 }],
      updatedAt: tA,
    };
    applyDeskLocalSnapshot(stateA);
    uploadWorkspace(cloud, {
      userId,
      scope: 'desk',
      workspaceId: userId,
      state: stateA as unknown as Record<string, unknown>,
      updatedAt: tA,
    });

    deskStorage.clear();
    expect(deskLocalUpdatedAt()).toBe(0);

    const pulled = pullWorkspace(cloud, userId, 'desk', userId, deskLocalUpdatedAt());
    expect(pulled).not.toBeNull();
    const parsed = parseDeskCloudState(pulled!.state);
    expect(parsed?.blocks[0]?.content).toEqual({ type: 'text', body: 'Hello from Device A' });
    applyDeskLocalSnapshot(parsed!);
    expect(readDeskLocalSnapshot().blocks[0]?.content).toEqual({
      type: 'text',
      body: 'Hello from Device A',
    });
  });

  it('desk: B edit wins LWW on A refresh', () => {
    const cloud: CloudStore = { rows: new Map() };
    const userId = 'user-desk-2';
    const t1 = 1000;
    const t2 = 5000;

    uploadWorkspace(cloud, {
      userId,
      scope: 'desk',
      workspaceId: userId,
      state: {
        schemaVersion: 1,
        blocks: [{ id: 'b1', type: 'note', size: 'half', order: 0, content: { type: 'note', body: 'A' }, createdAt: t1 }],
        positions: {},
        layout: [],
        updatedAt: t1,
      },
      updatedAt: t1,
    });

    applyDeskLocalSnapshot({
      schemaVersion: 1,
      blocks: [{ id: 'b1', type: 'note', size: 'half', order: 0, content: { type: 'note', body: 'A' }, createdAt: t1 }],
      positions: {},
      layout: [],
      updatedAt: t1,
    });

    uploadWorkspace(cloud, {
      userId,
      scope: 'desk',
      workspaceId: userId,
      state: {
        schemaVersion: 1,
        blocks: [{ id: 'b1', type: 'note', size: 'half', order: 0, content: { type: 'note', body: 'B-EDIT' }, createdAt: t1 }],
        positions: {},
        layout: [],
        updatedAt: t2,
      },
      updatedAt: t2,
    });

    const pulled = pullWorkspace(cloud, userId, 'desk', userId, t1);
    expect(pulled?.updatedAt).toBe(t2);
    applyDeskLocalSnapshot(parseDeskCloudState(pulled!.state)!);
    expect((readDeskLocalSnapshot().blocks[0]?.content as { body: string }).body).toBe('B-EDIT');
  });

  it('math zone: A page content → B hydrates', () => {
    const cloud: CloudStore = { rows: new Map() };
    const userId = 'user-math-1';
    const sectionId = 'sec-math-1';
    const tA = 3000;

    const stateA = {
      schemaVersion: 1 as const,
      index: {
        notebooks: [{ id: 'nb-1', title: 'Calculus', createdAt: tA, updatedAt: tA }],
        activeId: 'nb-1',
      },
      notebooks: {
        'nb-1': {
          data: {
            schemaVersion: 2 as const,
            content: '∫ x dx',
            pages: [{ id: 'p1', title: 'Page 1', content: '∫ x dx', createdAt: tA, updatedAt: tA }],
            activePageId: 'p1',
            pageResume: {},
            refs: [],
            scratches: [],
          },
          controls: {
            pageBackground: 'dots' as const,
            pageDensity: 'medium' as const,
            notebookWidth: 'comfortable' as const,
            pageSpacing: 'balanced' as const,
            fontSize: 15.5,
            lineHeight: 1.85,
            writingWidth: 640,
            keepListsVisibleWhileTyping: true,
            rtlAssist: false,
            equationSize: 'medium' as const,
            equationAlignment: 'center' as const,
            hideReferences: false,
            hideScratch: false,
            dimEnvironment: false,
            deepFocus: false,
          },
        },
      },
      updatedAt: tA,
    };

    uploadWorkspace(cloud, {
      userId,
      scope: 'math_zone',
      workspaceId: sectionId,
      state: stateA as unknown as Record<string, unknown>,
      updatedAt: tA,
    });

    mathStorage.clear();
    const pulled = pullWorkspace(cloud, userId, 'math_zone', sectionId, mathLocalUpdatedAt(sectionId));
    expect(pulled).not.toBeNull();
    applyMathZoneLocalSnapshot(sectionId, parseMathZoneCloudState(pulled!.state)!);
    const local = readMathZoneLocalSnapshot(sectionId);
    expect(local.notebooks['nb-1']?.data.pages[0]?.content).toBe('∫ x dx');
  });

  it('new space board: A creates board → B merges', () => {
    const localBoard: FreeSpaceBoard = {
      id: 'board-new-1',
      name: 'Research Space',
      createdAt: 1000,
      updatedAt: 1000,
    };
    const cloudRow: FreeSpaceBoardCloudRow = {
      id: 'board-new-1',
      user_id: 'user-1',
      section_id: 'sec-1',
      name: 'Research Space',
      created_at: new Date(1000).toISOString(),
      updated_at: new Date(1000).toISOString(),
    };
    const merged = mergeBoardLww(localBoard, cloudRow);
    expect(merged.name).toBe('Research Space');
    expect(cloudRowToLocalBoard(cloudRow).id).toBe('board-new-1');
  });

  it('free space object: stale local cannot beat cloud on pull', () => {
    const notebookId = 'ps-nb-1';
    const cloudObj: ProjectSpaceObject = {
      id: notebookId,
      type: 'notebook',
      title: 'NB',
      content: { type: 'notebook', body: 'CLOUD' },
      createdAt: 5000,
      updatedAt: 5000,
    };
    const staleLocal: ProjectSpaceObject = {
      ...cloudObj,
      content: { type: 'notebook', body: 'STALE' },
      updatedAt: 1000,
    };
    expect(
      shouldAcceptCloudObject({
        cloud: cloudObj,
        local: staleLocal,
        protectedEntityIds: new Set(),
      }),
    ).toBe(true);
  });

  it('stale device open must not upload when cloud is newer (desk)', () => {
    const cloud: CloudStore = { rows: new Map() };
    const userId = 'user-desk-3';
    const tCloud = 9000;
    uploadWorkspace(cloud, {
      userId,
      scope: 'desk',
      workspaceId: userId,
      state: {
        schemaVersion: 1,
        blocks: [],
        positions: {},
        layout: [{ id: 'today', enabled: true, size: 'full', order: 0 }],
        updatedAt: tCloud,
      },
      updatedAt: tCloud,
    });

    applyDeskLocalSnapshot({
      schemaVersion: 1,
      blocks: [],
      positions: {},
      layout: [{ id: 'today', enabled: false, size: 'full', order: 0 }],
      updatedAt: 500,
    });

    const pulled = pullWorkspace(cloud, userId, 'desk', userId, deskLocalUpdatedAt());
    expect(pulled?.updatedAt).toBe(tCloud);
    expect(parseDeskCloudState(pulled!.state)?.layout[0]?.enabled).toBe(true);
  });

  it('desk: full A→B→A LWW (T1 → T2 round trip)', () => {
    const cloud: CloudStore = { rows: new Map() };
    const userId = 'user-desk-ab';
    const t1 = 1000;
    const t2 = 5000;

    applyDeskLocalSnapshot({
      schemaVersion: 1,
      blocks: [{ id: 'b1', type: 'note', size: 'half', order: 0, content: { type: 'note', body: 'A-T1' }, createdAt: t1 }],
      positions: {},
      layout: [],
      updatedAt: t1,
    });
    uploadWorkspace(cloud, {
      userId,
      scope: 'desk',
      workspaceId: userId,
      state: readDeskLocalSnapshot() as unknown as Record<string, unknown>,
      updatedAt: t1,
    });

    deskStorage.clear();
    const pulledB = pullWorkspace(cloud, userId, 'desk', userId, 0);
    applyDeskLocalSnapshot(parseDeskCloudState(pulledB!.state)!);

    applyDeskLocalSnapshot({
      schemaVersion: 1,
      blocks: [{ id: 'b1', type: 'note', size: 'half', order: 0, content: { type: 'note', body: 'B-T2' }, createdAt: t1 }],
      positions: {},
      layout: [],
      updatedAt: t2,
    });
    uploadWorkspace(cloud, {
      userId,
      scope: 'desk',
      workspaceId: userId,
      state: readDeskLocalSnapshot() as unknown as Record<string, unknown>,
      updatedAt: t2,
    });

    deskStorage.clear();
    applyDeskLocalSnapshot({
      schemaVersion: 1,
      blocks: [{ id: 'b1', type: 'note', size: 'half', order: 0, content: { type: 'note', body: 'A-STALE' }, createdAt: t1 }],
      positions: {},
      layout: [],
      updatedAt: t1,
    });
    const pulledA = pullWorkspace(cloud, userId, 'desk', userId, t1);
    applyDeskLocalSnapshot(parseDeskCloudState(pulledA!.state)!);
    expect((readDeskLocalSnapshot().blocks[0]?.content as { body: string }).body).toBe('B-T2');
  });

  it('math zone: full A→B→A LWW', () => {
    const cloud: CloudStore = { rows: new Map() };
    const userId = 'user-math-ab';
    const sectionId = 'sec-math-ab';
    const t1 = 2000;
    const t2 = 8000;

    const mkState = (content: string, updatedAt: number) => ({
      schemaVersion: 1 as const,
      index: { notebooks: [{ id: 'nb-1', title: 'NB', createdAt: t1, updatedAt }], activeId: 'nb-1' },
      notebooks: {
        'nb-1': {
          data: {
            schemaVersion: 2 as const,
            content,
            pages: [{ id: 'p1', title: 'P1', content, createdAt: t1, updatedAt }],
            activePageId: 'p1',
            pageResume: {},
            refs: [],
            scratches: [],
          },
          controls: {
            pageBackground: 'dots' as const,
            pageDensity: 'medium' as const,
            notebookWidth: 'comfortable' as const,
            pageSpacing: 'balanced' as const,
            fontSize: 15.5,
            lineHeight: 1.85,
            writingWidth: 640,
            keepListsVisibleWhileTyping: true,
            rtlAssist: false,
            equationSize: 'medium' as const,
            equationAlignment: 'center' as const,
            hideReferences: false,
            hideScratch: false,
            dimEnvironment: false,
            deepFocus: false,
          },
        },
      },
      updatedAt,
    });

    applyMathZoneLocalSnapshot(sectionId, mkState('A-T1', t1));
    uploadWorkspace(cloud, {
      userId,
      scope: 'math_zone',
      workspaceId: sectionId,
      state: readMathZoneLocalSnapshot(sectionId) as unknown as Record<string, unknown>,
      updatedAt: t1,
    });

    mathStorage.clear();
    const pulledB = pullWorkspace(cloud, userId, 'math_zone', sectionId, 0);
    applyMathZoneLocalSnapshot(sectionId, parseMathZoneCloudState(pulledB!.state)!);
    applyMathZoneLocalSnapshot(sectionId, mkState('B-T2', t2));
    uploadWorkspace(cloud, {
      userId,
      scope: 'math_zone',
      workspaceId: sectionId,
      state: readMathZoneLocalSnapshot(sectionId) as unknown as Record<string, unknown>,
      updatedAt: t2,
    });

    mathStorage.clear();
    applyMathZoneLocalSnapshot(sectionId, mkState('A-STALE', t1));
    const pulledA = pullWorkspace(cloud, userId, 'math_zone', sectionId, t1);
    applyMathZoneLocalSnapshot(sectionId, parseMathZoneCloudState(pulledA!.state)!);
    expect(readMathZoneLocalSnapshot(sectionId).notebooks['nb-1']?.data.content).toBe('B-T2');
  });

  it('user isolation: User A state never hydrates into User B', () => {
    const cloud: CloudStore = { rows: new Map() };
    uploadWorkspace(cloud, {
      userId: 'user-a',
      scope: 'desk',
      workspaceId: 'user-a',
      state: { schemaVersion: 1, blocks: [], positions: {}, layout: [], updatedAt: 100 },
      updatedAt: 100,
    });
    const pulled = pullWorkspace(cloud, 'user-b', 'desk', 'user-b', 0);
    expect(pulled).toBeNull();
  });

  it('workspace isolation: math section X does not hydrate into section Y', () => {
    const cloud: CloudStore = { rows: new Map() };
    uploadWorkspace(cloud, {
      userId: 'user-1',
      scope: 'math_zone',
      workspaceId: 'sec-x',
      state: { schemaVersion: 1, index: { notebooks: [], activeId: null }, notebooks: {}, updatedAt: 50 },
      updatedAt: 50,
    });
    const pulled = pullWorkspace(cloud, 'user-1', 'math_zone', 'sec-y', 0);
    expect(pulled).toBeNull();
  });

  it('scope isolation: desk row cannot be interpreted as math_zone row', () => {
    const cloud: CloudStore = { rows: new Map() };
    uploadWorkspace(cloud, {
      userId: 'user-1',
      scope: 'desk',
      workspaceId: 'user-1',
      state: { schemaVersion: 1, blocks: [], positions: {}, layout: [], updatedAt: 10 },
      updatedAt: 10,
    });
    const pulled = pullWorkspace(cloud, 'user-1', 'math_zone', 'user-1', 0);
    expect(pulled).toBeNull();
  });

  it('new space: board + object A→B consolidated sync scenario', () => {
    type CloudObjectRow = {
      id: string;
      boardId: string;
      object: ProjectSpaceObject;
      updatedAt: number;
    };
    const cloud: { boards: Map<string, FreeSpaceBoard>; objects: Map<string, CloudObjectRow> } = {
      boards: new Map(),
      objects: new Map(),
    };

    const sectionId = 'sec-ns-1';
    const userId = 'user-ns-1';
    const boardId = 'SYNC-BOARD-A';
    const objectId = 'obj-sync-1';
    const tCreate = 1000;
    const tRename = 3000;
    const tEdit = 4000;

    const boardA: FreeSpaceBoard = {
      id: boardId,
      name: 'SYNC-BOARD-A',
      createdAt: tCreate,
      updatedAt: tCreate,
    };
    cloud.boards.set(boardId, boardA);

    const objectA: ProjectSpaceObject = {
      id: objectId,
      type: 'note',
      title: 'Unique A content',
      content: { type: 'note', body: 'DEVICE-A-UNIQUE' },
      createdAt: tCreate,
      updatedAt: tCreate,
    };
    cloud.objects.set(objectId, { id: objectId, boardId, object: objectA, updatedAt: tCreate });

    const mergedBoard = mergeBoardLww(boardA, {
      id: boardId,
      user_id: userId,
      section_id: sectionId,
      name: boardA.name,
      created_at: new Date(tCreate).toISOString(),
      updated_at: new Date(tCreate).toISOString(),
    });
    expect(mergedBoard.name).toBe('SYNC-BOARD-A');

    const pulledObject = cloud.objects.get(objectId);
    expect(pulledObject?.boardId).toBe(boardId);
    expect((pulledObject?.object.content as { body: string }).body).toBe('DEVICE-A-UNIQUE');

    cloud.boards.set(boardId, { ...boardA, name: 'SYNC-BOARD-B-RENAMED', updatedAt: tRename });
    cloud.objects.set(objectId, {
      id: objectId,
      boardId,
      object: {
        ...objectA,
        content: { type: 'note', body: 'DEVICE-B-EDIT' },
        updatedAt: tEdit,
      },
      updatedAt: tEdit,
    });

    const cloudBoard = cloud.boards.get(boardId)!;
    const cloudObj = cloud.objects.get(objectId)!;
    expect(cloudBoard.name).toBe('SYNC-BOARD-B-RENAMED');
    expect((cloudObj.object.content as { body: string }).body).toBe('DEVICE-B-EDIT');
    expect(cloudObj.boardId).toBe(boardId);

    expect(
      shouldAcceptCloudObject({
        cloud: cloudObj.object,
        local: objectA,
        protectedEntityIds: new Set(),
      }),
    ).toBe(true);
  });
});
