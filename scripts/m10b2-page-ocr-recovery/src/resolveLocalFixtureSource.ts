/**
 * Local-only fixture adapter for M1.0B B2.
 *
 * Maps trusted (sourceId, sourceVersion) → local PDF bytes.
 * Does NOT accept client file paths. Prototype convenience ≠ production auth.
 */

import { readFile } from 'node:fs/promises';
import type { TrustedPdfSource, TrustedSourceResolver } from './types.ts';

export type LocalFixtureRegistry = Record<
  string,
  { sourceVersion: number; absolutePath: string }
>;

/**
 * Build a resolver that only serves entries registered by the operator/test harness.
 * Keys are opaque sourceIds (never filesystem paths).
 */
export function createLocalFixtureResolver(
  registry: LocalFixtureRegistry,
): TrustedSourceResolver {
  return async (req) => {
    const entry = registry[req.sourceId];
    if (!entry) return null;
    if (entry.sourceVersion !== req.sourceVersion) return null;
    try {
      const buf = await readFile(entry.absolutePath);
      const source: TrustedPdfSource = {
        sourceId: req.sourceId,
        sourceVersion: req.sourceVersion,
        bytes: new Uint8Array(buf),
      };
      return source;
    } catch {
      return null;
    }
  };
}
