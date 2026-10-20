/**
 * WC-6A1 — Longitudinal Study Continuity Persistence.
 * User-scoped, board-scoped persistent history in localStorage.
 *
 * Rules:
 * - Scoped strictly by userId, sectionId, boardId.
 * - Key format: focus.study_continuity_v1:{userId}:{sectionId}:{boardId}
 * - Bounded to MAX_CONTINUITY_RECORDS (10) per store. Oldest lastActiveAt pruned on overflow.
 * - If userId is absent/empty: read -> null, write -> no-op false.
 * - Storage failures fail safely (zero crash).
 */

import {
  STUDY_CONTINUITY_VERSION,
  type StudyContinuityRecord,
  type StudyContinuityStore,
} from './types';

export const MAX_CONTINUITY_RECORDS = 10;

export function normalizeContinuityBoardId(boardId: string | null | undefined): string {
  return !boardId || boardId === 'main' ? 'main' : boardId.trim();
}

export function studyContinuityStorageKey(
  userId: string,
  sectionId: string,
  boardId: string,
): string {
  const normUser = userId ? userId.trim() : '';
  const normSection = sectionId ? sectionId.trim() : '';
  const normBoard = normalizeContinuityBoardId(boardId);
  return `focus.study_continuity_v1:${encodeURIComponent(normUser)}:${encodeURIComponent(normSection)}:${encodeURIComponent(normBoard)}`;
}

export function parseContinuityRecord(raw: unknown): StudyContinuityRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.version !== STUDY_CONTINUITY_VERSION) return null;
  if (typeof o.userId !== 'string' || !o.userId.trim()) return null;
  if (typeof o.sectionId !== 'string' || !o.sectionId.trim()) return null;
  if (typeof o.boardId !== 'string' || !o.boardId.trim()) return null;
  if (typeof o.sourceObjectId !== 'string' || !o.sourceObjectId.trim()) return null;
  if (typeof o.workObjectId !== 'string' || !o.workObjectId.trim()) return null;
  if (typeof o.lastActiveAt !== 'number' || !Number.isFinite(o.lastActiveAt)) return null;

  return {
    version: STUDY_CONTINUITY_VERSION,
    userId: o.userId.trim(),
    sectionId: o.sectionId.trim(),
    boardId: normalizeContinuityBoardId(o.boardId as string),
    sourceObjectId: o.sourceObjectId.trim(),
    workObjectId: o.workObjectId.trim(),
    lastActiveAt: o.lastActiveAt,
  };
}

export function parseContinuityStore(raw: unknown): StudyContinuityStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.version !== STUDY_CONTINUITY_VERSION) return null;
  if (!o.records || typeof o.records !== 'object') return null;

  const parsedRecords: Record<string, StudyContinuityRecord> = {};
  for (const [key, val] of Object.entries(o.records as Record<string, unknown>)) {
    const rec = parseContinuityRecord(val);
    if (rec) {
      parsedRecords[key] = rec;
    }
  }

  let mostRecentSourceId: string | null = null;
  if (typeof o.mostRecentSourceId === 'string' && o.mostRecentSourceId.trim()) {
    const id = o.mostRecentSourceId.trim();
    if (parsedRecords[id]) {
      mostRecentSourceId = id;
    }
  }

  // If mostRecentSourceId is missing or pruned, derive from records if any exist
  if (!mostRecentSourceId) {
    let latestTs = -1;
    for (const rec of Object.values(parsedRecords)) {
      if (rec.lastActiveAt > latestTs) {
        latestTs = rec.lastActiveAt;
        mostRecentSourceId = rec.sourceObjectId;
      }
    }
  }

  return {
    version: STUDY_CONTINUITY_VERSION,
    records: parsedRecords,
    mostRecentSourceId,
  };
}

function emptyStore(): StudyContinuityStore {
  return {
    version: STUDY_CONTINUITY_VERSION,
    records: {},
    mostRecentSourceId: null,
  };
}

export function loadStudyContinuityStore(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
): StudyContinuityStore | null {
  if (typeof localStorage === 'undefined') return null;
  if (!userId || !userId.trim() || !sectionId || !sectionId.trim()) return null;

  try {
    const key = studyContinuityStorageKey(userId, sectionId, boardId ?? 'main');
    const raw = localStorage.getItem(key);
    if (!raw) return emptyStore();
    try {
      const parsed = JSON.parse(raw);
      const store = parseContinuityStore(parsed);
      if (!store) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        return emptyStore();
      }
      return store;
    } catch {
      // Malformed JSON: clear invalid entry and return emptyStore safely
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return emptyStore();
    }
  } catch {
    return null;
  }
}

export function saveStudyContinuityRecord(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
  record: Omit<StudyContinuityRecord, 'version' | 'userId' | 'sectionId' | 'boardId'>,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!userId || !userId.trim() || !sectionId || !sectionId.trim()) return false;
  if (!record.sourceObjectId || !record.workObjectId) return false;

  try {
    const normUser = userId.trim();
    const normSection = sectionId.trim();
    const normBoard = normalizeContinuityBoardId(boardId);
    const key = studyContinuityStorageKey(normUser, normSection, normBoard);

    const store = loadStudyContinuityStore(normUser, normSection, normBoard) ?? emptyStore();

    const fullRecord: StudyContinuityRecord = {
      version: STUDY_CONTINUITY_VERSION,
      userId: normUser,
      sectionId: normSection,
      boardId: normBoard,
      sourceObjectId: record.sourceObjectId.trim(),
      workObjectId: record.workObjectId.trim(),
      lastActiveAt: record.lastActiveAt ?? Date.now(),
    };

    store.records[fullRecord.sourceObjectId] = fullRecord;
    store.mostRecentSourceId = fullRecord.sourceObjectId;

    // Enforce MAX_CONTINUITY_RECORDS (10)
    const entries = Object.entries(store.records);
    if (entries.length > MAX_CONTINUITY_RECORDS) {
      // Sort ascending by lastActiveAt (oldest first)
      entries.sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
      const toRemoveCount = entries.length - MAX_CONTINUITY_RECORDS;
      for (let i = 0; i < toRemoveCount; i++) {
        const [oldKey] = entries[i]!;
        delete store.records[oldKey];
      }
    }

    // Verify mostRecentSourceId after pruning
    if (store.mostRecentSourceId && !store.records[store.mostRecentSourceId]) {
      let latestTs = -1;
      let latestId: string | null = null;
      for (const rec of Object.values(store.records)) {
        if (rec.lastActiveAt > latestTs) {
          latestTs = rec.lastActiveAt;
          latestId = rec.sourceObjectId;
        }
      }
      store.mostRecentSourceId = latestId;
    }

    localStorage.setItem(key, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function getMostRecentStudyContinuity(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
): StudyContinuityRecord | null {
  const store = loadStudyContinuityStore(userId, sectionId, boardId);
  if (!store || !store.mostRecentSourceId) return null;
  return store.records[store.mostRecentSourceId] ?? null;
}

export function clearStudyContinuityForBoard(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
): void {
  if (typeof localStorage === 'undefined') return;
  if (!userId || !sectionId) return;
  try {
    const key = studyContinuityStorageKey(userId, sectionId, boardId ?? 'main');
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
