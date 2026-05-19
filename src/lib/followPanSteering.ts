/**
 * Minimap follow-pan — amplified drag on the minimap drives canvas travel.
 * Pan is opposite to the direction arrow points (push-to-scroll).
 */

export interface FollowPanZone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FollowPanVelocityInput {
  /** Pointer delta since last frame (use movementX/Y when possible). */
  deltaX: number;
  deltaY: number;
  cursorX: number;
  cursorY: number;
  zone: FollowPanZone | null;
  zoom?: number;
  zonePaddingPx?: number;
  velocityMul?: number;
  maxStepPx?: number;
}

export interface FollowPanVelocityResult {
  dPanX: number;
  dPanY: number;
  gain: number;
  moveAngle: number | null;
  moving: boolean;
}

/** Base multiplier on pointer delta before minimap amplification. */
export const FOLLOW_PAN_VELOCITY_MUL = 1;
/** Small minimap drags → large canvas movement (remote-control feel). */
export const FOLLOW_PAN_MINIMAP_GAIN = 6.25;
export const FOLLOW_PAN_MAX_STEP_PX = 96;
export const FOLLOW_PAN_ZONE_PADDING_PX = 20;
export const FOLLOW_PAN_OUTSIDE_ZONE_MUL = 0.18;
export const FOLLOW_PAN_OUTSIDE_FADE_PX = 88;

const MOVE_EPSILON_PX = 0.25;

export function zoneGainForCursor(
  cursorX: number,
  cursorY: number,
  zone: FollowPanZone | null,
  paddingPx = FOLLOW_PAN_ZONE_PADDING_PX,
): number {
  if (!zone) return 0;
  const l = zone.left - paddingPx;
  const t = zone.top - paddingPx;
  const r = zone.right + paddingPx;
  const b = zone.bottom + paddingPx;
  if (cursorX >= l && cursorX <= r && cursorY >= t && cursorY <= b) {
    return 1;
  }
  const cx = (zone.left + zone.right) * 0.5;
  const cy = (zone.top + zone.bottom) * 0.5;
  const halfW = (zone.right - zone.left) * 0.5 + paddingPx;
  const halfH = (zone.bottom - zone.top) * 0.5 + paddingPx;
  const dx = Math.max(0, Math.abs(cursorX - cx) - halfW);
  const dy = Math.max(0, Math.abs(cursorY - cy) - halfH);
  const dist = Math.hypot(dx, dy);
  if (dist >= FOLLOW_PAN_OUTSIDE_FADE_PX) return 0;
  const tFade = 1 - dist / FOLLOW_PAN_OUTSIDE_FADE_PX;
  return FOLLOW_PAN_OUTSIDE_ZONE_MUL * tFade * tFade;
}

function capDelta(dx: number, dy: number, maxStep: number): { dx: number; dy: number } {
  const len = Math.hypot(dx, dy);
  if (len <= maxStep || len < 1e-6) return { dx, dy };
  const s = maxStep / len;
  return { dx: dx * s, dy: dy * s };
}

/** Zoomed in → slightly less screen pan; zoomed out → more (world-scale feel). */
export function followPanZoomBoost(zoom: number): number {
  const z = Math.max(0.35, Math.min(2.5, zoom));
  return Math.min(3.2, Math.max(0.85, 1 / z));
}

export function computeFollowPanVelocity(input: FollowPanVelocityInput): FollowPanVelocityResult {
  const rawDx = input.deltaX;
  const rawDy = input.deltaY;
  const moving = Math.hypot(rawDx, rawDy) > MOVE_EPSILON_PX;

  if (!moving) {
    return { dPanX: 0, dPanY: 0, gain: 0, moveAngle: null, moving: false };
  }

  const gain = zoneGainForCursor(
    input.cursorX,
    input.cursorY,
    input.zone,
    input.zonePaddingPx ?? FOLLOW_PAN_ZONE_PADDING_PX,
  );
  if (gain <= 0) {
    return {
      dPanX: 0,
      dPanY: 0,
      gain: 0,
      moveAngle: Math.atan2(rawDy, rawDx),
      moving: true,
    };
  }

  const zoomBoost = followPanZoomBoost(input.zoom ?? 1);
  const mul =
    (input.velocityMul ?? FOLLOW_PAN_VELOCITY_MUL) *
    gain *
    FOLLOW_PAN_MINIMAP_GAIN *
    zoomBoost;
  const maxStep = input.maxStepPx ?? FOLLOW_PAN_MAX_STEP_PX;
  const { dx, dy } = capDelta(rawDx * mul, rawDy * mul, maxStep);

  return {
    dPanX: -dx,
    dPanY: -dy,
    gain,
    moveAngle: Math.atan2(rawDy, rawDx),
    moving: true,
  };
}

export function runFollowPanSteeringSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const zone: FollowPanZone = { left: 700, top: 500, right: 868, bottom: 608 };

  const inside = computeFollowPanVelocity({
    deltaX: 8,
    deltaY: 0,
    cursorX: 780,
    cursorY: 550,
    zone,
    zoom: 1,
  });
  if (!(inside.dPanX < -20 && inside.gain > 0.9)) {
    failures.push('inside zone + drag right should pan far opposite (dPanX << 0)');
  }

  const outside = computeFollowPanVelocity({
    deltaX: 8,
    deltaY: 0,
    cursorX: 200,
    cursorY: 200,
    zone,
  });
  if (outside.dPanX !== 0 || outside.gain !== 0) {
    failures.push('far outside zone should not pan');
  }

  const still = computeFollowPanVelocity({
    deltaX: 0,
    deltaY: 0,
    cursorX: 780,
    cursorY: 550,
    zone,
  });
  if (still.moving || still.dPanX !== 0) failures.push('no movement → no pan');

  const cap = computeFollowPanVelocity({
    deltaX: 80,
    deltaY: 0,
    cursorX: 780,
    cursorY: 550,
    zone,
    maxStepPx: 24,
  });
  if (Math.hypot(cap.dPanX, cap.dPanY) > 24.01) failures.push('per-frame cap should limit step');

  return { ok: failures.length === 0, failures };
}
