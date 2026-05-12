/**
 * Workspace JSON export/import for the current section (Free Space + local chrome).
 * Never includes AI keys or cloud credentials — only section-scoped layout data.
 */

import type { PositionMap } from '../hooks/useBlockPositions';
import type { WorkspaceCustomization } from '../hooks/useWorkspaceCustomization';
import { getWorkspaceCustomization } from '../hooks/useWorkspaceCustomization';
import {
  repairFreeSpaceObjectList,
  type ProjectSpaceObject,
} from '../hooks/useSectionFreeSpaceObjects';
import { SECTION_DEFAULT_GRID_SIZE } from '../hooks/useSectionCanvasMode';
import {
  freeSpaceStorageKeys,
  fwPersistWarn,
  sanitizePositionMap,
  sanitizePrefs,
  sanitizeViewport,
} from './freeSpacePersistence';
import {
  base64ToPdfBlob,
  deleteAllPdfBlobsForSection,
  loadPdfBlob,
  pdfBlobToBase64,
  savePdfBlob,
} from './freeSpacePdfIdb';

export const WORKSPACE_BACKUP_FORMAT = 'focus-workspace-backup' as const;
export const WORKSPACE_BACKUP_VERSION = 1 as const;

const CUSTOMIZATION_KEY = 'focus_workspace_customization';
const FOLDERS_KEY = 'fw_workspace_library_folders_v1';

const VIEW_DEFAULTS = { zoom: 1, panX: 40, panY: 40 };
const PREF_DEFAULTS = { snapToGrid: true, gridSize: SECTION_DEFAULT_GRID_SIZE };

export interface WorkspaceBackupFreeSpaceV1 {
  objects: ProjectSpaceObject[];
  positions: PositionMap;
  viewport: { zoom: number; panX: number; panY: number };
  prefs: { snapToGrid: boolean; gridSize: number };
}

export interface WorkspaceBackupV1 {
  format: typeof WORKSPACE_BACKUP_FORMAT;
  version: typeof WORKSPACE_BACKUP_VERSION;
  exportedAt: string;
  /** Section id at export time (informational). */
  sourceSectionId: string;
  sectionTitle?: string;
  freeSpace: WorkspaceBackupFreeSpaceV1;
  customization?: WorkspaceCustomization | null;
  /** Folder assignment for this workspace only (library is shared). */
  library?: { folderAssignment: string | null; folderName?: string };
  /** PDF object id → base64 (no data: URL prefix). */
  pdfBlobs?: Record<string, string>;
}

function readLibrarySlice(sectionId: string): WorkspaceBackupV1['library'] | undefined {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as {
      folders?: { id: string; name: string }[];
      assignments?: Record<string, string>;
    };
    const assignments = p.assignments && typeof p.assignments === 'object' ? p.assignments : {};
    const folderId = assignments[sectionId];
    if (typeof folderId !== 'string' || !folderId.trim()) return undefined;
    const folders = Array.isArray(p.folders) ? p.folders : [];
    const name = folders.find(f => f.id === folderId)?.name;
    return { folderAssignment: folderId, folderName: name };
  } catch {
    return undefined;
  }
}

export async function buildWorkspaceBackupV1(
  sectionId: string,
  opts?: { sectionTitle?: string },
): Promise<WorkspaceBackupV1> {
  if (!sectionId) {
    throw new Error('Missing section id for backup');
  }
  const keys = freeSpaceStorageKeys(sectionId);

  let objects: ProjectSpaceObject[] = [];
  try {
    const rawObs = localStorage.getItem(keys.objects);
    const parsed = rawObs ? (JSON.parse(rawObs) as unknown) : [];
    objects = repairFreeSpaceObjectList(parsed, sectionId).objects;
  } catch (e) {
    fwPersistWarn(`Backup: could not read Free Space objects: ${String(e)}`);
  }

  let positions: PositionMap = {};
  try {
    const rawPos = localStorage.getItem(keys.positions);
    const posParsed = rawPos ? (JSON.parse(rawPos) as unknown) : {};
    positions = sanitizePositionMap(posParsed, sectionId).map;
  } catch (e) {
    fwPersistWarn(`Backup: could not read positions: ${String(e)}`);
  }

  let viewport = { ...VIEW_DEFAULTS };
  try {
    const rawVp = localStorage.getItem(keys.viewport);
    const vpParsed = rawVp ? (JSON.parse(rawVp) as unknown) : null;
    const s = sanitizeViewport(vpParsed, sectionId, VIEW_DEFAULTS);
    viewport = { zoom: s.zoom, panX: s.panX, panY: s.panY };
  } catch (e) {
    fwPersistWarn(`Backup: could not read viewport: ${String(e)}`);
  }

  let prefs = { ...PREF_DEFAULTS };
  try {
    const rawPr = localStorage.getItem(keys.prefs);
    const prParsed = rawPr ? (JSON.parse(rawPr) as unknown) : null;
    const s = sanitizePrefs(prParsed, sectionId, PREF_DEFAULTS);
    prefs = { snapToGrid: s.snapToGrid, gridSize: s.gridSize };
  } catch (e) {
    fwPersistWarn(`Backup: could not read canvas prefs: ${String(e)}`);
  }

  const customization = getWorkspaceCustomization(sectionId);
  const library = readLibrarySlice(sectionId);

  const pdfBlobs: Record<string, string> = {};
  for (const o of objects) {
    if (o.type !== 'pdf') continue;
    try {
      const blob = await loadPdfBlob(sectionId, o.id);
      if (!blob) continue;
      pdfBlobs[o.id] = await pdfBlobToBase64(blob);
    } catch {
      fwPersistWarn(`Backup: skipped PDF bytes for object "${o.id}"`);
    }
  }

  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sourceSectionId: sectionId,
    sectionTitle: opts?.sectionTitle,
    freeSpace: { objects, positions, viewport, prefs },
    customization,
    library,
    pdfBlobs: Object.keys(pdfBlobs).length ? pdfBlobs : undefined,
  };
}

export function downloadWorkspaceBackupJson(backup: WorkspaceBackupV1): void {
  const slug =
    (backup.sectionTitle ?? 'workspace')
      .replace(/[^\w\-]+/g, '-')
      .slice(0, 48) || 'workspace';
  const stamp = backup.exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  const filename = `focus-workspace-backup-${slug}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function validateWorkspaceBackup(data: unknown):
  | { ok: true; backup: WorkspaceBackupV1 }
  | { ok: false; message: string } {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'Backup must be a JSON object.' };
  }
  const o = data as Record<string, unknown>;
  if (o.format !== WORKSPACE_BACKUP_FORMAT) {
    return { ok: false, message: 'This file is not a Focus Workspace backup.' };
  }
  if (o.version !== WORKSPACE_BACKUP_VERSION) {
    return { ok: false, message: 'This backup version is not supported.' };
  }
  if (typeof o.sourceSectionId !== 'string' || !o.sourceSectionId.trim()) {
    return { ok: false, message: 'Backup is missing a source workspace id.' };
  }
  const fs = o.freeSpace;
  if (!fs || typeof fs !== 'object') {
    return { ok: false, message: 'Backup is missing Free Space data.' };
  }
  const f = fs as Record<string, unknown>;
  if (!Array.isArray(f.objects)) {
    return { ok: false, message: 'Backup Free Space objects are not a list.' };
  }
  if (!f.positions || typeof f.positions !== 'object' || Array.isArray(f.positions)) {
    return { ok: false, message: 'Backup positions are invalid.' };
  }
  if (!f.viewport || typeof f.viewport !== 'object') {
    return { ok: false, message: 'Backup viewport is invalid.' };
  }
  const v = f.viewport as Record<string, unknown>;
  for (const k of ['zoom', 'panX', 'panY'] as const) {
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k] as number)) {
      return { ok: false, message: 'Backup viewport has invalid numbers.' };
    }
  }
  if (!f.prefs || typeof f.prefs !== 'object') {
    return { ok: false, message: 'Backup canvas preferences are invalid.' };
  }
  const p = f.prefs as Record<string, unknown>;
  if (typeof p.snapToGrid !== 'boolean') {
    return { ok: false, message: 'Backup canvas preferences are incomplete.' };
  }
  if (typeof p.gridSize !== 'number' || !Number.isFinite(p.gridSize)) {
    return { ok: false, message: 'Backup grid size is invalid.' };
  }
  if (o.customization != null && typeof o.customization !== 'object') {
    return { ok: false, message: 'Backup customization block is invalid.' };
  }
  if (o.pdfBlobs != null && (typeof o.pdfBlobs !== 'object' || Array.isArray(o.pdfBlobs))) {
    return { ok: false, message: 'Backup PDF attachment map is invalid.' };
  }
  if (o.library != null && typeof o.library !== 'object') {
    return { ok: false, message: 'Backup library block is invalid.' };
  }

  const backup = data as WorkspaceBackupV1;
  return { ok: true, backup };
}

/** Coerce and repair fields; mutates a shallow clone of freeSpace for apply. */
export function repairWorkspaceBackupForApply(
  backup: WorkspaceBackupV1,
  targetSectionId: string,
): WorkspaceBackupV1 {
  const { objects, repaired: obsRepaired } = repairFreeSpaceObjectList(
    backup.freeSpace.objects,
    targetSectionId,
  );
  if (obsRepaired) {
    fwPersistWarn('Import: repaired Free Space object list before apply.');
  }
  const { map: positions, repaired: posRepaired } = sanitizePositionMap(
    backup.freeSpace.positions,
    targetSectionId,
  );
  if (posRepaired) fwPersistWarn('Import: repaired position map before apply.');
  const vp = sanitizeViewport(backup.freeSpace.viewport, targetSectionId, VIEW_DEFAULTS);
  if (vp.repaired) fwPersistWarn('Import: repaired viewport before apply.');
  const pr = sanitizePrefs(backup.freeSpace.prefs, targetSectionId, PREF_DEFAULTS);
  if (pr.repaired) fwPersistWarn('Import: repaired canvas prefs before apply.');

  let customization = backup.customization;
  if (customization && typeof customization === 'object') {
    const cur = getWorkspaceCustomization(targetSectionId);
    customization = {
      ...cur,
      ...customization,
    };
  }

  return {
    ...backup,
    customization,
    freeSpace: {
      objects,
      positions,
      viewport: { zoom: vp.zoom, panX: vp.panX, panY: vp.panY },
      prefs: { snapToGrid: pr.snapToGrid, gridSize: pr.gridSize },
    },
  };
}

export async function applyWorkspaceBackupToSection(
  backup: WorkspaceBackupV1,
  targetSectionId: string,
): Promise<void> {
  if (!targetSectionId) throw new Error('Missing target section id');
  const fixed = repairWorkspaceBackupForApply(backup, targetSectionId);
  const keys = freeSpaceStorageKeys(targetSectionId);

  try {
    localStorage.setItem(keys.objects, JSON.stringify(fixed.freeSpace.objects));
    localStorage.setItem(keys.positions, JSON.stringify(fixed.freeSpace.positions));
    localStorage.setItem(
      keys.viewport,
      JSON.stringify(fixed.freeSpace.viewport),
    );
    localStorage.setItem(keys.prefs, JSON.stringify(fixed.freeSpace.prefs));
  } catch (e) {
    fwPersistWarn(`Import: failed writing localStorage: ${String(e)}`);
    throw e;
  }

  if (fixed.customization) {
    try {
      const raw = localStorage.getItem(CUSTOMIZATION_KEY);
      const all = (raw ? JSON.parse(raw) : {}) as Record<string, WorkspaceCustomization>;
      all[targetSectionId] = fixed.customization;
      localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(all));
    } catch (e) {
      fwPersistWarn(`Import: could not merge customization: ${String(e)}`);
    }
  }

  if (fixed.library?.folderAssignment) {
    const folderId = fixed.library.folderAssignment;
    try {
      const raw = localStorage.getItem(FOLDERS_KEY);
      const data = raw
        ? (JSON.parse(raw) as {
            folders?: { id: string; name: string }[];
            assignments?: Record<string, string>;
          })
        : { folders: [], assignments: {} };
      const folders = Array.isArray(data.folders) ? data.folders : [];
      const exists = folders.some(f => f.id === folderId);
      if (exists) {
        const assignments = { ...(data.assignments ?? {}) };
        assignments[targetSectionId] = folderId;
        localStorage.setItem(FOLDERS_KEY, JSON.stringify({ folders, assignments }));
      } else {
        fwPersistWarn(
          `Import: folder id "${folderId}" from backup is not on this device; folder assignment skipped.`,
        );
      }
    } catch (e) {
      fwPersistWarn(`Import: could not merge library folder: ${String(e)}`);
    }
  }

  await deleteAllPdfBlobsForSection(targetSectionId);
  const blobs = fixed.pdfBlobs ?? {};
  for (const obj of fixed.freeSpace.objects) {
    if (obj.type !== 'pdf') continue;
    const b64 = blobs[obj.id];
    if (!b64 || typeof b64 !== 'string') continue;
    try {
      const blob = base64ToPdfBlob(b64);
      await savePdfBlob(targetSectionId, obj.id, blob);
    } catch (e) {
      fwPersistWarn(`Import: could not restore PDF for "${obj.id}": ${String(e)}`);
    }
  }

  fwPersistWarn(
    `Workspace backup from "${fixed.sourceSectionId}" applied to "${targetSectionId}". Reload recommended.`,
  );
}
