// ── Module Metadata Registry ──────────────────────────────────────────────────
// Each module has a stable ID, display metadata, a user-facing category,
// and a visual weight hint used by the unified add-to-workspace panel.

export type ModuleCategory =
  | 'focus'     // rich, data-driven modules (large card treatment)
  | 'capture'   // quick-input surfaces
  | 'resources' // links, workspaces, portals

/** Visual card size inside the Add panel — NOT canvas size */
export type ModuleCardSize = 'large' | 'medium' | 'compact';

export interface ModuleMeta {
  id:          string;
  label:       string;
  description: string;   // short, factual
  tagline:     string;   // emotional one-liner shown on large cards
  icon:        string;   // emoji
  category:    ModuleCategory;
  cardSize:    ModuleCardSize;
  available:   boolean;
}

export const MODULE_REGISTRY: ModuleMeta[] = [

  // ── Focus Tools (large card, data-rich) ──────────────────────────────────
  {
    id:          'today',
    label:       'Today',
    description: 'Deadlines, classes, and daily pressure at a glance.',
    tagline:     'Know exactly what needs to happen today.',
    icon:        '📅',
    category:    'focus',
    cardSize:    'large',
    available:   true,
  },
  {
    id:          'focus-mode',
    label:       'Focus Mode',
    description: 'Your active session or the next thing worth doing.',
    tagline:     'Always know what you should be working on.',
    icon:        '🎯',
    category:    'focus',
    cardSize:    'large',
    available:   true,
  },
  {
    id:          'deep-work-timer',
    label:       'Deep Work Timer',
    description: 'Pomodoro-style focus intervals with visual countdown.',
    tagline:     'Protect uninterrupted time.',
    icon:        '⏱',
    category:    'focus',
    cardSize:    'large',
    available:   true,
  },
  {
    id:          'momentum',
    label:       'Momentum',
    description: 'Visual progress bars across all your workspaces.',
    tagline:     'See how much you\'re actually moving.',
    icon:        '◎',
    category:    'focus',
    cardSize:    'medium',
    available:   true,
  },
  {
    id:          'focus-queue',
    label:       'Focus Queue',
    description: 'Priority-ranked list of what to tackle next.',
    tagline:     'Never wonder what to work on next.',
    icon:        '↑',
    category:    'focus',
    cardSize:    'medium',
    available:   true,
  },
  {
    id:          'execute',
    label:       'Execute',
    description: 'Quick wins and actively in-progress workspaces.',
    tagline:     'Surface the things you can finish right now.',
    icon:        '▶',
    category:    'focus',
    cardSize:    'medium',
    available:   true,
  },

  // ── Capture ───────────────────────────────────────────────────────────────
  {
    id:          'capture',
    label:       'Quick Capture',
    description: 'One-tap input to dump a thought before it disappears.',
    tagline:     'Capture anything, instantly.',
    icon:        '⚡',
    category:    'capture',
    cardSize:    'medium',
    available:   true,
  },
  {
    id:          'daily-intention',
    label:       'Daily Intention',
    description: 'One sentence to set the tone for your entire day.',
    tagline:     'Begin with purpose.',
    icon:        '🌅',
    category:    'capture',
    cardSize:    'medium',
    available:   true,
  },

  // ── Resources ─────────────────────────────────────────────────────────────
  {
    id:          'workspaces',
    label:       'Workspaces',
    description: 'Grid overview of all your courses and projects.',
    tagline:     'Everything you\'re working on, at a glance.',
    icon:        '◻',
    category:    'resources',
    cardSize:    'medium',
    available:   true,
  },
  {
    id:          'tools',
    label:       'Tools',
    description: 'Quick-access portals and pinned links.',
    tagline:     'Your most-used sites, always one click away.',
    icon:        '⛓',
    category:    'resources',
    cardSize:    'medium',
    available:   true,
  },

];

export function getMeta(id: string): ModuleMeta | undefined {
  const baseId = id.replace(/-copy$/, '');
  return MODULE_REGISTRY.find(m => m.id === baseId);
}
