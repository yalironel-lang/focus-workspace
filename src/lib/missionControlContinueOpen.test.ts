import { describe, expect, it, vi } from 'vitest';
import { runMissionControlContinueOpen } from './missionControlContinueOpen';

describe('runMissionControlContinueOpen', () => {
  it('requests floating presentation then spatial focus — never fullscreen', () => {
    const calls: Array<{ kind: string; args: unknown[] }> = [];
    const setPresentationMode = vi.fn((objectId: string, mode: string) => {
      calls.push({ kind: 'presentation', args: [objectId, mode] });
    });
    const spatialFocus = vi.fn((objectId: string) => {
      calls.push({ kind: 'focus', args: [objectId] });
    });

    runMissionControlContinueOpen('pdf-1', { setPresentationMode, spatialFocus });

    expect(setPresentationMode).toHaveBeenCalledTimes(1);
    expect(setPresentationMode).toHaveBeenCalledWith('pdf-1', 'floating');
    expect(spatialFocus).toHaveBeenCalledTimes(1);
    expect(spatialFocus).toHaveBeenCalledWith('pdf-1');

    expect(calls.map(c => c.kind)).toEqual(['presentation', 'focus']);
    expect(calls[0]?.args[1]).toBe('floating');
    expect(setPresentationMode.mock.calls.some(c => c[1] === 'fullscreen')).toBe(false);
    expect(setPresentationMode.mock.calls.some(c => c[1] === 'split')).toBe(false);
  });
});
