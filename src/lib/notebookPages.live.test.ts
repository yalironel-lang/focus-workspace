/**
 * Live Supabase notebook multi-page persistence (requires test credentials).
 * @vitest-environment node
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../database.types';
import {
  addNotebookPage,
  applyNotebookPersist,
  migrateLegacyNotebook,
  prepareNotebookForCloudPersist,
  switchNotebookPage,
  type NotebookContentWithPages,
} from './notebookPages';

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
const url = env.VITE_SUPABASE_URL ?? '';
const key = env.VITE_SUPABASE_ANON_KEY ?? '';
const email = env.VITE_LIVE_TEST_EMAIL ?? '';
const password = env.VITE_LIVE_TEST_PASSWORD ?? '';
const canRun = Boolean(url && key && email && password);

function sampleNotebook(): NotebookContentWithPages {
  return {
    type: 'notebook',
    body: '',
    paperStyle: 'ruled',
    notebookMode: 'normal',
    notebookSurface: 'spatial',
  };
}

describe.skipIf(!canRun)('notebook pages live Supabase', () => {
  let userId: string;
  let sectionId: string;
  let boardId = 'main';
  let objectId: string;
  let client: ReturnType<typeof createClient<Database>>;

  beforeAll(async () => {
    client = createClient<Database>(url, key);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) {
      throw new Error(login.error?.message ?? 'auth failed');
    }
    userId = login.data.session.user.id;
    const sections = await client.from('sections').select('id').eq('user_id', userId).limit(1);
    sectionId = sections.data?.[0]?.id ?? '';
    if (!sectionId) throw new Error('no section for test user');
    objectId = `ps-nb-live-${Date.now()}`;
  }, 60_000);

  afterAll(async () => {
    if (!client || !objectId) return;
    await client.from('free_space_objects').delete().eq('id', objectId);
    await client.auth.signOut();
  });

  it('A writes page1+page2 → B reads both documentBody values from real cloud', async () => {
    let nb = migrateLegacyNotebook(sampleNotebook());
    const secId = nb.activeSectionId!;
    const page1Id = nb.activePageId!;
    nb = switchNotebookPage(nb, page1Id, 'SYNC-PAGE-1-A');
    nb = addNotebookPage(nb, secId, 'SYNC-PAGE-1-A', 'Page 2');
    const page2Id = nb.activePageId!;
    nb = switchNotebookPage(nb, page2Id, 'SYNC-PAGE-2-A');
    const cloudContent = prepareNotebookForCloudPersist(applyNotebookPersist(nb), page2Id);
    const now = Date.now();
    const objectJson = {
      id: objectId,
      type: 'notebook',
      title: 'Live Test NB',
      content: cloudContent,
      createdAt: now,
      updatedAt: now,
    };

    const up = await client.from('free_space_objects').upsert({
      id: objectId,
      user_id: userId,
      section_id: sectionId,
      board_id: boardId,
      object: objectJson,
    });
    expect(up.error).toBeNull();

    const clientB = createClient<Database>(url, key);
    const loginB = await clientB.auth.signInWithPassword({ email, password });
    expect(loginB.error).toBeNull();
    const row = await clientB
      .from('free_space_objects')
      .select('object, updated_at')
      .eq('id', objectId)
      .maybeSingle();
    expect(row.error).toBeNull();
    expect(row.data).not.toBeNull();
    const stored = (row.data!.object as { content?: NotebookContentWithPages }).content;
    expect(stored?.pages?.length).toBe(2);
    expect(stored?.pages?.find(p => p.id === page1Id)?.documentBody).toBe('SYNC-PAGE-1-A');
    expect(stored?.pages?.find(p => p.id === page2Id)?.documentBody).toBe('SYNC-PAGE-2-A');
    await clientB.auth.signOut();
  }, 60_000);
});
