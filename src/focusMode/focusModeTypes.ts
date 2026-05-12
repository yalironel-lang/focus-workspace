/** Active cognitive presentation mode for Free Space (no timers, no gamification). */
export type FocusMode = 'review' | 'reading' | 'solving' | 'thinking';

export const FOCUS_MODES: readonly FocusMode[] = ['review', 'reading', 'solving', 'thinking'] as const;

export function isFocusMode(v: string | null | undefined): v is FocusMode {
  return v === 'review' || v === 'reading' || v === 'solving' || v === 'thinking';
}

export const FOCUS_MODE_LABEL: Record<FocusMode, string> = {
  review: 'Review',
  reading: 'Reading',
  solving: 'Solving',
  thinking: 'Thinking',
};

/** Short label for the top badge (premium / minimal). */
export const FOCUS_MODE_BADGE: Record<FocusMode, string> = {
  review: 'Review',
  reading: 'Reading',
  solving: 'Solving',
  thinking: 'Thinking',
};

export const FOCUS_PRESENTATION_TRANSITION = '0.38s cubic-bezier(0.4, 0, 0.2, 1)';
