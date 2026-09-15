/**
 * TipTap Notebook block text direction (RTL Phase A).
 * In-memory TipTap attrs only — not part of persisted Notebook dialect.
 *
 * Policy:
 * - Values: auto | ltr | rtl
 * - Default: auto (existing notebooks unchanged; no body rewrite)
 * - Block-level only (not inline marks)
 * - Does not affect text offsets / mark ranges
 * - Must not inject Unicode bidi control characters into content
 */

import type { TextAlignment } from '../notebookDialect';

export type NotebookTextDir = 'auto' | 'ltr' | 'rtl';

export const NOTEBOOK_TEXT_DIRS = ['auto', 'ltr', 'rtl'] as const;

/** Unicode bidi control characters — detection only.
 * ZIKUK never injects these for RTL (DOM dir/isolation instead).
 * User-pasted plain text that already contains them is preserved.
 */
export const BIDI_CONTROL_CHARS_RE =
  /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function hasBidiControlChars(text: string): boolean {
  BIDI_CONTROL_CHARS_RE.lastIndex = 0;
  return BIDI_CONTROL_CHARS_RE.test(text);
}

/**
 * First-strong directional character (UAX #9 paragraph embedding idea).
 * Skips neutrals/weak types; does NOT use naïve “contains Hebrew ⇒ RTL”.
 */
export function detectFirstStrongDirection(text: string): 'ltr' | 'rtl' | 'neutral' {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // Explicit bidi controls — ignore for detection (we don't use them as content policy)
    if (
      cp === 0x061c ||
      cp === 0x200e ||
      cp === 0x200f ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069)
    ) {
      continue;
    }
    const bidiclass = unicodeBidiClass(cp);
    if (bidiclass === 'L') return 'ltr';
    if (bidiclass === 'R' || bidiclass === 'AL') return 'rtl';
    // EN/AN/NSM/CS/ES/ET/BN/B/S/WS/ON — keep scanning
  }
  return 'neutral';
}

/**
 * Resolve display base direction for a block.
 * `auto` uses first-strong; neutral falls back to LTR (sensible for empty/numbers-only).
 */
export function resolveEffectiveDir(
  dir: NotebookTextDir | null | undefined,
  text: string,
): 'ltr' | 'rtl' {
  const d = normalizeTextDir(dir);
  if (d === 'ltr' || d === 'rtl') return d;
  const strong = detectFirstStrongDirection(text);
  return strong === 'rtl' ? 'rtl' : 'ltr';
}

export function normalizeTextDir(dir: unknown): NotebookTextDir {
  if (dir === 'ltr' || dir === 'rtl' || dir === 'auto') return dir;
  return 'auto';
}

/**
 * Minimal strong L/R/AL classification for Latin + Hebrew (+ common scripts).
 * Good enough for Hebrew academic notebooks without a full UCD dependency.
 */
function unicodeBidiClass(cp: number): 'L' | 'R' | 'AL' | 'N' {
  // Hebrew
  if (cp >= 0x0590 && cp <= 0x05ff) return 'R';
  // Arabic / Syriac / Thaana (AL-ish; treat as RTL strong)
  if (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  ) {
    return 'AL';
  }
  // Latin, Greek, Cyrillic, etc. — treat letters as L
  if (
    (cp >= 0x0041 && cp <= 0x005a) ||
    (cp >= 0x0061 && cp <= 0x007a) ||
    (cp >= 0x00c0 && cp <= 0x024f) ||
    (cp >= 0x1e00 && cp <= 0x1eff) ||
    (cp >= 0x0370 && cp <= 0x03ff) ||
    (cp >= 0x0400 && cp <= 0x04ff)
  ) {
    return 'L';
  }
  // CJK + most other letters: L for paragraph base (common academic default)
  if (
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x3400 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  ) {
    return 'L';
  }
  return 'N';
}

/** TipTap attribute definition shared by text blocks. Default auto — no body rewrite. */
export function notebookDirAttribute() {
  return {
    dir: {
      default: 'auto' as NotebookTextDir,
      parseHTML: (el: HTMLElement) =>
        normalizeTextDir(el.getAttribute('data-nb-dir') ?? el.getAttribute('dir')),
      renderHTML: (attrs: Record<string, unknown>) => {
        const dir = normalizeTextDir(attrs.dir);
        // Always emit so DOM + tests can observe; auto uses HTML dir=auto.
        return { dir, 'data-nb-dir': dir };
      },
    },
  };
}

/** CSS for block wrappers — logical alignment; never pollute text content. */
export function notebookDirWrapperProps(
  dir: NotebookTextDir | null | undefined,
  text: string,
  align?: TextAlignment | null,
): {
  dir: 'auto' | 'ltr' | 'rtl';
  'data-nb-dir': NotebookTextDir;
  'data-nb-effective-dir': 'ltr' | 'rtl';
  style: CSSPropertiesLike;
} {
  const normalized = normalizeTextDir(dir);
  const effective = resolveEffectiveDir(normalized, text);
  const style: CSSPropertiesLike = {
    textAlign: align || 'start',
  };
  if (normalized === 'auto') {
    // Let HTML dir=auto drive caret/BiDi; plaintext helps paragraph-level first-strong.
    style.unicodeBidi = 'plaintext';
  } else {
    style.direction = normalized;
    style.unicodeBidi = 'normal';
  }
  return {
    dir: normalized,
    'data-nb-dir': normalized,
    'data-nb-effective-dir': effective,
    style,
  };
}

type CSSPropertiesLike = {
  textAlign: 'start' | 'left' | 'center' | 'right';
  direction?: 'ltr' | 'rtl';
  unicodeBidi?: 'plaintext' | 'normal';
};

/** Math / KaTeX must stay visually LTR inside RTL blocks. */
export const MATH_LTR_ISOLATE_STYLE = {
  direction: 'ltr' as const,
  unicodeBidi: 'isolate' as const,
  textAlign: 'left' as const,
};

export function mathLtrIsolateProps(): {
  dir: 'ltr';
  'data-nb-math-isolate': '1';
  style: typeof MATH_LTR_ISOLATE_STYLE;
} {
  return {
    dir: 'ltr',
    'data-nb-math-isolate': '1',
    style: MATH_LTR_ISOLATE_STYLE,
  };
}

/**
 * Enter / split rule (Phase A):
 * - default new blocks to `auto`
 * - when parent has explicit `ltr`/`rtl`, inherit that on continue/split of same family
 */
export function inheritDirForNewBlock(
  parentDir: unknown,
  opts?: { inheritExplicit?: boolean },
): NotebookTextDir {
  const inherit = opts?.inheritExplicit !== false;
  const d = normalizeTextDir(parentDir);
  if (inherit && (d === 'ltr' || d === 'rtl')) return d;
  return 'auto';
}
