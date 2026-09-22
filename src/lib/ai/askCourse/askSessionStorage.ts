/**
 * M0.9C2.3 — local active Ask session persistence (client-only).
 * Survives refresh / Ask close / remount for the same user + section.
 * Not chat history, not cross-device sync.
 */

import type { AskCourseSourceRef } from '../gatewayClient';

export type AskSessionTurn = {
  id: string;
  question: string;
  answer: string;
  sources: AskCourseSourceRef[];
  status: 'success';
};

export const ASK_SESSION_STORAGE_VERSION = 1 as const;
export const ASK_SESSION_MAX_TURNS = 20 as const;
export const ASK_SESSION_MAX_QUESTION_CHARS = 2000 as const;
export const ASK_SESSION_MAX_ANSWER_CHARS = 8000 as const;
export const ASK_SESSION_MAX_SOURCES_PER_TURN = 8 as const;
export const ASK_SESSION_MAX_DRAFT_CHARS = 2000 as const;
/** Soft cap on serialized JSON size (chars). */
export const ASK_SESSION_MAX_SERIALIZED_CHARS = 150_000 as const;

export type PersistedAskSessionV1 = {
  version: typeof ASK_SESSION_STORAGE_VERSION;
  sectionId: string;
  turns: AskSessionTurn[];
  draft: string;
  updatedAt: number;
};

export function askSessionStorageKey(userId: string, sectionId: string): string {
  return `fw_ask_session_v1:${userId}:${sectionId}`;
}

function isNonEmptyId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v === v.trim();
}

function parseSource(raw: unknown): AskCourseSourceRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.index !== 'number' || !Number.isFinite(o.index)) return null;

  if (o.sourceKind === 'notebook_page') {
    if (!isNonEmptyId(o.notebookObjectId) || !isNonEmptyId(o.pageId)) return null;
    if (o.notebookTitle !== null && typeof o.notebookTitle !== 'string') return null;
    if (o.pageTitle !== null && typeof o.pageTitle !== 'string') return null;
    return {
      index: o.index,
      sourceKind: 'notebook_page',
      notebookObjectId: o.notebookObjectId,
      pageId: o.pageId,
      notebookTitle: (o.notebookTitle as string | null) ?? null,
      pageTitle: (o.pageTitle as string | null) ?? null,
    };
  }

  if (o.sourceKind === 'free_space_pdf' || o.sourceObjectId !== undefined) {
    if (typeof o.sourceObjectId !== 'string' || !o.sourceObjectId) return null;
    if (typeof o.pageNumber !== 'number' || !Number.isFinite(o.pageNumber)) return null;
    if (o.fileName !== null && typeof o.fileName !== 'string') return null;
    return {
      index: o.index,
      sourceKind: 'free_space_pdf',
      sourceObjectId: o.sourceObjectId,
      fileName: (o.fileName as string | null) ?? null,
      pageNumber: o.pageNumber,
    };
  }
  return null;
}

function parseTurn(raw: unknown): AskSessionTurn | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return null;
  if (typeof o.question !== 'string') return null;
  if (typeof o.answer !== 'string') return null;
  if (o.status !== 'success') return null;
  if (o.question.length > ASK_SESSION_MAX_QUESTION_CHARS) return null;
  if (o.answer.length > ASK_SESSION_MAX_ANSWER_CHARS) return null;
  if (!Array.isArray(o.sources)) return null;
  if (o.sources.length > ASK_SESSION_MAX_SOURCES_PER_TURN) return null;
  const sources: AskCourseSourceRef[] = [];
  for (const s of o.sources) {
    const parsed = parseSource(s);
    if (!parsed) return null;
    sources.push(parsed);
  }
  return {
    id: o.id.trim(),
    question: o.question,
    answer: o.answer,
    sources,
    status: 'success',
  };
}

/** Validate unknown JSON into a persisted session, or null (fail closed). */
export function parsePersistedAskSession(
  raw: unknown,
  expectedSectionId: string,
): PersistedAskSessionV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== ASK_SESSION_STORAGE_VERSION) return null;
  if (typeof o.sectionId !== 'string' || o.sectionId !== expectedSectionId) return null;
  if (!isNonEmptyId(o.sectionId)) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
  if (typeof o.draft !== 'string') return null;
  if (o.draft.length > ASK_SESSION_MAX_DRAFT_CHARS) return null;
  if (!Array.isArray(o.turns)) return null;
  if (o.turns.length > ASK_SESSION_MAX_TURNS) return null;
  const turns: AskSessionTurn[] = [];
  for (const t of o.turns) {
    const parsed = parseTurn(t);
    if (!parsed) return null;
    turns.push(parsed);
  }
  return {
    version: ASK_SESSION_STORAGE_VERSION,
    sectionId: o.sectionId,
    turns,
    draft: o.draft,
    updatedAt: o.updatedAt,
  };
}

function clampForWrite(input: {
  sectionId: string;
  turns: readonly AskSessionTurn[];
  draft: string;
}): PersistedAskSessionV1 | null {
  if (!isNonEmptyId(input.sectionId)) return null;
  const turns = input.turns
    .filter(t => t.status === 'success')
    .slice(-ASK_SESSION_MAX_TURNS)
    .map(t => ({
      id: t.id,
      question: t.question.slice(0, ASK_SESSION_MAX_QUESTION_CHARS),
      answer: t.answer.slice(0, ASK_SESSION_MAX_ANSWER_CHARS),
      sources: t.sources.slice(0, ASK_SESSION_MAX_SOURCES_PER_TURN),
      status: 'success' as const,
    }));
  const draft = input.draft.slice(0, ASK_SESSION_MAX_DRAFT_CHARS);
  return {
    version: ASK_SESSION_STORAGE_VERSION,
    sectionId: input.sectionId,
    turns,
    draft,
    updatedAt: Date.now(),
  };
}

export function readAskSession(
  userId: string | null | undefined,
  sectionId: string,
): PersistedAskSessionV1 | null {
  if (typeof localStorage === 'undefined') return null;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return null;
  try {
    const raw = localStorage.getItem(askSessionStorageKey(userId, sectionId));
    if (!raw) return null;
    if (raw.length > ASK_SESSION_MAX_SERIALIZED_CHARS) {
      localStorage.removeItem(askSessionStorageKey(userId, sectionId));
      return null;
    }
    const parsed = parsePersistedAskSession(JSON.parse(raw), sectionId);
    if (!parsed) {
      localStorage.removeItem(askSessionStorageKey(userId, sectionId));
      return null;
    }
    return parsed;
  } catch {
    try {
      if (isNonEmptyId(userId) && isNonEmptyId(sectionId)) {
        localStorage.removeItem(askSessionStorageKey(userId, sectionId));
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function writeAskSession(
  userId: string | null | undefined,
  sectionId: string,
  input: { turns: readonly AskSessionTurn[]; draft: string },
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return false;
  const payload = clampForWrite({ sectionId, turns: input.turns, draft: input.draft });
  if (!payload) return false;
  try {
    const json = JSON.stringify(payload);
    if (json.length > ASK_SESSION_MAX_SERIALIZED_CHARS) return false;
    localStorage.setItem(askSessionStorageKey(userId, sectionId), json);
    return true;
  } catch {
    return false;
  }
}

export function clearAskSession(
  userId: string | null | undefined,
  sectionId: string,
): void {
  if (typeof localStorage === 'undefined') return;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId)) return;
  try {
    localStorage.removeItem(askSessionStorageKey(userId, sectionId));
  } catch {
    /* ignore */
  }
}
