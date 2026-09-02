/**
 * Free Space inline notebook — embedded presentation integration.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

vi.mock('../lib/notebookHandwritingCloud', () => ({
  hydrateHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
  reconcileHandwritingWithCloud: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

const { FreeSpaceNotebookSurface } = await import('../components/notebook/FreeSpaceNotebookSurface');
const { ProjectNotebookBlock } = await import('../components/project-space/ProjectNotebookBlock');

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

const notebookContent: Extract<ProjectObjectContent, { type: 'notebook' }> = {
  type: 'notebook',
  body: '- Hello inline notebook',
  notebookMode: 'normal',
};

const object: ProjectSpaceObject = {
  id: 'fs-nb-1',
  type: 'notebook',
  title: 'Field notes',
  content: notebookContent,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountSurface(opts?: {
  onNotebookEditingChange?: (id: string, editing: boolean) => void;
  onExpand?: () => void;
}) {
  host = document.createElement('div');
  host.style.width = '620px';
  host.style.height = '520px';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(FreeSpaceNotebookSurface, {
        content: notebookContent,
        tokens,
        object,
        onChange: vi.fn(),
        onNotebookEditingChange: opts?.onNotebookEditingChange,
        onExpand: opts?.onExpand,
      }),
    );
  });
}

function mountNotebookPresentation(presentation: 'notebook' | 'embedded') {
  host = document.createElement('div');
  host.style.width = '720px';
  host.style.height = '640px';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(ProjectNotebookBlock, {
        content: notebookContent,
        tokens,
        onChange: vi.fn(),
        context: presentation === 'embedded' ? 'free-space' : undefined,
        presentation,
        objectTitle: object.title,
      }),
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('FreeSpaceNotebookSurface integration', () => {
  it('A: add/render notebook mounts live editor (not card preview)', () => {
    mountSurface();
    expect(document.querySelector('[data-fs-notebook-surface="1"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-editor-root="1"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-card-preview]')).toBeNull();
  });

  it('B: click editor reports editing focus signal true', async () => {
    const onEditing = vi.fn<(id: string, editing: boolean) => void>();
    mountSurface({ onNotebookEditingChange: onEditing });
    const editable = document.querySelector('[contenteditable="true"]');
    expect(editable).toBeTruthy();
    await act(async () => {
      (editable as HTMLElement).focus();
    });
    expect(onEditing).toHaveBeenCalledWith('fs-nb-1', true);
  });

  it('H: embedded presentation hides context sidebar rail', () => {
    mountSurface();
    const grid = host!.querySelector('[style*="232px"]');
    expect(grid).toBeNull();
    expect(document.querySelector('[data-fs-notebook-embedded-bar="1"]')).toBeTruthy();
  });

  it('G: expand control is wired for Universal Object View', () => {
    const onExpand = vi.fn();
    mountSurface({ onExpand });
    const expand = document.querySelector('[data-fs-notebook-expand="1"]') as HTMLButtonElement;
    expect(expand).toBeTruthy();
    act(() => {
      expand.click();
    });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('I: main notebook presentation keeps full card chrome', () => {
    mountNotebookPresentation('notebook');
    expect(document.querySelector('[data-fs-notebook-embedded-bar="1"]')).toBeNull();
    expect(document.querySelector('[data-nb-editor-root="1"]')).toBeTruthy();
  });
});
