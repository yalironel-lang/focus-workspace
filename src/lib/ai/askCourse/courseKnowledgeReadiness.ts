/**
 * M1.1C — derived Course Knowledge readiness (student-facing).
 * Authoritative SoT remains ai_knowledge_sources (+ local needs_process markers).
 * No new DB statuses; no second persistence store.
 */

export type KnowledgeSourceDbStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'stale';

export type KnowledgeSourceKind = 'free_space_pdf' | 'notebook_page';

/** Minimum row shape for readiness (never includes storage_path / body / embeddings). */
export type KnowledgeSourceReadinessRow = {
  source_kind: KnowledgeSourceKind;
  source_object_id: string;
  notebook_object_id: string | null;
  status: KnowledgeSourceDbStatus;
  source_version: number;
  retrieval_source_version: number | null;
  error_code: string | null;
};

export type EligibleKnowledgeMaterialRef =
  | { kind: 'free_space_pdf'; sourceObjectId: string }
  | { kind: 'notebook_page'; notebookObjectId: string; pageId: string };

export type KnowledgeNeedsProcessMarkerRef =
  | { sourceKind: 'free_space_pdf'; sourceObjectId: string }
  | {
      sourceKind: 'notebook_page';
      sourceObjectId: string;
      notebookObjectId: string;
    };

/** Per enrolled/known unit after classification. */
export type SourceReadinessClass = 'ready' | 'preparing' | 'needs_attention';

export type CourseKnowledgeReadinessKind =
  | 'ready'
  | 'preparing'
  | 'needs_attention'
  | 'empty';

export type CourseKnowledgeReadiness = {
  kind: CourseKnowledgeReadinessKind;
  /** At least one source is retrieval-eligible for Ask. */
  askUsable: boolean;
  readyCount: number;
  preparingCount: number;
  attentionCount: number;
  /** Eligible Free Space materials with no knowledge row and no marker. */
  unenrolledCount: number;
  /**
   * When kind=ready and some other material is still preparing / needs attention.
   * Ask remains usable.
   */
  partialPreparing: boolean;
  partialAttention: boolean;
  /** empty: no materials vs materials present but not enrolled/indexed yet. */
  emptyReason: 'no_materials' | 'not_indexed' | null;
};

function materialKey(m: EligibleKnowledgeMaterialRef): string {
  if (m.kind === 'free_space_pdf') return `pdf:${m.sourceObjectId}`;
  return `nb:${m.notebookObjectId}:${m.pageId}`;
}

function rowKey(row: KnowledgeSourceReadinessRow): string {
  if (row.source_kind === 'free_space_pdf') {
    return `pdf:${row.source_object_id}`;
  }
  const nb = row.notebook_object_id ?? '';
  return `nb:${nb}:${row.source_object_id}`;
}

function markerKey(m: KnowledgeNeedsProcessMarkerRef): string {
  if (m.sourceKind === 'free_space_pdf') return `pdf:${m.sourceObjectId}`;
  return `nb:${m.notebookObjectId}:${m.sourceObjectId}`;
}

/**
 * Ask search (016) requires status='ready' AND retrieval_source_version IS NOT NULL.
 * Option A tip lag: source_version may lead retrieval while status stays ready after
 * publish; begin_ingest may flip to 'stale' during reprocess — that is NOT Ask-eligible
 * in current search SQL, so classify as preparing (not ready).
 * ready + null retrieval ⇒ tip/corpus not published yet ⇒ preparing.
 * pending|processing ⇒ preparing.
 * failed ⇒ needs_attention.
 */
export function classifyKnowledgeSourceRow(
  row: KnowledgeSourceReadinessRow,
): {
  class: SourceReadinessClass;
  /** Tip ahead of published retrieval while still Ask-eligible (status ready). */
  tipPreparing: boolean;
} {
  const retrieval = row.retrieval_source_version;
  const tip = row.source_version;

  if (row.status === 'failed') {
    return { class: 'needs_attention', tipPreparing: false };
  }

  if (row.status === 'ready' && retrieval != null && Number.isFinite(retrieval)) {
    return {
      class: 'ready',
      tipPreparing: Number.isFinite(tip) && tip > retrieval,
    };
  }

  if (
    row.status === 'pending' ||
    row.status === 'processing' ||
    row.status === 'stale' ||
    row.status === 'ready'
  ) {
    return { class: 'preparing', tipPreparing: false };
  }

  return { class: 'needs_attention', tipPreparing: false };
}

export function deriveCourseKnowledgeReadiness(input: {
  rows: readonly KnowledgeSourceReadinessRow[];
  markers: readonly KnowledgeNeedsProcessMarkerRef[];
  eligible: readonly EligibleKnowledgeMaterialRef[];
}): CourseKnowledgeReadiness {
  const markerKeys = new Set(input.markers.map(markerKey));
  const rowByKey = new Map<string, KnowledgeSourceReadinessRow>();
  for (const row of input.rows) {
    rowByKey.set(rowKey(row), row);
  }

  let readyCount = 0;
  let preparingCount = 0;
  let attentionCount = 0;

  const classifiedKeys = new Set<string>();

  for (const row of input.rows) {
    const key = rowKey(row);
    classifiedKeys.add(key);
    const { class: cls, tipPreparing } = classifyKnowledgeSourceRow(row);
    if (cls === 'ready') {
      readyCount += 1;
      if (tipPreparing || markerKeys.has(key)) preparingCount += 1;
    } else if (cls === 'preparing') {
      preparingCount += 1;
    } else {
      attentionCount += 1;
      // Marker on a failed source does not reclassify as preparing.
    }
  }

  // Markers without a row (or not yet reflected) ⇒ preparing.
  for (const m of input.markers) {
    const key = markerKey(m);
    if (classifiedKeys.has(key)) continue;
    preparingCount += 1;
    classifiedKeys.add(key);
  }

  let unenrolledCount = 0;
  for (const el of input.eligible) {
    const key = materialKey(el);
    if (rowByKey.has(key) || markerKeys.has(key)) continue;
    unenrolledCount += 1;
  }

  const askUsable = readyCount > 0;
  const partialPreparing = askUsable && (preparingCount > 0 || unenrolledCount > 0);
  const partialAttention = askUsable && attentionCount > 0;

  if (askUsable) {
    return {
      kind: 'ready',
      askUsable: true,
      readyCount,
      preparingCount,
      attentionCount,
      unenrolledCount,
      partialPreparing,
      partialAttention,
      emptyReason: null,
    };
  }

  if (preparingCount > 0) {
    return {
      kind: 'preparing',
      askUsable: false,
      readyCount,
      preparingCount,
      attentionCount,
      unenrolledCount,
      partialPreparing: false,
      partialAttention: false,
      emptyReason: null,
    };
  }

  if (attentionCount > 0) {
    return {
      kind: 'needs_attention',
      askUsable: false,
      readyCount,
      preparingCount,
      attentionCount,
      unenrolledCount,
      partialPreparing: false,
      partialAttention: false,
      emptyReason: null,
    };
  }

  // No usable / preparing / failed enrolled sources.
  if (unenrolledCount > 0 || input.eligible.length > 0) {
    return {
      kind: 'empty',
      askUsable: false,
      readyCount: 0,
      preparingCount: 0,
      attentionCount: 0,
      unenrolledCount,
      partialPreparing: false,
      partialAttention: false,
      emptyReason: 'not_indexed',
    };
  }

  return {
    kind: 'empty',
    askUsable: false,
    readyCount: 0,
    preparingCount: 0,
    attentionCount: 0,
    unenrolledCount: 0,
    partialPreparing: false,
    partialAttention: false,
    emptyReason: 'no_materials',
  };
}

/** Student-facing banner copy — never include error_code / paths / ids. */
export function courseKnowledgeReadinessMessage(
  readiness: CourseKnowledgeReadiness,
): string | null {
  if (readiness.kind === 'ready') {
    if (readiness.partialPreparing) {
      return 'Some course materials are still preparing.';
    }
    if (readiness.partialAttention) {
      return 'Some course materials need attention. Ask can still use ready sources.';
    }
    // Fully ready — avoid noise.
    return null;
  }
  if (readiness.kind === 'preparing') {
    return 'Preparing course materials…';
  }
  if (readiness.kind === 'needs_attention') {
    return 'Course materials need attention before Ask can use them.';
  }
  if (readiness.emptyReason === 'not_indexed') {
    return 'Course materials are not available for Ask yet.';
  }
  // no_materials: keep Ask empty-state intro; no extra banner.
  return null;
}

/** Browser event so Ask can refresh after process drain without a parallel store. */
export const COURSE_KNOWLEDGE_READINESS_INVALIDATE_EVENT =
  'zikuk-course-knowledge-readiness-invalidate' as const;

export function invalidateCourseKnowledgeReadiness(sectionId: string): void {
  const sid = sectionId.trim();
  if (!sid || typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(COURSE_KNOWLEDGE_READINESS_INVALIDATE_EVENT, {
        detail: { sectionId: sid },
      }),
    );
  } catch {
    // ignore
  }
}
