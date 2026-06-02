export function formatPageLabel(page: number, pageCount?: number): string {
  const p = Math.max(1, page);
  if (pageCount && pageCount > 0) return `Page ${p} / ${pageCount}`;
  return `Page ${p}`;
}

export function formatLastStudied(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Last studied just now';
  if (min < 60) return `Last studied ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Last studied ${hr}h ago`;
  const days = Math.floor(hr / 24);
  return days === 1 ? 'Last studied yesterday' : `Last studied ${days}d ago`;
}
