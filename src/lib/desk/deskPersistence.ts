/**
 * Desk (MAIN/Dashboard) persisted state — local cache + cloud sync coordinator.
 *
 * USER CONTENT: custom block bodies (text, notes, checklists, links, image URLs)
 * WORKSPACE STRUCTURE: block order/sizes, module layout, freeform positions
 * NOT SYNCED: canvas mode, inspector, onboarding, theme/atmosphere (separate hooks)
 */

import type { CustomBlock } from '../../hooks/useCustomBlocks';
import type { ModuleConfig } from '../../hooks/useWorkspaceLayout';
import type { PositionMap } from '../../hooks/useBlockPositions';
import {
  DESK_STATE_ENTITY_ID,
} from '../focusCache/userWorkspaceStateTypes';
import {
  fetchWorkspaceState,
} from '../focusCache/userWorkspaceStateCloud';
import {
  scheduleWorkspaceStateCloudSync,
} from '../focusCache/userWorkspaceStateEnqueue';

export const DESK_BLOCKS_KEY = 'fw_custom_blocks_v1';
export const DESK_POSITIONS_KEY = 'fw_block_positions_v1';
export const DESK_LAYOUT_KEY = 'fw_workspace_layout_v3';
export const DESK_META_KEY = 'fw_desk_state_meta_v1';

export type DeskCloudState = {
  schemaVersion: 1;
  blocks: CustomBlock[];
  positions: PositionMap;
  layout: ModuleConfig[];
  updatedAt: number;
};

type DeskMeta = { updatedAt: number };

function loadMeta(): DeskMeta {
  try {
    const raw = localStorage.getItem(DESK_META_KEY);
    if (!raw) return { updatedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<DeskMeta>;
    return {
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    };
  } catch {
    return { updatedAt: 0 };
  }
}

function saveMeta(meta: DeskMeta): void {
  try {
    localStorage.setItem(DESK_META_KEY, JSON.stringify(meta));
  } catch {
    /* quota */
  }
}

export function readDeskLocalSnapshot(): DeskCloudState {
  let blocks: CustomBlock[] = [];
  let positions: PositionMap = {};
  let layout: ModuleConfig[] = [];
  try {
    const b = localStorage.getItem(DESK_BLOCKS_KEY);
    if (b) blocks = JSON.parse(b) as CustomBlock[];
  } catch {
    /* ignore */
  }
  try {
    const p = localStorage.getItem(DESK_POSITIONS_KEY);
    if (p) positions = JSON.parse(p) as PositionMap;
  } catch {
    /* ignore */
  }
  try {
    const l = localStorage.getItem(DESK_LAYOUT_KEY);
    if (l) layout = JSON.parse(l) as ModuleConfig[];
  } catch {
    /* ignore */
  }
  return {
    schemaVersion: 1,
    blocks,
    positions,
    layout,
    updatedAt: loadMeta().updatedAt,
  };
}

export function applyDeskLocalSnapshot(state: DeskCloudState): void {
  try {
    localStorage.setItem(DESK_BLOCKS_KEY, JSON.stringify(state.blocks));
    localStorage.setItem(DESK_POSITIONS_KEY, JSON.stringify(state.positions));
    localStorage.setItem(DESK_LAYOUT_KEY, JSON.stringify(state.layout));
    saveMeta({ updatedAt: state.updatedAt });
  } catch {
    /* quota */
  }
}

export function deskLocalUpdatedAt(): number {
  return loadMeta().updatedAt;
}

export function notifyDeskMutation(userId: string | null | undefined): void {
  if (!userId) return;
  const now = Date.now();
  saveMeta({ updatedAt: now });
  const snapshot = readDeskLocalSnapshot();
  snapshot.updatedAt = now;
  scheduleWorkspaceStateCloudSync({
    userId,
    workspaceId: userId,
    entityId: DESK_STATE_ENTITY_ID,
    scope: 'desk',
    state: snapshot as unknown as Record<string, unknown>,
    updatedAt: now,
  });
}

export function parseDeskCloudState(raw: unknown): DeskCloudState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) return null;
  if (!Array.isArray(r.blocks) || typeof r.updatedAt !== 'number') return null;
  const positions =
    r.positions && typeof r.positions === 'object' && !Array.isArray(r.positions)
      ? (r.positions as PositionMap)
      : {};
  const layout = Array.isArray(r.layout) ? (r.layout as ModuleConfig[]) : [];
  return {
    schemaVersion: 1,
    blocks: r.blocks as CustomBlock[],
    positions,
    layout,
    updatedAt: r.updatedAt,
  };
}

export async function pullDeskStateFromCloud(userId: string): Promise<{
  applied: boolean;
  reason?: string;
}> {
  const localAt = deskLocalUpdatedAt();
  const fetch = await fetchWorkspaceState({
    userId,
    scope: 'desk',
    workspaceId: userId,
  });
  if (!fetch.ok) return { applied: false, reason: fetch.reason };
  if (!fetch.row) return { applied: false, reason: 'no_cloud_row' };

  const cloudState = parseDeskCloudState(fetch.row.state);
  if (!cloudState) return { applied: false, reason: 'malformed_cloud' };

  const cloudAt = fetch.row.updated_at_ms;
  if (cloudAt <= localAt) return { applied: false, reason: 'local_newer_or_equal' };

  applyDeskLocalSnapshot({ ...cloudState, updatedAt: cloudAt });
  return { applied: true };
}
