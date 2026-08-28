/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDeskLocalSnapshot,
  deskLocalUpdatedAt,
  parseDeskCloudState,
  readDeskLocalSnapshot,
} from './deskPersistence';

describe('desk persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('localStorage', {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      },
      clear() {
        this.store = {};
      },
    });
    localStorage.clear();
  });

  it('round-trips blocks, positions, layout through local snapshot', () => {
    const state = {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: 'b1',
          type: 'text' as const,
          size: 'half' as const,
          order: 0,
          content: { type: 'text' as const, body: 'test' },
          createdAt: 1,
        },
      ],
      positions: { b1: { x: 10, y: 20, w: 340, h: 0 } },
      layout: [{ id: 'capture', enabled: true, size: 'full' as const, order: 0 }],
      updatedAt: 100,
    };
    applyDeskLocalSnapshot(state);
    expect(deskLocalUpdatedAt()).toBe(100);
    const read = readDeskLocalSnapshot();
    expect(read.blocks).toHaveLength(1);
    expect(read.positions.b1?.x).toBe(10);
    expect(parseDeskCloudState(state)?.layout[0]?.id).toBe('capture');
  });
});
