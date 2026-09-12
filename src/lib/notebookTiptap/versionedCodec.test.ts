import { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { parseNotebookBody, serializeNotebookBlocks, type NotebookDialectBlock } from '../notebookDialect';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { inspectCandidatePersistence } from './candidatePersistenceDryRun';
import { GOLDEN_BODIES } from './fixtures';
import { referencedNotebookImageKeys } from '../notebookImageRefs';
import { referencedHandwritingKeys } from '../handwritingTypes';

const prefixes = ['#', '##', '###', '---', '7.', '- ', '- [ ]', '- [x]', '- [X]', '>', '=>',
  ...['summary', 'concept', 'review', 'definition', 'theorem', 'example', 'mistake'].map(t => `!${t}`),
  '!THEOREMatic', '$$', '::img::img-literal::alt::', '::hw::hw-literal::', '¶', '¶¶',
  '⟨m⟩[{"s":0,"e":3,"t":"b"}]⟨/m⟩', '~nb1:["paragraph","text",[],null]', '\\n\\"\\'];
const paragraph = (text: string): NotebookDialectBlock => ({ id: 'p', kind: 'paragraph', text });
function editableRoundTrip(blocks: NotebookDialectBlock[]) {
  let body = serializeNotebookBlocks(blocks, 1);
  for (let cycle = 0; cycle < 3; cycle++) {
    const editor = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(body, 1) });
    try {
      expect(inspectCandidatePersistence(body, editor.getJSON(), 1)).toMatchObject({
        status: 'serializable', sourceRoundTripSafe: true, candidateRoundTripSafe: true, canonicalEqual: true,
      });
      const next = tiptapDocToBody(editor.getJSON(), 1);
      expect(next).toBe(body);
      body = next;
    } finally { editor.destroy(); }
  }
  expect(parseNotebookBody(body, 1)).toEqual(parseNotebookBody(serializeNotebookBlocks(blocks, 1), 1));
}
describe('versioned canonical codec through actual editable schema', () => {
  for (const prefix of prefixes) {
    const variants = [prefix, `${prefix} text`, `${prefix} שלום`, `${prefix} English`, `${prefix}$x^2$`,
      `  ${prefix}\u00a0 `, `English שלום ${prefix}`, `${prefix} ~nb1:\\n\\"`, `${prefix} ⟨m⟩[]⟨/m⟩`, `${prefix}\n\n${prefix}`];
    for (const [index, text] of variants.entries()) {
      it(`${prefix}: literal variant ${index}`, () => editableRoundTrip([paragraph(text)]));
    }
    it(`${prefix}: formatted literal`, () => editableRoundTrip([{ ...paragraph(prefix), marks: [{ s: 0, e: prefix.length, t: 'b' }] } as NotebookDialectBlock]));
  }
  it('preserves empty and consecutive empty blocks, whitespace, CR/LF, NBSP, and escape characters', () => {
    editableRoundTrip(['', '', ' ', '\t\u00a0 ', '\n\n', '\r\n', '\\"', 'שלום English $x$', '', ''].map(paragraph));
    expect(serializeNotebookBlocks([], 1)).toBe('');
    expect(serializeNotebookBlocks([paragraph('')], 1)).toBe('');
    expect(parseNotebookBody('', 1)).toEqual([]);
  });
  it('round-trips empty document and lone empty paragraph through actual TipTap schema without drift', () => {
    editableRoundTrip([]);
    editableRoundTrip([paragraph('')]);
    expect(bodyToTiptapDoc('', 1)).toEqual({ type: 'doc', content: [{ type: 'nbParagraph' }] });
    expect(tiptapDocToBody({ type: 'doc', content: [{ type: 'nbParagraph' }] }, 1)).toBe('');
  });
  it('round-trips CRLF line endings without corrupting divider, handwriting, or image records', () => {
    const blocks: NotebookDialectBlock[] = [
      paragraph('Line 1'),
      { id: 'd', kind: 'divider' },
      { id: 'hw', kind: 'handwriting', key: 'hw-1' },
      { id: 'img', kind: 'image-ref', key: 'img-1', alt: 'alt text' },
      paragraph('Line 2'),
    ];
    const lfBody = serializeNotebookBlocks(blocks, 1);
    const crlfBody = lfBody.replace(/\n/g, '\r\n');
    expect(parseNotebookBody(crlfBody, 1)).toEqual(parseNotebookBody(lfBody, 1));
    expect(serializeNotebookBlocks(parseNotebookBody(crlfBody, 1), 1)).toBe(lfBody);
  });
  for (const [name, body] of Object.entries(GOLDEN_BODIES)) {
    it(`true structural/mark fixture ${name}`, () => editableRoundTrip(parseNotebookBody(body)));
    it(`legacy golden remains unchanged ${name}`, () => {
      const editor = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(body) });
      try { expect(tiptapDocToBody(editor.getJSON())).toBe(body); } finally { editor.destroy(); }
    });
  }
  it('preserves image alt whitespace and reference-like text without creating literal assets', () => {
    const blocks: NotebookDialectBlock[] = [paragraph('::img::img-literal::alt::'), paragraph('::hw::hw-literal::'),
      { id: 'img', kind: 'image-ref', key: 'img-real', alt: '  שלום\n::hw::hw-fake::\n"\\\u00a0  ' },
      { id: 'hw', kind: 'handwriting', key: 'hw-real' }];
    editableRoundTrip(blocks);
    const body = serializeNotebookBlocks(blocks, 1);
    expect([...referencedNotebookImageKeys(body)]).toEqual(['img-real']);
    expect([...referencedHandwritingKeys(body)]).toEqual(['hw-real']);
  });
  it('does not infer version from text and rejects unsupported versions', () => {
    const body = serializeNotebookBlocks([paragraph('# literal')], 1);
    expect(parseNotebookBody(body)[0]).toMatchObject({ kind: 'paragraph', text: body });
    expect(() => parseNotebookBody(body, 2)).toThrow('Unsupported');
    expect(() => parseNotebookBody('# legacy', 1)).toThrow();
  });
  it('dry-run has no storage side effects', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.spyOn(indexedDB, 'open');
    try { editableRoundTrip([paragraph('# literal ⟨m⟩[]⟨/m⟩')]); expect(write).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled(); }
    finally { write.mockRestore(); open.mockRestore(); }
  });
});
