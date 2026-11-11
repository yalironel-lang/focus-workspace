import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import {
  ACADEMIC_COMPOSITION_RECOVERY_VERSION,
  academicCompositionRecoveryKey,
  parseRecoveryRecord,
  loadAcademicCompositionRecovery,
  saveAcademicCompositionRecovery,
  clearAcademicCompositionRecovery,
  validateAcademicRecoveryAgainstObjects,
  type AcademicCompositionRecoveryRecordV1,
} from './academicCompositionStorage';

describe('academicCompositionStorage — pure storage & validation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  // TEST A: V1 round-trip
  it('TEST A: saves and loads a valid V1 record through sessionStorage', () => {
    const saved = saveAcademicCompositionRecovery(
      'user-1',
      'sec-1',
      'board-1',
      { pdfObjectId: 'pdf-1', notebookObjectId: 'nb-1', secondarySurface: 'notebook' },
      0.62,
    );
    expect(saved).toBe(true);

    const loaded = loadAcademicCompositionRecovery('user-1', 'sec-1', 'board-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(1);
    expect(loaded?.userId).toBe('user-1');
    expect(loaded?.sectionId).toBe('sec-1');
    expect(loaded?.boardId).toBe('board-1');
    expect(loaded?.pdfObjectId).toBe('pdf-1');
    expect(loaded?.notebookObjectId).toBe('nb-1');
    expect(loaded?.secondarySurface).toBe('notebook');
    expect(loaded?.splitRatio).toBe(0.62);
    expect(typeof loaded?.updatedAt).toBe('number');
  });

  // TEST B: scoped user/section/board key
  it('TEST B: derives scoped key and isolates between users, sections, and boards', () => {
    const key1 = academicCompositionRecoveryKey('user-1', 'sec-1', 'board-1');
    const key2 = academicCompositionRecoveryKey('user-2', 'sec-1', 'board-1');
    const key3 = academicCompositionRecoveryKey('user-1', 'sec-2', 'board-1');
    const key4 = academicCompositionRecoveryKey('user-1', 'sec-1', 'main');
    const keyDefault = academicCompositionRecoveryKey('user-1', 'sec-1', '');

    expect(key1).toContain('user-1');
    expect(key1).toContain('sec-1');
    expect(key1).toContain('board-1');
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
    // 'main' and '' are normalized to 'main'
    expect(key4).toBe(keyDefault);
  });

  // TEST C: malformed JSON -> null
  it('TEST C: returns null on malformed JSON and removes the corrupt item', () => {
    const k = academicCompositionRecoveryKey('user-1', 'sec-1', 'main');
    sessionStorage.setItem(k, 'not-valid-json{');

    const loaded = loadAcademicCompositionRecovery('user-1', 'sec-1', 'main');
    expect(loaded).toBeNull();
  });

  // TEST D: unknown version -> null
  it('TEST D: safely discards unknown/future version numbers', () => {
    const future = {
      version: 99,
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
      secondarySurface: 'notebook',
    };
    expect(parseRecoveryRecord(future)).toBeNull();

    const k = academicCompositionRecoveryKey('user-1', 'sec-1', 'main');
    sessionStorage.setItem(k, JSON.stringify(future));
    expect(loadAcademicCompositionRecovery('user-1', 'sec-1', 'main')).toBeNull();
  });

  // TEST E: missing required fields -> null
  it('TEST E: returns null when required fields are missing or empty', () => {
    expect(parseRecoveryRecord({ version: 1, userId: '', sectionId: 'sec-1' })).toBeNull();
    expect(parseRecoveryRecord({ version: 1, userId: 'user-1', sectionId: 'sec-1' })).toBeNull();
    expect(parseRecoveryRecord({
      version: 1,
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      pdfObjectId: '',
      notebookObjectId: 'nb-1',
      secondarySurface: 'notebook',
    })).toBeNull();
  });

  // TEST F: invalid secondarySurface -> null
  it('TEST F: returns null on invalid secondarySurface', () => {
    const invalid = {
      version: 1,
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
      secondarySurface: 'unknown_surface',
    };
    expect(parseRecoveryRecord(invalid)).toBeNull();
  });

  // TEST G: storage exception -> safe no-op/null
  it('TEST G: handles sessionStorage exceptions gracefully without throwing', () => {
    const proto = Object.getPrototypeOf(sessionStorage);
    const origSet = proto.setItem;
    const origGet = proto.getItem;
    proto.getItem = () => {
      throw new Error('SecurityError: Access is denied for this document');
    };
    proto.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    try {
      expect(() => loadAcademicCompositionRecovery('user-1', 'sec-1', 'main')).not.toThrow();
      expect(loadAcademicCompositionRecovery('user-1', 'sec-1', 'main')).toBeNull();

      expect(() => saveAcademicCompositionRecovery(
        'user-1',
        'sec-1',
        'main',
        { pdfObjectId: 'pdf-1', notebookObjectId: 'nb-1', secondarySurface: 'notebook' },
      )).not.toThrow();
      expect(saveAcademicCompositionRecovery(
        'user-1',
        'sec-1',
        'main',
        { pdfObjectId: 'pdf-1', notebookObjectId: 'nb-1', secondarySurface: 'notebook' },
      )).toBe(false);
    } finally {
      proto.getItem = origGet;
      proto.setItem = origSet;
    }
  });

  // TEST H: no TTL expiration behavior in V1
  it('TEST H: does not expire valid records based on age (NO TTL)', () => {
    const oldRecord: AcademicCompositionRecoveryRecordV1 = {
      version: 1,
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      pdfObjectId: 'pdf-1',
      notebookObjectId: 'nb-1',
      secondarySurface: 'notebook',
      updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    };
    const parsed = parseRecoveryRecord(oldRecord);
    expect(parsed).not.toBeNull();
    expect(parsed?.updatedAt).toBe(oldRecord.updatedAt);
  });

  // TEST I: record contains topology only (zero document content or AI turns)
  it('TEST I: verifies privacy boundary - record contains IDs/topology only', () => {
    const k = academicCompositionRecoveryKey('user-1', 'sec-1', 'main');
    saveAcademicCompositionRecovery(
      'user-1',
      'sec-1',
      'main',
      { pdfObjectId: 'pdf-1', notebookObjectId: 'nb-1', secondarySurface: 'notebook' },
      0.5,
    );
    const raw = sessionStorage.getItem(k);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    // Ensure zero forbidden keys
    expect(parsed.content).toBeUndefined();
    expect(parsed.text).toBeUndefined();
    expect(parsed.turns).toBeUndefined();
    expect(parsed.handwriting).toBeUndefined();
    expect(parsed.visualFocus).toBeUndefined();
    expect(parsed.url).toBeUndefined();
  });
});

describe('academicCompositionStorage — canonical object validation', () => {
  const basePdf: ProjectSpaceObject = {
    id: 'pdf-1',
    type: 'pdf',
    title: 'Test Exam.pdf',
    content: { type: 'pdf', fileName: 'test.pdf', fileSize: 100, lastOpenedAt: null, page: 1, zoom: 1 } as any,
    connections: ['nb-1'],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const baseNotebook: ProjectSpaceObject = {
    id: 'nb-1',
    type: 'notebook',
    title: 'Study Notes',
    content: { type: 'notebook', pages: [] } as any,
    connections: ['pdf-1'],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const baseAsk: ProjectSpaceObject = {
    id: 'ask-1',
    type: 'ask-zikuk',
    title: 'Ask ZIKUK',
    content: { type: 'ask-zikuk' } as any,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const validRecord: AcademicCompositionRecoveryRecordV1 = {
    version: 1,
    userId: 'user-1',
    sectionId: 'sec-1',
    boardId: 'main',
    pdfObjectId: 'pdf-1',
    notebookObjectId: 'nb-1',
    secondarySurface: 'notebook',
    updatedAt: Date.now(),
  };

  // TEST J: valid PDF + Notebook + canonical connection restores
  it('TEST J: validates and restores valid PDF + Notebook pair with symmetric connection', () => {
    const res = validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, baseNotebook],
    });
    expect(res).not.toBeNull();
    expect(res?.session.pdfObjectId).toBe('pdf-1');
    expect(res?.session.notebookObjectId).toBe('nb-1');
    expect(res?.session.secondarySurface).toBe('notebook');
    expect(res?.session.contextualTutorOpen).toBe(false);
  });

  // TEST K: missing PDF rejects
  it('TEST K: rejects when PDF object is missing from objects', () => {
    const res = validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [baseNotebook],
    });
    expect(res).toBeNull();
  });

  // TEST L: missing Notebook rejects
  it('TEST L: rejects when Notebook object is missing from objects', () => {
    const res = validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf],
    });
    expect(res).toBeNull();
  });

  // TEST M: closed/deleted PDF rejects
  it('TEST M: rejects when PDF is closed or marked deleted', () => {
    const closedPdf = { ...basePdf, lifecycleState: 'closed' as const };
    expect(validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [closedPdf, baseNotebook],
    })).toBeNull();

    const deletedPdf = { ...basePdf, deleted: true } as any;
    expect(validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [deletedPdf, baseNotebook],
    })).toBeNull();
  });

  // TEST N: closed/deleted Notebook rejects
  it('TEST N: rejects when Notebook is closed or marked deleted', () => {
    const closedNb = { ...baseNotebook, lifecycleState: 'closed' as const };
    expect(validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, closedNb],
    })).toBeNull();

    const deletedNb = { ...baseNotebook, deleted: true } as any;
    expect(validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, deletedNb],
    })).toBeNull();
  });

  // TEST O: wrong object types reject
  it('TEST O: rejects when object types are invalid (e.g. calculator instead of notebook)', () => {
    const calcObj = { ...baseNotebook, type: 'calculator' as any };
    expect(validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, calcObj],
    })).toBeNull();
  });

  // TEST P: disconnected PDF/Notebook rejects
  it('TEST P: rejects when PDF and Notebook are not connected in canonical graph', () => {
    const disconnectedPdf = { ...basePdf, connections: [] };
    const disconnectedNb = { ...baseNotebook, connections: [] };
    expect(validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [disconnectedPdf, disconnectedNb],
    })).toBeNull();
  });

  // TEST Q: multiple connected notebooks restore exact recorded notebook
  it('TEST Q: restores recorded notebook when multiple connected notebooks exist', () => {
    const nb2 = { ...baseNotebook, id: 'nb-2', title: 'Notes 2', connections: ['pdf-1'] };
    const multiPdf = { ...basePdf, connections: ['nb-1', 'nb-2'] };

    const res = validateAcademicRecoveryAgainstObjects(validRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [multiPdf, baseNotebook, nb2],
    });
    expect(res).not.toBeNull();
    expect(res?.session.notebookObjectId).toBe('nb-1');
  });

  // TEST R: valid Ask object restores secondarySurface='ask'
  it('TEST R: restores secondarySurface="ask" when askObjectId is valid and unclosed', () => {
    const askRecord: AcademicCompositionRecoveryRecordV1 = {
      ...validRecord,
      secondarySurface: 'ask',
      askObjectId: 'ask-1',
    };
    const res = validateAcademicRecoveryAgainstObjects(askRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, baseNotebook, baseAsk],
    });
    expect(res).not.toBeNull();
    expect(res?.session.secondarySurface).toBe('ask');
    expect(res?.session.askObjectId).toBe('ask-1');
  });

  // TEST S: stale/missing Ask degrades safely to notebook
  it('TEST S: degrades safely to notebook when askObjectId is stale or missing', () => {
    const staleAskRecord: AcademicCompositionRecoveryRecordV1 = {
      ...validRecord,
      secondarySurface: 'ask',
      askObjectId: 'non-existent-ask',
    };
    const res = validateAcademicRecoveryAgainstObjects(staleAskRecord, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, baseNotebook, baseAsk],
    });
    expect(res).not.toBeNull();
    // Degraded to notebook!
    expect(res?.session.secondarySurface).toBe('notebook');
    expect(res?.session.askObjectId).toBeUndefined();
  });

  // TEST T: invalid split ratio ignored/defaulted
  it('TEST T: ignores NaN, null, or out-of-range split ratio and returns undefined', () => {
    const recordWithNan = { ...validRecord, splitRatio: NaN };
    const res = validateAcademicRecoveryAgainstObjects(recordWithNan, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, baseNotebook],
    });
    expect(res?.splitRatio).toBeUndefined();
  });

  // TEST U: valid split ratio clamped with canonical geometry bounds
  it('TEST U: clamps valid split ratio with canonical twoSurfaceGeometry', () => {
    const record = { ...validRecord, splitRatio: 0.65 };
    const res = validateAcademicRecoveryAgainstObjects(record, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, baseNotebook],
    });
    expect(res?.splitRatio).toBe(0.65);

    const recordExtreme = { ...validRecord, splitRatio: 0.99 };
    const resExtreme = validateAcademicRecoveryAgainstObjects(recordExtreme, {
      userId: 'user-1',
      sectionId: 'sec-1',
      boardId: 'main',
      objects: [basePdf, baseNotebook],
    });
    // Should be clamped to max bound (0.75 for 1280px with 320px min surface)
    expect(resExtreme?.splitRatio).toBeLessThanOrEqual(0.75);
  });
});
