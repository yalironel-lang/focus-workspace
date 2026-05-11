/**
 * Shared validation / repair for section-scoped Free Space localStorage.
 * All recovery uses console.warn (never console.error) per product guidance.
 */

import type { BlockPos, PositionMap } from '../hooks/useBlockPositions';
import { DEFAULT_BLOCK_H, DEFAULT_BLOCK_W } from '../hooks/useBlockPositions';
import { ZOOM_MAX, ZOOM_MIN } from '../hooks/useCanvasMode';

const LOG_PREFIX = '[Free Space persistence]';

export function fwPersistWarn(message: string): void {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`${LOG_PREFIX} ${message}`);
  }
}

export function freeSpaceStorageKeys(sectionId: string) {
  return {
    objects: `fw_section_${sectionId}_free_space_objects_v1`,
    positions: `fw_section_${sectionId}_free_space_positions_v1`,
    viewport: `fw_section_${sectionId}_free_space_viewport_v1`,
    prefs: `fw_section_${sectionId}_free_space_prefs_v1`,
  } as const;
}

/** Removes objects, positions, viewport, and prefs for one section (dev / recovery). */
export function clearFreeSpacePersistenceForSection(sectionId: string): void {
  if (!sectionId) {
    fwPersistWarn('clearFreeSpacePersistenceForSection: missing sectionId; nothing cleared.');
    return;
  }
  const k = freeSpaceStorageKeys(sectionId);
  try {
    localStorage.removeItem(k.objects);
    localStorage.removeItem(k.positions);
    localStorage.removeItem(k.viewport);
    localStorage.removeItem(k.prefs);
    fwPersistWarn(`Cleared Free Space storage keys for section "${sectionId}". Reload the page to reset in-memory state.`);
  } catch (e) {
    fwPersistWarn(`Failed to clear Free Space storage: ${String(e)}`);
  }
}

let fwFreeSpaceDevSectionId: string | null = null;

export function setFwFreeSpaceDevSectionContext(sectionId: string | null): void {
  fwFreeSpaceDevSectionId = sectionId;
}

export function getFwFreeSpaceDevSectionContext(): string | null {
  return fwFreeSpaceDevSectionId;
}

/** Dev-only: assign window.__FW_RESET_FREE_SPACE__() to clear current section persistence. */
export function installFwFreeSpaceDevTools(): void {
  if (typeof window === 'undefined') return;
  window.__FW_RESET_FREE_SPACE__ = () => {
    const id = fwFreeSpaceDevSectionId;
    if (!id) {
      fwPersistWarn('__FW_RESET_FREE_SPACE__: no active section id (open a section page first).');
      return;
    }
    clearFreeSpacePersistenceForSection(id);
  };
}

declare global {
  interface Window {
    __FW_RESET_FREE_SPACE__?: () => void;
  }
}

const PAN_ABS_MAX = 10_000_000;
const GRID_MIN = 4;
const GRID_MAX = 400;
const POS_DIM_MAX = 50_000;

function finiteOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Single block rect: safe for canvas layout (finite, bounded). */
export function sanitizeBlockPos(raw: unknown): BlockPos {
  if (!raw || typeof raw !== 'object') {
    return { x: 40, y: 40, w: DEFAULT_BLOCK_W, h: DEFAULT_BLOCK_H };
  }
  const o = raw as Record<string, unknown>;
  const x = Math.min(POS_DIM_MAX, Math.max(-POS_DIM_MAX, finiteOr(o.x, 40)));
  const y = Math.min(POS_DIM_MAX, Math.max(-POS_DIM_MAX, finiteOr(o.y, 40)));
  const w = Math.min(POS_DIM_MAX, Math.max(0, finiteOr(o.w, DEFAULT_BLOCK_W)));
  const hRaw = finiteOr(o.h, DEFAULT_BLOCK_H);
  const h = Math.min(POS_DIM_MAX, Math.max(0, hRaw));
  return { x, y, w, h };
}

/** Full position map from localStorage JSON (object, not array). */
export function sanitizePositionMap(raw: unknown, sectionId: string): { map: PositionMap; repaired: boolean } {
  if (raw === null || raw === undefined) {
    fwPersistWarn(`positions for section "${sectionId}" were null/undefined; using empty map.`);
    return { map: {}, repaired: true };
  }
  if (Array.isArray(raw)) {
    fwPersistWarn(`positions for section "${sectionId}" were stored as an array; resetting to empty map.`);
    return { map: {}, repaired: true };
  }
  if (typeof raw !== 'object') {
    fwPersistWarn(`positions for section "${sectionId}" had invalid type "${typeof raw}"; using empty map.`);
    return { map: {}, repaired: true };
  }

  const out: PositionMap = {};
  let repaired = false;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string' || !id.trim()) {
      repaired = true;
      continue;
    }
    if (positionSourceWasCorrupt(val)) repaired = true;
    out[id] = sanitizeBlockPos(val);
  }
  return { map: out, repaired };
}

function positionSourceWasCorrupt(val: unknown): boolean {
  if (val == null || typeof val !== 'object') return true;
  const o = val as Record<string, unknown>;
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    const n = o[k];
    if (n === undefined) continue;
    const num = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(num)) return true;
  }
  return false;
}

export interface SanitizedViewport {
  zoom: number;
  panX: number;
  panY: number;
  repaired: boolean;
}

export function sanitizeViewport(
  raw: unknown,
  sectionId: string,
  defaults: { zoom: number; panX: number; panY: number },
): SanitizedViewport {
  let repaired = false;
  if (!raw || typeof raw !== 'object') {
    fwPersistWarn(`viewport for section "${sectionId}" was not an object; using defaults.`);
    return { ...defaults, repaired: true };
  }
  const v = raw as Record<string, unknown>;
  let zoom = finiteOr(v.zoom, defaults.zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) {
    zoom = defaults.zoom;
    repaired = true;
  }
  zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

  let panX = finiteOr(v.panX, defaults.panX);
  let panY = finiteOr(v.panY, defaults.panY);
  if (!Number.isFinite(panX)) {
    panX = defaults.panX;
    repaired = true;
  }
  if (!Number.isFinite(panY)) {
    panY = defaults.panY;
    repaired = true;
  }
  panX = Math.min(PAN_ABS_MAX, Math.max(-PAN_ABS_MAX, panX));
  panY = Math.min(PAN_ABS_MAX, Math.max(-PAN_ABS_MAX, panY));

  if (repaired) {
    fwPersistWarn(`viewport for section "${sectionId}" had invalid values; repaired to safe zoom/pan.`);
  }
  return { zoom, panX, panY, repaired };
}

export interface SanitizedPrefs {
  snapToGrid: boolean;
  gridSize: number;
  repaired: boolean;
}

export function sanitizePrefs(
  raw: unknown,
  sectionId: string,
  defaults: { snapToGrid: boolean; gridSize: number },
): SanitizedPrefs {
  let repaired = false;
  if (!raw || typeof raw !== 'object') {
    fwPersistWarn(`canvas prefs for section "${sectionId}" were not an object; using defaults.`);
    return { ...defaults, repaired: true };
  }
  const p = raw as Record<string, unknown>;
  let snapToGrid = defaults.snapToGrid;
  if (typeof p.snapToGrid === 'boolean') snapToGrid = p.snapToGrid;
  else if (p.snapToGrid === 'true' || p.snapToGrid === 1) snapToGrid = true;
  else if (p.snapToGrid === 'false' || p.snapToGrid === 0) snapToGrid = false;
  else if (p.snapToGrid != null) {
    repaired = true;
    snapToGrid = defaults.snapToGrid;
  }

  let gridSize = finiteOr(p.gridSize, defaults.gridSize);
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    gridSize = defaults.gridSize;
    repaired = true;
  }
  gridSize = Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(gridSize)));

  if (repaired) {
    fwPersistWarn(`canvas prefs for section "${sectionId}" had invalid values; repaired snap/grid.`);
  }
  return { snapToGrid, gridSize, repaired };
}
