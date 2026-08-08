/**
 * Developer diagnostics: window.__fwSaveDiag() and window.__fwCloudDiag()
 */

import { getFwFreeSpaceDevSectionContext } from './freeSpacePersistence';
import { probeIndexedDbEnvironment } from './indexedDbEnvironment';
import { pdfUploadDiagDump } from './pdfUploadDiag';
import { getSaveScope, getSaveStatusSnapshot } from './saveStatus';
import { isSupabaseConfigured, supabase } from './supabase';
import { deriveSyncUiStatus } from './sync/deriveSyncUiStatus';
import {
  formatSyncTimelineLines,
  getSyncTimelineEvents,
  isSyncTimelineEnabled,
} from './sync/syncEventTimeline';
import type { SyncUiStatus } from './sync/syncStatusTypes';

export interface SaveDiagSnapshot {
  scope: ReturnType<typeof getSaveScope>;
  devSectionContext: string | null;
  saveStatus: ReturnType<typeof getSaveStatusSnapshot>;
  syncUi: SyncUiStatus;
  syncTimelineEnabled: boolean;
  syncTimeline: string[];
  indexedDb: ReturnType<typeof probeIndexedDbEnvironment>;
  localStorage: {
    available: boolean;
    keysMatchingSection: number;
    approximateBytes: number;
  };
  serviceWorker: {
    supported: boolean;
    controller: boolean;
    state: string | null;
    openCaches: string[];
  };
  pdfDiagRecent: ReturnType<typeof pdfUploadDiagDump>;
  hints: string[];
}

export interface CloudDiagSnapshot {
  configured: boolean;
  online: boolean;
  session: {
    hasSession: boolean;
    userId: string | null;
    expiresAt: number | null;
  };
  hints: string[];
}

function countLocalStorageForSection(sectionId: string | null): { keys: number; bytes: number } {
  if (!sectionId || typeof localStorage === 'undefined') return { keys: 0, bytes: 0 };
  const prefixes = [`fw_section_${sectionId}`, `fw_section_${sectionId}_board_`];
  let keys = 0;
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!prefixes.some(p => k.startsWith(p))) continue;
      keys += 1;
      const v = localStorage.getItem(k);
      bytes += k.length + (v?.length ?? 0);
    }
  } catch {
    /* ignore */
  }
  return { keys, bytes };
}

function localStorageProbe(): boolean {
  try {
    const k = '__fw_ls_diag__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

async function serviceWorkerSnapshot(): Promise<SaveDiagSnapshot['serviceWorker']> {
  const base = {
    supported: 'serviceWorker' in navigator,
    controller: false,
    state: null as string | null,
    openCaches: [] as string[],
  };
  if (!base.supported) return base;
  base.controller = !!navigator.serviceWorker.controller;
  base.state = navigator.serviceWorker.controller?.state ?? null;
  if ('caches' in window) {
    try {
      base.openCaches = await caches.keys();
    } catch {
      /* ignore */
    }
  }
  return base;
}

function buildHints(snapshot: SaveDiagSnapshot): string[] {
  const hints: string[] = [];
  const { saveStatus, indexedDb, serviceWorker, localStorage: ls } = snapshot;

  if (!isSupabaseConfigured) {
    hints.push('Supabase is not configured — cloud items (tasks/notes in groups) will not sync.');
  }
  hints.push('Free Space objects, notebooks, handwriting, and local PDFs are device-local only (not cloud-synced).');

  if (!indexedDb.resolved) {
    hints.push('IndexedDB unavailable — PDFs and handwriting may not persist (common in private browsing).');
  }
  if (!ls.available) {
    hints.push('localStorage unavailable — Free Space metadata cannot be saved.');
  }
  if (saveStatus.anyPending) {
    hints.push('There are pending unsaved changes — wait a moment or call flush before reload.');
  }
  if (saveStatus.anyError) {
    hints.push('A recent save failed — check saveStatus.channels for lastError.');
  }
  if (saveStatus.storageConflicts.length > 0) {
    hints.push(
      `Multi-tab storage conflicts (${saveStatus.storageConflicts.length}) — diagnostics only in PR 0; not shown in the user indicator.`,
    );
  }
  if (snapshot.syncUi.phase === 'local_failed') {
    hints.push('Derived sync UI phase: local_failed (Save failed).');
  }
  if (serviceWorker.controller && serviceWorker.openCaches.length > 0) {
    hints.push('Service worker is active with open caches — stale asset cache can cause 404s after deploy (not data loss).');
  }
  return hints;
}

export async function buildSaveDiagSnapshot(): Promise<SaveDiagSnapshot> {
  const scope = getSaveScope();
  const sectionId = scope.sectionId ?? getFwFreeSpaceDevSectionContext();
  const lsSection = countLocalStorageForSection(sectionId);
  const saveStatus = getSaveStatusSnapshot();
  const indexedDb = probeIndexedDbEnvironment();
  const serviceWorker = await serviceWorkerSnapshot();

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const syncUi = deriveSyncUiStatus(saveStatus, { online, showSavedLocal: false });
  const syncTimelineEnabled = isSyncTimelineEnabled();
  const snapshot: SaveDiagSnapshot = {
    scope,
    devSectionContext: getFwFreeSpaceDevSectionContext(),
    saveStatus,
    syncUi,
    syncTimelineEnabled,
    syncTimeline: syncTimelineEnabled ? formatSyncTimelineLines(getSyncTimelineEvents()) : [],
    indexedDb,
    localStorage: {
      available: localStorageProbe(),
      keysMatchingSection: lsSection.keys,
      approximateBytes: lsSection.bytes,
    },
    serviceWorker,
    pdfDiagRecent: pdfUploadDiagDump(),
    hints: [],
  };
  snapshot.hints = buildHints(snapshot);
  return snapshot;
}

export async function buildCloudDiagSnapshot(): Promise<CloudDiagSnapshot> {
  const hints: string[] = [];
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isSupabaseConfigured) {
    hints.push('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — cloud persistence disabled.');
    return {
      configured: false,
      online,
      session: { hasSession: false, userId: null, expiresAt: null },
      hints,
    };
  }

  let session: CloudDiagSnapshot['session'] = { hasSession: false, userId: null, expiresAt: null };
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    session = {
      hasSession: !!s,
      userId: s?.user?.id ?? null,
      expiresAt: s?.expires_at ? s.expires_at * 1000 : null,
    };
    if (!s) hints.push('No active Supabase session — sign in to sync sections/groups/items.');
    if (!online) hints.push('Browser is offline — cloud writes will fail until reconnect.');
  } catch (e) {
    hints.push(`Could not read Supabase session: ${e instanceof Error ? e.message : String(e)}`);
  }

  hints.push('Cloud sync covers sections, groups, and lane items only — not Free Space canvas data.');

  return { configured: true, online, session, hints };
}

declare global {
  interface Window {
    __fwSaveDiag?: () => Promise<SaveDiagSnapshot>;
    __fwCloudDiag?: () => Promise<CloudDiagSnapshot>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwSaveDiag = buildSaveDiagSnapshot;
  window.__fwCloudDiag = buildCloudDiagSnapshot;
}
