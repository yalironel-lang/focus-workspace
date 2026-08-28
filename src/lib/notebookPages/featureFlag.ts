/** When true, notebook content uses internal section/page schema + dual-read/write. */
export function isNotebookV1PagesEnabled(): boolean {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  const raw = env?.VITE_NOTEBOOK_V1_PAGES;
  if (raw === 'false' || raw === '0') return false;
  // B2: default on — legacy notebooks migrate idempotently on hydrate.
  return true;
}
