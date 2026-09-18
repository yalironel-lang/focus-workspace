/**
 * Runtime Notebook design recipes — frame vs study-page separation.
 *
 * Persisted: Appearance V1 only.
 * Flow: appearance → resolve → recipe → frame/page/chrome/card renderers.
 * Never branch renderers on preset id.
 */

import type { CSSProperties } from 'react';
import {
  appearanceMatchesNotebookDesignPreset,
  NOTEBOOK_DESIGN_PRESET_IDS,
  NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS,
  resolveNotebookAppearance,
  type NotebookAppearanceV1,
  type NotebookIdentityColor,
  type NotebookIdentityTreatment,
  type NotebookProductDesignPresetId,
  type NotebookWritingDensity,
} from './notebookAppearance';

export type NotebookDesignMaterial =
  | 'paper'
  | 'clean'
  | 'night'
  | 'technical'
  | 'luminous'
  | 'graphite'
  | 'ink'
  | 'soft'
  | 'glass'
  | 'crafted';

export type NotebookDesignFrame =
  | 'traditional'
  | 'borderless'
  | 'book'
  | 'technical'
  | 'luminous'
  | 'sharp'
  | 'rounded'
  | 'glass';

export type NotebookDesignSpine =
  | 'none'
  | 'hairline'
  | 'classic'
  | 'book'
  | 'technical'
  | 'glow'
  | 'ink';

export type NotebookDesignMotif =
  | 'none'
  | 'paper-edge'
  | 'academic-rule'
  | 'drafting-marks'
  | 'glass-highlight'
  | 'soft-shapes'
  | 'aurora-light'
  | 'copper-edge'
  | 'graphite-edge'
  | 'ink-band';

export type NotebookDesignDepth = 'flat' | 'subtle' | 'raised' | 'glass' | 'deep';

export type NotebookDesignTitleTreatment =
  | 'neutral'
  | 'editorial'
  | 'technical'
  | 'premium'
  | 'soft';

/** Derived runtime recipe — never persisted. */
export type NotebookAppearanceVisualTokens = {
  material: NotebookDesignMaterial;
  frame: NotebookDesignFrame;
  spine: NotebookDesignSpine;
  motif: NotebookDesignMotif;
  depth: NotebookDesignDepth;
  titleTreatment: NotebookDesignTitleTreatment;

  identityPrimary: string;
  identityAccent: string;

  /** Outer notebook identity / environment. */
  frameSurface: string;
  frameBorder: string;
  frameTint: string;
  frameEdgeMotif: string;
  /** Extra atmospheric layers (frame only) — never paint study content. */
  ambientLight: string;
  ambientLightSecondary: string;
  /** Inner ring between frame padding and study page. */
  frameInnerRing: string;
  frameRadiusPx: number;
  frameBorderWidthPx: number;
  frameShadow: string;
  ambientShadow: string;
  /**
   * Legacy uniform pad (max left / desktop target). Prefer asymmetric fields.
   * Kept for tests + CSS var diagnostics.
   */
  framePaddingPx: number;
  /** Asymmetric notebook shell bands — CSS clamp() strings (responsive). */
  framePaddingTop: string;
  framePaddingRight: string;
  framePaddingBottom: string;
  framePaddingLeft: string;

  /** Digital identity rail (left) — not a fake leather spine. */
  identityRailWidthPx: number;
  identityRailSurface: string;
  identityRailAccent: string;

  /** Inner study page — calm, readable; paperStyle lines overlay separately. */
  pageSurface: string;
  pageBorder: string;
  pageRadiusPx: number;
  pageShadow: string;
  pageInk: 'dark' | 'light';
  /** Vertical gap between chrome and study page (px) — reveals frame between. */
  pageGapTopPx: number;

  chromeSurface: string;
  chromeBorder: string;
  chromeHighlight: string;

  /** Product toolbar adaptation via CSS vars (same chrome, soft recipe tint). */
  toolbarFade: string;
  toolbarInk: string;
  toolbarMuted: string;
  toolbarHairline: string;

  titleColor: string;
  titleWeight: number;
  titleTracking: string;

  spineColor: string;
  spineWidthPx: number;

  treatment: NotebookIdentityTreatment;

  /** @deprecated aliases kept for gradual migration of callers/tests */
  shellSurface: string;
  shellBorder: string;
  shellTint: string;
  shellEdgeMotif: string;
  interiorWash: string;
  canvasFill: string | null;
  canvasInk: 'dark' | 'light' | null;
};

/** Responsive frame band: min–ideal–max px. Hierarchy left > top > right/bottom. */
function band(min: number, ideal: number, max: number): string {
  const vw = (ideal / 14).toFixed(2);
  return `clamp(${min}px, ${vw}vw, ${max}px)`;
}

function structure(opts: {
  left: [number, number, number];
  top: [number, number, number];
  right: [number, number, number];
  bottom: [number, number, number];
  railWidth: number;
  railSurface: string;
  railAccent?: string;
  pageGapTop?: number;
}): Pick<
  NotebookAppearanceVisualTokens,
  | 'framePaddingPx'
  | 'framePaddingTop'
  | 'framePaddingRight'
  | 'framePaddingBottom'
  | 'framePaddingLeft'
  | 'identityRailWidthPx'
  | 'identityRailSurface'
  | 'identityRailAccent'
  | 'pageGapTopPx'
> {
  return {
    framePaddingPx: opts.left[2],
    framePaddingLeft: band(...opts.left),
    framePaddingTop: band(...opts.top),
    framePaddingRight: band(...opts.right),
    framePaddingBottom: band(...opts.bottom),
    identityRailWidthPx: opts.railWidth,
    identityRailSurface: opts.railSurface,
    identityRailAccent: opts.railAccent ?? 'transparent',
    pageGapTopPx: opts.pageGapTop ?? 10,
  };
}

type Swatch = { base: string; bright: string; deep: string; soft: string; mist: string };

const SWATCH: Record<NotebookIdentityColor, Swatch> = {
  neutral: {
    base: 'rgba(148,163,184,0.95)',
    bright: 'rgba(226,232,240,0.98)',
    deep: 'rgba(51,65,85,0.98)',
    soft: 'rgba(148,163,184,0.22)',
    mist: 'rgba(148,163,184,0.12)',
  },
  blue: {
    base: 'rgba(59,130,246,0.95)',
    bright: 'rgba(147,197,253,0.98)',
    deep: 'rgba(30,64,175,0.98)',
    soft: 'rgba(59,130,246,0.2)',
    mist: 'rgba(59,130,246,0.1)',
  },
  cyan: {
    base: 'rgba(34,211,238,0.95)',
    bright: 'rgba(165,243,252,0.98)',
    deep: 'rgba(14,116,144,0.98)',
    soft: 'rgba(34,211,238,0.18)',
    mist: 'rgba(34,211,238,0.09)',
  },
  green: {
    base: 'rgba(52,211,153,0.94)',
    bright: 'rgba(167,243,208,0.98)',
    deep: 'rgba(4,120,87,0.96)',
    soft: 'rgba(52,211,153,0.18)',
    mist: 'rgba(110,231,183,0.12)',
  },
  amber: {
    base: 'rgba(245,158,11,0.95)',
    bright: 'rgba(253,230,138,0.98)',
    deep: 'rgba(146,64,14,0.96)',
    soft: 'rgba(245,158,11,0.2)',
    mist: 'rgba(251,191,36,0.1)',
  },
  orange: {
    base: 'rgba(249,115,22,0.95)',
    bright: 'rgba(253,186,116,0.98)',
    deep: 'rgba(154,52,18,0.96)',
    soft: 'rgba(249,115,22,0.18)',
    mist: 'rgba(249,115,22,0.1)',
  },
  rose: {
    base: 'rgba(244,114,182,0.94)',
    bright: 'rgba(251,207,232,0.98)',
    deep: 'rgba(157,23,77,0.94)',
    soft: 'rgba(244,114,182,0.18)',
    mist: 'rgba(251,113,133,0.1)',
  },
  purple: {
    base: 'rgba(168,85,247,0.95)',
    bright: 'rgba(216,180,254,0.98)',
    deep: 'rgba(88,28,135,0.96)',
    soft: 'rgba(168,85,247,0.2)',
    mist: 'rgba(168,85,247,0.1)',
  },
  indigo: {
    base: 'rgba(99,102,241,0.95)',
    bright: 'rgba(165,180,252,0.98)',
    deep: 'rgba(49,46,129,0.98)',
    soft: 'rgba(99,102,241,0.2)',
    mist: 'rgba(99,102,241,0.1)',
  },
};

function sw(c: NotebookIdentityColor): Swatch {
  return SWATCH[c];
}

function a(rgba: string, alpha: number): string {
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgba;
  const p = m[1]!.split(',').map(s => s.trim());
  return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`;
}

function draftingPerimeter(line: string): string {
  return `linear-gradient(90deg,
    ${line} 0 1px, transparent 1px 10px,
    ${line} 10px 11px, transparent 11px 20px,
    ${a(line, 0.5)} 20px 21px, transparent 21px 48px,
    transparent 100%),
    linear-gradient(180deg,
    ${line} 0 1px, transparent 1px 10px,
    ${a(line, 0.45)} 10px 11px, transparent 11px 28px,
    transparent 100%),
    linear-gradient(270deg,
    ${line} 0 1px, transparent 1px 10px,
    ${a(line, 0.4)} 10px 11px, transparent 11px 100%),
    linear-gradient(0deg,
    ${line} 0 1px, transparent 1px 10px,
    ${a(line, 0.35)} 10px 11px, transparent 11px 100%)`;
}

function academicDoubleRule(deep: string, gold: string): string {
  return `linear-gradient(90deg, ${deep} 0 3px, ${gold} 3px 5px, ${a(deep, 0.4)} 5px 8px, transparent 8px 100%),
    linear-gradient(180deg, ${a(gold, 0.35)} 0 1px, transparent 1px 100%)`;
}

const LIGHT_TOOLBAR = {
  toolbarFade:
    'linear-gradient(180deg, rgba(255,255,255,0.94) 35%, rgba(255,255,255,0.78) 72%, rgba(255,255,255,0) 100%)',
  toolbarInk: 'rgba(28,25,23,0.88)',
  toolbarMuted: 'rgba(68,64,60,0.72)',
  toolbarHairline: 'rgba(28,25,23,0.12)',
};

const DARK_TOOLBAR = {
  toolbarFade:
    'linear-gradient(180deg, rgba(12,14,22,0.94) 40%, rgba(12,14,22,0.72) 78%, rgba(12,14,22,0) 100%)',
  toolbarInk: 'rgba(248,250,252,0.92)',
  toolbarMuted: 'rgba(148,163,184,0.82)',
  toolbarHairline: 'rgba(148,163,184,0.14)',
};

type CoreRecipe = Omit<
  NotebookAppearanceVisualTokens,
  | 'shellSurface'
  | 'shellBorder'
  | 'shellTint'
  | 'shellEdgeMotif'
  | 'interiorWash'
  | 'canvasFill'
  | 'canvasInk'
  | 'framePaddingTop'
  | 'framePaddingRight'
  | 'framePaddingBottom'
  | 'framePaddingLeft'
  | 'identityRailWidthPx'
  | 'identityRailSurface'
  | 'identityRailAccent'
  | 'pageGapTopPx'
> &
  Partial<
    Pick<
      NotebookAppearanceVisualTokens,
      | 'framePaddingTop'
      | 'framePaddingRight'
      | 'framePaddingBottom'
      | 'framePaddingLeft'
      | 'identityRailWidthPx'
      | 'identityRailSurface'
      | 'identityRailAccent'
      | 'pageGapTopPx'
    >
  >;

function withAliases(
  r: CoreRecipe &
    Partial<
      Pick<
        NotebookAppearanceVisualTokens,
        | 'shellSurface'
        | 'shellBorder'
        | 'shellTint'
        | 'shellEdgeMotif'
        | 'interiorWash'
        | 'canvasFill'
        | 'canvasInk'
      >
    >,
): NotebookAppearanceVisualTokens {
  const pad = r.framePaddingPx ?? 16;
  const railW = r.identityRailWidthPx ?? Math.max(0, Math.min(r.spineWidthPx ?? 0, 10));
  const struct =
    r.framePaddingLeft != null
      ? {
          framePaddingTop: r.framePaddingTop!,
          framePaddingRight: r.framePaddingRight!,
          framePaddingBottom: r.framePaddingBottom!,
          framePaddingLeft: r.framePaddingLeft!,
          identityRailWidthPx: r.identityRailWidthPx ?? railW,
          identityRailSurface: r.identityRailSurface ?? r.spineColor,
          identityRailAccent: r.identityRailAccent ?? 'transparent',
          pageGapTopPx: r.pageGapTopPx ?? 10,
        }
      : structure({
          left: [Math.max(12, pad - 4), pad, Math.min(28, pad + 4)],
          top: [Math.max(10, pad - 6), Math.max(14, pad - 2), pad],
          right: [Math.max(10, pad - 8), Math.max(12, pad - 4), Math.max(16, pad - 2)],
          bottom: [Math.max(10, pad - 8), Math.max(12, pad - 4), Math.max(16, pad - 2)],
          railWidth: railW,
          railSurface: r.identityRailSurface ?? r.spineColor,
          railAccent: r.identityRailAccent,
          pageGapTop: r.pageGapTopPx,
        });
  return {
    ...r,
    ...struct,
    framePaddingPx: r.framePaddingPx ?? pad,
    shellSurface: r.shellSurface ?? r.frameSurface,
    shellBorder: r.shellBorder ?? r.frameBorder,
    shellTint: r.shellTint ?? r.frameTint,
    shellEdgeMotif: r.shellEdgeMotif ?? r.frameEdgeMotif,
    interiorWash: r.interiorWash ?? 'transparent',
    canvasFill: r.canvasFill ?? r.pageSurface,
    canvasInk: r.canvasInk ?? r.pageInk,
  };
}

type Key = {
  treatment: NotebookIdentityTreatment;
  color: NotebookIdentityColor;
  hasAccent: boolean;
  density: NotebookWritingDensity;
};

function buildRecipe(key: Key, primary: Swatch, accent: Swatch): NotebookAppearanceVisualTokens {
  const { treatment, color, hasAccent, density } = key;

  if (treatment === 'flat') {
    const isMinimal = !hasAccent && density === 'spacious' && color === 'neutral';
    const isSlate = hasAccent || density === 'compact';
    if (isMinimal) {
      return withAliases({
        material: 'clean',
        frame: 'borderless',
        spine: 'none',
        motif: 'none',
        depth: 'flat',
        titleTreatment: 'neutral',
        identityPrimary: 'rgba(100,116,139,0.9)',
        identityAccent: 'rgba(148,163,184,0.45)',
        treatment,
        // Cool graphite / blue-grey shell — not warm, not cream
        frameSurface: 'linear-gradient(180deg, #e8edf3 0%, #dde4ec 100%)',
        frameBorder: 'rgba(100,116,139,0.22)',
        frameTint: 'none',
        frameEdgeMotif: 'none',
        ambientLight: 'none',
        ambientLightSecondary: 'none',
        frameInnerRing: 'rgba(100,116,139,0.10)',
        frameRadiusPx: 8,
        frameBorderWidthPx: 1,
        frameShadow: 'inset 0 0 0 1px rgba(255,255,255,0.55)',
        ambientShadow: '0 8px 24px rgba(15,23,42,0.10)',
        ...structure({
          left: [10, 14, 16],
          top: [10, 14, 16],
          right: [10, 14, 16],
          bottom: [10, 14, 16],
          railWidth: 1,
          railSurface: 'rgba(100,116,139,0.35)',
          pageGapTop: 6,
        }),
        pageSurface: '#ffffff',
        pageBorder: 'rgba(15,23,42,0.08)',
        pageRadiusPx: 2,
        pageShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.06)',
        pageInk: 'dark',
        chromeSurface: 'rgba(255,255,255,0.55)',
        chromeBorder: 'rgba(100,116,139,0.12)',
        chromeHighlight: 'rgba(255,255,255,0.8)',
        ...LIGHT_TOOLBAR,
        titleColor: 'rgba(71,85,105,0.78)',
        titleWeight: 500,
        titleTracking: '0.08em',
        spineColor: 'rgba(148,163,184,0.35)',
        spineWidthPx: 0,
      });
    }
    if (isSlate) {
      return withAliases({
        material: 'graphite',
        frame: 'sharp',
        spine: 'classic',
        motif: 'graphite-edge',
        depth: 'subtle',
        titleTreatment: 'editorial',
        identityPrimary: primary.deep,
        identityAccent: accent.base,
        treatment,
        frameSurface: 'linear-gradient(165deg, #1e293b 0%, #0f172a 100%)',
        frameBorder: a(accent.soft, 0.7),
        frameTint: `linear-gradient(180deg, ${a(primary.deep, 0.15)} 0%, transparent 40%)`,
        frameEdgeMotif: `linear-gradient(90deg, ${a(accent.deep, 0.5)} 0 2px, transparent 2px 100%)`,
        ambientLight: 'none',
        ambientLightSecondary: 'none',
        frameInnerRing: a(accent.mist, 0.6),
        frameRadiusPx: 8,
        frameBorderWidthPx: 1,
        frameShadow: `inset 3px 0 0 ${primary.deep}`,
        ambientShadow: '0 16px 40px rgba(0,0,0,0.32)',
        ...structure({
          left: [14, 18, 22],
          top: [12, 16, 20],
          right: [10, 14, 18],
          bottom: [10, 14, 18],
          railWidth: 4,
          railSurface: primary.deep,
          railAccent: accent.base,
        }),
        pageSurface: '#f1f5f9',
        pageBorder: 'rgba(15,23,42,0.08)',
        pageRadiusPx: 6,
        pageShadow: '0 2px 8px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.5)',
        pageInk: 'dark',
        chromeSurface: 'rgba(15,23,42,0.45)',
        chromeBorder: a(accent.mist, 0.8),
        chromeHighlight: 'rgba(148,163,184,0.08)',
        ...DARK_TOOLBAR,
        titleColor: accent.bright,
        titleWeight: 650,
        titleTracking: '0.03em',
        spineColor: primary.deep,
        spineWidthPx: 3,
      });
    }
    // Classic — warm taupe FRAME, ivory PAGE (must not be one cream blob)
    return withAliases({
      material: 'paper',
      frame: 'traditional',
      spine: 'classic',
      motif: 'paper-edge',
      depth: 'raised',
      titleTreatment: 'editorial',
      identityPrimary: 'rgba(92,74,55,0.95)',
      identityAccent: 'rgba(184,148,90,0.92)',
      treatment,
      frameSurface: 'linear-gradient(165deg, #b9a790 0%, #a89478 48%, #9a856c 100%)',
      frameBorder: 'rgba(90,70,50,0.35)',
      frameTint: 'linear-gradient(90deg, rgba(70,52,36,0.18) 0%, transparent 22%)',
      frameEdgeMotif:
        'linear-gradient(90deg, rgba(70,52,36,0.45) 0 2px, transparent 2px 100%)',
      ambientLight: 'none',
      ambientLightSecondary: 'none',
      frameInnerRing: 'rgba(255,248,235,0.22)',
      frameRadiusPx: 14,
      frameBorderWidthPx: 1,
      frameShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
      ambientShadow: '0 22px 48px rgba(40,30,18,0.28)',
      ...structure({
        left: [18, 24, 28],
        top: [14, 20, 24],
        right: [12, 16, 20],
        bottom: [12, 16, 20],
        railWidth: 8,
        railSurface:
          'linear-gradient(180deg, rgba(70,52,36,0.95) 0%, rgba(92,74,55,0.9) 55%, rgba(70,52,36,0.92) 100%)',
        railAccent: 'rgba(184,148,90,0.85)',
        pageGapTop: 12,
      }),
      pageSurface: '#faf6ef',
      pageBorder: 'rgba(90,70,50,0.12)',
      pageRadiusPx: 8,
      pageShadow:
        '0 1px 0 rgba(255,255,255,0.65), 0 2px 6px rgba(40,30,18,0.08), 0 12px 28px rgba(40,30,18,0.12)',
      pageInk: 'dark',
      chromeSurface: 'rgba(250,246,239,0.35)',
      chromeBorder: 'rgba(90,70,50,0.18)',
      chromeHighlight: 'rgba(255,255,255,0.35)',
      ...LIGHT_TOOLBAR,
      titleColor: 'rgba(250,246,239,0.95)',
      titleWeight: 650,
      titleTracking: '0.02em',
      spineColor: 'rgba(70,52,36,0.9)',
      spineWidthPx: 8,
    });
  }

  if (treatment === 'lined-edge') {
    const isInk = color === 'purple' || color === 'rose';
    if (isInk) {
      return withAliases({
        material: 'ink',
        frame: 'book',
        spine: 'ink',
        motif: 'ink-band',
        depth: 'raised',
        titleTreatment: 'editorial',
        identityPrimary: primary.deep,
        identityAccent: accent.soft,
        treatment,
        frameSurface: 'linear-gradient(165deg, #1a1218 0%, #0f0c10 100%)',
        frameBorder: a(primary.soft, 0.55),
        frameTint: `linear-gradient(180deg, ${a(primary.deep, 0.2)} 0%, transparent 32%)`,
        frameEdgeMotif: `linear-gradient(90deg, ${primary.deep} 0 5px, ${accent.mist} 5px 28px, transparent 28px 100%)`,
        ambientLight: 'none',
        ambientLightSecondary: 'none',
        frameInnerRing: a(primary.mist, 0.5),
        frameRadiusPx: 10,
        frameBorderWidthPx: 1,
        frameShadow: `inset 8px 0 0 ${primary.deep}`,
        ambientShadow: '0 20px 48px rgba(20,8,16,0.4)',
        ...structure({
          left: [16, 20, 24],
          top: [12, 16, 20],
          right: [10, 14, 18],
          bottom: [10, 14, 18],
          railWidth: 8,
          railSurface: primary.deep,
          railAccent: accent.mist,
        }),
        pageSurface: '#f7f2ea',
        pageBorder: 'rgba(28,25,23,0.08)',
        pageRadiusPx: 6,
        pageShadow: '0 2px 10px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.45)',
        pageInk: 'dark',
        chromeSurface: 'rgba(18,12,16,0.7)',
        chromeBorder: a(primary.soft, 0.6),
        chromeHighlight: 'rgba(255,255,255,0.04)',
        ...DARK_TOOLBAR,
        titleColor: accent.bright,
        titleWeight: 650,
        titleTracking: '0.07em',
        spineColor: primary.deep,
        spineWidthPx: 8,
      });
    }
    // Academic — signature navy FRAME clearly surrounding ivory PAGE
    return withAliases({
      material: 'paper',
      frame: 'book',
      spine: 'book',
      motif: 'academic-rule',
      depth: 'raised',
      titleTreatment: 'editorial',
      identityPrimary: '#152038',
      identityAccent: 'rgba(196,160,100,0.92)',
      treatment,
      frameSurface: 'linear-gradient(165deg, #243556 0%, #152038 42%, #0f182c 100%)',
      frameBorder: 'rgba(196,160,100,0.28)',
      frameTint: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 28%)',
      frameEdgeMotif: academicDoubleRule('#0f182c', 'rgba(196,160,100,0.8)'),
      ambientLight: 'none',
      ambientLightSecondary: 'none',
      frameInnerRing: 'rgba(196,160,100,0.18)',
      frameRadiusPx: 10,
      frameBorderWidthPx: 1,
      frameShadow: 'inset 0 0 0 1px rgba(196,160,100,0.14)',
      ambientShadow: '0 26px 56px rgba(15,24,44,0.42)',
      ...structure({
        left: [20, 26, 28],
        top: [16, 22, 26],
        right: [14, 18, 22],
        bottom: [14, 18, 22],
        railWidth: 10,
        railSurface: 'linear-gradient(180deg, #0f182c 0%, #152038 50%, #0f182c 100%)',
        railAccent: 'rgba(196,160,100,0.9)',
        pageGapTop: 14,
      }),
      pageSurface: '#f8f3e8',
      pageBorder: 'rgba(21,32,56,0.14)',
      pageRadiusPx: 3,
      pageShadow:
        '0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(15,24,44,0.12), 0 14px 32px rgba(15,24,44,0.18)',
      pageInk: 'dark',
      chromeSurface: 'rgba(248,243,232,0.10)',
      chromeBorder: 'rgba(196,160,100,0.28)',
      chromeHighlight: 'rgba(255,255,255,0.08)',
      ...LIGHT_TOOLBAR,
      titleColor: 'rgba(248,243,232,0.94)',
      titleWeight: 700,
      titleTracking: '0.1em',
      spineColor: '#0f182c',
      spineWidthPx: 10,
    });
  }

  if (treatment === 'glass') {
    const isMidnight = color === 'purple' || color === 'indigo';
    if (isMidnight) {
      return withAliases({
        material: 'night',
        frame: 'luminous',
        spine: 'glow',
        motif: 'glass-highlight',
        depth: 'deep',
        titleTreatment: 'premium',
        identityPrimary: primary.deep,
        identityAccent: accent.bright,
        treatment,
        // Near-black outer — purple only on rim / accent
        frameSurface: 'linear-gradient(165deg, #0c0a14 0%, #06050c 50%, #0a0812 100%)',
        frameBorder: a(accent.bright, 0.28),
        frameTint: `linear-gradient(155deg, ${a(primary.deep, 0.28)} 0%, transparent 42%)`,
        frameEdgeMotif: `linear-gradient(90deg, ${a(accent.bright, 0.65)} 0 2px, transparent 2px 100%)`,
        ambientLight: `radial-gradient(ellipse 55% 40% at 0% 0%, ${a(accent.soft, 0.35)}, transparent 60%)`,
        ambientLightSecondary: 'none',
        frameInnerRing: a(accent.bright, 0.22),
        frameRadiusPx: 16,
        frameBorderWidthPx: 1,
        frameShadow: `inset 3px 0 0 ${a(accent.bright, 0.75)}, inset 0 0 0 1px ${a(accent.bright, 0.18)}`,
        ambientShadow: `0 28px 64px rgba(4,2,12,0.55), 0 0 28px ${a(primary.base, 0.08)}`,
        ...structure({
          left: [16, 22, 26],
          top: [14, 20, 24],
          right: [12, 16, 20],
          bottom: [12, 16, 20],
          railWidth: 6,
          railSurface: 'linear-gradient(180deg, #06050c 0%, #12101c 50%, #06050c 100%)',
          railAccent: a(accent.bright, 0.75),
          pageGapTop: 12,
        }),
        // Distinct study sheet — visibly lighter than outer frame
        pageSurface: '#1a1828',
        pageBorder: 'rgba(167,139,250,0.16)',
        pageRadiusPx: 10,
        pageShadow:
          '0 0 0 1px rgba(167,139,250,0.08), 0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        pageInk: 'light',
        chromeSurface: 'rgba(10,8,18,0.72)',
        chromeBorder: a(accent.soft, 0.55),
        chromeHighlight: a(accent.bright, 0.12),
        ...DARK_TOOLBAR,
        titleColor: accent.bright,
        titleWeight: 650,
        titleTracking: '0.05em',
        spineColor: accent.bright,
        spineWidthPx: 3,
      });
    }
    return withAliases({
      material: 'glass',
      frame: 'glass',
      spine: 'glow',
      motif: 'glass-highlight',
      depth: 'glass',
      titleTreatment: 'premium',
      identityPrimary: primary.base,
      identityAccent: accent.bright,
      treatment,
      frameSurface:
        'linear-gradient(160deg, rgba(186,230,253,0.12) 0%, rgba(15,23,42,0.78) 45%, rgba(8,20,36,0.92) 100%)',
      frameBorder: 'rgba(186,230,253,0.32)',
      frameTint: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 28%)',
      frameEdgeMotif: 'linear-gradient(90deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 100%)',
      ambientLight: 'none',
      ambientLightSecondary: 'none',
      frameInnerRing: 'rgba(186,230,253,0.2)',
      frameRadiusPx: 18,
      frameBorderWidthPx: 1,
      frameShadow: 'inset 2px 0 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(186,230,253,0.22)',
      ambientShadow: '0 20px 52px rgba(20,60,90,0.3)',
      ...structure({
        left: [14, 18, 22],
        top: [12, 16, 20],
        right: [10, 14, 18],
        bottom: [10, 14, 18],
        railWidth: 3,
        railSurface: 'rgba(186,230,253,0.55)',
      }),
      pageSurface: '#0f172a',
      pageBorder: 'rgba(186,230,253,0.1)',
      pageRadiusPx: 12,
      pageShadow: '0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
      pageInk: 'light',
      chromeSurface: 'rgba(15,30,48,0.4)',
      chromeBorder: 'rgba(186,230,253,0.22)',
      chromeHighlight: 'rgba(255,255,255,0.16)',
      ...DARK_TOOLBAR,
      titleColor: accent.bright,
      titleWeight: 600,
      titleTracking: '0.05em',
      spineColor: 'rgba(186,230,253,0.8)',
      spineWidthPx: 2,
    });
  }

  if (treatment === 'blueprint') {
    return withAliases({
      material: 'technical',
      frame: 'technical',
      spine: 'technical',
      motif: 'drafting-marks',
      depth: 'subtle',
      titleTreatment: 'technical',
      identityPrimary: primary.deep,
      identityAccent: accent.bright,
      treatment,
      frameSurface: 'linear-gradient(165deg, #0a1e36 0%, #061525 55%, #0c243c 100%)',
      frameBorder: accent.soft,
      frameTint: `linear-gradient(180deg, ${primary.mist} 0%, transparent 36%)`,
      frameEdgeMotif: draftingPerimeter(a(accent.bright, 0.72)),
      ambientLight: 'none',
      ambientLightSecondary: 'none',
      frameInnerRing: a(accent.bright, 0.28),
      frameRadiusPx: 6,
      frameBorderWidthPx: 1,
      frameShadow: `inset 3px 0 0 ${accent.bright}, inset 0 0 0 1px ${a(accent.bright, 0.35)}`,
      ambientShadow: '0 18px 44px rgba(4,30,55,0.42)',
      ...structure({
        left: [16, 22, 26],
        top: [14, 18, 22],
        right: [12, 16, 20],
        bottom: [12, 16, 20],
        railWidth: 6,
        railSurface: `linear-gradient(180deg, ${primary.deep} 0%, #061525 100%)`,
        railAccent: accent.bright,
        pageGapTop: 12,
      }),
      pageSurface: '#f5f8fc',
      pageBorder: 'rgba(8,30,55,0.12)',
      pageRadiusPx: 3,
      pageShadow:
        '0 1px 0 rgba(255,255,255,0.8), 0 2px 8px rgba(4,30,55,0.12), 0 12px 28px rgba(4,30,55,0.16)',
      pageInk: 'dark',
      chromeSurface: `color-mix(in srgb, ${primary.deep} 30%, rgba(4,18,36,0.7))`,
      chromeBorder: accent.soft,
      chromeHighlight: a(accent.bright, 0.18),
      ...LIGHT_TOOLBAR,
      titleColor: accent.bright,
      titleWeight: 650,
      titleTracking: '0.14em',
      spineColor: accent.bright,
      spineWidthPx: 3,
    });
  }

  if (treatment === 'gradient') {
    // Aurora — multi-zone frame light; calmer distinct page
    return withAliases({
      material: 'luminous',
      frame: 'luminous',
      spine: 'glow',
      motif: 'aurora-light',
      depth: 'deep',
      titleTreatment: 'premium',
      identityPrimary: 'rgba(165,243,252,0.95)',
      identityAccent: 'rgba(216,180,254,0.95)',
      treatment,
      frameSurface: 'linear-gradient(150deg, #08070f 0%, #0c0a16 35%, #0a1020 70%, #0b0814 100%)',
      frameBorder: 'rgba(167,139,250,0.28)',
      frameTint: 'none',
      frameEdgeMotif:
        'linear-gradient(90deg, rgba(34,211,238,0.75) 0 2px, rgba(167,139,250,0.55) 2px 4px, rgba(244,114,182,0.45) 4px 5px, transparent 5px 100%)',
      ambientLight: `radial-gradient(ellipse 85% 60% at -8% 8%, rgba(168,85,247,0.42), transparent 55%),
        radial-gradient(ellipse 75% 55% at 108% 0%, rgba(34,211,238,0.38), transparent 52%)`,
      ambientLightSecondary: `radial-gradient(ellipse 60% 50% at 85% 105%, rgba(244,114,182,0.32), transparent 55%),
        radial-gradient(ellipse 45% 40% at 15% 95%, rgba(99,102,241,0.22), transparent 58%),
        radial-gradient(ellipse 50% 30% at 50% -5%, rgba(56,189,248,0.18), transparent 60%)`,
      frameInnerRing: 'rgba(129,140,248,0.22)',
      frameRadiusPx: 18,
      frameBorderWidthPx: 1,
      frameShadow: `inset 0 0 0 1px rgba(167,139,250,0.22)`,
      ambientShadow: `0 30px 70px rgba(20,10,40,0.5), 0 0 56px rgba(99,102,241,0.14)`,
      ...structure({
        left: [16, 22, 26],
        top: [14, 20, 24],
        right: [12, 16, 20],
        bottom: [12, 16, 20],
        railWidth: 7,
        railSurface:
          'linear-gradient(180deg, #0a0814 0%, #14102a 40%, #0c1528 70%, #100e1c 100%)',
        railAccent: 'linear-gradient(180deg, rgba(34,211,238,0.7), rgba(167,139,250,0.55), rgba(244,114,182,0.45))',
        pageGapTop: 12,
      }),
      pageSurface: '#151622',
      pageBorder: 'rgba(129,140,248,0.14)',
      pageRadiusPx: 12,
      pageShadow:
        '0 0 0 1px rgba(129,140,248,0.08), 0 10px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      pageInk: 'light',
      chromeSurface:
        'linear-gradient(120deg, rgba(14,20,40,0.75), rgba(28,16,48,0.65), rgba(20,12,36,0.7))',
      chromeBorder: 'rgba(167,139,250,0.28)',
      chromeHighlight: 'rgba(165,243,252,0.12)',
      ...DARK_TOOLBAR,
      titleColor: 'rgba(186,230,253,0.95)',
      titleWeight: 700,
      titleTracking: '0.05em',
      spineColor: 'rgba(34,211,238,0.75)',
      spineWidthPx: 4,
    });
  }

  if (treatment === 'soft') {
    const isPastel = color === 'green' || color === 'cyan';
    return withAliases({
      material: 'soft',
      frame: 'rounded',
      spine: 'glow',
      motif: 'soft-shapes',
      depth: 'subtle',
      titleTreatment: 'soft',
      identityPrimary: primary.bright,
      identityAccent: accent.bright,
      treatment,
      frameSurface: isPastel
        ? 'linear-gradient(145deg, #e8f6ef 0%, #e6f0f8 50%, #f5e8f0 100%)'
        : 'linear-gradient(155deg, #f3e4da 0%, #ecd5d8 50%, #f0ddd0 100%)',
      frameBorder: a(accent.soft, 0.55),
      frameTint: `radial-gradient(ellipse 70% 55% at 10% 0%, ${primary.mist}, transparent 58%), radial-gradient(ellipse 50% 40% at 90% 10%, ${accent.mist}, transparent 55%)`,
      frameEdgeMotif: `linear-gradient(90deg, ${primary.soft} 0 6px, transparent 6px 100%)`,
      ambientLight: 'none',
      ambientLightSecondary: 'none',
      frameInnerRing: 'rgba(255,255,255,0.35)',
      frameRadiusPx: 20,
      frameBorderWidthPx: 0,
      frameShadow: `inset 6px 0 14px ${a(primary.base, 0.1)}`,
      ambientShadow: '0 18px 44px rgba(100,80,90,0.16)',
      framePaddingPx: 16,
      pageSurface: '#fffcf8',
      pageBorder: 'rgba(28,25,23,0.06)',
      pageRadiusPx: 12,
      pageShadow: '0 2px 10px rgba(100,80,90,0.08), 0 1px 0 rgba(255,255,255,0.7)',
      pageInk: 'dark',
      chromeSurface: 'rgba(255,255,255,0.45)',
      chromeBorder: accent.mist,
      chromeHighlight: 'rgba(255,255,255,0.6)',
      ...LIGHT_TOOLBAR,
      titleColor: primary.deep,
      titleWeight: 600,
      titleTracking: '0.03em',
      spineColor: primary.soft,
      spineWidthPx: 6,
    });
  }

  if (treatment === 'paper') {
    return withAliases({
      material: 'crafted',
      frame: 'traditional',
      spine: 'classic',
      motif: 'copper-edge',
      depth: 'raised',
      titleTreatment: 'premium',
      identityPrimary: primary.deep,
      identityAccent: accent.bright,
      treatment,
      frameSurface: 'linear-gradient(160deg, #2a1c14 0%, #1a120e 100%)',
      frameBorder: a(accent.soft, 0.8),
      frameTint: `linear-gradient(145deg, ${accent.mist} 0%, transparent 42%)`,
      frameEdgeMotif: `linear-gradient(90deg, ${primary.deep} 0 3px, ${accent.base} 3px 5px, transparent 5px 100%)`,
      ambientLight: 'none',
      ambientLightSecondary: 'none',
      frameInnerRing: a(accent.mist, 0.5),
      frameRadiusPx: 12,
      frameBorderWidthPx: 1,
      frameShadow: `inset 5px 0 0 ${primary.deep}`,
      ambientShadow: '0 22px 52px rgba(80,30,10,0.34)',
      framePaddingPx: 16,
      pageSurface: '#faf6f0',
      pageBorder: 'rgba(90,50,20,0.08)',
      pageRadiusPx: 8,
      pageShadow: '0 2px 10px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.5)',
      pageInk: 'dark',
      chromeSurface: 'rgba(40,24,16,0.65)',
      chromeBorder: a(accent.soft, 0.85),
      chromeHighlight: 'rgba(255,200,140,0.1)',
      ...LIGHT_TOOLBAR,
      titleColor: accent.bright,
      titleWeight: 650,
      titleTracking: '0.04em',
      spineColor: primary.deep,
      spineWidthPx: 5,
    });
  }

  return withAliases({
    material: 'clean',
    frame: 'traditional',
    spine: 'classic',
    motif: 'none',
    depth: 'subtle',
    titleTreatment: 'neutral',
    identityPrimary: primary.base,
    identityAccent: accent.bright,
    treatment,
    frameSurface: 'rgba(15,23,42,0.92)',
    frameBorder: primary.mist,
    frameTint: 'none',
    frameEdgeMotif: 'none',
    ambientLight: 'none',
    ambientLightSecondary: 'none',
    frameInnerRing: primary.mist,
    frameRadiusPx: 12,
    frameBorderWidthPx: 1,
    frameShadow: `inset 4px 0 0 ${primary.base}`,
    ambientShadow: '0 16px 40px rgba(0,0,0,0.28)',
    framePaddingPx: 14,
    pageSurface: '#f8fafc',
    pageBorder: 'rgba(15,23,42,0.08)',
    pageRadiusPx: 8,
    pageShadow: '0 2px 8px rgba(0,0,0,0.12)',
    pageInk: 'dark',
    chromeSurface: 'rgba(15,23,42,0.3)',
    chromeBorder: 'rgba(148,163,184,0.14)',
    chromeHighlight: 'rgba(255,255,255,0.05)',
    ...LIGHT_TOOLBAR,
    titleColor: primary.bright,
    titleWeight: 600,
    titleTracking: '0.02em',
    spineColor: primary.base,
    spineWidthPx: 4,
  });
}

export function resolveNotebookAppearanceVisualTokens(
  appearance: NotebookAppearanceV1 | null | undefined,
): NotebookAppearanceVisualTokens {
  const resolved = resolveNotebookAppearance(appearance);
  const primary = sw(resolved.identity.color);
  const accent = sw(resolved.identity.accent ?? resolved.identity.color);
  return buildRecipe(
    {
      treatment: resolved.identity.treatment,
      color: resolved.identity.color,
      hasAccent: resolved.identity.accent != null,
      density: resolved.writing.density,
    },
    primary,
    accent,
  );
}

export const resolveNotebookAppearanceVisualRecipe = resolveNotebookAppearanceVisualTokens;

export function notebookAppearanceFrameStyle(
  tokens: NotebookAppearanceVisualTokens,
): CSSProperties {
  const layers: string[] = [];
  if (tokens.frameEdgeMotif && tokens.frameEdgeMotif !== 'none') layers.push(tokens.frameEdgeMotif);
  if (tokens.ambientLightSecondary && tokens.ambientLightSecondary !== 'none') {
    layers.push(tokens.ambientLightSecondary);
  }
  if (tokens.ambientLight && tokens.ambientLight !== 'none') layers.push(tokens.ambientLight);
  if (tokens.frameTint && tokens.frameTint !== 'none') layers.push(tokens.frameTint);
  if (tokens.frameSurface.includes('gradient')) layers.push(tokens.frameSurface);

  const innerRing =
    tokens.frameInnerRing && tokens.frameInnerRing !== 'none'
      ? `inset 0 0 0 1px ${tokens.frameInnerRing}`
      : null;
  const shadows = [tokens.frameShadow, innerRing, tokens.ambientShadow].filter(Boolean).join(', ');

  return {
    backgroundColor: tokens.frameSurface.includes('gradient') ? 'transparent' : tokens.frameSurface,
    backgroundImage: layers.length ? layers.join(', ') : undefined,
    borderRadius: tokens.frameRadiusPx,
    border:
      tokens.frameBorderWidthPx > 0
        ? `${tokens.frameBorderWidthPx}px solid ${tokens.frameBorder}`
        : 'none',
    boxShadow: shadows,
    paddingTop: tokens.framePaddingTop,
    paddingRight: tokens.framePaddingRight,
    paddingBottom: tokens.framePaddingBottom,
    paddingLeft: tokens.framePaddingLeft,
    boxSizing: 'border-box',
  };
}

/** Left identity rail — recipe-driven, not a physical book spine. */
export function notebookAppearanceIdentityRailStyle(
  tokens: NotebookAppearanceVisualTokens,
): CSSProperties | null {
  if (tokens.identityRailWidthPx <= 0) return null;
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: tokens.identityRailWidthPx,
    background: tokens.identityRailSurface,
    boxShadow:
      tokens.identityRailAccent !== 'transparent'
        ? `inset -1px 0 0 ${tokens.identityRailAccent}`
        : undefined,
    borderRadius: `${tokens.frameRadiusPx}px 0 0 ${tokens.frameRadiusPx}px`,
    pointerEvents: 'none',
    zIndex: 2,
  };
}

export function notebookAppearanceStudyPageStyle(
  tokens: NotebookAppearanceVisualTokens,
): CSSProperties {
  return {
    backgroundColor: tokens.pageSurface,
    backgroundClip: 'padding-box',
    border: `1px solid ${tokens.pageBorder}`,
    borderRadius: tokens.pageRadiusPx,
    color: tokens.pageInk === 'dark' ? '#1c1917' : 'rgba(248,250,252,0.92)',
    boxShadow: tokens.pageShadow,
    minHeight: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    // visible: sticky product toolbar must stick to [data-nb-body-scroll], not a nested clip.
    overflow: 'visible',
    position: 'relative',
    isolation: 'isolate',
    marginTop: tokens.pageGapTopPx > 0 ? tokens.pageGapTopPx : undefined,
  };
}

export function notebookAppearanceChromeStyle(
  tokens: NotebookAppearanceVisualTokens,
): CSSProperties {
  return {
    background: tokens.chromeSurface,
    borderBottom: `1px solid ${tokens.chromeBorder}`,
    boxShadow:
      tokens.chromeHighlight !== 'transparent'
        ? `inset 0 1px 0 ${tokens.chromeHighlight}`
        : undefined,
  };
}

export function notebookAppearanceTitleStyle(
  tokens: NotebookAppearanceVisualTokens,
): CSSProperties {
  return {
    color: tokens.titleColor,
    fontWeight: tokens.titleWeight,
    letterSpacing: tokens.titleTracking,
  };
}

export function notebookAppearanceVisualTokensToCssVars(
  tokens: NotebookAppearanceVisualTokens,
): CSSProperties {
  const lightPage = tokens.pageInk === 'dark';
  const prose = lightPage
    ? {
        ink: '#292524',
        headline: '#1c1917',
        section: '#44403c',
        secondary: '#57534e',
        muted: '#78716c',
        ghost: '#a8a29e',
        link: '#0369a1',
        linkHover: '#0c4a6e',
        calloutDefinition: '#6d28d9',
        calloutConcept: '#b45309',
        calloutTheorem: '#4338ca',
        calloutExample: '#047857',
        calloutMistake: '#b91c1c',
        calloutSummary: '#1d4ed8',
        calloutReview: '#c2410c',
      }
    : {
        ink: 'rgba(248,250,252,0.92)',
        headline: '#f8fafc',
        section: 'rgba(226,232,240,0.88)',
        secondary: 'rgba(203,213,225,0.78)',
        muted: 'rgba(148,163,184,0.85)',
        ghost: 'rgba(100,116,139,0.7)',
        link: '#7dd3fc',
        linkHover: '#bae6fd',
        calloutDefinition: 'rgba(196,181,253,0.92)',
        calloutConcept: 'rgba(251,191,36,0.92)',
        calloutTheorem: 'rgba(165,180,252,0.92)',
        calloutExample: 'rgba(110,231,183,0.92)',
        calloutMistake: 'rgba(252,165,165,0.92)',
        calloutSummary: 'rgba(147,197,253,0.92)',
        calloutReview: 'rgba(253,186,116,0.92)',
      };
  return {
    ['--nb-identity-primary' as string]: tokens.identityPrimary,
    ['--nb-identity-accent' as string]: tokens.identityAccent,
    ['--nb-frame-surface' as string]: tokens.frameSurface,
    ['--nb-page-surface' as string]: tokens.pageSurface,
    ['--nb-chrome-surface' as string]: tokens.chromeSurface,
    ['--nb-title' as string]: tokens.titleColor,
    ['--nb-spine' as string]: tokens.spineColor,
    ['--nb-material' as string]: tokens.material,
    ['--nb-frame' as string]: tokens.frame,
    ['--nb-motif' as string]: tokens.motif,
    ['--nb-toolbar-fade' as string]: tokens.toolbarFade,
    ['--nb-toolbar-ink' as string]: tokens.toolbarInk,
    ['--nb-toolbar-muted' as string]: tokens.toolbarMuted,
    ['--nb-toolbar-hairline' as string]: tokens.toolbarHairline,
    ['--nb-page-ink-mode' as string]: tokens.pageInk,
    ['--nb-prose-ink' as string]: prose.ink,
    ['--nb-prose-headline' as string]: prose.headline,
    ['--nb-prose-section' as string]: prose.section,
    ['--nb-prose-secondary' as string]: prose.secondary,
    ['--nb-prose-muted' as string]: prose.muted,
    ['--nb-prose-ghost' as string]: prose.ghost,
    ['--nb-prose-link' as string]: prose.link,
    ['--nb-prose-link-hover' as string]: prose.linkHover,
    ['--nb-callout-definition-label' as string]: prose.calloutDefinition,
    ['--nb-callout-concept-label' as string]: prose.calloutConcept,
    ['--nb-callout-theorem-label' as string]: prose.calloutTheorem,
    ['--nb-callout-example-label' as string]: prose.calloutExample,
    ['--nb-callout-mistake-label' as string]: prose.calloutMistake,
    ['--nb-callout-summary-label' as string]: prose.calloutSummary,
    ['--nb-callout-review-label' as string]: prose.calloutReview,
  };
}

export function notebookAppearanceShellBackgroundImage(
  tokens: NotebookAppearanceVisualTokens,
): string {
  const layers: string[] = [];
  if (tokens.frameEdgeMotif !== 'none') layers.push(tokens.frameEdgeMotif);
  if (tokens.ambientLightSecondary !== 'none') layers.push(tokens.ambientLightSecondary);
  if (tokens.ambientLight !== 'none') layers.push(tokens.ambientLight);
  if (tokens.frameTint !== 'none') layers.push(tokens.frameTint);
  if (tokens.frameSurface.includes('gradient')) layers.push(tokens.frameSurface);
  return layers.length ? layers.join(', ') : 'none';
}

export function notebookAppearanceShellBackgroundColor(
  tokens: NotebookAppearanceVisualTokens,
): string {
  return tokens.frameSurface.includes('gradient') ? 'transparent' : tokens.frameSurface;
}

export function notebookAppearanceSpineBoxShadow(
  tokens: NotebookAppearanceVisualTokens,
): string {
  return tokens.frameShadow;
}

export type NotebookDesignerPresetSelection =
  | NotebookProductDesignPresetId
  | 'custom'
  | 'legacy';

export function resolveNotebookDesignerPresetSelection(
  appearance: NotebookAppearanceV1 | null | undefined,
): NotebookDesignerPresetSelection {
  if (!appearance) return 'custom';
  for (const id of NOTEBOOK_PRODUCT_DESIGN_PRESET_IDS) {
    if (appearanceMatchesNotebookDesignPreset(appearance, id)) return id;
  }
  for (const id of NOTEBOOK_DESIGN_PRESET_IDS) {
    if (appearanceMatchesNotebookDesignPreset(appearance, id)) return 'legacy';
  }
  return 'custom';
}

export function notebookAppearancesStructurallyEqual(
  a: NotebookAppearanceV1 | null | undefined,
  b: NotebookAppearanceV1 | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
