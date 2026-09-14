import { describe, it, expect, beforeEach } from 'vitest';
import {
  safeDeterministicHash,
  getBodyBlockCount,
  checkSentinels,
  extractEditorDiagState,
  recordTransitionIfNeeded,
  getTraceBuffer,
  clearTraceBuffer,
  buildNotebookQaDiagSnapshot,
  QA_SENTINEL_PAGE_1,
  QA_SENTINEL_PAGE_2,
  type NotebookQaDiagContext,
} from './candidateQaDiagnostics';

describe('candidateQaDiagnostics', () => {
  beforeEach(() => {
    clearTraceBuffer('test-obj');
  });

  describe('safeDeterministicHash', () => {
    it('returns deterministic hashes for identical strings', () => {
      const h1 = safeDeterministicHash('hello world');
      const h2 = safeDeterministicHash('hello world');
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^h_[0-9a-f]{8}$/);
    });

    it('returns different hashes for different strings', () => {
      const h1 = safeDeterministicHash('Page 1');
      const h2 = safeDeterministicHash('Page 2');
      expect(h1).not.toBe(h2);
    });

    it('handles empty and null/undefined values safely', () => {
      expect(safeDeterministicHash('')).toBe('empty');
      expect(safeDeterministicHash(null)).toBe('none');
      expect(safeDeterministicHash(undefined)).toBe('none');
    });
  });

  describe('getBodyBlockCount', () => {
    it('counts empty bodies as 0', () => {
      expect(getBodyBlockCount('')).toBe(0);
      expect(getBodyBlockCount(null)).toBe(0);
      expect(getBodyBlockCount(undefined)).toBe(0);
    });

    it('counts V1 versioned body blocks', () => {
      const v1 = '~nb1:["title","My Title",[],null]\n~nb1:["paragraph","Hello world",[],null]';
      expect(getBodyBlockCount(v1)).toBe(2);
    });

    it('counts lines for plain text fallback', () => {
      const plain = 'Line 1\nLine 2\nLine 3';
      expect(getBodyBlockCount(plain)).toBe(3);
    });
  });

  describe('checkSentinels', () => {
    it('detects QA_SENTINEL_PAGE_1 and QA_SENTINEL_PAGE_2 as booleans only', () => {
      const res1 = checkSentinels(`Some header\n${QA_SENTINEL_PAGE_1}\nfooter`);
      expect(res1).toEqual({
        containsQaPage1Sentinel: true,
        containsQaPage2Sentinel: false,
      });

      const res2 = checkSentinels(`Some header\n${QA_SENTINEL_PAGE_2}\nfooter`);
      expect(res2).toEqual({
        containsQaPage1Sentinel: false,
        containsQaPage2Sentinel: true,
      });

      const resBoth = checkSentinels(`${QA_SENTINEL_PAGE_1} and ${QA_SENTINEL_PAGE_2}`);
      expect(resBoth).toEqual({
        containsQaPage1Sentinel: true,
        containsQaPage2Sentinel: true,
      });

      const resNone = checkSentinels('Some completely unrelated content');
      expect(resNone).toEqual({
        containsQaPage1Sentinel: false,
        containsQaPage2Sentinel: false,
      });
    });
  });

  describe('extractEditorDiagState', () => {
    it('returns unmounted state when editor is missing', () => {
      const state = extractEditorDiagState(null);
      expect(state).toEqual({
        mounted: false,
        editorTextLength: 0,
        editorDocHash: 'unmounted',
        editorBlockCount: 0,
        containsQaPage1Sentinel: false,
        containsQaPage2Sentinel: false,
      });
    });

    it('returns structural metadata from mock editor', () => {
      const mockEditor = {
        isDestroyed: false,
        state: {
          doc: {
            textContent: 'Page 1 unique content in editor',
            childCount: 1,
          },
        },
        getJSON: () => ({
          type: 'doc',
          content: [{ type: 'paragraph', text: 'Page 1 unique content in editor' }],
        }),
      };

      const state = extractEditorDiagState(mockEditor);
      expect(state.mounted).toBe(true);
      expect(state.editorTextLength).toBe('Page 1 unique content in editor'.length);
      expect(state.editorBlockCount).toBe(1);
      expect(state.editorDocHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(state.containsQaPage1Sentinel).toBe(true);
      expect(state.containsQaPage2Sentinel).toBe(false);
    });
  });

  describe('buildNotebookQaDiagSnapshot', () => {
    it('includes all required structural metadata and sentinel checks across all layers', () => {
      const ctx: NotebookQaDiagContext = {
        objectId: 'test-obj',
        propsContent: {
          activePageId: 'p1',
          body: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
          bodyCodecVersion: 1,
          pages: [
            {
              id: 'p1',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 1',
              documentBody: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
              documentBodyCodecVersion: 1,
            },
            {
              id: 'p2',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 2',
              documentBody: `~nb1:["paragraph","${QA_SENTINEL_PAGE_2}",[],null]`,
              documentBodyCodecVersion: 1,
            },
          ],
        },
        migratedContent: {
          type: 'notebook',
          activePageId: 'p1',
          body: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
          bodyCodecVersion: 1,
          pages: [
            {
              id: 'p1',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 1',
              documentBody: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
              documentBodyCodecVersion: 1,
            },
          ],
        },
        navigationOverlay: {
          activePageId: 'p1',
          body: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
          bodyCodecVersion: 1,
          _localGen: 1,
          pages: [
            {
              id: 'p1',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 1',
              documentBody: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
              documentBodyCodecVersion: 1,
            },
          ],
        },
        effectiveContent: {
          activePageId: 'p1',
          body: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
          bodyCodecVersion: 1,
          pages: [
            {
              id: 'p1',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 1',
              documentBody: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
              documentBodyCodecVersion: 1,
            },
          ],
        },
        resolvedNavigation: {
          activePageId: 'p1',
          activeSectionId: 'sec-1',
        },
      };

      const snap = buildNotebookQaDiagSnapshot(
        ctx,
        {
          pageKey: 'p1',
          sourceBody: `~nb1:["paragraph","${QA_SENTINEL_PAGE_1}",[],null]`,
          sourceBodyCodecVersion: 1,
          failClosed: false,
        },
        {
          isDestroyed: false,
          state: {
            doc: {
              textContent: QA_SENTINEL_PAGE_1,
              childCount: 1,
            },
          },
          getJSON: () => ({ type: 'doc', content: [] }),
        },
      );

      // propsContent metadata
      expect(snap.propsContent.bodyLength).toBeGreaterThan(0);
      expect(snap.propsContent.bodyHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(snap.propsContent.bodyBlockCount).toBe(1);
      expect(snap.propsContent.containsQaPage1Sentinel).toBe(true);
      expect(snap.propsContent.containsQaPage2Sentinel).toBe(false);

      // pages metadata
      expect(snap.propsContent.pages[0].documentBodyLength).toBeGreaterThan(0);
      expect(snap.propsContent.pages[0].documentBodyHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(snap.propsContent.pages[0].documentBodyBlockCount).toBe(1);
      expect(snap.propsContent.pages[0].containsQaPage1Sentinel).toBe(true);
      expect(snap.propsContent.pages[0].containsQaPage2Sentinel).toBe(false);

      expect(snap.propsContent.pages[1].documentBodyLength).toBeGreaterThan(0);
      expect(snap.propsContent.pages[1].documentBodyHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(snap.propsContent.pages[1].documentBodyBlockCount).toBe(1);
      expect(snap.propsContent.pages[1].containsQaPage1Sentinel).toBe(false);
      expect(snap.propsContent.pages[1].containsQaPage2Sentinel).toBe(true);

      // candidate editor state
      expect(snap.candidate.editor.mounted).toBe(true);
      expect(snap.candidate.editor.editorDocHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(snap.candidate.editor.editorBlockCount).toBe(1);
      expect(snap.candidate.editor.containsQaPage1Sentinel).toBe(true);
      expect(snap.candidate.editor.containsQaPage2Sentinel).toBe(false);
    });
  });

  describe('recordTransitionIfNeeded and trace buffer', () => {
    it('records extended transition entries with hashes, sentinels, and caps at 50', () => {
      const ctx: NotebookQaDiagContext = {
        objectId: 'test-obj',
        propsContent: {
          activePageId: 'p1',
          body: '',
          pages: [
            {
              id: 'p1',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 1',
              documentBody: QA_SENTINEL_PAGE_1,
            },
          ],
        },
        migratedContent: {
          type: 'notebook',
          activePageId: 'p1',
          body: '',
          pages: [],
        },
        navigationOverlay: null,
        effectiveContent: {
          activePageId: 'p1',
          body: '',
          pages: [
            {
              id: 'p1',
              sectionId: 'sec-1',
              kind: 'document',
              title: 'Page 1',
              documentBody: QA_SENTINEL_PAGE_1,
            },
          ],
        },
        resolvedNavigation: {
          activePageId: 'p1',
          activeSectionId: 'sec-1',
        },
      };

      recordTransitionIfNeeded(
        ctx,
        {
          pageKey: 'p1',
          sourceBody: QA_SENTINEL_PAGE_1,
          failClosed: false,
        },
        'render',
      );

      const buf = getTraceBuffer('test-obj');
      expect(buf.length).toBe(1);
      const entry = buf[0];
      expect(entry.pageKey).toBe('p1');
      expect(entry.propsPageBodyHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(entry.effectivePageBodyHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(entry.sourceBodyHash).toMatch(/^h_[0-9a-f]{8}$/);
      expect(entry.effectivePageContainsQaPage1Sentinel).toBe(true);
      expect(entry.sourceContainsQaPage1Sentinel).toBe(true);
      expect(entry.effectivePageContainsQaPage2Sentinel).toBe(false);

      // Verify ring buffer capping at 50
      for (let i = 0; i < 60; i++) {
        recordTransitionIfNeeded(
          {
            ...ctx,
            propsContent: {
              ...ctx.propsContent,
              body: `iter-${i}`,
            },
          },
          {
            pageKey: `page-${i}`,
            sourceBody: `iter-${i}`,
            failClosed: false,
          },
          'render',
        );
      }
      expect(getTraceBuffer('test-obj').length).toBe(50);
    });
  });
});
