import { useState, useCallback } from 'react';

export interface WorkspaceCustomization {
  icon:         string;
  accent:       string;
  cover:        'minimal' | 'focus' | 'urgent' | '';
  density:      'compact' | 'comfortable' | 'spacious' | '';
  laneOrder:    string[];   // group IDs in preferred display order; [] = natural DB order
  hiddenLanes:  string[];   // group IDs hidden in normal view
}

export const ACCENT_PRESETS: { key: string; label: string; color: string }[] = [
  { key: 'amber',   label: 'Amber',   color: '#f59e0b' },
  { key: 'emerald', label: 'Emerald', color: '#10b981' },
  { key: 'violet',  label: 'Violet',  color: '#8b5cf6' },
  { key: 'blue',    label: 'Blue',    color: '#3b82f6' },
  { key: 'rose',    label: 'Rose',    color: '#f43f5e' },
  { key: 'slate',   label: 'Slate',   color: '#64748b' },
];

const STORAGE_KEY = 'focus_workspace_customization';

const DEFAULT: WorkspaceCustomization = {
  icon: '', accent: '', cover: '',
  density: '', laneOrder: [], hiddenLanes: [],
};

function readAll(): Record<string, WorkspaceCustomization> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, WorkspaceCustomization>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage quota — silently ignore */ }
}

/** Merge stored (partial) data with DEFAULT so old records without new fields work fine. */
function hydrate(raw: Partial<WorkspaceCustomization>): WorkspaceCustomization {
  return {
    icon:         raw.icon         ?? DEFAULT.icon,
    accent:       raw.accent       ?? DEFAULT.accent,
    cover:        raw.cover        ?? DEFAULT.cover,
    density:      raw.density      ?? DEFAULT.density,
    laneOrder:    raw.laneOrder    ?? DEFAULT.laneOrder,
    hiddenLanes:  raw.hiddenLanes  ?? DEFAULT.hiddenLanes,
  };
}

export function useWorkspaceCustomization(sectionId: string) {
  const [customization, setCustomizationState] = useState<WorkspaceCustomization>(() => {
    if (!sectionId) return DEFAULT;
    return hydrate(readAll()[sectionId] ?? {});
  });

  const setCustomization = useCallback((next: WorkspaceCustomization) => {
    setCustomizationState(next);
    if (!sectionId) return;
    const all = readAll();
    all[sectionId] = next;
    writeAll(all);
  }, [sectionId]);

  return { customization, setCustomization };
}

/** Read-only helper for components that only need to display the customization
 *  (e.g. SectionCard on the dashboard) without subscribing to changes. */
export function getWorkspaceCustomization(sectionId: string): WorkspaceCustomization {
  return hydrate(readAll()[sectionId] ?? {});
}
