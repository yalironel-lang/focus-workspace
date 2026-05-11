import type { CommandItem } from './types';

/** Subsequence fuzzy match — lightweight, predictable. */
export function textMatchesQuery(query: string, haystack: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = haystack.toLowerCase();
  let ti = 0;
  for (let i = 0; i < q.length; i++) {
    const j = t.indexOf(q[i]!, ti);
    if (j === -1) return false;
    ti = j + 1;
  }
  return true;
}

function itemHaystack(item: CommandItem): string {
  return [item.label, item.subtitle, item.keywords?.join(' ')].filter(Boolean).join(' ');
}

export function filterAndSortCommands(query: string, items: CommandItem[]): CommandItem[] {
  const q = query.trim();
  if (!q) {
    return [...items].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }
  const matched = items.filter(it => !it.disabled && textMatchesQuery(q, itemHaystack(it)));
  return matched.sort((a, b) => {
    const la = a.label.toLowerCase();
    const lb = b.label.toLowerCase();
    const ql = q.toLowerCase();
    const aStarts = la.startsWith(ql) ? 0 : 1;
    const bStarts = lb.startsWith(ql) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    const pa = a.priority ?? 50;
    const pb = b.priority ?? 50;
    if (pa !== pb) return pa - pb;
    return a.label.localeCompare(b.label);
  });
}
