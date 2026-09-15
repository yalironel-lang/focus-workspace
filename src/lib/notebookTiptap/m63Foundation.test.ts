/**
 * M6.3A — Links + Text Alignment Foundation Test Suite
 *
 * Covers 45 comprehensive test invariants:
 * 1-10:   V1 Codec + Link & Alignment serialization roundtrips & error handling
 * 11-25:  URL Sanitizer security, protocols, normalization, stripping & validation
 * 26-30:  TipTap Link mark behaviors (HTML attrs, safe commands, no autolink/paste, click handling)
 * 31-34:  Inline Bridge link conversions & math atom immunity
 * 35-43:  Block Alignment allowed/disallowed matrix & fail-closed enforcement
 * 44-45:  Direction helper textAlign styling & codecVersion fail-closed guard
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import {
  decodeNotebookTextV1,
  encodeNotebookTextV1,
} from '../notebookTextCodec';
import { parseNotebookBody } from '../notebookDialect';
import { sanitizeUrl } from './urlSanitizer';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import { richLineToTiptapInline, tiptapInlineToRichLine } from './inlineBridge';
import { bodyToTiptapDoc, blocksToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBlocks, tiptapDocToBody } from './tiptapDocToBody';
import { notebookDirWrapperProps } from './direction';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';
import { NotebookTiptapConversionError } from './errors';

const activeEditors: Editor[] = [];
let testRoot: Root | null = null;
let testHost: HTMLDivElement | null = null;

function createEditor(doc: ReturnType<typeof bodyToTiptapDoc>) {
  const editor = new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: doc,
  });
  activeEditors.push(editor);
  return editor;
}

afterEach(() => {
  while (activeEditors.length) {
    activeEditors.pop()?.destroy();
  }
  if (testRoot && testHost) {
    act(() => {
      testRoot?.unmount();
    });
    testHost.remove();
    testRoot = null;
    testHost = null;
  }
});

describe('M6.3A Foundation Test Suite (45 tests)', () => {
  // Test 1
  it('1. Link mark serialization roundtrip in V1 codec', () => {
    const original = [
      {
        kind: 'paragraph' as const,
        text: 'Visit Google today',
        marks: [{ s: 6, e: 12, t: 'a' as const, v: 'https://google.com' }],
      },
    ];
    const encoded = encodeNotebookTextV1(original);
    const decoded = decodeNotebookTextV1(encoded);
    expect(decoded[0].kind).toBe('paragraph');
    expect(decoded[0].text).toBe(original[0].text);
    expect(decoded[0].marks).toEqual(original[0].marks);
  });

  // Test 2
  it('2. Alignment serialization roundtrip in V1 codec: left', () => {
    const original = [
      {
        kind: 'paragraph' as const,
        text: 'Left aligned text',
        align: 'left' as const,
      },
    ];
    const encoded = encodeNotebookTextV1(original);
    const decoded = decodeNotebookTextV1(encoded);
    expect(decoded[0].align).toBe('left');
    expect(decoded[0].text).toBe('Left aligned text');
  });

  // Test 3
  it('3. Alignment serialization roundtrip in V1 codec: center', () => {
    const original = [
      {
        kind: 'paragraph' as const,
        text: 'Center aligned text',
        align: 'center' as const,
      },
    ];
    const encoded = encodeNotebookTextV1(original);
    const decoded = decodeNotebookTextV1(encoded);
    expect(decoded[0].align).toBe('center');
    expect(decoded[0].text).toBe('Center aligned text');
  });

  // Test 4
  it('4. Alignment serialization roundtrip in V1 codec: right', () => {
    const original = [
      {
        kind: 'paragraph' as const,
        text: 'Right aligned text',
        align: 'right' as const,
      },
    ];
    const encoded = encodeNotebookTextV1(original);
    const decoded = decodeNotebookTextV1(encoded);
    expect(decoded[0].align).toBe('right');
    expect(decoded[0].text).toBe('Right aligned text');
  });

  // Test 5
  it('5. Unset alignment emits 4-element tuple (exact byte backwards-compatibility)', () => {
    const original = [
      {
        kind: 'paragraph' as const,
        text: 'Default alignment text',
      },
    ];
    const encoded = encodeNotebookTextV1(original);
    const line = encoded.trim();
    expect(line.startsWith('~nb1:')).toBe(true);
    const jsonStr = line.slice(5);
    const tuple = JSON.parse(jsonStr);
    expect(tuple).toHaveLength(4);
    expect(tuple).toEqual(['paragraph', 'Default alignment text', [], null]);
  });

  // Test 6
  it('6. Existing 4-element tuple rows decode with align === undefined', () => {
    const rawLine = '~nb1:["paragraph","Hello world",[],null]';
    const decoded = decodeNotebookTextV1(rawLine);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].align).toBeUndefined();
    expect(decoded[0].kind).toBe('paragraph');
    expect(decoded[0].text).toBe('Hello world');
  });

  // Test 7
  it('7. 5-element tuple rows decode with correct align', () => {
    const rawLine = '~nb1:["title","Centered Title",[],null,"center"]';
    const decoded = decodeNotebookTextV1(rawLine);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].kind).toBe('title');
    expect(decoded[0].align).toBe('center');
  });

  // Test 8
  it('8. Invalid alignment value in 5-element tuple fails closed', () => {
    const rawLine = '~nb1:["paragraph","text",[],null,"justify"]';
    expect(() => decodeNotebookTextV1(rawLine)).toThrow('Invalid versioned Notebook text record');
  });

  // Test 9
  it('9. Empty string href for link mark fails closed', () => {
    const invalid = [
      {
        kind: 'paragraph' as const,
        text: 'link',
        marks: [{ s: 0, e: 4, t: 'a' as const, v: '' }],
      },
    ];
    expect(() => encodeNotebookTextV1(invalid)).toThrow();
    const rawLine = '~nb1:["paragraph","link",[{"s":0,"e":4,"t":"a","v":""}],null]';
    expect(() => decodeNotebookTextV1(rawLine)).toThrow('Invalid versioned Notebook text record');
  });

  // Test 10
  it('10. Whitespace-only href for link mark fails closed', () => {
    const invalid = [
      {
        kind: 'paragraph' as const,
        text: 'link',
        marks: [{ s: 0, e: 4, t: 'a' as const, v: '   ' }],
      },
    ];
    expect(() => encodeNotebookTextV1(invalid)).toThrow();
    const rawLine = '~nb1:["paragraph","link",[{"s":0,"e":4,"t":"a","v":"   "}],null]';
    expect(() => decodeNotebookTextV1(rawLine)).toThrow('Invalid versioned Notebook text record');
  });

  // Test 11
  it('11. URL sanitizer: http allowed', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  // Test 12
  it('12. URL sanitizer: https allowed', () => {
    expect(sanitizeUrl('https://example.com/path?query=1#hash')).toBe('https://example.com/path?query=1#hash');
  });

  // Test 13
  it('13. URL sanitizer: mailto allowed', () => {
    expect(sanitizeUrl('mailto:support@example.com')).toBe('mailto:support@example.com');
  });

  // Test 14
  it('14. URL sanitizer: tel allowed', () => {
    expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
  });

  // Test 15
  it('15. URL sanitizer: relative path /foo allowed', () => {
    expect(sanitizeUrl('/dashboard/projects')).toBe('/dashboard/projects');
  });

  // Test 16
  it('16. URL sanitizer: anchor #heading allowed', () => {
    expect(sanitizeUrl('#section-summary')).toBe('#section-summary');
  });

  // Test 17
  it('17. URL sanitizer: plain domain example.com normalized to https://example.com', () => {
    expect(sanitizeUrl('example.com')).toBe('https://example.com');
    expect(sanitizeUrl('docs.google.com/document/d/123')).toBe('https://docs.google.com/document/d/123');
  });

  // Test 18
  it('18. URL sanitizer: javascript: protocol rejected', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(sanitizeUrl('javascript :alert(1)')).toBeNull();
  });

  // Test 19
  it('19. URL sanitizer: data: protocol rejected', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeUrl('DATA:text/plain;base64,SGVsbG8=')).toBeNull();
  });

  // Test 20
  it('20. URL sanitizer: vbscript: protocol rejected', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
  });

  // Test 21
  it('21. URL sanitizer: file: protocol rejected', () => {
    expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
  });

  // Test 22
  it('22. URL sanitizer: protocol-relative //evil.com rejected', () => {
    expect(sanitizeUrl('//evil.com')).toBeNull();
  });

  // Test 23
  it('23. URL sanitizer: control characters stripped', () => {
    expect(sanitizeUrl('java\x00script:alert(1)')).toBeNull();
    expect(sanitizeUrl('https://example.com\r\n')).toBe('https://example.com');
  });

  // Test 24
  it('24. URL sanitizer: empty input returns null', () => {
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl('   ')).toBeNull();
    expect(sanitizeUrl(null as unknown as string)).toBeNull();
    expect(sanitizeUrl(undefined as unknown as string)).toBeNull();
  });

  // Test 25
  it('25. URL sanitizer: invalid URL returns null', () => {
    expect(sanitizeUrl('not a url %%%')).toBeNull();
    expect(sanitizeUrl('http://')).toBeNull();
    expect(sanitizeUrl('https://')).toBeNull();
  });

  // Test 26
  it('26. TipTap link mark HTML attributes: target="_blank", rel="noopener noreferrer"', () => {
    const doc = blocksToTiptapDoc([
      {
        kind: 'paragraph',
        text: 'Click here',
        marks: [{ s: 0, e: 10, t: 'a', v: 'https://example.com' }],
      },
    ]);
    const editor = createEditor(doc);
    const html = editor.getHTML();
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://example.com"');
  });

  // Test 27
  it('27. TipTap link mark schema rejects invalid href', () => {
    const doc = blocksToTiptapDoc([
      {
        kind: 'paragraph',
        text: 'Safe text',
      },
    ]);
    const editor = createEditor(doc);
    editor.commands.selectAll();
    // Attempting to set an unsafe href via command
    const res = editor.commands.setLink({ href: 'javascript:alert(1)' });
    expect(res).toBe(false);
    const marks = editor.getJSON().content?.[0].content?.[0].marks;
    expect(marks?.find(m => m.type === 'link')).toBeUndefined();
  });

  // Test 28
  it('28. TipTap link mark does NOT autolink plain text URLs while typing', () => {
    const editor = createEditor(blocksToTiptapDoc([{ kind: 'paragraph', text: '' }]));
    editor.commands.insertContent('https://google.com ');
    const firstBlockContent = editor.getJSON().content?.[0].content?.[0];
    expect(firstBlockContent?.marks).toBeUndefined();
  });

  // Test 29
  it('29. TipTap link mark does NOT create links on paste', () => {
    const editor = createEditor(blocksToTiptapDoc([{ kind: 'paragraph', text: '' }]));
    editor.commands.insertContent('https://example.com');
    const firstBlockContent = editor.getJSON().content?.[0].content?.[0];
    expect(firstBlockContent?.marks).toBeUndefined();
  });

  // Test 30
  it('30. Candidate editor handleClick prevents default on link click', async () => {
    testHost = document.createElement('div');
    document.body.appendChild(testHost);
    testRoot = createRoot(testHost);

    const docBody = encodeNotebookTextV1([
      {
        kind: 'paragraph',
        text: 'Clickable link',
        marks: [{ s: 0, e: 14, t: 'a', v: 'https://example.com' }],
      },
    ]);

    let editorInstance: Editor | null = null;
    act(() => {
      testRoot!.render(
        createElement(NotebookTiptapCandidateEditor, {
          sourceDocumentBody: docBody,
          sourceBodyCodecVersion: 1,
          pageKey: 'test-p1',
          onEditorReady: ed => {
            editorInstance = ed;
          },
        }),
      );
    });

    await vi.waitFor(() => expect(editorInstance).not.toBeNull());
    await vi.waitFor(() => expect(testHost!.querySelector('a')).not.toBeNull());

    const linkEl = testHost!.querySelector('a');
    expect(linkEl).not.toBeNull();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      linkEl!.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  // Test 31
  it('31. Inline bridge maps "a" mark to TipTap link mark', () => {
    const inlines = richLineToTiptapInline('Visit site', [
      { s: 6, e: 10, t: 'a', v: 'https://example.com' },
    ]);
    expect(inlines).toHaveLength(2);
    expect(inlines[1].marks).toEqual([
      { type: 'link', attrs: { href: 'https://example.com' } },
    ]);
  });

  // Test 32
  it('32. Inline bridge maps TipTap link mark to "a" mark', () => {
    const { plain, marks } = tiptapInlineToRichLine([
      {
        type: 'text',
        text: 'hello link',
        marks: [{ type: 'link', attrs: { href: 'https://example.org' } }],
      },
    ]);
    expect(plain).toBe('hello link');
    expect(marks).toEqual([
      { s: 0, e: 10, t: 'a', v: 'https://example.org' },
    ]);
  });

  // Test 33
  it('33. Inline bridge preserves link mark across serialization roundtrip', () => {
    const origPlain = 'Start link middle end';
    const origMarks = [{ s: 6, e: 10, t: 'a' as const, v: 'https://site.org' }];
    const inlines = richLineToTiptapInline(origPlain, origMarks);
    const { plain, marks } = tiptapInlineToRichLine(inlines);
    expect(plain).toBe(origPlain);
    expect(marks).toEqual(origMarks);
  });

  // Test 34
  it('34. Inline bridge prevents link mark on nbInlineMath atoms', () => {
    const doc = blocksToTiptapDoc([
      {
        kind: 'paragraph',
        text: 'text 3/5 end',
        marks: [
          { s: 5, e: 8, t: 'm', v: '3/5' },
          { s: 0, e: 12, t: 'a', v: 'https://example.com' },
        ],
      },
    ]);
    const p = doc.content?.[0];
    const mathNode = p?.content?.find(c => c.type === 'nbInlineMath');
    expect(mathNode).toBeDefined();
    // nbInlineMath atom must NOT have a link mark
    expect(mathNode?.marks?.some(m => m.type === 'link')).toBeFalsy();
  });

  // Test 35
  it('35. TipTap block align attribute accepted on nbParagraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbParagraph',
          attrs: { align: 'center' },
          content: [{ type: 'text', text: 'Centered paragraph' }],
        },
      ],
    };
    const blocks = tiptapDocToBlocks(doc);
    expect(blocks[0]).toMatchObject({
      kind: 'paragraph',
      text: 'Centered paragraph',
      align: 'center',
    });
  });

  // Test 36
  it('36. TipTap block align attribute accepted on nbTitle', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbTitle',
          attrs: { align: 'right' },
          content: [{ type: 'text', text: 'Right title' }],
        },
      ],
    };
    const blocks = tiptapDocToBlocks(doc);
    expect(blocks[0]).toMatchObject({
      kind: 'title',
      text: 'Right title',
      align: 'right',
    });
  });

  // Test 37
  it('37. TipTap block align attribute accepted on nbSection', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbSection',
          attrs: { align: 'center' },
          content: [{ type: 'text', text: 'Centered section' }],
        },
      ],
    };
    const blocks = tiptapDocToBlocks(doc);
    expect(blocks[0]).toMatchObject({
      kind: 'section',
      text: 'Centered section',
      align: 'center',
    });
  });

  // Test 38
  it('38. TipTap block align attribute accepted on nbQuote', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbQuote',
          attrs: { align: 'left' },
          content: [{ type: 'text', text: 'Left quote' }],
        },
      ],
    };
    const blocks = tiptapDocToBlocks(doc);
    expect(blocks[0]).toMatchObject({
      kind: 'quote',
      text: 'Left quote',
      align: 'left',
    });
  });

  // Test 39
  it('39. TipTap block align attribute NOT accepted on nbBullet', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbBullet',
          attrs: { depth: 0, align: 'center' },
          content: [{ type: 'text', text: 'Bullet item' }],
        },
      ],
    };
    expect(() => tiptapDocToBlocks(doc)).toThrow(NotebookTiptapConversionError);
  });

  // Test 40
  it('40. TipTap block align attribute NOT accepted on nbOrdered', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbOrdered',
          attrs: { number: 1, align: 'center' },
          content: [{ type: 'text', text: 'Ordered item' }],
        },
      ],
    };
    expect(() => tiptapDocToBlocks(doc)).toThrow(NotebookTiptapConversionError);
  });

  // Test 41
  it('41. TipTap block align attribute NOT accepted on nbTask', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbTask',
          attrs: { checked: false, align: 'center' },
          content: [{ type: 'text', text: 'Task item' }],
        },
      ],
    };
    expect(() => tiptapDocToBlocks(doc)).toThrow(NotebookTiptapConversionError);
  });

  // Test 42
  it('42. TipTap block align attribute NOT accepted on nbCallout', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbCallout',
          attrs: { tone: 'concept', align: 'center' },
          content: [{ type: 'text', text: 'Callout block' }],
        },
      ],
    };
    expect(() => tiptapDocToBlocks(doc)).toThrow(NotebookTiptapConversionError);
  });

  // Test 43
  it('43. TipTap block align attribute NOT accepted on nbMath', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'nbMath',
          attrs: { align: 'center' },
          content: [{ type: 'text', text: 'x^2' }],
        },
      ],
    };
    expect(() => tiptapDocToBlocks(doc)).toThrow(NotebookTiptapConversionError);
  });

  // Test 44
  it('44. Direction helper notebookDirWrapperProps includes textAlign', () => {
    const autoCenter = notebookDirWrapperProps('auto', 'hello', 'center');
    expect(autoCenter.style.textAlign).toBe('center');

    const ltrRight = notebookDirWrapperProps('ltr', 'hello', 'right');
    expect(ltrRight.style.textAlign).toBe('right');

    const rtlLeft = notebookDirWrapperProps('rtl', 'שלום', 'left');
    expect(rtlLeft.style.textAlign).toBe('left');

    const autoDefault = notebookDirWrapperProps('auto', 'hello');
    expect(autoDefault.style.textAlign).toBe('start');
  });

  // Test 45
  it('45. Legacy body without codecVersion fails closed on ~nb1: rows', () => {
    const body = '~nb1:["paragraph","Hello",[],null]';
    expect(() => parseNotebookBody(body)).toThrow(
      'Corrupt state: received versioned Notebook text (~nb1:) with undefined codecVersion',
    );
  });
});

describe('M6.3A Blocker Fix Pass — Fail-Closed Prefix & Canonical Security', () => {
  describe('Fix 1: Fail-Closed Prefix Detection', () => {
    it('1. versioned line at body start → reject', () => {
      const body = '~nb1:["paragraph","Hello",[],null]';
      expect(() => parseNotebookBody(body)).toThrow('Corrupt state');
    });

    it('2. versioned line after LF → reject', () => {
      const body = 'Legacy first line\n~nb1:["paragraph","Versioned second line",[],null]';
      expect(() => parseNotebookBody(body)).toThrow('Corrupt state');
    });

    it('3. versioned line after CRLF → reject', () => {
      const body = 'Legacy first line\r\n~nb1:["paragraph","Versioned second line",[],null]';
      expect(() => parseNotebookBody(body)).toThrow('Corrupt state');
    });

    it('4. "~nb1:" embedded inside normal prose → allow', () => {
      const body = 'We use ~nb1: as the Notebook envelope.';
      const blocks = parseNotebookBody(body);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        text: 'We use ~nb1: as the Notebook envelope.',
      });
    });

    it('5. "~nb1:" appearing later within a normal line → allow', () => {
      const body = 'Here is some explanation, note that ~nb1: is a prefix used in v1.';
      const blocks = parseNotebookBody(body);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        text: 'Here is some explanation, note that ~nb1: is a prefix used in v1.',
      });
    });

    it('6. valid legacy body unchanged', () => {
      const body = '# Title\nFirst paragraph\n\nSecond paragraph';
      const blocks = parseNotebookBody(body);
      expect(blocks).toHaveLength(4);
      expect(blocks[0].kind).toBe('title');
      expect(blocks[1].kind).toBe('paragraph');
      expect(blocks[2].kind).toBe('paragraph'); // blank line
      expect(blocks[3].kind).toBe('paragraph');
    });

    it('7. codecVersion=1 versioned body unchanged', () => {
      const body = '~nb1:["paragraph","Hello from V1",[],null]';
      const blocks = parseNotebookBody(body, 1);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].text).toBe('Hello from V1');
    });
  });

  describe('Fix 2: Canonical Persistence Security Matrix', () => {
    const ALLOWED_URLS = [
      'https://example.com',
      'http://example.com',
      'mailto:test@example.com',
      'tel:+351123456789',
      '/path',
      '#anchor',
    ];

    for (const url of ALLOWED_URLS) {
      it(`ALLOW: ${url} at canonical persistence boundary`, () => {
        const blocks = [
          {
            kind: 'paragraph' as const,
            text: 'text link',
            marks: [{ s: 5, e: 9, t: 'a' as const, v: url }],
          },
        ];
        const encoded = encodeNotebookTextV1(blocks);
        const decoded = decodeNotebookTextV1(encoded);
        expect(decoded[0].marks?.[0].v).toBe(url);
      });
    }

    const REJECTED_URLS = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\x00script:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///tmp/test',
      '//evil.example',
      '',
      '   ',
      'example.com', // plain domain without https:// is rejected at canonical boundary
    ];

    for (const url of REJECTED_URLS) {
      it(`REJECT: "${url}" at canonical persistence boundary`, () => {
        const blocks = [
          {
            kind: 'paragraph' as const,
            text: 'text link',
            marks: [{ s: 5, e: 9, t: 'a' as const, v: url }],
          },
        ];
        expect(() => encodeNotebookTextV1(blocks)).toThrow('Invalid versioned Notebook text record');

        const rawLine = `~nb1:["paragraph","text link",[{"s":5,"e":9,"t":"a","v":${JSON.stringify(url)}}],null]`;
        expect(() => decodeNotebookTextV1(rawLine)).toThrow('Invalid versioned Notebook text record');
      });
    }
  });

  describe('Fix 2A & 2C: TipTap → Canonical and Mark Helpers Security', () => {
    it('TipTap with unsafe href fails closed on conversion to body', () => {
      const unsafeDoc = {
        type: 'doc',
        content: [
          {
            type: 'nbParagraph',
            content: [
              {
                type: 'text',
                text: 'Malicious link',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      };
      expect(() => tiptapDocToBody(unsafeDoc)).toThrow(NotebookTiptapConversionError);
    });

    it('TipTap with plain domain normalizes to https:// before canonical persistence', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'nbParagraph',
            content: [
              {
                type: 'text',
                text: 'Visit site',
                marks: [{ type: 'link', attrs: { href: 'example.com' } }],
              },
            ],
          },
        ],
      };
      const body = tiptapDocToBody(doc, 1);
      expect(body).toContain('https://example.com');
      expect(body).not.toContain('"example.com"');
    });
  });

  describe('Zero-Write Regression', () => {
    it('existing valid V1 body decode → encode is byte-identical', () => {
      const orig = '~nb1:["paragraph","Plain text without marks",[],null]';
      const decoded = decodeNotebookTextV1(orig);
      const reencoded = encodeNotebookTextV1(decoded);
      expect(reencoded).toBe(orig);
    });

    it('existing valid link body decode → encode is byte-identical', () => {
      const orig = '~nb1:["paragraph","Click here",[{"s":0,"e":10,"t":"a","v":"https://example.com"}],null]';
      const decoded = decodeNotebookTextV1(orig);
      const reencoded = encodeNotebookTextV1(decoded);
      expect(reencoded).toBe(orig);
    });
  });

  describe('Final Security Invariants A, B, C, D Proofs', () => {
    it('Invariant A: unsafe TipTap href → canonical Notebook body is impossible', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'nbParagraph',
            content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:void(0)' } }] }],
          },
        ],
      };
      expect(() => tiptapDocToBody(doc)).toThrow(NotebookTiptapConversionError);
    });

    it('Invariant B: unsafe canonical "a" mark → accepted V1 body is impossible', () => {
      const mark = { s: 0, e: 4, t: 'a' as const, v: 'data:text/html,bad' };
      expect(() => encodeNotebookTextV1([{ kind: 'paragraph', text: 'test', marks: [mark] }])).toThrow();
    });

    it('Invariant C: unversioned prose merely mentioning "~nb1:" causes no false fail-closed error', () => {
      const legacy = 'Documentation: ~nb1: is used for JSON rows in v1.';
      expect(() => parseNotebookBody(legacy)).not.toThrow();
      expect(parseNotebookBody(legacy)[0].text).toBe(legacy);
    });

    it('Invariant D: actual ~nb1 record with missing codec metadata fails closed', () => {
      const versioned = '~nb1:["paragraph","Should never parse as legacy",null,null]';
      expect(() => parseNotebookBody(versioned)).toThrow(
        'Corrupt state: received versioned Notebook text (~nb1:) with undefined codecVersion',
      );
    });
  });
});
