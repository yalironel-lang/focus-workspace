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
    label:       'Session',
    description: 'Your active session or the next workspace worth returning to.',
    tagline:     'Always know where to pick up.',
    icon:        '🎯',
    category:    'focus',
    cardSize:    'large',
    available:   true,
  },
  {
    id:          'deep-work-timer',
    label:       'Timer',
    description: 'Timed intervals with a visual ring. Work, then rest.',
    tagline:     'Protect uninterrupted time.',
    icon:        '⏱',
    category:    'focus',
    cardSize:    'large',
    available:   true,
  },
  {
    id:          'momentum',
    label:       'Progress',
    description: 'Visual progress across all your workspaces.',
    tagline:     'See how far you\'ve come.',
    icon:        '◎',
    category:    'focus',
    cardSize:    'medium',
    available:   true,
  },
  {
    id:          'focus-queue',
    label:       'What\'s Next',
    description: 'The workspaces that need attention, ranked by urgency.',
    tagline:     'Know what to work on next.',
    icon:        '↑',
    category:    'focus',
    cardSize:    'medium',
    available:   true,
  },
  {
    id:          'execute',
    label:       'In Progress',
    description: 'Workspaces you\'re actively moving through.',
    tagline:     'Things you can finish today.',
    icon:        '▶',
    category:    'focus',
    cardSize:    'medium',
    available:   true,
  },

  // ── Capture ───────────────────────────────────────────────────────────────
  {
    id:          'capture',
    label:       'Capture',
    description: 'Write it down before it disappears. Anything goes here.',
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
