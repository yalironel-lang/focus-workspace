/**
 * Live Supabase validation for migration 009 (user_workspace_state).
 * @vitest-environment node
 *
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (from .env).
 * Optional authenticated round-trip: VITE_LIVE_TEST_EMAIL + VITE_LIVE_TEST_PASSWORD.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../database.types';
import { normalizeWorkspaceStateRow } from './userWorkspaceStateCloud';

function loadDotEnv(): Record<string, string> {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };
const supabaseUrl = env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ?? '';
const liveEmail = env.VITE_LIVE_TEST_EMAIL ?? '';
const livePassword = env.VITE_LIVE_TEST_PASSWORD ?? '';

const configured = Boolean(supabaseUrl && supabaseAnonKey);
const authConfigured = Boolean(liveEmail && livePassword);

function anonClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

describe.skipIf(!configured)('user_workspace_state live backend (migration 009)', () => {
  let userId: string | null = null;
  let sectionId: string | null = null;
  let authedClient: ReturnType<typeof anonClient> | null = null;

  beforeAll(async () => {
    if (!authConfigured) return;
    authedClient = anonClient();
    const login = await authedClient.auth.signInWithPassword({
      email: liveEmail,
      password: livePassword,
    });
    if (login.error || !login.data.session?.user.id) {
      throw new Error(`live auth failed: ${login.error?.message ?? 'no session'}`);
    }
    userId = login.data.session.user.id;

    const sections = await authedClient
      .from('sections')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    sectionId = sections.data?.[0]?.id ?? null;
  }, 30_000);

  afterAll(async () => {
    if (!authedClient || !userId) return;
    await authedClient.from('user_workspace_state').delete().eq('user_id', userId);
    await authedClient.auth.signOut();
  });

  it('table is reachable (migration 009 applied)', async () => {
    const { error } = await anonClient().from('user_workspace_state').select('user_id').limit(1);
    expect(error).toBeNull();
  });

  it('RLS blocks unauthenticated upsert', async () => {
    const { error } = await anonClient().from('user_workspace_state').upsert({
      user_id: '00000000-0000-0000-0000-000000000001',
      scope: 'desk',
      workspace_id: '00000000-0000-0000-0000-000000000001',
      state: {},
      updated_at_ms: 1,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/row-level security|permission denied/i);
  });

  describe.skipIf(!authConfigured)('authenticated desk + math round-trip', () => {
    it('desk: upsert → fetch → LWW update', async () => {
      expect(authedClient && userId).toBeTruthy();
      const t1 = Date.now();
      const stateT1 = {
        schemaVersion: 1,
        blocks: [
          {
            id: 'live-desk-1',
            type: 'text',
            size: 'half',
            order: 0,
            content: { type: 'text', body: 'LIVE-A' },
            createdAt: t1,
          },
        ],
        positions: {},
        layout: [],
        updatedAt: t1,
      };
      const up1 = await authedClient!.from('user_workspace_state').upsert(
        {
          user_id: userId!,
          scope: 'desk',
          workspace_id: userId!,
          state: stateT1,
          updated_at_ms: t1,
        },
        { onConflict: 'user_id,scope,workspace_id' },
      );
      expect(up1.error).toBeNull();

      const pull1 = await authedClient!
        .from('user_workspace_state')
        .select('user_id, scope, workspace_id, state, updated_at_ms')
        .eq('user_id', userId!)
        .eq('scope', 'desk')
        .eq('workspace_id', userId!)
        .maybeSingle();
      expect(pull1.error).toBeNull();
      const row1 = normalizeWorkspaceStateRow(pull1.data);
      expect(row1?.updated_at_ms).toBe(t1);

      const t2 = t1 + 5000;
      const up2 = await authedClient!.from('user_workspace_state').upsert(
        {
          user_id: userId!,
          scope: 'desk',
          workspace_id: userId!,
          state: {
            ...stateT1,
            updatedAt: t2,
            blocks: [{ ...stateT1.blocks[0], content: { type: 'text', body: 'LIVE-B' } }],
          },
          updated_at_ms: t2,
        },
        { onConflict: 'user_id,scope,workspace_id' },
      );
      expect(up2.error).toBeNull();

      const pull2 = await authedClient!
        .from('user_workspace_state')
        .select('user_id, scope, workspace_id, state, updated_at_ms')
        .eq('user_id', userId!)
        .eq('scope', 'desk')
        .eq('workspace_id', userId!)
        .maybeSingle();
      expect(pull2.error).toBeNull();
      const row2 = normalizeWorkspaceStateRow(pull2.data);
      expect(row2?.updated_at_ms).toBe(t2);
      expect((row2?.state as { blocks?: { content?: { body?: string } }[] }).blocks?.[0]?.content?.body).toBe(
        'LIVE-B',
      );
    });

    it('math_zone: upsert + fetch when owned section exists', async () => {
      if (!sectionId) {
        expect(sectionId).toBeTruthy();
        return;
      }
      const t1 = Date.now();
      const mathState = {
        schemaVersion: 1,
        index: { notebooks: [], activeId: null },
        notebooks: {},
        updatedAt: t1,
      };
      const up = await authedClient!.from('user_workspace_state').upsert(
        {
          user_id: userId!,
          scope: 'math_zone',
          workspace_id: sectionId,
          state: mathState,
          updated_at_ms: t1,
        },
        { onConflict: 'user_id,scope,workspace_id' },
      );
      expect(up.error).toBeNull();

      const pull = await authedClient!
        .from('user_workspace_state')
        .select('user_id, scope, workspace_id, state, updated_at_ms')
        .eq('user_id', userId!)
        .eq('scope', 'math_zone')
        .eq('workspace_id', sectionId)
        .maybeSingle();
      expect(pull.error).toBeNull();
      const row = normalizeWorkspaceStateRow(pull.data);
      expect(row?.updated_at_ms).toBe(t1);
    });

    it('math_zone rejects workspace_id that is not an owned section', async () => {
      expect(userId).toBeTruthy();
      const fakeSection = '00000000-0000-0000-0000-000000000099';
      const { error } = await authedClient!.from('user_workspace_state').upsert({
        user_id: userId!,
        scope: 'math_zone',
        workspace_id: fakeSection,
        state: { schemaVersion: 1, index: { notebooks: [], activeId: null }, notebooks: {}, updatedAt: 1 },
        updated_at_ms: Date.now(),
      });
      expect(error).not.toBeNull();
      expect(error?.message ?? '').toMatch(/row-level security|violates|policy/i);
    });
  });
});
