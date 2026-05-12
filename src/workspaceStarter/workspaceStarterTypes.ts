import type { FocusMode } from '../focusMode/focusModeTypes';

/** Cognitive starter layout — not a tutorial; instant desk setup. */
export type WorkspaceStarterId = 'exam-prep' | 'deep-reading' | 'problem-solving' | 'research-thinking';

export const WORKSPACE_STARTER_IDS: readonly WorkspaceStarterId[] = [
  'exam-prep',
  'deep-reading',
  'problem-solving',
  'research-thinking',
] as const;

export function isWorkspaceStarterId(v: string | null | undefined): v is WorkspaceStarterId {
  return (
    v === 'exam-prep' ||
    v === 'deep-reading' ||
    v === 'problem-solving' ||
    v === 'research-thinking'
  );
}

export const WORKSPACE_STARTER_LABEL: Record<WorkspaceStarterId, string> = {
  'exam-prep': 'Exam prep',
  'deep-reading': 'Deep reading',
  'problem-solving': 'Problem solving',
  'research-thinking': 'Research & thinking',
};

export const WORKSPACE_STARTER_TAGLINE: Record<WorkspaceStarterId, string> = {
  'exam-prep': 'Structured review and retention',
  'deep-reading': 'Documents beside your notes',
  'problem-solving': 'Scratchpad, tools, and slips nearby',
  'research-thinking': 'Ideas with room to connect',
};

/** Suggested Focus Mode after applying (presentation only). */
export const WORKSPACE_STARTER_FOCUS: Record<WorkspaceStarterId, FocusMode> = {
  'exam-prep': 'review',
  'deep-reading': 'reading',
  'problem-solving': 'solving',
  'research-thinking': 'thinking',
};

export function starterDismissStorageKey(sectionId: string): string {
  return `fw_section_${sectionId}_workspace_starter_dismissed_v1`;
}
