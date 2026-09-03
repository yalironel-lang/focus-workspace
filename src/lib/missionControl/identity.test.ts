import { describe, expect, it } from 'vitest';
import {
  missionControlItemId,
  parseMissionControlItemId,
} from './identity';

describe('missionControl identity', () => {
  it('A: prefix stability for each source family', () => {
    expect(missionControlItemId('freespace', 'ps-pdf-1')).toBe('freespace:ps-pdf-1');
    expect(missionControlItemId('shelf-item', 'uuid-1')).toBe('shelf-item:uuid-1');
    expect(missionControlItemId('course-link', 'uuid-2')).toBe('course-link:uuid-2');
  });

  it('B: no cross-family collision for same raw id', () => {
    const a = missionControlItemId('freespace', 'same');
    const b = missionControlItemId('shelf-item', 'same');
    const c = missionControlItemId('course-link', 'same');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('parses prefixed ids', () => {
    expect(parseMissionControlItemId('freespace:ps-1')).toEqual({
      source: 'freespace',
      sourceId: 'ps-1',
    });
    expect(parseMissionControlItemId('shelf-item:x')).toEqual({
      source: 'shelf-item',
      sourceId: 'x',
    });
    expect(parseMissionControlItemId('nope')).toBeNull();
    expect(parseMissionControlItemId('freespace:')).toBeNull();
  });
});
