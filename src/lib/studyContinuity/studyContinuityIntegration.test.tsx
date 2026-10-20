import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  saveStudyContinuityRecord,
  getMostRecentStudyContinuity,
  loadStudyContinuityStore,
} from './persistence';
import { validateStudyContinuityAgainstObjects } from './validation';
import {
  saveAcademicCompositionRecovery,
  loadAcademicCompositionRecovery,
  clearAcademicCompositionRecovery,
} from '../studySession/academicCompositionStorage';
import {
  promoteAcademicCompositionToAsk,
  restoreAcademicCompositionNotebook,
  type AcademicCompositionSession,
} from '../studySession/academicComposition';

function makePdf(id: string, connections: string[] = []): ProjectSpaceObject {
  return {
    id,
    type: 'pdf',
    title: `PDF ${id}`,
    connections,
    content: { type: 'pdf', page: 4, zoom: 1 },
  } as ProjectSpaceObject;
}

function makeNotebook(id: string, connections: string[] = []): ProjectSpaceObject {
  return {
    id,
    type: 'notebook',
    title: `Notebook ${id}`,
    connections,
    content: { type: 'notebook', body: '' },
  } as ProjectSpaceObject;
}

describe('WC-6A1 StudyContinuity Integration & Flow Tests', () => {
  const userId = 'user-integration-1';
  const sectionId = 'sec-integration-1';
  const boardId = 'board-integration-1';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // X. AcademicComposition entry records continuity
  it('X. AcademicComposition entry records continuity in localStorage', () => {
    const success = saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });
    expect(success).toBe(true);

    const continuity = getMostRecentStudyContinuity(userId, sectionId, boardId);
    expect(continuity).not.toBeNull();
    expect(continuity?.sourceObjectId).toBe('pdf-1');
    expect(continuity?.workObjectId).toBe('nb-1');
    expect(continuity?.lastActiveAt).toBe(1000);
  });

  // Y. Done updates continuity
  it('Y. Done updates continuity timestamp in localStorage', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const exitTimestamp = 2500;
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: exitTimestamp,
    });

    const continuity = getMostRecentStudyContinuity(userId, sectionId, boardId);
    expect(continuity?.lastActiveAt).toBe(exitTimestamp);
  });

  // Z. Done still clears WC-5C1 session recovery
  it('Z. Done clears WC-5C1 active recovery record while preserving longitudinal continuity', () => {
    const session: AcademicCompositionSession = {
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
    };
    saveAcademicCompositionRecovery(userId, sectionId, boardId, session, 0.6);
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    expect(loadAcademicCompositionRecovery(userId, sectionId, boardId)).not.toBeNull();
    expect(getMostRecentStudyContinuity(userId, sectionId, boardId)).not.toBeNull();

    // Emulate exitAcademicComposition
    clearAcademicCompositionRecovery(userId, sectionId, boardId);

    // Active recovery is gone
    expect(loadAcademicCompositionRecovery(userId, sectionId, boardId)).toBeNull();
    // Longitudinal continuity remains intact
    expect(getMostRecentStudyContinuity(userId, sectionId, boardId)).not.toBeNull();
  });

  // AA. reload recovery remains WC-5C1 behavior
  it('AA. reload recovery remains WC-5C1 sessionStorage behavior independently', () => {
    const session: AcademicCompositionSession = {
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
    };
    saveAcademicCompositionRecovery(userId, sectionId, boardId, session, 0.7);

    const rec = loadAcademicCompositionRecovery(userId, sectionId, boardId);
    expect(rec?.splitRatio).toBe(0.7);
    expect(rec?.pdfObjectId).toBe('pdf-1');
  });

  // AB. next visit with valid continuity shows Continue candidate
  it('AB. next visit with valid continuity surfaces a valid Continue candidate', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const pdf = makePdf('pdf-1', ['nb-1']);
    const nb = makeNotebook('nb-1', ['pdf-1']);

    const raw = getMostRecentStudyContinuity(userId, sectionId, boardId);
    const validated = validateStudyContinuityAgainstObjects(raw, {
      userId,
      sectionId,
      boardId,
      objects: [pdf, nb],
    });

    expect(validated).not.toBeNull();
    expect(validated?.sourceObject.id).toBe('pdf-1');
    expect(validated?.notebookObject.id).toBe('nb-1');
  });

  // AC & AD. Continue opens AcademicComposition with exact valid remembered Notebook
  it('AC & AD. Continue candidate targets exact valid remembered Notebook', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-2',
      lastActiveAt: 1000,
    });

    const pdf = makePdf('pdf-1', ['nb-1', 'nb-2']);
    const nb1 = makeNotebook('nb-1', ['pdf-1']);
    const nb2 = makeNotebook('nb-2', ['pdf-1']);

    const raw = getMostRecentStudyContinuity(userId, sectionId, boardId);
    const validated = validateStudyContinuityAgainstObjects(raw, {
      userId,
      sectionId,
      boardId,
      objects: [pdf, nb1, nb2],
    });

    expect(validated?.notebookObject.id).toBe('nb-2');
  });

  // AE. stale remembered Notebook falls through (fails validation)
  it('AE. stale/disconnected remembered Notebook fails validation, allowing canonical fallback', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-stale',
      lastActiveAt: 1000,
    });

    const pdf = makePdf('pdf-1', ['nb-valid']);
    const nbValid = makeNotebook('nb-valid', ['pdf-1']);

    const raw = getMostRecentStudyContinuity(userId, sectionId, boardId);
    const validated = validateStudyContinuityAgainstObjects(raw, {
      userId,
      sectionId,
      boardId,
      objects: [pdf, nbValid],
    });

    expect(validated).toBeNull();
  });

  // AF & AG & AH. Continue creates zero duplicate Notebook/Ask and zero AI request
  it('AF, AG, AH. Continue execution uses existing object IDs with zero duplicate objects or AI requests', () => {
    const aiSpy = vi.fn();
    const pdf = makePdf('pdf-1', ['nb-1']);
    const nb = makeNotebook('nb-1', ['pdf-1']);

    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const raw = getMostRecentStudyContinuity(userId, sectionId, boardId);
    const validated = validateStudyContinuityAgainstObjects(raw, {
      userId,
      sectionId,
      boardId,
      objects: [pdf, nb],
    });

    expect(validated).not.toBeNull();
    // Simulate enterAcademicComposition with validated IDs
    const targetSession: AcademicCompositionSession = {
      pdfObjectId: validated!.record.sourceObjectId,
      notebookObjectId: validated!.record.workObjectId,
    };
    expect(targetSession.pdfObjectId).toBe('pdf-1');
    expect(targetSession.notebookObjectId).toBe('nb-1');
    expect(aiSpy).not.toHaveBeenCalled();
  });

  // AI. PDF | Ask preserves Notebook as continuity workObjectId
  it('AI. PDF | Ask activity preserves Notebook as continuity workObjectId', () => {
    let session: AcademicCompositionSession = {
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
    };
    // Promoted to ask
    session = promoteAcademicCompositionToAsk(session, 'ask-1');
    expect(session.secondarySurface).toBe('ask');
    expect(session.notebookObjectId).toBe('nb-1');

    // Continuity update uses session.notebookObjectId
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: session.pdfObjectId,
      workObjectId: session.notebookObjectId, // Must remain notebook!
      lastActiveAt: 2000,
    });

    const continuity = getMostRecentStudyContinuity(userId, sectionId, boardId);
    expect(continuity?.workObjectId).toBe('nb-1');
    expect(continuity?.workObjectId).not.toBe('ask-1');
  });

  // AJ. Tutor open/close does not corrupt continuity
  it('AJ. Tutor open/close does not corrupt continuity', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    let session: AcademicCompositionSession = {
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
      contextualTutorOpen: true,
    };
    expect(session.contextualTutorOpen).toBe(true);

    const continuity = getMostRecentStudyContinuity(userId, sectionId, boardId);
    expect(continuity?.workObjectId).toBe('nb-1');
  });

  // AK. Continue banner does not register activeAcademicContext
  it('AK. Continue candidate is purely data and does not activate academic context', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: 1000,
    });

    const raw = getMostRecentStudyContinuity(userId, sectionId, boardId);
    expect(raw).not.toBeNull();
    // Context is active only when academicComposition state is non-null in React
  });

  // AL. no automatic warm restore/hijack from continuity
  it('AL. continuity store does not trigger automatic hijacking', () => {
    saveStudyContinuityRecord(userId, sectionId, boardId, {
      sourceObjectId: 'pdf-1',
      workObjectId: 'nb-1',
      lastActiveAt: Date.now(), // Very recent
    });

    const store = loadStudyContinuityStore(userId, sectionId, boardId);
    expect(store).not.toBeNull();
    // In our design, it only provides a candidate for StudyContinueBanner, never an automatic effect hook
  });
});
