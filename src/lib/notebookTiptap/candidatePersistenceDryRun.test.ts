import { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { GOLDEN_BODIES } from './fixtures';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { inspectCandidatePersistence } from './candidatePersistenceDryRun';
import { tiptapDocToBody } from './tiptapDocToBody';

describe('M5.1 dry-run through the actual editable candidate schema', () => {
  for (const [name, body] of Object.entries(GOLDEN_BODIES)) {
    it(`unchanged fixture: ${name}`, () => {
      const editor = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc(body) });
      try {
        const result = inspectCandidatePersistence(body, editor.getJSON());
        expect(result).toMatchObject({ status: 'serializable', canonicalEqual: true, sourceRoundTripSafe: true, candidateRoundTripSafe: true });
        expect(inspectCandidatePersistence(body, editor.getJSON())).toEqual(result);
      } finally { editor.destroy(); }
    });
  }
  it.each(['# Literal title', '## Literal section', '---', '- item', '- [ ] literal', '=> literal', '!theorem literal', '::hw::hw-literal::'])('detects paragraph reclassification on reload: %s', text => {
    const editor = new Editor({ extensions: createNotebookTiptapSandboxExtensions(), content: bodyToTiptapDoc('Original') });
    try {
      editor.commands.setTextSelection({ from: 1, to: 9 });
      editor.commands.insertContent(text);
      expect(editor.getJSON().content?.[0].type).toBe('nbParagraph');
      const result = inspectCandidatePersistence('Original', editor.getJSON());
      expect(result).toMatchObject({ status: 'serializable', canonicalEqual: false, candidateRoundTripSafe: false });
      expect(bodyToTiptapDoc(tiptapDocToBody(editor.getJSON())).content?.[0].type).not.toBe('nbParagraph');
    } finally { editor.destroy(); }
  });
  it('detects unsupported nodes without producing a body', () => {
    expect(inspectCandidatePersistence('', { type: 'doc', content: [{ type: 'table' }] })).toMatchObject({ status: 'unserializable' });
  });
  it('records the existing all-blank-body collapse instead of claiming byte equality', () => {
    const result = inspectCandidatePersistence('\n\n\n', bodyToTiptapDoc('\n\n\n'));
    expect(result).toMatchObject({ status: 'serializable', candidateBody: '', sourceRoundTripSafe: false, diff: { same: false, originalLineCount: 4, serializedLineCount: 1 } });
  });
  it('rejects losing three consecutive empty paragraph blocks on reload', () => {
    const doc = { type: 'doc', content: Array.from({ length: 3 }, () => ({ type: 'nbParagraph' })) };
    expect(inspectCandidatePersistence('', doc)).toMatchObject({ status: 'serializable', candidateRoundTripSafe: false });
  });
  it('dry-run inspection does not write storage or open IndexedDB', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.spyOn(indexedDB, 'open');
    try {
      const doc = bodyToTiptapDoc('Unchanged');
      inspectCandidatePersistence('Unchanged', doc);
      inspectCandidatePersistence('Unchanged', doc);
      expect(write).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    } finally { write.mockRestore(); open.mockRestore(); }
  });

});
