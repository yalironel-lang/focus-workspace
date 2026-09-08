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
  glyph: string;
} {
  switch (tone) {
    case 'concept':
      return { bar: '#f59e0b', bg: 'rgba(245,158,11,0.07)', label: '#f59e0b', glyph: '◆' };
    case 'definition':
      return { bar: '#a78bfa', bg: 'rgba(167,139,250,0.07)', label: '#a78bfa', glyph: ':=' };
    case 'theorem':
      return { bar: '#818cf8', bg: 'rgba(129,140,248,0.07)', label: '#818cf8', glyph: '∴' };
    case 'example':
      return { bar: '#34d399', bg: 'rgba(52,211,153,0.06)', label: '#34d399', glyph: '→' };
    case 'mistake':
      return { bar: '#f87171', bg: 'rgba(248,113,113,0.07)', label: '#f87171', glyph: '✕' };
    case 'summary':
      return { bar: '#60a5fa', bg: 'rgba(96,165,250,0.07)', label: '#60a5fa', glyph: '≡' };
    case 'review':
      return { bar: '#fb923c', bg: 'rgba(251,146,60,0.07)', label: '#fb923c', glyph: '↩' };
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
      return 'Mistake';
  }
}

export const BULLET_GLYPHS = ['•', '◦', '▸'] as const;
