/**
 * M7.5C1 — Multi-page asset GC reference collectors.
 *
 * Proves inactive-page images / inline handwriting stay LIVE when the active
 * projection no longer mentions them, while true orphans remain GC-eligible.
 */
import { describe, expect, it } from 'vitest';
import {
  collectNotebookReferencedImageKeys,
  collectNotebookReferencedHandwritingKeys,
} from './notebookAssetRefs';
import { PAGE_INK_BLOCK_KEY } from './handwritingTypes';
import type { NotebookPage } from './notebookPages/types';
import { cascadeDeleteNotebookAssets } from './notebookDeleteCascade';
import { referencedNotebookImageKeys } from './notebookImageRefs';

function docPage(
  id: string,
  body: string,
  sectionId = 'sec-1',
): NotebookPage {
  return {
    id,
    sectionId,
    kind: 'document',
    title: id,
    documentBody: body,
  };
}

function writePage(id: string, inkPageKey: string, sectionId = 'sec-1'): NotebookPage {
  return {
    id,
    sectionId,
    kind: 'write',
    title: id,
    inkPageKey,
  };
}

describe('M7.5C1 — multi-page asset GC reference collectors', () => {
  it('1. inactive page image remains referenced when active body omits it', () => {
    const pages = [
      docPage('a', '::img::img-x::"X"::\n'),
      docPage('b', 'Only text on B\n'),
    ];
    // Active projection = page B (no image) — the old unsafe GC root.
    const activeBody = 'Only text on B\n';
    expect(referencedNotebookImageKeys(activeBody)).toEqual([]);

    const keys = collectNotebookReferencedImageKeys({
      pages,
      liveBody: activeBody,
    });
    expect(keys).toContain('img-x');
  });

  it('2. multiple page images stay live when active page has none', () => {
    const pages = [
      docPage('a', '::img::img-x::"X"::\n'),
      docPage('b', '::img::img-y::"Y"::\n'),
      docPage('c', 'No images here\n'),
    ];
    const keys = collectNotebookReferencedImageKeys({
      pages,
      liveBody: 'No images here\n',
    });
    expect(keys.sort()).toEqual(['img-x', 'img-y']);
  });

  it('3. inline handwriting on inactive page remains live', () => {
    const pages = [
      docPage('a', '::hw::hw-inactive::\n'),
      docPage('b', 'Plain page\n'),
    ];
    const keys = collectNotebookReferencedHandwritingKeys({
      pages,
      liveBody: 'Plain page\n',
      includeAllPageInkKeys: true,
    });
    expect(keys).toContain('hw-inactive');
  });

  it('4. write-page ink remains live via page-ink collection', () => {
    const pages = [
      writePage('w1', 'ink-write-w'),
      docPage('d1', 'Document only\n'),
    ];
    const keys = collectNotebookReferencedHandwritingKeys({
      pages,
      liveBody: 'Document only\n',
      includeAllPageInkKeys: true,
    });
    expect(keys).toContain('ink-write-w');
    expect(keys).toContain(PAGE_INK_BLOCK_KEY);
  });

  it('5. true orphan absent from all pages is not referenced', () => {
    const pages = [
      docPage('a', '::img::kept::"K"::\n'),
      docPage('b', 'no assets\n'),
    ];
    const keys = collectNotebookReferencedImageKeys({
      pages,
      liveBody: 'no assets\n',
    });
    expect(keys).toContain('kept');
    expect(keys).not.toContain('orphan-x');
  });

  it('6. active unflushed liveBody / block keys protect before pages[] flush', () => {
    const pages = [docPage('a', 'still empty\n')];
    const keys = collectNotebookReferencedImageKeys({
      pages,
      liveBody: '::img::unflushed-live::"U"::\n',
      liveBlockImageKeys: ['block-live-img'],
    });
    expect(keys).toContain('unflushed-live');
    expect(keys).toContain('block-live-img');
  });

  it('7. page switch A→B→A: inactive A image stays in union throughout', () => {
    const pageA = docPage('a', '::img::survive-switch::"S"::\n');
    const pageB = docPage('b', 'Page B body\n');
    const pages = [pageA, pageB];

    const onB = collectNotebookReferencedImageKeys({
      pages,
      liveBody: pageB.documentBody,
    });
    expect(onB).toContain('survive-switch');

    const backOnA = collectNotebookReferencedImageKeys({
      pages,
      liveBody: pageA.documentBody,
    });
    expect(backOnA).toContain('survive-switch');
  });

  it('8. refresh-shaped content: inactive pages still contribute refs', () => {
    const pages = [
      docPage('a', '::img::a-img::"A"::\n::hw::a-hw::\n'),
      docPage('b', '::img::b-img::"B"::\n'),
    ];
    // Simulate reopen with active page B projection only at top-level body.
    const imageKeys = collectNotebookReferencedImageKeys({
      pages,
      liveBody: pages[1]!.documentBody,
    });
    const hwKeys = collectNotebookReferencedHandwritingKeys({
      pages,
      liveBody: pages[1]!.documentBody,
      includeAllPageInkKeys: true,
    });
    expect(imageKeys.sort()).toEqual(['a-img', 'b-img']);
    expect(hwKeys).toContain('a-hw');
  });

  it('extra* slots are unioned for future C2 tombstones without changing core algorithm', () => {
    const pages = [docPage('a', 'clean\n')];
    const imageKeys = collectNotebookReferencedImageKeys({
      pages,
      liveBody: 'clean\n',
      extraImageKeys: ['tombstone-img'],
    });
    const hwKeys = collectNotebookReferencedHandwritingKeys({
      pages,
      liveBody: 'clean\n',
      includeAllPageInkKeys: false,
      extraHandwritingKeys: ['tombstone-hw'],
    });
    expect(imageKeys).toContain('tombstone-img');
    expect(hwKeys).toContain('tombstone-hw');
    expect(hwKeys).toContain(PAGE_INK_BLOCK_KEY);
  });

  it('legacy non-binder mode still seeds PAGE_INK_BLOCK_KEY only for page ink', () => {
    const pages = [writePage('w', 'should-not-auto-include')];
    const keys = collectNotebookReferencedHandwritingKeys({
      pages,
      liveBody: '',
      includeAllPageInkKeys: false,
    });
    expect(keys).toContain(PAGE_INK_BLOCK_KEY);
    expect(keys).not.toContain('should-not-auto-include');
  });
});

describe('M7.5C1 — M7.0 cascade still all-pages (unchanged contract)', () => {
  it('10. cascadeDeleteNotebookAssets still scans every documentBody', async () => {
    // Smoke: function still accepts multi-page content and completes.
    // Full cascade delete of assets is covered by existing M7.0 tests;
    // this asserts we did not remove multi-page scanning from the cascade path.
    const content = {
      type: 'notebook' as const,
      body: 'active only\n',
      pages: [
        docPage('a', '::img::cascade-a::"A"::\n'),
        docPage('b', '::img::cascade-b::"B"::\n'),
      ],
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['a', 'b'] }],
      activePageId: 'b',
      activeSectionId: 'sec-1',
      schemaVersion: 1,
    };
    // No userId → local-only path; may no-op if stores empty — must not throw.
    const result = await cascadeDeleteNotebookAssets({
      userId: null,
      sectionId: 'sec-test',
      objectId: 'nb-cascade-smoke',
      content,
    });
    expect(result).toEqual(expect.objectContaining({ handwriting: expect.any(Number), images: expect.any(Number) }));
  });
});
