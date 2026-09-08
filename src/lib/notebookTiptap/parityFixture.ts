/**
 * Milestone 1 visual-parity fixture — realistic Notebook body exercising
 * every supported dialect construct + Hebrew observation samples.
 * Read-only harness only; never persisted by the shadow renderer.
 */

import { serializeRichLine } from '../notebookInlineMarks';
import { CALLOUT_TONES } from '../notebookDialect';

const mark = (
  plain: string,
  marks: { s: number; e: number; t: 'b' | 'i' | 'u' | 's' | 'fs' | 'fg' | 'bg' | 'hl'; v?: string }[],
) => serializeRichLine({ plain, marks });

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
  '## RTL observation (no RTL implementation)',
  'שלום עולם',
  'Hello שלום world',
  'תרגיל 12 בפרק 3',
  'הנוסחה $a^2+b^2$ חשובה',
  'English with עברית mixed in.',
].join('\n');

export const RTL_OBSERVATION_LINES = [
  'שלום עולם',
  'Hello שלום world',
  'תרגיל 12 בפרק 3',
  'הנוסחה $a^2+b^2$ חשובה',
  'English with עברית mixed in.',
] as const;
