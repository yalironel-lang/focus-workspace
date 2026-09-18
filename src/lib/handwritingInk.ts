/**
 * Production pen ink renderer (perfect-freehand).
 * Render-only — normalized stroke storage unchanged.
 */

import { getStroke } from 'perfect-freehand';
import type { HandwritingPoint, HandwritingStroke } from './handwritingTypes';

export type InkPresetId = 'math' | 'study';

/** Math workspace — corner-preserving, lighter weight. */
export const MATH_INK_PRESET = {
  sizeMultiplier: 1.08,
  thinning: 0.48,
  smoothing: 0.08,
  streamline: 0.06,
  defaultPressure: 0.5,
  minSizePx: 2,
} as const;

/**
 * Study notebook — dark, confident, legible at arm's length (Ink Pages).
 * Clarity-tuned: less smooth/streamline than presence pass to preserve letter separation.
 */
export const STUDY_INK_PRESET = {
  sizeMultiplier: 1.14,
  thinning: 0.42,
  smoothing: 0.18,
  streamline: 0.12,
  defaultPressure: 0.58,
  minSizePx: 2.5,
} as const;

/** Near-black pen on light study paper — not theme-muted UI text. */
export const STUDY_INK_COLOR = '#141416';

/** Light pen on dark study pages (Midnight / Aurora). */
export const STUDY_INK_COLOR_ON_DARK = 'rgba(248,250,252,0.92)';

export const STUDY_PEN_WIDTH = 3.0;

/**
 * Automatic pen colors historically written when no color picker existed.
 * Remap these at render time — never rewrite stored strokes.
 */
/**
 * Product has never shipped a handwriting color picker — every pen stroke is
 * automatic theme ink. These literals cover study ink + Free Space atmosphere
 * textPrimary values historically written into stroke.color.
 */
const AUTOMATIC_INK_LITERALS = new Set(
  [
    STUDY_INK_COLOR,
    STUDY_INK_COLOR_ON_DARK,
    '#1a1a1a',
    '#141416',
    '#1c1917',
    '#292524',
    '#000',
    '#000000',
    'rgba(0,0,0,1)',
    'rgb(0,0,0)',
    // TipTap / HW fallback + common light pens
    'rgba(255,248,235,0.92)',
    'rgba(255, 248, 235, 0.92)',
    'rgba(248,250,252,0.92)',
    'rgba(248, 250, 252, 0.92)',
    '#fff',
    '#ffffff',
    '#f8fafc',
    '#fff8eb',
    // Atmosphere textPrimary (useAtmosphere) historically used as pen ink
    '#f5ede0',
    '#e8e2f0',
    '#eeeae5',
    '#fef0da',
    '#e8e8e8',
    '#f0eeff',
    '#e6f0e8',
  ].map(s => s.toLowerCase().replace(/\s+/g, '')),
);

function normalizeColorKey(color: string): string {
  return color.trim().toLowerCase().replace(/\s+/g, '');
}

/** Approximate relative luminance 0–1 for hex/rgb/rgba. */
export function approximateCssColorLuminance(color: string): number | null {
  const channels = parseCssColorChannels(color);
  if (!channels) return null;
  return 0.2126 * toLin(channels.r) + 0.7152 * toLin(channels.g) + 0.0722 * toLin(channels.b);
}

export function isAutomaticHandwritingInkColor(color: string): boolean {
  return AUTOMATIC_INK_LITERALS.has(normalizeColorKey(color));
}

/**
 * Render-time ink only. Does not mutate persisted stroke.color.
 *
 * Product has no handwriting color picker — strokes are automatic theme ink.
 * Remap automatic theme literals + near-neutral contrast failures.
 * Saturated mid colors (if ever stored) are preserved.
 *
 * pageInk: 'dark' = dark text on light page; 'light' = light text on dark page.
 */
export function resolveHandwritingDisplayColor(
  storedColor: string,
  pageInk: 'dark' | 'light',
): string {
  const automaticDark = STUDY_INK_COLOR;
  const automaticLight = STUDY_INK_COLOR_ON_DARK;
  if (isAutomaticHandwritingInkColor(storedColor)) {
    return pageInk === 'dark' ? automaticDark : automaticLight;
  }
  const channels = parseCssColorChannels(storedColor);
  if (!channels) return storedColor;
  const { r, g, b } = channels;
  const lum = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  // Only auto-contrast near-neutral inks — keep saturated intentional colors.
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma > 48) return storedColor;
  if (pageInk === 'dark' && lum >= 0.72) return automaticDark;
  if (pageInk === 'light' && lum <= 0.28) return automaticLight;
  return storedColor;
}

function toLin(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parseCssColorChannels(
  color: string,
): { r: number; g: number; b: number } | null {
  const c = color.trim().toLowerCase();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3) {
      return {
        r: parseInt(h[0]! + h[0]!, 16),
        g: parseInt(h[1]! + h[1]!, 16),
        b: parseInt(h[2]! + h[2]!, 16),
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = c.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (!rgb) return null;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

export function defaultHandwritingInkColor(pageInk: 'dark' | 'light'): string {
  return pageInk === 'dark' ? STUDY_INK_COLOR : STUDY_INK_COLOR_ON_DARK;
}

export function readNotebookPageInkFromElement(
  el: Element | null | undefined,
): 'dark' | 'light' {
  const host = el?.closest?.('[data-nb-page-ink]');
  const v = host?.getAttribute('data-nb-page-ink');
  return v === 'light' ? 'light' : 'dark';
}

/**
 * Shallow display copy for paint only — never mutate persisted stroke.color.
 * Eraser strokes pass through unchanged.
 */
export function strokeForDisplay(
  stroke: HandwritingStroke,
  pageInk: 'dark' | 'light',
): HandwritingStroke {
  if (stroke.tool !== 'pen') return stroke;
  const color = resolveHandwritingDisplayColor(stroke.color, pageInk);
  return color === stroke.color ? stroke : { ...stroke, color };
}

export function strokesForDisplay(
  strokes: HandwritingStroke[],
  pageInk: 'dark' | 'light',
): HandwritingStroke[] {
  return strokes.map(s => strokeForDisplay(s, pageInk));
}

const INK_PRESETS = {
  math: MATH_INK_PRESET,
  study: STUDY_INK_PRESET,
} as const;

export function getInkPreset(id: InkPresetId) {
  return INK_PRESETS[id];
}

type InkPoint = [number, number, number];

function strokeToInkPoints(
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  defaultPressure: number,
): InkPoint[] {
  return stroke.points.map(p => {
    const pressure =
      p.pressure !== undefined && p.pressure > 0 ? p.pressure : defaultPressure;
    return [p.x * canvasW, p.y * canvasH, pressure];
  });
}

export function strokeHasRealPressure(stroke: HandwritingStroke): boolean {
  return stroke.points.some(p => p.pressure !== undefined && p.pressure > 0);
}

/** Shared scale for commit mesh and draft ink (same renderer in ink draft mode). */
export function commitStrokeSizePx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  preset: InkPresetId = 'math',
): number {
  const p = getInkPreset(preset);
  const baseSize = strokeWidth * (canvasW / Math.max(refWidth, 1));
  return Math.max(p.minSizePx, baseSize * p.sizeMultiplier);
}

function effectivePressure(p: HandwritingPoint | undefined, fallback = 0.5): number {
  if (p?.pressure !== undefined && p.pressure > 0) return p.pressure;
  return fallback;
}

/** Median mesh footprint at a given pressure — tuned to match committed ink width. */
export function draftPenLineWidthPx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  pressure?: number,
  preset: InkPresetId = 'math',
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth, preset);
  const p = pressure !== undefined && pressure > 0 ? pressure : 0.5;
  return Math.max(1.5, size * (0.78 + p * 0.44));
}

/**
 * Per-segment draft width — polyline rollback mode only.
 */
export function draftPenSegmentLineWidthPx(
  strokeWidth: number,
  canvasW: number,
  canvasH: number,
  refWidth: number,
  from: HandwritingPoint,
  to: HandwritingPoint,
  preset: InkPresetId = 'math',
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth, preset);
  const p = (effectivePressure(from) + effectivePressure(to)) / 2;
  const dist = Math.hypot((to.x - from.x) * canvasW, (to.y - from.y) * canvasH);
  const speedFactor = Math.max(0.82, Math.min(1.04, 1.0 - dist * 0.008));
  return Math.max(1.5, size * (0.78 + p * 0.44) * speedFactor);
}

function studyDotRadiusPx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  pressure: number,
  preset: InkPresetId,
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth, preset);
  return Math.max(preset === 'study' ? 1.35 : 1.15, size * (0.82 + pressure * 0.36)) / 2;
}

function inkPathFromOutline(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  const [first, ...rest] = outline;
  if (!first) return path;
  path.moveTo(first[0]!, first[1]!);
  for (const pt of rest) {
    path.lineTo(pt[0]!, pt[1]!);
  }
  path.closePath();
  return path;
}

function inkStrokeOptions(
  stroke: HandwritingStroke,
  size: number,
  preset: InkPresetId,
) {
  const p = getInkPreset(preset);
  const subtleTaper = preset === 'study';
  return {
    size,
    thinning: p.thinning,
    smoothing: p.smoothing,
    streamline: p.streamline,
    simulatePressure: !strokeHasRealPressure(stroke),
    last: true,
    start: subtleTaper ? { taper: 0.08, cap: true } : { taper: false, cap: true },
    end: subtleTaper ? { taper: 0.12, cap: true } : { taper: false, cap: true },
  } as const;
}

/**
 * Shared pen ink renderer — commit layer and live draft (stroke continuity).
 */
export function drawPenStrokeInk(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
  preset: InkPresetId = 'math',
): void {
  if (stroke.tool !== 'pen' || stroke.points.length === 0) return;

  const inkPreset = getInkPreset(preset);
  const inkPoints = strokeToInkPoints(
    stroke,
    canvasW,
    canvasH,
    inkPreset.defaultPressure,
  );
  const size = commitStrokeSizePx(stroke.width, canvasW, refWidth, preset);

  if (inkPoints.length === 1) {
    const pt = inkPoints[0]!;
    const r = studyDotRadiusPx(stroke.width, canvasW, refWidth, pt[2], preset);
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const outline = getStroke(inkPoints, inkStrokeOptions(stroke, size, preset));
  const path = inkPathFromOutline(outline);
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}

/** Math preset entry point (inline blocks, dev polyline compare). */
export function drawPenStrokeMathInk(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): void {
  drawPenStrokeInk(ctx, stroke, canvasW, canvasH, refWidth, 'math');
}

/** Commit uses perfect-freehand; live draft mode is controlled by fwInkDraftMode. */
export const drawDraftPenStrokeMathInk = drawPenStrokeMathInk;
