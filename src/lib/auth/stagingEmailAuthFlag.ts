/**
 * Staging-only magic-link compile/runtime gate.
 *
 * Vite replaces `import.meta.env.VITE_*` at build time. Production builds must
 * leave `VITE_STAGING_EMAIL_AUTH` unset (or any value other than exactly "true")
 * so the staging email UI is excluded.
 *
 * Read on each call (not a module-level constant) so Vitest can stub the env
 * deterministically without depending on a developer's `.env.local`.
 */
export function isStagingEmailAuthEnabled(): boolean {
  return import.meta.env.VITE_STAGING_EMAIL_AUTH === 'true';
}
