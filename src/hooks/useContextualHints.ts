/**
 * useContextualHints — progressive disclosure teaching system.
 *
 * Shows one contextual hint at a time based on user state.
 * Each hint appears once, is permanently dismissed per device (localStorage).
 *
 * Design principle:
 *   Teach through context, not tutorials.
 *   Never interrupt — hints are non-blocking, one-at-a-time, easily dismissed.
 *
 * Adding a new hint:
 *   1. Add its ID to HintId
 *   2. Add an entry to HINTS with message + condition
 *   3. That's it.
 */

import { useState, useCallback, useMemo } from 'react';

// ── Hint definitions ──────────────────────────────────────────────────────────

export type HintId =
  | 'cmd-k'            // teach the keyboard shortcut after first item added
  | 'edit-layout'      // teach design mode after a few sessions
  | 'start-focus'      // nudge toward starting a focus session
  | 'quick-capture'    // surface the capture module if not on canvas
  | 'workspaces';      // suggest creating a workspace

export interface Hint {
  id:       HintId;
  message:  string;
  /** Optional inline action label — calls onAction() when clicked */
  action?:  string;
}

// Hint copy — outcome-focused, not system-focused
const HINT_COPY: Record<HintId, { message: string; action?: string }> = {
  'cmd-k': {
    message: 'Press ⌘K anytime to add a note, timer, checklist, or anything else.',
    action:  'Try it →',
  },
  'edit-layout': {
    message: 'You can rearrange everything here. Tap Edit in the top bar to reorder cards.',
  },
  'start-focus': {
    message: 'Your Focus Mode is set up. Start a session to track deep work time.',
    action:  'Start session →',
  },
  'quick-capture': {
    message: 'Thoughts disappear fast. Add Quick Capture to dump them instantly.',
    action:  'Add it →',
  },
  'workspaces': {
    message: 'Create a workspace for each course or project to track progress.',
    action:  'Create one →',
  },
};

// ── Context shape (passed in from Dashboard) ──────────────────────────────────

export interface HintContext {
  hasContent:        boolean;
  designMode:        boolean;
  blocksCount:       number;
  enabledModuleIds:  string[];
  sectionsCount:     number;   // number of created workspaces
  sessionCount:      number;   // from useDailyLoop
}

// ── Conditions: when should each hint appear? ─────────────────────────────────
// First matching unseen hint is shown.

type HintCondition = (ctx: HintContext) => boolean;

const HINT_CONDITIONS: Record<HintId, HintCondition> = {
  // After first thing is added to canvas and user has more than 1 session
  'cmd-k': ctx =>
    ctx.hasContent && ctx.sessionCount >= 2 && ctx.blocksCount >= 1,

  // After a few sessions — surface design mode discoverability
  'edit-layout': ctx =>
    ctx.hasContent && ctx.sessionCount >= 3 && !ctx.designMode,

  // Focus mode is on canvas but user hasn't started a session recently
  'start-focus': ctx =>
    ctx.enabledModuleIds.includes('focus-mode') && ctx.sessionCount >= 2,

  // User has content but hasn't added Quick Capture
  'quick-capture': ctx =>
    ctx.hasContent &&
    ctx.sessionCount >= 4 &&
    !ctx.enabledModuleIds.includes('capture'),

  // User has been around for a while but no workspaces
  'workspaces': ctx =>
    ctx.hasContent &&
    ctx.sessionCount >= 3 &&
    ctx.sectionsCount === 0,
};

// Ordered by priority — first matching wins
const HINT_ORDER: HintId[] = [
  'cmd-k',
  'start-focus',
  'quick-capture',
  'workspaces',
  'edit-layout',
];

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fw_hints_v1';

function loadDismissed(): Set<HintId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set<HintId>(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function persist(dismissed: Set<HintId>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface ContextualHintsAPI {
  activeHint:   (Hint & { id: HintId }) | null;
  dismissHint:  (id: HintId) => void;
  /** Call this when the hint's action is triggered */
  triggerAction: (id: HintId) => void;
}

export function useContextualHints(
  ctx:          HintContext,
  onCmdK:       () => void,
  onAddCapture: () => void,
): ContextualHintsAPI {
  const [dismissed, setDismissed] = useState<Set<HintId>>(loadDismissed);

  const dismissHint = useCallback((id: HintId) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const triggerAction = useCallback((id: HintId) => {
    if (id === 'cmd-k')        onCmdK();
    if (id === 'quick-capture') onAddCapture();
    dismissHint(id);
  }, [dismissHint, onCmdK, onAddCapture]);

  const activeHint = useMemo((): (Hint & { id: HintId }) | null => {
    for (const id of HINT_ORDER) {
      if (dismissed.has(id)) continue;
      if (!HINT_CONDITIONS[id](ctx)) continue;
      return { id, ...HINT_COPY[id] };
    }
    return null;
  }, [ctx, dismissed]);

  return { activeHint, dismissHint, triggerAction };
}
