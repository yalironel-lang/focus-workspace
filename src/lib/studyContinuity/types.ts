/**
 * WC-6A1 — Longitudinal Study Continuity Architecture.
 * User-scoped, board-scoped persistent history for Academic Composition.
 *
 * Rules:
 * - Versioned record (version: 1).
 * - Scoped strictly by userId, sectionId, boardId.
 * - ZERO document content, handwriting, visual crops, or AI turns in continuity record (IDs & timestamps only).
 * - Canonical ProjectSpaceObjects.connections remains source of truth; continuity is purely an informational pointer.
 */

export const STUDY_CONTINUITY_VERSION = 1 as const;

export interface StudyContinuityRecord {
  /** Schema version */
  version: typeof STUDY_CONTINUITY_VERSION;
  /** Authenticated user identity for strict multi-user isolation */
  userId: string;
  /** Section / course identity */
  sectionId: string;
  /** Board identity */
  boardId: string;
  /** The canonical PDF ProjectSpaceObject id */
  sourceObjectId: string;
  /** The canonical Notebook ProjectSpaceObject id */
  workObjectId: string;
  /** Epoch ms when last active */
  lastActiveAt: number;
}

export interface StudyContinuityStore {
  version: typeof STUDY_CONTINUITY_VERSION;
  /** Keyed by sourceObjectId (allows per-document resume) */
  records: Record<string, StudyContinuityRecord>;
  /** ID of the most recently active sourceObjectId on this board */
  mostRecentSourceId: string | null;
}
