/**
 * Golden fixtures for Notebook ↔ TipTap lossless round-trip (Milestone 0).
 * Includes realistic stored-body shapes reused from handwriting / image tests.
 */

import { serializeRichLine } from '../notebookInlineMarks';
import { CALLOUT_TONES } from '../notebookDialect';

const mark = (plain: string, marks: Parameters<typeof serializeRichLine>[0]['marks']) =>
  serializeRichLine({ plain, marks });

/** Existing-style realistic body (handwritingQa.test.ts). */
export const REAL_HW_BODY = '# Title\n::hw::hw-abc123::\nParagraph';

/** Existing-style image + handwriting cascade body. */
export const REAL_MEDIA_BODY = '::hw::hw-cascade-key::\n::img::img-cascade-key::alt text::';

export const GOLDEN_BODIES: Record<string, string> = {
  plain_paragraph: 'Hello world',
  blank_paragraph: 'Hello\n\nWorld',
  title: '# Chapter One',
  section_heading: '## Section A',
  divider: 'Before\n---\nAfter',
  bullet_depth_0: '- Item zero',
  bullet_depth_1: '  - Item one',
  bullet_depth_2: '    - Item two',
  bullets_mixed_depth: '- Root\n  - Child\n    - Grandchild\n- Sibling',
  ordered_items: '1. First\n2. Second\n3. Third',
  task_unchecked: '- [ ] Todo',
  task_checked: '- [x] Done',
  quote: '> Quoted line',
  step: '=> Next step',
  ...Object.fromEntries(CALLOUT_TONES.map(t => [`callout_${t}`, `!${t} Callout ${t}`])),
  block_math: '$$ x^2 + y^2 = z^2',
  inline_math_prose: 'Energy $E=mc^2$ matters',
  hebrew: 'שלום עולם',
  hebrew_english: 'Hello שלום world',
  hebrew_numbers: 'תרגיל 12 בפרק 3',
  hebrew_inline_math: 'הנוסחה $a^2+b^2$ חשובה',
  image_ref: '::img::img-abc123::diagram::',
  handwriting_ref: '::hw::hw-xyz789::',
  mark_bold: mark('Bold word', [{ s: 0, e: 4, t: 'b' }]),
  mark_italic: mark('Italic', [{ s: 0, e: 6, t: 'i' }]),
  mark_underline: mark('Under', [{ s: 0, e: 5, t: 'u' }]),
  mark_strike: mark('Strike', [{ s: 0, e: 6, t: 's' }]),
  mark_font_size: mark('Sized', [{ s: 0, e: 5, t: 'fs', v: '24' }]),
  mark_fg: mark('Colored', [{ s: 0, e: 7, t: 'fg', v: '#fca5a5' }]),
  mark_bg: mark('Bg text', [{ s: 0, e: 2, t: 'bg', v: '#334155' }]),
  mark_hl: mark('Highlight', [{ s: 0, e: 9, t: 'hl', v: '#fef08a' }]),
  marks_overlapping: mark('Nesting', [
    { s: 0, e: 7, t: 'b' },
    { s: 2, e: 5, t: 'i' },
  ]),
  marks_multiple_same_range: mark('Multi', [
    { s: 0, e: 5, t: 'b' },
    { s: 0, e: 5, t: 'i' },
    { s: 0, e: 5, t: 'u' },
  ]),
  leading_trailing_ws: '  padded text  ',
  consecutive_blanks: 'A\n\n\nB',
  title_with_marks: `# ${mark('Title', [{ s: 0, e: 5, t: 'b' }])}`,
  paragraph_variants: '\u00b6 muted line\n\u00b6\u00b6 fine line',
  realistic_multi_block: [
    '# Linear Algebra',
    '',
    '## Vectors',
    'A vector $v$ in $\\mathbb{R}^n$.',
    '',
    '- Basis',
    '  - Orthogonal',
    '    - Orthonormal',
    '1. Define $T$',
    '2. Check linearity',
    '- [ ] Prove injectivity',
    '- [x] Sketch nullspace',
    '> Remember the kernel',
    '=> Write the matrix',
    '!definition A linear map preserves addition.',
    '!theorem Rank-nullity holds.',
    '!example Take the zero map.',
    '!mistake Confusing row and column space.',
    '!concept Span is a subspace.',
    '!summary Key idea: dimension.',
    '!review Revisit bases.',
    '$$ \\mathrm{rank}(T)+\\mathrm{nullity}(T)=n',
    '---',
    '::img::img-board-1::whiteboard::',
    '::hw::hw-sketch-1::',
    mark('Emphasize this', [
      { s: 0, e: 9, t: 'b' },
      { s: 10, e: 14, t: 'hl', v: '#bbf7d0' },
    ]),
    'עברית mixed with English 42',
  ].join('\n'),
  real_hw_body: REAL_HW_BODY,
  real_media_body: REAL_MEDIA_BODY,
};

/**
 * Canonicalization notes (parser already normalizes these):
 * - whitespace-only lines → blank paragraph (`""`)
 * - ordered sequences renumbered on serialize
 * - NBSP → regular space
 * - empty doc (`""`) ↔ title + blank paragraph in TipTap, serializes back to `""`
 */
export const CANONICALIZATION_CASES: Array<{
  name: string;
  input: string;
  expectedCanonical: string;
  note: string;
}> = [
  {
    name: 'whitespace_only_line',
    input: 'A\n   \nB',
    expectedCanonical: 'A\n\nB',
    note: 'Whitespace-only lines parse as blank and serialize empty',
  },
  {
    name: 'ordered_renumber',
    input: '3. First\n9. Second',
    expectedCanonical: '3. First\n4. Second',
    note: 'normalizeOrderedSequences continues from first item number',
  },
  {
    name: 'nbsp_normalized',
    input: 'Hello\u00a0world',
    expectedCanonical: 'Hello world',
    note: 'NBSP normalized to space on parse',
  },
  {
    name: 'empty_body',
    input: '',
    expectedCanonical: '',
    note: 'Empty body maps to title+paragraph in TipTap and back to ""',
  },
  {
    name: 'task_X_to_x',
    input: '- [X] Done',
    expectedCanonical: '- [x] Done',
    note: 'Checked marker canonicalizes to lowercase x',
  },
];
