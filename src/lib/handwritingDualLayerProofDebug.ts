/**
 * TEMP(iPad QA): diagnose proof badge visibility — remove with badge.
 * Console: window.__fwDualLayerProofDiag()
 */

import { getGitCommit } from './appBuildInfo';

export type DualLayerProofDiag = {
  gitCommit: string;
  expectedBadgeCommit: '76034e8';
  badgeFlagEnabled: boolean;
  badgeDomCount: number;
  badgeInViewport: boolean | null;
  badgeRect: { top: number; left: number; width: number; height: number } | null;
  badgeComputed: {
    display: string;
    visibility: string;
    opacity: string;
    zIndex: string;
  } | null;
  pageLayoutBlocks: number;
  pageLayoutMountCount: number;
  ancestorOverflow: Array<{ tag: string; overflow: string; overflowX: string; overflowY: string }>;
  inkCanvasWrapCount: number;
  serviceWorkerControlled: boolean;
  href: string;
  checkedAt: number;
};

let pageLayoutMountCount = 0;

export function recordPageLayoutHandwritingMount(blockId: string, pageLayout: boolean): void {
  if (!pageLayout) return;
  pageLayoutMountCount += 1;
  // #region agent log
  fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a618f3' },
    body: JSON.stringify({
      sessionId: 'a618f3',
      runId: 'badge-diag',
      hypothesisId: 'H2-H3',
      location: 'handwritingDualLayerProofDebug.ts:recordPageLayoutHandwritingMount',
      message: 'HandwritingBlock pageLayout mount',
      data: { blockId, pageLayoutMountCount, gitCommit: getGitCommit() },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function ancestorOverflowChain(el: Element | null, limit = 8): DualLayerProofDiag['ancestorOverflow'] {
  const out: DualLayerProofDiag['ancestorOverflow'] = [];
  let node: Element | null = el;
  while (node && out.length < limit) {
    const cs = getComputedStyle(node);
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      out.push({
        tag: node.tagName.toLowerCase(),
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
      });
    }
    node = node.parentElement;
  }
  return out;
}

export function getDualLayerProofDiag(badgeFlagEnabled: boolean): DualLayerProofDiag {
  const badgeEl = document.querySelector('[data-fw-dual-layer-proof]');
  const rect = badgeEl?.getBoundingClientRect();
  const inViewport =
    rect == null
      ? null
      : rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;

  const computed = badgeEl ? getComputedStyle(badgeEl) : null;

  return {
    gitCommit: getGitCommit(),
    expectedBadgeCommit: '76034e8',
    badgeFlagEnabled,
    badgeDomCount: document.querySelectorAll('[data-fw-dual-layer-proof]').length,
    badgeInViewport: inViewport,
    badgeRect: rect
      ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      : null,
    badgeComputed: computed
      ? {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          zIndex: computed.zIndex,
        }
      : null,
    pageLayoutBlocks: document.querySelectorAll('[data-fw-page-layout="1"]').length,
    pageLayoutMountCount,
    ancestorOverflow: ancestorOverflowChain(badgeEl),
    inkCanvasWrapCount: document.querySelectorAll('[data-fw-ink-canvas-wrap]').length,
    serviceWorkerControlled:
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? !!navigator.serviceWorker.controller
        : false,
    href: typeof window !== 'undefined' ? window.location.href : '',
    checkedAt: Date.now(),
  };
}

declare global {
  interface Window {
    __fwDualLayerProofDiag?: () => DualLayerProofDiag;
  }
}

export function registerDualLayerProofDiag(badgeFlagEnabled: boolean): () => DualLayerProofDiag {
  const fn = () => {
    const diag = getDualLayerProofDiag(badgeFlagEnabled);
    // #region agent log
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a618f3' },
      body: JSON.stringify({
        sessionId: 'a618f3',
        runId: 'badge-diag',
        hypothesisId: 'H1-H7',
        location: 'handwritingDualLayerProofDebug.ts:registerDualLayerProofDiag',
        message: 'dual layer proof diag dump',
        data: diag,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return diag;
  };
  if (typeof window !== 'undefined') {
    window.__fwDualLayerProofDiag = fn;
  }
  return fn;
}
