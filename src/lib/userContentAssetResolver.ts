/**
 * Resolver registry: pending job descriptor → local Blob bytes.
 * Feature stores register in later PRs; PR A ships the registry + fixture hook.
 */

import type { UserContentAssetDescriptor } from './userContentAssetDescriptor';

export type UserContentAssetResolver = (
  descriptor: UserContentAssetDescriptor,
) => Promise<Blob | null>;

const resolvers = new Map<string, UserContentAssetResolver>();

/** Register by `localRef.store` id. Replaces prior registration for same store. */
export function registerUserContentAssetResolver(
  store: string,
  resolver: UserContentAssetResolver,
): void {
  if (typeof store !== 'string' || store.length === 0 || store !== store.trim()) {
    throw new Error('invalid_store');
  }
  resolvers.set(store, resolver);
}

export function unregisterUserContentAssetResolver(store: string): void {
  resolvers.delete(store);
}

export function clearUserContentAssetResolversForTests(): void {
  resolvers.clear();
}

export async function resolveLocalUserContentAsset(
  descriptor: UserContentAssetDescriptor,
): Promise<Blob | null> {
  const resolver = resolvers.get(descriptor.localRef.store);
  if (!resolver) return null;
  return resolver(descriptor);
}
