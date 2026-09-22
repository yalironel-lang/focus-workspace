/**
 * M0.9C2.2 — DEV-only Ask submit diagnostics (lengths/counts only; never content).
 */

export type AskCourseSubmitDiag = {
  event: 'ask_course_submit_diag';
  version: 2;
  requestGen: number;
  hasSectionId: boolean;
  priorSuccessfulTurnCount: number;
  recentTurnsCount: number;
  recentUserTurnCount: number;
  recentAssistantTurnCount: number;
  currentQuestionLength: number;
  recentTurnsTotalChars: number;
};

/** Safe metadata log — tree-shaken from production when DEV is false. */
export function logAskCourseSubmitDiag(diag: AskCourseSubmitDiag): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info('[ask_course_submit_diag]', diag);
}
