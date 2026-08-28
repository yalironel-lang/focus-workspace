/**
 * Regression: cloud-hydrated page ink must survive effect re-runs when cloud ids
 * settle or briefly flicker — must not repaint commit-blit with 0 strokes.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandwritingBlockData } from '../../lib/handwritingTypes';
import { getPageInkDebugSnapshot, resetPageInkDebugForTests } from '../../lib/handwritingPageInkDebug';
import { resetNotebookHandwritingStoreForTests } from '../../lib/notebookHandwritingStore';

const hydrateHandwritingWithCloud = vi.fn();
const reconcileHandwritingWithCloud = vi.fn();

vi.mock('../../lib/notebookHandwritingCloud', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/notebookHandwritingCloud')>();
  return {
    ...actual,
    hydrateHandwritingWithCloud: (...args: unknown[]) => hydrateHandwritingWithCloud(...args),
    reconcileHandwritingWithCloud: (...args: unknown[]) => reconcileHandwritingWithCloud(...args),
  };
});

const { HandwritingBlock } = await import('./HandwritingBlock');

const tokens = {
  textPrimary: '#1c1917',
  textMuted: '#78716c',
  accent: '#f59e0b',
} as const;

const ids = {
  userId: 'user-1',
  sectionId: 'sec-1',
  objectId: 'obj-1',
  blockKey: 'page-1787836295954-1',
};

function oneStrokeData(): HandwritingBlockData {
  return {
    type: 'handwriting',
    strokes: [
      {
        id: 'st-1',
        tool: 'pen',
        color: '#111',
        width: 2,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
      },
    ],
    canvas: { width: 600, height: 480 },
    updatedAt: 1_700_000_000_000,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountBlock(props: {
  userId?: string;
  sectionId?: string;
}): void {
  host = document.createElement('div');
  host.style.width = '640px';
  host.style.height = '520px';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(HandwritingBlock, {
        objectId: ids.objectId,
        blockKey: ids.blockKey,
        blockId: `__page-ink-${ids.blockKey}__`,
        userId: props.userId,
        sectionId: props.sectionId,
        tokens,
        pageLayout: true,
      }),
    );
  });
}

function rerenderBlock(props: { userId?: string; sectionId?: string }): void {
  act(() => {
    root!.render(
      createElement(HandwritingBlock, {
        objectId: ids.objectId,
        blockKey: ids.blockKey,
        blockId: `__page-ink-${ids.blockKey}__`,
        userId: props.userId,
        sectionId: props.sectionId,
        tokens,
        pageLayout: true,
      }),
    );
  });
}

async function flushHydrateAndPaint(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  resetNotebookHandwritingStoreForTests();
  resetPageInkDebugForTests();
  hydrateHandwritingWithCloud.mockReset();
  reconcileHandwritingWithCloud.mockReset();
  reconcileHandwritingWithCloud.mockResolvedValue({
    action: 'keep_local',
    data: oneStrokeData(),
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  localStorage.clear();
  resetNotebookHandwritingStoreForTests();
});

describe('HandwritingBlock cloud hydrate render race', () => {
  it('keeps 1 cloud stroke through cloud-id effect re-run and repaints 1 stroke', async () => {
    hydrateHandwritingWithCloud
      .mockResolvedValueOnce({ status: 'cloud_hit', data: oneStrokeData() })
      .mockResolvedValueOnce({ status: 'empty' });

    mountBlock({ userId: ids.userId, sectionId: ids.sectionId });
    await flushHydrateAndPaint();

    expect(hydrateHandwritingWithCloud).toHaveBeenCalledTimes(1);
    expect(getPageInkDebugSnapshot().memoryStrokeCount).toBe(1);
    expect(getPageInkDebugSnapshot().hydratedStrokeCount).toBe(1);
    expect(getPageInkDebugSnapshot().dataRefStrokeCountAfterHydrate).toBe(1);

    rerenderBlock({ userId: undefined, sectionId: ids.sectionId });
    await flushHydrateAndPaint();

    expect(hydrateHandwritingWithCloud).toHaveBeenCalledTimes(2);
    expect(getPageInkDebugSnapshot().memoryStrokeCount).toBe(1);
    expect(getPageInkDebugSnapshot().dataRefStrokeCountAfterHydrate).toBe(1);
  });

  it('waits for cloud ids before initializing empty page ink', async () => {
    hydrateHandwritingWithCloud
      .mockResolvedValueOnce({ status: 'empty' })
      .mockResolvedValueOnce({ status: 'cloud_hit', data: oneStrokeData() });

    mountBlock({});
    await flushHydrateAndPaint();

    expect(hydrateHandwritingWithCloud).toHaveBeenCalledTimes(1);
    expect(getPageInkDebugSnapshot().memoryStrokeCount).toBe(0);
    expect(getPageInkDebugSnapshot().hydratedStrokeCount).toBeNull();

    rerenderBlock({ userId: ids.userId, sectionId: ids.sectionId });
    await flushHydrateAndPaint();

    expect(hydrateHandwritingWithCloud).toHaveBeenCalledTimes(2);
    expect(getPageInkDebugSnapshot().memoryStrokeCount).toBe(1);
    expect(getPageInkDebugSnapshot().hydratedStrokeCount).toBe(1);
  });

  it('applies newer remote on remount reconcile and repaints updated strokes', async () => {
    const T1 = 1_000;
    const T2 = 2_000;
    const localData = { ...oneStrokeData(), updatedAt: T1 };
    const remoteData: HandwritingBlockData = {
      ...oneStrokeData(),
      strokes: [
        ...oneStrokeData().strokes,
        {
          id: 'st-2',
          tool: 'pen',
          color: '#111',
          width: 2,
          points: [
            { x: 0.5, y: 0.6 },
            { x: 0.7, y: 0.8 },
          ],
        },
      ],
      updatedAt: T2,
    };

    hydrateHandwritingWithCloud.mockResolvedValueOnce({ status: 'local_hit', data: localData });
    reconcileHandwritingWithCloud.mockResolvedValueOnce({
      action: 'apply_remote',
      data: remoteData,
    });

    mountBlock({ userId: ids.userId, sectionId: ids.sectionId });
    await flushHydrateAndPaint();

    expect(hydrateHandwritingWithCloud).toHaveBeenCalledTimes(1);
    expect(reconcileHandwritingWithCloud).toHaveBeenCalledTimes(1);
    expect(getPageInkDebugSnapshot().memoryStrokeCount).toBe(2);
  });
});
