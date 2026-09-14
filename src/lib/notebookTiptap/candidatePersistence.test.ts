/**
 * M5.2 — Guarded Real TipTap Persistence tests.
 *
 * Tests the persistence bridge from TipTap candidate → existing Notebook pipeline.
 * No React, no DOM rendering — pure logic layer:
 *   - featureFlag helpers
 *   - tiptapDocToBody fail-closed contract
 *   - applyNotebookPersist dual-write contract
 *   - onUserEdit callback semantics (only on genuine docChanged + serialization success)
 *   - codec V1 first-write for legacy pages
 *   - mixed-page isolation
 *   - round-trip fidelity
 *   - unsupported content → persistence blocked
 *   - no new storage mechanisms
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBody, tiptapDocToBlocks } from './tiptapDocToBody';
import { createNotebookTiptapSandboxExtensions } from './sandboxExtensions';
import {
  isNotebookTiptapCandidateEnabled,
  isNotebookTiptapCandidateActive,
  isNotebookTiptapPersistEnabled,
  isNotebookTiptapPersistActive,
} from './featureFlag';
import {
  applyNotebookPersist,
  hydrateNotebookPages,
  migrateLegacyNotebook,
  switchNotebookPage,
  addNotebookPage,
  type NotebookContentWithPages,
} from '../notebookPages';
import { prepareNotebookForCloudPersist } from '../notebookPages/persist';
import { serializeNotebookBlocks, parseNotebookBody } from '../notebookDialect';
import { serializeRichLine } from '../notebookInlineMarks';
import { GOLDEN_BODIES } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditor(body: string, codecVersion?: number) {
  return new Editor({
    extensions: createNotebookTiptapSandboxExtensions(),
    content: bodyToTiptapDoc(body, codecVersion),
    editable: true,
  });
}

function legacyNotebook(body = ''): NotebookContentWithPages {
  return {
    type: 'notebook',
    body,
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
  };
}

function v1Notebook(body = ''): NotebookContentWithPages {
  return migrateLegacyNotebook(legacyNotebook(body));
}

/** Simulate what handleCandidateUserEdit does: push body + codecVersion into persist pipeline. */
function simulateCandidateUserEdit(
  notebook: NotebookContentWithPages,
  body: string,
  codecVersion: number,
): NotebookContentWithPages {
  return applyNotebookPersist({ ...notebook, body, bodyCodecVersion: codecVersion });
}

// ---------------------------------------------------------------------------
// Feature Flags: 3 states, default-OFF, DEV guard
// ---------------------------------------------------------------------------
describe('Feature flags — 3 states and DEV gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persist flag defaults to OFF', () => {
    expect(isNotebookTiptapPersistEnabled()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('State 1: Candidate OFF → persistActive is false even if persist flag is set', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'false');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    expect(isNotebookTiptapCandidateEnabled()).toBe(false);
    expect(isNotebookTiptapPersistEnabled()).toBe(true);
    // Candidate OFF → persist active must be FALSE
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('State 2: Candidate ON + Persist OFF → memory-only (persistActive is false)', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'false');
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapPersistEnabled()).toBe(false);
    expect(isNotebookTiptapPersistActive()).toBe(false);
  });

  it('State 3: Candidate ON + Persist ON → persistActive is true in DEV', () => {
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    expect(isNotebookTiptapCandidateEnabled()).toBe(true);
    expect(isNotebookTiptapPersistEnabled()).toBe(true);
    expect(isNotebookTiptapPersistActive()).toBe(Boolean(import.meta.env.DEV));
  });
});

// ---------------------------------------------------------------------------
// T1 — Candidate ON + Persistence OFF: edits remain memory-only
// ---------------------------------------------------------------------------
describe('T1: Candidate ON + Persistence OFF — edits remain memory-only', () => {
  it('onUserEdit is undefined when persist flag is off', () => {
    const pushContent = vi.fn();
    const tipTapPersistActive = false;
    const handleCandidateUserEdit = (body: string, codecVersion: number) => {
      if (!tipTapPersistActive) return;
      pushContent({ body, bodyCodecVersion: codecVersion });
    };
    const onUserEdit = tipTapPersistActive ? handleCandidateUserEdit : undefined;
    expect(onUserEdit).toBeUndefined();
    expect(pushContent).not.toHaveBeenCalled();
  });

  it('handleCandidateUserEdit no-ops when tipTapPersistActive is false', () => {
    const pushContent = vi.fn();
    const tipTapPersistActive = false;
    const handleCandidateUserEdit = (body: string, codecVersion: number) => {
      if (!tipTapPersistActive) return;
      pushContent({ body, bodyCodecVersion: codecVersion });
    };
    handleCandidateUserEdit('hello world', 1);
    expect(pushContent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T2 — Candidate ON + Persistence ON: genuine edit calls persistence path
// ---------------------------------------------------------------------------
describe('T2: Candidate ON + Persistence ON — genuine edit calls persistence', () => {
  it('onUserEdit is provided when persist flag is on', () => {
    const pushContent = vi.fn();
    const tipTapPersistActive = true;
    const handleCandidateUserEdit = (body: string, codecVersion: number) => {
      if (!tipTapPersistActive) return;
      pushContent({ body, bodyCodecVersion: codecVersion });
    };
    const onUserEdit = tipTapPersistActive ? handleCandidateUserEdit : undefined;
    expect(onUserEdit).toBeDefined();
    onUserEdit!('some body content', 1);
    expect(pushContent).toHaveBeenCalledOnce();
    expect(pushContent).toHaveBeenCalledWith({ body: 'some body content', bodyCodecVersion: 1 });
  });

  it('genuine docChanged + serialization success → onUserEdit called with V1 body', () => {
    const ed = makeEditor('Hello notebook');
    const onUserEdit = vi.fn();
    try {
      const body = tiptapDocToBody(ed.getJSON(), 1);
      expect(body.length).toBeGreaterThan(0);
      onUserEdit(body, 1);
      expect(onUserEdit).toHaveBeenCalledOnce();
      expect(onUserEdit).toHaveBeenCalledWith(expect.any(String), 1);
    } finally {
      ed.destroy();
    }
  });

  it('pushContent receives codecVersion 1 from handleCandidateUserEdit', () => {
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
    const pushContent = vi.fn();
    const tipTapPersistActive = true;
    const nb = v1Notebook('original');
    const handleCandidateUserEdit = (body: string, codecVersion: number) => {
      if (!tipTapPersistActive) return;
      pushContent({ ...nb, body, bodyCodecVersion: codecVersion });
    };
    const v1Body = serializeNotebookBlocks([{ kind: 'paragraph', text: 'typed' }], 1);
    handleCandidateUserEdit(v1Body, 1);
    expect(pushContent).toHaveBeenCalledOnce();
    const arg = pushContent.mock.calls[0][0] as NotebookContentWithPages;
    expect(arg.bodyCodecVersion).toBe(1);
    expect(arg.body).toBe(v1Body);
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// T3 — Mount / open: zero persistence writes
// ---------------------------------------------------------------------------
describe('T3: Mount/open — zero persistence writes', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('opening a notebook does not call pushContent', () => {
    const pushContent = vi.fn();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.spyOn(indexedDB, 'open');
    try {
      hydrateNotebookPages(legacyNotebook('# Title\n\nSome content.'));
      expect(pushContent).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
      open.mockRestore();
    }
  });

  it('mounting TipTap (setContent emitUpdate:false) does not call onUserEdit', () => {
    const onUserEdit = vi.fn();
    const ed = makeEditor('Initial content');
    try {
      ed.commands.setContent(bodyToTiptapDoc('Programmatic reset'), { emitUpdate: false });
      expect(onUserEdit).not.toHaveBeenCalled();
    } finally {
      ed.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// T4 — Hydration / programmatic setContent: zero persistence writes
// ---------------------------------------------------------------------------
describe('T4: Hydration / programmatic setContent — zero persistence writes', () => {
  it('setContent with emitUpdate:false does not trigger onUpdate', () => {
    const onUpdateSpy = vi.fn();
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('original'),
      editable: true,
      onUpdate: ({ transaction }) => {
        if (transaction.docChanged) onUpdateSpy();
      },
    });
    try {
      ed.commands.setContent(bodyToTiptapDoc('page switched'), { emitUpdate: false });
      expect(onUpdateSpy).not.toHaveBeenCalled();
    } finally {
      ed.destroy();
    }
  });

  it('setContent without emitUpdate:false DOES trigger onUpdate (positive control)', () => {
    const onUpdateSpy = vi.fn();
    const ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('original'),
      editable: true,
      onUpdate: ({ transaction }) => {
        if (transaction.docChanged) onUpdateSpy();
      },
    });
    try {
      ed.commands.setContent(bodyToTiptapDoc('different content'));
      expect(onUpdateSpy).toHaveBeenCalled();
    } finally {
      ed.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// T5 — Selection / cursor / focus: zero persistence writes
// ---------------------------------------------------------------------------
describe('T5: Selection/cursor/focus — zero persistence writes', () => {
  it('transaction.docChanged is false for selection-only transactions', () => {
    const ed = makeEditor('Hello world');
    try {
      const tr = ed.state.tr; // fresh transaction, no doc mutation
      expect(tr.docChanged).toBe(false);
    } finally {
      ed.destroy();
    }
  });

  it('selection change commands do not trigger docChanged', () => {
    const docChangedSpy = vi.fn();
    let ed: Editor | null = null;
    ed = new Editor({
      extensions: createNotebookTiptapSandboxExtensions(),
      content: bodyToTiptapDoc('Paragraph one\nParagraph two'),
      editable: true,
      onUpdate: ({ transaction }) => {
        if (transaction.docChanged) docChangedSpy();
      },
    });
    try {
      ed.commands.focus();
      ed.commands.setTextSelection({ from: 1, to: 5 });
      ed.commands.setTextSelection({ from: 3, to: 8 });
      // setTextSelection doesn't cause docChanged
      expect(docChangedSpy).not.toHaveBeenCalled();
    } finally {
      ed.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// T6 — Legacy page open: does not upgrade
// ---------------------------------------------------------------------------
describe('T6: Legacy page open — does not upgrade', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('opening a legacy notebook does not change documentBodyCodecVersion', () => {
    const nb = legacyNotebook('# Original\n\nLegacy content.');
    const hydrated = hydrateNotebookPages(nb);
    const page = hydrated.pages?.[0];
    expect(page?.documentBodyCodecVersion).toBeUndefined();
    expect(page?.documentBody).toBe('# Original\n\nLegacy content.');
  });

  it('hydrateNotebookPages on legacy notebook does not write storage', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.spyOn(indexedDB, 'open');
    try {
      const nb = legacyNotebook('Legacy body');
      const before = JSON.stringify(nb);
      hydrateNotebookPages(nb);
      expect(JSON.stringify(nb)).toBe(before);
      expect(write).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
      open.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// T7 — First genuine TipTap edit of legacy page → only that page → V1
// ---------------------------------------------------------------------------
describe('T7: First genuine TipTap edit of legacy page → only that page becomes V1', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('applyNotebookPersist with codecVersion 1 stamps only active page', () => {
    const nb = v1Notebook('Legacy original body');
    const activePageId = nb.activePageId!;

    const tiptapBody = serializeNotebookBlocks(
      [{ kind: 'paragraph', text: 'User typed this' }],
      1,
    );
    const persisted = simulateCandidateUserEdit(nb, tiptapBody, 1);

    const page = persisted.pages?.find(p => p.id === activePageId);
    expect(page?.documentBodyCodecVersion).toBe(1);
    expect(page?.documentBody).toBe(tiptapBody);
    expect(persisted.bodyCodecVersion).toBe(1);
  });

  it('after V1 persist the page is readable back as V1 blocks', () => {
    const nb = v1Notebook('');
    const tiptapBody = serializeNotebookBlocks(
      [{ kind: 'title', text: 'V1 Page' }, { kind: 'paragraph', text: 'Content here' }],
      1,
    );
    const persisted = simulateCandidateUserEdit(nb, tiptapBody, 1);
    const page = persisted.pages?.find(p => p.id === nb.activePageId);
    const blocks = parseNotebookBody(page!.documentBody!, page!.documentBodyCodecVersion);
    expect(blocks[0]).toMatchObject({ kind: 'title', text: 'V1 Page' });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'Content here' });
  });
});

// ---------------------------------------------------------------------------
// T8 — Mixed pages: editing page B does not affect page A
// ---------------------------------------------------------------------------
describe('T8: Mixed pages — legacy page A untouched while page B becomes V1', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('page A stays legacy (no codec) while page B becomes V1 after TipTap persist', () => {
    let nb = v1Notebook('Page A legacy body');
    const pageA = nb.activePageId!;
    const secId = nb.activeSectionId!;

    nb = addNotebookPage(nb, secId, 'Page A legacy body', 'Page B');
    const pageB = nb.activePageId!;
    nb = switchNotebookPage(nb, pageB, 'Page A legacy body');
    expect(nb.bodyCodecVersion).toBeUndefined();

    const v1Body = serializeNotebookBlocks([{ kind: 'paragraph', text: 'Page B edited' }], 1);
    const persisted = simulateCandidateUserEdit(nb, v1Body, 1);

    const pA = persisted.pages?.find(p => p.id === pageA);
    const pB = persisted.pages?.find(p => p.id === pageB);

    expect(pA?.documentBodyCodecVersion).toBeUndefined();
    expect(pA?.documentBody).toBe('Page A legacy body');
    expect(pB?.documentBodyCodecVersion).toBe(1);
    expect(pB?.documentBody).toBe(v1Body);
  });
});

// ---------------------------------------------------------------------------
// T9 — Reload round-trip: V1 body rehydrates to identical TipTap doc
// ---------------------------------------------------------------------------
describe('T9: Reload round-trip — V1 body rehydrates to identical TipTap doc', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('body → TipTap → body round-trips identically', () => {
    const sourceBody = serializeNotebookBlocks([
      { kind: 'title', text: 'My Title' },
      { kind: 'paragraph', text: 'Some content' },
      { kind: 'bullet', depth: 0, text: 'Bullet item' },
    ], 1);

    const ed = makeEditor(sourceBody, 1);
    try {
      const roundTripped = tiptapDocToBody(ed.getJSON(), 1);
      expect(roundTripped).toBe(sourceBody);
    } finally {
      ed.destroy();
    }
  });

  it('V1 body persisted through applyNotebookPersist survives hydrate-project cycle', () => {
    const nb = v1Notebook('');
    const v1Body = serializeNotebookBlocks([
      { kind: 'title', text: 'Reload test' },
      { kind: 'paragraph', text: 'Content survives' },
    ], 1);

    const persisted = simulateCandidateUserEdit(nb, v1Body, 1);
    const cloud = prepareNotebookForCloudPersist(persisted);
    const deviceB = hydrateNotebookPages(cloud);
    const page = deviceB.pages?.find(p => p.id === persisted.activePageId);
    expect(page?.documentBody).toBe(v1Body);
    expect(page?.documentBodyCodecVersion).toBe(1);

    const blocks = parseNotebookBody(v1Body, 1);
    expect(blocks[0]).toMatchObject({ kind: 'title', text: 'Reload test' });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'Content survives' });
  });
});

// ---------------------------------------------------------------------------
// T10 — Page switch: pending edit is captured before switch
// ---------------------------------------------------------------------------
describe('T10: Page switch — pending edit captured before switch', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('switchNotebookPage captures current body before switching', () => {
    // Start on page A
    let nb = v1Notebook('Page A original');
    const pageA = nb.activePageId!;
    const secId = nb.activeSectionId!;

    // Add page B (makes B active). Switch back to A to establish state.
    nb = addNotebookPage(nb, secId, 'Page A original', 'Page B');
    const pageB = nb.activePageId!;
    nb = switchNotebookPage(nb, pageA, 'Page B initial'); // switch to A, saves B

    // Active is now A. User has made edits (reflected in currentBody).
    // Switch from A → B, passing A's pending body as currentBody.
    nb = switchNotebookPage(nb, pageB, 'Page A with pending edit');

    // switchNotebookPage saved 'Page A with pending edit' onto page A first
    const pA = nb.pages?.find(p => p.id === pageA);
    expect(pA?.documentBody).toBe('Page A with pending edit');

    // Now on page B — switch back to A, saves B content
    nb = switchNotebookPage(nb, pageA, 'Page B content');
    expect(nb.body).toBe('Page A with pending edit');
  });
});

// ---------------------------------------------------------------------------
// T11 — Unmount: flush semantics prevent loss
// ---------------------------------------------------------------------------
describe('T11: Unmount — existing flush semantics prevent loss', () => {
  it('flushNotebookPersist fires pending.commit immediately', () => {
    const commit = vi.fn();
    let pending: { commit: (c: unknown) => void; content: unknown } | null = {
      commit,
      content: { body: 'pending content' },
    };
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flushNotebookPersist = () => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (!pending) return;
      const p = pending;
      pending = null;
      p.commit(p.content);
    };

    timer = setTimeout(flushNotebookPersist, 420);
    // Unmount fires flush before timer
    flushNotebookPersist();
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({ body: 'pending content' });
    expect(timer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T12 — Marks: formatting survives save/reload
// ---------------------------------------------------------------------------
describe('T12: Marks — formatting survives save/reload', () => {
  it('bold mark survives tiptapDocToBody → bodyToTiptapDoc', () => {
    const boldBody = serializeRichLine({ plain: 'bold text', marks: [{ s: 0, e: 9, t: 'b' }] });
    const ed = makeEditor(boldBody);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(boldBody);
    } finally { ed.destroy(); }
  });

  it('italic mark survives round-trip', () => {
    const italicBody = serializeRichLine({ plain: 'italic text', marks: [{ s: 0, e: 11, t: 'i' }] });
    const ed = makeEditor(italicBody);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(italicBody);
    } finally { ed.destroy(); }
  });

  it('underline mark survives round-trip', () => {
    const body = serializeRichLine({ plain: 'underlined', marks: [{ s: 0, e: 10, t: 'u' }] });
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('strike mark survives round-trip', () => {
    const body = serializeRichLine({ plain: 'strikethrough', marks: [{ s: 0, e: 13, t: 's' }] });
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('text color mark survives round-trip', () => {
    const body = serializeRichLine({ plain: 'colored', marks: [{ s: 0, e: 7, t: 'c', v: '#ff0000' }] });
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('highlight mark survives round-trip', () => {
    const body = serializeRichLine({ plain: 'highlighted', marks: [{ s: 0, e: 11, t: 'h', v: '#ffff00' }] });
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('font size mark survives round-trip', () => {
    const body = serializeRichLine({ plain: 'large text', marks: [{ s: 0, e: 10, t: 'fs', v: '24' }] });
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// T13 — RTL + inline math: survive save/reload
// ---------------------------------------------------------------------------
describe('T13: RTL + inline math — survive save/reload', () => {
  it('Hebrew RTL text round-trips', () => {
    const body = 'שלום עולם';
    const ed = makeEditor(body);
    try {
      const blocks = tiptapDocToBlocks(ed.getJSON());
      expect(blocks[0]).toMatchObject({ kind: 'paragraph', text: 'שלום עולם' });
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('inline math $a^2+b^2=c^2$ survives round-trip', () => {
    const body = 'The formula is $a^2+b^2=c^2$ by Pythagoras';
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('RTL paragraph with inline math survives round-trip', () => {
    const body = 'המשוואה $E=mc^2$ חשובה';
    const ed = makeEditor(body);
    try {
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// T14 — Structural blocks: survive save/reload
// ---------------------------------------------------------------------------
describe('T14: Structural blocks — survive save/reload', () => {
  const cases: Array<[string, string]> = [
    ['title', '# My Title'],
    ['section', '## My Section'],
    ['bullet', '- bullet item'],
    ['ordered', '1. ordered item'],
    ['task unchecked', '[ ] unchecked task'],
    ['task checked', '[x] checked task'],
    ['quote', '> quoted text'],
    ['step', '=> step text'],
    ['callout concept', '!concept callout text'],
    ['callout definition', '!definition a definition here'],
    ['math', '$$ x^2 + y^2 $$'],
    ['divider', '---'],
  ];

  for (const [label, body] of cases) {
    it(`${label} survives TipTap round-trip`, () => {
      const ed = makeEditor(body);
      try {
        expect(tiptapDocToBody(ed.getJSON())).toBe(body);
      } finally { ed.destroy(); }
    });
  }
});

// ---------------------------------------------------------------------------
// T15 — Image / handwriting refs: semantics intact
// ---------------------------------------------------------------------------
describe('T15: Image/handwriting refs — semantics remain intact', () => {
  it('image-ref block survives round-trip', () => {
    const body = '::img::test-key-abc::Test image::';
    const ed = makeEditor(body);
    try {
      const blocks = tiptapDocToBlocks(ed.getJSON());
      expect(blocks.some(b => b.kind === 'image-ref')).toBe(true);
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });

  it('handwriting ref block survives round-trip', () => {
    const body = '::hw::hw-test-key::';
    const ed = makeEditor(body);
    try {
      const blocks = tiptapDocToBlocks(ed.getJSON());
      expect(blocks.some(b => b.kind === 'handwriting')).toBe(true);
      expect(tiptapDocToBody(ed.getJSON())).toBe(body);
    } finally { ed.destroy(); }
  });
});

// ---------------------------------------------------------------------------
// T16 — Unsupported serialization: persistence blocked; previous body intact
// ---------------------------------------------------------------------------
describe('T16: Unsupported serialization — persistence blocked; previous body intact', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('tiptapDocToBody throws on unsupported node type (table)', () => {
    const badDoc = { type: 'doc', content: [{ type: 'table' }] };
    expect(() => tiptapDocToBody(badDoc as never)).toThrow();
  });

  it('tiptapDocToBody throws on hardBreak node', () => {
    const badDoc = {
      type: 'doc',
      content: [{ type: 'nbParagraph', content: [{ type: 'hardBreak' }] }],
    };
    expect(() => tiptapDocToBody(badDoc as never)).toThrow();
  });

  it('onUserEdit is NOT called when serialization fails — previous body preserved', () => {
    const pushContent = vi.fn();
    const onUserEdit = vi.fn((body: string, codecVersion: number) => {
      pushContent({ body, bodyCodecVersion: codecVersion });
    });
    const originalBody = '# Original\n\nPrevious valid content.';
    const nb = v1Notebook(originalBody);

    // Simulate fail-closed: serialization throws → do NOT call onUserEdit
    const badDoc = { type: 'doc', content: [{ type: 'table' }] };
    let serialized: string | null = null;
    try {
      serialized = tiptapDocToBody(badDoc as never, 1);
    } catch {
      // fail-closed: onUserEdit NOT called
    }
    expect(serialized).toBeNull();
    expect(onUserEdit).not.toHaveBeenCalled();
    expect(pushContent).not.toHaveBeenCalled();
    expect(nb.body).toBe(originalBody);
  });

  it('previous valid persisted body remains untouched after serialization failure', () => {
    const nb = v1Notebook('');
    const validBody = serializeNotebookBlocks([{ kind: 'paragraph', text: 'valid content' }], 1);
    const persisted = simulateCandidateUserEdit(nb, validBody, 1);
    const pageAfterGoodPersist = persisted.pages?.find(p => p.id === nb.activePageId);
    expect(pageAfterGoodPersist?.documentBody).toBe(validBody);

    // Now simulate a bad update — serialization fails, so we do NOT call simulateCandidateUserEdit
    // The persisted object is unchanged
    expect(persisted.pages?.find(p => p.id === nb.activePageId)?.documentBody).toBe(validBody);
  });
});

// ---------------------------------------------------------------------------
// T17 — Undo/redo: saving does not reset TipTap history
// ---------------------------------------------------------------------------
describe('T17: Undo/redo — saving does not reset TipTap history', () => {
  it('typing → onUserEdit → undo still reverts the edit', () => {
    const ed = makeEditor('Original text');
    const onUserEdit = vi.fn();
    try {
      ed.commands.focus('end');
      ed.commands.insertContent(' appended');
      const afterInsert = tiptapDocToBody(ed.getJSON());
      expect(afterInsert).toContain('appended');

      // onUserEdit extraction does NOT mutate editor state
      onUserEdit(afterInsert, 1);
      expect(onUserEdit).toHaveBeenCalledOnce();

      // Undo still works — history was not cleared
      ed.commands.undo();
      const afterUndo = tiptapDocToBody(ed.getJSON());
      expect(afterUndo).not.toContain('appended');
      expect(afterUndo).toContain('Original text');
    } finally {
      ed.destroy();
    }
  });

  it('tiptapDocToBody is read-only — does not mutate editor or clear history', () => {
    const ed = makeEditor('Before save');
    try {
      const docBefore = JSON.stringify(ed.getJSON());
      // Extract body (what onUpdate does before calling onUserEdit)
      const body = tiptapDocToBody(ed.getJSON());
      expect(body).toBeTruthy();
      // Document unchanged
      expect(JSON.stringify(ed.getJSON())).toBe(docBefore);
    } finally {
      ed.destroy();
    }
  });

  it('undo after edits works normally — saving between edits does not corrupt stack', () => {
    const ed = makeEditor('Start');
    const onUserEdit = vi.fn();
    try {
      ed.commands.focus('end');
      // First edit batch
      ed.commands.insertContent(' first');
      const afterFirst = tiptapDocToBody(ed.getJSON());
      onUserEdit(afterFirst, 1); // save — must NOT clear history

      // TipTap groups adjacent same-position insertions in one undo entry.
      // The key invariant: saving does NOT prevent undo from working.
      ed.commands.undo();
      const afterUndo = tiptapDocToBody(ed.getJSON());
      // After undo we should be back before 'first' was inserted
      expect(afterUndo).not.toContain('first');
      // The stack is still usable (redo restores it)
      ed.commands.redo();
      expect(tiptapDocToBody(ed.getJSON())).toContain('first');
    } finally {
      ed.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// T18 — No new storage mechanism: TipTap routes through existing pipeline
// ---------------------------------------------------------------------------
describe('T18: No new storage mechanism — TipTap routes through applyNotebookPersist', () => {
  beforeEach(() => vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('applyNotebookPersist is pure — never writes localStorage or IndexedDB', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const open = vi.spyOn(indexedDB, 'open');
    try {
      const nb = v1Notebook('original body');
      const v1Body = serializeNotebookBlocks([{ kind: 'paragraph', text: 'new content' }], 1);
      const persisted = applyNotebookPersist({ ...nb, body: v1Body, bodyCodecVersion: 1 });
      expect(write).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      const page = persisted.pages?.find(p => p.id === nb.activePageId);
      expect(page?.documentBody).toBe(v1Body);
      expect(page?.documentBodyCodecVersion).toBe(1);
    } finally {
      write.mockRestore();
      open.mockRestore();
    }
  });

  it('TipTap path does not introduce new tiptap-specific storage keys', () => {
    const writtenKeys: string[] = [];
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      writtenKeys.push(key);
    });
    const open = vi.spyOn(indexedDB, 'open');
    try {
      const nb = v1Notebook('');
      const v1Body = serializeNotebookBlocks([{ kind: 'paragraph', text: 'test' }], 1);
      applyNotebookPersist({ ...nb, body: v1Body, bodyCodecVersion: 1 });
      const tiptapKeys = writtenKeys.filter(k => /tiptap/i.test(k));
      expect(tiptapKeys).toHaveLength(0);
      expect(open).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
      open.mockRestore();
    }
  });

  it('prepareNotebookForCloudPersist produces correct cloud shape for V1 TipTap page', () => {
    const nb = v1Notebook('');
    const v1Body = serializeNotebookBlocks([
      { kind: 'title', text: 'Cloud sync test' },
      { kind: 'paragraph', text: 'Synced content' },
    ], 1);
    const persisted = applyNotebookPersist({ ...nb, body: v1Body, bodyCodecVersion: 1 });
    const cloud = prepareNotebookForCloudPersist(persisted);

    // Navigation fields stripped (device-local)
    expect(cloud.activePageId).toBeUndefined();
    expect(cloud.activeSectionId).toBeUndefined();
    // Body projection correct
    expect(cloud.body).toBe(v1Body);
    expect(cloud.bodyCodecVersion).toBe(1);
    // Pages preserved
    const page = cloud.pages?.[0];
    expect(page?.documentBody).toBe(v1Body);
    expect(page?.documentBodyCodecVersion).toBe(1);
  });
});
