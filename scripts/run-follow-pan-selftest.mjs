/**
 * Debug self-test for minimap follow-pan steering.
 * Run: node scripts/run-follow-pan-selftest.mjs
 */

const FOLLOW_PAN_VELOCITY_MUL = 1;
const FOLLOW_PAN_MINIMAP_GAIN = 6.25;
const FOLLOW_PAN_MAX_STEP_PX = 96;
const FOLLOW_PAN_ZONE_PADDING_PX = 20;
const FOLLOW_PAN_OUTSIDE_ZONE_MUL = 0.18;
const FOLLOW_PAN_OUTSIDE_FADE_PX = 88;
const MOVE_EPSILON_PX = 0.25;

function zoneGainForCursor(cursorX, cursorY, zone) {
  if (!zone) return 0;
  const pad = FOLLOW_PAN_ZONE_PADDING_PX;
  if (cursorX >= zone.left - pad && cursorX <= zone.right + pad &&
      cursorY >= zone.top - pad && cursorY <= zone.bottom + pad) return 1;
  return 0;
}

function followPanZoomBoost(zoom) {
  const z = Math.max(0.35, Math.min(2.5, zoom));
  return Math.min(3.2, Math.max(0.85, 1 / z));
}

function capDelta(dx, dy, maxStep) {
  const len = Math.hypot(dx, dy);
  if (len <= maxStep) return { dx, dy };
  const s = maxStep / len;
  return { dx: dx * s, dy: dy * s };
}

function computeFollowPanVelocity(input) {
  const rawDx = input.deltaX;
  const rawDy = input.deltaY;
  if (Math.hypot(rawDx, rawDy) <= MOVE_EPSILON_PX) return { dPanX: 0, dPanY: 0, gain: 0 };
  const gain = zoneGainForCursor(input.cursorX, input.cursorY, input.zone);
  if (gain <= 0) return { dPanX: 0, dPanY: 0, gain: 0 };
  const mul = FOLLOW_PAN_VELOCITY_MUL * gain * FOLLOW_PAN_MINIMAP_GAIN * followPanZoomBoost(input.zoom ?? 1);
  const { dx, dy } = capDelta(rawDx * mul, rawDy * mul, FOLLOW_PAN_MAX_STEP_PX);
  return { dPanX: -dx, dPanY: -dy, gain };
}

function runSelfTest() {
  const failures = [];
  const zone = { left: 700, top: 500, right: 868, bottom: 608 };
  const inside = computeFollowPanVelocity({ deltaX: 8, deltaY: 0, cursorX: 780, cursorY: 550, zone, zoom: 1 });
  if (!(inside.dPanX < -20 && inside.gain > 0.9)) failures.push('amplified drag should pan far');
  const outside = computeFollowPanVelocity({ deltaX: 8, deltaY: 0, cursorX: 200, cursorY: 200, zone });
  if (outside.dPanX !== 0) failures.push('outside zone no pan');
  return failures;
}

const failures = runSelfTest();
if (failures.length === 0) {
  console.log('follow-pan steering self-test: OK');
  process.exit(0);
}
console.error('FAILED:', failures);
process.exit(1);
