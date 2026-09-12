import { Editor, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { GOLDEN_BODIES } from './fixtures';
import { parseNotebookBody } from '../notebookDialect';

/** Characterization only. No escape convention is installed in production. */
const prefixes = [
  ['title', '# literal', 'nbTitle'],
  ['title without space', '#literal', 'nbTitle'],
  ['section', '## literal', 'nbSection'],
  ['extra heading hash', '### literal', 'nbSection'],
  ['divider', '---', 'nbDivider'],
  ['ordered', '7. literal', 'nbOrdered'],
  ['ordered without space', '7.literal', 'nbOrdered'],
  ['bullet', '- literal', 'nbBullet'],
  ['task unchecked', '- [ ] literal', 'nbTask'],
  ['task checked', '- [X] literal', 'nbTask'],
  ['quote', '>literal', 'nbQuote'],
  ['step', '=>literal', 'nbStep'],
  ...['summary', 'concept', 'review', 'definition', 'theorem', 'example', 'mistake']
    .map(tone => [`callout ${tone}`, `!${tone} literal`, 'nbCallout']),
  ['callout no word boundary', '!THEOREMatic', 'nbCallout'],
  ['block math', '$$ x^2', 'nbMath'],
  ['image reference', '::img::img-1::literal::', 'nbImageRef'],
  ['handwriting reference', '::hw::hw-1::', 'nbHandwriting'],
  ['muted paragraph', '¶ literal', 'nbParagraph'],
  ['fine paragraph', '¶¶ literal', 'nbParagraph'],
] as const;

function roundTrip(doc: JSONContent) {
  const editor = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: doc });
  try {
    const body = tiptapDocToBody(editor.getJSON());
    const next = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(body) });
    try { return { body, doc: next.getJSON(), again: tiptapDocToBody(next.getJSON()) }; }
    finally { next.destroy(); }
  } finally { editor.destroy(); }
}
function paragraph(text: string, bold = false): JSONContent {
  return { type: 'doc', content: [{ type: 'nbParagraph', content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] }] };
}
function textOf(doc: JSONContent) { return doc.content?.[0].content?.map(node => node.text ?? '').join('') ?? ''; }

describe('complete dialect-prefix ambiguity inventory (current behavior)', () => {
  for (const [name, text, type] of prefixes) {
    it(`${name}: unmarked paragraph loses type or literal text`, () => {
      const result = roundTrip(paragraph(text));
      expect(result.doc.content?.[0].type).toBe(type);
      expect(result.doc.content?.[0].type !== 'nbParagraph' || textOf(result.doc) !== text).toBe(true);
    });
    it(`${name}: surrounding whitespace is also ambiguous`, () => {
      const literal = `  ${text}  `;
      const result = roundTrip(paragraph(literal));
      expect(result.doc.content?.[0].type !== 'nbParagraph' || textOf(result.doc) !== literal).toBe(true);
    });
    it(`${name}: existing empty mark envelope safely protects this text with Hebrew/math`, () => {
      const literal = `  ${text} שלום English $x^2$  `;
      // This spelling is already accepted by the unchanged legacy line decoder.
      const encoded = `⟨m⟩[]⟨/m⟩${literal}`;
      const parsed = parseNotebookBody(encoded)[0];
      expect(parsed).toMatchObject({ kind: 'paragraph', text: literal });
      // Real schema retains it; today's serializer removes the empty envelope.
      const editor = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(encoded) });
      try { expect(textOf(editor.getJSON())).toBe(literal); }
      finally { editor.destroy(); }
    });
    it(`${name}: a real formatting mark protects type/text and stabilizes`, () => {
      const literal = `  ${text} שלום $x$  `;
      const result = roundTrip(paragraph(literal, true));
      expect(result.doc.content?.[0].type).toBe('nbParagraph');
      expect(textOf(result.doc)).toBe(literal);
      expect(result.doc.content?.[0].content?.[0].marks).toContainEqual({ type: 'bold' });
      expect(result.again).toBe(result.body);
    });
    it(`${name}: mid-paragraph syntax remains literal`, () => {
      const literal = `English שלום $x$ ${text}`;
      const result = roundTrip(paragraph(literal));
      expect(result.doc.content?.[0].type).toBe('nbParagraph');
      expect(textOf(result.doc)).toBe(literal);
      expect(result.again).toBe(result.body);
    });
  }
  it('all existing golden bodies remain byte-stable through the editable schema', () => {
    for (const [name, body] of Object.entries(GOLDEN_BODIES)) {
      const result = roundTrip(bodyToTiptapDoc(body));
      expect(result.body, name).toBe(body);
      expect(result.again, name).toBe(body);
    }
  });
  it.each(['⟨m⟩[]⟨/m⟩', '⟨m⟩{"literal":"# text"}⟨/m⟩', '⟨m⟩not-json⟨/m⟩'])('literal metadata envelope is removed even inside text: %s', marker => {
    const literal = `English ${marker} שלום $x$`;
    const result = roundTrip(paragraph(literal, true));
    expect(textOf(result.doc)).toBe('English  שלום $x$');
    expect(textOf(result.doc)).not.toBe(literal);
  });
  it('an empty mark envelope does not shield literal metadata envelopes inside its payload', () => {
    expect(parseNotebookBody('⟨m⟩[]⟨/m⟩English ⟨m⟩[]⟨/m⟩ שלום')[0]).toMatchObject({ kind: 'paragraph', text: 'English  שלום' });
  });
  it('existing all-whitespace bodies have legacy sentinel semantics', () => {
    expect(parseNotebookBody('\n\n\n').map(block => block.kind)).toEqual(['title', 'paragraph']);
  });
  it('old parser can represent consecutive empty paragraphs with existing mark envelopes', () => {
    const protectedBlanks = Array.from({ length: 3 }, () => '⟨m⟩[]⟨/m⟩').join('\n');
    expect(parseNotebookBody(protectedBlanks).map(block => block.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    const result = roundTrip(bodyToTiptapDoc(protectedBlanks));
    expect(result.doc.content?.map(node => node.type)).toEqual(['nbTitle', 'nbParagraph']);
  });
});
