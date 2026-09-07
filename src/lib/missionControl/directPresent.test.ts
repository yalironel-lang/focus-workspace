import { describe, expect, it, vi } from 'vitest';
import { resolveMissionControlOpenForProfile } from './resolveMissionControlOpenForProfile';
import { runMissionControlDirectPresent } from './runMissionControlDirectPresent';
import {
  missionControlDirectPresentTypes,
  supportsMissionControlDirectPresent,
} from './supportsMissionControlDirectPresent';

describe('supportsMissionControlDirectPresent', () => {
  it('includes primary phone content types', () => {
    expect(missionControlDirectPresentTypes()).toEqual(
      expect.arrayContaining(['notebook', 'pdf', 'sheet', 'note', 'checklist', 'image']),
    );
    for (const t of ['notebook', 'pdf', 'sheet', 'note', 'checklist', 'image'] as const) {
      expect(supportsMissionControlDirectPresent(t)).toBe(true);
    }
  });

  it('excludes link / studyfile / calculator', () => {
    expect(supportsMissionControlDirectPresent('link')).toBe(false);
    expect(supportsMissionControlDirectPresent('studyfile')).toBe(false);
    expect(supportsMissionControlDirectPresent('calculator')).toBe(false);
  });
});

describe('resolveMissionControlOpenForProfile', () => {
  const focus = { type: 'freespace-focus' as const, objectId: 'n1', boardId: 'main' };

  it('phone + notebook → direct-present', () => {
    expect(resolveMissionControlOpenForProfile(focus, 'phone', 'notebook')).toEqual({
      type: 'direct-present',
      objectId: 'n1',
      boardId: 'main',
    });
  });

  it('desktop keeps freespace-focus', () => {
    expect(resolveMissionControlOpenForProfile(focus, 'desktop', 'notebook')).toEqual(focus);
  });

  it('tablet keeps freespace-focus', () => {
    expect(resolveMissionControlOpenForProfile(focus, 'tablet', 'pdf')).toEqual(focus);
  });

  it('phone + unsupported type keeps freespace-focus', () => {
    expect(resolveMissionControlOpenForProfile(focus, 'phone', 'link')).toEqual(focus);
  });

  it('phone external-url unchanged', () => {
    const ext = { type: 'external-url' as const, url: 'https://ex.com' };
    expect(resolveMissionControlOpenForProfile(ext, 'phone', null)).toEqual(ext);
  });
});

describe('runMissionControlDirectPresent', () => {
  it('same board: present fullscreen on Mission Control', () => {
    const presentFullscreenOnMissionControl = vi.fn();
    const requestBoardSwitch = vi.fn();
    const result = runMissionControlDirectPresent(
      { objectId: 'o1', boardId: 'main' },
      {
        activeBoardId: 'main',
        requestBoardSwitch,
        presentFullscreenOnMissionControl,
      },
    );
    expect(result).toBe('presented');
    expect(presentFullscreenOnMissionControl).toHaveBeenCalledWith('o1');
    expect(requestBoardSwitch).not.toHaveBeenCalled();
  });

  it('cross-board: pending switch without immediate present', () => {
    const presentFullscreenOnMissionControl = vi.fn();
    const requestBoardSwitch = vi.fn();
    const result = runMissionControlDirectPresent(
      { objectId: 'o1', boardId: 'other' },
      {
        activeBoardId: 'main',
        requestBoardSwitch,
        presentFullscreenOnMissionControl,
      },
    );
    expect(result).toBe('pending-board-switch');
    expect(requestBoardSwitch).toHaveBeenCalledWith('o1', 'other');
    expect(presentFullscreenOnMissionControl).not.toHaveBeenCalled();
  });
});
