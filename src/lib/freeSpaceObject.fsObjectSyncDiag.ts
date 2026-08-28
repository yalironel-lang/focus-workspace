/**
 * Temporary diagnostics for Free Space structured object cloud sync.
 * Prefix: [FS-OBJECT-SYNC-DIAG]
 */

import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { fsImageSyncDiagSummarizeImageContent } from './spatialAssetCloud.fsImageSyncDiag';

export type FsObjectSyncDiagBoundary =
  | 'A_handle_image_create'
  | 'B_local_object_persist'
  | 'C_structured_enqueue'
  | 'D_pending_payload'
  | 'E_flush_dispatch'
  | 'F_supabase_upsert'
  | 'G_queue_removed'
  | 'H_saved_status'
  | 'I_orphan_cancel'
  | 'J_cloud_delete'
  | 'K_local_blob_delete'
  | 'L_gc_decision';

export type FsObjectSyncDiagContext = {
  sectionId?: string;
  boardId?: string;
  objectId?: string;
};

function summarizeContent(content: ProjectObjectContent | undefined): Record<string, unknown> | null {
  if (!content) return null;
  if (content.type === 'image') return fsImageSyncDiagSummarizeImageContent(content);
  return { type: content.type };
}

export function fsObjectSyncDiagLog(
  boundary: FsObjectSyncDiagBoundary,
  ctx: FsObjectSyncDiagContext,
  extra?: Record<string, unknown>,
): void {
  if (typeof console === 'undefined') return;
  const payload = {
    boundary,
    sectionId: ctx.sectionId ?? null,
    boardId: ctx.boardId ?? null,
    objectId: ctx.objectId ?? null,
    ...extra,
  };
  console.info('[FS-OBJECT-SYNC-DIAG]', JSON.stringify(payload));
}

export function fsObjectSyncDiagSummarizeObject(
  object: ProjectSpaceObject | null | undefined,
): Record<string, unknown> | null {
  if (!object) return null;
  return {
    type: object.type,
    title: object.title,
    updatedAt: object.updatedAt,
    content: summarizeContent(object.content),
  };
}
