import { describe, expect, it } from 'vitest';
import { resolveMissionControlOpenForProfile } from './resolveMissionControlOpenForProfile';
import { shouldMountFreeSpaceCanvas } from '../phoneLazyFreeSpace';
import { runMissionControlDirectPresent } from './runMissionControlDirectPresent';

/**
 * Phase C contracts: phone MC/direct-present without FreeformCanvas;
 * desktop/tablet keep-alive; direct-present independent of canvas mount.
 */
describe('phone lazy Free Space + direct-present contracts', () => {
  it('phone MC: canvas unmounted; direct-present action still resolves', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(false);

    const action = resolveMissionControlOpenForProfile(
      { type: 'freespace-focus', objectId: 'nb1', boardId: 'main' },
      'phone',
      'notebook',
    );
    expect(action).toEqual({
      type: 'direct-present',
      objectId: 'nb1',
      boardId: 'main',
    });
  });

  it('phone direct-present path does not require canvas mount', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(false);

    let presented = false;
    const result = runMissionControlDirectPresent(
      { objectId: 'pdf1', boardId: 'main' },
      {
        activeBoardId: 'main',
        requestBoardSwitch: () => {
          throw new Error('should not board-switch');
        },
        presentFullscreenOnMissionControl: () => {
          presented = true;
        },
      },
    );
    expect(result).toBe('presented');
    expect(presented).toBe(true);
  });

  it('cross-board direct-present still queues board switch without canvas', () => {
    const switches: Array<[string, string]> = [];
    const result = runMissionControlDirectPresent(
      { objectId: 'sheet1', boardId: 'board-b' },
      {
        activeBoardId: 'board-a',
        requestBoardSwitch: (id, board) => switches.push([id, board]),
        presentFullscreenOnMissionControl: () => {
          throw new Error('should wait for board');
        },
      },
    );
    expect(result).toBe('pending-board-switch');
    expect(switches).toEqual([['sheet1', 'board-b']]);
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(false);
  });

  it('phone Workspace mounts canvas; return to MC unmounts', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'free-space',
        lazyEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(false);
  });

  it('desktop/tablet MC keep canvas mounted', () => {
    for (const profile of ['desktop', 'tablet'] as const) {
      expect(
        shouldMountFreeSpaceCanvas({
          profile,
          sectionViewMode: 'work-surface',
          lazyEnabled: true,
        }),
      ).toBe(true);
      expect(
        resolveMissionControlOpenForProfile(
          { type: 'freespace-focus', objectId: 'x', boardId: 'main' },
          profile,
          'notebook',
        ).type,
      ).toBe('freespace-focus');
    }
  });
});
