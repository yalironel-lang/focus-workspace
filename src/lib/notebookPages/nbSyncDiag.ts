/**
 * Temporary structured diagnostics for notebook multi-page cloud sync (P0).
 * Prefix: [NB-SYNC-DIAG]
 */

import type { NotebookContentWithPages, NotebookPage, NotebookSection } from './types';

export type NbSyncDiagBoundary =
  | 'A_before_updateObjectContent'
  | 'B_updateObjectContent_local'
  | 'C_pending_enqueue'
  | 'D_flush_payload'
  | 'E_supabase_response'
  | 'F_cloud_pull'
  | 'G_shouldAcceptCloud'
  | 'H_merged_local'
  | 'I_hydrate_input'
  | 'J_hydrate_output'
  | 'K_effectiveContent';

export type NbSyncDiagContext = {
  sectionId?: string;
  boardId?: string;
  objectId?: string;
  objectUpdatedAt?: number;
};

function pageSummary(p: NotebookPage): Record<string, unknown> {
  return {
    id: p.id,
    sectionId: p.sectionId,
    kind: p.kind,
    title: p.title ?? null,
    documentBody: p.documentBody ?? null,
    inkPageKey: p.inkPageKey ?? null,
  };
}

export function nbSyncDiagSummarizeContent(
  content: NotebookContentWithPages | null | undefined,
): Record<string, unknown> | null {
  if (!content) return null;
  return {
    schemaVersion: content.schemaVersion ?? null,
    body: content.body ?? null,
    activeSectionId: content.activeSectionId ?? null,
    activePageId: content.activePageId ?? null,
    sections: (content.sections ?? []).map((s: NotebookSection) => ({
      id: s.id,
      title: s.title,
      pageIds: [...s.pageIds],
    })),
    pages: (content.pages ?? []).map(pageSummary),
  };
}

export function nbSyncDiagLog(
  boundary: NbSyncDiagBoundary,
  ctx: NbSyncDiagContext,
  extra?: Record<string, unknown>,
): void {
  if (typeof console === 'undefined') return;
  const payload = {
    boundary,
    sectionId: ctx.sectionId ?? null,
    boardId: ctx.boardId ?? null,
    objectId: ctx.objectId ?? null,
    objectUpdatedAt: ctx.objectUpdatedAt ?? null,
    ...extra,
  };
  console.info('[NB-SYNC-DIAG]', JSON.stringify(payload));
}

/** Dev-only: fetch own free_space_objects row through authenticated client. */
export async function nbSyncDiagFetchCloudObject(input: {
  objectId: string;
  sectionId?: string;
}): Promise<{ ok: true; row: unknown } | { ok: false; reason: string }> {
  try {
    const { supabase, isSupabaseConfigured } = await import('../supabase');
    if (!isSupabaseConfigured) return { ok: false, reason: 'supabase_not_configured' };
    let q = supabase
      .from('free_space_objects')
      .select('id, section_id, board_id, object, updated_at')
      .eq('id', input.objectId);
    if (input.sectionId) q = q.eq('section_id', input.sectionId);
    const { data, error } = await q.maybeSingle();
    if (error) return { ok: false, reason: error.message };
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, row: data };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

declare global {
  interface Window {
    __fwNbSyncDiagFetchObject?: (
      objectId: string,
      sectionId?: string,
    ) => Promise<{ ok: true; row: unknown } | { ok: false; reason: string }>;
  }
}

if (typeof window !== 'undefined') {
  window.__fwNbSyncDiagFetchObject = (objectId, sectionId) =>
    nbSyncDiagFetchCloudObject({ objectId, sectionId });
}
