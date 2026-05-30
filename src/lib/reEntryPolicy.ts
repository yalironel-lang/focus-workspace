/**
 * Re-entry restore policy — cognition-first tiers for resuming thinking.
 *
 * Automatic restore aggression decreases as time away increases.
 * See product audit: "Re-Entry Problem — Deep Cognitive Analysis".
 */

import type { FocusMode } from '../focusMode/focusModeTypes';
import type { WorkspaceContinuityMemory } from './workspaceContinuity';

/** Restore tier derived from elapsed time since last workspace save. */
export type ReEntryTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

/** Millisecond boundaries (inclusive lower tier = hotter). */
export const RE_ENTRY_T1_HOT_MS = 4 * 60 * 60 * 1000; // 4h
export const RE_ENTRY_T2_WARM_MS = 96 * 60 * 60 * 1000; // 96h — matches workspace continuity RECENT_HOURS
export const RE_ENTRY_T3_COOL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
export const RE_ENTRY_LENS_DECAY_MS = 7 * 24 * 60 * 60 * 1000; // 7d — cognitive lens cleared after

export interface ReEntryTierPolicy {
  tier: ReEntryTier;
  /** Restore last selected object on section open. */
  restoreSelection: boolean;
  /** Apply continuity viewport (may override board default when hotter). */
  restoreViewport: boolean;
  /** Emphasize connection cluster on canvas. */
  emphasizeCluster: boolean;
  /** Show WorkspaceResumeLayer (one primary continue cue). */
  showResumeLayer: boolean;
  /** Restore cognitive focus lens from continuity. */
  restoreFocusLens: boolean;
  /** Auto-enter notebook edit / portal focus (never on cold return). */
  restoreEditMode: boolean;
  /** Fit cluster viewport softly instead of exact pan/zoom. */
  softViewport: boolean;
}

export function tierFromElapsedMs(elapsedMs: number): ReEntryTier {
  if (elapsedMs < RE_ENTRY_T1_HOT_MS) return 'T1';
  if (elapsedMs < RE_ENTRY_T2_WARM_MS) return 'T2';
  if (elapsedMs < RE_ENTRY_T3_COOL_MS) return 'T3';
  return 'T4';
}

export function tierFromSavedAt(savedAt: number | null | undefined, now = Date.now()): ReEntryTier {
  if (!savedAt || !Number.isFinite(savedAt)) return 'T4';
  return tierFromElapsedMs(Math.max(0, now - savedAt));
}

/** T0 = structural only (always on); policy helpers start at T1. */
export function policyForTier(tier: ReEntryTier): ReEntryTierPolicy {
  switch (tier) {
    case 'T1':
      return {
        tier: 'T1',
        restoreSelection: true,
        restoreViewport: true,
        emphasizeCluster: true,
        showResumeLayer: true,
        restoreFocusLens: true,
        restoreEditMode: false,
        softViewport: false,
      };
    case 'T2':
      return {
        tier: 'T2',
        restoreSelection: true,
        restoreViewport: true,
        emphasizeCluster: true,
        showResumeLayer: true,
        restoreFocusLens: true,
        restoreEditMode: false,
        softViewport: true,
      };
    case 'T3':
      return {
        tier: 'T3',
        restoreSelection: false,
        restoreViewport: true,
        emphasizeCluster: true,
        showResumeLayer: true,
        restoreFocusLens: false,
        restoreEditMode: false,
        softViewport: true,
      };
    case 'T4':
    default:
      return {
        tier: 'T4',
        restoreSelection: false,
        restoreViewport: false,
        emphasizeCluster: false,
        showResumeLayer: false,
        restoreFocusLens: false,
        restoreEditMode: false,
        softViewport: true,
      };
  }
}

export function policyForContinuity(
  memory: WorkspaceContinuityMemory | null,
  now = Date.now(),
): ReEntryTierPolicy {
  if (!memory) return policyForTier('T4');
  return policyForTier(tierFromSavedAt(memory.savedAt, now));
}

/** Whether a persisted focus lens should be applied on re-entry. */
export function shouldRestoreFocusLens(
  memory: WorkspaceContinuityMemory | null,
  lens: FocusMode | null,
  now = Date.now(),
): lens is FocusMode {
  if (!lens || !memory?.activeFocusMode) return false;
  const policy = policyForContinuity(memory, now);
  if (!policy.restoreFocusLens) return false;
  return now - memory.savedAt < RE_ENTRY_LENS_DECAY_MS;
}

/** Human-readable staleness for resume copy (not visual styling). */
export function reEntryStalenessLabel(savedAt: number, now = Date.now()): string {
  const tier = tierFromSavedAt(savedAt, now);
  if (tier === 'T1') return 'continuing';
  if (tier === 'T2') return 'recent';
  if (tier === 'T3') return 'this week';
  return 'archived thread';
}
