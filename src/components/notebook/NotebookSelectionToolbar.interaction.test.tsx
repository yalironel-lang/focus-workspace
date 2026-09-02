/**
 * Real NotebookSelectionToolbar interaction — Bold click must reach onCommand.
 *
 * @vitest-environment happy-dom
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

const { NotebookSelectionToolbar } = await import('./NotebookSelectionToolbar');

const tokens = { cardBorder: 'rgba(255,255,255,0.1)' } as AtmosphereTokens;

const selection = {
  blockId: 'nb-test-1',
  start: 4,
  end: 15,
  plain: 'test environment here',
  marks: [] as const,
  anchor: { top: 120, left: 80, width: 420 },
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountToolbar(onCommand = vi.fn<(cmd: unknown) => void>()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      createElement(NotebookSelectionToolbar, {
        tokens,
        selection,
        onCommand,
        onDismiss: vi.fn(),
      }),
    );
  });
  return onCommand;
}

function findBoldButton(): HTMLButtonElement {
  const btn = document.querySelector('button[data-nb-toolbar-bold="1"]');
  if (!(btn instanceof HTMLButtonElement)) {
    throw new Error('Bold toolbar button not found in document');
  }
  return btn;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.querySelectorAll('[data-nb-format-toolbar="1"], [data-nb-toolbar-backdrop="1"]').forEach(el => el.remove());
  root = null;
  host = null;
});

describe('NotebookSelectionToolbar Bold interaction', () => {
  it('click on Bold invokes onCommand once', () => {
    const onCommand = mountToolbar();
    const bold = findBoldButton();
    act(() => {
      bold.click();
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.calls[0]![0]).toEqual({ type: 'toggleMark', mark: 'b' });
  });
});
