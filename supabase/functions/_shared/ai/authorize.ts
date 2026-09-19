/**
 * Authz helpers — authenticated uid is authoritative.
 * context.identity.userId is never used for authorization alone.
 */

export type AuthzResult =
  | { ok: true; authUserId: string }
  | { ok: false; code: 'unauthenticated' | 'auth_mismatch'; message: string };

/**
 * @param authUserId — from verified JWT / getUser(); null if missing/invalid
 * @param contextUserId — from M0.1 context metadata (not auth proof)
 */
export function authorizeGatewayUser(
  authUserId: string | null | undefined,
  contextUserId: string | null | undefined,
): AuthzResult {
  if (!authUserId || typeof authUserId !== 'string' || authUserId.trim() === '') {
    return {
      ok: false,
      code: 'unauthenticated',
      message: 'Sign in required to use ZIKUK AI.',
    };
  }
  const ctx = typeof contextUserId === 'string' ? contextUserId.trim() : '';
  if (ctx && ctx !== authUserId) {
    return {
      ok: false,
      code: 'auth_mismatch',
      message: 'Request identity does not match the signed-in user.',
    };
  }
  return { ok: true, authUserId };
}
