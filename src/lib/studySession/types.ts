/** Board-scoped study session memory (localStorage). */

export interface StudySessionSourceState {
  /** 1-based PDF page */
  page: number;
}

export interface StudySessionWorkState {
  /** Last focused block in math notebook */
  lastBlockId: string | null;
  lastCaretOffset: number | null;
}

export interface StudySessionRecord {
  sourceObjectId: string;
  workObjectId: string;
  source: StudySessionSourceState;
  work: StudySessionWorkState;
  enteredAt: number;
  lastActiveAt: number;
  lastExitedAt: number | null;
}

export interface StudySessionBoardStore {
  version: 1;
  sessions: Record<string, StudySessionRecord>;
}
