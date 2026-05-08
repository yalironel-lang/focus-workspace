// ── Module Metadata Registry ──────────────────────────────────────────────────
// Each module has a stable ID, display metadata, and a default size hint.
// The ModuleRenderer maps IDs to actual React components.

export interface ModuleMeta {
  id: string;
  label: string;
  description: string;
  icon: string;       // emoji
  available: boolean; // false = "coming soon" tile in designer
}

export const MODULE_REGISTRY: ModuleMeta[] = [
  {
    id: 'daily-intention',
    label: 'Daily Intention',
    description: 'Set the tone. One sentence.',
    icon: '🌅',
    available: true,
  },
  {
    id: 'capture',
    label: 'Quick Capture',
    description: 'Brain dump anything, instantly.',
    icon: '⚡',
    available: true,
  },
  {
    id: 'momentum',
    label: 'Momentum Meter',
    description: 'Visual progress across all workspaces.',
    icon: '◎',
    available: true,
  },
  {
    id: 'focus-mode',
    label: 'Focus Mode',
    description: 'Active session or your next best move.',
    icon: '🎯',
    available: true,
  },
  {
    id: 'execute',
    label: 'Execute',
    description: 'Quick wins and in-progress workspaces.',
    icon: '▶',
    available: true,
  },
  {
    id: 'focus-queue',
    label: 'Focus Queue',
    description: 'Priority-ranked workspaces to work on.',
    icon: '↑',
    available: true,
  },
  {
    id: 'today',
    label: 'Today',
    description: 'Deadlines, classes, and daily focus.',
    icon: '📅',
    available: true,
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    description: 'All your courses and projects.',
    icon: '◻',
    available: true,
  },
  {
    id: 'deep-work-timer',
    label: 'Deep Work Timer',
    description: 'Pomodoro-style focus intervals.',
    icon: '⏱',
    available: true,
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Quick-access portals and links.',
    icon: '⛓',
    available: true,
  },
];

export function getMeta(id: string): ModuleMeta | undefined {
  // Strip duplicate suffix — 'capture-copy' resolves to 'capture'
  const baseId = id.replace(/-copy$/, '');
  return MODULE_REGISTRY.find(m => m.id === baseId);
}
