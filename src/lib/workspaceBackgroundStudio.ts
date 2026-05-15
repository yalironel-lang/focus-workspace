import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { GlobalTheme } from '../hooks/useWorkspaceTheme';
import type { CosmicBackdropConfig } from './cosmic/cosmicBackgroundTypes';
import { resolveCosmicBackdrop, type PresetCosmicProfile } from './cosmic/cosmicBackgroundEngine';
import { applyColorStudio, deriveCosmicSurfaceTokens } from './cosmic/cosmicColorStudio';
import { enforceReadableTokens } from './cosmic/livingContrast';
import { COSMIC_PROFILES, COSMIC_WORLD_PRESETS } from './cosmic/cosmicWorldPresets';
import type { WorkspaceClarity } from './workspaceClarity';
import { resolveWorkspaceClarity } from './workspaceClarity';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BackgroundPresetId =
  | 'deep-graphite'
  | 'warm-studio'
  | 'midnight-navy'
  | 'paper-dark'
  | 'research-lab'
  | 'minimal-light'
  | 'soft-sand'
  | 'arctic'
  | 'electric-blue'
  | 'observatory'
  | 'cosmic-dust'
  | 'aurora'
  | 'nebula-purple'
  | 'milky-way'
  | 'deep-space'
  | 'zodiac-chamber'
  | 'custom';

export type SurfaceLuminance = 'dark' | 'mid' | 'light';

export interface BackgroundPresetDefinition {
  id: BackgroundPresetId;
  name: string;
  description: string;
  emoji: string;
  luminance: SurfaceLuminance;
  accentHint: string;
  defaults: BackgroundPresetDefaults;
}

export interface BackgroundPresetDefaults {
  canvasBase: string;
  ambientGlow1: string;
  ambientGlow2: string;
  gridRgb: [number, number, number];
  gridOpacity: number;
  cardBg: string;
  cardBorderRgb: [number, number, number];
  cardBorderAlpha: number;
  wellBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textGhost: string;
  dividerAlpha: number;
  fogLevel: number;
  ambientIntensity: number;
  cardSolidity: number;
  spatialContrast: number;
  glowCap: number;
  vignetteMul: number;
  connectionMul: number;
  minimapContrast: number;
  gradientA?: string;
  gradientB?: string;
}

export interface ResolvedBackgroundStudio {
  presetId: BackgroundPresetId;
  luminance: SurfaceLuminance;
  canvasBase: string;
  tokens: AtmosphereTokens;
  canvasStyle: CSSProperties;
  clarity: WorkspaceClarity;
  connectionMul: number;
  minimapContrast: number;
  cosmic: CosmicBackdropConfig;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const BACKGROUND_STUDIO_PRESETS: BackgroundPresetDefinition[] = [
  {
    id: 'deep-graphite',
    name: 'Deep Graphite',
    description: 'Professional dark gray. Strong card readability. Best default.',
    emoji: '◼',
    luminance: 'dark',
    accentHint: '#94a3b8',
    defaults: {
      canvasBase: '#2a2a32',
      ambientGlow1: 'rgba(148,163,184,0.05)',
      ambientGlow2: 'rgba(100,116,139,0.04)',
      gridRgb: [148, 163, 184],
      gridOpacity: 0.11,
      cardBg: '#36363e',
      cardBorderRgb: [255, 255, 255],
      cardBorderAlpha: 0.1,
      wellBg: '#1f1f23',
      textPrimary: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      textGhost: '#64748b',
      dividerAlpha: 0.08,
      fogLevel: 0.12,
      ambientIntensity: 0.24,
      cardSolidity: 0.95,
      spatialContrast: 0.84,
      glowCap: 0.4,
      vignetteMul: 0.68,
      connectionMul: 1,
      minimapContrast: 0.88,
    },
  },
  {
    id: 'warm-studio',
    name: 'Warm Studio',
    description: 'Cozy study-room warmth with soft amber undertones.',
    emoji: '☀',
    luminance: 'dark',
    accentHint: '#f59e0b',
    defaults: {
      canvasBase: '#14100c',
      ambientGlow1: 'rgba(245,158,11,0.07)',
      ambientGlow2: 'rgba(180,100,20,0.05)',
      gridRgb: [200, 160, 110],
      gridOpacity: 0.1,
      cardBg: '#201b14',
      cardBorderRgb: [255, 200, 120],
      cardBorderAlpha: 0.14,
      wellBg: '#18140f',
      textPrimary: '#f5ede0',
      textSecondary: '#c0a889',
      textMuted: '#b89062',
      textGhost: '#94724b',
      dividerAlpha: 0.09,
      fogLevel: 0.22,
      ambientIntensity: 0.34,
      cardSolidity: 0.92,
      spatialContrast: 0.76,
      glowCap: 0.48,
      vignetteMul: 0.9,
      connectionMul: 0.95,
      minimapContrast: 0.85,
      gradientA: 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(245,158,11,0.06) 0%, transparent 68%)',
    },
  },
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    description: 'Deep navy with subtle blue glow. Excellent for focus.',
    emoji: '🌙',
    luminance: 'dark',
    accentHint: '#60a5fa',
    defaults: {
      canvasBase: '#0a1220',
      ambientGlow1: 'rgba(59,130,246,0.08)',
      ambientGlow2: 'rgba(30,64,175,0.06)',
      gridRgb: [96, 130, 180],
      gridOpacity: 0.12,
      cardBg: '#0f1829',
      cardBorderRgb: [120, 160, 220],
      cardBorderAlpha: 0.12,
      wellBg: '#0c1524',
      textPrimary: '#e8f0ff',
      textSecondary: '#a8bdd9',
      textMuted: '#7a94b8',
      textGhost: '#5a7294',
      dividerAlpha: 0.08,
      fogLevel: 0.24,
      ambientIntensity: 0.3,
      cardSolidity: 0.93,
      spatialContrast: 0.82,
      glowCap: 0.5,
      vignetteMul: 0.92,
      connectionMul: 1.05,
      minimapContrast: 0.9,
      gradientA: 'radial-gradient(ellipse 70% 50% at 22% 8%, rgba(59,130,246,0.1) 0%, transparent 62%)',
    },
  },
  {
    id: 'paper-dark',
    name: 'Paper Dark',
    description: 'Dark paper surface. Reduced neon. High text comfort.',
    emoji: '📄',
    luminance: 'mid',
    accentHint: '#d4c4a8',
    defaults: {
      canvasBase: '#1c1a17',
      ambientGlow1: 'rgba(212,196,168,0.04)',
      ambientGlow2: 'rgba(160,140,110,0.03)',
      gridRgb: [180, 165, 140],
      gridOpacity: 0.08,
      cardBg: '#25221d',
      cardBorderRgb: [220, 200, 170],
      cardBorderAlpha: 0.1,
      wellBg: '#1f1d19',
      textPrimary: '#f0ebe3',
      textSecondary: '#c9bfb0',
      textMuted: '#a89a88',
      textGhost: '#887a6a',
      dividerAlpha: 0.07,
      fogLevel: 0.16,
      ambientIntensity: 0.18,
      cardSolidity: 0.95,
      spatialContrast: 0.78,
      glowCap: 0.35,
      vignetteMul: 0.75,
      connectionMul: 0.92,
      minimapContrast: 0.86,
    },
  },
  {
    id: 'research-lab',
    name: 'Research Lab',
    description: 'Cool teal-gray. Analytical, clean, stronger grid.',
    emoji: '🔬',
    luminance: 'dark',
    accentHint: '#2dd4bf',
    defaults: {
      canvasBase: '#0f1618',
      ambientGlow1: 'rgba(45,212,191,0.06)',
      ambientGlow2: 'rgba(14,116,144,0.05)',
      gridRgb: [80, 160, 150],
      gridOpacity: 0.14,
      cardBg: '#141f22',
      cardBorderRgb: [100, 180, 170],
      cardBorderAlpha: 0.13,
      wellBg: '#111a1c',
      textPrimary: '#e8f4f2',
      textSecondary: '#9ec4be',
      textMuted: '#6fa39c',
      textGhost: '#4f827c',
      dividerAlpha: 0.09,
      fogLevel: 0.2,
      ambientIntensity: 0.28,
      cardSolidity: 0.93,
      spatialContrast: 0.88,
      glowCap: 0.45,
      vignetteMul: 0.88,
      connectionMul: 1.12,
      minimapContrast: 0.92,
      gradientA: 'radial-gradient(ellipse 65% 45% at 18% 12%, rgba(45,212,191,0.08) 0%, transparent 60%)',
    },
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'Off-white workspace with tuned dark cards and text.',
    emoji: '◻',
    luminance: 'light',
    accentHint: '#d97706',
    defaults: {
      canvasBase: '#f4f2ed',
      ambientGlow1: 'rgba(217,119,6,0.04)',
      ambientGlow2: 'rgba(120,113,108,0.03)',
      gridRgb: [120, 113, 108],
      gridOpacity: 0.14,
      cardBg: '#ffffff',
      cardBorderRgb: [60, 55, 50],
      cardBorderAlpha: 0.12,
      wellBg: '#ebe8e2',
      textPrimary: '#1a1814',
      textSecondary: '#44403c',
      textMuted: '#78716c',
      textGhost: '#a8a29e',
      dividerAlpha: 0.1,
      fogLevel: 0.12,
      ambientIntensity: 0.2,
      cardSolidity: 0.98,
      spatialContrast: 0.84,
      glowCap: 0.38,
      vignetteMul: 0.55,
      connectionMul: 1,
      minimapContrast: 0.9,
      gradientA: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(255,255,255,0.7) 0%, transparent 70%)',
    },
  },
  {
    id: 'soft-sand',
    name: 'Soft Sand',
    description: 'Beige study surface with warm cards and soft shadows.',
    emoji: '🏖',
    luminance: 'light',
    accentHint: '#b45309',
    defaults: {
      canvasBase: '#ebe4d6',
      ambientGlow1: 'rgba(180,130,70,0.06)',
      ambientGlow2: 'rgba(140,110,80,0.04)',
      gridRgb: [150, 130, 100],
      gridOpacity: 0.12,
      cardBg: '#f7f2e8',
      cardBorderRgb: [120, 100, 75],
      cardBorderAlpha: 0.14,
      wellBg: '#e0d8c8',
      textPrimary: '#2a241c',
      textSecondary: '#5c5044',
      textMuted: '#8a7a68',
      textGhost: '#b0a090',
      dividerAlpha: 0.11,
      fogLevel: 0.14,
      ambientIntensity: 0.22,
      cardSolidity: 0.96,
      spatialContrast: 0.8,
      glowCap: 0.36,
      vignetteMul: 0.5,
      connectionMul: 0.98,
      minimapContrast: 0.88,
      gradientA: 'radial-gradient(ellipse 80% 55% at 40% 0%, rgba(255,248,235,0.65) 0%, transparent 72%)',
    },
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Cool light gray-blue. Academic, minimal, strong separation.',
    emoji: '❄',
    luminance: 'light',
    accentHint: '#0284c7',
    defaults: {
      canvasBase: '#e8eef2',
      ambientGlow1: 'rgba(2,132,199,0.05)',
      ambientGlow2: 'rgba(100,116,139,0.04)',
      gridRgb: [100, 130, 160],
      gridOpacity: 0.13,
      cardBg: '#f8fafc',
      cardBorderRgb: [80, 110, 140],
      cardBorderAlpha: 0.12,
      wellBg: '#dce4ea',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      textGhost: '#94a3b8',
      dividerAlpha: 0.1,
      fogLevel: 0.12,
      ambientIntensity: 0.18,
      cardSolidity: 0.97,
      spatialContrast: 0.86,
      glowCap: 0.4,
      vignetteMul: 0.52,
      connectionMul: 1.04,
      minimapContrast: 0.91,
      gradientA: 'radial-gradient(ellipse 75% 50% at 70% 0%, rgba(255,255,255,0.55) 0%, transparent 68%)',
    },
  },
  {
    id: 'electric-blue',
    name: 'Electric Blue',
    description: 'Dark cyber workspace with controlled energetic glow.',
    emoji: '⚡',
    luminance: 'dark',
    accentHint: '#38bdf8',
    defaults: {
      canvasBase: '#0c1424',
      ambientGlow1: 'rgba(56,189,248,0.1)',
      ambientGlow2: 'rgba(37,99,235,0.07)',
      gridRgb: [56, 140, 220],
      gridOpacity: 0.13,
      cardBg: '#141e32',
      cardBorderRgb: [80, 160, 255],
      cardBorderAlpha: 0.14,
      wellBg: '#091220',
      textPrimary: '#e8f4ff',
      textSecondary: '#9ec8e8',
      textMuted: '#6aa8d4',
      textGhost: '#4a88b4',
      dividerAlpha: 0.09,
      fogLevel: 0.18,
      ambientIntensity: 0.32,
      cardSolidity: 0.94,
      spatialContrast: 0.86,
      glowCap: 0.48,
      vignetteMul: 0.72,
      connectionMul: 1.08,
      minimapContrast: 0.93,
      gradientA: 'radial-gradient(ellipse 60% 45% at 50% 0%, rgba(56,189,248,0.12) 0%, transparent 65%)',
      gradientB: 'radial-gradient(ellipse 50% 40% at 85% 90%, rgba(37,99,235,0.08) 0%, transparent 60%)',
    },
  },
];

export const BACKGROUND_STUDIO_PRESETS_ALL: BackgroundPresetDefinition[] = [
  ...BACKGROUND_STUDIO_PRESETS,
  ...COSMIC_WORLD_PRESETS,
];

const PRESET_BY_ID = Object.fromEntries(
  BACKGROUND_STUDIO_PRESETS_ALL.map(p => [p.id, p]),
) as Record<BackgroundPresetId, BackgroundPresetDefinition>;

// ── Color utilities ───────────────────────────────────────────────────────────

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function applyCanvasWarmth(hex: string, warmth: number): string {
  const rgb = parseHex(hex);
  if (!rgb || warmth === 0) return hex;
  const w = Math.max(-1, Math.min(1, warmth));
  return toHex(rgb.r + w * 18, rgb.g + w * 6, rgb.b - w * 14);
}

export function applyCanvasBrightness(hex: string, brightness: number): string {
  const rgb = parseHex(hex);
  if (!rgb || brightness === 0) return hex;
  const b = Math.max(-0.35, Math.min(0.35, brightness));
  const mix = b > 0 ? 255 : 0;
  const t = Math.abs(b);
  return toHex(
    rgb.r + (mix - rgb.r) * t,
    rgb.g + (mix - rgb.g) * t,
    rgb.b + (mix - rgb.b) * t,
  );
}

function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

// ── Legacy migration ──────────────────────────────────────────────────────────

type LegacyCanvasTone =
  | 'atmosphere'
  | 'deep-black'
  | 'charcoal'
  | 'navy'
  | 'warm-brown'
  | 'graphite'
  | 'blue-black'
  | 'soft-amber'
  | 'teal-dark'
  | 'custom';

const LEGACY_TONE_MAP: Record<LegacyCanvasTone, BackgroundPresetId> = {
  atmosphere: 'deep-graphite',
  'deep-black': 'deep-graphite',
  charcoal: 'deep-graphite',
  graphite: 'deep-graphite',
  navy: 'midnight-navy',
  'blue-black': 'midnight-navy',
  'warm-brown': 'warm-studio',
  'soft-amber': 'warm-studio',
  'teal-dark': 'research-lab',
  custom: 'custom',
};

export function resolveBackgroundPresetId(global: GlobalTheme): BackgroundPresetId {
  const g = global as GlobalTheme & { canvasTone?: LegacyCanvasTone };
  if (global.backgroundPreset) return global.backgroundPreset;
  if (g.canvasTone) return LEGACY_TONE_MAP[g.canvasTone] ?? 'deep-graphite';
  return 'deep-graphite';
}

/** Theme patch applied when user selects a curated background style. */
export function backgroundPresetThemePatch(id: BackgroundPresetId): Partial<GlobalTheme> {
  if (id === 'custom') {
    return { backgroundPreset: 'custom', activePreset: null };
  }
  const preset = PRESET_BY_ID[id];
  if (!preset) return { backgroundPreset: id };
  const d = preset.defaults;
  const cosmic = COSMIC_PROFILES[id];
  const patch: Partial<GlobalTheme> = {
    backgroundPreset: id,
    activePreset: null,
    fogLevel: d.fogLevel,
    ambientIntensity: d.ambientIntensity,
    cardSolidity: d.cardSolidity,
    spatialContrast: d.spatialContrast,
    gridVisible: d.gridOpacity > 0.04,
  };
  if (cosmic?.layers) {
    Object.assign(patch, cosmic.layers);
  }
  return patch;
}

// ── Custom derivation ─────────────────────────────────────────────────────────

function resolveDefaults(global: GlobalTheme, atm: AtmosphereTokens): BackgroundPresetDefaults {
  const presetId = resolveBackgroundPresetId(global);
  let d: BackgroundPresetDefaults;

  if (presetId === 'custom') {
    let base = global.canvasCustom || atm.pageBg || '#1a1a1e';
    const g = global as GlobalTheme & { canvasHue?: number; canvasSaturation?: number };
    base = applyColorStudio(base, {
      hue: g.canvasHue,
      saturation: g.canvasSaturation ?? 0.55,
      brightness: global.canvasBrightness ?? 0,
      warmth: global.canvasWarmth ?? 0,
    });
    d = {
      ...deriveCosmicSurfaceTokens(base, global.canvasAutoContrast !== false),
      canvasBase: base,
    };
  } else {
    const preset = PRESET_BY_ID[presetId] ?? PRESET_BY_ID['deep-graphite'];
    d = { ...preset.defaults };
    if (global.canvasAutoContrast !== false) {
      d = enforceReadableTokens(d);
    }
    d.canvasBase = applyCanvasWarmth(
      applyCanvasBrightness(d.canvasBase, global.canvasBrightness ?? 0),
      global.canvasWarmth ?? 0,
    );
    d.cardBg = applyCanvasWarmth(d.cardBg, (global.canvasWarmth ?? 0) * 0.35);
  }

  return d;
}

// ── Build canvas CSS + tokens ─────────────────────────────────────────────────

function scaleGlow(glow: string, factor: number): string {
  if (factor <= 0) return 'transparent';
  const m = glow.match(/rgba?\(([^)]+)\)/);
  if (!m) return glow;
  const parts = m[1].split(',').map(s => s.trim());
  if (parts.length < 4) return glow;
  const alpha = parseFloat(parts[3]) * factor;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${Math.min(1, alpha).toFixed(3)})`;
}

function buildCanvasStyle(
  d: BackgroundPresetDefaults,
  gridVisible: boolean,
  ambientMul: number,
  gridMul: number,
): CSSProperties {
  const gridOp = gridVisible ? d.gridOpacity * gridMul : 0;
  const dot =
    gridOp > 0
      ? `radial-gradient(circle, ${rgba(d.gridRgb, gridOp)} 1px, transparent 1px)`
      : null;

  const ambScale = Math.min(1.2, ambientMul * (d.ambientIntensity / 0.28));
  const amb1 = ambScale > 0.05 ? scaleGlow(d.ambientGlow1, ambScale) : null;
  const amb2 = ambScale > 0.05 && d.ambientGlow2 ? scaleGlow(d.ambientGlow2, ambScale * 0.85) : null;

  const layers = [dot, d.gradientA, d.gradientB, amb1, amb2].filter(
    (l): l is string => !!l && l !== 'transparent',
  );

  const sizes = layers.map((_, i) => (i === 0 && dot ? '32px 32px' : '100% 100%')).join(', ');
  const pos = layers.map((_, i) => (i === 0 && dot ? '16px 16px' : '0 0')).join(', ');

  return {
    backgroundColor: d.canvasBase,
    backgroundImage: layers.length ? layers.join(', ') : undefined,
    backgroundSize: layers.length ? sizes : undefined,
    backgroundPosition: layers.length ? pos : undefined,
  };
}

function mergeStudioTokens(
  atm: AtmosphereTokens,
  d: BackgroundPresetDefaults,
  luminance: SurfaceLuminance,
): AtmosphereTokens {
  const border = rgba(d.cardBorderRgb, d.cardBorderAlpha);
  const borderHover = rgba(
    d.cardBorderRgb,
    Math.min(0.42, d.cardBorderAlpha * 1.6),
  );

  return {
    ...atm,
    pageBg: d.canvasBase,
    navBg: atm.navBg,
    cardBg: d.cardBg,
    cardBorder: border,
    cardBorderHover: borderHover,
    wellBg: d.wellBg,
    textPrimary: d.textPrimary,
    textSecondary: d.textSecondary,
    textMuted: d.textMuted,
    textGhost: d.textGhost,
    divider: rgba(d.cardBorderRgb, d.dividerAlpha),
    ambientGlow1: d.ambientGlow1,
    ambientGlow2: d.ambientGlow2,
    shadowSm: luminance === 'light'
      ? '0 1px 2px rgba(0,0,0,0.06)'
      : atm.shadowSm,
    shadowMd: luminance === 'light'
      ? '0 4px 16px rgba(0,0,0,0.08)'
      : atm.shadowMd,
    shadowLg: luminance === 'light'
      ? '0 12px 32px rgba(0,0,0,0.1)'
      : atm.shadowLg,
    glowIntensity: Math.min(atm.glowIntensity, d.glowCap),
  };
}

function blendClarity(global: GlobalTheme, d: BackgroundPresetDefaults): WorkspaceClarity {
  const base = resolveWorkspaceClarity(global);
  const solid = global.cardSolidity ?? d.cardSolidity;
  return {
    ...base,
    fogMul: base.fogMul * d.vignetteMul,
    ambientMul: base.ambientMul * (0.85 + (global.ambientIntensity ?? d.ambientIntensity) * 0.45),
    glowCap: Math.min(base.glowCap, d.glowCap),
    gridMul: base.gridMul * (d.gridOpacity / 0.11),
    spatialContrast: (base.spatialContrast + (global.spatialContrast ?? d.spatialContrast)) / 2,
    cardAlphaHex: solid >= 0.94 ? 'ff' : solid >= 0.88 ? 'fa' : solid >= 0.78 ? 'f5' : base.cardAlphaHex,
  };
}

// Fix luminance on mergeStudioTokens - BackgroundPresetDefaults doesn't have luminance
// I'll get luminance from preset id in resolve function

export function resolveBackgroundStudio(
  global: GlobalTheme,
  atmTokens: AtmosphereTokens,
): ResolvedBackgroundStudio {
  const presetId = resolveBackgroundPresetId(global);
  const preset = PRESET_BY_ID[presetId];
  const luminance: SurfaceLuminance =
    presetId === 'custom'
      ? relativeLuminance(global.canvasCustom || '#1a1a1e') > 0.42
        ? 'light'
        : 'dark'
      : preset?.luminance ?? 'dark';

  const defaults = resolveDefaults(global, atmTokens);
  const clarity = blendClarity(global, defaults);
  const tokens = mergeStudioTokens(atmTokens, defaults, luminance);
  const canvasStyle = buildCanvasStyle(
    defaults,
    global.gridVisible ?? true,
    clarity.ambientMul,
    clarity.gridMul,
  );

  const cosmicProfile: PresetCosmicProfile | undefined = COSMIC_PROFILES[presetId];
  const cosmic = resolveCosmicBackdrop(
    global,
    defaults,
    cosmicProfile,
    cosmicProfile?.seed ?? presetId.length * 17,
  );

  return {
    presetId,
    luminance,
    canvasBase: defaults.canvasBase,
    tokens,
    canvasStyle,
    clarity,
    connectionMul: defaults.connectionMul,
    minimapContrast: defaults.minimapContrast,
    cosmic,
  };
}

// Re-export for backward compat
export function resolveCanvasBaseColor(global: GlobalTheme, tokens: AtmosphereTokens): string {
  return resolveBackgroundStudio(global, tokens).canvasBase;
}
