/**
 * M1.1C — RLS-bound SELECT of ai_knowledge_sources readiness metadata only.
 * Authenticated anon key client; never service role.
 */

import { supabase } from '../../supabase';
import type {
  KnowledgeSourceDbStatus,
  KnowledgeSourceKind,
  KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';

const READINESS_SELECT =
  'source_kind,source_object_id,notebook_object_id,status,source_version,retrieval_source_version,error_code' as const;

function isStatus(v: unknown): v is KnowledgeSourceDbStatus {
  return (
    v === 'pending' ||
    v === 'processing' ||
    v === 'ready' ||
    v === 'failed' ||
    v === 'stale'
  );
}

function isKind(v: unknown): v is KnowledgeSourceKind {
  return v === 'free_space_pdf' || v === 'notebook_page';
}

function parseRow(raw: unknown): KnowledgeSourceReadinessRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isKind(o.source_kind) || !isStatus(o.status)) return null;
  if (typeof o.source_object_id !== 'string' || !o.source_object_id.trim()) return null;
  if (typeof o.source_version !== 'number' || !Number.isFinite(o.source_version)) return null;
  const retrieval =
    o.retrieval_source_version === null || o.retrieval_source_version === undefined
      ? null
      : typeof o.retrieval_source_version === 'number' &&
          Number.isFinite(o.retrieval_source_version)
        ? o.retrieval_source_version
        : null;
  return {
    source_kind: o.source_kind,
    source_object_id: o.source_object_id,
    notebook_object_id:
      typeof o.notebook_object_id === 'string' ? o.notebook_object_id : null,
    status: o.status,
    source_version: o.source_version,
    retrieval_source_version: retrieval,
    error_code: typeof o.error_code === 'string' ? o.error_code : null,
  };
}

export type FetchSectionKnowledgeSourceRowsResult =
  | { ok: true; rows: KnowledgeSourceReadinessRow[] }
  | { ok: false; code: 'unauthenticated' | 'query_failed' };

/**
 * Section-scoped readiness rows. RLS must restrict to the signed-in user's
 * sources; we still filter by section_id explicitly.
 */
export async function fetchSectionKnowledgeSourceRows(
  sectionId: string,
): Promise<FetchSectionKnowledgeSourceRowsResult> {
  const sid = sectionId.trim();
  if (!sid) return { ok: false, code: 'query_failed' };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) {
    return { ok: false, code: 'unauthenticated' };
  }

  // Table not yet in generated Database types — select via untyped seam.
  // Columns are readiness metadata only (no storage_path / text / embeddings).
  type UntypedQuery = {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
    };
  };
  const { data, error } = await (
    supabase as unknown as { from: (relation: string) => UntypedQuery }
  )
    .from('ai_knowledge_sources')
    .select(READINESS_SELECT)
    .eq('section_id', sid);

  if (error) {
    return { ok: false, code: 'query_failed' };
  }

  const rows: KnowledgeSourceReadinessRow[] = [];
  for (const raw of data ?? []) {
    const parsed = parseRow(raw);
    if (parsed) rows.push(parsed);
  }
  return { ok: true, rows };
}
