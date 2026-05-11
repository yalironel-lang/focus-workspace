import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'fw_workspace_library_folders_v1';

export interface WorkspaceFolder {
  id: string;
  name: string;
}

interface Persisted {
  folders: WorkspaceFolder[];
  /** sectionId → folderId; missing key = unfiled */
  assignments: Record<string, string>;
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { folders: [], assignments: {} };
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      folders: Array.isArray(p.folders) ? p.folders : [],
      assignments: p.assignments && typeof p.assignments === 'object' ? p.assignments : {},
    };
  } catch {
    return { folders: [], assignments: {} };
  }
}

function write(data: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

function uid() {
  return `fld_${Math.random().toString(36).slice(2, 11)}`;
}

export function useWorkspaceFolders() {
  const [state, setState] = useState<Persisted>(() => read());

  const persist = useCallback((next: Persisted) => {
    write(next);
    setState(next);
  }, []);

  const addFolder = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cur = read();
    persist({
      ...cur,
      folders: [...cur.folders, { id: uid(), name: trimmed }],
    });
  }, [persist]);

  const renameFolder = useCallback(
    (folderId: string, name: string) => {
      const cur = read();
      persist({
        ...cur,
        folders: cur.folders.map(f => (f.id === folderId ? { ...f, name: name.trim() || f.name } : f)),
      });
    },
    [persist],
  );

  const removeFolder = useCallback(
    (folderId: string) => {
      const cur = read();
      const assignments = { ...cur.assignments };
      for (const [sid, fid] of Object.entries(assignments)) {
        if (fid === folderId) delete assignments[sid];
      }
      persist({
        folders: cur.folders.filter(f => f.id !== folderId),
        assignments,
      });
    },
    [persist],
  );

  const setSectionFolder = useCallback(
    (sectionId: string, folderId: string | null) => {
      const cur = read();
      const assignments = { ...cur.assignments };
      if (folderId == null) delete assignments[sectionId];
      else assignments[sectionId] = folderId;
      persist({ ...cur, assignments });
    },
    [persist],
  );

  const getFolderForSection = useCallback(
    (sectionId: string): string | null => state.assignments[sectionId] ?? null,
    [state.assignments],
  );

  /** Preserve creation / user order (no auto-sort). */
  const foldersOrdered = useMemo(() => state.folders, [state.folders]);

  return {
    folders: foldersOrdered,
    assignments: state.assignments,
    addFolder,
    renameFolder,
    removeFolder,
    setSectionFolder,
    getFolderForSection,
  };
}
