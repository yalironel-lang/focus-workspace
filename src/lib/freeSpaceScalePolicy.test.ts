/**
 * Free Space LOD policy — notebook suspension guards.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCanvasScaleContext,
  getBlockRenderPolicy,
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
