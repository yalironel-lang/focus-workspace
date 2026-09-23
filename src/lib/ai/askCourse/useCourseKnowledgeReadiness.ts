/**
 * M1.1C — Ask-open course knowledge readiness (derived + bounded refresh).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { listNeedsKnowledgeProcessForSection } from '../knowledgeProcessHandoff/needsProcessStore';
import {
  deriveCourseKnowledgeReadiness,
  COURSE_KNOWLEDGE_READINESS_INVALIDATE_EVENT,
  type CourseKnowledgeReadiness,
  type EligibleKnowledgeMaterialRef,
  type KnowledgeNeedsProcessMarkerRef,
} from './courseKnowledgeReadiness';
import { fetchSectionKnowledgeSourceRows } from './fetchSectionKnowledgeSourceRows';

/** Low-frequency poll while Preparing / tip lag — stop when Ask closes. */
export const COURSE_KNOWLEDGE_READINESS_POLL_MS = 8_000;

/** Bound IndexedDB / network so Ask open never stalls on readiness. */
const READINESS_LOAD_BUDGET_MS = 2_500;

const EMPTY_READINESS: CourseKnowledgeReadiness = {
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

function shouldPoll(r: CourseKnowledgeReadiness): boolean {
  return r.kind === 'preparing' || r.partialPreparing;
}

function withBudget<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  return new Promise(resolve => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    promise.then(
      value => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function useCourseKnowledgeReadiness(input: {
  sectionId: string;
  open: boolean;
  eligible: readonly EligibleKnowledgeMaterialRef[];
}): {
  readiness: CourseKnowledgeReadiness;
  refresh: () => void;
  loading: boolean;
} {
  const { sectionId, open, eligible } = input;
  const [readiness, setReadiness] = useState<CourseKnowledgeReadiness>(EMPTY_READINESS);
  const [loading, setLoading] = useState(false);
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;
  const genRef = useRef(0);

  const load = useCallback(async () => {
    const sid = sectionId.trim();
    if (!sid) {
      setReadiness(EMPTY_READINESS);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    try {
      const [fetched, markers] = await Promise.all([
        withBudget(
          fetchSectionKnowledgeSourceRows(sid),
          { ok: false as const, code: 'query_failed' as const },
          READINESS_LOAD_BUDGET_MS,
        ),
        withBudget(
          listNeedsKnowledgeProcessForSection(sid),
          [],
          READINESS_LOAD_BUDGET_MS,
        ),
      ]);
      if (gen !== genRef.current) return;

      const markerRefs: KnowledgeNeedsProcessMarkerRef[] = markers
        .map(m => {
          if (m.sourceKind === 'notebook_page') {
            if (!m.notebookObjectId) return null;
            return {
              sourceKind: 'notebook_page' as const,
              sourceObjectId: m.sourceObjectId,
              notebookObjectId: m.notebookObjectId,
            };
          }
          return {
            sourceKind: 'free_space_pdf' as const,
            sourceObjectId: m.sourceObjectId,
          };
        })
        .filter((m): m is KnowledgeNeedsProcessMarkerRef => m !== null);

      const rows = fetched.ok ? fetched.rows : [];
      setReadiness(
        deriveCourseKnowledgeReadiness({
          rows,
          markers: markerRefs,
          eligible: eligibleRef.current,
        }),
      );
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [sectionId]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load, eligible]);

  useEffect(() => {
    if (!open) return;
    const onInvalidate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ sectionId?: string }>).detail;
      if (detail?.sectionId && detail.sectionId === sectionId.trim()) {
        void load();
      }
    };
    window.addEventListener(COURSE_KNOWLEDGE_READINESS_INVALIDATE_EVENT, onInvalidate);
    return () => {
      window.removeEventListener(COURSE_KNOWLEDGE_READINESS_INVALIDATE_EVENT, onInvalidate);
    };
  }, [open, sectionId, load]);

  useEffect(() => {
    if (!open) return;
    if (!shouldPoll(readiness)) return;
    const id = window.setInterval(() => {
      void load();
    }, COURSE_KNOWLEDGE_READINESS_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, readiness, load]);

  return { readiness, refresh, loading };
}
