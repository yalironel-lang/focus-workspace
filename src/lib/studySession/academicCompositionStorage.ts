/**
 * WC-5C1 — Academic Composition Session Restore.
 * Pure storage and validation module for tab-scoped recovery via sessionStorage.
 *
 * Rules:
 * - sessionStorage only (tab-scoped; zero cross-tab collision).
 * - Versioned record (version: 1); unknown versions fail safely.
 * - Scoped strictly by userId, sectionId, boardId.
 * - ZERO document content, handwriting, visual crops, or AI turns in recovery record (topology/IDs only).
 * - Canonical ProjectSpaceObjects remain source of truth; hydration is strictly read-only.
 * - Symmetric connection in canonical graph required; disconnected pairs reject to Canvas.
 * - In PDF | Ask, stale/missing askObjectId safely degrades to PDF | Notebook.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { AcademicCompositionSession } from './academicComposition';
import { isEligibleAcademicNotebook } from './academicComposition';
import { clampRatioForWidth } from './twoSurfaceGeometry';

export const ACADEMIC_COMPOSITION_RECOVERY_VERSION = 1 as const;

export interface AcademicCompositionRecoveryRecordV1 {
  version: typeof ACADEMIC_COMPOSITION_RECOVERY_VERSION;
  userId: string;
  sectionId: string;
  boardId: string;
  pdfObjectId: string;
  notebookObjectId: string;
  secondarySurface: 'notebook' | 'ask';
  askObjectId?: string;
  splitRatio?: number;
  updatedAt: number;
}

export function normalizeRecoveryBoardId(boardId: string): string {
  return !boardId || boardId === 'main' ? 'main' : boardId.trim();
}

/**
 * Derives the scoped sessionStorage key.
 * Format: focus.academic_composition_recovery_v1:{userId}:{sectionId}:{boardId}
 */
export function academicCompositionRecoveryKey(
  userId: string,
  sectionId: string,
  boardId: string,
): string {
  const normUser = userId ? userId.trim() : '';
  const normSection = sectionId ? sectionId.trim() : '';
  const normBoard = normalizeRecoveryBoardId(boardId);
  return `focus.academic_composition_recovery_v1:${encodeURIComponent(normUser)}:${encodeURIComponent(normSection)}:${encodeURIComponent(normBoard)}`;
}

/**
 * Validates the raw JSON parsed object shape.
 * Returns null if missing required fields, wrong primitives, or invalid version/secondarySurface.
 */
export function parseRecoveryRecord(
  raw: unknown,
): AcademicCompositionRecoveryRecordV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.version !== ACADEMIC_COMPOSITION_RECOVERY_VERSION) return null;
  if (typeof o.userId !== 'string' || !o.userId.trim()) return null;
  if (typeof o.sectionId !== 'string' || !o.sectionId.trim()) return null;
  if (typeof o.boardId !== 'string' || !o.boardId.trim()) return null;
  if (typeof o.pdfObjectId !== 'string' || !o.pdfObjectId.trim()) return null;
  if (typeof o.notebookObjectId !== 'string' || !o.notebookObjectId.trim()) return null;

  if (o.secondarySurface !== 'notebook' && o.secondarySurface !== 'ask') {
    return null;
  }

  let askObjectId: string | undefined;
  if (o.askObjectId !== undefined) {
    if (typeof o.askObjectId !== 'string' || !o.askObjectId.trim()) {
      return null;
    }
    askObjectId = o.askObjectId.trim();
  }

  let splitRatio: number | undefined;
  if (o.splitRatio !== undefined) {
    if (typeof o.splitRatio !== 'number' || !Number.isFinite(o.splitRatio)) {
      // Invalid/NaN split ratio is dropped
      splitRatio = undefined;
    } else {
      splitRatio = o.splitRatio;
    }
  }

  const updatedAt =
    typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt)
      ? o.updatedAt
      : Date.now();

  return {
    version: ACADEMIC_COMPOSITION_RECOVERY_VERSION,
    userId: o.userId.trim(),
    sectionId: o.sectionId.trim(),
    boardId: o.boardId.trim(),
    pdfObjectId: o.pdfObjectId.trim(),
    notebookObjectId: o.notebookObjectId.trim(),
    secondarySurface: o.secondarySurface,
    ...(askObjectId ? { askObjectId } : {}),
    ...(splitRatio !== undefined ? { splitRatio } : {}),
    updatedAt,
  };
}

/**
 * Reads and parses the recovery record from sessionStorage for a given user, section, and board.
 */
export function loadAcademicCompositionRecovery(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
): AcademicCompositionRecoveryRecordV1 | null {
  if (typeof sessionStorage === 'undefined') return null;
  if (!userId || !sectionId) return null;

  try {
    const k = academicCompositionRecoveryKey(userId, sectionId, boardId ?? 'main');
    const raw = sessionStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const validated = parseRecoveryRecord(parsed);
    if (!validated) {
      // Discard malformed record
      try {
        sessionStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      return null;
    }
    return validated;
  } catch {
    return null;
  }
}

/**
 * Writes the recovery record to sessionStorage.
 * Safe no-op if sessionStorage is disabled or throws quota errors.
 */
export function saveAcademicCompositionRecovery(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
  session: AcademicCompositionSession,
  splitRatio?: number,
): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (!userId || !sectionId) return false;
  if (!session.pdfObjectId || !session.notebookObjectId) return false;

  try {
    const k = academicCompositionRecoveryKey(userId, sectionId, boardId ?? 'main');
    const record: AcademicCompositionRecoveryRecordV1 = {
      version: ACADEMIC_COMPOSITION_RECOVERY_VERSION,
      userId: userId.trim(),
      sectionId: sectionId.trim(),
      boardId: normalizeRecoveryBoardId(boardId ?? 'main'),
      pdfObjectId: session.pdfObjectId,
      notebookObjectId: session.notebookObjectId,
      secondarySurface: session.secondarySurface === 'ask' ? 'ask' : 'notebook',
      ...(session.secondarySurface === 'ask' && session.askObjectId
        ? { askObjectId: session.askObjectId }
        : {}),
      ...(splitRatio !== undefined && Number.isFinite(splitRatio)
        ? { splitRatio }
        : {}),
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(k, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears the recovery record from sessionStorage for the given scope.
 */
export function clearAcademicCompositionRecovery(
  userId: string | null | undefined,
  sectionId: string | null | undefined,
  boardId: string | null | undefined,
): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!userId || !sectionId) return;

  try {
    const k = academicCompositionRecoveryKey(userId, sectionId, boardId ?? 'main');
    sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export interface ValidatedAcademicRecovery {
  session: AcademicCompositionSession;
  splitRatio?: number;
}

/**
 * Validates a recovery record against the canonical ProjectSpaceObjects on the board.
 *
 * Rules:
 * 1. Scope check: userId, sectionId, boardId must match.
 * 2. PDF check: Must exist, type === 'pdf', not closed, not deleted.
 * 3. Notebook check: Must exist, pass isEligibleAcademicNotebook, not closed, not deleted.
 * 4. Graph check: Symmetric connection must exist in canonical connections graph (never auto-adds edges).
 * 5. Ask check (if secondarySurface === 'ask'):
 *    - If askObjectId is valid and object exists (type === 'ask-zikuk', not closed/deleted), restore PDF | Ask.
 *    - If askObjectId is missing or invalid, degrade safely to PDF | Notebook.
 * 6. Split ratio: Clamped using canonical twoSurfaceGeometry clamping; ignored if non-finite.
 */
export function validateAcademicRecoveryAgainstObjects(
  record: AcademicCompositionRecoveryRecordV1,
  scope: {
    userId: string;
    sectionId: string;
    boardId: string;
    objects: readonly ProjectSpaceObject[];
  },
): ValidatedAcademicRecovery | null {
  // 1. Scope check
  if (record.userId !== scope.userId.trim()) return null;
  if (record.sectionId !== scope.sectionId.trim()) return null;
  if (
    normalizeRecoveryBoardId(record.boardId) !==
    normalizeRecoveryBoardId(scope.boardId)
  ) {
    return null;
  }

  // 2. PDF check
  const pdfObj = scope.objects.find(o => o.id === record.pdfObjectId);
  if (
    !pdfObj ||
    pdfObj.type !== 'pdf' ||
    pdfObj.lifecycleState === 'closed' ||
    (pdfObj as any).deleted === true
  ) {
    return null;
  }

  // 3. Notebook check
  const notebookObj = scope.objects.find(o => o.id === record.notebookObjectId);
  if (
    !notebookObj ||
    !isEligibleAcademicNotebook(notebookObj) ||
    notebookObj.lifecycleState === 'closed' ||
    (notebookObj as any).deleted === true
  ) {
    return null;
  }

  // 4. Graph connection check (symmetric check)
  const pdfConnections = Array.isArray(pdfObj.connections) ? pdfObj.connections : [];
  const nbConnections = Array.isArray(notebookObj.connections) ? notebookObj.connections : [];
  const isConnected =
    pdfConnections.includes(notebookObj.id) || nbConnections.includes(pdfObj.id);

  if (!isConnected) {
    return null;
  }

  // 5. Secondary surface check
  let secondarySurface: 'notebook' | 'ask' = 'notebook';
  let askObjectId: string | undefined;

  if (record.secondarySurface === 'ask' && record.askObjectId) {
    const askObj = scope.objects.find(o => o.id === record.askObjectId);
    if (
      askObj &&
      (askObj.type as string) === 'ask-zikuk' &&
      askObj.lifecycleState !== 'closed' &&
      (askObj as any).deleted !== true
    ) {
      secondarySurface = 'ask';
      askObjectId = askObj.id;
    } else {
      // Degrade safely to Notebook without failing the entire recovery
      secondarySurface = 'notebook';
    }
  }

  // 6. Split ratio normalization
  let normalizedSplitRatio: number | undefined;
  if (record.splitRatio !== undefined && Number.isFinite(record.splitRatio)) {
    // Normalizing against standard container baseline
    normalizedSplitRatio = clampRatioForWidth(record.splitRatio, 1280);
  }

  return {
    session: {
      pdfObjectId: pdfObj.id,
      notebookObjectId: notebookObj.id,
      secondarySurface,
      ...(askObjectId ? { askObjectId } : {}),
      contextualTutorOpen: false, // Never auto-open Tutor on restore
    },
    ...(normalizedSplitRatio !== undefined ? { splitRatio: normalizedSplitRatio } : {}),
  };
}
