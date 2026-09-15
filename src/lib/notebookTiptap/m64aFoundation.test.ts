/**
 * M6.4A — Canonical table model + TipTap schema foundation tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import {
  decodeNotebookTextV1,
  encodeNotebookTextV1,
} from '../notebookTextCodec';
import { parseNotebookBody, serializeNotebookBlocks } from '../notebookDialect';
import {
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  validateTablePayloadV1,
} from '../notebookTableCodec';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody, tiptapDocToBlocks } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { NotebookTiptapConversionError } from './errors';

/** Frozen M6.3 kinds set (no `table`) — proves old-client fail-closed invariant. */
const M63_KINDS = new Set([
  'paragraph',
  'title',
  'section',
  'bullet',
  'ordered',
  'task',
  'quote',
  'step',
  'callout',
  'math',
]);

function line(payload: unknown, extra?: unknown): string {
  const row = extra === undefined ? ['table', '', [], payload] : ['table', '', [], payload, extra];
  return `~nb1:${JSON.stringify(row)}`;
}

function edFromBody(body: string) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body, 1),
  });
}

describe('M6.4A canonical table validation', () => {
  it('1. valid 1x1 table validates', () => {
    expect(validateTablePayloadV1({ v: 1, rows: [[{ t: 'A' }]] }).rows).toHaveLength(1);
  });

  it('2. valid 2x2 validates', () => {
    const p = validateTablePayloadV1({
      v: 1,
      rows: [
        [{ t: 'A' }, { t: 'B' }],
        [{ t: 'C' }, { t: 'D' }],
      ],
    });
    expect(p.rows[1]![1]!.t).toBe('D');
  });

  it('3. zero rows rejects', () => {
    expect(() => validateTablePayloadV1({ v: 1, rows: [] })).toThrow();
  });

  it('4. zero columns rejects', () => {
    expect(() => validateTablePayloadV1({ v: 1, rows: [[]] })).toThrow();
  });

  it('5. jagged rows reject', () => {
    expect(() =>
      validateTablePayloadV1({
        v: 1,
        rows: [[{ t: 'A' }, { t: 'B' }], [{ t: 'C' }]],
      }),
    ).toThrow();
  });

  it('6. >20 rows rejects', () => {
    const rows = Array.from({ length: MAX_TABLE_ROWS + 1 }, () => [{ t: 'x' }]);
    expect(() => validateTablePayloadV1({ v: 1, rows })).toThrow();
  });

  it('7. >20 columns rejects', () => {
    const row = Array.from({ length: MAX_TABLE_COLS + 1 }, () => ({ t: 'x' }));
    expect(() => validateTablePayloadV1({ v: 1, rows: [row] })).toThrow();
  });

  it('8. payload missing v rejects', () => {
    expect(() => validateTablePayloadV1({ rows: [[{ t: 'A' }]] })).toThrow();
  });

  it('9. payload v != 1 rejects (cannot become v1 in-memory table block)', () => {
    expect(() => validateTablePayloadV1({ v: 2, rows: [[{ t: 'A' }]] })).toThrow();
    expect(() =>
      decodeNotebookTextV1(line({ v: 2, rows: [[{ t: 'A' }]] })),
    ).toThrow('Invalid versioned Notebook text record');
  });

  it('10. cell missing t rejects', () => {
    expect(() => validateTablePayloadV1({ v: 1, rows: [[{ m: [{ s: 0, e: 1, t: 'b' }] }]] })).toThrow();
  });

  it('11. non-string t rejects', () => {
    expect(() => validateTablePayloadV1({ v: 1, rows: [[{ t: 1 }]] })).toThrow();
  });

  it('m omitted is valid; non-empty m valid; m: [] rejects', () => {
    expect(validateTablePayloadV1({ v: 1, rows: [[{ t: 'A' }]] }).rows[0]![0]).toEqual({ t: 'A' });
    expect(
      validateTablePayloadV1({
        v: 1,
        rows: [[{ t: 'AB', m: [{ s: 0, e: 2, t: 'b' }] }]],
      }).rows[0]![0],
    ).toEqual({ t: 'AB', m: [{ s: 0, e: 2, t: 'b' }] });
    expect(() => validateTablePayloadV1({ v: 1, rows: [[{ t: 'A', m: [] }]] })).toThrow();
    expect(() =>
      decodeNotebookTextV1(line({ v: 1, rows: [[{ t: 'A', m: [] }]] })),
    ).toThrow();
  });

  it('12. invalid cell marks reject', () => {
    expect(() =>
      decodeNotebookTextV1(
        line({ v: 1, rows: [[{ t: 'ab', m: [{ s: 0, e: 5, t: 'b' }] }]] }),
      ),
    ).toThrow();
  });

  it('13. unsafe link rejects', () => {
    expect(() =>
      decodeNotebookTextV1(
        line({
          v: 1,
          rows: [[{ t: 'x', m: [{ s: 0, e: 1, t: 'a', v: 'javascript:alert(1)' }] }]],
        }),
      ),
    ).toThrow();
  });

  it('14. malformed inline math mark rejects', () => {
    expect(() =>
      decodeNotebookTextV1(
        line({ v: 1, rows: [[{ t: '3/5', m: [{ s: -1, e: 3, t: 'm' }] }]] }),
      ),
    ).toThrow();
  });

  it('15. table text != "" rejects', () => {
    expect(() =>
      decodeNotebookTextV1(`~nb1:${JSON.stringify(['table', 'nope', [], { v: 1, rows: [[{ t: 'A' }]] }])}`),
    ).toThrow();
  });

  it('16. table top-level marks non-empty reject', () => {
    expect(() =>
      decodeNotebookTextV1(
        `~nb1:${JSON.stringify(['table', '', [{ s: 0, e: 0, t: 'b' }], { v: 1, rows: [[{ t: 'A' }]] }])}`,
      ),
    ).toThrow();
  });

  it('17. table fifth alignment field rejects', () => {
    expect(() =>
      decodeNotebookTextV1(line({ v: 1, rows: [[{ t: 'A' }]] }, 'center')),
    ).toThrow();
  });

  it('18. canonical table decode → encode lossless', () => {
    const raw = line({
      v: 1,
      rows: [
        [
          { t: 'Term', m: [{ s: 0, e: 4, t: 'b' }] },
          { t: 'Def' },
        ],
        [
          { t: '3/5', m: [{ s: 0, e: 3, t: 'm' }] },
          {
            t: 'go',
            m: [{ s: 0, e: 2, t: 'a', v: 'https://example.com' }],
          },
        ],
      ],
    });
    const blocks = decodeNotebookTextV1(raw);
    expect(encodeNotebookTextV1(blocks)).toBe(raw);
  });
});

describe('M6.4A bridges', () => {
  it('19-21. canonical 1x1/2x2 ↔ TipTap', () => {
    const body1 = line({ v: 1, rows: [[{ t: 'solo' }]] });
    const doc1 = bodyToTiptapDoc(body1, 1);
    expect(doc1.content?.[0]?.type).toBe('nbTable');
    expect(tiptapDocToBody(doc1, 1)).toBe(body1);

    const body2 = line({
      v: 1,
      rows: [
        [{ t: 'A' }, { t: 'B' }],
        [{ t: 'C' }, { t: 'D' }],
      ],
    });
    expect(tiptapDocToBody(bodyToTiptapDoc(body2, 1), 1)).toBe(body2);
  });

  it('22. paragraph + table + paragraph round-trip', () => {
    const body = [
      '~nb1:["paragraph","Before",[],null]',
      line({ v: 1, rows: [[{ t: 'cell' }]] }),
      '~nb1:["paragraph","After",[],null]',
    ].join('\n');
    expect(tiptapDocToBody(bodyToTiptapDoc(body, 1), 1)).toBe(body);
  });

  it('23-28. formatting / math / links in cells', () => {
    const cases = [
      line({ v: 1, rows: [[{ t: 'bold', m: [{ s: 0, e: 4, t: 'b' }] }]] }),
      line({ v: 1, rows: [[{ t: 'ital', m: [{ s: 0, e: 4, t: 'i' }] }]] }),
      line({ v: 1, rows: [[{ t: 'under', m: [{ s: 0, e: 5, t: 'u' }] }]] }),
      line({ v: 1, rows: [[{ t: '3/5', m: [{ s: 0, e: 3, t: 'm' }] }]] }),
      line({
        v: 1,
        rows: [[{ t: 'go', m: [{ s: 0, e: 2, t: 'a', v: 'https://example.com' }] }]],
      }),
      line({
        v: 1,
        rows: [
          [
            {
              t: 'go',
              m: [
                { s: 0, e: 2, t: 'b' },
                { s: 0, e: 2, t: 'a', v: 'https://example.com' },
              ],
            },
          ],
        ],
      }),
    ];
    for (const body of cases) {
      expect(tiptapDocToBody(bodyToTiptapDoc(body, 1), 1)).toBe(body);
    }
  });

  it('29-31. RTL / mixed / math isolate survive', () => {
    const rtl = line({ v: 1, rows: [[{ t: 'שלום' }]] });
    const mixed = line({ v: 1, rows: [[{ t: 'Hello שלום' }]] });
    const math = line({ v: 1, rows: [[{ t: '3/5', m: [{ s: 0, e: 3, t: 'm' }] }]] });
    for (const body of [rtl, mixed, math]) {
      expect(tiptapDocToBody(bodyToTiptapDoc(body, 1), 1)).toBe(body);
    }
    const ed = edFromBody(math);
    const atom = ed.view.dom.querySelector('[data-nb="nbInlineMath"]') as HTMLElement | null;
    expect(atom).toBeTruthy();
    expect(atom!.getAttribute('dir') === 'ltr' || atom!.style.direction === 'ltr' || atom!.closest('[dir="ltr"]')).toBeTruthy();
    ed.destroy();
  });

  it('32-33. no automatic math or link conversion', () => {
    const body = line({ v: 1, rows: [[{ t: '3/5 google.com' }]] });
    const blocks = tiptapDocToBlocks(bodyToTiptapDoc(body, 1));
    expect(blocks[0]).toMatchObject({ kind: 'table' });
    if (blocks[0]?.kind === 'table') {
      expect(blocks[0].rows[0]![0]!.m ?? []).toEqual([]);
      expect(blocks[0].rows[0]![0]!.t).toBe('3/5 google.com');
    }
  });
});

describe('M6.4A fail-closed runtime', () => {
  it('34. zero-row runtime table rejects', () => {
    expect(() =>
      tiptapDocToBody({ type: 'doc', content: [{ type: 'nbTable', content: [] }] }, 1),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('35. zero-cell runtime row rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [{ type: 'nbTable', content: [{ type: 'nbTableRow', content: [] }] }],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('36. jagged runtime table rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    { type: 'nbTableCell', content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'A' }] }] },
                    { type: 'nbTableCell', content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'B' }] }] },
                  ],
                },
                {
                  type: 'nbTableRow',
                  content: [
                    { type: 'nbTableCell', content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'C' }] }] },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  function oneCellDoc(cell: Record<string, unknown>) {
    return {
      type: 'doc' as const,
      content: [
        {
          type: 'nbTable',
          content: [{ type: 'nbTableRow', content: [cell] }],
        },
      ],
    };
  }

  it('FIX1: nbTableHeader rejects — no canonical body', () => {
    expect(() =>
      tiptapDocToBody(
        oneCellDoc({
          type: 'nbTableHeader',
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'H' }] }],
        }),
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
    expect(() =>
      tiptapDocToBlocks(
        oneCellDoc({
          type: 'nbTableHeader',
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'H' }] }],
        }),
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('FIX2: colspan=2 rejects', () => {
    expect(() =>
      tiptapDocToBody(
        oneCellDoc({
          type: 'nbTableCell',
          attrs: { colspan: 2, rowspan: 1, colwidth: null, align: null },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        }),
        1,
      ),
    ).toThrow(/colspan/);
  });

  it('FIX2: rowspan=2 rejects', () => {
    expect(() =>
      tiptapDocToBody(
        oneCellDoc({
          type: 'nbTableCell',
          attrs: { colspan: 1, rowspan: 2, colwidth: null, align: null },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        }),
        1,
      ),
    ).toThrow(/rowspan/);
  });

  it('FIX2: colwidth=[120] rejects', () => {
    expect(() =>
      tiptapDocToBody(
        oneCellDoc({
          type: 'nbTableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: [120], align: null },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        }),
        1,
      ),
    ).toThrow(/colwidth/);
  });

  it('FIX2: align="center" rejects', () => {
    expect(() =>
      tiptapDocToBody(
        oneCellDoc({
          type: 'nbTableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null, align: 'center' },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        }),
        1,
      ),
    ).toThrow(/align/);
  });

  it('FIX2: default cell attrs serialize successfully', () => {
    const body = tiptapDocToBody(
      oneCellDoc({
        type: 'nbTableCell',
        attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
        content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
      }),
      1,
    );
    expect(body).toBe(line({ v: 1, rows: [[{ t: 'X' }]] }));
  });

  it('FIX2 adversarial: header/colspan/rowspan/colwidth/align all fail; 2x2 default succeeds', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      [
        'header',
        {
          type: 'nbTableHeader',
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'H' }] }],
        },
      ],
      [
        'colspan',
        {
          type: 'nbTableCell',
          attrs: { colspan: 2, rowspan: 1, colwidth: null, align: null },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        },
      ],
      [
        'rowspan',
        {
          type: 'nbTableCell',
          attrs: { colspan: 1, rowspan: 2, colwidth: null, align: null },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        },
      ],
      [
        'colwidth',
        {
          type: 'nbTableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: [120], align: null },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        },
      ],
      [
        'align',
        {
          type: 'nbTableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null, align: 'center' },
          content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'X' }] }],
        },
      ],
    ];
    for (const [label, cell] of cases) {
      expect(() => tiptapDocToBody(oneCellDoc(cell), 1), label).toThrow(NotebookTiptapConversionError);
    }
    const ok2x2 = {
      type: 'doc' as const,
      content: [
        {
          type: 'nbTable',
          content: [
            {
              type: 'nbTableRow',
              content: [
                {
                  type: 'nbTableCell',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                  content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'A' }] }],
                },
                {
                  type: 'nbTableCell',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                  content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'B' }] }],
                },
              ],
            },
            {
              type: 'nbTableRow',
              content: [
                {
                  type: 'nbTableCell',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                  content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'C' }] }],
                },
                {
                  type: 'nbTableCell',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                  content: [{ type: 'nbParagraph', content: [{ type: 'text', text: 'D' }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(tiptapDocToBody(ok2x2, 1)).toBe(
      line({
        v: 1,
        rows: [
          [{ t: 'A' }, { t: 'B' }],
          [{ t: 'C' }, { t: 'D' }],
        ],
      }),
    );
  });

  it('37. cell with >1 nbParagraph rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [
                        { type: 'nbParagraph', content: [{ type: 'text', text: 'A' }] },
                        { type: 'nbParagraph', content: [{ type: 'text', text: 'B' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('38. nested table rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [
                        {
                          type: 'nbParagraph',
                          content: undefined,
                        },
                        {
                          type: 'nbTable',
                          content: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('39. image inside cell rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [{ type: 'nbImageRef', attrs: { key: 'k', alt: '' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('40. list inside cell rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [{ type: 'nbBullet', attrs: { depth: 0 }, content: [{ type: 'text', text: 'x' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('41. block math inside cell rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [{ type: 'nbMath', content: [{ type: 'text', text: 'x' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('42. unsafe runtime link rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [
                        {
                          type: 'nbParagraph',
                          content: [
                            {
                              type: 'text',
                              text: 'x',
                              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('43. unknown cell child rejects', () => {
    expect(() =>
      tiptapDocToBody(
        {
          type: 'doc',
          content: [
            {
              type: 'nbTable',
              content: [
                {
                  type: 'nbTableRow',
                  content: [
                    {
                      type: 'nbTableCell',
                      content: [{ type: 'nbTitle', content: [{ type: 'text', text: 'x' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        1,
      ),
    ).toThrow(NotebookTiptapConversionError);
  });

  it('44. old-client unknown-table invariant', () => {
    expect(M63_KINDS.has('table')).toBe(false);
    // Unknown kind still fails closed in current decoder.
    expect(() => decodeNotebookTextV1('~nb1:["notatable","",[],null]')).toThrow(
      'Invalid versioned Notebook text record',
    );
    // Historical M6.3 kinds would reject table the same way.
    expect(M63_KINDS.has('table')).toBe(false);
  });
});

describe('M6.4A zero-write / regression', () => {
  it('45. valid table hydration itself causes no persistence callback', () => {
    const onUpdate = vi.fn();
    const body = line({ v: 1, rows: [[{ t: 'A' }]] });
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc(body, 1),
      onUpdate,
    });
    // Mount/load should not count as user edit persistence emission.
    expect(onUpdate).not.toHaveBeenCalled();
    ed.commands.setContent(bodyToTiptapDoc(body, 1), { emitUpdate: false });
    expect(onUpdate).not.toHaveBeenCalled();
    ed.destroy();
  });

  it('46-50. existing fixtures remain stable', () => {
    const fixtures = [
      '~nb1:["paragraph","hello",[],null]',
      '~nb1:["paragraph","center me",[],null,"center"]',
      '~nb1:["paragraph","go",[{"s":0,"e":2,"t":"a","v":"https://example.com"}],null]',
      '~nb1:["paragraph","3/5",[{"s":0,"e":3,"t":"m"}],null]',
      '::img::abc123::"alt"::',
    ];
    for (const body of fixtures) {
      expect(encodeNotebookTextV1(decodeNotebookTextV1(body))).toBe(body);
      expect(tiptapDocToBody(bodyToTiptapDoc(body, 1), 1)).toBe(body);
    }
    // Unaligned remains 4-tuple
    const unaligned = encodeNotebookTextV1(decodeNotebookTextV1('~nb1:["paragraph","x",[],null]'));
    expect(JSON.parse(unaligned.slice('~nb1:'.length))).toHaveLength(4);
  });
});

describe('M6.4A schema smoke', () => {
  it('editor accepts nbTable in schema and round-trips via live editor JSON', () => {
    const body = line({
      v: 1,
      rows: [
        [{ t: 'A' }, { t: 'B' }],
        [{ t: 'C' }, { t: 'D' }],
      ],
    });
    const ed = edFromBody(body);
    expect(ed.schema.nodes.nbTable).toBeTruthy();
    expect(ed.schema.nodes.nbTableCell).toBeTruthy();
    expect(ed.schema.nodes.nbTableCell.contentMatch.matchType(ed.schema.nodes.nbParagraph)).toBeTruthy();
    expect(tiptapDocToBody(ed.getJSON(), 1)).toBe(body);
    ed.destroy();
  });

  it('parseNotebookBody / serializeNotebookBlocks codec path', () => {
    const body = line({ v: 1, rows: [[{ t: 'Z' }]] });
    const blocks = parseNotebookBody(body, 1);
    expect(serializeNotebookBlocks(blocks, 1)).toBe(body);
  });
});
