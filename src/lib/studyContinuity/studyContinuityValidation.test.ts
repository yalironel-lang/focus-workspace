import { describe, it, expect } from 'vitest';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { StudyContinuityRecord } from './types';
import { validateStudyContinuityAgainstObjects } from './validation';

function makePdf(id: string, connections: string[] = [], overrides: Partial<ProjectSpaceObject> = {}): ProjectSpaceObject {
  return {
    id,
    type: 'pdf',
    title: `PDF ${id}`,
    connections,
    content: { type: 'pdf', page: 1, zoom: 1 },
    ...overrides,
  } as ProjectSpaceObject;
}

function makeNotebook(id: string, connections: string[] = [], overrides: Partial<ProjectSpaceObject> = {}): ProjectSpaceObject {
  return {
    id,
    type: 'notebook',
    title: `Notebook ${id}`,
    connections,
    content: { type: 'notebook', body: '' },
    ...overrides,
  } as ProjectSpaceObject;
}

describe('WC-6A1 StudyContinuity Validation', () => {
  const baseRecord: StudyContinuityRecord = {
    version: 1,
    userId: 'user-1',
    sectionId: 'sec-1',
    boardId: 'board-1',
    sourceObjectId: 'pdf-1',
    workObjectId: 'nb-1',
    lastActiveAt: 1000,
  };

  const baseScope = {
    userId: 'user-1',
    sectionId: 'sec-1',
    boardId: 'board-1',
  };

  // N. valid PDF + Notebook + connection validates
  it('N. valid PDF + Notebook + symmetric connection validates successfully', () => {
    const pdf = makePdf('pdf-1', ['nb-1']);
    const nb = makeNotebook('nb-1', ['pdf-1']);
    const res = validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdf, nb],
    });
    expect(res).not.toBeNull();
    expect(res?.sourceObject.id).toBe('pdf-1');
    expect(res?.notebookObject.id).toBe('nb-1');
  });

  // O. missing PDF rejects
  it('O. missing PDF rejects validation', () => {
    const nb = makeNotebook('nb-1', ['pdf-1']);
    const res = validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [nb],
    });
    expect(res).toBeNull();
  });

  // P. deleted/closed PDF rejects
  it('P. closed or deleted PDF rejects validation', () => {
    const pdfClosed = makePdf('pdf-1', ['nb-1'], { lifecycleState: 'closed' });
    const nb = makeNotebook('nb-1', ['pdf-1']);
    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdfClosed, nb],
    })).toBeNull();

    const pdfDeleted = makePdf('pdf-1', ['nb-1'], { deleted: true } as any);
    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdfDeleted, nb],
    })).toBeNull();
  });

  // Q. missing Notebook rejects
  it('Q. missing Notebook rejects validation', () => {
    const pdf = makePdf('pdf-1', ['nb-1']);
    const res = validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdf],
    });
    expect(res).toBeNull();
  });

  // R. deleted/closed Notebook rejects
  it('R. closed or deleted Notebook rejects validation', () => {
    const pdf = makePdf('pdf-1', ['nb-1']);
    const nbClosed = makeNotebook('nb-1', ['pdf-1'], { lifecycleState: 'closed' });
    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdf, nbClosed],
    })).toBeNull();

    const nbDeleted = makeNotebook('nb-1', ['pdf-1'], { deleted: true } as any);
    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdf, nbDeleted],
    })).toBeNull();
  });

  // S. wrong Notebook type rejects
  it('S. wrong object type for notebook rejects validation', () => {
    const pdf = makePdf('pdf-1', ['card-1']);
    const card = { id: 'card-1', type: 'image', connections: ['pdf-1'] } as any;
    const res = validateStudyContinuityAgainstObjects(
      { ...baseRecord, workObjectId: 'card-1' },
      { ...baseScope, objects: [pdf, card] },
    );
    expect(res).toBeNull();
  });

  // T. disconnected pair rejects
  it('T. disconnected PDF and Notebook rejects validation', () => {
    const pdf = makePdf('pdf-1', []); // no connections
    const nb = makeNotebook('nb-1', []);
    const res = validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdf, nb],
    });
    expect(res).toBeNull();
  });

  // U. scope mismatch rejects
  it('U. scope mismatch (user, section, or board) rejects validation', () => {
    const pdf = makePdf('pdf-1', ['nb-1']);
    const nb = makeNotebook('nb-1', ['pdf-1']);

    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      userId: 'user-different',
      objects: [pdf, nb],
    })).toBeNull();

    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      sectionId: 'sec-different',
      objects: [pdf, nb],
    })).toBeNull();

    expect(validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      boardId: 'board-different',
      objects: [pdf, nb],
    })).toBeNull();
  });

  // V. multiple connected notebooks honors remembered valid notebook
  it('V. multiple connected notebooks honors the remembered valid notebook', () => {
    const pdf = makePdf('pdf-1', ['nb-1', 'nb-2']);
    const nb1 = makeNotebook('nb-1', ['pdf-1']);
    const nb2 = makeNotebook('nb-2', ['pdf-1']);

    // Remembered nb-2
    const res2 = validateStudyContinuityAgainstObjects(
      { ...baseRecord, workObjectId: 'nb-2' },
      { ...baseScope, objects: [pdf, nb1, nb2] },
    );
    expect(res2?.notebookObject.id).toBe('nb-2');

    // Remembered nb-1
    const res1 = validateStudyContinuityAgainstObjects(
      { ...baseRecord, workObjectId: 'nb-1' },
      { ...baseScope, objects: [pdf, nb1, nb2] },
    );
    expect(res1?.notebookObject.id).toBe('nb-1');
  });

  // W. validation performs zero graph mutation
  it('W. validation performs zero graph mutation on objects', () => {
    const pdf = makePdf('pdf-1', ['nb-1']);
    const nb = makeNotebook('nb-1', ['pdf-1']);
    const pdfConnBefore = [...pdf.connections!];
    const nbConnBefore = [...nb.connections!];

    validateStudyContinuityAgainstObjects(baseRecord, {
      ...baseScope,
      objects: [pdf, nb],
    });

    expect(pdf.connections).toEqual(pdfConnBefore);
    expect(nb.connections).toEqual(nbConnBefore);
  });
});
