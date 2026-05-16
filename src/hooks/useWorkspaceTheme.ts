import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AtmosphereTokens } from './useAtmosphere';
import { resolveWorkspaceClarity, type FocusStrength, type WorkspaceClarity } from '../lib/workspaceClarity';
import type { BackgroundPresetId } from '../lib/workspaceBackgroundStudio';
import type { ConstellationId, ConstellationStyle } from '../lib/cosmic/cosmicBackgroundTypes';

export type { BackgroundPresetId };

export type { FocusStrength, WorkspaceClarity };

// ── Types ──────────────────────────────────────────────────────────────────────

export type AccentPreset    = 'amber' | 'violet' | 'cyan' | 'emerald' | 'rose' | 'blue' | 'custom';
export type BackgroundStyle = 'deep-night' | 'soft-gradient' | 'grid-canvas' | 'ambient-glow' | 'minimal-black' | 'warm-study';
export type SurfaceStyle    = 'glass' | 'solid' | 'soft-card' | 'floating' | 'borderless';
export type RadiusStyle     = 'sharp' | 'soft' | 'round' | 'ultra-round';
export type DensityStyle    = 'compact' | 'comfortable' | 'spacious';
export type GlowIntensity   = 'off' | 'low' | 'medium' | 'high';
export type MotionIntensity = 'minimal' | 'smooth' | 'expressive';
export type TypographyScale = 'small' | 'normal' | 'large';
export type BorderStyle     = 'default' | 'none' | 'accent' | 'glow';

export interface GlobalTheme {
  accentPreset:     AccentPreset;
  accentCustom:     string;
  backgroundStyle:  BackgroundStyle;
  surfaceStyle:     SurfaceStyle;
  radiusStyle:      RadiusStyle;
  density:          DensityStyle;
  glowIntensity:    GlowIntensity;
  motionIntensity:  MotionIntensity;
  typographyScale:  TypographyScale;
  gridVisible:      boolean;
  ambientIntensity: number; // 0–1
  /** 0 = clear workspace, 1 = cinematic edge fog */
  fogLevel:           number;
  focusStrength:      FocusStrength;
  /** 0–1 card surface opacity (1 = solid) */
  cardSolidity:       number;
  /** 0–1 edge/grid/connection legibility */
  spatialContrast:    number;
  /** Background Studio curated style */
  backgroundPreset: BackgroundPresetId;
  canvasCustom:       string;
  /** -1 cool … +1 warm tint on canvas base */
  canvasWarmth:       number;
  /** -0.35 … +0.35 lighten/darken canvas base */
  canvasBrightness:   number;
  /** 0–1 saturation (custom / color studio) */
  canvasSaturation:   number;
  /** 0–360 hue override (custom) */
  canvasHue?:         number;
  /** Enforce WCAG-readable text/cards on custom canvas */
  canvasAutoContrast?: boolean;
  starDensity?:              number;
  starBrightness?:           number;
  starScale?:                number;
  starTwinkle?:              number;
  constellationId?:          ConstellationId;
  constellationVisibility?:  number;
  constellationStyle?:       ConstellationStyle;
  constellationLineOpacity?: number;
  constellationStarScale?:   number;
  constellationLabels?:      boolean;
  nebulaIntensity?:          number;
  milkyWayIntensity?:        number;
  grainAmount?:              number;
  vignetteStrength?:         number;
  activePreset:       string | null;
  /** 0–1 living environment atmosphere strength */
  environmentIntensity?: number;
  /** Ambient environment motion (drift, breath, parallax) */
  environmentMotion?: boolean;
}

export interface ModuleTheme {
  customTitle?:  string;
  accentPreset?: AccentPreset;
  accentCustom?: string;
  surfaceStyle?: SurfaceStyle;
  opacity?:      number;    // 0.3–1
  glowEnabled?:  boolean;
  borderStyle?:  BorderStyle;
  pinned?:       boolean;
}

export interface ThemePreset {
  id:          string;
  name:        string;
  emoji:       string;
  description: string;
  theme:       Partial<GlobalTheme>;
}

// ── Accent palette ─────────────────────────────────────────────────────────────

export interface AccentEntry {
  color:  string;
  hover:  string;
  glow:   string;
  subtle: string;
}

export const ACCENT_PALETTE: Record<AccentPreset, AccentEntry> = {
  amber:   { color: '#f59e0b', hover: '#fbbf24', glow: 'rgba(245,158,11,0.35)',  subtle: 'rgba(245,158,11,0.12)'  },
  violet:  { color: '#8b5cf6', hover: '#a78bfa', glow: 'rgba(139,92,246,0.35)',  subtle: 'rgba(139,92,246,0.12)'  },
  cyan:    { color: '#06b6d4', hover: '#22d3ee', glow: 'rgba(6,182,212,0.35)',   subtle: 'rgba(6,182,212,0.12)'   },
  emerald: { color: '#10b981', hover: '#34d399', glow: 'rgba(16,185,129,0.35)',  subtle: 'rgba(16,185,129,0.12)'  },
  rose:    { color: '#f43f5e', hover: '#fb7185', glow: 'rgba(244,63,94,0.35)',   subtle: 'rgba(244,63,94,0.12)'   },
  blue:    { color: '#3b82f6', hover: '#60a5fa', glow: 'rgba(59,130,246,0.35)',  subtle: 'rgba(59,130,246,0.12)'  },
  custom:  { color: '#f59e0b', hover: '#fbbf24', glow: 'rgba(245,158,11,0.35)',  subtle: 'rgba(245,158,11,0.12)'  },
};

export const ACCENT_LABELS: Record<AccentPreset, string> = {
  amber: 'Amber', violet: 'Violet', cyan: 'Cyan',
  emerald: 'Emerald', rose: 'Rose', blue: 'Blue', custom: 'Custom',
};

// ── Design dimension tables ────────────────────────────────────────────────────

export const RADIUS_MAP: Record<RadiusStyle, number> = {
  sharp: 6, soft: 14, round: 22, 'ultra-round': 32,
};

export const DENSITY_MAP: Record<DensityStyle, { gap: number; pad: number; canvasPad: string }> = {
  compact:     { gap: 12, pad: 16, canvasPad: '24px 28px'  },
  comfortable: { gap: 20, pad: 22, canvasPad: '32px 40px'  },
  spacious:    { gap: 28, pad: 28, canvasPad: '40px 56px'  },
};

export const GLOW_MULT: Record<GlowIntensity, number> = {
  off: 0, low: 0.4, medium: 0.85, high: 1.5,
};

export const MOTION_MAP: Record<MotionIntensity, string> = {
  minimal:    '0.1s linear',
  smooth:     '0.25s cubic-bezier(0.32,0.72,0,1)',
  expressive: '0.45s cubic-bezier(0.34,1.56,0.64,1)',
};

export const TYPO_MAP: Record<TypographyScale, { base: number; label: number; heading: number }> = {
  small:  { base: 11, label: 9,  heading: 14 },
  normal: { base: 13, label: 10, heading: 16 },
  large:  { base: 15, label: 11, heading: 20 },
};

export const SURFACE_LABELS: Record<SurfaceStyle, string> = {
  glass: 'Glass', solid: 'Solid', 'soft-card': 'Soft', floating: 'Float', borderless: 'None',
};

export const RADIUS_LABELS: Record<RadiusStyle, string> = {
  sharp: 'Sharp', soft: 'Soft', round: 'Round', 'ultra-round': 'Ultra',
};

export const BG_META: Record<BackgroundStyle, { name: string; emoji: string }> = {
  'deep-night':    { name: 'Deep Night',    emoji: '🌑' },
  'soft-gradient': { name: 'Gradient',      emoji: '🌊' },
  'grid-canvas':   { name: 'Grid Canvas',   emoji: '⊞'  },
  'ambient-glow':  { name: 'Ambient Glow',  emoji: '✦'  },
  'minimal-black': { name: 'Minimal',       emoji: '◼'  },
  'warm-study':    { name: 'Warm Study',    emoji: '☀️' },
};

// ── Theme presets ──────────────────────────────────────────────────────────────

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'neural-dark', name: 'Neural Dark', emoji: '🌑',
    description: 'Deep navy, amber signals',
    theme: { accentPreset: 'amber', backgroundStyle: 'ambient-glow', surfaceStyle: 'glass',
             radiusStyle: 'soft', density: 'comfortable', glowIntensity: 'medium',
             motionIntensity: 'smooth', typographyScale: 'normal', gridVisible: true, ambientIntensity: 0.6 },
  },
  {
    id: 'calm-study', name: 'Calm Study', emoji: '🌊',
    description: 'Ocean tones, spacious rhythm',
    theme: { accentPreset: 'cyan', backgroundStyle: 'soft-gradient', surfaceStyle: 'soft-card',
             radiusStyle: 'round', density: 'spacious', glowIntensity: 'low',
             motionIntensity: 'smooth', typographyScale: 'normal', gridVisible: false, ambientIntensity: 0.4 },
  },
  {
    id: 'exam-mode', name: 'Exam Mode', emoji: '⚡',
    description: 'High contrast, zero distraction',
    theme: { accentPreset: 'rose', backgroundStyle: 'minimal-black', surfaceStyle: 'solid',
             radiusStyle: 'sharp', density: 'compact', glowIntensity: 'off',
             motionIntensity: 'minimal', typographyScale: 'small', gridVisible: false, ambientIntensity: 0 },
  },
  {
    id: 'deep-focus', name: 'Deep Focus', emoji: '🔮',
    description: 'Violet depth, expressive motion',
    theme: { accentPreset: 'violet', backgroundStyle: 'deep-night', surfaceStyle: 'floating',
             radiusStyle: 'soft', density: 'comfortable', glowIntensity: 'high',
             motionIntensity: 'expressive', typographyScale: 'normal', gridVisible: true, ambientIntensity: 0.8 },
  },
  {
    id: 'creative-flow', name: 'Creative Flow', emoji: '🌿',
    description: 'Emerald energy, rounded shapes',
    theme: { accentPreset: 'emerald', backgroundStyle: 'warm-study', surfaceStyle: 'glass',
             radiusStyle: 'ultra-round', density: 'spacious', glowIntensity: 'medium',
             motionIntensity: 'expressive', typographyScale: 'large', gridVisible: false, ambientIntensity: 0.5 },
  },
  {
    id: 'minimal-zen', name: 'Minimal Zen', emoji: '◯',
    description: 'No decoration, pure focus',
    theme: { accentPreset: 'blue', backgroundStyle: 'minimal-black', surfaceStyle: 'borderless',
             radiusStyle: 'round', density: 'comfortable', glowIntensity: 'off',
             motionIntensity: 'minimal', typographyScale: 'normal', gridVisible: false, ambientIntensity: 0 },
  },
  {
    id: 'morning-light', name: 'Morning Light', emoji: '☀️',
    description: 'Warm amber, generous spacing',
    theme: { accentPreset: 'amber', backgroundStyle: 'warm-study', surfaceStyle: 'soft-card',
             radiusStyle: 'ultra-round', density: 'spacious', glowIntensity: 'low',
             motionIntensity: 'smooth', typographyScale: 'large', gridVisible: false, ambientIntensity: 0.6 },
  },
  {
    id: 'personal-studio', name: 'Personal Studio', emoji: '🎨',
    description: 'Warm, open, personal canvas',
    theme: { accentPreset: 'amber', backgroundStyle: 'warm-study', surfaceStyle: 'soft-card',
             radiusStyle: 'round', density: 'comfortable', glowIntensity: 'low',
             motionIntensity: 'smooth', typographyScale: 'normal', gridVisible: false, ambientIntensity: 0.45 },
  },
  {
    id: 'soft-light', name: 'Soft Light', emoji: '🌸',
    description: 'Gentle rose, airy surfaces',
    theme: { accentPreset: 'rose', backgroundStyle: 'soft-gradient', surfaceStyle: 'floating',
             radiusStyle: 'ultra-round', density: 'spacious', glowIntensity: 'low',
             motionIntensity: 'expressive', typographyScale: 'normal', gridVisible: false, ambientIntensity: 0.5 },
  },
];

// ── Computed design token shape ────────────────────────────────────────────────

export interface DesignTokens {
  accent:       string;
  accentHover:  string;
  accentGlow:   string;
  accentSubtle: string;
  radius:       number;
  gap:          number;
  modulePad:    number;
  canvasPad:    string;
  transition:   string;
  basePx:       number;
  labelPx:      number;
  headingPx:    number;
  glowMult:     number;
  surfaceStyle: SurfaceStyle;
  bgStyle:      BackgroundStyle;
  gridVisible:  boolean;
  ambientInt:   number;
  clarity:      WorkspaceClarity;
  focusStrength: FocusStrength;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_THEME: GlobalTheme = {
  accentPreset:     'amber',
  accentCustom:     '#f59e0b',
  backgroundStyle:  'warm-study',
  surfaceStyle:     'solid',
  radiusStyle:      'round',
  density:          'comfortable',
  glowIntensity:    'low',
  motionIntensity:  'smooth',
  typographyScale:  'normal',
  gridVisible:      true,
  ambientIntensity: 0.32,
  fogLevel:           0.24,
  focusStrength:      'soft',
  cardSolidity:       0.92,
  spatialContrast:    0.76,
  backgroundPreset:   'deep-graphite',
  canvasCustom:       '#1a1a1e',
  canvasWarmth:       0,
  canvasBrightness:   0,
  canvasSaturation:   0.55,
  canvasAutoContrast: true,
  starDensity:        0.12,
  constellationVisibility: 0,
  constellationStyle: 'minimal',
  activePreset:     'warm-studio',
  environmentIntensity: 0.72,
  environmentMotion:    true,
};

const GLOBAL_KEY  = 'fw_workspace_theme_v1';
const MODULES_KEY = 'fw_module_themes_v1';

// ── Scale rgba alpha ───────────────────────────────────────────────────────────

function scaleAlpha(rgba: string, factor: number): string {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return rgba;
  const a = parseFloat(m[4] ?? '1') * factor;
  return `rgba(${m[1]},${m[2]},${m[3]},${Math.min(a, 1).toFixed(3)})`;
}

// ── Compute design tokens ─────────────────────────────────────────────────────

export function computeDesignTokens(g: GlobalTheme): DesignTokens {
  let a: AccentEntry;
  if (g.accentPreset === 'custom') {
    const hex = g.accentCustom;
    // Parse hex → rgba for glow
    const r = parseInt(hex.slice(1, 3), 16);
    const gr = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    a = {
      color:  hex,
      hover:  hex,
      glow:   `rgba(${r},${gr},${b},0.35)`,
      subtle: `rgba(${r},${gr},${b},0.12)`,
    };
  } else {
    a = ACCENT_PALETTE[g.accentPreset];
  }
  const d = DENSITY_MAP[g.density];
  const t = TYPO_MAP[g.typographyScale];
  return {
    accent:      a.color,
    accentHover: a.hover,
    accentGlow:  a.glow,
    accentSubtle: a.subtle,
    radius:      RADIUS_MAP[g.radiusStyle],
    gap:         d.gap,
    modulePad:   d.pad,
    canvasPad:   d.canvasPad,
    transition:  MOTION_MAP[g.motionIntensity],
    basePx:      t.base,
    labelPx:     t.label,
    headingPx:   t.heading,
    glowMult:    GLOW_MULT[g.glowIntensity],
    surfaceStyle: g.surfaceStyle,
    bgStyle:     g.backgroundStyle,
    gridVisible: g.gridVisible,
    ambientInt:  g.ambientIntensity,
    clarity:     resolveWorkspaceClarity(g),
    focusStrength: g.focusStrength ?? 'soft',
  };
}

// ── Merge accent overrides into AtmosphereTokens ──────────────────────────────

function boostBorder(border: string, factor: number): string {
  const m = border.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return border;
  const a = Math.min(0.42, parseFloat(m[4] ?? '0.12') * factor);
  return `rgba(${m[1]},${m[2]},${m[3]},${a.toFixed(3)})`;
}

export function mergeAccent(tokens: AtmosphereTokens, dt: DesignTokens): AtmosphereTokens {
  const c = dt.clarity;
  const borderBoost = 1 + c.spatialContrast * 0.35;
  const glowCap = c.glowCap;
  return {
    ...tokens,
    accent:      dt.accent,
    accentHover: dt.accentHover,
    accentGlow:  scaleAlpha(dt.accentGlow, glowCap),
    accentSubtle: dt.accentSubtle,
    radius:      dt.radius,
    focusBorder: dt.accent,
    cardBorder: boostBorder(tokens.cardBorder, borderBoost),
    cardBorderHover: boostBorder(tokens.cardBorderHover, borderBoost * 1.08),
    textGhost: tokens.textGhost,
    textMuted: tokens.textMuted,
    glowIntensity: Math.min(tokens.glowIntensity, glowCap),
  };
}

/** Opaque card background for project surfaces (avoids muddy stacking). */
export function solidCardBackground(cardBg: string, clarity?: WorkspaceClarity): string {
  const hex = cardBg.startsWith('#') && cardBg.length === 7 ? cardBg : cardBg;
  if (hex.startsWith('#') && hex.length === 7) {
    return `${hex}${clarity?.cardAlphaHex ?? 'fa'}`;
  }
  return cardBg;
}

// ── Compute surface CSS for a module ─────────────────────────────────────────

export function computeSurface(
  surfaceStyle: SurfaceStyle,
  tokens: AtmosphereTokens,
  dt: DesignTokens,
  opts: {
    accent?:      string;
    accentGlow?:  string;
    glowEnabled?: boolean;
    borderStyle?: BorderStyle;
  } = {},
): React.CSSProperties {
  const acc      = opts.accent     ?? dt.accent;
  const glow     = opts.accentGlow ?? dt.accentGlow;
  const gm       = dt.glowMult;
  const r        = dt.radius;
  const blurPx   = tokens.blur;
  const hasGlow  = (opts.glowEnabled ?? true) && gm > 0;

  const glowStr = hasGlow
    ? `0 0 ${Math.round(24 * gm)}px ${scaleAlpha(glow, 0.5 * gm)}`
    : null;

  const bdr = opts.borderStyle ?? 'default';
  const border =
    bdr === 'none'   ? '1px solid transparent' :
    bdr === 'accent' ? `1px solid ${acc}60` :
    bdr === 'glow'   ? `1px solid ${glow}` :
    `1px solid ${tokens.cardBorder}`;

  // Inner top-edge highlight for depth
  const innerHighlight = 'inset 0 1px 0 rgba(255,255,255,0.05)';

  const baseShadow = (s: string) => {
    const parts = [s, innerHighlight];
    if (glowStr) parts.push(glowStr);
    return parts.join(', ');
  };

  switch (surfaceStyle) {
    case 'glass':
      return {
        backgroundColor:      `${tokens.cardBg}f5`,
        backdropFilter:       `blur(${Math.max(blurPx, 12)}px)`,
        WebkitBackdropFilter: `blur(${Math.max(blurPx, 12)}px)`,
        border,
        borderRadius: `${r}px`,
        boxShadow: baseShadow('0 4px 20px rgba(0,0,0,0.36)'),
      };
    case 'solid':
      return {
        backgroundColor: tokens.cardBg,
        border,
        borderRadius: `${r}px`,
        boxShadow: baseShadow('0 2px 12px rgba(0,0,0,0.5)'),
      };
    case 'soft-card':
      return {
        backgroundColor:      tokens.cardBg,
        border,
        borderRadius: `${r}px`,
        // Soft elevation with inner highlight
        boxShadow: baseShadow('0 6px 22px rgba(0,0,0,0.30)'),
      };
    case 'floating':
      return {
        backgroundColor:      tokens.cardBg,
        backdropFilter:       `blur(${Math.max(blurPx, 20)}px)`,
        WebkitBackdropFilter: `blur(${Math.max(blurPx, 20)}px)`,
        border:    bdr === 'default' ? `1px solid ${tokens.cardBorderHover}` : border,
        borderRadius: `${r}px`,
        // Strong lift with inner highlight
        boxShadow: baseShadow('0 14px 42px rgba(0,0,0,0.48), 0 2px 8px rgba(0,0,0,0.32)'),
      };
    case 'borderless':
      return {
        backgroundColor:      `${tokens.cardBg}f2`,
        backdropFilter:       'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border:       '1px solid transparent',
        borderRadius: `${r}px`,
        boxShadow:    glowStr ? `${glowStr}, ${innerHighlight}` : innerHighlight,
      };
    default:
      return {
        backgroundColor: tokens.cardBg,
        border,
        borderRadius: `${r}px`,
      };
  }
}

// ── Compute canvas background ─────────────────────────────────────────────────

export function computeCanvasBg(
  dt: DesignTokens,
  tokens: AtmosphereTokens,
  inDesignMode: boolean,
  canvasBase?: string,
): React.CSSProperties {
  const page = canvasBase ?? tokens.pageBg;
  const gridOp  = dt.gridVisible ? (inDesignMode ? 0.14 : 0.055) : 0;
  const dotColor = gridOp > 0
    ? `rgba(${tokens.cardBorder.startsWith('#')
        ? parseInt(tokens.cardBorder.slice(1,3),16)+','+parseInt(tokens.cardBorder.slice(3,5),16)+','+parseInt(tokens.cardBorder.slice(5,7),16)
        : '100,120,160'},${gridOp})`
    : 'transparent';
  const gridDot  = `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`;
  const gridSize = '32px 32px';
  const gridPos  = '16px 16px';
  const amb      = dt.ambientInt;

  switch (dt.bgStyle) {
    case 'deep-night': {
      const layers = [
        gridOp > 0 ? gridDot : null,
        amb > 0 ? `radial-gradient(ellipse 80% 50% at 20% 0%, ${scaleAlpha(tokens.ambientGlow1, amb * 4)}, transparent)` : null,
        amb > 0 ? `radial-gradient(ellipse 60% 40% at 80% 100%, ${scaleAlpha(tokens.ambientGlow2, amb * 4)}, transparent)` : null,
      ].filter(Boolean) as string[];
      const sizes = [gridOp > 0 ? gridSize : null, '100% 100%', '100% 100%'].filter(Boolean).join(', ');
      const pos   = [gridOp > 0 ? gridPos  : null, '0 0', '0 0'].filter(Boolean).join(', ');
      return { backgroundColor: page, backgroundImage: layers.join(', '), backgroundSize: sizes, backgroundPosition: pos };
    }
    case 'soft-gradient': {
      const layers = [
        gridOp > 0 ? gridDot : null,
        `radial-gradient(ellipse 100% 55% at 50% 0%, ${scaleAlpha(dt.accentSubtle, 2)}, transparent 70%)`,
      ].filter(Boolean) as string[];
      const sizes = [gridOp > 0 ? gridSize : null, '100% 100%'].filter(Boolean).join(', ');
      const pos   = [gridOp > 0 ? gridPos  : null, '0 0'].filter(Boolean).join(', ');
      return { backgroundColor: page, backgroundImage: layers.join(', '), backgroundSize: sizes, backgroundPosition: pos };
    }
    case 'grid-canvas':
      return {
        backgroundColor: page,
        backgroundImage: [
          `linear-gradient(${tokens.cardBorder}55 1px, transparent 1px)`,
          `linear-gradient(90deg, ${tokens.cardBorder}55 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: '40px 40px, 40px 40px',
      };
    case 'ambient-glow': {
      const layers = [
        gridOp > 0 ? gridDot : null,
        amb > 0 ? `radial-gradient(ellipse 65% 50% at 18% 15%, ${scaleAlpha(dt.accentGlow, 0.6 * amb)}, transparent)` : null,
        amb > 0 ? `radial-gradient(ellipse 55% 45% at 82% 80%, ${scaleAlpha(tokens.ambientGlow2, amb * 3)}, transparent)` : null,
      ].filter(Boolean) as string[];
      const sizes = [gridOp > 0 ? gridSize : null, '100% 100%', '100% 100%'].filter(Boolean).join(', ');
      const pos   = [gridOp > 0 ? gridPos  : null, '0 0', '0 0'].filter(Boolean).join(', ');
      return { backgroundColor: page, backgroundImage: layers.length ? layers.join(', ') : 'none', backgroundSize: sizes || gridSize, backgroundPosition: pos || gridPos };
    }
    case 'minimal-black':
      return {
        backgroundColor: page,
        backgroundImage: gridOp > 0 ? gridDot : 'none',
        backgroundSize:  gridSize,
        backgroundPosition: gridPos,
      };
    case 'warm-study': {
      const layers = [
        gridOp > 0 ? gridDot : null,
        amb > 0 ? `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(245,158,11,${(0.06 * amb).toFixed(3)}), transparent)` : null,
      ].filter(Boolean) as string[];
      const sizes = [gridOp > 0 ? gridSize : null, '100% 100%'].filter(Boolean).join(', ');
      const pos   = [gridOp > 0 ? gridPos  : null, '0 0'].filter(Boolean).join(', ');
      return { backgroundColor: page, backgroundImage: layers.length ? layers.join(', ') : 'none', backgroundSize: sizes || gridSize, backgroundPosition: pos || gridPos };
    }
    default:
      return { backgroundColor: page };
  }
}

export {
  applyCanvasWarmth,
  applyCanvasBrightness,
  resolveCanvasBaseColor,
  resolveBackgroundStudio,
  backgroundPresetThemePatch,
  BACKGROUND_STUDIO_PRESETS,
  BACKGROUND_STUDIO_PRESETS_ALL,
} from '../lib/workspaceBackgroundStudio';

// ── User preset type ──────────────────────────────────────────────────────────

export interface UserPreset {
  id:        string;
  name:      string;
  emoji:     string;
  createdAt: number;
  theme:     GlobalTheme;
}

const USER_PRESETS_KEY = 'fw_user_presets_v1';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkspaceTheme() {
  const [global, setGlobal] = useState<GlobalTheme>(() => {
    try {
      const s = localStorage.getItem(GLOBAL_KEY);
      return s ? { ...DEFAULT_THEME, ...JSON.parse(s) } : DEFAULT_THEME;
    } catch { return DEFAULT_THEME; }
  });

  const [moduleThemes, setModuleThemes] = useState<Record<string, ModuleTheme>>(() => {
    try {
      const s = localStorage.getItem(MODULES_KEY);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });

  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    try {
      const s = localStorage.getItem(USER_PRESETS_KEY);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(GLOBAL_KEY,       JSON.stringify(global));       }, [global]);
  useEffect(() => { localStorage.setItem(MODULES_KEY,      JSON.stringify(moduleThemes)); }, [moduleThemes]);
  useEffect(() => { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets));  }, [userPresets]);

  // Memoize so callers get a stable reference when global hasn't changed.
  // Without this, every render produces a new object, making mergeAccent()
  // in consumers (CommandPaletteContext, SectionPage) also new every render,
  // which destabilizes useCallback deps and triggers infinite context loops.
  const design = useMemo(() => computeDesignTokens(global), [global]);

  // Propagate key values as CSS custom props for instant reactivity
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--fw-accent',      design.accent);
    r.style.setProperty('--fw-accent-glow', design.accentGlow);
    r.style.setProperty('--fw-radius',      `${design.radius}px`);
    r.style.setProperty('--fw-transition',  design.transition);
  }, [design.accent, design.accentGlow, design.radius, design.transition]);

  const updateGlobal = useCallback((patch: Partial<GlobalTheme>) => {
    setGlobal(prev => ({ ...prev, ...patch, activePreset: null }));
  }, []);

  const applyPreset = useCallback((id: string) => {
    // Check built-in presets first, then user presets
    const builtin = THEME_PRESETS.find(x => x.id === id);
    if (builtin) { setGlobal(prev => ({ ...prev, ...builtin.theme, activePreset: id })); return; }
    const user = userPresets.find(x => x.id === id);
    if (user) setGlobal({ ...user.theme, activePreset: id });
  }, [userPresets]);

  const saveAsPreset = useCallback((name: string, emoji: string) => {
    const id = `user-${Date.now()}`;
    const preset: UserPreset = { id, name, emoji, createdAt: Date.now(), theme: global };
    setUserPresets(prev => [...prev, preset]);
    return id;
  }, [global]);

  const deleteUserPreset = useCallback((id: string) => {
    setUserPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateModule = useCallback((id: string, patch: Partial<ModuleTheme>) => {
    setModuleThemes(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const resetModule = useCallback((id: string) => {
    setModuleThemes(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  return {
    global, design, moduleThemes, userPresets, presets: THEME_PRESETS,
    updateGlobal, applyPreset, saveAsPreset, deleteUserPreset,
    updateModule, resetModule,
  };
}
