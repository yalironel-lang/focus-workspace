/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademicCompositionShell } from '../../../components/project-space/AcademicCompositionShell';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import * as gatewayClient from '../gatewayClient';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import {
  readTutorLayout,
  resolveTopDockExpandedHeight,
  TUTOR_TOP_DOCK_COLLAPSE_PAST_PX,
  TUTOR_TOP_DOCK_EXPANDED_DEFAULT,
  tutorLayoutStorageKey,
  writeTutorLayout,
} from './tutorLayoutStorage';
import { readTutorSession, tutorSessionStorageKey, writeTutorSession } from './tutorSessionStorage';

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

describe('Tutor top dock', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  const zikukAiRequestMock = vi.mocked(gatewayClient.zikukAiRequest);

  beforeEach(() => {
    localStorage.clear();
    zikukAiRequestMock.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  function renderShell(extra: Record<string, unknown> = {}) {
    act(() => {
      root!.render(
        createElement(AcademicCompositionShell, {
          tokens,
          pdfTitle: 'Lecture.pdf',
          notebookTitle: 'Notes',
          splitRatio: 0.5,
          onSplitRatioChange: () => {},
          onClose: () => {},
          pdfSurface: createElement('div', { 'data-testid': 'pdf-toolbar-stub' }, 'PDF toolbar'),
          notebookSurface: createElement('div', null, 'Notebook controls'),
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
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

  it('shows one compact dock by default, sends nothing, and leaves PDF and Notebook in place', () => {
    renderShell();
    const shell = document.querySelector('[data-testid="academic-composition-shell"]') as HTMLElement;
    const header = shell.querySelector('[data-testid="academic-composition-header"]') as HTMLElement;
    const dock = shell.querySelector('[data-tutor-root="tutor"]') as HTMLElement;
    const layout = shell.querySelector('[data-testid="two-surface-layout"]') as HTMLElement;
    const pdf = shell.querySelector('[data-testid="two-surface-pane-a"]') as HTMLElement;
    const notebook = shell.querySelector('[data-testid="two-surface-pane-b"]') as HTMLElement;

    expect(dock.getAttribute('data-tutor-visual')).toBe('compact');
    expect(dock.getAttribute('data-tutor-expanded')).toBe('0');
    expect(dock.style.height).toBe('52px');
    expect(shell.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    expect(header.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dock.compareDocumentPosition(layout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pdf.contains(dock)).toBe(false);
    expect(notebook.contains(dock)).toBe(false);
    expect(pdf.textContent).toContain('PDF toolbar');
    expect(notebook.textContent).toContain('Notebook controls');
  });

  it('expands and collapses without sending, and keeps the draft', () => {
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    const input = document.querySelector('[data-testid="tutor-initial-question-input"]') as HTMLTextAreaElement;
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    expect(input).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, 'Why does the slope change?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-collapse"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    expect(
      (document.querySelector('[data-testid="tutor-initial-question-input"]') as HTMLTextAreaElement).value,
    ).toBe('Why does the slope change?');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
  });

  it('keeps history, mode, attachment, and draft across dock and floating', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: selection,
      mode: 'exam_prep',
      turns: [
        { id: 'u1', role: 'user', content: 'Earlier derivative question', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'Earlier derivative answer', timestamp: 2, mode: 'exam_prep' },
      ],
    });
    renderShell();
    expect(document.querySelector('[data-testid="tutor-dock-attachment"]')?.textContent).toContain('p. 6');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'Earlier derivative question',
    );
    expect(document.querySelector('[data-testid="tutor-header-mode-trigger"]')?.textContent).toContain('Exam Prep');
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'derivatives',
    );
    const followUp = document.querySelector('[data-testid="tutor-followup-input"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(followUp, 'Ask about the next line');
      followUp.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-float"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-followup-input"]') as HTMLInputElement).toHaveProperty(
      'value',
      'Ask about the next line',
    );
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'Earlier derivative answer',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('floating');
    expect(readTutorLayout('user-1', 'sec-1')?.placementOrigin).toBe('explicit');

    act(() => {
      (document.querySelector('[data-testid="tutor-float-dock"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    expect((document.querySelector('[data-testid="tutor-followup-input"]') as HTMLInputElement).value).toBe(
      'Ask about the next line',
    );
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'derivatives',
    );
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.turns).toHaveLength(2);
  });

  it('migrates an automatic floating record to the compact dock and keeps an explicit float', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [{ id: 'u1', role: 'user', content: 'Stored thread', timestamp: 4 }],
    });
    const conversationKey = tutorSessionStorageKey('user-1', 'sec-1', 'pdf-1');
    const before = localStorage.getItem(conversationKey);
    localStorage.setItem(
      tutorLayoutStorageKey('user-1', 'sec-1'),
      JSON.stringify({
        version: 1,
        userId: 'user-1',
        sectionId: 'sec-1',
        placement: 'floating',
        restorePlacement: 'floating',
        floating: { width: 580, height: 640, positionX: 150, positionY: 85 },
        updatedAt: 9,
      }),
    );

    renderShell();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
    expect(readTutorLayout('user-1', 'sec-1')?.placementOrigin).toBe('implicit');
    expect(readTutorLayout('user-1', 'sec-1')?.floating).toMatchObject({ width: 580, positionX: 150 });
    expect(localStorage.getItem(conversationKey)).toBe(before);
    expect(zikukAiRequestMock).not.toHaveBeenCalled();

    act(() => {
      root?.unmount();
    });
    writeTutorLayout('user-1', 'sec-1', { placement: 'floating' });
    root = createRoot(host!);
    renderShell();
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')).toBeNull();
    expect(readTutorLayout('user-1', 'sec-1')?.placementOrigin).toBe('explicit');
    expect(localStorage.getItem(conversationKey)).toBe(before);
  });

  it('keeps a stored side placement while drawing the top dock', () => {
    writeTutorLayout('user-1', 'sec-1', { placement: 'side-left', topDockExpanded: false });
    renderShell();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-left');
    expect(document.querySelector('[data-testid="two-surface-pane-a"]')?.textContent).toContain('PDF toolbar');
  });

  it('restores compact after refresh and the saved thread after a section change', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: selection,
      mode: 'exam_prep',
      turns: [{ id: 'u1', role: 'user', content: 'Section one question', timestamp: 1 }],
    });
    writeTutorSession('user-1', 'sec-2', 'pdf-2', {
      intent: null,
      mode: 'explain',
      turns: [{ id: 'u2', role: 'user', content: 'Section two question', timestamp: 2 }],
    });
    renderShell({ tutorIntent: selection });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('0');

    act(() => {
      root?.unmount();
    });
    root = createRoot(host!);
    renderShell({ tutorIntent: null });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(zikukAiRequestMock).not.toHaveBeenCalled();

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Section one question');

    renderShell({ sectionId: 'sec-2', sourceObjectId: 'pdf-2', tutorIntent: null });
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Section two question');
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).not.toContain(
      'Section one question',
    );
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.turns[0]?.content).toBe('Section one question');
  });

  it('uses a short compact bar on a narrow viewport and caps the expanded height', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    renderShell();
    const dock = document.querySelector('[data-testid="tutor-top-dock"]') as HTMLElement;
    expect(dock.getAttribute('data-tutor-visual')).toBe('compact');
    expect(dock.style.height).toBe('56px');
    expect(dock.style.minWidth).toBe('');
    expect(document.querySelector('[data-testid="tutor-dock-mode"]')).toBeNull();

    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    const expanded = document.querySelector('[data-testid="tutor-top-dock"]') as HTMLElement;
    expect(Number.parseInt(expanded.style.height, 10)).toBeLessThanOrEqual(240);
    expect(expanded.style.minWidth).toBe('');
    const handle = document.querySelector('[data-testid="tutor-dock-resize-handle"]') as HTMLElement;
    const before = Number(handle.getAttribute('aria-valuenow'));
    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    const after = Number(
      (document.querySelector('[data-testid="tutor-dock-resize-handle"]') as HTMLElement).getAttribute('aria-valuenow'),
    );
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(240);
    expect(document.querySelector('[data-testid="pdf-toolbar-stub"]')).toBeTruthy();
  });

  it('keeps an in-flight answer when the dock collapses', async () => {
    let release: (value: unknown) => void = () => {};
    zikukAiRequestMock.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    renderShell();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-ask"]') as HTMLButtonElement).click();
    });
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    await act(async () => {
      (document.querySelector('[data-testid="tutor-submit-initial-btn"]') as HTMLButtonElement).click();
    });
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-collapse"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.textContent).toContain('Tutor is answering');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
    await act(async () => {
      release({
        ok: true,
        result: { type: 'ask_course', text: 'The slope is the derivative.', sources: [] },
      });
    });
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'The slope is the derivative.',
    );
  });

  it('drags the expanded top dock shorter and taller from the boundary', () => {
    renderShell();
    expect(document.querySelector('[data-testid="tutor-dock-boundary"]')).toBeNull();
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
    const boundary = document.querySelector('[data-testid="tutor-dock-boundary"]') as HTMLElement;
    const pdf = document.querySelector('[data-testid="two-surface-pane-a"]');
    const notebook = document.querySelector('[data-testid="two-surface-pane-b"]');
    const tutor = document.querySelector('[data-tutor-root="tutor"]');
    const height = () => Number.parseInt((document.querySelector('[data-testid="tutor-top-dock"]') as HTMLElement).style.height, 10);
    const before = height();
    expect(boundary.getAttribute('aria-orientation')).toBe('horizontal');

    act(() => {
      boundary.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 400, pointerId: 1, pointerType: 'mouse' }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 340, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientY: 340, pointerId: 1 }));
    });
    const shorter = height();
    expect(shorter).toBeLessThan(before);
    expect(shorter).toBeGreaterThanOrEqual(160);

    act(() => {
      boundary.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 300, pointerId: 1, pointerType: 'mouse' }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 380, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientY: 380, pointerId: 1 }));
    });
    const taller = height();
    expect(taller).toBeGreaterThan(shorter);
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(taller);
    expect(document.querySelector('[data-testid="two-surface-pane-a"]')).toBe(pdf);
    expect(document.querySelector('[data-testid="two-surface-pane-b"]')).toBe(notebook);
    expect(document.querySelector('[data-tutor-root="tutor"]')).toBe(tutor);
    expect(document.querySelector('[data-testid="workspace-separator-0"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-dock-boundary"] [data-resize-grip="horizontal"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tutor-dock-collapse-full"]')).toBeNull();
  });

  function expandDock() {
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement).click();
    });
  }

  function dragBoundary(fromY: number, toY: number, release = true, pointerType: 'mouse' | 'touch' | 'pen' = 'mouse') {
    const boundary = document.querySelector('[data-testid="tutor-dock-boundary"]') as HTMLElement;
    act(() => {
      boundary.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: fromY, pointerId: 1, pointerType }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: toY, pointerId: 1, pointerType }));
      if (release) window.dispatchEvent(new PointerEvent('pointerup', { clientY: toY, pointerId: 1, pointerType }));
    });
  }

  function dockHeight() {
    return Number.parseInt((document.querySelector('[data-testid="tutor-top-dock"]') as HTMLElement).style.height, 10);
  }

  it('shows Collapse Tutor at the minimum and restores the previous expanded height', () => {
    renderShell({
      notebookSurface: createElement('textarea', { 'data-testid': 'note-draft', defaultValue: '' }),
    });
    const pdf = document.querySelector('[data-testid="two-surface-pane-a"]');
    const note = document.querySelector('[data-testid="note-draft"]') as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(note, 'keep this note');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expandDock();
    expect(dockHeight()).toBe(280);
    const input = document.querySelector('[data-testid="tutor-initial-question-input"]') as HTMLTextAreaElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, 'Why does the slope change?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    dragBoundary(400, 400 - (280 - 160));
    expect(dockHeight()).toBe(160);
    expect(document.querySelector('[data-testid="tutor-dock-collapse-full"]')?.textContent).toBe('Collapse Tutor');
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-collapse-full"]') as HTMLButtonElement).click();
    });
    const released = document.querySelector('[data-tutor-root="tutor"]') as HTMLElement;
    expect(released.getAttribute('data-tutor-collapse')).toBe('released');
    expect(released.getAttribute('data-tutor-visual')).toBe('compact');
    expect(document.querySelector('[data-testid="tutor-dock-restore"]')?.textContent).toBe('Restore Tutor');
    expect(document.querySelector('[data-testid="contextual-tutor-minimized-pill"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-dock-boundary"]')).toBeNull();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    const stored = readTutorLayout('user-1', 'sec-1');
    expect(stored?.placement).toBe('top-dock');
    expect(stored?.topDockExpanded).toBe(true);
    expect(stored?.expandedDockCollapsed).toBe(true);
    expect(stored?.topDockHeight).toBe(280);
    expect(document.querySelector('[data-testid="two-surface-pane-a"]')).toBe(pdf);
    expect(document.querySelector('[data-testid="note-draft"]')).toBe(note);
    expect(note.value).toBe('keep this note');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-restore"]') as HTMLButtonElement).click();
    });
    expect(dockHeight()).toBe(280);
    expect(readTutorLayout('user-1', 'sec-1')?.expandedDockCollapsed).toBeUndefined();
    expect(document.querySelector('[data-testid="tutor-dock-boundary"]')).toBeTruthy();
    expect((document.querySelector('[data-testid="tutor-initial-question-input"]') as HTMLTextAreaElement).value).toBe(
      'Why does the slope change?',
    );
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
  });

  it('collapses only after a pointer release past the threshold and can cancel', () => {
    renderShell();
    expandDock();
    const floorY = 400 - (280 - 160);
    dragBoundary(400, floorY - (TUTOR_TOP_DOCK_COLLAPSE_PAST_PX - 1), false);
    expect(document.querySelector('[data-testid="tutor-dock-collapse-cue"]')).toBeNull();
    expect(document.querySelector('[data-tutor-expanded]')?.getAttribute('data-tutor-expanded')).toBe('1');
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientY: floorY - TUTOR_TOP_DOCK_COLLAPSE_PAST_PX,
        pointerId: 1,
        pointerType: 'mouse',
      }));
    });
    expect(document.querySelector('[data-testid="tutor-dock-collapse-cue"]')?.textContent).toBe('Release to collapse');
    expect(document.querySelector('[data-testid="tutor-dock-boundary"]')?.getAttribute('data-collapse-armed')).toBe('1');
    expect(readTutorLayout('user-1', 'sec-1')?.expandedDockCollapsed).toBeUndefined();
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: floorY, pointerId: 1, pointerType: 'mouse' }));
    });
    expect(document.querySelector('[data-testid="tutor-dock-collapse-cue"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-dock-collapse-full"]')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { clientY: floorY, pointerId: 1, pointerType: 'mouse' }));
    });
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    expect(dockHeight()).toBe(160);
    expect(readTutorLayout('user-1', 'sec-1')?.expandedDockCollapsed).toBeUndefined();
  });

  it('commits a touch drag past the threshold when the pointer is released', () => {
    renderShell();
    expandDock();
    dragBoundary(400, 400 - (280 - 160) - TUTOR_TOP_DOCK_COLLAPSE_PAST_PX, true, 'touch');
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-collapse')).toBe('released');
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(280);
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
  });

  it('ignores a pen drag past the collapse threshold', () => {
    renderShell();
    expandDock();
    dragBoundary(400, 400 - (280 - 160) - TUTOR_TOP_DOCK_COLLAPSE_PAST_PX, true, 'pen');
    expect(dockHeight()).toBe(280);
    expect(readTutorLayout('user-1', 'sec-1')?.expandedDockCollapsed).toBeUndefined();
    expect(document.querySelector('[data-testid="tutor-dock-collapse-cue"]')).toBeNull();
  });

  it('keeps an in-flight answer mounted and restores a collapsed dock after refresh', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: selection,
      mode: 'exam_prep',
      turns: [
        { id: 'u1', role: 'user', content: 'Earlier derivative question', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'Earlier derivative answer', timestamp: 2, mode: 'exam_prep' },
      ],
    });
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));
    renderShell();
    expandDock();
    const followUp = document.querySelector('[data-testid="tutor-followup-input"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(followUp, 'Still drafting');
      followUp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      (document.querySelector('[data-testid="tutor-followup-send-btn"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    dragBoundary(400, 400 - (280 - 160) - TUTOR_TOP_DOCK_COLLAPSE_PAST_PX);
    expect(document.querySelector('[data-testid="tutor-dock-ask"]')?.textContent).toContain('Tutor is answering');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-restore"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Still drafting');
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    expect(dockHeight()).toBe(280);
    dragBoundary(400, 400 - (280 - 160) - TUTOR_TOP_DOCK_COLLAPSE_PAST_PX);
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(280);
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.turns.map(turn => turn.content)).toEqual([
      'Earlier derivative question',
      'Earlier derivative answer',
    ]);

    act(() => {
      root?.unmount();
    });
    root = createRoot(host!);
    renderShell();
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-collapse')).toBe('released');
    expect(document.querySelector('[data-testid="tutor-dock-attachment"]')?.textContent).toContain('p. 6');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-restore"]') as HTMLButtonElement).click();
    });
    expect(dockHeight()).toBe(280);
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Earlier derivative question');
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Earlier derivative answer');
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
  });

  function releaseDock(height = 400) {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1200 });
    writeTutorLayout('user-1', 'sec-1', {
      placement: 'top-dock',
      topDockExpanded: true,
      topDockHeight: height,
      expandedDockCollapsed: true,
    });
  }

  function setField(selector: string, value: string) {
    const field = document.querySelector(selector) as HTMLTextAreaElement | HTMLInputElement;
    act(() => {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return field;
  }

  it('types a quick ask without expanding or sending', () => {
    releaseDock();
    renderShell({ visiblePage: 4, tutorIntent: selection });
    const pdf = document.querySelector('[data-testid="two-surface-pane-a"]');
    const slot = document.querySelector('[data-tutor-root="tutor"]')?.parentElement;
    const field = document.querySelector('[data-testid="tutor-quick-ask-input"]') as HTMLTextAreaElement;
    expect(field.getAttribute('aria-label')).toBe('Ask the tutor a question');
    expect(document.querySelector('[data-testid="tutor-quick-ask-send"]')?.getAttribute('aria-label')).toBe('Send question');
    act(() => {
      field.focus();
    });
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-collapse')).toBe('released');
    setField('[data-testid="tutor-quick-ask-input"]', 'What is a derivative?');
    expect(document.activeElement).toBe(field);
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-expanded')).toBe('0');
    expect(document.querySelector('[data-testid="tutor-dock-boundary"]')).toBeNull();
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    const send = document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    setField('[data-testid="tutor-quick-ask-input"]', '   ');
    expect((document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-tutor-root="tutor"]')?.parentElement).toBe(slot);
    expect(document.querySelector('[data-testid="two-surface-pane-a"]')).toBe(pdf);
  });

  it('inserts a newline on Shift+Enter and submits once on Enter', async () => {
    releaseDock();
    renderShell({ visiblePage: 4, tutorIntent: selection });
    const field = setField('[data-testid="tutor-quick-ask-input"]', 'What is a derivative?');
    act(() => {
      field.selectionStart = field.value.length;
      field.selectionEnd = field.value.length;
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });
    expect((document.querySelector('[data-testid="tutor-quick-ask-input"]') as HTMLTextAreaElement).value).toContain('\n');
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-tutor-collapse')).toBe('released');
    expect(zikukAiRequestMock).not.toHaveBeenCalled();

    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));
    act(() => {
      (document.querySelector('[data-testid="tutor-quick-ask-input"]') as HTMLTextAreaElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    const body = zikukAiRequestMock.mock.calls[0][0] as {
      version: number;
      sectionId: string;
      question: string;
      teachingMode: string;
      capture: { pageNumber: number; text: string };
      activeDocument: { pageNumber: number; sourceObjectId: string };
    };
    expect(body.version).toBe(3);
    expect(body.sectionId).toBe('sec-1');
    expect(body.teachingMode).toBe('exam_prep');
    expect(body.question).toContain('What is a derivative?');
    expect(body.capture.pageNumber).toBe(6);
    expect(body.capture.text).toContain('derivatives');
    expect(body.activeDocument).toEqual({
      sourceKind: 'free_space_pdf',
      sourceObjectId: 'pdf-1',
      pageNumber: 4,
    });
    expect(dockHeight()).toBe(TUTOR_TOP_DOCK_EXPANDED_DEFAULT);
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-quick-ask')).toBe('1');
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(400);
    expect(readTutorLayout('user-1', 'sec-1')?.expandedDockCollapsed).toBe(true);
    expect(document.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    act(() => {
      (document.querySelector('[data-testid="tutor-followup-input"]') as HTMLInputElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('sends from the button, keeps the saved height, and restores it later', async () => {
    releaseDock(400);
    renderShell({
      visiblePage: 4,
      pdfSurface: createElement('div', { 'data-testid': 'pdf-scroll', style: { height: 40 } }, 'PDF toolbar'),
    });
    const pdf = document.querySelector('[data-testid="pdf-scroll"]') as HTMLElement;
    pdf.scrollTop = 24;
    const slot = document.querySelector('[data-tutor-root="tutor"]')?.parentElement;
    setField('[data-testid="tutor-quick-ask-input"]', 'Explain the slope.');
    let finish: (value: unknown) => void = () => {};
    zikukAiRequestMock.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    act(() => {
      (document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement).click();
    });
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    expect(dockHeight()).toBe(280);
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(400);
    expect(document.querySelector('[data-tutor-root="tutor"]')?.parentElement).toBe(slot);
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Explain the slope.');
    dragBoundary(300, 360);
    expect(dockHeight()).toBe(340);
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(400);
    await act(async () => {
      finish({
        ok: true,
        result: { type: 'ask_course', text: 'The slope is the rate of change.', sources: [] },
      });
    });
    expect(dockHeight()).toBe(340);
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-quick-ask')).toBe('1');
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('The slope is the rate of change.');
    expect(pdf.scrollTop).toBe(24);
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-restore"]') as HTMLButtonElement).click();
    });
    expect(dockHeight()).toBe(400);
    expect(readTutorLayout('user-1', 'sec-1')?.expandedDockCollapsed).toBeUndefined();
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(400);
    expect(document.querySelector('[data-tutor-root="tutor"]')?.getAttribute('data-quick-ask')).toBe('0');
    expect(document.querySelector('[data-testid="pdf-scroll"]')).toBe(pdf);
  });

  it('keeps one draft across the collapsed field and the expanded composer', () => {
    releaseDock(320);
    renderShell();
    setField('[data-testid="tutor-quick-ask-input"]', 'Keep this draft');
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-restore"]') as HTMLButtonElement).click();
    });
    expect(dockHeight()).toBe(320);
    expect((document.querySelector('[data-testid="tutor-initial-question-input"]') as HTMLTextAreaElement).value).toBe(
      'Keep this draft',
    );
    setField('[data-testid="tutor-initial-question-input"]', 'Keep this draft, still');
    dragBoundary(400, 400 - (320 - 160));
    act(() => {
      (document.querySelector('[data-testid="tutor-dock-collapse-full"]') as HTMLButtonElement).click();
    });
    expect((document.querySelector('[data-testid="tutor-quick-ask-input"]') as HTMLTextAreaElement).value).toBe(
      'Keep this draft, still',
    );
    expect(zikukAiRequestMock).not.toHaveBeenCalled();
  });

  it('keeps the question visible when a quick ask fails', async () => {
    releaseDock();
    renderShell();
    setField('[data-testid="tutor-quick-ask-input"]', 'Ask again later');
    zikukAiRequestMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'provider_timeout', message: 'The AI service timed out. Try again.' },
    });
    await act(async () => {
      (document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-error-banner"]')?.textContent).toContain('timed out');
    expect(document.querySelector('[data-testid="tutor-retry-btn"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Ask again later');
    expect(dockHeight()).toBe(280);
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(400);
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('keeps quick ask usable on a narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    writeTutorLayout('user-1', 'sec-1', {
      placement: 'top-dock',
      topDockExpanded: true,
      topDockHeight: 400,
      expandedDockCollapsed: true,
    });
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));
    renderShell();
    expect(document.querySelector('[data-testid="academic-switcher-pdf-tab"]')).toBeTruthy();
    const field = document.querySelector('[data-testid="tutor-quick-ask-input"]') as HTMLTextAreaElement;
    expect(Number.parseInt(field.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    setField('[data-testid="tutor-quick-ask-input"]', 'Narrow question');
    act(() => {
      (document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement).click();
    });
    expect(zikukAiRequestMock).toHaveBeenCalledTimes(1);
    expect(dockHeight()).toBe(resolveTopDockExpandedHeight(TUTOR_TOP_DOCK_EXPANDED_DEFAULT, 800, true));
    expect(dockHeight()).toBeLessThan(280);
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
    expect(readTutorLayout('user-1', 'sec-1')?.topDockHeight).toBe(400);
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="pdf-toolbar-stub"]')?.textContent).toContain('PDF toolbar');
  });

  it('shows the new question above a one-row context summary', async () => {
    releaseDock();
    renderShell({
      visiblePage: 2,
      pdfTitle: 'Problem Set 4 Solutions.pdf',
      tutorIntent: selection,
      pdfSurface: createElement('div', { 'data-testid': 'pdf-scroll' }, 'PDF toolbar'),
    });
    const pdf = document.querySelector('[data-testid="pdf-scroll"]') as HTMLElement;
    pdf.scrollTop = 18;
    const slot = document.querySelector('[data-tutor-root="tutor"]')?.parentElement;
    setField('[data-testid="tutor-quick-ask-input"]', 'Explain the slope.');
    const previousScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 720 });
    zikukAiRequestMock.mockImplementation(() => new Promise(() => {}));
    try {
      act(() => {
        (document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement).click();
      });
      const turns = document.querySelector('[data-testid="tutor-turns-container"]') as HTMLElement;
      expect(turns.textContent).toContain('Explain the slope.');
      expect(turns.querySelector('[data-testid="tutor-loading-state"]')).toBeTruthy();
      expect(turns.scrollTop).toBe(720);
      expect(pdf.scrollTop).toBe(18);
      expect(dockHeight()).toBe(280);
      expect(document.querySelector('[data-testid="tutor-followup-input"]')).toBeTruthy();
      expect(document.querySelector('[data-tutor-root="tutor"]')?.parentElement).toBe(slot);
      expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
      const summary = document.querySelector('[data-testid="tutor-pdf-context"]') as HTMLElement;
      expect(summary.getAttribute('data-context-open')).toBe('0');
      expect(summary.textContent).toContain('Problem Set 4 Solutions.pdf');
      expect(summary.textContent).toContain('Page 2');
      expect(summary.textContent).toContain('Selection attached');
      expect(summary.textContent).not.toContain('A captured paragraph');
      expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')).toBeNull();
      act(() => {
        (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
      });
      expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-context-open')).toBe('1');
      expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
        'A captured paragraph',
      );
      expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('not the whole file');
      expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('Visible page: Page 2');
      act(() => {
        (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
      });
      expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')).toBeNull();
      expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-context-open')).toBe('0');
    } finally {
      if (previousScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', previousScrollHeight);
    }
  });

  it('keeps a detached selection out of the conversation and out of the next request', async () => {
    releaseDock();
    renderShell({ visiblePage: 2, pdfTitle: 'Problem Set 4 Solutions.pdf', tutorIntent: selection });
    setField('[data-testid="tutor-quick-ask-input"]', 'Explain the slope.');
    zikukAiRequestMock.mockResolvedValue({
      ok: true,
      result: { type: 'ask_course', text: 'The slope is the rate of change.', sources: [] },
    });
    await act(async () => {
      (document.querySelector('[data-testid="tutor-quick-ask-send"]') as HTMLButtonElement).click();
    });
    const first = zikukAiRequestMock.mock.calls[0][0] as { version: number; capture?: { pageNumber: number } };
    expect(first.version).toBe(3);
    expect(first.capture?.pageNumber).toBe(6);
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-testid="tutor-attachment-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-selection')).toBe('detached');
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-attachment-detached-note"]')?.textContent).toContain('Detached');
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Explain the slope.');
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).not.toContain('A captured paragraph');
    act(() => {
      (document.querySelector('[data-testid="tutor-detached-inspect"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.getAttribute('data-attachment-state')).toBe(
      'detached',
    );
    act(() => {
      (document.querySelector('[data-testid="tutor-detached-inspect"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')).toBeNull();
    setField('[data-testid="tutor-followup-input"]', 'Continue without the selection.');
    await act(async () => {
      (document.querySelector('[data-testid="tutor-followup-send-btn"]') as HTMLButtonElement).click();
    });
    const second = zikukAiRequestMock.mock.calls[1][0] as { version: number; capture?: unknown };
    expect(second.version).toBe(2);
    expect(second.capture).toBeUndefined();
    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain('Explain the slope.');
    act(() => {
      (document.querySelector('[data-testid="tutor-attachment-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-selection')).toBe('attached');
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.getAttribute('data-attachment-state')).toBe(
      'attached',
    );
    setField('[data-testid="tutor-followup-input"]', 'Use the selection again.');
    await act(async () => {
      (document.querySelector('[data-testid="tutor-followup-send-btn"]') as HTMLButtonElement).click();
    });
    const third = zikukAiRequestMock.mock.calls[2][0] as { version: number; capture?: { text: string } };
    expect(third.version).toBe(3);
    expect(third.capture?.text).toContain('A captured paragraph');
    expect(dockHeight()).toBe(280);
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
  });
});
