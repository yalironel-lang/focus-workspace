import type { BackgroundPresetDefaults } from '../workspaceBackgroundStudio';
import { enforceReadableTokens } from './livingContrast';

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

export function applyColorStudio(
  baseHex: string,
  opts: {
    hue?: number;
    saturation: number;
    brightness: number;
    warmth: number;
  },
): string {
  const rgb = parseHex(baseHex);
  if (!rgb) return baseHex;
  let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (opts.hue !== undefined) h = opts.hue;
  s = Math.max(0, Math.min(1, opts.saturation));
  l = Math.max(0.04, Math.min(0.96, l + opts.brightness));
  let { r, g, b } = hslToRgb(h, s, l);
  const w = opts.warmth;
  r += w * 18;
  g += w * 6;
  b -= w * 14;
  return toHex(r, g, b);
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

/** Full-spectrum custom base → safe surface tokens. */
export function deriveCosmicSurfaceTokens(
  baseHex: string,
  autoContrast = true,
): BackgroundPresetDefaults {
  const lum = relativeLuminance(baseHex);
  const isLight = lum > 0.42;
  const isMid = lum > 0.18 && lum <= 0.42;

  if (isLight) {
    const cardBg = mixHex(baseHex, '#ffffff', 0.72);
    const wellBg = mixHex(baseHex, '#000000', 0.06);
    const textPrimary = lum > 0.55 ? '#1a1814' : '#0f172a';
    return enforceReadableTokens({
      canvasBase: baseHex,
      ambientGlow1: 'rgba(0,0,0,0.03)',
      ambientGlow2: 'rgba(0,0,0,0.02)',
      gridRgb: [80, 75, 70],
      gridOpacity: 0.12,
      cardBg,
      cardBorderRgb: [40, 38, 35],
      cardBorderAlpha: 0.12,
      wellBg,
      textPrimary,
      textSecondary: mixHex(textPrimary, '#78716c', 0.45),
      textMuted: '#78716c',
      textGhost: '#a8a29e',
      dividerAlpha: 0.1,
      fogLevel: 0.12,
      ambientIntensity: 0.2,
      cardSolidity: 0.96,
      spatialContrast: 0.82,
      glowCap: 0.38,
      vignetteMul: 0.55,
      connectionMul: 1,
      minimapContrast: 0.9,
      gradientA: `radial-gradient(ellipse 85% 50% at 50% 0%, rgba(255,255,255,${lum > 0.5 ? '0.5' : '0.35'}) 0%, transparent 70%)`,
    }, autoContrast);
  }

  const cardLift = isMid ? 0.12 : 0.08;
  const cardBg = mixHex(baseHex, '#ffffff', cardLift);
  const wellBg = mixHex(baseHex, '#000000', 0.15);
  const { r, g, b } = parseHex(baseHex) ?? { r: 20, g: 20, b: 24 };

  return enforceReadableTokens({
    canvasBase: baseHex,
    ambientGlow1: `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 50)},0.06)`,
    ambientGlow2: `rgba(${r},${g},${b},0.04)`,
    gridRgb: [Math.min(255, r + 80), Math.min(255, g + 80), Math.min(255, b + 90)],
    gridOpacity: isMid ? 0.1 : 0.11,
    cardBg,
    cardBorderRgb: [255, 255, 255],
    cardBorderAlpha: isMid ? 0.11 : 0.1,
    wellBg,
    textPrimary: lum > 0.12 ? '#f1f5f9' : '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    textGhost: '#64748b',
    dividerAlpha: 0.08,
    fogLevel: 0.2,
    ambientIntensity: 0.26,
    cardSolidity: 0.93,
    spatialContrast: 0.78,
    glowCap: 0.44,
    vignetteMul: 0.85,
    connectionMul: 1,
    minimapContrast: 0.88,
  }, autoContrast);
}

export function hexToHue(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 220;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).h;
}
