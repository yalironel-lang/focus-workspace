import type { BlockPos, PositionMap } from '../../hooks/useBlockPositions';
import { fwPersistWarn, sanitizeViewport } from '../freeSpacePersistence';
import type { UniverseCanvasSnapshot, UniversePortalRecord } from './types';
import { portalIdForSection } from './portalIds';

const VIEWPORT_KEY = 'fw_universe_viewport_v1';
const PORTALS_KEY = 'fw_universe_portal_positions_v1';

const VIEW_DEFAULTS: UniverseCanvasSnapshot = { zoom: 0.92, panX: 80, panY: 72 };

const PORTAL_W = 320;
const PORTAL_H = 228;

export function loadUniverseViewport(): UniverseCanvasSnapshot {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return VIEW_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    const s = sanitizeViewport(parsed, 'universe', VIEW_DEFAULTS);
    return { zoom: s.zoom, panX: s.panX, panY: s.panY };
  } catch (e) {
    fwPersistWarn(`Universe viewport unreadable: ${String(e)}`);
    return VIEW_DEFAULTS;
  }
}

export function saveUniverseViewport(v: UniverseCanvasSnapshot): void {
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(v));
  } catch {
    /* quota */
  }
}

function loadPortalRecords(): UniversePortalRecord[] {
  try {
    const raw = localStorage.getItem(PORTALS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is UniversePortalRecord =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as UniversePortalRecord).sectionId === 'string' &&
        typeof (x as UniversePortalRecord).x === 'number' &&
        typeof (x as UniversePortalRecord).y === 'number',
    );
  } catch {
    return [];
  }
}

function savePortalRecords(records: UniversePortalRecord[]): void {
  try {
    localStorage.setItem(PORTALS_KEY, JSON.stringify(records));
  } catch {
    /* quota */
  }
}

function defaultPortalPosition(index: number): Pick<UniversePortalRecord, 'x' | 'y' | 'w' | 'h'> {
  const cols = 3;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: 140 + col * 380,
    y: 140 + row * 300,
    w: PORTAL_W,
    h: PORTAL_H,
  };
}

/** Merge section list with saved portal layout; assign positions for new projects. */
export function buildUniversePositionMap(sectionIds: string[]): PositionMap {
  const saved = loadPortalRecords();
  const bySection = new Map(saved.map(r => [r.sectionId, r]));
  const map: PositionMap = {};

  sectionIds.forEach((sectionId, listIndex) => {
    const existing = bySection.get(sectionId);
    if (existing) {
      map[portalIdForSection(sectionId)] = {
        x: existing.x,
        y: existing.y,
        w: existing.w > 0 ? existing.w : PORTAL_W,
        h: existing.h > 0 ? existing.h : PORTAL_H,
      };
    } else {
      map[portalIdForSection(sectionId)] = defaultPortalPosition(listIndex);
    }
  });

  const records: UniversePortalRecord[] = sectionIds.map(sectionId => {
    const p = map[portalIdForSection(sectionId)]!;
    return {
      sectionId,
      x: p.x,
      y: p.y,
      w: p.w ?? PORTAL_W,
      h: p.h ?? PORTAL_H,
    };
  });
  savePortalRecords(records);
  return map;
}

export function persistUniversePortalPosition(
  sectionIds: string[],
  portalId: string,
  patch: Partial<BlockPos>,
): PositionMap {
  const current = buildUniversePositionMap(sectionIds);
  const prev = current[portalId] ?? { x: 140, y: 140, w: PORTAL_W, h: PORTAL_H };
  const next: PositionMap = {
    ...current,
    [portalId]: { ...prev, ...patch },
  };
  const records: UniversePortalRecord[] = sectionIds.map(sid => {
    const pid = portalIdForSection(sid);
    const p = next[pid] ?? defaultPortalPosition(0);
    return {
      sectionId: sid,
      x: p.x,
      y: p.y,
      w: p.w ?? PORTAL_W,
      h: p.h ?? PORTAL_H,
    };
  });
  savePortalRecords(records);
  return next;
}
