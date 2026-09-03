/**
 * Free Space LOD policy — notebook suspension guards.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCanvasScaleContext,
  getBlockRenderPolicy,
  shouldSuspendPdfViewer,
  type BlockPolicyInput,
} from './freeSpaceScalePolicy';

function notebookInput(overrides: Partial<BlockPolicyInput>): BlockPolicyInput {
  return {
    id: 'nb-1',
    kind: 'block',
    blockType: 'notebook',
    pos: { x: 0, y: 0, w: 620, h: 520 },
    selected: false,
    editing: false,
    inActiveCluster: false,
    relatedToSelection: false,
    dragging: false,
    ...overrides,
  };
}

describe('freeSpaceScalePolicy notebook suspension', () => {
  const ctx = buildCanvasScaleContext({
    zoom: 0.35,
    panX: 0,
    panY: 0,
    viewportW: 1200,
    viewportH: 800,
    objectCount: 24,
  });

  it('C: active editor cannot enter suspended shell', () => {
    const policy = getBlockRenderPolicy(ctx, notebookInput({ editing: true }));
    expect(policy.suspendHeavyContent).toBe(false);
  });

  it('D: inactive notebook may suspend when off-viewport', () => {
    const policy = getBlockRenderPolicy(
      ctx,
      notebookInput({
        pos: { x: 8000, y: 8000, w: 620, h: 520 },
      }),
    );
    expect(policy.suspendHeavyContent).toBe(true);
  });

  it('selected notebook is protected from suspension', () => {
    const policy = getBlockRenderPolicy(
      ctx,
      notebookInput({
        selected: true,
        pos: { x: 8000, y: 8000, w: 620, h: 520 },
      }),
    );
    expect(policy.suspendHeavyContent).toBe(false);
  });
});

describe('freeSpaceScalePolicy surfaceActive suspension', () => {
  const inactive = buildCanvasScaleContext({
    zoom: 1,
    panX: 0,
    panY: 0,
    viewportW: 1200,
    viewportH: 800,
    objectCount: 4,
    surfaceActive: false,
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

  it('A: inactive PDF suspends heavy content (PdfJs must stay off)', () => {
    const policy = getBlockRenderPolicy(inactive, pdfInput({ selected: true }));
    expect(policy.suspendHeavyContent).toBe(true);
    expect(
      shouldSuspendPdfViewer(policy, {
        coarsePointer: true,
        inStudySession: false,
        surfaceActive: false,
      }),
    ).toBe(true);
  });

  it('B: inactive PDF keeps chromeOnly false (card stays mounted)', () => {
    const policy = getBlockRenderPolicy(inactive, pdfInput({ selected: true }));
    expect(policy.chromeOnly).toBe(false);
  });

  it('non-PDF heavy types still use chromeOnly when surface inactive', () => {
    for (const blockType of ['notebook', 'sheet', 'image'] as const) {
      const policy = getBlockRenderPolicy(inactive, pdfInput({ blockType, selected: true }));
      expect(policy.suspendHeavyContent).toBe(true);
      expect(policy.chromeOnly).toBe(true);
    }
  });

  it('defaults surfaceActive to true', () => {
    const ctx = buildCanvasScaleContext({
      zoom: 1,
      panX: 0,
      panY: 0,
      viewportW: 1200,
      viewportH: 800,
      objectCount: 2,
    });
    expect(ctx.surfaceActive).toBe(true);
  });
});
