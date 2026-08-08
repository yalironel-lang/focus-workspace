// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertCacheNamespace,
  resolveCacheNamespace,
} from './focusCacheNamespace';

describe('resolveCacheNamespace', () => {
  it('returns the exact namespace for valid userId + workspaceId', () => {
    const result = resolveCacheNamespace('user-a', 'workspace-a');
    expect(result).toEqual({
      ok: true,
      namespace: { userId: 'user-a', workspaceId: 'workspace-a' },
    });
  });

  it('rejects null userId as auth_missing', () => {
    expect(resolveCacheNamespace(null, 'workspace-a')).toEqual({
      ok: false,
      reason: 'auth_missing',
    });
  });

  it('rejects undefined userId as auth_missing', () => {
    expect(resolveCacheNamespace(undefined, 'workspace-a')).toEqual({
      ok: false,
      reason: 'auth_missing',
    });
  });

  it('rejects empty userId as invalid_user_id', () => {
    expect(resolveCacheNamespace('', 'workspace-a')).toEqual({
      ok: false,
      reason: 'invalid_user_id',
    });
  });

  it('rejects whitespace-only userId as invalid_user_id', () => {
    expect(resolveCacheNamespace('   ', 'workspace-a')).toEqual({
      ok: false,
      reason: 'invalid_user_id',
    });
  });

  it('rejects padded userId without silently trimming', () => {
    expect(resolveCacheNamespace('  user-a  ', 'workspace-a')).toEqual({
      ok: false,
      reason: 'invalid_user_id',
    });
  });

  it('rejects null workspaceId as workspace_missing', () => {
    expect(resolveCacheNamespace('user-a', null)).toEqual({
      ok: false,
      reason: 'workspace_missing',
    });
  });

  it('rejects undefined workspaceId as workspace_missing', () => {
    expect(resolveCacheNamespace('user-a', undefined)).toEqual({
      ok: false,
      reason: 'workspace_missing',
    });
  });

  it('rejects empty workspaceId as invalid_workspace_id', () => {
    expect(resolveCacheNamespace('user-a', '')).toEqual({
      ok: false,
      reason: 'invalid_workspace_id',
    });
  });

  it('rejects whitespace-only workspaceId as invalid_workspace_id', () => {
    expect(resolveCacheNamespace('user-a', '\t\n')).toEqual({
      ok: false,
      reason: 'invalid_workspace_id',
    });
  });

  it('rejects padded workspaceId without silently trimming', () => {
    expect(resolveCacheNamespace('user-a', '  workspace-a  ')).toEqual({
      ok: false,
      reason: 'invalid_workspace_id',
    });
  });

  it('keeps user A / workspace A structurally distinct from user B / workspace A', () => {
    const a = resolveCacheNamespace('user-a', 'workspace-a');
    const b = resolveCacheNamespace('user-b', 'workspace-a');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.namespace).not.toEqual(b.namespace);
    expect(a.namespace.userId).not.toBe(b.namespace.userId);
    expect(a.namespace.workspaceId).toBe(b.namespace.workspaceId);
  });

  it('keeps same user / workspace A structurally distinct from same user / workspace B', () => {
    const a = resolveCacheNamespace('user-a', 'workspace-a');
    const b = resolveCacheNamespace('user-a', 'workspace-b');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.namespace).not.toEqual(b.namespace);
    expect(a.namespace.userId).toBe(b.namespace.userId);
    expect(a.namespace.workspaceId).not.toBe(b.namespace.workspaceId);
  });

  it('never substitutes anonymous or default identifiers', () => {
    const failures = [
      resolveCacheNamespace(null, null),
      resolveCacheNamespace(undefined, undefined),
      resolveCacheNamespace('', ''),
      resolveCacheNamespace(' ', ' '),
    ];
    for (const result of failures) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result).not.toHaveProperty('namespace');
    }
  });
});

describe('assertCacheNamespace', () => {
  it('accepts a valid namespace object', () => {
    expect(
      assertCacheNamespace({ userId: 'user-a', workspaceId: 'workspace-a' }),
    ).toEqual({
      ok: true,
      namespace: { userId: 'user-a', workspaceId: 'workspace-a' },
    });
  });

  it('rejects null as auth_missing', () => {
    expect(assertCacheNamespace(null)).toEqual({
      ok: false,
      reason: 'auth_missing',
    });
  });

  it('rejects objects missing workspaceId', () => {
    expect(assertCacheNamespace({ userId: 'user-a' })).toEqual({
      ok: false,
      reason: 'workspace_missing',
    });
  });
});
