/**
 * M7.7 — TipTap user-edit emission must bind body + pageKey to the SAME
 * hydrated editor generation. Never emit OLD_BODY + NEW_PAGE_KEY during
 * the prop-advanced / not-yet-hydrated transition window.
 */

export function canEmitUserEditForHydratedPage(input: {
  propPageKey: string;
  hydratedPageKey: string;
}): boolean {
  const prop = input.propPageKey.trim();
  const hydrated = input.hydratedPageKey.trim();
  if (!prop || !hydrated) return false;
  return prop === hydrated;
}
