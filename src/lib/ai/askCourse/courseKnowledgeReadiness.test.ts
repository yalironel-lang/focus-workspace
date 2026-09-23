/**
 * M1.1C — derived Course Knowledge readiness mapping (pure).
 */

import { describe, expect, it } from 'vitest';
import {
  classifyKnowledgeSourceRow,
  courseKnowledgeReadinessMessage,
  deriveCourseKnowledgeReadiness,
  type KnowledgeSourceReadinessRow,
} from './courseKnowledgeReadiness';

function pdfRow(
  partial: Partial<KnowledgeSourceReadinessRow> & { source_object_id: string },
): KnowledgeSourceReadinessRow {
  return {
    source_kind: 'free_space_pdf',
    notebook_object_id: null,
    status: 'ready',
    source_version: 1,
    retrieval_source_version: 1,
    error_code: null,
    ...partial,
  };
}

function nbRow(
  partial: Partial<KnowledgeSourceReadinessRow> & {
    source_object_id: string;
    notebook_object_id: string;
  },
): KnowledgeSourceReadinessRow {
  return {
    source_kind: 'notebook_page',
    status: 'ready',
    source_version: 1,
    retrieval_source_version: 1,
    error_code: null,
    ...partial,
  };
}

describe('classifyKnowledgeSourceRow', () => {
  it('ready + retrieval ⇒ ready', () => {
    expect(classifyKnowledgeSourceRow(pdfRow({ source_object_id: 'a' })).class).toBe(
      'ready',
    );
  });

  it('stale + retrieval ⇒ preparing (Ask search requires status=ready)', () => {
    const r = classifyKnowledgeSourceRow(
      pdfRow({
        source_object_id: 'a',
        status: 'stale',
        source_version: 3,
        retrieval_source_version: 2,
      }),
    );
    expect(r.class).toBe('preparing');
    expect(r.tipPreparing).toBe(false);
  });

  it('ready + tip ahead of retrieval ⇒ ready with tipPreparing', () => {
    const r = classifyKnowledgeSourceRow(
      pdfRow({
        source_object_id: 'a',
        status: 'ready',
        source_version: 3,
        retrieval_source_version: 2,
      }),
    );
    expect(r.class).toBe('ready');
    expect(r.tipPreparing).toBe(true);
  });

  it('ready without retrieval ⇒ preparing (awaiting publish)', () => {
    expect(
      classifyKnowledgeSourceRow(
        pdfRow({
          source_object_id: 'a',
          status: 'ready',
          retrieval_source_version: null,
        }),
      ).class,
    ).toBe('preparing');
  });

  it('pending/processing ⇒ preparing', () => {
    expect(
      classifyKnowledgeSourceRow(
        pdfRow({ source_object_id: 'a', status: 'pending', retrieval_source_version: null }),
      ).class,
    ).toBe('preparing');
    expect(
      classifyKnowledgeSourceRow(
        pdfRow({
          source_object_id: 'a',
          status: 'processing',
          retrieval_source_version: null,
        }),
      ).class,
    ).toBe('preparing');
  });

  it('failed ⇒ needs_attention', () => {
    expect(
      classifyKnowledgeSourceRow(
        pdfRow({
          source_object_id: 'a',
          status: 'failed',
          retrieval_source_version: null,
          error_code: 'extract_failed',
        }),
      ).class,
    ).toBe('needs_attention');
  });
});

describe('deriveCourseKnowledgeReadiness', () => {
  it('1. all ready', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [
        pdfRow({ source_object_id: 'p1' }),
        pdfRow({ source_object_id: 'p2' }),
        nbRow({ source_object_id: 'pg1', notebook_object_id: 'nb1' }),
      ],
      markers: [],
      eligible: [
        { kind: 'free_space_pdf', sourceObjectId: 'p1' },
        { kind: 'free_space_pdf', sourceObjectId: 'p2' },
        { kind: 'notebook_page', notebookObjectId: 'nb1', pageId: 'pg1' },
      ],
    });
    expect(r.kind).toBe('ready');
    expect(r.askUsable).toBe(true);
    expect(r.partialPreparing).toBe(false);
    expect(courseKnowledgeReadinessMessage(r)).toBeNull();
  });

  it('2. ready + preparing', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [
        pdfRow({ source_object_id: 'p1' }),
        pdfRow({
          source_object_id: 'p2',
          status: 'processing',
          retrieval_source_version: null,
        }),
      ],
      markers: [],
      eligible: [
        { kind: 'free_space_pdf', sourceObjectId: 'p1' },
        { kind: 'free_space_pdf', sourceObjectId: 'p2' },
      ],
    });
    expect(r.kind).toBe('ready');
    expect(r.askUsable).toBe(true);
    expect(r.partialPreparing).toBe(true);
    expect(courseKnowledgeReadinessMessage(r)).toBe(
      'Some course materials are still preparing.',
    );
  });

  it('3. ready + failed', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [
        pdfRow({ source_object_id: 'p1' }),
        pdfRow({
          source_object_id: 'p2',
          status: 'failed',
          retrieval_source_version: null,
          error_code: 'no_extractable_text',
        }),
      ],
      markers: [],
      eligible: [
        { kind: 'free_space_pdf', sourceObjectId: 'p1' },
        { kind: 'free_space_pdf', sourceObjectId: 'p2' },
      ],
    });
    expect(r.kind).toBe('ready');
    expect(r.partialAttention).toBe(true);
    const msg = courseKnowledgeReadinessMessage(r);
    expect(msg).toContain('need attention');
    expect(msg).not.toMatch(/no_extractable|error_code|extract_failed/i);
  });

  it('4. preparing only', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [
        pdfRow({
          source_object_id: 'p1',
          status: 'pending',
          retrieval_source_version: null,
        }),
      ],
      markers: [],
      eligible: [{ kind: 'free_space_pdf', sourceObjectId: 'p1' }],
    });
    expect(r.kind).toBe('preparing');
    expect(r.askUsable).toBe(false);
    expect(courseKnowledgeReadinessMessage(r)).toBe('Preparing course materials…');
  });

  it('5. failed only', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [
        pdfRow({
          source_object_id: 'p1',
          status: 'failed',
          retrieval_source_version: null,
          error_code: 'too_large',
        }),
      ],
      markers: [],
      eligible: [{ kind: 'free_space_pdf', sourceObjectId: 'p1' }],
    });
    expect(r.kind).toBe('needs_attention');
    const msg = courseKnowledgeReadinessMessage(r)!;
    expect(msg).toMatch(/need attention/i);
    expect(msg).not.toContain('too_large');
  });

  it('6. unenrolled Free Space PDF / no knowledge row', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: [],
      eligible: [{ kind: 'free_space_pdf', sourceObjectId: 'p-hist' }],
    });
    expect(r.kind).toBe('empty');
    expect(r.emptyReason).toBe('not_indexed');
    expect(r.unenrolledCount).toBe(1);
    expect(courseKnowledgeReadinessMessage(r)).toBe(
      'Course materials are not available for Ask yet.',
    );
  });

  it('7. Notebook ready + PDF preparing', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [
        nbRow({ source_object_id: 'pg1', notebook_object_id: 'nb1' }),
        pdfRow({
          source_object_id: 'p1',
          status: 'processing',
          retrieval_source_version: null,
        }),
      ],
      markers: [],
      eligible: [
        { kind: 'notebook_page', notebookObjectId: 'nb1', pageId: 'pg1' },
        { kind: 'free_space_pdf', sourceObjectId: 'p1' },
      ],
    });
    expect(r.kind).toBe('ready');
    expect(r.askUsable).toBe(true);
    expect(r.partialPreparing).toBe(true);
  });

  it('8. no eligible knowledge material', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: [],
      eligible: [],
    });
    expect(r.kind).toBe('empty');
    expect(r.emptyReason).toBe('no_materials');
    expect(courseKnowledgeReadinessMessage(r)).toBeNull();
  });

  it('marker without row counts as preparing', () => {
    const r = deriveCourseKnowledgeReadiness({
      rows: [],
      markers: [{ sourceKind: 'free_space_pdf', sourceObjectId: 'p1' }],
      eligible: [{ kind: 'free_space_pdf', sourceObjectId: 'p1' }],
    });
    expect(r.kind).toBe('preparing');
    expect(r.preparingCount).toBe(1);
    expect(r.unenrolledCount).toBe(0);
  });

  it('10. never surfaces internal error_code in student copy', () => {
    for (const code of [
      'no_extractable_text',
      'extract_failed',
      'recovery_pending',
      'internal_error',
    ]) {
      const r = deriveCourseKnowledgeReadiness({
        rows: [
          pdfRow({
            source_object_id: 'p1',
            status: 'failed',
            retrieval_source_version: null,
            error_code: code,
          }),
        ],
        markers: [],
        eligible: [{ kind: 'free_space_pdf', sourceObjectId: 'p1' }],
      });
      const msg = courseKnowledgeReadinessMessage(r) ?? '';
      expect(msg).not.toContain(code);
    }
  });
});
