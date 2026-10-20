/**
 * @vitest-environment happy-dom
 */
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademicCompositionShell } from '../../../components/project-space/AcademicCompositionShell';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import * as gatewayClient from '../gatewayClient';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import { readAcademicWorkspace } from '../../studySession/academicWorkspaceLayout';
import { readTutorLayout, tutorLayoutStorageKey, writeTutorLayout } from './tutorLayoutStorage';
import { tutorSessionStorageKey, writeTutorSession } from './tutorSessionStorage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../gatewayClient', () => ({
  zikukAiRequest: vi.fn(),
}));

const tokens = {
  accent: '#f59e0b',
  cardBg: '#111',
  cardBorder: '#333',
  textPrimary: '#fff',
  textSecondary: '#aaa',
  textMuted: '#777',
  wellBg: '#000',
  pageBg: '#000',
} as unknown as AtmosphereTokens;

const explainCapture: TutorCaptureIntent = {
  action: 'explain',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 4,
    regionNorm: { x: 0.1, y: 0.2, w: 0.4, h: 0.1 },
    attachmentType: 'text_selection',
    extractedText: 'The integral of x squared.',
  },
};

const selection: TutorCaptureIntent = {
  action: 'explain',
  mode: 'exam_prep',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 6,
    regionNorm: { x: 0, y: 0, w: 1, h: 1 },
    attachmentType: 'text_selection',
    extractedText: 'A captured paragraph about derivatives.',
  },
};

describe('Tutor side dock', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setWidth(1600);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  function setWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  }

  function renderShell(extra: Record<string, unknown> = {}) {
    act(() => {
      root!.render(
        createElement(AcademicCompositionShell, {
          tokens,
          pdfTitle: 'Problem Set 4 Solutions.pdf',
          notebookTitle: 'Notes',
          splitRatio: 0.5,
          onSplitRatioChange: () => {},
          onClose: () => {},
          pdfSurface: createElement('div', { 'data-testid': 'pdf-toolbar-stub' }, 'PDF toolbar'),
          notebookSurface: createElement('div', null, 'Notebook controls'),
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          visiblePage: 3,
          userId: 'user-1',
          tutorIntent: null,
          onOpenTutor: () => {},
          onCloseTutor: () => {},
          onNavigateToSource: () => {},
          ...extra,
        }),
      );
    });
  }

  function typeDraft(value: string) {
    const field = document.querySelector(
      '[data-testid="tutor-initial-question-input"], [data-testid="tutor-followup-input"]',
    ) as HTMLInputElement | HTMLTextAreaElement;
    act(() => {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('opens on the right, can move left, and keeps one Tutor mounted', () => {
    renderShell();
    expect(document.querySelector('[data-testid="tutor-dock-side"]')).toBeTruthy();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    const dock = document.querySelector('[data-testid="tutor-side-dock"]') as HTMLElement;
    expect(dock.getAttribute('data-tutor-visual')).toBe('side-right');
    expect(dock.getAttribute('data-side-width')).toBe('360');
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-tutor-frame')).toBe(
      'side-right',
    );
    expect(
      (document.querySelector('[data-testid="tutor-workspace-grid"]') as HTMLElement).style.gridTemplateColumns,
    ).toContain('360px');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="two-surface-pane-a"]')?.textContent).toContain('PDF toolbar');
    expect(document.querySelector('[data-testid="two-surface-pane-b"]')?.textContent).toContain('Notebook');
    expect(document.querySelector('[data-testid="tutor-initial-question-input"]')).toBeTruthy();
    const sideNode = document.querySelector('[data-tutor-root="tutor"]');

    act(() => {
      (document.querySelector('[data-testid="workspace-move-left-tutor"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(
      'pdf,tutor,notebook',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-right');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(sideNode);
    expect(gatewayClient.zikukAiRequest).not.toHaveBeenCalled();
  });

  it('clamps the drawn width and keeps a wider stored preference', () => {
    writeTutorLayout('user-1', 'sec-1', { placement: 'side-right', sideDockWidth: 480, topDockExpanded: false });
    setWidth(1400);
    renderShell();
    const drawn = Number(document.querySelector('[data-testid="tutor-side-dock"]')?.getAttribute('data-side-width'));
    expect(drawn).toBeGreaterThan(392);
    expect(drawn).toBeLessThanOrEqual(480);
    expect(readTutorLayout('user-1', 'sec-1')?.sideDockWidth).toBe(480);
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-right');
  });

  it('falls back to the top dock below the comfortable width without rewriting placement', () => {
    writeTutorLayout('user-1', 'sec-1', { placement: 'side-left', sideDockWidth: 360, topDockExpanded: false });
    setWidth(1280);
    renderShell();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(document.querySelector('[data-testid="tutor-side-dock"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-dock-side"]')).toBeNull();
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-left');
    expect(readTutorLayout('user-1', 'sec-1')?.sideDockWidth).toBe(360);

    act(() => {
      setWidth(1600);
      window.dispatchEvent(new Event('resize'));
    });
    expect(document.querySelector('[data-testid="tutor-side-dock"]')?.getAttribute('data-tutor-visual')).toBe(
      'side-left',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-left');
  });

  it('keeps the draft, conversation, and teaching mode across side, float, and expanded top', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'exam_prep',
      turns: [
        { id: 'u1', role: 'user', content: 'Earlier derivative question', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'Earlier derivative answer', timestamp: 2, mode: 'exam_prep' },
      ],
    });
    const conversationKey = tutorSessionStorageKey('user-1', 'sec-1', 'pdf-1');
    const before = localStorage.getItem(conversationKey);
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'Earlier derivative question',
    );
    expect(document.querySelector('[data-testid="tutor-header-mode-trigger"]')?.textContent).toContain('Exam Prep');
    typeDraft('Still the same draft');
    const rootNode = document.querySelector('[data-tutor-root="tutor"]');

    act(() => {
      (document.querySelector('[data-testid="workspace-move-left-tutor"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-followup-input"]')).toHaveProperty('value', 'Still the same draft');
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(rootNode);

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-float"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')?.getAttribute('data-tutor-visual')).toBe(
      'floating',
    );
    expect(document.querySelector('[data-testid="tutor-followup-input"]')).toHaveProperty('value', 'Still the same draft');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);

    act(() => {
      (document.querySelector('[data-testid="tutor-float-dock"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('0');

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    expect(document.querySelector('[data-testid="tutor-followup-input"]')).toHaveProperty('value', 'Still the same draft');
    expect(document.querySelector('[data-testid="tutor-dock-resize-handle"]')).toBeTruthy();
    expect(localStorage.getItem(conversationKey)).toBe(before);
    expect(localStorage.getItem(tutorLayoutStorageKey('user-1', 'sec-1'))).not.toContain('Earlier derivative');
  });

  it('describes the open PDF, the visible page, and capture attachment without claiming the whole file', () => {
    renderShell({ tutorIntent: selection });
    const compact = document.querySelector('[data-testid="tutor-pdf-context"]') as HTMLElement;
    expect(compact.textContent).toContain('Problem Set 4 Solutions.pdf');
    expect(compact.textContent).toContain('p. 3');
    expect(compact.getAttribute('data-selection')).toBe('attached');
    expect(compact.textContent).not.toContain('whole file');
    expect(document.querySelector('[data-testid="tutor-dock-attachment"]')?.textContent).toContain('Selection attached');
    expect(document.querySelector('[data-testid="tutor-dock-attachment"]')?.textContent).toContain('p. 6');

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    const open = document.querySelector('[data-testid="tutor-pdf-context"]') as HTMLElement;
    expect(open.textContent).toContain('Problem Set 4 Solutions.pdf');
    expect(open.textContent).toContain('Page 3');
    expect(open.getAttribute('data-context-open')).toBe('0');
    expect(open.textContent).not.toContain('not the whole file');
    expect(open.getAttribute('data-selection')).toBe('attached');
    expect(open.textContent).not.toContain('loaded');
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('not the whole file');

    act(() => {
      (document.querySelector('[data-testid="tutor-attachment-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-selection')).toBe(
      'detached',
    );
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('Page 3');
    expect(document.querySelector('[data-testid="tutor-attachment-detached-note"]')?.textContent).toContain('Detached');
  });

  it('says when no PDF is open', () => {
    renderShell({ pdfTitle: ' ', visiblePage: null });
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('No open PDF');
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-selection')).toBe('none');
  });

  it('resizes from the keyboard and does not pass the width limits', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    const handle = document.querySelector('[data-testid="workspace-separator-1"]') as HTMLElement;
    expect(handle.getAttribute('data-right')).toBe('tutor');
    expect(handle.getAttribute('aria-valuenow')).toBe('360');
    const pdfWidth = document.querySelector('[data-testid="workspace-separator-0"]')?.getAttribute('data-left-width');
    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(readTutorLayout('user-1', 'sec-1')?.sideDockWidth).toBe(360);
    expect(document.querySelector('[data-testid="workspace-separator-1"]')?.getAttribute('aria-valuenow')).toBe('376');
    expect(document.querySelector('[data-testid="workspace-separator-0"]')?.getAttribute('data-left-width')).toBe(pdfWidth);

    act(() => {
      for (let step = 0; step < 12; step += 1) {
        (document.querySelector('[data-testid="workspace-separator-1"]') as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
        );
      }
    });
    expect(Number(document.querySelector('[data-testid="workspace-separator-1"]')?.getAttribute('aria-valuenow'))).toBeGreaterThan(480);
    expect(readTutorLayout('user-1', 'sec-1')?.sideDockWidth).toBe(360);
    expect(document.querySelector('[data-testid="workspace-separator-0"]')?.getAttribute('data-left-width')).toBe(pdfWidth);

    act(() => {
      for (let step = 0; step < 40; step += 1) {
        (document.querySelector('[data-testid="workspace-separator-1"]') as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        );
      }
    });
    expect(document.querySelector('[data-testid="workspace-separator-1"]')?.getAttribute('aria-valuenow')).toBe('320');
    expect(document.querySelector('[data-testid="workspace-separator-0"]')?.getAttribute('data-left-width')).toBe(pdfWidth);
  });

  it('returns to the compact top dock on Escape and can still expand or minimize', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
    expect(readTutorLayout('user-1', 'sec-1')?.sideDockWidth).toBe(360);

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-testid="tutor-side-expand-top"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('expanded');

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-testid="contextual-tutor-minimize-btn"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="contextual-tutor-minimized-pill"]')).toBeTruthy();
    expect(readTutorLayout('user-1', 'sec-1')?.restorePlacement).toBe('side-right');
    act(() => {
      (document.querySelector('[data-testid="contextual-tutor-restore-btn"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-side-dock"]')?.getAttribute('data-tutor-visual')).toBe(
      'side-right',
    );
  });

  it('keeps Side Dock when Capture Explain arrives', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [
        { id: 'u1', role: 'user', content: 'Earlier derivative question', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'Earlier derivative answer', timestamp: 2, mode: 'teach_me' },
      ],
    });
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    const tutor = document.querySelector('[data-tutor-root="tutor"]');
    typeDraft('Keep this follow-up');

    renderShell({ tutorIntent: explainCapture });

    expect(document.querySelector('[data-testid="tutor-side-dock"]')?.getAttribute('data-tutor-visual')).toBe(
      'side-right',
    );
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-tutor-frame')).toBe(
      'side-right',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-right');
    expect(document.querySelector('[data-testid="tutor-top-dock"]')).toBeNull();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(tutor);
    expect(document.querySelector('[data-testid="tutor-header-mode-trigger"]')?.textContent).toContain('Explain');
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'The integral of x squared.',
    );
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-selection')).toBe(
      'attached',
    );
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'Earlier derivative question',
    );
    expect(document.querySelector('[data-testid="tutor-followup-input"]')).toHaveProperty('value', 'Keep this follow-up');
  });

  it('keeps Floating when Capture Explain arrives', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-float"]') as HTMLButtonElement).click();
    });
    const tutor = document.querySelector('[data-tutor-root="tutor"]');

    renderShell({ tutorIntent: explainCapture });

    expect(document.querySelector('[data-testid="contextual-tutor-card"]')?.getAttribute('data-tutor-visual')).toBe(
      'floating',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('floating');
    expect(document.querySelector('[data-testid="tutor-top-dock"]')).toBeNull();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(tutor);
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'The integral of x squared.',
    );
  });

  it('expands Compact Tutor when Capture Explain arrives', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    typeDraft('A question I already typed');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-collapse"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('0');

    renderShell({ tutorIntent: explainCapture });

    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe(
      'expanded',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="tutor-header-mode-trigger"]')?.textContent).toContain('Explain');
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'The integral of x squared.',
    );
    expect(document.querySelector('[data-testid="tutor-initial-question-input"]')).toHaveProperty(
      'value',
      'A question I already typed',
    );
  });

  function StickyPdf() {
    const [page, setPage] = useState('3');
    const [zoom, setZoom] = useState('1.5');
    return createElement(
      'div',
      null,
      createElement('input', {
        'data-testid': 'sticky-pdf-page',
        value: page,
        onChange: (event: { target: { value: string } }) => setPage(event.target.value),
      }),
      createElement('input', {
        'data-testid': 'sticky-pdf-zoom',
        value: zoom,
        onChange: (event: { target: { value: string } }) => setZoom(event.target.value),
      }),
    );
  }

  function StickyNotebook() {
    const [note, setNote] = useState('unsaved integral');
    return createElement('textarea', {
      'data-testid': 'sticky-notebook',
      value: note,
      onChange: (event: { target: { value: string } }) => setNote(event.target.value),
    });
  }

  function setControlValue(selector: string, value: string) {
    const field = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    act(() => {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('places PDF, Notebook, and Tutor in every order on the same Tutor', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    const tutor = document.querySelector('[data-tutor-root="tutor"]');
    const move = (pane: string, direction: 'left' | 'right') => {
      act(() => {
        (document.querySelector(`[data-testid="workspace-move-${direction}-${pane}"]`) as HTMLButtonElement).click();
      });
    };
    const seen = new Set<string>();
    const note = () => {
      seen.add(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order') ?? '');
    };
    note();
    move('notebook', 'left');
    note();
    move('tutor', 'left');
    note();
    move('notebook', 'right');
    note();
    move('pdf', 'left');
    note();
    move('tutor', 'right');
    note();
    move('pdf', 'right');
    note();
    move('tutor', 'right');
    note();
    move('pdf', 'left');
    note();
    move('tutor', 'left');
    note();
    expect([...seen].sort()).toEqual([
      'notebook,pdf,tutor',
      'notebook,tutor,pdf',
      'pdf,notebook,tutor',
      'pdf,tutor,notebook',
      'tutor,notebook,pdf',
      'tutor,pdf,notebook',
    ]);
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(tutor);
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
  });

  it('keeps PDF, Notebook, and Tutor state while reordering and resizing', async () => {
    vi.mocked(gatewayClient.zikukAiRequest).mockImplementation(() => new Promise(() => {}));
    renderShell({
      pdfSurface: createElement(StickyPdf),
      notebookSurface: createElement(StickyNotebook),
    });
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    setControlValue('[data-testid="sticky-pdf-page"]', '7');
    setControlValue('[data-testid="sticky-pdf-zoom"]', '2');
    setControlValue('[data-testid="sticky-notebook"]', 'still editing');
    const notebook = document.querySelector('[data-testid="sticky-notebook"]') as HTMLTextAreaElement;
    const pdfPage = document.querySelector('[data-testid="sticky-pdf-page"]');
    act(() => {
      notebook.focus();
    });
    typeDraft('Do not lose this question');
    const tutor = document.querySelector('[data-tutor-root="tutor"]');
    act(() => {
      (document.querySelector('[data-testid="tutor-submit-initial-btn"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();

    act(() => {
      (document.querySelector('[data-testid="workspace-move-left-tutor"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(
      'pdf,tutor,notebook',
    );
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(tutor);
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'Do not lose this question',
    );
    expect(document.querySelector('[data-testid="sticky-pdf-page"]')).toBe(pdfPage);
    expect(document.querySelector('[data-testid="sticky-pdf-page"]')).toHaveProperty('value', '7');
    expect(document.querySelector('[data-testid="sticky-pdf-zoom"]')).toHaveProperty('value', '2');
    expect(document.querySelector('[data-testid="sticky-notebook"]')).toBe(notebook);
    expect(notebook).toHaveProperty('value', 'still editing');

    act(() => {
      notebook.focus();
      (document.querySelector('[data-testid="workspace-separator-0"]') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(notebook);
    expect(document.querySelector('[data-testid="workspace-separator-1"]')?.getAttribute('data-right-width')).toBeTruthy();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
  });

  it('keeps Capture Explain in the reordered pane', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-testid="workspace-move-left-tutor"]') as HTMLButtonElement).click();
    });
    const tutor = document.querySelector('[data-tutor-root="tutor"]');
    renderShell({ tutorIntent: explainCapture });
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(
      'pdf,tutor,notebook',
    );
    expect(document.querySelector('[data-testid="tutor-top-dock"]')).toBeNull();
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(tutor);
    expect(document.querySelector('[data-testid="tutor-header-mode-trigger"]')?.textContent).toContain('Explain');
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'The integral of x squared.',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-right');
  });

  it('remembers pane order after refresh and leaves the M3 layout record in place', () => {
    const layoutBefore = JSON.stringify({ placement: 'side-right', sideDockWidth: 400, topDockExpanded: false });
    writeTutorLayout('user-1', 'sec-1', { placement: 'side-right', sideDockWidth: 400, topDockExpanded: false });
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="workspace-move-left-notebook"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(
      'notebook,pdf,tutor',
    );
    const savedOrder = readAcademicWorkspace('user-1', 'sec-1')?.order.join(',');
    act(() => {
      root?.unmount();
    });
    root = createRoot(host!);
    renderShell();
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(savedOrder);
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-right');
    expect(readTutorLayout('user-1', 'sec-1')?.sideDockWidth).toBe(400);
    expect(layoutBefore).toContain('side-right');
  });

  it('falls back to the top dock without rewriting the saved pane order', () => {
    writeTutorLayout('user-1', 'sec-1', { placement: 'side-right', sideDockWidth: 360, topDockExpanded: false });
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="workspace-move-left-tutor"]') as HTMLButtonElement).click();
    });
    const saved = readAcademicWorkspace('user-1', 'sec-1')?.order.join(',');
    act(() => {
      setWidth(1100);
      window.dispatchEvent(new Event('resize'));
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBeNull();
    expect(readAcademicWorkspace('user-1', 'sec-1')?.order.join(',')).toBe(saved);
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-right');
    act(() => {
      setWidth(1600);
      window.dispatchEvent(new Event('resize'));
    });
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(saved);
  });

  it('uses accessible arrow buttons for pane order and keeps separators draggable', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-side"]') as HTMLButtonElement).click();
    });
    const left = document.querySelector('[data-testid="workspace-move-left-pdf"]') as HTMLButtonElement;
    const right = document.querySelector('[data-testid="workspace-move-right-pdf"]') as HTMLButtonElement;
    const tutorRight = document.querySelector('[data-testid="workspace-move-right-tutor"]') as HTMLButtonElement;
    expect(left.tagName).toBe('BUTTON');
    expect(left.disabled).toBe(true);
    expect(left.getAttribute('aria-label')).toBe('Move PDF left');
    expect(left.getAttribute('title')).toBe('Move PDF left');
    expect(left.querySelector('svg')).toBeTruthy();
    expect(left.textContent).not.toContain('Move left');
    expect(right.disabled).toBe(false);
    expect(right.getAttribute('aria-label')).toBe('Move PDF right');
    expect(tutorRight.disabled).toBe(true);
    expect(Number.parseInt(right.style.minWidth, 10)).toBeGreaterThanOrEqual(32);
    act(() => {
      right.focus();
    });
    expect(document.activeElement).toBe(right);
    act(() => {
      right.click();
    });
    expect(document.querySelector('[data-testid="tutor-workspace-grid"]')?.getAttribute('data-pane-order')).toBe(
      'notebook,pdf,tutor',
    );
    expect(document.querySelector('[data-testid="workspace-separator-0"] [data-resize-grip="vertical"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="workspace-separator-0"]')?.getAttribute('role')).toBe('separator');
    const separator = document.querySelector('[data-testid="workspace-separator-1"]') as HTMLElement;
    const before = separator.getAttribute('data-right-width');
    act(() => {
      separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(separator.getAttribute('data-right-width')).not.toBe(before);
  });
});
