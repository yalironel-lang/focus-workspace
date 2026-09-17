/**
 * M7.5C2 — Shell page-isolation fix: pageKey-targeted persist + switch flush guard.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { ensureTestLocalStorage } from '../knowledge/testLocalStorage';
ensureTestLocalStorage();

import { boardScopedFreeSpaceKeys } from '../freeSpacePersistence';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import type { NotebookContentWithPages, NotebookPage } from './types';
import { addNotebookPage, switchNotebookPage } from './operations';
import { applyNotebookPersist, migrateLegacyNotebook } from './hydrate';
import {
  applyActivePageTargetedUserEdit,
  applyPageKeyedUserEdit,
  resolveSwitchFlushRepresentation,
  switchNotebookPageWithSafeFlush,
} from './pageKeyedPersist';
import { resetKnowledgeJournalDbForTests } from '../knowledge/knowledgeJournalIdb';
import { restoreFromTombstone } from '../knowledge/knowledgeRestore';
import { softDeleteNotebookPage } from '../knowledge/notebookPageRecovery';
import { NotebookTiptapCandidateEditor } from '../../components/notebook/tiptap/NotebookTiptapCandidateEditor';

const SECTION = 'sec-iso-fix';
const BOARD = 'main';
const OBJECT_ID = 'nb-iso-fix-1';

function objectsKey() {
  return boardScopedFreeSpaceKeys(SECTION, BOARD).objects;
}

function docPage(id: string, body: string, title?: string): NotebookPage {
  return {
    id,
    sectionId: 'sec-notes',
    kind: 'document',
    title: title ?? id,
    documentBody: body,
    documentBodyCodecVersion: 1,
  };
}

function notebook(pages: NotebookPage[], activePageId: string): NotebookContentWithPages {
  const active = pages.find(p => p.id === activePageId)!;
  return {
    type: 'notebook',
    body: active.documentBody ?? '',
    bodyCodecVersion: active.documentBodyCodecVersion,
    schemaVersion: 1,
    sections: [{ id: 'sec-notes', title: 'Notes', pageIds: pages.map(p => p.id) }],
    pages,
    activeSectionId: 'sec-notes',
    activePageId,
  };
}

function pageBody(content: NotebookContentWithPages, id: string): string {
  return (content.pages ?? []).find(p => p.id === id)?.documentBody ?? '';
}

function persist(content: NotebookContentWithPages) {
  const obj: ProjectSpaceObject = {
    id: OBJECT_ID,
    type: 'notebook',
    title: 'ISO NB',
    content: content as ProjectSpaceObject['content'],
    updatedAt: Date.now(),
  };
  localStorage.setItem(objectsKey(), JSON.stringify([obj]));
}

function load(): NotebookContentWithPages {
  const objs = JSON.parse(localStorage.getItem(objectsKey()) ?? '[]') as ProjectSpaceObject[];
  return objs.find(o => o.id === OBJECT_ID)!.content as NotebookContentWithPages;
}

beforeEach(async () => {
  localStorage.clear();
  await resetKnowledgeJournalDbForTests();
  indexedDB.deleteDatabase('fw_knowledge_journal_v1');
  await resetKnowledgeJournalDbForTests();
});

afterEach(async () => {
  await resetKnowledgeJournalDbForTests();
});

describe('1–3 shell bridge — wrong-page write proof + fix', () => {
  const imgB = 'BBB PAGE B\n::img::img-x::"X"::\n';

  it('1. LEGACY BUG PROOF: activePageId-targeted persist writes B body into A', () => {
    const content = notebook([docPage('a', 'AAA PAGE A'), docPage('b', imgB)], 'a');
    // Real shell bug shape: TipTap still holding B, mutable active already A
    const corrupted = applyActivePageTargetedUserEdit(content, imgB, 1, 'a');
    expect(pageBody(corrupted, 'a')).toBe(imgB);
    expect(pageBody(corrupted, 'a')).toContain('::img::img-x::');
    // This is the confirmed manual QA corruption shape.
  });

  it('2. pageKey-targeted user edit updates B even if mutable activePageId is A', () => {
    const content = notebook([docPage('a', 'AAA PAGE A'), docPage('b', 'BBB PAGE B')], 'a');
    const next = applyPageKeyedUserEdit(content, {
      pageKey: 'b',
      body: imgB,
      codecVersion: 1,
    });
    expect(pageBody(next, 'a')).toBe('AAA PAGE A');
    expect(pageBody(next, 'b')).toBe(imgB);
    expect(next.activePageId).toBe('a');
    expect(next.body).toBe('AAA PAGE A');
  });

  it('3. mismatched liveRepresentation.pageKey is never flushed into active page', () => {
    const content = notebook([docPage('a', 'AAA PAGE A'), docPage('b', imgB)], 'a');
    const live = { pageKey: 'b', body: imgB, codecVersion: 1 as number };
    const flush = resolveSwitchFlushRepresentation(content, 'a', live);
    expect(flush.ok).toBe(false);
    if (flush.ok) return;
    expect(flush.reason).toBe('PAGEKEY_MISMATCH');
    expect(flush.body).toBe('AAA PAGE A');
    const switched = switchNotebookPage(content, 'b', flush.body, flush.codecVersion);
    expect(pageBody(switched, 'a')).toBe('AAA PAGE A');
    expect(pageBody(switched, 'b')).toBe(imgB);
  });
});

describe('4–5 rapid switch + image isolation', () => {
  it('4. A→B→A rapid switch with safe flush preserves distinct bodies', () => {
    let content = notebook(
      [docPage('a', 'AAA PAGE A'), docPage('b', 'BBB PAGE B')],
      'a',
    );
    // Live still on A — safe
    content = switchNotebookPageWithSafeFlush(
      content,
      'b',
      { pageKey: 'a', body: 'AAA PAGE A', codecVersion: 1 },
      switchNotebookPage,
    );
    expect(content.activePageId).toBe('b');
    expect(pageBody(content, 'a')).toBe('AAA PAGE A');

    // Stale live still claiming B while somehow active already flipped — safe flush
    content = {
      ...content,
      activePageId: 'a',
      body: 'AAA PAGE A',
    };
    const liveStaleB = {
      pageKey: 'b',
      body: 'BBB PAGE B — STALE',
      codecVersion: 1,
    };
    content = switchNotebookPageWithSafeFlush(content, 'b', liveStaleB, switchNotebookPage);
    expect(pageBody(content, 'a')).toBe('AAA PAGE A');
    expect(pageBody(content, 'b')).toBe('BBB PAGE B');
  });

  it('5. A image never appears in B', () => {
    const imgA = 'AAA\n::img::img-a-only::"A"::\n';
    let content = notebook([docPage('a', imgA), docPage('b', 'BBB PAGE B')], 'a');
    content = switchNotebookPageWithSafeFlush(
      content,
      'b',
      { pageKey: 'a', body: imgA, codecVersion: 1 },
      switchNotebookPage,
    );
    expect(pageBody(content, 'a')).toContain('::img::img-a-only::');
    expect(pageBody(content, 'b')).not.toContain('::img::img-a-only::');
    expect(content.body).toBe('BBB PAGE B');
  });
});

describe('6 create page does not clone A', () => {
  it('create B does not inherit AAA or Image X from A', () => {
    const imgA = 'AAA PAGE A\n::img::img-a::"A"::\n';
    const content = notebook([docPage('a', imgA)], 'a');
    const next = addNotebookPage(content, 'sec-notes', imgA, undefined, 'document', 1);
    const bId = next.activePageId!;
    expect(bId).not.toBe('a');
    expect(pageBody(next, 'a')).toBe(imgA);
    expect(pageBody(next, bId)).toBe('');
    expect(pageBody(next, bId)).not.toContain('AAA');
    expect(pageBody(next, bId)).not.toContain('::img::');
    expect(next.body).toBe('');
  });
});

describe('7–10 C2 delete/restore isolation + refresh', () => {
  const imgB = 'BBB PAGE B\n::img::img-x::"X"::\n';

  it('7–10 delete B / restore B / switch / refresh keep A≠B', async () => {
    let content = notebook(
      [docPage('a', 'AAA PAGE A', 'KEEP'), docPage('b', imgB, 'DELETE')],
      'b',
    );
    persist(content);

    const deleted = await softDeleteNotebookPage({
      content,
      pageId: 'b',
      currentBody: imgB,
      currentCodecVersion: 1,
      sectionId: SECTION,
      boardId: BOARD,
      objectId: OBJECT_ID,
      objectTitle: 'ISO NB',
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;

    const afterDelete = applyNotebookPersist(deleted.content, {
      body: deleted.content.body ?? '',
      codecVersion: deleted.content.bodyCodecVersion,
    });
    persist(afterDelete);
    expect(pageBody(load(), 'a')).toBe('AAA PAGE A');

    const restored = await restoreFromTombstone(deleted.tombstone);
    expect(restored.ok).toBe(true);

    content = migrateLegacyNotebook(load());
    expect(pageBody(content, 'a')).toBe('AAA PAGE A');
    expect(pageBody(content, 'b')).toBe(imgB);

    content = {
      ...content,
      activePageId: 'a',
      body: pageBody(content, 'a'),
      bodyCodecVersion: 1,
    };
    for (const to of ['b', 'a', 'b', 'a'] as const) {
      content = switchNotebookPageWithSafeFlush(
        content,
        to,
        {
          pageKey: content.activePageId!,
          body: content.body ?? '',
          codecVersion: 1,
        },
        switchNotebookPage,
      );
    }
    expect(pageBody(content, 'a')).toBe('AAA PAGE A');
    expect(pageBody(content, 'b')).toBe(imgB);

    // Refresh/reopen simulation
    persist(content);
    const reopened = migrateLegacyNotebook(load());
    expect(pageBody(reopened, 'a')).toBe('AAA PAGE A');
    expect(pageBody(reopened, 'b')).toContain('::img::img-x::');
  });
});

describe('14 CandidateEditor emits pageKey + zero hydration writes', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    host = null;
  });

  it('onUserEdit carries pageKey; hydration emits zero writes', async () => {
    let editor: Editor | null = null;
    const emissions: { body: string; codecVersion: number; pageKey: string }[] = [];
    const onReady = vi.fn();

    const render = (body: string, pageKey: string) => {
      const el: ReactElement = createElement(NotebookTiptapCandidateEditor, {
        sourceDocumentBody: body,
        pageKey,
        onReady,
        onEditorReady: ed => {
          editor = ed;
        },
        onUserEdit: payload => {
          emissions.push(payload);
        },
      });
      if (!root) {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
      }
      act(() => {
        root!.render(el);
      });
    };

    render('AAA PAGE A', 'page-a');
    await vi.waitFor(() => expect(editor?.isEditable).toBe(true));
    expect(emissions.length).toBe(0);

    render('BBB PAGE B', 'page-b');
    await vi.waitFor(() => expect(editor!.state.doc.textContent).toBe('BBB PAGE B'));
    expect(emissions.length).toBe(0);

    act(() => {
      const end = Math.max(1, editor!.state.doc.content.size - 1);
      editor!.chain().focus().setTextSelection(end).insertContent('!').run();
    });
    await vi.waitFor(() => expect(emissions.length).toBeGreaterThan(0));
    expect(emissions.at(-1)!.pageKey).toBe('page-b');
    expect(emissions.at(-1)!.codecVersion).toBe(1);
  });
});
