const COACH_KEY = 'fw_composition_coach_v1';

export type CompositionCoachState = {
  version: 1;
  coachDismissed: boolean;
  successfulInsert: boolean;
  firstSeenAt: number | null;
};

function defaultState(): CompositionCoachState {
  return {
    version: 1,
    coachDismissed: false,
    successfulInsert: false,
    firstSeenAt: null,
  };
}

export function loadCompositionCoachState(): CompositionCoachState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(COACH_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<CompositionCoachState>;
    return {
      version: 1,
      coachDismissed: Boolean(parsed.coachDismissed),
      successfulInsert: Boolean(parsed.successfulInsert),
      firstSeenAt: typeof parsed.firstSeenAt === 'number' ? parsed.firstSeenAt : null,
    };
  } catch {
    return defaultState();
  }
}

export function saveCompositionCoachState(state: CompositionCoachState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(COACH_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

/** Permanent Math chip opacity: full for 30 days, then reduced (never hidden). */
export function mathChipOpacity(state: CompositionCoachState): number {
  const started = state.firstSeenAt ?? Date.now();
  const days = (Date.now() - started) / (1000 * 60 * 60 * 24);
  return days >= 30 ? 0.72 : 1;
}

export function ensureCoachFirstSeen(state: CompositionCoachState): CompositionCoachState {
  if (state.firstSeenAt != null) return state;
  return { ...state, firstSeenAt: Date.now() };
}
