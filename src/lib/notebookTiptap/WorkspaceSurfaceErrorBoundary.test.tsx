import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { WorkspaceSurfaceErrorBoundary } from '../../components/common/WorkspaceSurfaceErrorBoundary';

const tokens = {
  cardBg: '#111',
  cardBorder: '#222',
  textMuted: '#aaa',
  textPrimary: '#fff',
} as any;

class ThrowingChild extends Component {
  render(): ReactNode {
    throw new Error('synthetic notebook render failure');
  }
}

describe('WorkspaceSurfaceErrorBoundary notebook diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the fallback and logs metadata without content or persistence', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);

    try {
      act(() => {
        createRoot(host).render(
          createElement(
            WorkspaceSurfaceErrorBoundary,
            {
              tokens,
              label: 'Notebook',
              diagnostics: {
                objectId: 'ps-notebook-test',
                sectionId: 'section-test',
                activePageId: 'page-1',
                bodyCodecVersion: 1,
              },
            },
            createElement(ThrowingChild),
          ),
        );
      });

      expect(host.textContent).toContain('Notebook is unavailable');
      const diagnostic = error.mock.calls.find(([prefix]) => prefix === '[NotebookRenderError]');
      expect(diagnostic).toBeDefined();
      expect(diagnostic?.[1]).toMatchObject({
        name: 'Error',
        message: 'synthetic notebook render failure',
        objectId: 'ps-notebook-test',
        sectionId: 'section-test',
        activePageId: 'page-1',
        bodyCodecVersion: 1,
      });
      expect(JSON.stringify(diagnostic)).not.toContain('user text');
    } finally {
      host.remove();
    }
  });
});
