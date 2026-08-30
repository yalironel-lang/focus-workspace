import { describe, expect, it } from 'vitest';
import {
  ensureProjectObjectContent,
  normalizeProjectSpaceObject,
} from '../../hooks/useSectionFreeSpaceObjects';
import { createEmptyFocusSheetDocument } from '../domain/FocusSheetDocument';
import { validateFocusSheetDocument } from '../domain/validateFocusSheetDocument';
import {
  createDefaultSheetObjectContent,
  passthroughSheetDocument,
  shouldAcceptObjectContentUpdate,
} from './sheetObjectContent';

describe('sheet Free Space object model', () => {
  it('creates a default sheet with a valid FocusSheetDocument', () => {
    const content = createDefaultSheetObjectContent();
    expect(content.type).toBe('sheet');
    expect(validateFocusSheetDocument(content.document).ok).toBe(true);
  });

  it('normalizes a sheet object instead of dropping it', () => {
    const document = createEmptyFocusSheetDocument();
    const obj = normalizeProjectSpaceObject({
      id: 'ps-sheet-1',
      type: 'sheet',
      title: 'Sheet',
      content: { type: 'sheet', document },
      createdAt: 1,
      updatedAt: 1,
    });
    expect(obj).not.toBeNull();
    expect(obj?.type).toBe('sheet');
    expect(obj?.content.type).toBe('sheet');
    if (obj?.content.type === 'sheet') {
      expect(validateFocusSheetDocument(obj.content.document).ok).toBe(true);
    }
  });

  it('passes through corrupted documents without minting an empty workbook', () => {
    const corrupt = { schemaVersion: 99, engine: 'univer', workbook: { keepFlag: 'yes' } };
    const content = ensureProjectObjectContent('sheet', { type: 'sheet', document: corrupt });
    expect(content.type).toBe('sheet');
    if (content.type === 'sheet') {
      expect(content.document).toEqual(corrupt);
      expect(validateFocusSheetDocument(content.document).ok).toBe(false);
    }
  });

  it('passthrough does not call createEmpty for non-objects', () => {
    const doc = passthroughSheetDocument('nope');
    expect(validateFocusSheetDocument(doc).ok).toBe(false);
    expect(doc.workbook).toBe('nope');
  });

  it('rejects content updates for missing or pending-deleted ids', () => {
    const objects = [{ id: 'live' }];
    const pending = new Set(['gone']);
    expect(shouldAcceptObjectContentUpdate('live', objects, pending)).toBe(true);
    expect(shouldAcceptObjectContentUpdate('gone', objects, pending)).toBe(false);
    expect(shouldAcceptObjectContentUpdate('missing', objects, pending)).toBe(false);
    expect(shouldAcceptObjectContentUpdate('', objects, pending)).toBe(false);
  });
});
