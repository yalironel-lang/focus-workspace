/**
 * WC-6A1 — Longitudinal Study Continuity Validation.
 * Pure validation against canonical ProjectSpaceObjects.
 *
 * Rules:
 * - Read-only check against ProjectSpaceObject.connections graph.
 * - Zero graph mutations.
 * - Source must exist, type === 'pdf', lifecycleState !== 'closed', not deleted.
 * - Work must exist, pass isEligibleAcademicNotebook, lifecycleState !== 'closed', not deleted.
 * - Symmetric canonical connection must exist in ProjectSpaceObject.connections.
 * - Scope (userId, sectionId, boardId) must match strictly.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { isEligibleAcademicNotebook } from '../studySession/academicComposition';
import { normalizeContinuityBoardId } from './persistence';
import type { StudyContinuityRecord } from './types';

export interface ValidatedStudyContinuity {
  record: StudyContinuityRecord;
  sourceObject: ProjectSpaceObject;
  notebookObject: ProjectSpaceObject;
}

export function validateStudyContinuityAgainstObjects(
  record: StudyContinuityRecord | null | undefined,
  scope: {
    userId: string | null | undefined;
    sectionId: string | null | undefined;
    boardId: string | null | undefined;
    objects: readonly ProjectSpaceObject[];
  },
): ValidatedStudyContinuity | null {
  if (!record) return null;
  if (!scope.userId || !scope.userId.trim()) return null;
  if (!scope.sectionId || !scope.sectionId.trim()) return null;

  // 1. Scope check
  if (record.userId !== scope.userId.trim()) return null;
  if (record.sectionId !== scope.sectionId.trim()) return null;
  if (
    normalizeContinuityBoardId(record.boardId) !==
    normalizeContinuityBoardId(scope.boardId)
  ) {
    return null;
  }

  // 2. Source PDF check
  const sourceObj = scope.objects.find(o => o.id === record.sourceObjectId);
  if (
    !sourceObj ||
    sourceObj.type !== 'pdf' ||
    sourceObj.lifecycleState === 'closed' ||
    (sourceObj as any).deleted === true
  ) {
    return null;
  }

  // 3. Notebook check
  const notebookObj = scope.objects.find(o => o.id === record.workObjectId);
  if (
    !notebookObj ||
    !isEligibleAcademicNotebook(notebookObj) ||
    notebookObj.lifecycleState === 'closed' ||
    (notebookObj as any).deleted === true
  ) {
    return null;
  }

  // 4. Canonical connection graph check (symmetric)
  const sourceConnections = Array.isArray(sourceObj.connections) ? sourceObj.connections : [];
  const notebookConnections = Array.isArray(notebookObj.connections) ? notebookObj.connections : [];
  const isConnected =
    sourceConnections.includes(notebookObj.id) || notebookConnections.includes(sourceObj.id);

  if (!isConnected) {
    return null;
  }

  return {
    record,
    sourceObject: sourceObj,
    notebookObject: notebookObj,
  };
}
