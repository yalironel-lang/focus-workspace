import { beforeEach, describe, expect, it } from 'vitest';
import { readTutorSession, tutorSessionStorageKey, writeTutorSession } from './tutorSessionStorage';
import type { TutorCaptureIntent } from './tutorCaptureTypes';
import {
  readTutorLayout,
  resetTutorLayout,
  restoreTutorLayout,
  minimizeTutorLayout,
  resolveTopDockExpandedHeight,
  resolveTutorFloatingGeometry,
  resolveTutorSurface,
  sideDockRenderWidth,
  tutorDockVisual,
  tutorLayoutStorageKey,
  writeTutorLayout,
  TUTOR_SIDE_DOCK_MIN_COMPOSITION_PX,
  TUTOR_TOP_DOCK_COLLAPSE_PAST_PX,
} from './tutorLayoutStorage';

const intent: TutorCaptureIntent = {
  action: 'explain',
  mode: 'exam_prep',
  attachment: {
    sourceKind: 'free_space_pdf',
    sourceObjectId: 'pdf-1',
    sectionId: 'sec-1',
    pageNumber: 2,
    regionNorm: { x: 0, y: 0, w: 1, h: 1 },
    attachmentType: 'text_selection',
    extractedText: 'Limits',
  },
};

describe('tutorLayoutStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips placement, dock sizes, and floating geometry for one user and section', () => {
    expect(
      writeTutorLayout('user-a', 'sec-1', {
        placement: 'side-left',
        topDockHeight: 220,
        sideDockWidth: 360,
        floating: { width: 520, height: 480, positionX: 40, positionY: 70 },
      }),
    ).toBe(true);

    const loaded = readTutorLayout('user-a', 'sec-1');
    expect(loaded?.placement).toBe('side-left');
    expect(loaded?.restorePlacement).toBe('side-left');
    expect(loaded?.topDockHeight).toBe(220);
    expect(loaded?.sideDockWidth).toBe(360);
    expect(loaded?.floating).toEqual({ width: 520, height: 480, positionX: 40, positionY: 70 });
    expect(loaded?.version).toBe(1);
    expect(tutorLayoutStorageKey('user-a', 'sec-1')).toBe(
      'focus.tutor_layout_v1:user-a:sec-1',
    );
    expect(tutorLayoutStorageKey('user-a', 'sec-1')).not.toBe(
      tutorSessionStorageKey('user-a', 'sec-1', 'pdf-1'),
    );
  });

  it('remembers the previous placement across minimize and restore', () => {
    writeTutorLayout('user-a', 'sec-1', {
      placement: 'side-right',
      floating: { width: 500, height: 420, positionX: 30, positionY: 60 },
    });

    expect(minimizeTutorLayout('user-a', 'sec-1')).toBe(true);
    const minimized = readTutorLayout('user-a', 'sec-1');
    expect(minimized?.placement).toBe('minimized');
    expect(minimized?.restorePlacement).toBe('side-right');
    expect(minimized?.floating?.width).toBe(500);

    expect(restoreTutorLayout('user-a', 'sec-1')).toBe(true);
    const restored = readTutorLayout('user-a', 'sec-1');
    expect(restored?.placement).toBe('side-right');
    expect(restored?.restorePlacement).toBe('side-right');
    expect(restored?.floating?.height).toBe(420);
  });

  it('resets layout without clearing conversation, draft, mode, or capture', () => {
    writeTutorSession('user-a', 'sec-1', 'pdf-1', {
      intent,
      mode: 'exam_prep',
      draftQuestion: 'Keep this draft',
      turns: [{ id: 'u1', role: 'user', content: 'Saved question', timestamp: 1 }],
      attachmentAttached: true,
    });
    const conversationKey = tutorSessionStorageKey('user-a', 'sec-1', 'pdf-1');
    const before = localStorage.getItem(conversationKey);

    writeTutorLayout('user-a', 'sec-1', {
      placement: 'minimized',
      restorePlacement: 'top-dock',
      topDockHeight: 300,
      sideDockWidth: 400,
      floating: { width: 600, height: 500, positionX: 80, positionY: 90 },
    });

    expect(resetTutorLayout('user-a', 'sec-1', { width: 1280, height: 800 })).toBe(true);

    expect(localStorage.getItem(conversationKey)).toBe(before);
    const session = readTutorSession('user-a', 'sec-1', 'pdf-1');
    expect(session?.turns.map(turn => turn.content)).toEqual(['Saved question']);
    expect(session?.draftQuestion).toBe('Keep this draft');
    expect(session?.mode).toBe('exam_prep');
    expect(session?.intent?.attachment.extractedText).toBe('Limits');
    expect(session?.attachmentAttached).toBe(true);

    const layout = readTutorLayout('user-a', 'sec-1');
    expect(layout?.placement).toBe('top-dock');
    expect(layout?.restorePlacement).toBe('top-dock');
    expect(layout?.placementOrigin).toBe('explicit');
    expect(layout?.topDockExpanded).toBe(false);
    expect(layout?.topDockHeight).toBeUndefined();
    expect(layout?.sideDockWidth).toBeUndefined();
    expect(layout?.floating?.width).toBe(450);
    expect(layout?.floating?.positionY).toBe(90);
  });

  it('drops corrupt preferences and does not touch another section or a null-intent session', () => {
    writeTutorSession('user-a', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [{ id: 'u1', role: 'user', content: 'No capture yet', timestamp: 2 }],
    });
    writeTutorLayout('user-a', 'sec-2', { placement: 'top-dock', topDockHeight: 180 });

    const key = tutorLayoutStorageKey('user-a', 'sec-1');
    localStorage.setItem(key, '{not json');
    expect(readTutorLayout('user-a', 'sec-1')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 99,
        userId: 'user-a',
        sectionId: 'sec-1',
        placement: 'floating',
        restorePlacement: 'floating',
        updatedAt: 1,
      }),
    );
    expect(readTutorLayout('user-a', 'sec-1')).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        sectionId: 'sec-1',
        placement: 'popup',
        restorePlacement: 'floating',
        updatedAt: 1,
      }),
    );
    expect(readTutorLayout('user-a', 'sec-1')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'someone-else',
        sectionId: 'sec-1',
        placement: 'floating',
        restorePlacement: 'floating',
        updatedAt: 1,
      }),
    );
    expect(readTutorLayout('user-a', 'sec-1')).toBeNull();

    expect(readTutorLayout('user-a', 'sec-2')?.placement).toBe('top-dock');
    expect(readTutorLayout('user-b', 'sec-2')).toBeNull();
    expect(readTutorSession('user-a', 'sec-1', 'pdf-1')?.intent).toBeNull();
    expect(readTutorSession('user-a', 'sec-1', 'pdf-1')?.turns[0]?.content).toBe('No capture yet');
    expect(writeTutorLayout('', 'sec-1', { placement: 'floating' })).toBe(false);
    expect(readTutorLayout(null, 'sec-1')).toBeNull();
  });

  it('clamps dock sizes and floating geometry to safe bounds', () => {
    writeTutorLayout('user-a', 'sec-1', {
      placement: 'top-dock',
      topDockHeight: 12,
      sideDockWidth: 900,
      floating: { width: 750, height: 700, positionX: 5000, positionY: -40 },
    });
    const stored = readTutorLayout('user-a', 'sec-1');
    expect(stored?.topDockHeight).toBe(48);
    expect(stored?.sideDockWidth).toBe(480);

    const geom = resolveTutorFloatingGeometry(stored, null, { width: 800, height: 600 });
    expect(geom.positionX).toBe(700);
    expect(geom.positionY).toBe(40);
    expect(geom.width).toBe(750);
    expect(geom.height).toBe(540);

    const narrow = resolveTutorFloatingGeometry(stored, null, { width: 360, height: 700 });
    expect(narrow.width).toBe(344);
    expect(narrow.width).toBeLessThanOrEqual(360);

    expect(resolveTopDockExpandedHeight(undefined, 800, false)).toBe(280);
    expect(resolveTopDockExpandedHeight(12, 800, false)).toBe(280);
    expect(resolveTopDockExpandedHeight(220, 800, false)).toBe(220);
    expect(resolveTopDockExpandedHeight(400, 800, false)).toBe(360);
    expect(resolveTopDockExpandedHeight(400, 500, true)).toBe(200);
  });

  it('reads legacy conversation geometry until a layout record exists, then ignores it', () => {
    const legacy = { width: 580, height: 640, positionX: 150, positionY: 85 };
    const viewport = { width: 1200, height: 800 };
    expect(resolveTutorFloatingGeometry(null, legacy, viewport)).toEqual({
      width: 580,
      height: 640,
      positionX: 150,
      positionY: 85,
    });

    writeTutorLayout('user-a', 'sec-1', { placement: 'side-left' });
    const layout = readTutorLayout('user-a', 'sec-1');
    const afterRecord = resolveTutorFloatingGeometry(layout, legacy, viewport);
    expect(afterRecord.positionX).not.toBe(150);
    expect(layout?.placement).toBe('side-left');
    expect(layout?.placementOrigin).toBe('explicit');
    expect(JSON.stringify(legacy)).not.toContain('side-left');
  });

  it('migrates automatic M1 floating placement to the compact dock without touching the conversation', () => {
    writeTutorSession('user-a', 'sec-1', 'pdf-1', {
      intent: null,
      mode: 'teach_me',
      turns: [{ id: 'u1', role: 'user', content: 'Keep the thread', timestamp: 3 }],
    });
    const conversationKey = tutorSessionStorageKey('user-a', 'sec-1', 'pdf-1');
    const before = localStorage.getItem(conversationKey);
    const key = tutorLayoutStorageKey('user-a', 'sec-1');
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        sectionId: 'sec-1',
        placement: 'floating',
        restorePlacement: 'floating',
        floating: { width: 580, height: 640, positionX: 150, positionY: 85 },
        updatedAt: 10,
      }),
    );

    const migrated = readTutorLayout('user-a', 'sec-1');
    expect(migrated?.placement).toBe('top-dock');
    expect(migrated?.restorePlacement).toBe('top-dock');
    expect(migrated?.placementOrigin).toBe('implicit');
    expect(migrated?.topDockExpanded).toBe(false);
    expect(migrated?.floating).toEqual({ width: 580, height: 640, positionX: 150, positionY: 85 });
    expect(localStorage.getItem(conversationKey)).toBe(before);

    const stored = localStorage.getItem(key);
    expect(readTutorLayout('user-a', 'sec-1')?.placement).toBe('top-dock');
    expect(localStorage.getItem(key)).toBe(stored);

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        sectionId: 'sec-1',
        placement: 'minimized',
        restorePlacement: 'floating',
        floating: { width: 500, height: 400, positionX: 20, positionY: 50 },
        updatedAt: 11,
      }),
    );
    const minimized = readTutorLayout('user-a', 'sec-1');
    expect(minimized?.placement).toBe('minimized');
    expect(minimized?.restorePlacement).toBe('top-dock');
    expect(minimized?.placementOrigin).toBe('implicit');
    expect(minimized?.floating?.width).toBe(500);

    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: 'user-a',
        sectionId: 'sec-1',
        placement: 'side-right',
        restorePlacement: 'side-right',
        updatedAt: 12,
      }),
    );
    expect(readTutorLayout('user-a', 'sec-1')?.placement).toBe('side-right');
    expect(readTutorLayout('user-a', 'sec-1')?.placementOrigin).toBe('explicit');

    expect(writeTutorLayout('user-a', 'sec-1', { placement: 'floating' })).toBe(true);
    expect(readTutorLayout('user-a', 'sec-1')?.placement).toBe('floating');
    expect(readTutorLayout('user-a', 'sec-1')?.placementOrigin).toBe('explicit');
    expect(localStorage.getItem(conversationKey)).toBe(before);
  });

  it('draws a side dock only when both study panes keep a comfortable width', () => {
    const layout = readTutorLayout('missing', 'missing');
    const stored = {
      version: 1 as const,
      userId: 'user-a',
      sectionId: 'sec-1',
      placement: 'side-right' as const,
      restorePlacement: 'side-right' as const,
      placementOrigin: 'explicit' as const,
      topDockExpanded: false,
      sideDockWidth: 480,
      updatedAt: 1,
    };
    expect(TUTOR_SIDE_DOCK_MIN_COMPOSITION_PX).toBe(1328);
    expect(sideDockRenderWidth(360, 968)).toBeNull();
    expect(sideDockRenderWidth(360, 1280)).toBeNull();
    expect(sideDockRenderWidth(undefined, 1328)).toBe(320);
    expect(sideDockRenderWidth(360, 1440)).toBe(360);
    expect(sideDockRenderWidth(480, 1400)).toBe(392);
    expect(sideDockRenderWidth(900, 1600)).toBe(480);
    expect(tutorDockVisual(stored, 1280)).toBe('compact');
    expect(tutorDockVisual(stored, 1600)).toBe('side-right');
    expect(tutorDockVisual({ ...stored, topDockExpanded: true }, 1280)).toBe('expanded');
    expect(TUTOR_TOP_DOCK_COLLAPSE_PAST_PX).toBe(48);
    expect(tutorDockVisual({
      ...stored,
      placement: 'top-dock',
      restorePlacement: 'top-dock',
      topDockExpanded: true,
      expandedDockCollapsed: true,
      topDockHeight: 280,
    }, 1280)).toBe('compact');
    expect(resolveTutorSurface(stored, 1600)).toEqual({ visual: 'side-right', sideWidth: 480 });
    expect(tutorDockVisual(layout, 1600)).toBe('compact');
  });
});
