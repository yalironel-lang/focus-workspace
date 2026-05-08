import { useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModuleSize = 'third' | 'half' | 'two-thirds' | 'full';

export interface ModuleConfig {
  id: string;
  enabled: boolean;
  size: ModuleSize;
  order: number;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  modules: ModuleConfig[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_MODULES: ModuleConfig[] = [
  { id: 'daily-intention', enabled: true,  size: 'full',       order: 0  },
  { id: 'capture',         enabled: true,  size: 'two-thirds', order: 1  },
  { id: 'momentum',        enabled: true,  size: 'third',      order: 2  },
  { id: 'focus-mode',      enabled: true,  size: 'half',       order: 3  },
  { id: 'execute',         enabled: true,  size: 'half',       order: 4  },
  { id: 'focus-queue',     enabled: true,  size: 'full',       order: 5  },
  { id: 'today',           enabled: true,  size: 'full',       order: 6  },
  { id: 'workspaces',      enabled: true,  size: 'full',       order: 7  },
  { id: 'deep-work-timer', enabled: false, size: 'third',      order: 8  },
  { id: 'tools',           enabled: true,  size: 'full',       order: 9  },
];

export const PRESETS: WorkspacePreset[] = [
  {
    id: 'adaptive',
    name: 'Adaptive',
    emoji: '⚡',
    description: 'Balanced overview of everything',
    modules: DEFAULT_MODULES,
  },
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    emoji: '🎯',
    description: 'Minimal. Just your objective and timer.',
    modules: [
      { id: 'daily-intention', enabled: true,  size: 'full', order: 0 },
      { id: 'focus-mode',      enabled: true,  size: 'full', order: 1 },
      { id: 'deep-work-timer', enabled: true,  size: 'half', order: 2 },
      { id: 'focus-queue',     enabled: true,  size: 'half', order: 3 },
      { id: 'capture',         enabled: false, size: 'two-thirds', order: 4 },
      { id: 'momentum',        enabled: false, size: 'third',      order: 5 },
      { id: 'execute',         enabled: false, size: 'half',       order: 6 },
      { id: 'today',           enabled: false, size: 'full',       order: 7 },
      { id: 'workspaces',      enabled: false, size: 'full',       order: 8 },
      { id: 'tools',           enabled: false, size: 'full',       order: 9 },
    ],
  },
  {
    id: 'brain-dump',
    name: 'Brain Dump',
    emoji: '🌊',
    description: 'Chaotic capture mode. Everything flows in.',
    modules: [
      { id: 'capture',         enabled: true,  size: 'full', order: 0 },
      { id: 'today',           enabled: true,  size: 'full', order: 1 },
      { id: 'daily-intention', enabled: true,  size: 'full', order: 2 },
      { id: 'workspaces',      enabled: true,  size: 'full', order: 3 },
      { id: 'focus-mode',      enabled: false, size: 'half', order: 4 },
      { id: 'momentum',        enabled: false, size: 'third', order: 5 },
      { id: 'execute',         enabled: false, size: 'half', order: 6 },
      { id: 'focus-queue',     enabled: false, size: 'full', order: 7 },
      { id: 'deep-work-timer', enabled: false, size: 'third', order: 8 },
      { id: 'tools',           enabled: true,  size: 'full', order: 9 },
    ],
  },
  {
    id: 'student',
    name: 'Student',
    emoji: '📚',
    description: 'Courses, deadlines, and exam pressure.',
    modules: [
      { id: 'today',           enabled: true,  size: 'full', order: 0 },
      { id: 'focus-queue',     enabled: true,  size: 'full', order: 1 },
      { id: 'momentum',        enabled: true,  size: 'third', order: 2 },
      { id: 'focus-mode',      enabled: true,  size: 'two-thirds', order: 3 },
      { id: 'workspaces',      enabled: true,  size: 'full', order: 4 },
      { id: 'capture',         enabled: true,  size: 'half', order: 5 },
      { id: 'execute',         enabled: true,  size: 'half', order: 6 },
      { id: 'daily-intention', enabled: false, size: 'full', order: 7 },
      { id: 'deep-work-timer', enabled: false, size: 'third', order: 8 },
      { id: 'tools',           enabled: true,  size: 'full', order: 9 },
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    emoji: '○',
    description: 'One thing. Right now.',
    modules: [
      { id: 'focus-mode',      enabled: true,  size: 'full', order: 0 },
      { id: 'capture',         enabled: true,  size: 'full', order: 1 },
      { id: 'workspaces',      enabled: true,  size: 'full', order: 2 },
      { id: 'daily-intention', enabled: false, size: 'full', order: 3 },
      { id: 'today',           enabled: false, size: 'full', order: 4 },
      { id: 'focus-queue',     enabled: false, size: 'full', order: 5 },
      { id: 'momentum',        enabled: false, size: 'third', order: 6 },
      { id: 'execute',         enabled: false, size: 'half', order: 7 },
      { id: 'deep-work-timer', enabled: false, size: 'third', order: 8 },
      { id: 'tools',           enabled: false, size: 'full', order: 9 },
    ],
  },
];

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fw_workspace_layout_v3';

function load(): ModuleConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_MODULES];
    const parsed: ModuleConfig[] = JSON.parse(raw);
    // Merge in any new modules added since last save
    const ids = new Set(parsed.map(m => m.id));
    const merged = [...parsed];
    for (const def of DEFAULT_MODULES) {
      if (!ids.has(def.id)) merged.push({ ...def, order: merged.length });
    }
    return merged;
  } catch {
    return [...DEFAULT_MODULES];
  }
}

function persist(modules: ModuleConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkspaceLayout() {
  const [modules, setModules] = useState<ModuleConfig[]>(load);

  const mutate = useCallback((next: ModuleConfig[]) => {
    setModules(next);
    persist(next);
  }, []);

  const toggleModule = useCallback((id: string) => {
    setModules(prev => {
      const next = prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m);
      persist(next);
      return next;
    });
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    setModules(prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const fi = arr.findIndex(m => m.id === fromId);
      const ti = arr.findIndex(m => m.id === toId);
      if (fi === -1 || ti === -1 || fi === ti) return prev;
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      const next = arr.map((m, i) => ({ ...m, order: i }));
      persist(next);
      return next;
    });
  }, []);

  const setSize = useCallback((id: string, size: ModuleSize) => {
    setModules(prev => {
      const next = prev.map(m => m.id === id ? { ...m, size } : m);
      persist(next);
      return next;
    });
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = PRESETS.find(p => p.id === presetId);
    if (preset) mutate([...preset.modules]);
  }, [mutate]);

  const reset = useCallback(() => mutate([...DEFAULT_MODULES]), [mutate]);

  const ordered = [...modules].sort((a, b) => a.order - b.order);

  return { modules: ordered, toggleModule, reorder, setSize, applyPreset, reset, presets: PRESETS };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Map ModuleSize to a CSS grid-column span string */
export const SIZE_SPAN: Record<ModuleSize, string> = {
  third:       'span 4',
  half:        'span 6',
  'two-thirds':'span 8',
  full:        'span 12',
};

export const SIZE_LABEL: Record<ModuleSize, string> = {
  third:       '1/3',
  half:        '1/2',
  'two-thirds':'2/3',
  full:        'Full',
};
