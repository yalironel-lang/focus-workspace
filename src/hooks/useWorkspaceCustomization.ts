import { useState, useCallback } from 'react';

export interface WorkspaceCustomization {
  icon:   string;                                        // emoji / text
  accent: string;                                        // preset hex or ''
  cover:  'minimal' | 'focus' | 'urgent' | '';          // card cover style
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

const DEFAULT: WorkspaceCustomization = { icon: '', accent: '', cover: '' };

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

export function useWorkspaceCustomization(sectionId: string) {
  const [customization, setCustomizationState] = useState<WorkspaceCustomization>(() => {
    if (!sectionId) return DEFAULT;
    return readAll()[sectionId] ?? DEFAULT;
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
  return readAll()[sectionId] ?? DEFAULT;
}
