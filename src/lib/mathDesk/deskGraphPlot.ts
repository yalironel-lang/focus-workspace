import { safeEvaluateAtX } from '../safeMathExpr';

const W = 280;
const H = 160;
const PAD = 24;

function clampRange(xmin: number, xmax: number, ymin: number, ymax: number) {
  let xa = xmin;
  let xb = xmax;
  let ya = ymin;
  let yb = ymax;
  if (xb <= xa) xb = xa + 0.01;
  if (yb <= ya) yb = ya + 0.01;
  return { xmin: xa, xmax: xb, ymin: ya, ymax: yb };
}

function fitYToCurve(expression: string, xmin: number, xmax: number, steps: number) {
  let lo = Infinity;
  let hi = -Infinity;
  const dx = (xmax - xmin) / Math.max(2, steps - 1);
  for (let i = 0; i < steps; i++) {
    const x = xmin + dx * i;
    const r = safeEvaluateAtX(expression, x);
    if (!r.ok || !Number.isFinite(r.value)) continue;
    lo = Math.min(lo, r.value);
    hi = Math.max(hi, r.value);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const span = hi - lo;
  const pad = span > 1e-12 ? span * 0.12 : Math.max(Math.abs(lo), Math.abs(hi), 1) * 0.15 + 1e-6;
  return { ymin: lo - pad, ymax: hi + pad };
}

export function buildDeskGraphPath(
  expression: string,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
  steps = 240,
): string {
  const { xmin: xa, xmax: xb, ymin: ya, ymax: yb } = clampRange(xmin, xmax, ymin, ymax);
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const dx = (xb - xa) / Math.max(2, steps - 1);
  const parts: string[] = [];
  let penUp = true;
  let lastYp: number | null = null;
  const ySpan = yb - ya;
  const jump = ySpan * 0.35;

  for (let i = 0; i < steps; i++) {
    const x = xa + dx * i;
    const r = safeEvaluateAtX(expression, x);
    if (!r.ok) {
      penUp = true;
      lastYp = null;
      continue;
    }
    const y = r.value;
    if (!Number.isFinite(y)) {
      penUp = true;
      lastYp = null;
      continue;
    }
    const xp = PAD + ((x - xa) / (xb - xa)) * plotW;
    const yp = PAD + plotH - ((y - ya) / ySpan) * plotH;
    if (lastYp !== null && Math.abs(yp - lastYp) > jump) penUp = true;
    if (penUp) {
      parts.push(`M ${xp.toFixed(2)} ${yp.toFixed(2)}`);
      penUp = false;
    } else {
      parts.push(`L ${xp.toFixed(2)} ${yp.toFixed(2)}`);
    }
    lastYp = yp;
  }
  return parts.join(' ');
}

export function deskGraphViewBox() {
  return { w: W, h: H, pad: PAD };
}

export function defaultDeskGraphYRange(expression: string, xmin: number, xmax: number) {
  return fitYToCurve(expression, xmin, xmax, 64) ?? { ymin: -4, ymax: 8 };
}
