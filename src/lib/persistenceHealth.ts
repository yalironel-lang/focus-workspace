/**
 * Cross-key local persistence validation / repair for workspace trust.
 */

import { repairFreeSpaceObjectList } from '../hooks/useSectionFreeSpaceObjects';
import {
  freeSpaceStorageKeys,
  fwPersistWarn,
  sanitizePositionMap,
  sanitizePrefs,
  sanitizeViewport,
} from './freeSpacePersistence';
import { SECTION_DEFAULT_GRID_SIZE } from '../hooks/useSectionCanvasMode';

const FOLDERS_KEY = 'fw_workspace_library_folders_v1';
const RECENT_KEY = 'fw_workspace_library_recent_v1';
const VIEW_DEFAULTS = { zoom: 1, panX: 40, panY: 40 };
const PREF_DEFAULTS = { snapToGrid: true, gridSize: SECTION_DEFAULT_GRID_SIZE };

export interface PersistenceHealthResult {
  messages: string[];
  wrote: boolean;
}

/** Validates and rewrites workspace folder library JSON if needed. */
export function repairWorkspaceFoldersStorage(): PersistenceHealthResult {
  const messages: string[] = [];
  let wrote = false;
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return { messages, wrote };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const foldersRaw = p.folders;
    const assignmentsRaw = p.assignments;
    const folders = Array.isArray(foldersRaw)
      ? foldersRaw.filter(
          (x): x is { id: string; name: string } =>
            !!x &&
            typeof x === 'object' &&
            typeof (x as { id?: string }).id === 'string' &&
            typeof (x as { name?: string }).name === 'string',
        )
      : [];
    const assignments: Record<string, string> = {};
    if (assignmentsRaw && typeof assignmentsRaw === 'object' && !Array.isArray(assignmentsRaw)) {
      for (const [k, v] of Object.entries(assignmentsRaw as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string') assignments[k] = v;
      }
    }
    const folderIds = new Set(folders.map(f => f.id));
    const assignClean: Record<string, string> = { ...assignments };
    for (const sid of Object.keys(assignments)) {
      const fid = assignments[sid];
      if (!folderIds.has(fid)) {
        delete assignClean[sid];
        fwPersistWarn(`Library: removed stale folder assignment for section "${sid}".`);
        wrote = true;
      }
    }
    if (!Array.isArray(foldersRaw) || foldersRaw.length !== folders.length) {
      fwPersistWarn('Library: repaired workspace folders list shape.');
      wrote = true;
    }
    if (wrote) {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify({ folders, assignments: assignClean }));
      messages.push('Workspace folder data was repaired.');
    }
  } catch (e) {
    fwPersistWarn(`Library: folder storage unreadable (${String(e)}); leaving untouched.`);
    messages.push('Folder data could not be validated (left unchanged).');
  }
  return { messages, wrote };
}

/** Validates recent workspaces list; drops invalid rows. */
export function repairRecentWorkspacesStorage(): PersistenceHealthResult {
  const messages: string[] = [];
  let wrote = false;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return { messages, wrote };
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) {
      localStorage.removeItem(RECENT_KEY);
      fwPersistWarn('Recent workspaces: storage was not an array; cleared key.');
      return { messages: ['Recent workspaces list was reset (was not an array).'], wrote: true };
    }
    const next = arr
      .filter(
        (x): x is { sectionId: string; openedAt: string } =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as { sectionId?: string }).sectionId === 'string' &&
          typeof (x as { openedAt?: string }).openedAt === 'string',
      )
      .slice(0, 24);
    if (next.length !== arr.length) {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      fwPersistWarn('Recent workspaces: dropped invalid entries.');
      messages.push('Recent workspaces list was repaired.');
      wrote = true;
    }
  } catch (e) {
    fwPersistWarn(`Recent workspaces: parse failed (${String(e)}).`);
    messages.push('Recent workspaces could not be validated.');
  }
  return { messages, wrote };
}

/**
 * Reads section-scoped Free Space keys, sanitizes, and rewrites when repair is needed.
 * Also runs shared library repairs.
 */
export function runSectionPersistenceHealth(sectionId: string): PersistenceHealthResult {
  const messages: string[] = [];
  let wrote = false;
  if (!sectionId) {
    messages.push('No workspace id — nothing to check.');
    return { messages, wrote };
  }
  const keys = freeSpaceStorageKeys(sectionId);

  try {
    const rawObs = localStorage.getItem(keys.objects);
    if (rawObs) {
      const parsed = JSON.parse(rawObs) as unknown;
      const { objects, repaired } = repairFreeSpaceObjectList(parsed, sectionId);
      if (repaired) {
        localStorage.setItem(keys.objects, JSON.stringify(objects));
        fwPersistWarn(`Health: rewrote Free Space objects for "${sectionId}".`);
        messages.push('Free Space objects were repaired.');
        wrote = true;
      }
    }
  } catch (e) {
    fwPersistWarn(`Health: Free Space objects unreadable for "${sectionId}": ${String(e)}`);
    messages.push('Free Space objects could not be read (left unchanged).');
  }

  try {
    const rawPos = localStorage.getItem(keys.positions);
    if (rawPos) {
      const parsed = JSON.parse(rawPos) as unknown;
      const { map, repaired } = sanitizePositionMap(parsed, sectionId);
      if (repaired) {
        localStorage.setItem(keys.positions, JSON.stringify(map));
        fwPersistWarn(`Health: rewrote Free Space positions for "${sectionId}".`);
        messages.push('Free Space positions were repaired.');
        wrote = true;
      }
    }
  } catch (e) {
    fwPersistWarn(`Health: positions JSON bad for "${sectionId}": ${String(e)}`);
    messages.push('Free Space positions could not be read.');
  }

  try {
    const rawVp = localStorage.getItem(keys.viewport);
    if (rawVp) {
      const parsed = JSON.parse(rawVp) as unknown;
      const s = sanitizeViewport(parsed, sectionId, VIEW_DEFAULTS);
      if (s.repaired) {
        localStorage.setItem(keys.viewport, JSON.stringify({ zoom: s.zoom, panX: s.panX, panY: s.panY }));
        fwPersistWarn(`Health: repaired viewport for "${sectionId}".`);
        messages.push('Canvas viewport was repaired.');
        wrote = true;
      }
    }
  } catch (e) {
    fwPersistWarn(`Health: viewport JSON bad for "${sectionId}": ${String(e)}`);
  }

  try {
    const rawPr = localStorage.getItem(keys.prefs);
    if (rawPr) {
      const parsed = JSON.parse(rawPr) as unknown;
      const s = sanitizePrefs(parsed, sectionId, PREF_DEFAULTS);
      if (s.repaired) {
        localStorage.setItem(keys.prefs, JSON.stringify({ snapToGrid: s.snapToGrid, gridSize: s.gridSize }));
        fwPersistWarn(`Health: repaired canvas prefs for "${sectionId}".`);
        messages.push('Canvas preferences were repaired.');
        wrote = true;
      }
    }
  } catch (e) {
    fwPersistWarn(`Health: prefs JSON bad for "${sectionId}": ${String(e)}`);
  }

  const f = repairWorkspaceFoldersStorage();
  messages.push(...f.messages);
  if (f.wrote) wrote = true;
  const r = repairRecentWorkspacesStorage();
  messages.push(...r.messages);
  if (r.wrote) wrote = true;

  if (!wrote && messages.length === 0) {
    messages.push('Local data for this workspace looks consistent.');
  }
  return { messages, wrote };
}
