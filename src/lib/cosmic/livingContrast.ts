import { parseHex, toHex, rgbToHsl, hslToRgb } from './cosmicColorStudio';
import type { BackgroundPresetDefaults } from '../workspaceBackgroundStudio';

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Nudge foreground lightness until contrast meets target (WCAG-style). */
export function ensureContrast(fgHex: string, bgHex: string, target = 4.5): string {
  if (contrastRatio(fgHex, bgHex) >= target) return fgHex;
  const rgb = parseHex(fgHex);
  const bgLum = relativeLuminance(bgHex);
  if (!rgb) return fgHex;
  let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const wantLight = bgLum < 0.45;
  for (let i = 0; i < 48; i++) {
    const { r, g, b } = hslToRgb(h, s, l);
    const hex = toHex(r, g, b);
    if (contrastRatio(hex, bgHex) >= target) return hex;
    l = wantLight ? Math.min(0.98, l + 0.04) : Math.max(0.04, l - 0.04);
  }
  return wantLight ? '#f8fafc' : '#0f172a';
}

export interface ContrastReport {
  textPrimary: number;
  textMuted: number;
  cardOnCanvas: number;
  ok: boolean;
}

export function auditContrast(d: BackgroundPresetDefaults): ContrastReport {
  const textPrimary = contrastRatio(d.textPrimary, d.canvasBase);
  const textMuted = contrastRatio(d.textMuted, d.canvasBase);
  const cardOnCanvas = contrastRatio(d.textPrimary, d.cardBg);
  return {
    textPrimary,
    textMuted,
    cardOnCanvas,
    ok: textPrimary >= 4.2 && textMuted >= 3 && cardOnCanvas >= 4.2,
  };
}

/** Apply readable text/card tokens when auto-contrast is enabled. */
export function enforceReadableTokens(
  d: BackgroundPresetDefaults,
  autoContrast = true,
): BackgroundPresetDefaults {
  if (!autoContrast) return d;
  const lum = relativeLuminance(d.canvasBase);
  const isLight = lum > 0.42;

  let textPrimary = d.textPrimary;
  let textSecondary = d.textSecondary;
  let textMuted = d.textMuted;
  let textGhost = d.textGhost;
  let cardBg = d.cardBg;

  textPrimary = ensureContrast(textPrimary, d.canvasBase, 4.5);
  textMuted = ensureContrast(textMuted, d.canvasBase, 3);
  textSecondary = ensureContrast(textSecondary, d.canvasBase, 3.5);
  textGhost = ensureContrast(textGhost, d.canvasBase, 2.8);

  if (contrastRatio(textPrimary, cardBg) < 4.2) {
    cardBg = isLight
      ? mixHex(d.canvasBase, '#ffffff', 0.78)
      : mixHex(d.canvasBase, '#ffffff', lum > 0.18 ? 0.14 : 0.1);
    textPrimary = ensureContrast(textPrimary, cardBg, 4.5);
  }

  return {
    ...d,
    textPrimary,
    textSecondary,
    textMuted,
    textGhost,
    cardBg,
    fogLevel: Math.min(d.fogLevel, isLight ? 0.16 : 0.22),
    vignetteMul: Math.min(d.vignetteMul, isLight ? 0.55 : 0.82),
    gridOpacity: isLight ? Math.max(d.gridOpacity, 0.1) : d.gridOpacity,
  };
}

function mixHex(a: string, b: string, t: number): string {
  const c1 = parseHex(a);
  const c2 = parseHex(b);
  if (!c1 || !c2) return a;
  const u = Math.max(0, Math.min(1, t));
  return toHex(
    c1.r + (c2.r - c1.r) * u,
    c1.g + (c2.g - c1.g) * u,
    c1.b + (c2.b - c1.b) * u,
  );
}

/** Suggest accent from canvas hue. */
export function accentFromCanvas(baseHex: string): string {
  const rgb = parseHex(baseHex);
  if (!rgb) return '#60a5fa';
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const { r, g, b } = hslToRgb((h + 200) % 360, Math.min(0.75, s + 0.25), Math.min(0.62, l + 0.22));
  return toHex(r, g, b);
}
