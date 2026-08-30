/**
 * Sync pre-transition flush registry for Sheet UOV handoff.
 */
import { describe, expect, it } from 'vitest';
import {
  countRegisteredSheetFlushes,
  flushSheetForObject,
  registerSheetFlush,
} from './sheetFlushRegistry';
import {
  getActiveSheetEngineCount,
  inspectSheetEngineLifecycle,
  isSheetCellEditing,
  noteSheetEngineDisposed,
  noteSheetEngineMounted,
  setSheetCellEditing,
} from './sheetEngineLifecycle';

describe('sheetFlushRegistry', () => {
  it('invokes registered flush synchronously', () => {
    let calls = 0;
    const unreg = registerSheetFlush('obj-a', () => {
      calls += 1;
    });
    expect(countRegisteredSheetFlushes('obj-a')).toBe(1);
    flushSheetForObject('obj-a');
    expect(calls).toBe(1);
    flushSheetForObject('missing');
    expect(calls).toBe(1);
    unreg();
    expect(countRegisteredSheetFlushes('obj-a')).toBe(0);
    flushSheetForObject('obj-a');
    expect(calls).toBe(1);
  });

  it('supports multiple flushers per object', () => {
    const seen: string[] = [];
    const a = registerSheetFlush('obj-b', () => seen.push('a'));
    const b = registerSheetFlush('obj-b', () => seen.push('b'));
    flushSheetForObject('obj-b');
    expect(seen.sort()).toEqual(['a', 'b']);
    a();
    b();
  });
});

describe('sheetEngineLifecycle', () => {
  it('tracks active engine counts per object', () => {
    noteSheetEngineMounted('s1');
    noteSheetEngineMounted('s1');
    noteSheetEngineMounted('s2');
    expect(getActiveSheetEngineCount('s1')).toBe(2);
    expect(getActiveSheetEngineCount('s2')).toBe(1);
    expect(getActiveSheetEngineCount()).toBe(3);
    noteSheetEngineDisposed('s1');
    expect(getActiveSheetEngineCount('s1')).toBe(1);
    noteSheetEngineDisposed('s1');
    expect(getActiveSheetEngineCount('s1')).toBe(0);
    noteSheetEngineDisposed('s2');
    expect(getActiveSheetEngineCount()).toBe(0);
  });

  it('tracks cell editing for Escape coordination', () => {
    setSheetCellEditing('s1', true);
    expect(isSheetCellEditing('s1')).toBe(true);
    expect(isSheetCellEditing()).toBe(true);
    setSheetCellEditing('s1', false);
    expect(isSheetCellEditing()).toBe(false);
    noteSheetEngineMounted('s1');
    setSheetCellEditing('s1', true);
    noteSheetEngineDisposed('s1');
    expect(isSheetCellEditing('s1')).toBe(false);
    expect(inspectSheetEngineLifecycle().editingObjectIds).toEqual([]);
  });
});

describe('sheet UOV eligibility (gate contract)', () => {
  it('documents sheet as a universal presentation type', () => {
    const types = ['notebook', 'pdf', 'image', 'note', 'checklist', 'sheet'] as const;
    const supports = (t: string) => types.includes(t as (typeof types)[number]);
    expect(supports('sheet')).toBe(true);
    expect(supports('flashcards')).toBe(false);
  });
});
