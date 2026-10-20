/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademicCompositionShell } from '../../../components/project-space/AcademicCompositionShell';
import { ContextualTutorCard } from '../../../components/project-space/ContextualTutorCard';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import { writeTutorSession } from './tutorSessionStorage';
import * as gatewayClient from '../gatewayClient';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../gatewayClient', () => ({
  zikukAiRequest: vi.fn(),
}));

const tokens = {
  accent: '#f59e0b',
  cardBg: 'rgba(28,25,23,0.85)',
  cardBorder: 'rgba(255,255,255,0.08)',
  textPrimary: '#fafaf9',
  textSecondary: '#a8a29e',
  textMuted: '#78716c',
  wellBg: 'rgba(0,0,0,0.25)',
  pageBg: '#0c0a09',
} as unknown as AtmosphereTokens;

const storedIntent: TutorCaptureIntent = {
  action: 'explain',
  mode: 'explain',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 4,
    regionNorm: { x: 0, y: 0, w: 1, h: 1 },
    attachmentType: 'text_selection',
    extractedText: 'Stored selection about limits.',
  },
};

describe('Tutor opens without a PDF selection', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
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
    const onOpenTutor = vi.fn();
    const setCaptureMode = vi.fn();
    act(() => {
      root!.render(
        createElement(AcademicCompositionShell, {
          tokens,
          pdfTitle: 'Lecture.pdf',
          notebookTitle: 'Notes',
          splitRatio: 0.5,
          onSplitRatioChange: () => {},
          onClose: () => {},
          pdfSurface: createElement('div', null, 'PDF'),
          notebookSurface: createElement('div', null, 'Notebook'),
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          userId: 'user-1',
          onOpenTutor,
          onCloseTutor: () => {},
          tutorChrome: { captureMode: false, setCaptureMode, cancel: () => {} },
          ...extra,
        }),
      );
    });
    return { onOpenTutor, setCaptureMode };
  }

  it('shows an accessible Tutor control that does not start Capture', () => {
    const { onOpenTutor, setCaptureMode } = renderShell();
    const button = document.querySelector('[data-testid="academic-composition-open-tutor"]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe('Open Tutor');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toContain('Tutor');

    act(() => {
      button.click();
    });

    expect(onOpenTutor).toHaveBeenCalledTimes(1);
    expect(setCaptureMode).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(gatewayClient.zikukAiRequest).not.toHaveBeenCalled();
  });

  it('shows the compact dock without a capture and does not float from a stored selection', () => {
    renderShell({ tutorIntent: null, tutorOpen: false });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('Lecture.pdf');
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.getAttribute('data-selection')).toBe('none');
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(gatewayClient.zikukAiRequest).not.toHaveBeenCalled();

    act(() => {
      root?.unmount();
    });
    root = createRoot(host!);
    renderShell({ tutorIntent: storedIntent, tutorOpen: false });
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('0');
    expect(document.querySelector('[data-testid="tutor-dock-attachment"]')?.textContent).toContain('p. 4');
    expect(gatewayClient.zikukAiRequest).not.toHaveBeenCalled();
  });

  it('expands the same Tutor when asked, with no selection and no request', () => {
    renderShell({ tutorOpen: false, tutorIntent: null });
    const expand = document.querySelector('[data-testid="tutor-dock-expand"]') as HTMLButtonElement;
    act(() => {
      expand.click();
    });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-expanded')).toBe('1');
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('Lecture.pdf');
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-pdf-context"]')?.textContent).toContain('not the whole file');
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')).toBeNull();
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(gatewayClient.zikukAiRequest).not.toHaveBeenCalled();
  });

  it('expands a live capture onto the existing Tutor without a second instance', () => {
    renderShell({ tutorIntent: null, onNavigateToSource: () => {} });
    expect(document.querySelector('[data-testid="tutor-top-dock"]')?.getAttribute('data-tutor-visual')).toBe('compact');

    act(() => {
      root!.render(
        createElement(AcademicCompositionShell, {
          tokens,
          pdfTitle: 'Lecture.pdf',
          notebookTitle: 'Notes',
          splitRatio: 0.5,
          onSplitRatioChange: () => {},
          onClose: () => {},
          pdfSurface: createElement('div', null, 'PDF'),
          notebookSurface: createElement('div', null, 'Notebook'),
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          userId: 'user-1',
          tutorIntent: storedIntent,
          tutorOpen: true,
          onOpenTutor: () => {},
          onCloseTutor: () => {},
          onNavigateToSource: () => {},
        }),
      );
    });

    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'Stored selection about limits.',
    );
    expect(document.querySelector('[data-testid="tutor-jump-source-btn"]')?.textContent).toContain('p. 4');
    expect(gatewayClient.zikukAiRequest).not.toHaveBeenCalled();
  });

  it('restores history and a previous selection when opened with no new capture', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: storedIntent,
      mode: 'exam_prep',
      turns: [
        { id: 'u1', role: 'user', content: 'Earlier question', timestamp: 10 },
        { id: 'a1', role: 'assistant', content: 'Earlier answer', timestamp: 20, mode: 'exam_prep' },
      ],
    });

    act(() => {
      root!.render(
        createElement(ContextualTutorCard, {
          tokens,
          sectionId: 'sec-1',
          sourceObjectId: 'pdf-1',
          userId: 'user-1',
          intent: null,
          onClose: () => {},
        }),
      );
    });

    expect(document.querySelector('[data-testid="tutor-turns-container"]')?.textContent).toContain(
      'Earlier question',
    );
    act(() => {
      (document.querySelector('[data-testid="tutor-context-toggle"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-testid="tutor-extracted-text-preview"]')?.textContent).toContain(
      'Stored selection about limits.',
    );
    expect(document.querySelector('[data-testid="tutor-header-mode-trigger"]')?.textContent).toContain(
      'Exam Prep',
    );
  });
});
