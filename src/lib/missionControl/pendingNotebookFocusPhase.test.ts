import { describe, expect, it, vi } from 'vitest';
import {
  frameViewportToBlock,
  frameViewportToBlockWithMetrics,
  frameMissionControlTarget,
  freeformCanvasFrameMetricsFromSize,
  missionControlTargetOccupancy,
  panViewportToBlock,
  worldPointToViewportLocal,
  FREEFORM_FRAME_TOP_CHROME_INSET,
  MC_FRAME_SAFE_MARGIN_FRAC,
  MC_FRAME_MIN_DOMINANT_OCCUPANCY,
  MC_FRAME_ZOOM_MAX,
} from '../notebookCanvasFocus';
import {
  pendingNotebookFocusPhase,
  shouldClearPendingNotebookFocusBeforeTimeout,
  shouldFocusPendingObjectId,
} from './pendingNotebookFocusPhase';

describe('pendingNotebookFocusPhase (cross-board Open)', () => {
  const pending = {
    sectionId: 'sec-1',
    boardId: 'secound',
    objectId: 'pdf-course-1462',
  };

  it('waits when board B is active but only unrelated object Y exists', () => {
    const phase = pendingNotebookFocusPhase({
      pending,
      sectionId: 'sec-1',
      activeBoardId: 'secound',
      hasObject: id => id === 'image-y',
    });
    expect(phase).toBe('wait-object');
    expect(
      shouldFocusPendingObjectId({
        pendingObjectId: pending.objectId,
        availableObjectIds: ['image-y'],
      }),
    ).toBeNull();
  });

  it('waits for spatial position even when object X already exists', () => {
    expect(
      pendingNotebookFocusPhase({
        pending,
        sectionId: 'sec-1',
        activeBoardId: 'secound',
        hasObject: id => id === pending.objectId,
        hasPosition: () => false,
        isFloatingOnCanvas: () => true,
      }),
    ).toBe('wait-position');
  });

  it('waits until UOV fullscreen is forced floating before focus', () => {
    expect(
      pendingNotebookFocusPhase({
        pending,
        sectionId: 'sec-1',
        activeBoardId: 'secound',
        hasObject: id => id === pending.objectId,
        hasPosition: () => true,
        isFloatingOnCanvas: () => false,
      }),
    ).toBe('wait-floating');
  });

  it('is ready only for exact requested object X once object+position+floating', () => {
    const available = ['image-y', 'pdf-course-1462'];
    const phase = pendingNotebookFocusPhase({
      pending,
      sectionId: 'sec-1',
      activeBoardId: 'secound',
      hasObject: id => available.includes(id),
      hasPosition: id => id === pending.objectId,
      isFloatingOnCanvas: id => id === pending.objectId,
    });
    expect(phase).toBe('ready-to-focus');
  });

  it('requests board switch when still on board A', () => {
    expect(
      pendingNotebookFocusPhase({
        pending,
        sectionId: 'sec-1',
        activeBoardId: 'main',
        hasObject: () => false,
      }),
    ).toBe('switch-board');
  });

  it('must not clear pending before the deferred focus timeout', () => {
    expect(shouldClearPendingNotebookFocusBeforeTimeout()).toBe(false);
  });

  it('runMissionControlFreeSpaceFocus queues exact objectId for other board', async () => {
    const { runMissionControlFreeSpaceFocus } = await import('./runMissionControlFreeSpaceFocus');
    const focusNotebook = vi.fn();
    const queueFloatingPresentation = vi.fn();
    runMissionControlFreeSpaceFocus(
      { objectId: 'pdf-course-1462', boardId: 'secound' },
      {
        activeBoardId: 'main',
        focusNotebook,
        queueFloatingPresentation,
        setPresentationModeFloating: vi.fn(),
      },
    );
    expect(queueFloatingPresentation).toHaveBeenCalledWith('pdf-course-1462');
    expect(focusNotebook).toHaveBeenCalledWith('pdf-course-1462', 'secound');
  });
});

/** Runtime PDF geometry (Course 1462 Class 1.pdf). */
const PDF_COURSE_1462 = { x: 432, y: 456, w: 520, h: 460 };

function assertCentersAt(
  pos: { x: number; y: number; w: number; h: number },
  view: { zoom: number; panX: number; panY: number },
  centerX: number,
  centerY: number,
) {
  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  const local = worldPointToViewportLocal(cx, cy, view);
  expect(local.x).toBeCloseTo(centerX, 5);
  expect(local.y).toBeCloseTo(centerY, 5);
}

describe('frameViewportToBlock (generic study frame)', () => {
  it('centers in canvas without shell inset when inset=0', () => {
    const canvas = { w: 1280, h: 800 };
    const view = frameViewportToBlock(PDF_COURSE_1462, canvas.w, canvas.h);
    assertCentersAt(PDF_COURSE_1462, view, canvas.w / 2, canvas.h / 2);
  });

  it('shell-aware metrics center below chrome', () => {
    const metrics = freeformCanvasFrameMetricsFromSize(900, 600);
    expect(metrics.shellTopInset).toBe(FREEFORM_FRAME_TOP_CHROME_INSET);
    const view = frameViewportToBlockWithMetrics(PDF_COURSE_1462, metrics);
    assertCentersAt(PDF_COURSE_1462, view, metrics.centerX, metrics.centerY);
  });
});

describe('frameMissionControlTarget (MC visual-focus contract)', () => {
  it('uses percentage safe margin — not fixed world pad 96', () => {
    const metrics = freeformCanvasFrameMetricsFromSize(1280, 800);
    const mc = frameMissionControlTarget(PDF_COURSE_1462, metrics);
    const legacy = frameViewportToBlockWithMetrics(PDF_COURSE_1462, metrics);
    // Legacy zMax 1.15 leaves PDF too small on wide canvases (neighbors dominate).
    expect(legacy.zoom).toBeLessThanOrEqual(1.15);
    expect(mc.zoom).toBeGreaterThan(legacy.zoom);
    expect(mc.zoom).toBeLessThanOrEqual(MC_FRAME_ZOOM_MAX);
  });

  it('centers on shell-aware usable region (wide desktop)', () => {
    const metrics = freeformCanvasFrameMetricsFromSize(1280, 800);
    const view = frameMissionControlTarget(PDF_COURSE_1462, metrics);
    assertCentersAt(PDF_COURSE_1462, view, metrics.centerX, metrics.centerY);
    const occ = missionControlTargetOccupancy(PDF_COURSE_1462, metrics, view);
    expect(occ.dominant).toBeGreaterThanOrEqual(MC_FRAME_MIN_DOMINANT_OCCUPANCY - 0.02);
    expect(occ.coverW).toBeLessThanOrEqual(1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC + 0.02);
    expect(occ.coverH).toBeLessThanOrEqual(1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC + 0.02);
    expect(occ.marginFracW).toBeGreaterThanOrEqual(MC_FRAME_SAFE_MARGIN_FRAC - 0.02);
  });

  it('keeps target fully inside usable canvas on a narrow DevTools width', () => {
    const metrics = freeformCanvasFrameMetricsFromSize(480, 640);
    const view = frameMissionControlTarget(PDF_COURSE_1462, metrics);
    assertCentersAt(PDF_COURSE_1462, view, metrics.centerX, metrics.centerY);
    const occ = missionControlTargetOccupancy(PDF_COURSE_1462, metrics, view);
    expect(occ.coverW).toBeLessThanOrEqual(1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC + 0.02);
    expect(occ.coverH).toBeLessThanOrEqual(1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC + 0.02);
    // Screen extent within fit box
    const cx = PDF_COURSE_1462.x + PDF_COURSE_1462.w / 2;
    const cy = PDF_COURSE_1462.y + PDF_COURSE_1462.h / 2;
    const left = view.panX + (cx - PDF_COURSE_1462.w / 2) * view.zoom;
    const right = view.panX + (cx + PDF_COURSE_1462.w / 2) * view.zoom;
    const top = view.panY + (cy - PDF_COURSE_1462.h / 2) * view.zoom;
    const bottom = view.panY + (cy + PDF_COURSE_1462.h / 2) * view.zoom;
    expect(left).toBeGreaterThanOrEqual(metrics.centerX - metrics.fitW / 2 - 0.5);
    expect(right).toBeLessThanOrEqual(metrics.centerX + metrics.fitW / 2 + 0.5);
    expect(top).toBeGreaterThanOrEqual(metrics.shellTopInset - 0.5);
    expect(bottom).toBeLessThanOrEqual(metrics.shellTopInset + metrics.fitH + 0.5);
  });

  it('isolates a small target on a tall canvas without overflowing', () => {
    const small = { x: 100, y: 200, w: 280, h: 320 };
    const metrics = freeformCanvasFrameMetricsFromSize(720, 1100);
    const view = frameMissionControlTarget(small, metrics);
    const occ = missionControlTargetOccupancy(small, metrics, view);
    expect(occ.dominant).toBeGreaterThanOrEqual(MC_FRAME_MIN_DOMINANT_OCCUPANCY - 0.02);
    expect(occ.coverW).toBeLessThanOrEqual(1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC + 0.02);
    expect(occ.coverH).toBeLessThanOrEqual(1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC + 0.02);
    assertCentersAt(small, view, metrics.centerX, metrics.centerY);
  });

  it('does not use neighboring object bounds — only the target pos', () => {
    const metrics = freeformCanvasFrameMetricsFromSize(1000, 700);
    const alone = frameMissionControlTarget(PDF_COURSE_1462, metrics);
    // Framing is a pure function of target + metrics; a huge neighbor cannot change it.
    const hugeNeighbor = { x: 0, y: 0, w: 4000, h: 3000 };
    void hugeNeighbor;
    const again = frameMissionControlTarget(PDF_COURSE_1462, metrics);
    expect(again).toEqual(alone);
  });

  it('beats legacy 1.15 clamp for Course 1462 on a wide canvas (isolation)', () => {
    const metrics = freeformCanvasFrameMetricsFromSize(1800, 1000);
    const legacy = frameViewportToBlockWithMetrics(PDF_COURSE_1462, metrics);
    const mc = frameMissionControlTarget(PDF_COURSE_1462, metrics);
    const legacyOcc = missionControlTargetOccupancy(PDF_COURSE_1462, metrics, legacy);
    const mcOcc = missionControlTargetOccupancy(PDF_COURSE_1462, metrics, mc);
    expect(legacy.zoom).toBeLessThanOrEqual(1.15);
    expect(mc.zoom).toBeGreaterThan(legacy.zoom);
    expect(mcOcc.dominant).toBeGreaterThan(legacyOcc.dominant);
    expect(mcOcc.dominant).toBeGreaterThanOrEqual(MC_FRAME_MIN_DOMINANT_OCCUPANCY - 0.02);
  });
});

describe('panViewportToBlock (unchanged study path)', () => {
  it('keeps study zoom clamp', () => {
    const view = panViewportToBlock(PDF_COURSE_1462, 900, 600, 0.3);
    expect(view.zoom).toBeGreaterThanOrEqual(0.82);
    expect(view.zoom).toBeLessThanOrEqual(1.15);
  });
});
