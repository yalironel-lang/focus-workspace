/**
 * Visual tokens for TipTap shadow viewer / dialect preview.
 * Mirrors ProjectNotebookBlock preview chrome without importing the editor.
 */

import type { CalloutTone } from '../notebookDialect';

export const NB_FONT_STACK =
  "'Plus Jakarta Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

export const NB_TYPE_SCALE = {
  l1: 28.13,
  l2: 22.5,
  l3: 18,
  l4: 14.4,
  l5: 11.52,
} as const;

/**
 * Default prose ink — presentation-aware via study-page CSS vars.
 * Fallbacks are dark (readable on light Classic/Minimal/Academic pages).
 * Explicit TipTap textStyle color marks still win (inline style).
 */
export const NB_INK = {
  headline: 'var(--nb-prose-headline, #1c1917)',
  primary: 'var(--nb-prose-ink, #292524)',
  section: 'var(--nb-prose-section, #44403c)',
  secondary: 'var(--nb-prose-secondary, #57534e)',
  muted: 'var(--nb-prose-muted, #78716c)',
  ghost: 'var(--nb-prose-ghost, #a8a29e)',
} as const;

/** Literal dark-UI ink (sandbox / engineering chrome that is always dark). */
export const NB_INK_ON_DARK = {
  headline: '#f8fafc',
  primary: 'rgba(248,250,252,0.92)',
  section: 'rgba(226,232,240,0.88)',
  secondary: 'rgba(203,213,225,0.78)',
  muted: 'rgba(148,163,184,0.85)',
  ghost: 'rgba(100,116,139,0.7)',
} as const;

/** Apply on always-dark TipTap sandboxes so NB_INK CSS vars resolve to light ink. */
export const NB_PROSE_CSS_VARS_ON_DARK: Record<string, string> = {
  '--nb-prose-ink': NB_INK_ON_DARK.primary,
  '--nb-prose-headline': NB_INK_ON_DARK.headline,
  '--nb-prose-section': NB_INK_ON_DARK.section,
  '--nb-prose-secondary': NB_INK_ON_DARK.secondary,
  '--nb-prose-muted': NB_INK_ON_DARK.muted,
  '--nb-prose-ghost': NB_INK_ON_DARK.ghost,
  '--nb-prose-link': '#7dd3fc',
  '--nb-prose-link-hover': '#bae6fd',
  '--nb-callout-definition-label': 'rgba(196,181,253,0.92)',
  '--nb-callout-concept-label': 'rgba(251,191,36,0.92)',
  '--nb-callout-theorem-label': 'rgba(165,180,252,0.92)',
  '--nb-callout-example-label': 'rgba(110,231,183,0.92)',
  '--nb-callout-mistake-label': 'rgba(252,165,165,0.92)',
  '--nb-callout-summary-label': 'rgba(147,197,253,0.92)',
  '--nb-callout-review-label': 'rgba(253,186,116,0.92)',
};

export function calloutToneTokens(tone: CalloutTone): {
  bar: string;
  bg: string;
  label: string;
  /** Optional typographic marker for legacy/CE chrome; TipTap product view omits it. */
  glyph: string;
} {
  // Labels use CSS vars so light/dark study pages stay readable without rewriting content.
  switch (tone) {
    case 'definition':
      return {
        bar: 'rgba(167,139,250,0.85)',
        bg: 'rgba(167,139,250,0.08)',
        label: 'var(--nb-callout-definition-label, #6d28d9)',
        glyph: '',
      };
    case 'concept':
      return {
        bar: 'rgba(245,158,11,0.85)',
        bg: 'rgba(245,158,11,0.08)',
        label: 'var(--nb-callout-concept-label, #b45309)',
        glyph: '',
      };
    case 'theorem':
      return {
        bar: 'rgba(129,140,248,0.85)',
        bg: 'rgba(129,140,248,0.08)',
        label: 'var(--nb-callout-theorem-label, #4338ca)',
        glyph: '',
      };
    case 'example':
      return {
        bar: 'rgba(52,211,153,0.8)',
        bg: 'rgba(52,211,153,0.08)',
        label: 'var(--nb-callout-example-label, #047857)',
        glyph: '',
      };
    case 'mistake':
      return {
        bar: 'rgba(248,113,113,0.85)',
        bg: 'rgba(248,113,113,0.08)',
        label: 'var(--nb-callout-mistake-label, #b91c1c)',
        glyph: '',
      };
    case 'summary':
      return {
        bar: 'rgba(96,165,250,0.85)',
        bg: 'rgba(96,165,250,0.08)',
        label: 'var(--nb-callout-summary-label, #1d4ed8)',
        glyph: '',
      };
    case 'review':
      return {
        bar: 'rgba(251,146,60,0.85)',
        bg: 'rgba(251,146,60,0.08)',
        label: 'var(--nb-callout-review-label, #c2410c)',
        glyph: '',
      };
  }
}

export function calloutLabel(tone: CalloutTone): string {
  switch (tone) {
    case 'summary':
      return 'Summary';
    case 'concept':
      return 'Key Concept';
    case 'review':
      return 'Review';
    case 'definition':
      return 'Definition';
    case 'theorem':
      return 'Theorem';
    case 'example':
      return 'Example';
    case 'mistake':
      // Product-facing clarity; canonical ID remains `mistake`.
      return 'Common Mistake';
  }
}

export const BULLET_GLYPHS = ['•', '◦', '▸'] as const;
