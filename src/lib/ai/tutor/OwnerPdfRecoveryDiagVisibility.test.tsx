/**
 * @vitest-environment happy-dom
 *
 * Guards the mount placement: the diagnostic must sit below the PDF viewer well
 * (not under PdfJsScrollViewer's absolute inset-0 layer).
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../../hooks/useSectionFreeSpaceObjects';

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('../../../components/project-space/OwnerPdfRecoveryDiagPanel', () => ({
  OwnerPdfRecoveryDiagPanel: (props: { pageNumber: number }) =>
    createElement('div', {
      'data-testid': 'owner-pdf-recovery-diag',
      'data-page': String(props.pageNumber),
    }),
}));

const { FreeSpacePdfCard } = await import(
  '../../../components/project-space/FreeSpacePdfCard'
);

const tokens = {
  cardBorder: '#ccc',
  wellBg: '#fff',
  textMuted: '#666',
  textPrimary: '#111',
  textGhost: '#999',
  accent: '#06c',
  pageBg: '#fafafa',
  cardBg: '#fff',
} as AtmosphereTokens;

function pdfContent(): ProjectObjectContent {
  return {
    type: 'pdf',
    fileName: 'exam.pdf',
    fileType: 'application/pdf',
    fileSize: 1000,
    lastOpenedAt: 1,
    page: 1,
    zoom: 1,
    pageCount: 3,
  };
}

describe('OwnerPdfRecoveryDiag visibility mount', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    host.style.height = '400px';
    host.style.overflow = 'hidden';
    document.body.appendChild(host);
    root = createRoot(host);
    window.history.replaceState({}, '', '/section/sec-1?pdfRecoveryDiag=1');
    window.localStorage.setItem('FW_PDF_RECOVERY_DIAG', '1');
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    window.localStorage.removeItem('FW_PDF_RECOVERY_DIAG');
    window.history.replaceState({}, '', '/');
  });

  it('mounts the diag slot as a visible shrink-0 sibling when opted in', async () => {
    await act(async () => {
      root!.render(
        createElement(
          'div',
          { className: 'flex flex-col h-full overflow-hidden', style: { height: '400px' } },
          createElement(FreeSpacePdfCard, {
            objectId: 'pdf-1',
            content: pdfContent(),
            tokens,
            sectionId: 'sec-1',
            onChange: () => {},
          }),
        ),
      );
    });

    // Lazy panel + Suspense may resolve on a subsequent microtask.
    await act(async () => {
      await Promise.resolve();
    });

    const slot = host!.querySelector('[data-testid="owner-pdf-recovery-diag-slot"]');
    expect(slot).toBeTruthy();
    expect(slot?.className).toContain('shrink-0');

    const panel = host!.querySelector('[data-testid="owner-pdf-recovery-diag"]');
    expect(panel).toBeTruthy();

    const viewerWell = slot?.previousElementSibling;
    expect(viewerWell?.className ?? '').toMatch(/flex-1/);
    expect(viewerWell?.contains(slot!)).toBe(false);
  });

  it('does not mount the diag slot without opt-in', async () => {
    window.history.replaceState({}, '', '/section/sec-1');
    window.localStorage.removeItem('FW_PDF_RECOVERY_DIAG');

    await act(async () => {
      root!.render(
        createElement(FreeSpacePdfCard, {
          objectId: 'pdf-1',
          content: pdfContent(),
          tokens,
          sectionId: 'sec-1',
          onChange: () => {},
        }),
      );
    });

    expect(host!.querySelector('[data-testid="owner-pdf-recovery-diag-slot"]')).toBeNull();
  });
});
