/**
 * Starter templates — opinionated workspace configurations that feel alive on day one.
 *
 * Design principle:
 *   Templates should NOT feel like empty layouts waiting to be filled.
 *   They should feel like stepping into a functioning system.
 *
 *   Use realistic pre-filled content. Show how the space should work.
 *   Create emotional momentum immediately — the user should feel organized
 *   before they've entered a single piece of their own data.
 *
 * Applied via handleApplyTemplate() in Dashboard:
 *   1. applyModules(template.modules)
 *   2. clearAllBlocks()
 *   3. addBlockWithContent() for each block spec (staggered)
 */

import type { ModuleConfig } from '../hooks/useWorkspaceLayout';
import type { BlockType }    from '../hooks/useCustomBlocks';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateBlockSpec {
  type:  BlockType;
  size:  ModuleConfig['size'];
  prefill?: {
    body?:   string;
    emoji?:  string;
    items?:  string[];
    title?:  string;
    url?:    string;
    author?: string;
    style?:  'line' | 'dots' | 'gradient';
  };
}

export interface StarterTemplate {
  id:          string;
  name:        string;
  emoji:       string;
  tagline:     string;
  description: string;
  modules:     ModuleConfig[];
  blocks:      TemplateBlockSpec[];
}

// ─────────────────────────────────────────────────────────────────────────────

export const STARTER_TEMPLATES: StarterTemplate[] = [

  // ── Student Exam Setup ────────────────────────────────────────────────────
  // Designed to feel like exam season is under control.
  // Key psychology: creates pressure awareness + actionable structure.
  {
    id:          'student-exam',
    name:        'Student Workspace',
    emoji:       '📚',
    tagline:     'Deadlines visible. Focus clear.',
    description: 'Built for exam season — pressure radar, focus queue, study checklist, and momentum tracking all in one place.',
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
      // Study session checklist — feels ready to use immediately
      {
        type: 'checklist',
        size: 'half',
        prefill: {
          items: [
            'Review lecture notes from this week',
            'Complete practice problems (timed)',
            'Summarise key formulas on one page',
            'Past exam — full timed attempt',
            'Compare answers + identify gaps',
          ],
        },
      },
      // Study notes — feels like you already know what to write
      {
        type: 'note',
        size: 'half',
        prefill: {
          body: 'Key concepts to nail before the exam:\n\n→ \n→ \n→ \n\nThings still unclear:\n\n→ ',
        },
      },
      // Motivational quote — Cal Newport is fitting for students
      {
        type: 'quote',
        size: 'two-thirds',
        prefill: {
          body:   'Clarity about what matters provides clarity about what does not.',
          author: 'Cal Newport',
        },
      },
      // Visual anchor
      {
        type:    'emoji',
        size:    'third',
        prefill: { emoji: '📚', size: 'xl' } as TemplateBlockSpec['prefill'],
      },
    ],
  },

  // ── Deep Work Setup ───────────────────────────────────────────────────────
  // Designed for single-session, distraction-free execution.
  // Key psychology: sets intention first, creates ritual, reduces decision fatigue.
  {
    id:          'deep-work',
    name:        'Deep Work Setup',
    emoji:       '🎯',
    tagline:     'One thing. No noise.',
    description: 'Set your intention, start the timer, and disappear into the work.',
    modules: [
      { id: 'daily-intention', enabled: true,  size: 'full',       order: 0 },
      { id: 'focus-mode',      enabled: true,  size: 'half',       order: 1 },
      { id: 'deep-work-timer', enabled: true,  size: 'half',       order: 2 },
      { id: 'focus-queue',     enabled: true,  size: 'full',       order: 3 },
      { id: 'capture',         enabled: true,  size: 'two-thirds', order: 4 },
      { id: 'momentum',        enabled: true,  size: 'third',      order: 5 },
      { id: 'today',           enabled: false, size: 'full',       order: 6 },
      { id: 'execute',         enabled: false, size: 'half',       order: 7 },
      { id: 'workspaces',      enabled: false, size: 'full',       order: 8 },
      { id: 'tools',           enabled: false, size: 'full',       order: 9 },
    ],
    blocks: [
      // Pre-written intention prompt — lowers activation energy
      {
        type: 'text',
        size: 'full',
        prefill: {
          body: 'Before I start: the single most important thing I will finish today is —\n\n\n\nIf I only do one thing, it\'s this.',
        },
      },
      // Execution checklist — realistic deep work session structure
      {
        type: 'checklist',
        size: 'two-thirds',
        prefill: {
          items: [
            'Phone in another room / DND on',
            'Close all unrelated browser tabs',
            'Set timer for 25 minutes',
            'Start — do not check anything else',
            'Short break (5 min) after block',
            'Reflect: what did I actually finish?',
          ],
        },
      },
      // Quote — feels like the session is pre-loaded with the right mindset
      {
        type: 'quote',
        size: 'third',
        prefill: {
          body:   'Do the hard thing first.',
          author: 'Brian Tracy',
        },
      },
    ],
  },

  // ── ADHD Quick Capture ────────────────────────────────────────────────────
  // Designed for low friction, high capture rate.
  // Key psychology: reduces the "where do I put this?" cognitive load.
  {
    id:          'adhd-capture',
    name:        'Quick Capture Hub',
    emoji:       '⚡',
    tagline:     'Capture now, organise later.',
    description: 'Low-friction capture front and centre. Everything lands somewhere. Minimal cognitive overhead.',
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
      // Three quick wins — immediately actionable
      {
        type: 'checklist',
        size: 'two-thirds',
        prefill: {
          items: [
            'One small thing I can finish in 10 minutes',
            'One thing I\'ve been avoiding',
            'One thing that will feel good to cross off',
          ],
        },
      },
      // Brain dump note — explicitly invites the messy first draft
      {
        type: 'note',
        size: 'third',
        prefill: {
          body: 'Brain dump — everything in your head right now. No editing.\n\n',
        },
      },
      // Visual anchor — energetic, signals urgency without anxiety
      {
        type:    'emoji',
        size:    'third',
        prefill: { emoji: '⚡' } as TemplateBlockSpec['prefill'],
      },
    ],
  },

  // ── Creative Moodboard ────────────────────────────────────────────────────
  {
    id:          'creative-moodboard',
    name:        'Creative Space',
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
          body:   'An idea that is not dangerous is unworthy of being called an idea at all.',
          author: 'Oscar Wilde',
        },
      },
      {
        type:    'emoji',
        size:    'third',
        prefill: { emoji: '✦' } as TemplateBlockSpec['prefill'],
      },
      {
        type: 'text',
        size: 'full',
        prefill: {
          body: 'Current directions I\'m exploring:\n\n→ \n→ \n→ \n\nReferences to look at:\n\n→ ',
        },
      },
      {
        type: 'checklist',
        size: 'half',
        prefill: {
          items: [
            'Collect 5 references that excite me',
            'Write one paragraph about the core idea',
            'Identify what I\'m reacting against',
            'Define the emotion I want this to produce',
          ],
        },
      },
      {
        type: 'note',
        size: 'half',
        prefill: {
          body: 'Raw sparks — fragments, half-thoughts, associations:\n\n',
        },
      },
    ],
  },

  // ── Blank Canvas ─────────────────────────────────────────────────────────
  {
    id:          'blank-canvas',
    name:        'Blank Canvas',
    emoji:       '◻',
    tagline:     'Start from nothing.',
    description: 'Clean slate. All panels hidden. Build exactly what you need.',
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
