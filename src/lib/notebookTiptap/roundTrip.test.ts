import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
  bodyToTiptapDoc,
  roundTripBody,
  roundTripTiptapDoc,
  tiptapDocToBody,
  NotebookTiptapConversionError,
  isNotebookTiptapEditorEnabled,
} from './index';
import { CANONICALIZATION_CASES, GOLDEN_BODIES } from './fixtures';
import { parseNotebookBody, serializeNotebookBlocks } from '../notebookDialect';
import { serializeRichLine } from '../notebookInlineMarks';

describe('notebookTiptap feature flag', () => {
  it('defaults OFF', () => {
    expect(isNotebookTiptapEditorEnabled()).toBe(false);
  });
});

describe('body → TipTap → body (lossless / canonical)', () => {
  for (const [name, body] of Object.entries(GOLDEN_BODIES)) {
    it(`A: ${name}`, () => {
      const once = roundTripBody(body);
      const twice = roundTripBody(once);
      // Stable under re-application
      expect(twice).toBe(once);
      // Prefer byte equality with input; otherwise equal to dialect canonicalize
      const dialectCanonical = serializeNotebookBlocks(parseNotebookBody(body));
      expect(once).toBe(dialectCanonical);
    });
  }

  for (const c of CANONICALIZATION_CASES) {
    it(`canonicalization: ${c.name} — ${c.note}`, () => {
      expect(roundTripBody(c.input)).toBe(c.expectedCanonical);
    });
  }
});

describe('TipTap → body → TipTap (semantic stability)', () => {
  for (const [name, body] of Object.entries(GOLDEN_BODIES)) {
    it(`B: ${name}`, () => {
      const doc = bodyToTiptapDoc(body);
      const again = roundTripTiptapDoc(doc);
      expect(again).toEqual(doc);
    });
  }
});

describe('fail-closed conversion', () => {
  it('rejects hardBreak', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
    try {
      tiptapDocToBody(doc);
    } catch (e) {
      expect(e).toMatchObject({ code: 'hard_break' });
    }
  });

  it('rejects unsupported node', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'table', content: [] }],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
    try {
      tiptapDocToBody(doc);
    } catch (e) {
      expect(e).toMatchObject({ code: 'unsupported_node', detail: 'table' });
    }
  });

  it('rejects unsupported mark', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'code' }] }],
        },
      ],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
    try {
      tiptapDocToBody(doc);
    } catch (e) {
      expect(e).toMatchObject({ code: 'unsupported_mark', detail: 'code' });
    }
  });

  it('rejects bullet depth > 2', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'nbBullet', attrs: { depth: 3 }, content: [{ type: 'text', text: 'too deep' }] }],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
    try {
      tiptapDocToBody(doc);
    } catch (e) {
      expect(e).toMatchObject({ code: 'list_depth' });
    }
  });

  it('rejects malformed adapter input (non-doc root)', () => {
    expect(() => tiptapDocToBody({ type: 'paragraph' })).toThrow(NotebookTiptapConversionError);
    try {
      tiptapDocToBody({ type: 'paragraph' });
    } catch (e) {
      expect(e).toMatchObject({ code: 'malformed_input' });
    }
  });

  it('rejects multi-paragraph-like nested block content', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'nbBullet',
          attrs: { depth: 0 },
          content: [
            { type: 'text', text: 'a' },
            { type: 'nbParagraph', content: [{ type: 'text', text: 'nested' }] },
          ],
        },
      ],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
    try {
      tiptapDocToBody(doc);
    } catch (e) {
      expect(e).toMatchObject({ code: 'multi_block_list_item' });
    }
  });

  it('rejects unsupported heading-like node', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'H3' }] }],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
  });

  it('rejects link mark', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://x' } }] }],
        },
      ],
    };
    expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
  });
});

describe('mark determinism', () => {
  it('same semantic marks produce identical body', () => {
    const a = bodyToTiptapDoc(
      serializeRichFixture('Hello', [
        { s: 0, e: 5, t: 'b' as const },
        { s: 0, e: 5, t: 'i' as const },
      ]),
    );
    const b: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          attrs: { variant: null },
          content: [
            {
              type: 'text',
              text: 'Hello',
              marks: [{ type: 'italic' }, { type: 'bold' }],
            },
          ],
        },
      ],
    };
    // TipTap mark order may differ; body must canonicalize
    expect(tiptapDocToBody(a)).toBe(tiptapDocToBody(b));
  });
});

function serializeRichFixture(
  plain: string,
  marks: { s: number; e: number; t: 'b' | 'i' | 'u' | 's' | 'fs' | 'fg' | 'bg' | 'hl'; v?: string }[],
): string {
  return serializeRichLine({ plain, marks });
}
