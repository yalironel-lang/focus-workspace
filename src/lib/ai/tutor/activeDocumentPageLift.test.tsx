/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../../hooks/useSectionFreeSpaceObjects';

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

const { FreeSpacePdfCard } = await import('../../../components/project-space/FreeSpacePdfCard');

const tokens = {
  cardBorder: '#ccc',
  wellBg: '#fff',
  textMuted: '#666',
  textPrimary: '#111',
  cardBg: '#fff',
} as AtmosphereTokens;

function pdfContent(page: number): ProjectObjectContent {
  return {
    type: 'pdf',
    fileName: 'Problem Set 4 Solutions.pdf',
    fileType: 'application/pdf',
    fileSize: 1000,
    lastOpenedAt: 1,
    page,
    zoom: 1,
    pageCount: 30,
  };
}

describe('FreeSpacePdfCard visible page lift', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
  });

  it('publishes the persisted page and later visible pages', async () => {
    const pages: number[] = [];
    const onPdfLivePageChange = (page: number) => {
      pages.push(page);
    };
    await act(async () => {
      root!.render(
        createElement(FreeSpacePdfCard, {
          objectId: 'pdf-1',
          content: pdfContent(4),
          tokens,
          sectionId: 'sec-1',
          onChange: () => {},
          onPdfLivePageChange,
        }),
      );
    });
    expect(pages).toEqual([4]);

    await act(async () => {
      root!.render(
        createElement(FreeSpacePdfCard, {
          objectId: 'pdf-1',
          content: pdfContent(11),
          tokens,
          sectionId: 'sec-1',
          onChange: () => {},
          onPdfLivePageChange,
        }),
      );
    });
    expect(pages).toEqual([4, 11]);
  });
});
