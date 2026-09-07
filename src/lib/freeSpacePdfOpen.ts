/**
 * PDF viewer open resolution: local IDB first, cloud fallback that returns bytes
 * even when IndexedDB cache write fails (Capacitor fresh-device).
 */

import { loadPdfBlob } from './freeSpacePdfIdb';
import { hydrateSpatialPdfWithCloud } from './spatialAssetCloud';
import { pdfUploadDiag } from './pdfUploadDiag';

export type PdfOpenBlobResult =
  | {
      ok: true;
      blob: Blob;
      source: 'local' | 'cloud';
      cachePersisted: boolean;
    }
  | {
      ok: false;
      reason: string;
      localLookupFailed: boolean;
    };

/**
 * Resolve bytes for FreeSpacePdfCard / viewers.
 * Never requires a successful IDB write before returning a cloud Blob.
 */
export async function resolvePdfBlobForViewerOpen(input: {
  sectionId: string;
  objectId: string;
  userId: string | null | undefined;
}): Promise<PdfOpenBlobResult> {
  const { sectionId, objectId, userId } = input;
  const key = `${sectionId}::${objectId}`;
  let localLookupFailed = false;

  try {
    const local = await loadPdfBlob(sectionId, objectId);
    if (local && local.size > 0) {
      return {
        ok: true,
        blob: local,
        source: 'local',
        cachePersisted: true,
      };
    }
  } catch (err) {
    localLookupFailed = true;
    pdfUploadDiag('resolvePdfOpen:localIdbError', {
      sectionId,
      objectId,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!userId?.trim()) {
    return {
      ok: false,
      reason: 'no_user',
      localLookupFailed,
    };
  }

  const hydrate = await hydrateSpatialPdfWithCloud({
    userId,
    sectionId,
    objectId,
    assetType: 'pdf',
  });

  if (hydrate.blob && hydrate.blob.size > 0) {
    return {
      ok: true,
      blob: hydrate.blob,
      source: hydrate.result === 'local_hit' ? 'local' : 'cloud',
      cachePersisted: hydrate.cachePersisted,
    };
  }

  return {
    ok: false,
    reason: hydrate.errorMessage ?? 'cloud_missing',
    localLookupFailed,
  };
}
