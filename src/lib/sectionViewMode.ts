import { isMathZoneDestinationEnabled } from './mathZoneDestinationConfig';

const VIEW_MODE_KEY_V2 = 'fw_section_view_mode_v2';

export type SectionViewMode = 'work-surface' | 'free-space' | 'math-zone';

/** Coerce deprecated destinations when the feature flag is off. */
export function normalizeSectionViewMode(mode: SectionViewMode): SectionViewMode {
  if (mode === 'math-zone' && !isMathZoneDestinationEnabled()) return 'free-space';
  return mode;
}

export interface SectionViewModeRecord {
  mode: SectionViewMode;
  /** Last time this mode was actively chosen or written to. */
  savedAt: number;
}

function parseRecord(raw: unknown): SectionViewModeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  if (mode !== 'work-surface' && mode !== 'free-space' && mode !== 'math-zone') return null;
  const savedAt = typeof o.savedAt === 'number' && Number.isFinite(o.savedAt) ? o.savedAt : Date.now();
  return { mode, savedAt };
}

function loadMap(): Record<string, SectionViewModeRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY_V2);
    if (!raw) return migrateFromSessionStorage();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, SectionViewModeRecord> = {};
    for (const [sectionId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const rec =
        typeof value === 'string'
          ? { mode: legacyModeFromString(value), savedAt: Date.now() }
          : parseRecord(value);
      if (rec) out[sectionId] = rec;
    }
    return out;
  } catch {
    return {};
  }
}

function legacyModeFromString(m: string): SectionViewMode {
  if (m === 'work-surface') return 'work-surface';
  if (m === 'math-zone') return 'math-zone';
  return 'free-space';
}

/** One-time migration from tab-scoped sessionStorage (v1). */
function migrateFromSessionStorage(): Record<string, SectionViewModeRecord> {
  const out: Record<string, SectionViewModeRecord> = {};
  if (typeof window === 'undefined') return out;
  try {
    const raw = sessionStorage.getItem('fw_section_view_mode_v1');
    if (!raw) return out;
    const map = JSON.parse(raw) as Record<string, string>;
    const now = Date.now();
    for (const [sectionId, mode] of Object.entries(map)) {
      if (typeof mode === 'string') {
        out[sectionId] = { mode: legacyModeFromString(mode), savedAt: now };
      }
    }
    if (Object.keys(out).length > 0) {
      localStorage.setItem(VIEW_MODE_KEY_V2, JSON.stringify(out));
    }
  } catch {
    /* ignore */
  }
  return out;
}

function saveMap(map: Record<string, SectionViewModeRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEW_MODE_KEY_V2, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function loadSectionViewMode(sectionId: string): SectionViewMode {
  if (!sectionId || typeof window === 'undefined') return 'free-space';
  const map = loadMap();
  const mode = map[sectionId]?.mode ?? 'free-space';
  return normalizeSectionViewMode(mode);
}

export function loadSectionViewModeRecord(sectionId: string): SectionViewModeRecord | null {
  if (!sectionId || typeof window === 'undefined') return null;
  const map = loadMap();
  return map[sectionId] ?? null;
}

export function saveSectionViewMode(sectionId: string, mode: SectionViewMode): void {
  if (!sectionId || typeof window === 'undefined') return;
  const map = loadMap();
  map[sectionId] = { mode: normalizeSectionViewMode(mode), savedAt: Date.now() };
  saveMap(map);
}

/** Touch savedAt without changing mode (e.g. Free Space notebook write). */
export function touchSectionViewModeActivity(sectionId: string, surface: SectionViewMode): void {
  if (!sectionId || typeof window === 'undefined') return;
  const map = loadMap();
  const prev = map[sectionId];
  map[sectionId] = {
    mode: surface,
    savedAt: Date.now(),
  };
  if (!prev || prev.mode !== surface) {
    map[sectionId]!.mode = surface;
  }
  saveMap(map);
}
