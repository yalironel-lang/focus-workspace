/**
 * Mission Control Continue ranker + surface isolation policy regression tests.
 */
import { describe, expect, it } from 'vitest';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import {
  deriveMissionControlContinue,
  deriveMissionControlSections,
  safeTimestamp,
} from './deriveMissionControlSections';
import {
  buildCanvasScaleContext,
  getBlockRenderPolicy,
  shouldSuspendPdfViewer,
  type BlockPolicyInput,
} from './freeSpaceScalePolicy';
import { surfaceShellStyle } from './surfaceShellStyle';

const NOW = 1_700_000_000_000;

function baseObj(
  partial: Partial<ProjectSpaceObject> & Pick<ProjectSpaceObject, 'id' | 'type' | 'content'>,
): ProjectSpaceObject {
  return {
    title: partial.title ?? partial.id,
    createdAt: partial.createdAt ?? NOW - 7 * 86_400_000,
    updatedAt: partial.updatedAt ?? NOW - 7 * 86_400_000,
    connections: partial.connections,
    ...partial,
  };
}

function notebook(id: string, opts: {
  updatedAt: number;
  body?: string;
  subtitle?: string;
  createdAt?: number;
}): ProjectSpaceObject {
  return baseObj({
    id,
    type: 'notebook',
    title: id,
    updatedAt: opts.updatedAt,
    createdAt: opts.createdAt ?? opts.updatedAt - 86_400_000,
    content: {
      type: 'notebook',
      body: opts.body ?? '# Notes\nSubstantial lecture notes about Solow growth.',
      paperStyle: 'ruled',
      subtitle: opts.subtitle ?? 'Lecture Notes',
    },
  });
}

function pdf(id: string, opts: {
  lastOpenedAt: number | null;
  updatedAt?: number;
  page?: number;
  connections?: string[];
  fileName?: string;
}): ProjectSpaceObject {
  const updatedAt = opts.updatedAt ?? (opts.lastOpenedAt && opts.lastOpenedAt > 0
    ? opts.lastOpenedAt
    : NOW - 86_400_000);
  return baseObj({
    id,
    type: 'pdf',
    title: opts.fileName ?? id,
    updatedAt,
    createdAt: updatedAt - 86_400_000,
    connections: opts.connections,
    content: {
      type: 'pdf',
      fileName: opts.fileName ?? `${id}.pdf`,
      fileType: 'application/pdf',
      fileSize: 1000,
      page: opts.page ?? 1,
      pageCount: 40,
      zoom: 1,
      lastOpenedAt: opts.lastOpenedAt,
    },
  });
}

function note(id: string, opts: {
  createdAt: number;
  updatedAt?: number;
  body?: string;
  connections?: string[];
}): ProjectSpaceObject {
  return baseObj({
    id,
    type: 'note',
    title: id,
    createdAt: opts.createdAt,
    updatedAt: opts.updatedAt ?? opts.createdAt,
    connections: opts.connections,
    content: {
      type: 'note',
      body: opts.body ?? '',
    },
  });
}

function mistake(id: string, opts: { createdAt: number }): ProjectSpaceObject {
  return baseObj({
    id,
    type: 'mistake',
    title: id,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
    content: {
      type: 'mistake',
      variant: 'mistake',
      whatWrong: 'Confused derivative of ln',
      correction: '',
      confidence: 'low',
      timesReviewed: 0,
      lastReviewedAt: null,
    },
  });
}

describe('deriveMissionControlContinue ranking', () => {
  it('A: recent meaningful notebook beats new empty unlinked note', () => {
    const nb = notebook('nb', { updatedAt: NOW - 30 * 60_000 });
    const empty = note('empty', { createdAt: NOW - 60_000, body: '' });
    const next = deriveMissionControlContinue([empty, nb], NOW);
    expect(next?.object.id).toBe('nb');
    expect(next?.verb).toBe('Continue');
    expect(next?.sublabel).toMatch(/Notebook/);
  });

  it('B: recent PDF without connections can become Continue', () => {
    const doc = pdf('exam', {
      lastOpenedAt: NOW - 20 * 60_000,
      page: 12,
      connections: undefined,
      fileName: 'Natural Law.pdf',
    });
    const next = deriveMissionControlContinue([doc], NOW);
    expect(next?.object.id).toBe('exam');
    expect(next?.sublabel).toMatch(/PDF/);
    expect(next?.sublabel).toMatch(/page 12/);
  });

  it('C: meaningful recently-used PDF beats older notebook', () => {
    const oldNb = notebook('old-nb', { updatedAt: NOW - 3 * 86_400_000 });
    const recentPdf = pdf('recent-pdf', {
      lastOpenedAt: NOW - 15 * 60_000,
      page: 4,
      connections: [],
    });
    const next = deriveMissionControlContinue([oldNb, recentPdf], NOW);
    expect(next?.object.id).toBe('recent-pdf');
  });

  it('D: unlinked note with substance may win when no better study work', () => {
    const capture = note('cap', {
      createdAt: NOW - 10 * 60_000,
      body: 'Remember to review chain rule examples from tutorial.',
    });
    const next = deriveMissionControlContinue([capture], NOW);
    expect(next?.object.id).toBe('cap');
    expect(next?.verb).toBe('Resolve');
  });

  it('E: unreviewed mistake does not dominate active study work', () => {
    const nb = notebook('nb', { updatedAt: NOW - 2 * 60_000 });
    const m = mistake('m1', { createdAt: NOW - 60_000 });
    const next = deriveMissionControlContinue([m, nb], NOW);
    expect(next?.object.id).toBe('nb');
  });

  it('F: deleted/nonexistent object cannot appear', () => {
    const nb = notebook('nb', { updatedAt: NOW - 60_000 });
    const next = deriveMissionControlContinue([nb], NOW);
    expect(next?.object.id).toBe('nb');
    // Removing from array removes Continue
    expect(deriveMissionControlContinue([], NOW)).toBeNull();
    expect(deriveMissionControlContinue([nb].filter(o => o.id !== 'nb'), NOW)).toBeNull();
  });

  it('G: malformed/missing timestamps are safe and deterministic', () => {
    expect(safeTimestamp(undefined)).toBe(0);
    expect(safeTimestamp(Number.NaN)).toBe(0);
    expect(safeTimestamp(Infinity)).toBe(0);
    expect(safeTimestamp(-5)).toBe(0);

    const weird = pdf('weird', {
      lastOpenedAt: null,
      updatedAt: Number.NaN as unknown as number,
    });
    // Force bad updatedAt/createdAt
    (weird as { updatedAt: number }).updatedAt = Number.NaN;
    (weird as { createdAt: number }).createdAt = Number.NaN;
    const good = notebook('good', { updatedAt: NOW - 60_000 });
    const next = deriveMissionControlContinue([weird, good], NOW);
    expect(next?.object.id).toBe('good');
  });

  it('H: only objects in the provided array compete (course isolation by caller)', () => {
    const courseA = notebook('a', { updatedAt: NOW - 60_000 });
    const courseB = pdf('b', { lastOpenedAt: NOW - 30_000, fileName: 'other-course.pdf' });
    // Caller passes section-scoped objects only — foreign ids never appear
    expect(deriveMissionControlContinue([courseA], NOW)?.object.id).toBe('a');
    expect(deriveMissionControlContinue([courseA], NOW)?.object.id).not.toBe('b');
    expect(deriveMissionControlContinue([courseB], NOW)?.object.id).toBe('b');
    expect(deriveMissionControlContinue([courseB], NOW)?.object.id).not.toBe('a');
  });

  it('empty note does not beat notebook even when newer', () => {
    const nb = notebook('nb', { updatedAt: NOW - 2 * 60_000 });
    const empty = note('n', { createdAt: NOW - 5_000, body: '   ' });
    expect(deriveMissionControlContinue([empty, nb], NOW)?.object.id).toBe('nb');
  });

  it('sections.next is exclusively deriveMissionControlContinue', () => {
    const doc = pdf('p', { lastOpenedAt: NOW - 60_000, page: 3 });
    const sections = deriveMissionControlSections([doc]);
    const direct = deriveMissionControlContinue([doc]);
    expect(sections.next?.object.id).toBe(direct?.object.id);
    expect(sections.next?.sublabel).toBe(direct?.sublabel);
  });

  it('L: Continue PDF exposes page N in metadata for resume UI', () => {
    const doc = pdf('p', { lastOpenedAt: NOW - 60_000, page: 9, fileName: 'Exam.pdf' });
    const next = deriveMissionControlContinue([doc], NOW);
    expect(next?.object.content.type).toBe('pdf');
    if (next?.object.content.type === 'pdf') {
      expect(next.object.content.page).toBe(9);
    }
    expect(next?.sublabel).toContain('page 9');
  });

  it('M: Continue Notebook focuses correct object id', () => {
    const nb = notebook('lecture-nb', { updatedAt: NOW - 60_000, subtitle: 'Week 3' });
    const next = deriveMissionControlContinue([nb], NOW);
    expect(next?.object.id).toBe('lecture-nb');
    expect(next?.sublabel).toMatch(/Notebook/);
  });
});

describe('surface isolation when Free Space inactive', () => {
  const inactiveCtx = buildCanvasScaleContext({
    zoom: 1,
    panX: 0,
    panY: 0,
    viewportW: 1200,
    viewportH: 800,
    objectCount: 4,
    surfaceActive: false,
  });

  const activeCtx = buildCanvasScaleContext({
    zoom: 1,
    panX: 0,
    panY: 0,
    viewportW: 1200,
    viewportH: 800,
    objectCount: 4,
    surfaceActive: true,
  });

  function pdfInput(overrides: Partial<BlockPolicyInput> = {}): BlockPolicyInput {
    return {
      id: 'pdf-1',
      kind: 'block',
      blockType: 'pdf',
      pos: { x: 0, y: 0, w: 480, h: 640 },
      selected: true,
      editing: false,
      inActiveCluster: true,
      relatedToSelection: false,
      dragging: false,
      ...overrides,
    };
  }

  it('I/J: inactive surface suspends PDF viewer without destroying PDF card', () => {
    const policy = getBlockRenderPolicy(inactiveCtx, pdfInput({ selected: true }));
    expect(policy.suspendHeavyContent).toBe(true);
    expect(policy.chromeOnly).toBe(false);
    expect(inactiveCtx.surfaceActive).toBe(false);
    expect(
      shouldSuspendPdfViewer(policy, {
        coarsePointer: true,
        inStudySession: false,
        surfaceActive: false,
      }),
    ).toBe(true);
  });

  it('J: notebook/sheet/image suspend on inactive surface (still chromeOnly)', () => {
    for (const blockType of ['notebook', 'sheet', 'image', 'studyfile'] as const) {
      const policy = getBlockRenderPolicy(inactiveCtx, pdfInput({ blockType, selected: true }));
      expect(policy.suspendHeavyContent).toBe(true);
      expect(policy.chromeOnly).toBe(true);
    }
  });

  it('K: active surface restores normal selected-PDF protection', () => {
    const policy = getBlockRenderPolicy(activeCtx, pdfInput({ selected: true }));
    expect(policy.suspendHeavyContent).toBe(false);
    expect(
      shouldSuspendPdfViewer(policy, {
        coarsePointer: false,
        inStudySession: false,
        surfaceActive: true,
      }),
    ).toBe(false);
  });

  it('I: Mission Control shell style is opaque + Free Space hidden skips paint', () => {
    const mc = surfaceShellStyle(true, { opaqueBackground: '#0a0f1a' });
    expect(mc.backgroundColor).toBe('#0a0f1a');
    expect(mc.visibility).toBe('visible');
    expect(mc.zIndex).toBe(2);

    const hiddenFs = surfaceShellStyle(false);
    expect(hiddenFs.visibility).toBe('hidden');
    expect(hiddenFs.contentVisibility).toBe('hidden');
    expect(hiddenFs.pointerEvents).toBe('none');
    expect(hiddenFs.zIndex).toBe(0);
  });
});
