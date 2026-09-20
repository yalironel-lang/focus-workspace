/**
 * @vitest-environment happy-dom
 *
 * M0.6 openAskCourseSource — Free Space focus + applyPdfPageRestore path.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceObject } from '../../../hooks/useSectionFreeSpaceObjects';
import { openAskCourseSource } from './openAskCourseSource';

function pdfObject(id: string, page = 1): ProjectSpaceObject {
  return {
    id,
    type: 'pdf',
    title: 'Doc',
    createdAt: 1,
    updatedAt: 1,
    content: {
      type: 'pdf',
      assetId: 'asset-1',
      fileName: 'Doc.pdf',
      page,
      pageCount: 10,
      zoom: 1,
      lastOpenedAt: 1,
    },
  } as ProjectSpaceObject;
}

describe('openAskCourseSource', () => {
  it('focuses object and applies page restore with authoritative ids', () => {
    const obj = pdfObject('pdf-obj-1', 1);
    const focusObject = vi.fn();
    const updateObjectContent = vi.fn();
    const getObject = vi.fn(() => obj);

    const result = openAskCourseSource(
      {
        index: 1,
        sourceObjectId: 'pdf-obj-1',
        fileName: 'Doc.pdf',
        pageNumber: 4,
      },
      { getObject, focusObject, updateObjectContent },
    );

    expect(result).toBe('opened');
    expect(getObject).toHaveBeenCalledWith('pdf-obj-1');
    expect(updateObjectContent).toHaveBeenCalledTimes(1);
    const [, patch] = updateObjectContent.mock.calls[0];
    expect(patch).toEqual(expect.objectContaining({ type: 'pdf', page: 4 }));
    expect(focusObject).toHaveBeenCalledWith('pdf-obj-1');
  });

  it('fails safely when object missing', () => {
    const focusObject = vi.fn();
    const updateObjectContent = vi.fn();
    const result = openAskCourseSource(
      {
        index: 1,
        sourceObjectId: 'missing',
        fileName: null,
        pageNumber: 2,
      },
      {
        getObject: () => null,
        focusObject,
        updateObjectContent,
      },
    );
    expect(result).toBe('not_found');
    expect(focusObject).not.toHaveBeenCalled();
    expect(updateObjectContent).not.toHaveBeenCalled();
  });

  it('fails safely when object is not a PDF', () => {
    const note = {
      id: 'note-1',
      type: 'note',
      title: 'N',
      createdAt: 1,
      updatedAt: 1,
      content: { type: 'note', body: 'x' },
    } as ProjectSpaceObject;
    const focusObject = vi.fn();
    const result = openAskCourseSource(
      {
        index: 1,
        sourceObjectId: 'note-1',
        fileName: 'x',
        pageNumber: 1,
      },
      {
        getObject: () => note,
        focusObject,
        updateObjectContent: vi.fn(),
      },
    );
    expect(result).toBe('not_pdf');
    expect(focusObject).not.toHaveBeenCalled();
  });
});
