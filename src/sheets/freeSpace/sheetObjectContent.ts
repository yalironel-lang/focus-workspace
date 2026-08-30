import {
  createEmptyFocusSheetDocument,
  type FocusSheetDocument,
} from '../domain/FocusSheetDocument';

export const SHEET_OBJECT_TYPE = 'sheet' as const;

export type SheetObjectContent = {
  type: typeof SHEET_OBJECT_TYPE;
  document: FocusSheetDocument;
};

/**
 * Pass through stored sheet documents without minting an empty workbook.
 * Invalid payloads stay invalid so the surface can fail safely.
 */
export function passthroughSheetDocument(raw: unknown): FocusSheetDocument {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as FocusSheetDocument;
  }
  return {
    schemaVersion: Number.NaN as unknown as 1,
    engine: 'univer',
    workbook: raw,
  };
}

export function createDefaultSheetObjectContent(): SheetObjectContent {
  return {
    type: SHEET_OBJECT_TYPE,
    document: createEmptyFocusSheetDocument(),
  };
}

export function toSheetObjectContent(document: FocusSheetDocument): SheetObjectContent {
  return { type: SHEET_OBJECT_TYPE, document };
}

/** Skip dirty/persist when the object is gone or already pending delete. */
export function shouldAcceptObjectContentUpdate(
  id: string,
  objects: ReadonlyArray<{ id: string }>,
  pendingDeletedIds: ReadonlySet<string>,
): boolean {
  if (!id) return false;
  if (pendingDeletedIds.has(id)) return false;
  return objects.some((o) => o.id === id);
}
