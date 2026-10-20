import { beforeEach, describe, expect, it } from 'vitest';
import {
  academicWorkspaceStorageKey,
  deriveWorkspaceFromTutorLayout,
  fitPaneWidths,
  movePane,
  readAcademicWorkspace,
  resizeAdjacent,
  threePaneFits,
  WORKSPACE_DEFAULT_ORDER,
  WORKSPACE_PANE_MIN_PX,
  writeAcademicWorkspace,
  type WorkspacePaneId,
} from './academicWorkspaceLayout';

const ALL_ORDERS = [
  'pdf,notebook,tutor',
  'pdf,tutor,notebook',
  'notebook,pdf,tutor',
  'notebook,tutor,pdf',
  'tutor,pdf,notebook',
  'tutor,notebook,pdf',
];

describe('academic workspace layout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reaches all six pane orders from Move left and Move right', () => {
    const seen = new Set<string>();
    const visit = (order: WorkspacePaneId[], depth: number) => {
      const key = order.join(',');
      if (seen.has(key) || depth > 8) return;
      seen.add(key);
      for (const pane of order) {
        visit(movePane(order, pane, -1), depth + 1);
        visit(movePane(order, pane, 1), depth + 1);
      }
    };
    visit([...WORKSPACE_DEFAULT_ORDER], 0);
    expect([...seen].sort()).toEqual([...ALL_ORDERS].sort());
  });

  it('keeps the third pane still when an adjacent separator moves', () => {
    const order: WorkspacePaneId[] = ['pdf', 'notebook', 'tutor'];
    const widths = { pdf: 700, notebook: 500, tutor: 360 };
    const next = resizeAdjacent(order, widths, 1, -40);
    expect(next.pdf).toBe(700);
    expect(next.notebook).toBe(460);
    expect(next.tutor).toBe(400);
    const floored = resizeAdjacent(order, { pdf: 700, notebook: 320, tutor: 360 }, 1, -80);
    expect(floored.notebook).toBe(320);
    expect(floored.tutor).toBe(360);
    expect(floored.pdf).toBe(700);
  });

  it('lets Tutor grow past 480px and stops at the hard floors', () => {
    const order: WorkspacePaneId[] = ['pdf', 'tutor', 'notebook'];
    const grown = resizeAdjacent(order, { pdf: 800, tutor: 480, notebook: 500 }, 0, -200);
    expect(grown.tutor).toBe(680);
    expect(grown.pdf).toBe(600);
    expect(grown.notebook).toBe(500);
    const pinned = resizeAdjacent(order, { pdf: 360, tutor: 680, notebook: 500 }, 0, -400);
    expect(pinned.pdf).toBe(WORKSPACE_PANE_MIN_PX.pdf);
    expect(pinned.tutor).toBe(680);
    expect(pinned.notebook).toBe(500);
  });

  it('fits three columns at 1328px and not below', () => {
    expect(threePaneFits(1328)).toBe(true);
    expect(threePaneFits(1327)).toBe(false);
    expect(threePaneFits(1280)).toBe(false);
    const fitted = fitPaneWidths(['pdf', 'notebook', 'tutor'], { pdf: 560, notebook: 440, tutor: 360 }, 1328);
    expect(fitted.pdf).toBeGreaterThanOrEqual(360);
    expect(fitted.notebook).toBeGreaterThanOrEqual(320);
    expect(fitted.tutor).toBeGreaterThanOrEqual(320);
    expect(fitted.pdf + fitted.notebook + fitted.tutor + 16).toBe(1328);
  });

  it('keeps a Tutor wider than 480px when the composition has room', () => {
    const fitted = fitPaneWidths(
      ['pdf', 'notebook', 'tutor'],
      { pdf: 560, notebook: 440, tutor: 720 },
      1800,
    );
    expect(fitted.tutor).toBe(720);
    expect(fitted.pdf).toBeGreaterThanOrEqual(360);
    expect(fitted.notebook).toBeGreaterThanOrEqual(320);
    expect(fitted.pdf + fitted.notebook + fitted.tutor + 16).toBe(1800);
  });

  it('derives side placements without writing the Tutor layout or conversation', () => {
    const layoutKey = 'focus.tutor_layout_v1:user-1:sec-1';
    const conversationKey = 'focus.tutor_conversation_v1:user-1:sec-1:pdf-1';
    localStorage.setItem(layoutKey, JSON.stringify({ placement: 'side-left', sideDockWidth: 480 }));
    localStorage.setItem(conversationKey, '{"turns":["keep"]}');
    const derived = deriveWorkspaceFromTutorLayout({ placement: 'side-left', sideDockWidth: 480 });
    expect(derived?.order).toEqual(['tutor', 'pdf', 'notebook']);
    expect(derived?.sizes.tutor).toBe(480);
    expect(deriveWorkspaceFromTutorLayout({ placement: 'side-right', sideDockWidth: 360 })?.order).toEqual([
      'pdf',
      'notebook',
      'tutor',
    ]);
    expect(deriveWorkspaceFromTutorLayout({ placement: 'floating' })).toBeNull();
    expect(deriveWorkspaceFromTutorLayout({ placement: 'top-dock' })).toBeNull();
    expect(deriveWorkspaceFromTutorLayout({ placement: 'minimized' })).toBeNull();
    expect(localStorage.getItem(layoutKey)).toContain('side-left');
    expect(localStorage.getItem(conversationKey)).toBe('{"turns":["keep"]}');
  });

  it('persists order and sizes across a fresh read', () => {
    expect(writeAcademicWorkspace('user-1', 'sec-1', {
      order: ['notebook', 'tutor', 'pdf'],
      sizes: { pdf: 600, notebook: 400, tutor: 700 },
    })).toBe(true);
    const loaded = readAcademicWorkspace('user-1', 'sec-1');
    expect(loaded?.order).toEqual(['notebook', 'tutor', 'pdf']);
    expect(loaded?.sizes.tutor).toBe(700);
    expect(localStorage.getItem(academicWorkspaceStorageKey('user-1', 'sec-1'))).toContain('"version":1');
    expect(readAcademicWorkspace('user-1', 'sec-1')).toEqual(loaded);
  });
});
