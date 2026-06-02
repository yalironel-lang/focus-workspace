/** When true, Study Session shell + memory are primary; legacy study layout dock stays dormant unless false. */
export function useStudySessionPrimary(): boolean {
  const raw = import.meta.env.VITE_STUDY_SESSION_PRIMARY;
  if (raw === 'false' || raw === '0') return false;
  return true;
}
