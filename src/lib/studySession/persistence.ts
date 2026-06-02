import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import type { StudySessionBoardStore, StudySessionRecord } from './types';

const STORE_VERSION = 1 as const;

function studySessionsKey(sectionId: string, boardId: string): string {
  const base = boardScopedFreeSpaceKeys(sectionId, boardId);
  return `${base.objects.replace(/_objects_v1$/, '')}_study_sessions_v1`;
}

function emptyStore(): StudySessionBoardStore {
  return { version: STORE_VERSION, sessions: {} };
}

function readStore(sectionId: string, boardId: string): StudySessionBoardStore {
  if (typeof localStorage === 'undefined') return emptyStore();
  try {
    const raw = localStorage.getItem(studySessionsKey(sectionId, boardId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as StudySessionBoardStore;
    if (parsed?.version !== STORE_VERSION || !parsed.sessions) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(sectionId: string, boardId: string, store: StudySessionBoardStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(studySessionsKey(sectionId, boardId), JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function loadStudySession(
  sectionId: string,
  boardId: string,
  sourceObjectId: string,
): StudySessionRecord | null {
  const store = readStore(sectionId, boardId);
  return store.sessions[sourceObjectId] ?? null;
}

export function saveStudySession(
  sectionId: string,
  boardId: string,
  record: StudySessionRecord,
): void {
  const store = readStore(sectionId, boardId);
  store.sessions[record.sourceObjectId] = record;
  writeStore(sectionId, boardId, store);
}

export function clearStudySession(
  sectionId: string,
  boardId: string,
  sourceObjectId: string,
): void {
  const store = readStore(sectionId, boardId);
  if (!store.sessions[sourceObjectId]) return;
  delete store.sessions[sourceObjectId];
  writeStore(sectionId, boardId, store);
}

export function getMostRecentSession(
  sectionId: string,
  boardId: string,
): StudySessionRecord | null {
  const store = readStore(sectionId, boardId);
  let best: StudySessionRecord | null = null;
  for (const rec of Object.values(store.sessions)) {
    const ts = rec.lastActiveAt || rec.enteredAt;
    if (!best || ts > (best.lastActiveAt || best.enteredAt)) best = rec;
  }
  return best;
}

export function touchStudySession(
  sectionId: string,
  boardId: string,
  patch: Partial<StudySessionRecord> & { sourceObjectId: string },
): StudySessionRecord | null {
  const existing = loadStudySession(sectionId, boardId, patch.sourceObjectId);
  if (!existing) return null;
  const next: StudySessionRecord = {
    ...existing,
    ...patch,
    source: { ...existing.source, ...patch.source },
    work: { ...existing.work, ...patch.work },
    lastActiveAt: Date.now(),
  };
  saveStudySession(sectionId, boardId, next);
  return next;
}
