/**
 * M7.5C3 — Product Delete Page UI (Topics … menu + confirm).
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { NotebookWorkspaceNavigator } from '../../components/notebook/NotebookWorkspaceNavigator';
import type { NotebookContentWithPages, NotebookPage } from '../notebookPages/types';
import { softDeleteNotebookPage } from '../knowledge/notebookPageRecovery';
import { deleteNotebookPage } from '../notebookPages/operations';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tokens = {
  id: 'test',
  name: 'Test',
  emoji: '',
  description: '',
  pageBg: '#fff',
  navBg: '#fff',
  cardBg: '#fff',
  cardBorder: '#ddd',
  cardBorderHover: '#ccc',
  wellBg: '#f5f5f5',
  textPrimary: '#111',
  textSecondary: '#444',
  textMuted: '#777',
  textGhost: '#999',
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  accentSubtle: '#dbeafe',
  accentGlow: 'transparent',
  divider: '#eee',
  focusBorder: '#2563eb',
  ambientGlow1: 'transparent',
  ambientGlow2: 'transparent',
  shadowSm: 'none',
  shadowMd: 'none',
  shadowLg: 'none',
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 14,
  motionFast: '0ms',
  motionMed: '0ms',
  motionSlow: '0ms',
} as AtmosphereTokens;

function docPage(id: string, title: string, body: string): NotebookPage {
  return {
    id,
    sectionId: 'sec-notes',
    kind: 'document',
    title,
    documentBody: body,
    documentBodyCodecVersion: 1,
  };
}

function content(pages: NotebookPage[], activePageId: string): NotebookContentWithPages {
  return {
    type: 'notebook',
    body: pages.find(p => p.id === activePageId)?.documentBody ?? '',
    bodyCodecVersion: 1,
    schemaVersion: 1,
    sections: [{ id: 'sec-notes', title: 'Notes', pageIds: pages.map(p => p.id) }],
    pages,
    activeSectionId: 'sec-notes',
    activePageId,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = '';
});

describe('M7.5C3 Topics page menu + delete confirm', () => {
  it('1. page menu opens from ··· trigger', () => {
    const onDeletePage = vi.fn();
    mount(
      createElement(NotebookWorkspaceNavigator, {
        content: content(
          [docPage('a', 'Page 1', 'AAA'), docPage('b', 'Page 2', 'BBB')],
          'a',
        ),
        tokens,
        onSwitchSection: vi.fn(),
        onSwitchPage: vi.fn(),
        onAddSection: vi.fn(),
        onAddPage: vi.fn(),
        onRenameSection: vi.fn(),
        onRenamePage: vi.fn(),
        onDeletePage,
      }),
    );

    const triggers = document.querySelectorAll('[data-nb-page-menu-trigger="1"]');
    expect(triggers.length).toBeGreaterThan(0);
    act(() => {
      (triggers[0] as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-nb-page-actions-menu="1"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-page-action="rename"]')).toBeTruthy();
    expect(document.querySelector('[data-nb-page-action="delete"]')).toBeTruthy();
  });

  it('2. Cancel causes zero mutation (onDeletePage not called)', () => {
    const onDeletePage = vi.fn();
    mount(
      createElement(NotebookWorkspaceNavigator, {
        content: content(
          [docPage('a', 'Page 1', 'AAA'), docPage('b', 'Page 2', 'BBB')],
          'a',
        ),
        tokens,
        onSwitchSection: vi.fn(),
        onSwitchPage: vi.fn(),
        onAddSection: vi.fn(),
        onAddPage: vi.fn(),
        onRenameSection: vi.fn(),
        onRenamePage: vi.fn(),
        onDeletePage,
      }),
    );

    act(() => {
      (document.querySelectorAll('[data-nb-page-menu-trigger="1"]')[1] as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-nb-page-action="delete"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')).toBeTruthy();
    act(() => {
      (document.querySelector('[data-nb-page-delete-cancel="1"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')).toBeNull();
    expect(onDeletePage).not.toHaveBeenCalled();
  });

  it('3 + 10. Delete confirmation calls onDeletePage (safe product path entry)', () => {
    const onDeletePage = vi.fn();
    mount(
      createElement(NotebookWorkspaceNavigator, {
        content: content(
          [docPage('a', 'Page 1', 'AAA'), docPage('b', 'Page 2', 'BBB')],
          'b',
        ),
        tokens,
        onSwitchSection: vi.fn(),
        onSwitchPage: vi.fn(),
        onAddSection: vi.fn(),
        onAddPage: vi.fn(),
        onRenameSection: vi.fn(),
        onRenamePage: vi.fn(),
        onDeletePage,
      }),
    );

    const row = document.querySelector('[data-page-id="b"]')!;
    act(() => {
      (row.querySelector('[data-nb-page-menu-trigger="1"]') as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-nb-page-action="delete"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')?.textContent).toMatch(
      /Delete “Page 2”/,
    );
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')?.textContent).toMatch(
      /Recently Deleted/,
    );
    act(() => {
      (document.querySelector('[data-nb-page-delete-confirm="1"]') as HTMLButtonElement).click();
    });
    expect(onDeletePage).toHaveBeenCalledTimes(1);
    expect(onDeletePage).toHaveBeenCalledWith('b');
  });

  it('7. last-page Delete is disabled (no confirm / no mutation)', () => {
    const onDeletePage = vi.fn();
    mount(
      createElement(NotebookWorkspaceNavigator, {
        content: content([docPage('only', 'Solo', 'ONLY')], 'only'),
        tokens,
        onSwitchSection: vi.fn(),
        onSwitchPage: vi.fn(),
        onAddSection: vi.fn(),
        onAddPage: vi.fn(),
        onRenameSection: vi.fn(),
        onRenamePage: vi.fn(),
        onDeletePage,
      }),
    );

    act(() => {
      (document.querySelector('[data-nb-page-menu-trigger="1"]') as HTMLButtonElement).click();
    });
    const del = document.querySelector('[data-nb-page-action="delete"]') as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    act(() => {
      del.click();
    });
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')).toBeNull();
    expect(onDeletePage).not.toHaveBeenCalled();
  });

  it('15. Escape closes menu and confirm dialog', () => {
    const onDeletePage = vi.fn();
    mount(
      createElement(NotebookWorkspaceNavigator, {
        content: content(
          [docPage('a', 'Page 1', 'AAA'), docPage('b', 'Page 2', 'BBB')],
          'a',
        ),
        tokens,
        onSwitchSection: vi.fn(),
        onSwitchPage: vi.fn(),
        onAddSection: vi.fn(),
        onAddPage: vi.fn(),
        onRenameSection: vi.fn(),
        onRenamePage: vi.fn(),
        onDeletePage,
      }),
    );

    act(() => {
      (document.querySelectorAll('[data-nb-page-menu-trigger="1"]')[0] as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-nb-page-actions-menu="1"]')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-nb-page-actions-menu="1"]')).toBeNull();

    act(() => {
      (document.querySelectorAll('[data-nb-page-menu-trigger="1"]')[0] as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-nb-page-action="delete"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-nb-page-delete-dialog="1"]')).toBeNull();
    expect(onDeletePage).not.toHaveBeenCalled();
  });

  it('16. menu trigger does not navigate/switch page', () => {
    const onSwitchPage = vi.fn();
    mount(
      createElement(NotebookWorkspaceNavigator, {
        content: content(
          [docPage('a', 'Page 1', 'AAA'), docPage('b', 'Page 2', 'BBB')],
          'a',
        ),
        tokens,
        onSwitchSection: vi.fn(),
        onSwitchPage,
        onAddSection: vi.fn(),
        onAddPage: vi.fn(),
        onRenameSection: vi.fn(),
        onRenamePage: vi.fn(),
        onDeletePage: vi.fn(),
      }),
    );

    const rowB = document.querySelector('[data-page-id="b"]')!;
    act(() => {
      (rowB.querySelector('[data-nb-page-menu-trigger="1"]') as HTMLButtonElement).click();
    });
    expect(onSwitchPage).not.toHaveBeenCalled();
  });
});

describe('M7.5C3 product delete wiring contract', () => {
  it('4. ProjectNotebookBlock product delete uses softDeleteNotebookPage, not deleteNotebookPage', () => {
    const src = readFileSync(
      resolve(__dirname, '../../components/project-space/ProjectNotebookBlock.tsx'),
      'utf8',
    );
    expect(src).toContain('softDeleteNotebookPage');
    expect(src).toContain('handleShellDeletePage');
    // Product delete path must not import/call low-level deleteNotebookPage.
    expect(src).not.toMatch(/import\s*\{[^}]*\bdeleteNotebookPage\b/);
    expect(src).not.toMatch(/\bdeleteNotebookPage\s*\(/);
    // Soft-delete IS the product API (may use deleteNotebookPage internally in recovery module).
    expect(typeof softDeleteNotebookPage).toBe('function');
    expect(typeof deleteNotebookPage).toBe('function');
  });
});
