/** When true, notebook content uses internal section/page schema + dual-read/write. */
export function isNotebookV1PagesEnabled(): boolean {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  const raw = env?.VITE_NOTEBOOK_V1_PAGES;
  return raw === 'true' || raw === '1';
}
