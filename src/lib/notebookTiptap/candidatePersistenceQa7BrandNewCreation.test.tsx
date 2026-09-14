import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { useSectionFreeSpaceObjects, ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ProjectSpaceObjectRenderer } from '../../components/project-space/ProjectSpaceObjectRenderer';
import {
  migrateLegacyNotebook,
  hydrateNotebookPages,
  applyNotebookPersist,
} from '../notebookPages/hydrate';
import {
  switchNotebookPage,
  setActiveNotebookSection,
  addNotebookSection,
  addNotebookPage,
  renameNotebookSection,
  renameNotebookPage,
  saveNotebookPageBody,
  prepareNotebookForCloudPersist,
  type NotebookContentWithPages,
} from '../notebookPages';
import { serializeNotebookBlocks } from '../notebookDialect';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('../../lib/notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

const tokens = {
  cardBorder: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(20,16,12,0.92)',
  wellBg: 'rgba(255,255,255,0.03)',
  textPrimary: 'rgba(255,248,235,0.92)',
  textSecondary: 'rgba(255,248,235,0.62)',
  textMuted: 'rgba(255,248,235,0.42)',
  textGhost: 'rgba(255,248,235,0.28)',
  accent: '#f59e0b',
  accentGlow: 'rgba(245,158,11,0.35)',
} as AtmosphereTokens;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: any) {
  host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

function unmount() {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
}

describe('candidatePersistenceQa7BrandNewCreation', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      length: 0,
      key: () => null,
    });
    mem.set('notebookTiptapCandidate', '1');
    mem.set('notebookTiptapPersist', '1');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_CANDIDATE', 'true');
    vi.stubEnv('VITE_NOTEBOOK_TIPTAP_PERSIST', 'true');
    vi.stubEnv('VITE_NOTEBOOK_V1_PAGES', 'true');
    window.innerWidth = 1200;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    unmount();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('verifies brand new notebook creation pipeline before any typing', async () => {
    const sectionId = 'sec-qa7-init';
    const boardId = 'main';

    let hookStore: any = null;
    let createdObjectId = '';

    function ParentApp() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      hookStore = store;
      const obj = store.objects.find(o => o.id === createdObjectId);

      return createElement('div', null,
        obj ? createElement(ProjectSpaceObjectRenderer, {
          object: obj,
          allObjects: store.objects,
          tokens,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
          onChange: (newContent: any) => {
            store.updateObjectContent(obj.id, newContent);
          },
        }) : null
      );
    }

    mount(createElement(ParentApp));

    let createdObj: any = null;
    act(() => {
      createdObj = hookStore.addObject('notebook');
      createdObjectId = createdObj.id;
    });

    const ensured = ensureProjectObjectContent('notebook', createdObj.content);
    migrateLegacyNotebook(ensured as any);

    await vi.waitFor(() => {
      expect(host!.querySelector('[data-nb-tiptap-candidate-root="1"]')).toBeTruthy();
    });

    const candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    const textContent = host!.textContent ?? '';
    const hasFailClosed = textContent.includes('Fail-closed') || textContent.includes('Corrupt state');

    expect(candidateRoot).toBeTruthy();
    if (typeof (ensured as any).body === 'string' && (ensured as any).body.includes('~nb1:')) {
      expect((ensured as any).bodyCodecVersion).toBe(1);
    }

    const firstPage = (ensured as any).pages?.[0];
    if (firstPage && typeof firstPage.documentBody === 'string' && firstPage.documentBody.includes('~nb1:')) {
      expect(firstPage.documentBodyCodecVersion).toBe(1);
    }

    expect(hasFailClosed).toBe(false);
  });

  it('traces full persistence -> localStorage -> reload -> hydration cycle for V1 content', async () => {
    const sectionId = 'sec-qa7-persist';
    const boardId = 'main';

    let hookStore: any = null;
    let createdObjectId = '';

    function ParentApp() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      hookStore = store;
      const obj = store.objects.find(o => o.id === createdObjectId);

      return createElement('div', null,
        obj ? createElement(ProjectSpaceObjectRenderer, {
          object: obj,
          allObjects: store.objects,
          tokens,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
          onChange: (newContent: any) => {
            store.updateObjectContent(obj.id, newContent);
          },
        }) : null
      );
    }

    mount(createElement(ParentApp));

    act(() => {
      const createdObj = hookStore.addObject('notebook');
      createdObjectId = createdObj.id;
    });

    const v1DocBody = serializeNotebookBlocks([{ id: 'p1', kind: 'paragraph', text: 'Hello V1' }], 1);

    const v1Content = {
      type: 'notebook',
      body: v1DocBody,
      bodyCodecVersion: 1,
      paperStyle: 'ruled',
      notebookMode: 'normal',
      notebookSurface: 'spatial',
      schemaVersion: 1,
      sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1'] }],
      pages: [{
        id: 'page-1',
        sectionId: 'sec-notes',
        kind: 'document',
        title: 'Page 1',
        documentBody: v1DocBody,
        documentBodyCodecVersion: 1,
      }],
    };

    act(() => {
      hookStore.updateObjectContent(createdObjectId, v1Content);
    });

    await vi.waitFor(() => {
      const raw = mem.get(`fw_section_${sectionId}_board_${boardId}_objects_v1`) ?? mem.get(`fw_section_${sectionId}_free_space_objects_v1`);
      expect(raw).toContain('Hello V1');
    }, { timeout: 2000 });

    const rawStored = mem.get(`fw_section_${sectionId}_board_${boardId}_objects_v1`) ?? mem.get(`fw_section_${sectionId}_free_space_objects_v1`);
    const parsedStored = JSON.parse(rawStored!);
    const storedObj = parsedStored.find((o: any) => o.id === createdObjectId);

    const rehydrated = ensureProjectObjectContent('notebook', storedObj.content);

    expect((rehydrated as any).bodyCodecVersion).toBe(1);
    expect((rehydrated as any).pages?.[0]?.documentBodyCodecVersion).toBe(1);
  });

  it('Mutation 1: page switch & return preserves atomic codec version', () => {
    const v1Body1 = '~nb1:[["paragraph","Page 1 text",[]]]';
    const v1Body2 = '~nb1:[["paragraph","Page 2 text",[]]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body1,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1', 'p2'] }],
      pages: [
        { id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body1, documentBodyCodecVersion: 1 },
        { id: 'p2', sectionId: 'sec-1', kind: 'document', title: 'P2', documentBody: v1Body2, documentBodyCodecVersion: 1 },
      ],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const editedP1 = '~nb1:[["paragraph","Page 1 edited",[]]]';
    const switchedToP2 = switchNotebookPage(initial, 'p2', editedP1, 1);
    expect(switchedToP2.activePageId).toBe('p2');
    expect(switchedToP2.body).toBe(v1Body2);
    expect(switchedToP2.bodyCodecVersion).toBe(1);

    const p1 = switchedToP2.pages!.find(p => p.id === 'p1')!;
    expect(p1.documentBody).toBe(editedP1);
    expect(p1.documentBodyCodecVersion).toBe(1);

    const switchedBack = switchNotebookPage(switchedToP2, 'p1', v1Body2, 1);
    expect(switchedBack.activePageId).toBe('p1');
    expect(switchedBack.body).toBe(editedP1);
    expect(switchedBack.bodyCodecVersion).toBe(1);
  });

  it('Mutation 2: section switch & return preserves atomic codec version', () => {
    const v1Body1 = '~nb1:[["paragraph","Sec 1 Page 1",[]]]';
    const v1Body2 = '~nb1:[["paragraph","Sec 2 Page 1",[]]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body1,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [
        { id: 'sec-1', title: 'Notes', pageIds: ['p1'] },
        { id: 'sec-2', title: 'Work', pageIds: ['p2'] },
      ],
      pages: [
        { id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body1, documentBodyCodecVersion: 1 },
        { id: 'p2', sectionId: 'sec-2', kind: 'document', title: 'P2', documentBody: v1Body2, documentBodyCodecVersion: 1 },
      ],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const switchedSec = setActiveNotebookSection(initial, 'sec-2', v1Body1, 1);
    expect(switchedSec.activeSectionId).toBe('sec-2');
    expect(switchedSec.activePageId).toBe('p2');
    expect(switchedSec.body).toBe(v1Body2);
    expect(switchedSec.bodyCodecVersion).toBe(1);
    expect(switchedSec.pages!.find(p => p.id === 'p1')!.documentBodyCodecVersion).toBe(1);

    const switchedBack = setActiveNotebookSection(switchedSec, 'sec-1', v1Body2, 1);
    expect(switchedBack.activeSectionId).toBe('sec-1');
    expect(switchedBack.activePageId).toBe('p1');
    expect(switchedBack.body).toBe(v1Body1);
    expect(switchedBack.bodyCodecVersion).toBe(1);
  });

  it('Mutation 3: add page preserves previous page codec metadata and sets clean active state', () => {
    const v1Body = '~nb1:[["paragraph","P1 content",[]]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const withNewPage = addNotebookPage(initial, 'sec-1', v1Body, 'Page 2', 'document', 1);
    expect(withNewPage.pages!.length).toBe(2);
    expect(withNewPage.pages!.find(p => p.id === 'p1')!.documentBodyCodecVersion).toBe(1);
    expect(withNewPage.pages!.find(p => p.id === 'p1')!.documentBody).toBe(v1Body);
    expect(withNewPage.body).toBe('');
    expect(withNewPage.bodyCodecVersion).toBeUndefined();

    const backToP1 = switchNotebookPage(withNewPage, 'p1', '', undefined);
    expect(backToP1.activePageId).toBe('p1');
    expect(backToP1.body).toBe(v1Body);
    expect(backToP1.bodyCodecVersion).toBe(1);
  });

  it('Mutation 4: add section preserves previous section page codec metadata', () => {
    const v1Body = '~nb1:[["paragraph","Sec 1 P1",[]]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const withNewSec = addNotebookSection(initial, v1Body, 'Section 2', 1);
    expect(withNewSec.sections!.length).toBe(2);
    expect(withNewSec.pages!.find(p => p.id === 'p1')!.documentBodyCodecVersion).toBe(1);
    expect(withNewSec.pages!.find(p => p.id === 'p1')!.documentBody).toBe(v1Body);
  });

  it('Mutation 5: formatting / block commit dual-write preserves codecVersion 1', () => {
    const v1Body = '~nb1:[["paragraph","Formatted text",[]]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const nextBody = '~nb1:[["title","Title text",[]]]';
    const persisted = applyNotebookPersist(
      { ...initial, body: nextBody, bodyCodecVersion: 1 },
      { body: nextBody, codecVersion: 1 },
    );
    expect(persisted.body).toBe(nextBody);
    expect(persisted.bodyCodecVersion).toBe(1);
    const p1 = persisted.pages!.find(p => p.id === 'p1')!;
    expect(p1.documentBody).toBe(nextBody);
    expect(p1.documentBodyCodecVersion).toBe(1);
  });

  it('Mutation 6: rename section and rename page preserve active page codecVersion', () => {
    const v1Body = '~nb1:[["paragraph","Text",[]]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const renamedSec = renameNotebookSection(saveNotebookPageBody(initial, v1Body, 1), 'sec-1', 'Renamed Notes');
    expect(renamedSec.sections![0]!.title).toBe('Renamed Notes');
    expect(renamedSec.bodyCodecVersion).toBe(1);
    expect(renamedSec.pages![0]!.documentBodyCodecVersion).toBe(1);

    const renamedPage = renameNotebookPage(saveNotebookPageBody(renamedSec, v1Body, 1), 'p1', 'Renamed Page');
    expect(renamedPage.pages![0]!.title).toBe('Renamed Page');
    expect(renamedPage.bodyCodecVersion).toBe(1);
    expect(renamedPage.pages![0]!.documentBodyCodecVersion).toBe(1);
  });

  it('Mutation 7: image insert and remove retains codecVersion', () => {
    const v1BodyBefore = '~nb1:[["paragraph","Before image",[]]]';
    const v1BodyWithImage = '~nb1:[["paragraph","Before image",[]],["image-ref","img-1","Photo"]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1BodyBefore,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1BodyBefore, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const inserted = applyNotebookPersist(
      { ...initial, body: v1BodyWithImage, bodyCodecVersion: 1 },
      { body: v1BodyWithImage, codecVersion: 1 },
    );
    expect(inserted.bodyCodecVersion).toBe(1);
    expect(inserted.pages![0]!.documentBodyCodecVersion).toBe(1);

    const removed = applyNotebookPersist(
      { ...inserted, body: v1BodyBefore, bodyCodecVersion: 1 },
      { body: v1BodyBefore, codecVersion: 1 },
    );
    expect(removed.bodyCodecVersion).toBe(1);
    expect(removed.pages![0]!.documentBodyCodecVersion).toBe(1);
  });

  it('Mutation 8: handwriting insert and remove retains codecVersion', () => {
    const v1BodyBefore = '~nb1:[["paragraph","Before handwriting",[]]]';
    const v1BodyWithHw = '~nb1:[["paragraph","Before handwriting",[]],["handwriting","hw-key-1"]]';
    const initial: NotebookContentWithPages = {
      type: 'notebook',
      body: v1BodyBefore,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1BodyBefore, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const inserted = applyNotebookPersist(
      { ...initial, body: v1BodyWithHw, bodyCodecVersion: 1 },
      { body: v1BodyWithHw, codecVersion: 1 },
    );
    expect(inserted.bodyCodecVersion).toBe(1);
    expect(inserted.pages![0]!.documentBodyCodecVersion).toBe(1);

    const removed = applyNotebookPersist(
      { ...inserted, body: v1BodyBefore, bodyCodecVersion: 1 },
      { body: v1BodyBefore, codecVersion: 1 },
    );
    expect(removed.bodyCodecVersion).toBe(1);
    expect(removed.pages![0]!.documentBodyCodecVersion).toBe(1);
  });

  it('Mutation 9: reload boundary preserves V1 bodyCodecVersion across serialization', () => {
    const v1Body = '~nb1:[["paragraph","Reload text",[]]]';
    const saved: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const json = JSON.stringify(saved);
    const parsed = JSON.parse(json);
    const rehydrated = hydrateNotebookPages(parsed);

    expect(rehydrated.bodyCodecVersion).toBe(1);
    expect(rehydrated.pages?.[0]?.documentBodyCodecVersion).toBe(1);
  });

  it('Mutation 10: cloud-shaped parent reflection preserves active page codecVersion atomically', () => {
    const v1Body = '~nb1:[["paragraph","Cloud reflection",[]]]';
    const localContent: NotebookContentWithPages = {
      type: 'notebook',
      body: v1Body,
      bodyCodecVersion: 1,
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{ id: 'p1', sectionId: 'sec-1', kind: 'document', title: 'P1', documentBody: v1Body, documentBodyCodecVersion: 1 }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    const cloudPayload = prepareNotebookForCloudPersist(localContent, 'p1');
    // In cloud payload, active page navigation is stripped for cloud wire representation
    expect(cloudPayload.activePageId).toBeUndefined();
    expect(cloudPayload.activeSectionId).toBeUndefined();
    expect(cloudPayload.bodyCodecVersion).toBe(1);

    // Hydrate cloud payload
    const hydratedFromCloud = hydrateNotebookPages(cloudPayload);
    // Hydration reconstructs the active page documentBody and codecVersion from body atomically
    expect(hydratedFromCloud.bodyCodecVersion).toBe(1);
    expect(hydratedFromCloud.pages!.find(p => p.id === 'p1')!.documentBodyCodecVersion).toBe(1);
    expect(hydratedFromCloud.pages!.find(p => p.id === 'p1')!.documentBody).toBe(v1Body);
  });

  it('Negative test: malformed V1 body with missing codecVersion FAILS CLOSED and is NOT repaired by hydration', () => {
    const malformedContent = {
      type: 'notebook',
      body: '~nb1:[["paragraph","Tampered content",[]]]',
      // Deliberately missing bodyCodecVersion!
      schemaVersion: 1,
      sections: [{ id: 'sec-1', title: 'Notes', pageIds: ['p1'] }],
      pages: [{
        id: 'p1',
        sectionId: 'sec-1',
        kind: 'document',
        title: 'P1',
        documentBody: '~nb1:[["paragraph","Tampered content",[]]]',
        // Deliberately missing documentBodyCodecVersion!
      }],
      activeSectionId: 'sec-1',
      activePageId: 'p1',
    };

    // Hydration must NOT repair or sniff codec version
    const hydrated = hydrateNotebookPages(malformedContent as any);
    expect(hydrated.bodyCodecVersion).toBeUndefined();
    expect(hydrated.pages?.[0]?.documentBodyCodecVersion).toBeUndefined();

    // ensureProjectObjectContent must NOT sniff or repair
    const ensured = ensureProjectObjectContent('notebook', malformedContent as any);
    expect((ensured as any).bodyCodecVersion).toBeUndefined();
    expect((ensured as any).pages?.[0]?.documentBodyCodecVersion).toBeUndefined();
  });

  it('QA8 Regression: Add Page through real component path does NOT copy Page 1 content into Page 2', async () => {
    const sectionId = 'sec-qa8-addpage';
    const boardId = 'main';

    let hookStore: any = null;
    let createdObjectId = '';

    function ParentApp() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      hookStore = store;
      const obj = store.objects.find(o => o.id === createdObjectId);

      return createElement('div', null,
        obj ? createElement(ProjectSpaceObjectRenderer, {
          object: obj,
          allObjects: store.objects,
          tokens,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
          objectPresentationMode: 'fullscreen',
          onChange: (newContent: any) => {
            store.updateObjectContent(obj.id, newContent);
          },
        }) : null
      );
    }

    mount(createElement(ParentApp));

    act(() => {
      const createdObj = hookStore.addObject('notebook');
      createdObjectId = createdObj.id;
    });

    // Wait for candidate editor to mount on fresh Page 1
    await vi.waitFor(() => {
      const pm = host!.querySelector('.ProseMirror') as any;
      expect(pm?.editor).toBeDefined();
      const buttons = Array.from(host!.querySelectorAll('button'));
      expect(buttons.some(b => b.textContent?.includes('+ Document page'))).toBe(true);
    });

    // 1. Fresh Page 1
    // 2. Type: "Page 1 unique content"
    const pm1 = host!.querySelector('.ProseMirror') as any;
    act(() => {
      pm1.editor.chain().focus().setContent({
        type: 'doc',
        content: [
          { type: 'nbParagraph', content: [{ type: 'text', text: 'Page 1 unique content' }] },
        ],
      }, { emitUpdate: true }).run();
    });

    // 3. DO NOT wait for persistence debounce!
    // 4. Immediately click Add Page.
    const buttons = Array.from(host!.querySelectorAll('button'));
    const addPageBtn = buttons.find(b => b.textContent?.includes('+ Document page'))!;
    act(() => {
      addPageBtn.click();
    });

    // Wait for store update
    await vi.waitFor(() => {
      const updatedObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
      expect(updatedObj.content.pages.length).toBe(2);
    });

    const updatedObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
    const content = updatedObj.content;
    const page1 = content.pages.find((p: any) => p.id === 'page-1');
    const page2 = content.pages.find((p: any) => p.id !== 'page-1');

    // PAGE 1 assertions
    expect(page1.documentBody).toContain('Page 1 unique content');
    expect(page1.documentBodyCodecVersion).toBe(1);

    // PAGE 2 assertions - MUST NOT contain Page 1 content!
    expect(page2.documentBody).not.toContain('Page 1 unique content');
    expect(page2.documentBody).toBe('');
    expect(page2.documentBodyCodecVersion).toBeUndefined();

    // ACTIVE PROJECTION assertions
    const candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    expect(candidateRoot).toBeTruthy();
    expect(candidateRoot.getAttribute('data-nb-candidate-page')).toBe(page2.id);
    expect(content.body).toBe('');
    expect(content.bodyCodecVersion).toBeUndefined();

    // Type on Page 2
    const pm = host!.querySelector('.ProseMirror') as any;
    expect(pm?.editor).toBeDefined();
    act(() => {
      pm.editor.chain().focus().setContent({
        type: 'doc',
        content: [
          { type: 'nbParagraph', content: [{ type: 'text', text: 'Page 2 unique content' }] },
        ],
      }, { emitUpdate: true }).run();
    });

    // Wait for persistence to record Page 2 content
    await vi.waitFor(() => {
      const live = hookStore.objects.find((o: any) => o.id === createdObjectId);
      const p2 = live.content.pages.find((p: any) => p.id === page2.id);
      expect(p2.documentBody).toContain('Page 2 unique content');
    });

    const afterTypeObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
    const p1AfterType = afterTypeObj.content.pages.find((p: any) => p.id === 'page-1');
    const p2AfterType = afterTypeObj.content.pages.find((p: any) => p.id === page2.id);
    expect(p1AfterType.documentBody).toContain('Page 1 unique content');
    expect(p1AfterType.documentBody).not.toContain('Page 2 unique content');
    expect(p1AfterType.documentBodyCodecVersion).toBe(1);
    expect(p2AfterType.documentBody).toContain('Page 2 unique content');
    expect(p2AfterType.documentBody).not.toContain('Page 1 unique content');
    expect(p2AfterType.documentBodyCodecVersion).toBe(1);

    // Switch Page 2 -> Page 1
    const p1Button = Array.from(host!.querySelectorAll('button')).find(b => b.textContent?.includes('Page 1'))!;
    act(() => {
      p1Button.click();
    });

    await vi.waitFor(() => {
      const cand = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
      expect(cand.getAttribute('data-nb-candidate-page')).toBe('page-1');
    });

    // Switch Page 1 -> Page 2
    const p2Button = Array.from(host!.querySelectorAll('button')).find(b => b.textContent?.includes('Page 2'))!;
    act(() => {
      p2Button.click();
    });

    await vi.waitFor(() => {
      const cand = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
      expect(cand.getAttribute('data-nb-candidate-page')).toBe(page2.id);
    });

    // Reload check: ensure persisted storage retains full page isolation
    await vi.waitFor(() => {
      const raw = mem.get(`fw_section_${sectionId}_board_${boardId}_objects_v1`) ?? mem.get(`fw_section_${sectionId}_free_space_objects_v1`);
      expect(raw).toContain('Page 2 unique content');
    });
    const rawStored = mem.get(`fw_section_${sectionId}_board_${boardId}_objects_v1`) ?? mem.get(`fw_section_${sectionId}_free_space_objects_v1`);
    const parsed = JSON.parse(rawStored!);
    const storedObj = parsed.find((o: any) => o.id === createdObjectId);
    const rehydrated = ensureProjectObjectContent('notebook', storedObj.content);
    const rehydratedP1 = (rehydrated as any).pages?.find((p: any) => p.id === 'page-1');
    const rehydratedP2 = (rehydrated as any).pages?.find((p: any) => p.id === page2.id);
    expect(rehydratedP1.documentBody).toContain('Page 1 unique content');
    expect(rehydratedP1.documentBody).not.toContain('Page 2 unique content');
    expect(rehydratedP1.documentBodyCodecVersion).toBe(1);
    expect(rehydratedP2.documentBody).toContain('Page 2 unique content');
    expect(rehydratedP2.documentBody).not.toContain('Page 1 unique content');
    expect(rehydratedP2.documentBodyCodecVersion).toBe(1);
  });

  it('QA8 Regression: Add Section through real component path does NOT copy previous section content into new Section', async () => {
    const sectionId = 'sec-qa8-addsec';
    const boardId = 'main';

    let hookStore: any = null;
    let createdObjectId = '';

    function ParentApp() {
      const store = useSectionFreeSpaceObjects(sectionId, boardId, 'test-user');
      hookStore = store;
      const obj = store.objects.find(o => o.id === createdObjectId);

      return createElement('div', null,
        obj ? createElement(ProjectSpaceObjectRenderer, {
          object: obj,
          allObjects: store.objects,
          tokens,
          freeSpaceSectionId: sectionId,
          freeSpaceBoardId: boardId,
          objectPresentationMode: 'fullscreen',
          onChange: (newContent: any) => {
            store.updateObjectContent(obj.id, newContent);
          },
        }) : null
      );
    }

    mount(createElement(ParentApp));

    act(() => {
      const createdObj = hookStore.addObject('notebook');
      createdObjectId = createdObj.id;
    });

    const v1DocBody = serializeNotebookBlocks([{ id: 'p1', kind: 'paragraph', text: 'Section 1 unique content' }], 1);

    const v1Content = {
      type: 'notebook',
      body: v1DocBody,
      bodyCodecVersion: 1,
      paperStyle: 'ruled',
      notebookMode: 'normal',
      notebookSurface: 'spatial',
      schemaVersion: 1,
      sections: [{ id: 'sec-notes', title: 'Notes', pageIds: ['page-1'] }],
      pages: [{
        id: 'page-1',
        sectionId: 'sec-notes',
        kind: 'document',
        title: 'Page 1',
        documentBody: v1DocBody,
        documentBodyCodecVersion: 1,
      }],
      activeSectionId: 'sec-notes',
      activePageId: 'page-1',
    };

    act(() => {
      hookStore.updateObjectContent(createdObjectId, v1Content);
    });

    // Wait for candidate editor to mount and render navigator
    await vi.waitFor(() => {
      const buttons = Array.from(host!.querySelectorAll('button'));
      expect(buttons.some(b => b.textContent?.includes('+ Topic'))).toBe(true);
    });

    // Click "+ Topic"
    const buttons = Array.from(host!.querySelectorAll('button'));
    const addSecBtn = buttons.find(b => b.textContent?.includes('+ Topic'))!;
    act(() => {
      addSecBtn.click();
    });

    // Wait for store update: 2 sections, 2 pages
    await vi.waitFor(() => {
      const updatedObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
      expect(updatedObj.content.sections.length).toBe(2);
      expect(updatedObj.content.pages.length).toBe(2);
    });

    const updatedObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
    const content = updatedObj.content;
    const sec1Page = content.pages.find((p: any) => p.id === 'page-1');
    const sec2Page = content.pages.find((p: any) => p.id !== 'page-1');

    // Section 1 Page 1 must retain unique content
    expect(sec1Page.documentBody).toContain('Section 1 unique content');
    expect(sec1Page.documentBodyCodecVersion).toBe(1);

    // Section 2 Page 1 must be EMPTY and not contain Section 1 content!
    expect(sec2Page.documentBody).not.toContain('Section 1 unique content');
    expect(sec2Page.documentBody).toBe('');
    expect(sec2Page.documentBodyCodecVersion).toBeUndefined();

    // Active candidate should point to the new section's page
    const candidateRoot = host!.querySelector('[data-nb-tiptap-candidate-root="1"]') as HTMLElement;
    expect(candidateRoot.getAttribute('data-nb-candidate-page')).toBe(sec2Page.id);

    // Type on Section 2 Page 1
    const pm = host!.querySelector('.ProseMirror') as any;
    act(() => {
      pm.editor.chain().focus().setContent({
        type: 'doc',
        content: [
          { type: 'nbParagraph', content: [{ type: 'text', text: 'Section 2 unique content' }] },
        ],
      }, { emitUpdate: true }).run();
    });

    // Wait for persistence to record Section 2 content
    await vi.waitFor(() => {
      const live = hookStore.objects.find((o: any) => o.id === createdObjectId);
      const p2 = live.content.pages.find((p: any) => p.id === sec2Page.id);
      expect(p2.documentBody).toContain('Section 2 unique content');
    });

    const afterTypeObj = hookStore.objects.find((o: any) => o.id === createdObjectId);
    const p1After = afterTypeObj.content.pages.find((p: any) => p.id === 'page-1');
    const p2After = afterTypeObj.content.pages.find((p: any) => p.id === sec2Page.id);
    expect(p1After.documentBody).toContain('Section 1 unique content');
    expect(p1After.documentBody).not.toContain('Section 2 unique content');
    expect(p2After.documentBody).toContain('Section 2 unique content');
    expect(p2After.documentBody).not.toContain('Section 1 unique content');
  });
});
