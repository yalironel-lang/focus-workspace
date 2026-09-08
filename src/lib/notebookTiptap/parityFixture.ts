/**
 * Milestone 1 visual-parity fixture — realistic Notebook body exercising
 * every supported dialect construct + RTL Phase A samples.
 * Read-only / sandbox harness only; never persisted by TipTap.
 */

import { serializeRichLine } from '../notebookInlineMarks';
import { CALLOUT_TONES } from '../notebookDialect';

const mark = (
  plain: string,
  marks: { s: number; e: number; t: 'b' | 'i' | 'u' | 's' | 'fs' | 'fg' | 'bg' | 'hl'; v?: string }[],
) => serializeRichLine({ plain, marks });

/** Dedicated RTL / BiDi probe body for parity page “Load RTL fixture”. */
export const RTL_PHASE_A_FIXTURE_BODY = [
  '# RTL Phase A',
  '',
  '## Hebrew / English',
  'שלום עולם',
  'שלום world',
  'world שלום',
  'Hello שלום world',
  '',
  '## Numbers & punctuation',
  'בשנת 2026 המחיר היה 15%',
  'תרגיל 12 בפרק 3',
  'המחיר הוא $50 (או 50₪)',
  'תאריך: 08/09/2026',
  '',
  '## Academic mixed',
  'הפונקציה f(x) היא רציפה',
  'אם f(x) = x² + 2x + 1 אז...',
  'הנוסחה $a^2+b^2$ חשובה',
  '$$ E = mc^2',
  '',
  '## Lists',
  '- פריט ראשון',
  '  - פריט מקונן',
  '    - עומק שניים',
  '1. סעיף א',
  '2. סעיף ב עם English',
  '- [ ] משימה פתוחה',
  '- [x] משימה סגורה',
  '',
  '## Quote / step / callout',
  '> ציטוט בעברית עם English',
  '=> שלב הבא',
  '!concept מושג חשוב עם math $x+1$',
  '!definition הגדרה',
  '',
  'English only paragraph for LTR auto.',
  '12345',
].join('\n');

/** Full parity document for side-by-side CE-preview vs TipTap viewer. */
export const PARITY_FIXTURE_BODY = [
  '# TipTap Shadow Parity',
  '',
  '## Structure & lists',
  'Normal paragraph with padding context.',
  '',
  '  leading and trailing spaces preserved when non-blank  ',
  '',
  '- Bullet depth 0',
  '  - Bullet depth 1',
  '    - Bullet depth 2',
  '1. Ordered first',
  '2. Ordered second',
  '- [ ] Unchecked task',
  '- [x] Checked task',
  '> A quoted line for visual chrome',
  '=> Step forward',
  '---',
  '',
  '## Callouts',
  ...CALLOUT_TONES.map(t => `!${t} Callout tone ${t}`),
  '',
  '## Math',
  '$$ E = mc^2',
  'Inline energy $E=mc^2$ inside prose.',
  '',
  '## Marks',
  mark('Bold Italic Under Strike', [
    { s: 0, e: 4, t: 'b' },
    { s: 5, e: 11, t: 'i' },
    { s: 12, e: 17, t: 'u' },
    { s: 18, e: 24, t: 's' },
  ]),
  mark('Sized and colored', [
    { s: 0, e: 5, t: 'fs', v: '24' },
    { s: 10, e: 17, t: 'fg', v: '#fca5a5' },
  ]),
  mark('Background and highlight', [
    { s: 0, e: 10, t: 'bg', v: '#334155' },
    { s: 15, e: 24, t: 'hl', v: '#fef08a' },
  ]),
  mark('Overlapping nest', [
    { s: 0, e: 15, t: 'b' },
    { s: 4, e: 11, t: 'i' },
  ]),
  '',
  '## Media refs',
  '::img::parity-img-demo::parity demo image::',
  '::hw::parity-hw-demo::',
  '',
  '## RTL Phase A samples',
  ...RTL_PHASE_A_FIXTURE_BODY.split('\n').slice(2),
].join('\n');

export const RTL_OBSERVATION_LINES = [
  'שלום עולם',
  'שלום world',
  'world שלום',
  'בשנת 2026 המחיר היה 15%',
  'הפונקציה f(x) היא רציפה',
  'אם f(x) = x² + 2x + 1 אז...',
  'הנוסחה $a^2+b^2$ חשובה',
  'English with עברית mixed in.',
] as const;
