/**
 * Opt-in drop-placement diagnostics (development only).
 * Enable in DevTools: window.__fwDropDebug = true
 */

import type { CanvasViewport } from './canvasCoordinates';
import { parseDisplayedTransform, readDisplayedViewport, readViewportFromGeometry } from './canvasCoordinates';

declare global {
  interface Window {
    __fwDropDebug?: boolean;
  }
}

export type DropSpawnKind = 'pdf' | 'image';

interface PendingRenderCheck {
  cursor: { x: number; y: number };
  viewportEl: HTMLElement;
  worldEl: HTMLElement | null;
  reactFallback: CanvasViewport;
}

let pendingRenderCheck: PendingRenderCheck | null = null;

export function dropPlacementDebugEnabled(): boolean {
  return import.meta.env.DEV && window.__fwDropDebug === true;
}

export function prepareDropRenderCheck(ctx: PendingRenderCheck): void {
  if (!dropPlacementDebugEnabled()) return;
  pendingRenderCheck = ctx;
}

export function logDropConversion(args: {
  clientX: number;
  clientY: number;
  viewportEl: HTMLElement;
  worldEl: HTMLElement | null;
  reactFallback: CanvasViewport;
  viewportUsed: CanvasViewport;
  worldX: number;
  worldY: number;
}): void {
  if (!dropPlacementDebugEnabled()) return;

  const viewportRect = args.viewportEl.getBoundingClientRect();
  const viewportFromString =
    args.worldEl?.style.transform && args.worldEl.style.transform !== 'none'
      ? parseDisplayedTransform(args.worldEl.style.transform)
      : null;
  const viewportFromGeometry =
    args.worldEl ? readViewportFromGeometry(args.viewportEl, args.worldEl) : null;

  console.info('[fw-drop] conversion', {
    cursor: { x: args.clientX, y: args.clientY },
    viewportLocal: {
      x: args.clientX - viewportRect.left,
      y: args.clientY - viewportRect.top,
    },
    reactFallback: args.reactFallback,
    fromString: viewportFromString,
    fromGeometry: viewportFromGeometry,
    used: args.viewportUsed,
    stringVsGeometry:
      viewportFromString && viewportFromGeometry
        ? {
            dPanX: viewportFromString.panX - viewportFromGeometry.panX,
            dPanY: viewportFromString.panY - viewportFromGeometry.panY,
            dZoom: viewportFromString.zoom - viewportFromGeometry.zoom,
          }
        : null,
    world: { x: args.worldX, y: args.worldY },
  });
}

export function logDropSpawn(args: {
  objectId: string;
  kind: DropSpawnKind;
  stored: { x: number; y: number; w: number; h: number };
  expectedCenterWorld: { x: number; y: number };
}): void {
  if (!dropPlacementDebugEnabled()) return;
  console.info('[fw-drop] stored', args);
}

export function scheduleDropRenderCheck(
  objectId: string,
  kind: DropSpawnKind,
  stored: { x: number; y: number; w: number; h: number },
): void {
  if (!dropPlacementDebugEnabled()) return;
  const ctx = pendingRenderCheck;
  if (!ctx) return;

  const cursor = { ...ctx.cursor };
  const viewportEl = ctx.viewportEl;
  const worldEl = ctx.worldEl;
  const reactFallback = ctx.reactFallback;

  const run = () => {
    const blockEl = document.querySelector<HTMLElement>(`[data-freeform-block="${objectId}"]`);
    if (!blockEl) return;

    const viewportRect = viewportEl.getBoundingClientRect();
    const viewportUsed = readDisplayedViewport(viewportEl, worldEl, reactFallback);
    const expectedCenterWorld = {
      x: stored.x + stored.w / 2,
      y: stored.y + stored.h / 2,
    };
    const z = viewportUsed.zoom > 0 ? viewportUsed.zoom : 1;
    const expectedCenterClient = {
      x: viewportRect.left + expectedCenterWorld.x * z + viewportUsed.panX,
      y: viewportRect.top + expectedCenterWorld.y * z + viewportUsed.panY,
    };
    const br = blockEl.getBoundingClientRect();
    const actualCenterClient = {
      x: br.left + br.width / 2,
      y: br.top + br.height / 2,
    };
    const dx = actualCenterClient.x - cursor.x;
    const dy = actualCenterClient.y - cursor.y;

    console.info('[fw-drop] render', {
      objectId,
      kind,
      cursor,
      stored,
      expectedCenterClient,
      actualCenterClient,
      errorPx: { dx, dy, distance: Math.hypot(dx, dy) },
      viewportUsed,
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}
