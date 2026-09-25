/**
 * V1-H1 — editor flush runs before Free Space storage flushers;
 * unregister removes stale callbacks.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  flushAllFreeSpacePersistence,
  registerEditorPersistFlush,
  registerFreeSpacePersistFlush,
  resetFreeSpacePersistFlushForTests,
} from './freeSpacePersistFlush';

afterEach(() => {
  resetFreeSpacePersistFlushForTests();
});

describe('freeSpacePersistFlush V1-H1 ordering', () => {
  it('runs editor flushers before storage flushers', () => {
    const order: string[] = [];
    registerFreeSpacePersistFlush(() => {
      order.push('storage');
    });
    registerEditorPersistFlush(() => {
      order.push('editor');
    });
    flushAllFreeSpacePersistence();
    expect(order).toEqual(['editor', 'storage']);
  });

  it('repeated flush is safe (idempotent empty flushes)', () => {
    let editorCalls = 0;
    let storageCalls = 0;
    registerEditorPersistFlush(() => {
      editorCalls += 1;
    });
    registerFreeSpacePersistFlush(() => {
      storageCalls += 1;
    });
    flushAllFreeSpacePersistence();
    flushAllFreeSpacePersistence();
    expect(editorCalls).toBe(2);
    expect(storageCalls).toBe(2);
  });

  it('unregister removes stale editor flush callbacks', () => {
    const order: string[] = [];
    const unregister = registerEditorPersistFlush(() => {
      order.push('stale');
    });
    unregister();
    registerEditorPersistFlush(() => {
      order.push('fresh');
    });
    flushAllFreeSpacePersistence();
    expect(order).toEqual(['fresh']);
  });

  it('editor flush can populate storage snapshot before storage flush runs', () => {
    let pending: { body: string } | null = { body: 'typed-before-debounce' };
    let durable: string | null = null;

    registerEditorPersistFlush(() => {
      if (!pending) return;
      const snap = pending;
      pending = null;
      durable = snap.body;
    });
    registerFreeSpacePersistFlush(() => {
      // Storage layer reads what editor just committed.
      expect(durable).toBe('typed-before-debounce');
    });

    flushAllFreeSpacePersistence();
    expect(pending).toBeNull();
    expect(durable).toBe('typed-before-debounce');
  });
});
