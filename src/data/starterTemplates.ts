/**
 * Starter templates — each one describes a full workspace configuration:
 * a set of module layouts (panels) + an array of pre-seeded custom blocks.
 *
 * Applied in Dashboard via applyTemplate(), which:
 *   1. calls applyLayoutPreset(template.id) to arrange system modules
 *   2. calls clearAllBlocks() then addBlockWithContent() for each templateBlock
 */

import type { ModuleConfig, ModuleSize } from '../hooks/useWorkspaceLayout';
import type { BlockType }                from '../hooks/useCustomBlocks';

export interface TemplateBlockSpec {
  type:  BlockType;
  size:  ModuleSize;
  prefill?: {
    body?:  string;
    emoji?: string;
    items?: string[]; // checklist items
    title?: string;   // link title
    url?:   string;   // link / image url
    author?: string;  // quote author
    style?: 'line' | 'dots' | 'gradient'; // divider style
  };
}

export interface StarterTemplate {
  id:          string;
  name:        string;
  emoji:       string;
  tagline:     string;
  description: string;
  /** ModuleConfig[] — replaces active module layout */
  modules:     ModuleConfig[];
  /** Custom blocks to seed on the canvas */
  blocks:      TemplateBlockSpec[];
}

// ─────────────────────────────────────────────────────────────────────────────

export const STARTER_TEMPLATES: StarterTemplate[] = [

  // ── Student Exam Setup ────────────────────────────────────────────────────
  {
    id:          'student-exam',
    name:        'Student Exam Setup',
    emoji:       '📚',
    tagline:     'Deadlines visible. Focus clear.',
    description: 'Pressure radar, focus queue, and study checklist — built for exam season.',
    modules: [
      { id: 'today',           enabled: true,  size: 'full',       order: 0 },
      { id: 'focus-queue',     enabled: true,  size: 'two-thirds', order: 1 },
      { id: 'momentum',        enabled: true,  size: 'third',      order: 2 },
      { id: 'focus-mode',      enabled: true,  size: 'half',       order: 3 },
      { id: 'deep-work-timer', enabled: true,  size: 'half',       order: 4 },
      { id: 'capture',         enabled: true,  size: 'full',       order: 5 },
      { id: 'daily-intention', enabled: false, size: 'full',       order: 6 },
      { id: 'execute',         enabled: false, size: 'half',       order: 7 },
      { id: 'workspaces',      enabled: true,  size: 'full',       order: 8 },
      { id: 'tools',           enabled: false, size: 'full',       order: 9 },
    ],
    blocks: [
      {
        type: 'checklist',
        size: 'half',
        prefill: {
          items: [
            'Review lecture notes',
            'Complete practice problems',
            'Make flashcard summary',
            'Past paper — timed',
          ],
        },
      },
      {
        type: 'text',
        size: 'half',
        prefill: {
          body: 'Exam notes — key concepts, formulas, things to remember…',
        },
      },
      {
        type: 'divider',
        size: 'full',
        prefill: { style: 'gradient' },
      },
    ],
  },

  // ── ADHD Quick Capture ────────────────────────────────────────────────────
  {
    id:          'adhd-capture',
    name:        'ADHD Quick Capture',
    emoji:       '⚡',
    tagline:     'Capture now, organise later.',
    description: 'Low-friction capture front and centre. Minimal distraction. Everything lands somewhere.',
    modules: [
      { id: 'capture',         enabled: true,  size: 'full', order: 0 },
      { id: 'focus-mode',      enabled: true,  size: 'full', order: 1 },
      { id: 'daily-intention', enabled: true,  size: 'full', order: 2 },
      { id: 'today',           enabled: false, size: 'full', order: 3 },
      { id: 'focus-queue',     enabled: false, size: 'full', order: 4 },
      { id: 'momentum',        enabled: false, size: 'third', order: 5 },
      { id: 'execute',         enabled: false, size: 'half', order: 6 },
      { id: 'deep-work-timer', enabled: false, size: 'third', order: 7 },
      { id: 'workspaces',      enabled: false, size: 'full', order: 8 },
      { id: 'tools',           enabled: false, size: 'full', order: 9 },
    ],
    blocks: [
      {
        type: 'checklist',
        size: 'two-thirds',
        prefill: {
          items: ['Quick win #1', 'Quick win #2', 'Quick win #3'],
        },
      },
      {
        type: 'note',
        size: 'third',
        prefill: { body: 'Brain dump — whatever is in your head right now…' },
      },
      {
        type: 'emoji',
        size: 'third',
        prefill: { emoji: '⚡' },
      },
    ],
  },

  // ── Deep Work Setup ───────────────────────────────────────────────────────
  {
    id:          'deep-work',
    name:        'Deep Work Setup',
    emoji:       '🎯',
    tagline:     'One thing. No noise.',
    description: 'Set your intention, start the timer, and disappear into the work.',
    modules: [
      { id: 'daily-intention', enabled: true,  size: 'full',  order: 0 },
      { id: 'focus-mode',      enabled: true,  size: 'half',  order: 1 },
      { id: 'deep-work-timer', enabled: true,  size: 'half',  order: 2 },
      { id: 'focus-queue',     enabled: true,  size: 'full',  order: 3 },
      { id: 'capture',         enabled: false, size: 'two-thirds', order: 4 },
      { id: 'momentum',        enabled: false, size: 'third', order: 5 },
      { id: 'today',           enabled: false, size: 'full',  order: 6 },
      { id: 'execute',         enabled: false, size: 'half',  order: 7 },
      { id: 'workspaces',      enabled: false, size: 'full',  order: 8 },
      { id: 'tools',           enabled: false, size: 'full',  order: 9 },
    ],
    blocks: [
      {
        type: 'text',
        size: 'full',
        prefill: { body: "Today's one thing I will finish:\n\n" },
      },
      {
        type: 'quote',
        size: 'two-thirds',
        prefill: {
          body: 'Clarity about what matters provides clarity about what does not.',
          author: 'Cal Newport',
        },
      },
      {
        type: 'emoji',
        size: 'third',
        prefill: { emoji: '🎯' },
      },
    ],
  },

  // ── Creative Moodboard ────────────────────────────────────────────────────
  {
    id:          'creative-moodboard',
    name:        'Creative Moodboard',
    emoji:       '✦',
    tagline:     'Ideas live here.',
    description: 'A free canvas for inspiration, references, and evolving ideas.',
    modules: [
      { id: 'capture',         enabled: true,  size: 'full',  order: 0 },
      { id: 'daily-intention', enabled: true,  size: 'half',  order: 1 },
      { id: 'tools',           enabled: true,  size: 'half',  order: 2 },
      { id: 'today',           enabled: false, size: 'full',  order: 3 },
      { id: 'focus-queue',     enabled: false, size: 'full',  order: 4 },
      { id: 'momentum',        enabled: false, size: 'third', order: 5 },
      { id: 'execute',         enabled: false, size: 'half',  order: 6 },
      { id: 'focus-mode',      enabled: false, size: 'half',  order: 7 },
      { id: 'deep-work-timer', enabled: false, size: 'third', order: 8 },
      { id: 'workspaces',      enabled: false, size: 'full',  order: 9 },
    ],
    blocks: [
      {
        type: 'quote',
        size: 'two-thirds',
        prefill: {
          body: 'An idea that is not dangerous is unworthy of being called an idea at all.',
          author: 'Oscar Wilde',
        },
      },
      {
        type: 'emoji',
        size: 'third',
        prefill: { emoji: '✦' },
      },
      {
        type: 'text',
        size: 'full',
        prefill: { body: 'Ideas & references:\n\n— \n— \n— ' },
      },
      {
        type: 'checklist',
        size: 'half',
        prefill: { items: ['Explore this direction', 'Collect references', 'Sketch concepts'] },
      },
      {
        type: 'note',
        size: 'half',
        prefill: { body: 'Raw thoughts, fragments, sparks…' },
      },
    ],
  },

  // ── Blank Canvas ─────────────────────────────────────────────────────────
  {
    id:          'blank-canvas',
    name:        'Blank Canvas',
    emoji:       '◻',
    tagline:     'Start from nothing.',
    description: 'Clean slate. All panels hidden. Add exactly what you need.',
    modules: [
      { id: 'daily-intention', enabled: false, size: 'full',       order: 0 },
      { id: 'capture',         enabled: false, size: 'two-thirds', order: 1 },
      { id: 'momentum',        enabled: false, size: 'third',      order: 2 },
      { id: 'focus-mode',      enabled: false, size: 'half',       order: 3 },
      { id: 'execute',         enabled: false, size: 'half',       order: 4 },
      { id: 'focus-queue',     enabled: false, size: 'full',       order: 5 },
      { id: 'today',           enabled: false, size: 'full',       order: 6 },
      { id: 'workspaces',      enabled: false, size: 'full',       order: 7 },
      { id: 'deep-work-timer', enabled: false, size: 'third',      order: 8 },
      { id: 'tools',           enabled: false, size: 'full',       order: 9 },
    ],
    blocks: [],
  },

];
