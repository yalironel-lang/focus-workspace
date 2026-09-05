import { describe, expect, it, vi } from 'vitest';
import { executeMissionControlAction, openMissionControlExternalUrl } from './executeMissionControlAction';
import { runMissionControlFreeSpaceFocus } from './runMissionControlFreeSpaceFocus';

describe('executeMissionControlAction', () => {
  const baseDeps = () => ({
    focusFreeSpace: vi.fn(),
    directPresent: vi.fn(),
    openExternalUrl: vi.fn(),
    openShelfFile: vi.fn(),
  });

  it('dispatches freespace-focus', () => {
    const deps = baseDeps();
    const result = executeMissionControlAction(
      { type: 'freespace-focus', objectId: 'o1', boardId: 'b2' },
      deps,
    );
    expect(result).toBe('ok');
    expect(deps.focusFreeSpace).toHaveBeenCalledWith('o1', 'b2');
  });

  it('dispatches direct-present', () => {
    const deps = baseDeps();
    const result = executeMissionControlAction(
      { type: 'direct-present', objectId: 'o1', boardId: 'b2' },
      deps,
    );
    expect(result).toBe('ok');
    expect(deps.directPresent).toHaveBeenCalledWith('o1', 'b2');
  });

  it('dispatches external-url', () => {
    const deps = baseDeps();
    executeMissionControlAction({ type: 'external-url', url: 'https://ex.com' }, deps);
    expect(deps.openExternalUrl).toHaveBeenCalledWith('https://ex.com');
  });

  it('dispatches shelf-file', () => {
    const deps = baseDeps();
    executeMissionControlAction(
      { type: 'shelf-file', itemId: 'i1', filePath: 'u/s/g/i.pdf' },
      deps,
    );
    expect(deps.openShelfFile).toHaveBeenCalledWith({ itemId: 'i1', filePath: 'u/s/g/i.pdf' });
  });

  it('returns unavailable for unavailable action', () => {
    expect(executeMissionControlAction({ type: 'unavailable' }, baseDeps())).toBe('unavailable');
  });
});

describe('openMissionControlExternalUrl', () => {
  it('opens https in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openMissionControlExternalUrl('https://ex.com');
    expect(open).toHaveBeenCalledWith('https://ex.com', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});

describe('runMissionControlFreeSpaceFocus', () => {
  it('same board: floating then focus', () => {
    const queueFloatingPresentation = vi.fn();
    const setPresentationModeFloating = vi.fn();
    const focusNotebook = vi.fn();
    const result = runMissionControlFreeSpaceFocus(
      { objectId: 'o1', boardId: 'main' },
      {
        activeBoardId: 'main',
        focusNotebook,
        queueFloatingPresentation,
        setPresentationModeFloating,
      },
    );
    expect(result).toBe('focused');
    expect(queueFloatingPresentation).toHaveBeenCalledWith('o1');
    expect(setPresentationModeFloating).toHaveBeenCalledWith('o1');
    expect(focusNotebook).toHaveBeenCalledWith('o1', 'main');
  });

  it('other board: queue floating and pending switch without immediate setPresentation', () => {
    const queueFloatingPresentation = vi.fn();
    const setPresentationModeFloating = vi.fn();
    const focusNotebook = vi.fn();
    const result = runMissionControlFreeSpaceFocus(
      { objectId: 'o1', boardId: 'other' },
      {
        activeBoardId: 'main',
        focusNotebook,
        queueFloatingPresentation,
        setPresentationModeFloating,
      },
    );
    expect(result).toBe('pending-board-switch');
    expect(queueFloatingPresentation).toHaveBeenCalledWith('o1');
    expect(setPresentationModeFloating).not.toHaveBeenCalled();
    expect(focusNotebook).toHaveBeenCalledWith('o1', 'other');
  });
});
