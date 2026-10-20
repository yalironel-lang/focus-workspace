/**
 * Phase C1.1 — Client-side Scoped Persistence for Contextual Tutor Sessions.
 *
 * Rules:
 * - Scoped strictly by userId, sectionId, and exact PDF sourceObjectId.
 * - Key format: focus.tutor_conversation_v1:{userId}:{sectionId}:{sourceObjectId}
 * - Zero cross-user, cross-course, or cross-document conversation bleed.
 * - Zero sensitive auth tokens or raw binary document contents stored.
 * - Maximum bounds enforced on turns, chars, and JSON payload size.
 * - Unauthenticated user (null/empty) is a safe read -> null, write -> false.
 */

import type { AskCourseSourceRef, ContextAvailable, KnowledgeTier } from '../gatewayClient';
import type { TutorTurn } from './useStandaloneTutor';
import {
  legacyActionToTeachingMode,
  teachingModeToLegacyAction,
  type TutorCaptureIntent,
  type TutorCaptureAction,
  type TeachingMode,
} from './tutorCaptureTypes';

export const TUTOR_SESSION_STORAGE_VERSION = 2 as const;
export const TUTOR_SESSION_MAX_TURNS = 20 as const;
export const TUTOR_SESSION_MAX_QUESTION_CHARS = 2000 as const;
export const TUTOR_SESSION_MAX_ANSWER_CHARS = 8000 as const;
export const TUTOR_SESSION_MAX_SOURCES_PER_TURN = 8 as const;
export const TUTOR_SESSION_MAX_EXTRACTED_TEXT_CHARS = 4000 as const;
export const TUTOR_SESSION_MAX_SERIALIZED_CHARS = 150_000 as const;

/**
 * Per-document reading geometry kept on the conversation record.
 * Placement (`top-dock`, docks, minimized) lives in tutorLayoutStorage and
 * must not be added here.
 */
export interface TutorPresentationState {
  width?: number;
  height?: number;
  positionX?: number;
  positionY?: number;
  lastReadTurnId?: string;
  scrollTop?: number;
}

export interface TutorArchivedThread {
  id: string;
  mode: TeachingMode;
  turns: TutorTurn[];
  createdAt: number;
}

export interface PersistedTutorSession {
  version: 1 | 2;
  userId: string;
  sectionId: string;
  sourceObjectId: string;
  /** Null when Tutor is open for this PDF without a text selection. */
  intent: TutorCaptureIntent | null;
  mode: TeachingMode;
  turns: TutorTurn[];
  draftQuestion?: string;
  /** False when the student detached the selected PDF from new questions. */
  attachmentAttached?: boolean;
  archivedThreads?: TutorArchivedThread[];
  presentation?: TutorPresentationState;
  updatedAt: number;
}

export type PersistedTutorSessionV1 = PersistedTutorSession;
export type PersistedTutorSessionV2 = PersistedTutorSession;

export function tutorSessionStorageKey(
  userId: string,
  sectionId: string,
  sourceObjectId: string,
): string {
  const normUser = userId ? userId.trim() : '';
  const normSection = sectionId ? sectionId.trim() : '';
  const normSource = sourceObjectId ? sourceObjectId.trim() : '';
  return `focus.tutor_conversation_v1:${encodeURIComponent(normUser)}:${encodeURIComponent(normSection)}:${encodeURIComponent(normSource)}`;
}

function isNonEmptyId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseKnowledgeTier(value: unknown): KnowledgeTier | undefined {
  return value === 'course_material' ||
    value === 'pdf_selection' ||
    value === 'general_academic' ||
    value === 'mixed'
    ? value
    : undefined;
}

function parseContextAvailable(value: unknown): ContextAvailable | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.hasIndexedChunks !== 'boolean' || typeof o.hasPdfCapture !== 'boolean') return undefined;
  return { hasIndexedChunks: o.hasIndexedChunks, hasPdfCapture: o.hasPdfCapture };
}

function isValidAction(v: unknown): v is TutorCaptureAction {
  return v === 'hint' || v === 'explain' || v === 'solve';
}

function parseSource(raw: unknown): AskCourseSourceRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.index !== 'number' || !Number.isFinite(o.index)) return null;

  if (o.sourceKind === 'free_space_pdf' || o.sourceObjectId !== undefined) {
    if (typeof o.sourceObjectId !== 'string' || !o.sourceObjectId) return null;
    if (typeof o.pageNumber !== 'number' || !Number.isFinite(o.pageNumber)) return null;
    return {
      index: o.index,
      sourceKind: 'free_space_pdf',
      sourceObjectId: o.sourceObjectId,
      fileName: typeof o.fileName === 'string' ? o.fileName : null,
      pageNumber: o.pageNumber,
    };
  }

  if (o.sourceKind === 'notebook_page') {
    if (!isNonEmptyId(o.notebookObjectId) || !isNonEmptyId(o.pageId)) return null;
    return {
      index: o.index,
      sourceKind: 'notebook_page',
      notebookObjectId: o.notebookObjectId,
      pageId: o.pageId,
      notebookTitle: typeof o.notebookTitle === 'string' ? o.notebookTitle : null,
      pageTitle: typeof o.pageTitle === 'string' ? o.pageTitle : null,
    };
  }

  return null;
}

function parseTurn(raw: unknown): TutorTurn | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return null;
  if (o.role !== 'user' && o.role !== 'assistant') return null;
  if (typeof o.content !== 'string') return null;
  if (typeof o.timestamp !== 'number' || !Number.isFinite(o.timestamp)) return null;

  let sources: AskCourseSourceRef[] | undefined;
  if (Array.isArray(o.sources)) {
    sources = [];
    for (const s of o.sources.slice(0, TUTOR_SESSION_MAX_SOURCES_PER_TURN)) {
      const parsed = parseSource(s);
      if (parsed) sources.push(parsed);
    }
  }

  const mode = typeof o.mode === 'string' && (o.mode === 'explain' || o.mode === 'teach_me' || o.mode === 'just_answer' || o.mode === 'exam_prep')
    ? (o.mode as TeachingMode)
    : undefined;
  const knowledgeTier = parseKnowledgeTier(o.knowledgeTier);
  const contextAvailable = parseContextAvailable(o.contextAvailable);
  const generationIncomplete = o.generationIncomplete === true ? true : undefined;
  const documentWindow = parseStoredDocumentWindow(o.documentWindow);

  return {
    id: o.id.trim(),
    role: o.role,
    content: o.role === 'user'
      ? o.content.slice(0, TUTOR_SESSION_MAX_QUESTION_CHARS)
      : o.content.slice(0, TUTOR_SESSION_MAX_ANSWER_CHARS),
    sources,
    timestamp: o.timestamp,
    mode,
    ...(knowledgeTier ? { knowledgeTier } : {}),
    ...(contextAvailable ? { contextAvailable } : {}),
    ...(generationIncomplete ? { generationIncomplete: true } : {}),
    ...(documentWindow ? { documentWindow } : {}),
  };
}

function parseStoredDocumentWindow(raw: unknown): TutorTurn['documentWindow'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.sourceObjectId !== 'string' || !value.sourceObjectId.trim()) return undefined;
  const pages = [value.fromPage, value.toPage, value.resumeFromPage];
  if (pages.some((page) => typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 10000)) {
    return undefined;
  }
  return {
    sourceObjectId: value.sourceObjectId.trim(),
    fileName: typeof value.fileName === 'string' ? value.fileName.slice(0, 300) : null,
    pageCount: typeof value.pageCount === 'number' && Number.isInteger(value.pageCount) ? value.pageCount : null,
    fromPage: value.fromPage as number,
    toPage: value.toPage as number,
    resumeFromPage: value.resumeFromPage as number,
    partial: value.partial === true,
  };
}

function parseIntent(raw: unknown): TutorCaptureIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isValidAction(o.action)) return null;
  if (!o.attachment || typeof o.attachment !== 'object') return null;

  const att = o.attachment as Record<string, unknown>;
  if (att.sourceKind !== 'free_space_pdf') return null;
  if (!isNonEmptyId(att.sourceObjectId)) return null;
  if (!isNonEmptyId(att.sectionId)) return null;
  if (typeof att.pageNumber !== 'number' || !Number.isFinite(att.pageNumber)) return null;
  if (att.attachmentType !== 'text_selection') return null;
  if (typeof att.extractedText !== 'string' || !att.extractedText.trim()) return null;

  const regionNorm = att.regionNorm as Record<string, unknown> | undefined;
  if (!regionNorm || typeof regionNorm !== 'object') return null;
  if (
    typeof regionNorm.x !== 'number' ||
    typeof regionNorm.y !== 'number' ||
    typeof regionNorm.w !== 'number' ||
    typeof regionNorm.h !== 'number'
  ) {
    return null;
  }

  const mode = typeof o.mode === 'string' && (o.mode === 'explain' || o.mode === 'teach_me' || o.mode === 'just_answer' || o.mode === 'exam_prep')
    ? (o.mode as TeachingMode)
    : legacyActionToTeachingMode(o.action as string);

  return {
    action: o.action,
    mode,
    attachment: {
      sourceKind: 'free_space_pdf',
      sourceObjectId: att.sourceObjectId.trim(),
      sectionId: att.sectionId.trim(),
      pageNumber: att.pageNumber,
      regionNorm: {
        x: regionNorm.x,
        y: regionNorm.y,
        w: regionNorm.w,
        h: regionNorm.h,
      },
      attachmentType: 'text_selection',
      extractedText: att.extractedText.slice(0, TUTOR_SESSION_MAX_EXTRACTED_TEXT_CHARS),
    },
  };
}

export function parsePersistedTutorSession(
  raw: unknown,
  expectedSectionId: string,
  expectedSourceObjectId: string,
): PersistedTutorSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.version !== 1 && o.version !== 2) return null;
  if (typeof o.sectionId !== 'string' || o.sectionId !== expectedSectionId) return null;
  if (typeof o.sourceObjectId !== 'string' || o.sourceObjectId !== expectedSourceObjectId) return null;
  if (typeof o.userId !== 'string' || !o.userId.trim()) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;

  // Missing or null intent is a session with no PDF selection.
  // A present but invalid intent is rejected so a corrupt capture is not dropped silently.
  let parsedIntent: TutorCaptureIntent | null = null;
  if (o.intent != null) {
    parsedIntent = parseIntent(o.intent);
    if (!parsedIntent) return null;
  }

  if (!Array.isArray(o.turns)) return null;
  const turns: TutorTurn[] = [];
  for (const t of o.turns.slice(-TUTOR_SESSION_MAX_TURNS)) {
    const parsed = parseTurn(t);
    if (parsed) turns.push(parsed);
  }

  const draftQuestion = typeof o.draftQuestion === 'string'
    ? o.draftQuestion.slice(0, TUTOR_SESSION_MAX_QUESTION_CHARS)
    : undefined;

  // Determine effective mode:
  // If explicitly stored as valid mode, use it.
  // Otherwise, safely migrate from intent.action: 'hint' -> 'teach_me', 'solve' -> 'just_answer', 'explain' -> 'explain'.
  const rawMode = typeof o.mode === 'string' ? o.mode : undefined;
  const mode = rawMode && (rawMode === 'explain' || rawMode === 'teach_me' || rawMode === 'just_answer' || rawMode === 'exam_prep')
    ? (rawMode as TeachingMode)
    : parsedIntent
      ? legacyActionToTeachingMode(parsedIntent.action)
      : 'explain';

  if (parsedIntent) parsedIntent.mode = mode;

  let presentation: TutorPresentationState | undefined;
  if (o.presentation && typeof o.presentation === 'object' && !Array.isArray(o.presentation)) {
    const p = o.presentation as Record<string, unknown>;
    presentation = {};
    if (typeof p.width === 'number' && Number.isFinite(p.width) && p.width > 0) presentation.width = Math.round(p.width);
    if (typeof p.height === 'number' && Number.isFinite(p.height) && p.height > 0) presentation.height = Math.round(p.height);
    if (typeof p.positionX === 'number' && Number.isFinite(p.positionX)) presentation.positionX = Math.round(p.positionX);
    if (typeof p.positionY === 'number' && Number.isFinite(p.positionY)) presentation.positionY = Math.round(p.positionY);
    if (typeof p.lastReadTurnId === 'string' && p.lastReadTurnId.trim()) presentation.lastReadTurnId = p.lastReadTurnId.trim();
    if (typeof p.scrollTop === 'number' && Number.isFinite(p.scrollTop) && p.scrollTop >= 0) presentation.scrollTop = Math.round(p.scrollTop);
  }

  let archivedThreads: TutorArchivedThread[] | undefined;
  if (Array.isArray(o.archivedThreads)) {
    archivedThreads = [];
    for (const at of o.archivedThreads.slice(-10)) {
      if (at && typeof at === 'object' && !Array.isArray(at)) {
        const ato = at as Record<string, unknown>;
        if (typeof ato.id === 'string' && Array.isArray(ato.turns)) {
          const threadTurns: TutorTurn[] = [];
          for (const t of ato.turns.slice(-TUTOR_SESSION_MAX_TURNS)) {
            const pt = parseTurn(t);
            if (pt) threadTurns.push(pt);
          }
          const tMode = typeof ato.mode === 'string' && (ato.mode === 'explain' || ato.mode === 'teach_me' || ato.mode === 'just_answer' || ato.mode === 'exam_prep')
            ? (ato.mode as TeachingMode)
            : 'explain';
          archivedThreads.push({
            id: ato.id.trim(),
            mode: tMode,
            turns: threadTurns,
            createdAt: typeof ato.createdAt === 'number' ? ato.createdAt : Date.now(),
          });
        }
      }
    }
  }

  return {
    version: TUTOR_SESSION_STORAGE_VERSION,
    userId: o.userId.trim(),
    sectionId: o.sectionId,
    sourceObjectId: o.sourceObjectId,
    intent: parsedIntent,
    mode,
    turns,
    draftQuestion,
    archivedThreads,
    presentation,
    attachmentAttached: parsedIntent
      ? o.attachmentAttached === false
        ? false
        : true
      : false,
    updatedAt: o.updatedAt,
  };
}

export function readTutorSession(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  sourceObjectId: string | null | undefined,
): PersistedTutorSession | null {
  if (typeof localStorage === 'undefined') return null;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId) || !isNonEmptyId(sourceObjectId)) return null;

  try {
    const key = tutorSessionStorageKey(userId, sectionId, sourceObjectId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    if (raw.length > TUTOR_SESSION_MAX_SERIALIZED_CHARS) {
      localStorage.removeItem(key);
      return null;
    }

    const parsed = JSON.parse(raw);
    const validated = parsePersistedTutorSession(parsed, sectionId, sourceObjectId);
    if (!validated) {
      localStorage.removeItem(key);
      return null;
    }
    return validated;
  } catch {
    try {
      if (isNonEmptyId(userId) && isNonEmptyId(sectionId) && isNonEmptyId(sourceObjectId)) {
        localStorage.removeItem(tutorSessionStorageKey(userId, sectionId, sourceObjectId));
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function writeTutorSession(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  sourceObjectId: string | null | undefined,
  data: {
    intent: TutorCaptureIntent | null;
    turns: readonly TutorTurn[];
    draftQuestion?: string;
    mode?: TeachingMode;
    presentation?: TutorPresentationState;
    archivedThreads?: TutorArchivedThread[];
    attachmentAttached?: boolean;
  },
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId) || !isNonEmptyId(sourceObjectId)) return false;

  try {
    const key = tutorSessionStorageKey(userId, sectionId, sourceObjectId);
    const existing = readTutorSession(userId, sectionId, sourceObjectId);

    const boundedTurns: TutorTurn[] = data.turns
      .slice(-TUTOR_SESSION_MAX_TURNS)
      .map(t => ({
        id: t.id,
        role: t.role,
        content: t.role === 'user'
          ? t.content.slice(0, TUTOR_SESSION_MAX_QUESTION_CHARS)
          : t.content.slice(0, TUTOR_SESSION_MAX_ANSWER_CHARS),
        sources: t.sources?.slice(0, TUTOR_SESSION_MAX_SOURCES_PER_TURN),
        timestamp: t.timestamp,
        mode: t.mode,
        ...(t.knowledgeTier ? { knowledgeTier: t.knowledgeTier } : {}),
        ...(t.contextAvailable ? { contextAvailable: t.contextAvailable } : {}),
        ...(t.generationIncomplete ? { generationIncomplete: true } : {}),
        ...(t.documentWindow ? { documentWindow: t.documentWindow } : {}),
      }));

    const effectiveMode: TeachingMode =
      data.mode ||
      data.intent?.mode ||
      (data.intent ? legacyActionToTeachingMode(data.intent.action) : undefined) ||
      existing?.mode ||
      'explain';

    const intentPayload: TutorCaptureIntent | null = data.intent
      ? {
          action: teachingModeToLegacyAction(effectiveMode),
          mode: effectiveMode,
          attachment: {
            ...data.intent.attachment,
            extractedText: data.intent.attachment.extractedText.slice(0, TUTOR_SESSION_MAX_EXTRACTED_TEXT_CHARS),
          },
        }
      : null;

    const effectivePresentation = data.presentation ?? existing?.presentation;
    const effectiveArchived = data.archivedThreads ?? existing?.archivedThreads;
    const attachmentAttached = intentPayload
      ? typeof data.attachmentAttached === 'boolean'
        ? data.attachmentAttached
        : existing?.attachmentAttached !== false
      : false;

    const boundedPayload: PersistedTutorSession = {
      version: TUTOR_SESSION_STORAGE_VERSION,
      userId: userId.trim(),
      sectionId: sectionId.trim(),
      sourceObjectId: sourceObjectId.trim(),
      intent: intentPayload,
      mode: effectiveMode,
      turns: boundedTurns,
      draftQuestion: data.draftQuestion ? data.draftQuestion.slice(0, TUTOR_SESSION_MAX_QUESTION_CHARS) : undefined,
      archivedThreads: effectiveArchived,
      presentation: effectivePresentation,
      attachmentAttached,
      updatedAt: Date.now(),
    };

    const json = JSON.stringify(boundedPayload);
    if (json.length > TUTOR_SESSION_MAX_SERIALIZED_CHARS) return false;

    localStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

export function writeTutorPresentation(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  sourceObjectId: string | null | undefined,
  presentation: Partial<TutorPresentationState>,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId) || !isNonEmptyId(sourceObjectId)) return false;

  try {
    const existing = readTutorSession(userId, sectionId, sourceObjectId);
    if (!existing) return false;

    const updatedPresentation: TutorPresentationState = {
      ...(existing.presentation ?? {}),
      ...presentation,
    };

    return writeTutorSession(userId, sectionId, sourceObjectId, {
      intent: existing.intent,
      turns: existing.turns,
      draftQuestion: existing.draftQuestion,
      mode: existing.mode,
      presentation: updatedPresentation,
      archivedThreads: existing.archivedThreads,
    });
  } catch {
    return false;
  }
}

export function archiveTutorThread(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  sourceObjectId: string | null | undefined,
  turnsToArchive: readonly TutorTurn[],
  mode: TeachingMode,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId) || !isNonEmptyId(sourceObjectId)) return false;
  if (turnsToArchive.length === 0) return true;

  try {
    const existing = readTutorSession(userId, sectionId, sourceObjectId);
    if (!existing) return false;

    const newArchived: TutorArchivedThread = {
      id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode,
      turns: [...turnsToArchive],
      createdAt: Date.now(),
    };

    const updatedArchivedThreads = [...(existing.archivedThreads ?? []), newArchived].slice(-10);

    return writeTutorSession(userId, sectionId, sourceObjectId, {
      intent: existing.intent,
      turns: [], // fresh active thread turns
      draftQuestion: '',
      mode,
      presentation: existing.presentation,
      archivedThreads: updatedArchivedThreads,
    });
  } catch {
    return false;
  }
}

export function clearTutorSession(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  sourceObjectId: string | null | undefined,
): void {
  if (typeof localStorage === 'undefined') return;
  if (!isNonEmptyId(userId) || !isNonEmptyId(sectionId) || !isNonEmptyId(sourceObjectId)) return;

  try {
    localStorage.removeItem(tutorSessionStorageKey(userId, sectionId, sourceObjectId));
  } catch {
    /* ignore */
  }
}
