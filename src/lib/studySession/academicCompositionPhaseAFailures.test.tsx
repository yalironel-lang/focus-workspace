import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { NotebookWorkspaceLayout } from '../../components/notebook/NotebookWorkspaceLayout';
import { TwoSurfaceLayout } from '../../components/project-space/TwoSurfaceLayout';
import { AcademicCompositionShell } from '../../components/project-space/AcademicCompositionShell';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

const mockTokens: AtmosphereTokens = {
  accent: '#f59e0b',
  cardBg: 'rgba(28,25,23,0.85)',
  cardBorder: 'rgba(255,255,255,0.08)',
  textPrimary: '#fafaf9',
  textSecondary: '#a8a29e',
  textMuted: '#78716c',
  textGhost: '#57534e',
  wellBg: 'rgba(0,0,0,0.25)',
  pageBg: '#0c0a09',
} as unknown as AtmosphereTokens;

describe('ZIKUK Academic Composition Phase A QA Failure Verifications', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
      host = null;
    }
  });

  describe('1. Pages / Topics Navigation (Zero Width Reserved & No Black Strip)', () => {
    it('Closed state reserves ZERO sidebar width and renders no rail / black strip', () => {
      act(() => {
        root!.render(
          createElement(
            NotebookWorkspaceLayout,
            {
              enabled: true,
              tokens: mockTokens,
              breadcrumb: 'Topic 1 › Page 1',
              topicsOpen: false,
              onTopicsOpenChange: () => {},
              navigator: createElement('div', { 'data-testid': 'mock-nav' }, 'Nav Items'),
            },
            createElement('div', { 'data-testid': 'writing-surface' }, 'Writing Content'),
          ),
        );
      });

      const layout = host!.querySelector('[data-nb-workspace-layout="1"]') as HTMLDivElement;
      expect(layout).toBeTruthy();
      expect(layout.style.flex).toBe('1 1 0%');
      expect(layout.style.height).toBe('');

      // Ensure no 36px rail or leftover black strip is rendered in-flow
      const railToggle = host!.querySelector('[data-nb-rail-toggle]');
      expect(railToggle).toBeNull();

      // Drawer should not be present in closed state
      const drawer = host!.querySelector('[data-nb-pages-drawer="1"]');
      expect(drawer).toBeNull();

      // Writing surface container takes 100% width
      const writingCol = host!.querySelector('[data-testid="writing-surface"]')?.parentElement;
      expect(writingCol).toBeTruthy();
      expect(writingCol?.style.flex).toBe('1 1 0%');
    });

    it('Has an explicit visible Pages toggle button in the header bar', () => {
      const onToggle = vi.fn();
      act(() => {
        root!.render(
          createElement(
            NotebookWorkspaceLayout,
            {
              enabled: true,
              tokens: mockTokens,
              breadcrumb: 'Topic 1 › Page 1',
              topicsOpen: false,
              onTopicsOpenChange: onToggle,
              navigator: createElement('div', { 'data-testid': 'mock-nav' }, 'Nav Items'),
            },
            createElement('div', { 'data-testid': 'writing-surface' }, 'Writing Content'),
          ),
        );
      });

      const toggleBtn = host!.querySelector('[data-testid="notebook-pages-toggle-btn"]') as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.getAttribute('aria-label')).toBe('Open Pages');
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
      expect(toggleBtn.textContent).toContain('Pages');

      act(() => {
        toggleBtn.click();
      });
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('Open state renders overlay drawer without changing writing surface flow width', () => {
      const onToggle = vi.fn();
      act(() => {
        root!.render(
          createElement(
            NotebookWorkspaceLayout,
            {
              enabled: true,
              tokens: mockTokens,
              breadcrumb: 'Topic 1 › Page 1',
              topicsOpen: true,
              onTopicsOpenChange: onToggle,
              navigator: createElement('div', { 'data-testid': 'mock-nav' }, 'Nav Items'),
            },
            createElement('div', { 'data-testid': 'writing-surface' }, 'Writing Content'),
          ),
        );
      });

      const drawer = host!.querySelector('[data-nb-pages-drawer="1"]') as HTMLDivElement;
      expect(drawer).toBeTruthy();
      expect(drawer.style.position).toBe('absolute');
      expect(drawer.style.zIndex).toBe('21');

      // Writing surface remains flex: 1 minWidth: 0
      const writingCol = host!.querySelector('[data-testid="writing-surface"]')?.parentElement;
      expect(writingCol?.style.flex).toBe('1 1 0%');

      // Drawer has an explicit close button
      const closeBtn = host!.querySelector('button[aria-label="Close Pages"]') as HTMLButtonElement;
      expect(closeBtn).toBeTruthy();
      act(() => {
        closeBtn.click();
      });
      expect(onToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('2. PDF / Notebook Movement Leakage Barrier', () => {
    it('AcademicCompositionShell allows native wheel events to scroll and does not call stopPropagation', () => {
      act(() => {
        root!.render(
          createElement(AcademicCompositionShell, {
            tokens: mockTokens,
            pdfTitle: 'Lecture 1.pdf',
            notebookTitle: 'Class Notes',
            onClose: () => {},
            pdfSurface: createElement('div', { 'data-testid': 'shell-pdf' }, 'PDF Surface'),
            notebookSurface: createElement('div', { 'data-testid': 'shell-nb' }, 'Notebook Surface'),
          }),
        );
      });

      const shell = document.querySelector('[data-testid="academic-composition-shell"]') as HTMLDivElement;
      expect(shell).toBeTruthy();

      const wheelEv = new WheelEvent('wheel', { bubbles: true, cancelable: true });
      const spSpy = vi.spyOn(wheelEv, 'stopPropagation');
      shell.dispatchEvent(wheelEv);

      expect(spSpy).not.toHaveBeenCalled();
      expect(shell.style.position).toBe('fixed');
      expect(shell.style.zIndex).toBe('599');
    });

    it('TwoSurfaceLayout preserves ratio and does not leak gestures on divider drag', () => {
      const onRatioChange = vi.fn();
      act(() => {
        root!.render(
          createElement(TwoSurfaceLayout, {
            ratio: 0.5,
            onRatioChange,
            surfaceA: createElement('div', { 'data-testid': 'pane-a-content' }, 'Surface A'),
            surfaceB: createElement('div', { 'data-testid': 'pane-b-content' }, 'Surface B'),
          }),
        );
      });

      const divider = host!.querySelector('[data-testid="two-surface-divider"]') as HTMLDivElement;
      expect(divider).toBeTruthy();
      expect(divider.style.touchAction).toBe('none');

      // Apple pencil ignore policy on divider
      const penDown = new PointerEvent('pointerdown', { pointerType: 'pen', bubbles: true });
      divider.dispatchEvent(penDown);
      expect(onRatioChange).not.toHaveBeenCalled();
    });
  });
});
