import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { createRoot } from 'react-dom/client';
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

describe('Academic Composition Scroll Ownership & Wheel Event Dispatch', () => {
  it('does not capture or prevent wheel events on TwoSurfaceLayout panes', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const onChildWheel = vi.fn();

    React.act(() => {
      root.render(
        createElement(TwoSurfaceLayout, {
          ratio: 0.5,
          surfaceA: createElement(
            'div',
            {
              'data-testid': 'mock-pdf-viewport',
              onWheel: onChildWheel,
              style: { height: 400, overflowY: 'auto' },
            },
            createElement('div', { style: { height: 2000 } }, 'Tall PDF content'),
          ),
          surfaceB: createElement(
            'div',
            {
              'data-testid': 'mock-nb-viewport',
              style: { height: 400, overflowY: 'auto' },
            },
            createElement('div', { style: { height: 2000 } }, 'Tall Notebook content'),
          ),
        }),
      );
    });

    const pdfViewport = host.querySelector('[data-testid="mock-pdf-viewport"]') as HTMLElement;
    expect(pdfViewport).toBeTruthy();

    // Dispatch a wheel event to the PDF viewport
    const wheelEv = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
    pdfViewport.dispatchEvent(wheelEv);

    // Assert that the child element's wheel handler received the event (was not stopped by paneA capture)
    expect(onChildWheel).toHaveBeenCalledTimes(1);

    React.act(() => root.unmount());
    host.remove();
  });

  it('verifies AcademicCompositionShell does not block wheel events dispatched to nested surfaces', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const onSurfaceWheel = vi.fn();

    React.act(() => {
      root.render(
        createElement(AcademicCompositionShell, {
          tokens: mockTokens,
          pdfTitle: 'Test.pdf',
          notebookTitle: 'Notes',
          onClose: () => {},
          pdfSurface: createElement('div', {
            'data-testid': 'inner-pdf',
            onWheel: onSurfaceWheel,
          }, 'PDF'),
          notebookSurface: createElement('div', { 'data-testid': 'inner-nb' }, 'NB'),
        }),
      );
    });

    const innerPdf = document.querySelector('[data-testid="inner-pdf"]') as HTMLElement;
    expect(innerPdf).toBeTruthy();

    const wheelEv = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });
    innerPdf.dispatchEvent(wheelEv);

    expect(onSurfaceWheel).toHaveBeenCalledTimes(1);
    expect(wheelEv.defaultPrevented).toBe(false);

    // Verify TwoSurfaceLayout wrapper and notebookSurface wrapper propagate flex column
    const twoSurfaceWrapper = document.querySelector('[data-testid="two-surface-layout"]')?.parentElement;
    expect(twoSurfaceWrapper).toBeTruthy();
    expect(twoSurfaceWrapper?.style.display).toBe('flex');
    expect(twoSurfaceWrapper?.style.flexDirection).toBe('column');

    const innerNb = document.querySelector('[data-testid="inner-nb"]') as HTMLElement;
    expect(innerNb).toBeTruthy();
    const nbWrapper = innerNb.parentElement;
    expect(nbWrapper).toBeTruthy();
    expect(nbWrapper?.style.display).toBe('flex');
    expect(nbWrapper?.style.flexDirection).toBe('column');

    React.act(() => root.unmount());
    host.remove();
  });
});

