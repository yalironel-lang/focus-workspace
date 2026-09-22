/**
 * Temporary render artifact lifecycle for M1.0B B2.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PAGE_OCR_TEMP_PREFIX } from './bounds.ts';

export type TempRenderSession = {
  dir: string;
  imagePath: string;
  dispose: () => Promise<void>;
};

export async function createTempRenderSession(
  opts?: { prefix?: string },
): Promise<TempRenderSession> {
  const prefix = opts?.prefix ?? PAGE_OCR_TEMP_PREFIX;
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const imagePath = join(dir, 'page.png');
  let disposed = false;
  return {
    dir,
    imagePath,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function writeTempPng(
  session: TempRenderSession,
  pngBytes: Uint8Array,
): Promise<string> {
  await writeFile(session.imagePath, pngBytes);
  return session.imagePath;
}
