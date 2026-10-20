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
import { readTutorLayout, tutorLayoutStorageKey, writeTutorLayout } from './tutorLayoutStorage';
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

const intent: TutorCaptureIntent = {
  action: 'explain',
  mode: 'explain',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 3,
    regionNorm: { x: 0, y: 0, w: 1, h: 1 },
    attachmentType: 'text_selection',
    extractedText: 'A stored selection.',
  },
};

describe('Tutor layout preference wiring', () => {
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

  it('does not open the floating card on refresh when layout is minimized or a capture exists', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent,
      turns: [{ id: 'u1', role: 'user', content: 'Earlier', timestamp: 1 }],
    });
    writeTutorLayout('user-1', 'sec-1', { placement: 'minimized', restorePlacement: 'floating' });

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
          tutorIntent: intent,
          tutorOpen: false,
          onOpenTutor: () => {},
          onCloseTutor: () => {},
        }),
      );
    });

    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeNull();
    expect(document.querySelector('[data-testid="tutor-top-dock"]')).toBeNull();
    expect(document.querySelector('[data-tutor-visual="minimized"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-tutor-root="tutor"]')).toHaveLength(1);
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.turns).toHaveLength(1);
  });

  it('migrates legacy floating geometry without writing placement into the conversation', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [{ id: 'u1', role: 'user', content: 'Legacy thread', timestamp: 4 }],
      presentation: { width: 580, height: 640, positionX: 150, positionY: 85, scrollTop: 12 },
    });
    const conversationKey = tutorSessionStorageKey('user-1', 'sec-1', 'pdf-1');
    const before = localStorage.getItem(conversationKey);

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

    const card = document.querySelector('[data-testid="contextual-tutor-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.style.left).toBe('150px');
    expect(card.style.top).toBe('85px');
    expect(card.style.width).toBe('580px');
    expect(localStorage.getItem(conversationKey)).toBe(before);
    expect(before).not.toContain('top-dock');
    expect(before).not.toContain('restorePlacement');

    const layout = readTutorLayout('user-1', 'sec-1');
    expect(layout?.placement).toBe('top-dock');
    expect(layout?.placementOrigin).toBe('implicit');
    expect(layout?.topDockExpanded).toBe(false);
    expect(layout?.floating).toMatchObject({ width: 580, height: 640, positionX: 150, positionY: 85 });
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.intent).toBeNull();
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.mode).toBe('teach_me');
  });

  it('persists minimize and restore, and reset leaves the conversation in place', () => {
    writeTutorSession('user-1', 'sec-1', 'pdf-1', {
      intent,
      mode: 'explain',
      draftQuestion: 'Draft stays',
      turns: [
        { id: 'u1', role: 'user', content: 'Keep this question', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'Keep this answer', timestamp: 2, mode: 'explain' },
      ],
    });
    writeTutorLayout('user-1', 'sec-1', {
      placement: 'side-left',
      floating: { width: 500, height: 420, positionX: 48, positionY: 64 },
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

    const minimize = document.querySelector('[data-testid="contextual-tutor-minimize-btn"]') as HTMLButtonElement;
    act(() => {
      minimize.click();
    });
    expect(document.querySelector('[data-testid="contextual-tutor-minimized-pill"]')).toBeTruthy();
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('minimized');
    expect(readTutorLayout('user-1', 'sec-1')?.restorePlacement).toBe('side-left');

    const restore = document.querySelector('[data-testid="contextual-tutor-restore-btn"]') as HTMLButtonElement;
    act(() => {
      restore.click();
    });
    expect(document.querySelector('[data-testid="contextual-tutor-card"]')).toBeTruthy();
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('side-left');

    const conversationBeforeReset = localStorage.getItem(tutorSessionStorageKey('user-1', 'sec-1', 'pdf-1'));
    const reset = document.querySelector('[data-testid="tutor-reset-layout-btn"]') as HTMLButtonElement;
    act(() => {
      reset.click();
    });

    expect(localStorage.getItem(tutorSessionStorageKey('user-1', 'sec-1', 'pdf-1'))).toBe(conversationBeforeReset);
    expect(document.body.textContent).toContain('Keep this question');
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.draftQuestion).toBe('Draft stays');
    expect(readTutorSession('user-1', 'sec-1', 'pdf-1')?.intent?.attachment.extractedText).toBe(
      'A stored selection.',
    );
    expect(readTutorLayout('user-1', 'sec-1')?.placement).toBe('top-dock');
    expect(readTutorLayout('user-1', 'sec-1')?.restorePlacement).toBe('top-dock');
    expect(readTutorLayout('user-1', 'sec-1')?.placementOrigin).toBe('explicit');
    expect(readTutorLayout('user-1', 'sec-1')?.topDockExpanded).toBe(false);
    expect(localStorage.getItem(tutorLayoutStorageKey('user-1', 'sec-1'))).not.toContain('side-left');
  });
});
