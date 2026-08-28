/**
 * Live Supabase spatial-image persistence (requires test credentials).
 * @vitest-environment node
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from './database.types';
import { buildSpatialAssetPath } from './spatialAssetCloud';

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

describe.skipIf(!canRun)('spatial-image live Supabase', () => {
  let userId: string;
  let client: ReturnType<typeof createClient<Database>>;
  const sectionId = `live-fs-img-${Date.now()}`;
  const objectId = `ps-image-live-${Date.now()}`;
  const storagePath = () =>
    buildSpatialAssetPath({
      userId,
      sectionId,
      objectId,
      assetType: 'spatial-image',
    });

  beforeAll(async () => {
    client = createClient<Database>(url, key);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user) {
      throw new Error(signedIn.error?.message ?? 'live auth failed');
    }
    userId = signedIn.data.user.id;
  });

  afterAll(async () => {
    if (!userId) return;
    await client.from('free_space_objects').delete().eq('id', objectId);
    await client.storage.from('user-content').remove([storagePath()]);
    await client.auth.signOut();
  });

  it('uploads spatial-image binary then downloads on separate session', async () => {
    const imageObj = {
      id: objectId,
      type: 'image',
      title: 'live-test.png',
      content: {
        type: 'image',
        url: '',
        fileName: 'live-test.png',
        fileSize: 4,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const upsert = await client.from('free_space_objects').upsert({
      id: objectId,
      user_id: userId,
      section_id: sectionId,
      board_id: 'main',
      object: imageObj,
    });
    expect(upsert.error).toBeNull();

    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const path = storagePath();
    const uploaded = await client.storage
      .from('user-content')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });
    expect(uploaded.error).toBeNull();

    const clientB = createClient<Database>(url, key);
    const authB = await clientB.auth.signInWithPassword({ email, password });
    expect(authB.error).toBeNull();

    const row = await clientB
      .from('free_space_objects')
      .select('object')
      .eq('id', objectId)
      .maybeSingle();
    expect(row.error).toBeNull();
    expect(row.data?.object).toBeTruthy();

    const downloaded = await clientB.storage.from('user-content').download(path);
    expect(downloaded.error).toBeNull();
    expect(downloaded.data).toBeTruthy();
    const buf = new Uint8Array(await downloaded.data!.arrayBuffer());
    expect(buf).toEqual(bytes);

    await clientB.auth.signOut();
  });
});
