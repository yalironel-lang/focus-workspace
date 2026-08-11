// @vitest-environment node
import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as idbEnv from '../indexedDbEnvironment';
import { resetFocusCacheDbForTests } from './db';
import type { CacheNamespace } from '../focusCacheNamespace';
import {
  enqueuePendingOperation,
  listPendingOperations,
  removePendingOperation,
  replacePendingOperationPayload,
} from './pendingOperations';
import { FOCUS_CACHE_DB_NAME } from './types';

const nsA: CacheNamespace = { userId: 'user-a', workspaceId: 'workspace-a' };
const nsB: CacheNamespace = { userId: 'user-b', workspaceId: 'workspace-a' };
const nsA2: CacheNamespace = { userId: 'user-a', workspaceId: 'workspace-b' };

async function deleteFocusCacheDatabase(): Promise<void> {
  await resetFocusCacheDbForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FOCUS_CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await deleteFocusCacheDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await deleteFocusCacheDatabase();
});

describe('pendingOperations queue', () => {
  it('enqueues one operation and lists it', async () => {
    const enq = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: 'n1',
      operationType: 'create',
      payload: { title: 'hello' },
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;

    expect(enq.value.seq).toBeTypeOf('number');
    expect(enq.value.id).toBeTruthy();
    expect(enq.value.userId).toBe('user-a');
    expect(enq.value.workspaceId).toBe('workspace-a');
    expect(enq.value.payload).toEqual({ title: 'hello' });

    const list = await listPendingOperations(nsA);
    expect(list).toEqual({ ok: true, value: [enq.value] });
  });

  it('orders by seq across multiple enqueues', async () => {
    const a = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: 1,
    });
    const b = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '2',
      operationType: 'update',
      payload: 2,
    });
    const c = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '3',
      operationType: 'delete',
      payload: null,
    });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;

    expect(a.value.seq).toBeLessThan(b.value.seq);
    expect(b.value.seq).toBeLessThan(c.value.seq);

    const list = await listPendingOperations(nsA);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.map((op) => op.seq)).toEqual([
      a.value.seq,
      b.value.seq,
      c.value.seq,
    ]);
  });

  it('isolates users sharing a workspace id', async () => {
    await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { who: 'a' },
    });
    await enqueuePendingOperation({
      namespace: nsB,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { who: 'b' },
    });

    const listA = await listPendingOperations(nsA);
    const listB = await listPendingOperations(nsB);
    expect(listA.ok && listB.ok).toBe(true);
    if (!listA.ok || !listB.ok) return;
    expect(listA.value).toHaveLength(1);
    expect(listB.value).toHaveLength(1);
    expect(listA.value[0]?.payload).toEqual({ who: 'a' });
    expect(listB.value[0]?.payload).toEqual({ who: 'b' });
  });

  it('isolates workspaces for the same user', async () => {
    await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { ws: 'a' },
    });
    await enqueuePendingOperation({
      namespace: nsA2,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { ws: 'b' },
    });

    const listA = await listPendingOperations(nsA);
    const listA2 = await listPendingOperations(nsA2);
    expect(listA.ok && listA2.ok).toBe(true);
    if (!listA.ok || !listA2.ok) return;
    expect(listA.value[0]?.payload).toEqual({ ws: 'a' });
    expect(listA2.value[0]?.payload).toEqual({ ws: 'b' });
  });

  it('rejects invalid namespace before DB write', async () => {
    const bad = { userId: '', workspaceId: 'workspace-a' } as CacheNamespace;
    const enq = await enqueuePendingOperation({
      namespace: bad,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: null,
    });
    expect(enq).toEqual({ ok: false, reason: 'invalid_user_id' });

    const list = await listPendingOperations(nsA);
    expect(list).toEqual({ ok: true, value: [] });
  });

  it('rejects invalid entityType, entityId, and id', async () => {
    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: '  padded  ',
        entityId: '1',
        operationType: 'create',
        payload: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });

    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '',
        operationType: 'create',
        payload: null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });

    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '1',
        operationType: 'create',
        payload: null,
        id: ' ',
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
  });

  it('accepts JSON-safe payloads including null and primitives', async () => {
    const payloads: Array<import('./types').JsonValue | null> = [
      null,
      'x',
      3,
      true,
      [1, { a: false }],
      { nested: [null] },
    ];
    for (const payload of payloads) {
      const result = await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: `e-${crypto.randomUUID()}`,
        operationType: 'update',
        payload,
        id: `id-${crypto.randomUUID()}`,
      });
      expect(result.ok).toBe(true);
    }
  });

  it('rejects Date payload', async () => {
    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '1',
        operationType: 'create',
        payload: new Date() as unknown as null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
  });

  it('rejects Blob payload', async () => {
    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '1',
        operationType: 'create',
        payload: new Blob(['x']) as unknown as null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
  });

  it('rejects undefined payload', async () => {
    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '1',
        operationType: 'create',
        payload: undefined as unknown as null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
  });

  it('rejects function payload', async () => {
    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '1',
        operationType: 'create',
        payload: (() => 1) as unknown as null,
      }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
  });

  it('returns duplicate_id for the same logical id', async () => {
    const first = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { v: 1 },
      id: 'same-op-id',
    });
    expect(first.ok).toBe(true);

    const second = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '2',
      operationType: 'update',
      payload: { v: 2 },
      id: 'same-op-id',
    });
    expect(second).toEqual({ ok: false, reason: 'duplicate_id' });

    const list = await listPendingOperations(nsA);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(1);
    expect(list.value[0]?.payload).toEqual({ v: 1 });
  });

  it('removes matching namespace operation', async () => {
    const enq = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: null,
      id: 'to-remove',
    });
    expect(enq.ok).toBe(true);

    const removed = await removePendingOperation(nsA, 'to-remove');
    expect(removed).toEqual({ ok: true, value: { removed: true } });

    const list = await listPendingOperations(nsA);
    expect(list).toEqual({ ok: true, value: [] });
  });

  it('returns removed false for missing id', async () => {
    expect(await removePendingOperation(nsA, 'missing-id')).toEqual({
      ok: true,
      value: { removed: false },
    });
  });

  it('returns removed false for cross-namespace id without deleting', async () => {
    await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { keep: true },
      id: 'shared-looking-id',
    });

    expect(await removePendingOperation(nsB, 'shared-looking-id')).toEqual({
      ok: true,
      value: { removed: false },
    });

    const list = await listPendingOperations(nsA);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(1);
    expect(list.value[0]?.payload).toEqual({ keep: true });
  });

  it('persists across DB reopen', async () => {
    const enq = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: 'persist-1',
      operationType: 'create',
      payload: { durable: true },
      id: 'persist-op',
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;

    await resetFocusCacheDbForTests();

    const list = await listPendingOperations(nsA);
    expect(list).toEqual({ ok: true, value: [enq.value] });
  });

  it('returns idb_unavailable when IndexedDB cannot be resolved', async () => {
    vi.spyOn(idbEnv, 'getIndexedDB').mockReturnValue(null);
    await resetFocusCacheDbForTests();

    expect(
      await enqueuePendingOperation({
        namespace: nsA,
        entityType: 'note',
        entityId: '1',
        operationType: 'create',
        payload: null,
      }),
    ).toEqual({ ok: false, reason: 'idb_unavailable' });
  });

  it('supports concurrent enqueue without losing operations', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        enqueuePendingOperation({
          namespace: nsA,
          entityType: 'note',
          entityId: `c-${i}`,
          operationType: 'create',
          payload: i,
          id: `concurrent-${i}`,
        }),
      ),
    );

    expect(results.every((r) => r.ok)).toBe(true);

    const list = await listPendingOperations(nsA);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(8);
    const seqs = list.value.map((op) => op.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it('replaces payload on an existing operation keeping id and seq', async () => {
    const enq = await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'free_space_object',
      entityId: 'obj-1',
      operationType: 'update',
      payload: { boardId: 'main', object: { id: 'obj-1', updatedAt: 1 } },
      id: 'op-replace-1',
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;

    const replaced = await replacePendingOperationPayload(nsA, 'op-replace-1', {
      boardId: 'main',
      object: { id: 'obj-1', updatedAt: 99, content: { type: 'note', body: 'later' } },
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.value.replaced).toBe(true);
    expect(replaced.value.operation?.seq).toBe(enq.value.seq);
    expect(replaced.value.operation?.id).toBe('op-replace-1');
    expect(replaced.value.operation?.operationType).toBe('update');
    expect(replaced.value.operation?.payload).toEqual({
      boardId: 'main',
      object: { id: 'obj-1', updatedAt: 99, content: { type: 'note', body: 'later' } },
    });

    const list = await listPendingOperations(nsA);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value).toHaveLength(1);
    expect(list.value[0]?.payload).toEqual({
      boardId: 'main',
      object: { id: 'obj-1', updatedAt: 99, content: { type: 'note', body: 'later' } },
    });
  });

  it('does not replace across namespaces or missing ids', async () => {
    await enqueuePendingOperation({
      namespace: nsA,
      entityType: 'note',
      entityId: '1',
      operationType: 'create',
      payload: { v: 1 },
      id: 'op-ns',
    });

    const cross = await replacePendingOperationPayload(nsB, 'op-ns', { v: 2 });
    expect(cross).toEqual({ ok: true, value: { replaced: false } });

    const missing = await replacePendingOperationPayload(nsA, 'no-such-op', { v: 3 });
    expect(missing).toEqual({ ok: true, value: { replaced: false } });

    const list = await listPendingOperations(nsA);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value[0]?.payload).toEqual({ v: 1 });
  });

  it('rejects invalid payload replace inputs', async () => {
    expect(
      await replacePendingOperationPayload(nsA, '', { ok: true }),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
    expect(
      await replacePendingOperationPayload(nsA, 'op-x', undefined as never),
    ).toEqual({ ok: false, reason: 'invalid_operation' });
  });
});
