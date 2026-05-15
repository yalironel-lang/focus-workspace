import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'fw_workspace_library_recent_v1';
const MAX = 24;

export interface RecentEntry {
  sectionId: string;
  openedAt: string;
}

function read(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is RecentEntry => x && typeof x.sectionId === 'string' && typeof x.openedAt === 'string')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(entries: RecentEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function useRecentWorkspaces() {
  const [recent, setRecent] = useState<RecentEntry[]>(() => read());

  const touch = useCallback((sectionId: string) => {
    const now = new Date().toISOString();
    setRecent(prev => {
      const rest = prev.filter(e => e.sectionId !== sectionId);
      const next = [{ sectionId, openedAt: now }, ...rest].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const openedAt = useCallback(
    (sectionId: string): string | null => {
      const e = recent.find(r => r.sectionId === sectionId);
      return e?.openedAt ?? null;
    },
    [recent],
  );

  const recentIdsOrdered = useMemo(() => recent.map(r => r.sectionId), [recent]);

  const pruneToValidIds = useCallback((validIds: string[]) => {
    const valid = new Set(validIds);
    setRecent(prev => {
      const next = prev.filter(e => valid.has(e.sectionId));
      if (next.length === prev.length) return prev;
      write(next);
      return next;
    });
  }, []);

  const reloadFromStorage = useCallback(() => {
    setRecent(read());
  }, []);

  return { recent, recentIdsOrdered, touch, openedAt, pruneToValidIds, reloadFromStorage };
}
