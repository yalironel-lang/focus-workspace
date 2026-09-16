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

export const NB_INK = {
  headline: '#f8fafc',
  primary: 'rgba(248,250,252,0.92)',
  section: 'rgba(226,232,240,0.88)',
  secondary: 'rgba(203,213,225,0.78)',
  muted: 'rgba(148,163,184,0.85)',
  ghost: 'rgba(100,116,139,0.7)',
} as const;

export function calloutToneTokens(tone: CalloutTone): {
  bar: string;
  bg: string;
  label: string;
  /** Optional typographic marker for legacy/CE chrome; TipTap product view omits it. */
  glyph: string;
} {
  // One visual family: quiet tint + accent at logical inline-start (RTL-aware).
  switch (tone) {
    case 'definition':
      return { bar: 'rgba(167,139,250,0.85)', bg: 'rgba(167,139,250,0.05)', label: 'rgba(196,181,253,0.92)', glyph: '' };
    case 'concept':
      return { bar: 'rgba(245,158,11,0.85)', bg: 'rgba(245,158,11,0.05)', label: 'rgba(251,191,36,0.92)', glyph: '' };
    case 'theorem':
      return { bar: 'rgba(129,140,248,0.85)', bg: 'rgba(129,140,248,0.05)', label: 'rgba(165,180,252,0.92)', glyph: '' };
    case 'example':
      return { bar: 'rgba(52,211,153,0.8)', bg: 'rgba(52,211,153,0.045)', label: 'rgba(110,231,183,0.92)', glyph: '' };
    case 'mistake':
      return { bar: 'rgba(248,113,113,0.85)', bg: 'rgba(248,113,113,0.05)', label: 'rgba(252,165,165,0.92)', glyph: '' };
    case 'summary':
      return { bar: 'rgba(96,165,250,0.85)', bg: 'rgba(96,165,250,0.05)', label: 'rgba(147,197,253,0.92)', glyph: '' };
    case 'review':
      return { bar: 'rgba(251,146,60,0.85)', bg: 'rgba(251,146,60,0.05)', label: 'rgba(253,186,116,0.92)', glyph: '' };
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
