/** Last desk format selection-sync event (sessionStorage) for local debugging. */
export function recordDeskFormatSyncEvent(
  message: string,
  data: Record<string, unknown>,
): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const prev = sessionStorage.getItem('fw.deskFormat.sync.v1');
    const entry = { t: Date.now(), message, ...data };
    sessionStorage.setItem('fw.deskFormat.sync.v1', JSON.stringify(entry));
    if (prev) {
      sessionStorage.setItem('fw.deskFormat.sync.prev.v1', prev);
    }
  } catch {
    /* quota */
  }
}
