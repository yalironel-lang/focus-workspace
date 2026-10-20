/**
 * WC-2 — Academic Workspace Composition (PDF | Notebook).
 * Canonical object IDs only; zero parallel content store; clean exit flush helpers.
 */

import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';

export interface AcademicCompositionSession {
  pdfObjectId: string;
  notebookObjectId: string;
  contextualTutorOpen?: boolean;
  secondarySurface?: 'notebook' | 'ask';
  askObjectId?: string;
}

/**
 * Validates whether the given objects form a valid Academic Composition pair.
 * Surface A must be a valid canonical PDF object.
 * Surface B must be a valid canonical Notebook object.
 */
export function isValidAcademicCompositionPair(
  pdfObj: ProjectSpaceObject | null | undefined,
  notebookObj: ProjectSpaceObject | null | undefined,
): boolean {
  if (!pdfObj || pdfObj.type !== 'pdf' || (pdfObj as any).deleted === true) return false;
  if (
    !notebookObj ||
    (notebookObj.type !== 'notebook' &&
      notebookObj.type !== 'note' &&
      notebookObj.type !== 'mistake' &&
      (notebookObj.type as string) !== 'notes') ||
    (notebookObj as any).deleted === true
  ) {
    return false;
  }
  return true;
}

export type AcademicNotebookResolution =
  | { kind: 'ready'; notebookObjectId: string }
  | { kind: 'pick'; candidates: ProjectSpaceObject[] }
  | { kind: 'create' };

export function isEligibleAcademicNotebook(o: ProjectSpaceObject): boolean {
  return (
    (o.type === 'notebook' || o.type === 'note' || o.type === 'mistake' || (o.type as string) === 'notes') &&
    o.lifecycleState !== 'closed' &&
    (o as any).deleted !== true
  );
}

/**
 * Resolves a candidate canonical notebook to pair with a PDF object for academic composition.
 *
 * Rules:
 * A. Zero eligible notebooks -> { kind: 'create' }
 * B. Exactly one eligible notebook (unconnected) -> { kind: 'ready', notebookObjectId }
 * C. Exactly one valid connected notebook -> { kind: 'ready', notebookObjectId } (even if other unconnected exist)
 * D. Multiple valid connected notebooks -> { kind: 'pick', candidates } (connected first)
 * E. Multiple notebooks, none connected -> { kind: 'pick', candidates }
 * F. Stale/deleted/closed objects are filtered out.
 */
export function resolveAcademicNotebookPair(
  pdfObj: ProjectSpaceObject,
  objects: readonly ProjectSpaceObject[],
): AcademicNotebookResolution {
  if (pdfObj.type !== 'pdf') return { kind: 'create' };

  const eligibleNotebooks = objects.filter(isEligibleAcademicNotebook);

  if (eligibleNotebooks.length === 0) {
    return { kind: 'create' };
  }

  // Find all notebooks that have a valid symmetric connection to this PDF
  const pdfConnections = Array.isArray(pdfObj.connections) ? pdfObj.connections : [];
  const connectedNotebooks = eligibleNotebooks.filter(nb => {
    const direct = pdfConnections.includes(nb.id);
    const reverse = Array.isArray(nb.connections) && nb.connections.includes(pdfObj.id);
    return direct || reverse;
  });

  // Exactly one valid connected notebook outranks any unconnected notebooks
  if (connectedNotebooks.length === 1) {
    return { kind: 'ready', notebookObjectId: connectedNotebooks[0]!.id };
  }

  // Multiple connected notebooks -> pick among candidates with connected prioritized first
  if (connectedNotebooks.length > 1) {
    const connectedSet = new Set(connectedNotebooks.map(nb => nb.id));
    const unconnected = eligibleNotebooks.filter(nb => !connectedSet.has(nb.id));
    return { kind: 'pick', candidates: [...connectedNotebooks, ...unconnected] };
  }

  // Zero connected notebooks:
  // If exactly one eligible notebook exists on the board, use it directly
  if (eligibleNotebooks.length === 1) {
    return { kind: 'ready', notebookObjectId: eligibleNotebooks[0]!.id };
  }

  // Multiple eligible notebooks, none connected -> pick among all eligible candidates
  return { kind: 'pick', candidates: eligibleNotebooks };
}

/**
 * Promotes the academic composition secondary surface from Notebook to Ask.
 * Preserves the canonical notebookObjectId for restoration.
 * Hides the Contextual Tutor overlay.
 */
export function promoteAcademicCompositionToAsk(
  session: AcademicCompositionSession,
  askObjectId: string,
): AcademicCompositionSession {
  return {
    ...session,
    secondarySurface: 'ask',
    askObjectId,
    contextualTutorOpen: false,
  };
}

/**
 * Restores the canonical Notebook to the secondary surface of the academic composition.
 * Leaves the Ask session alive and accessible for future promotion or Contextual Tutor.
 */
export function restoreAcademicCompositionNotebook(
  session: AcademicCompositionSession,
): AcademicCompositionSession {
  return {
    ...session,
    secondarySurface: 'notebook',
  };
}

/**
 * Resolves the active secondary surface object ID.
 * Returns askObjectId when secondarySurface is 'ask' (and askObjectId is present),
 * otherwise returns notebookObjectId.
 */
export function resolveAcademicSecondaryObjectId(
  session: AcademicCompositionSession,
): string {
  if (session.secondarySurface === 'ask' && session.askObjectId) {
    return session.askObjectId;
  }
  return session.notebookObjectId;
}

/**
 * Checks whether an object is owned by the Academic Composition shell and should therefore
 * be suppressed from duplicate rendering on the Canvas or in Universal Object View portals.
 */
export function isAcademicObjectSuppressedFromWorkspace(
  objectId: string,
  session: AcademicCompositionSession | null | undefined,
): boolean {
  if (!session) return false;
  if (objectId === session.pdfObjectId) return true;
  if (objectId === session.notebookObjectId) return true;
  if (session.secondarySurface === 'ask' && session.askObjectId && objectId === session.askObjectId) {
    return true;
  }
  return false;
}
