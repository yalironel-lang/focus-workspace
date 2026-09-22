/**
 * M0.9C2 — derive bounded recentTurns for ask_course v2 from prior session turns.
 * Current question is NEVER included (caller passes it as `question`).
 * Backend re-sanitizes; client sends a clean bounded subset.
 */

import type { AskCourseRecentTurn } from '../gatewayClient';

export type AskSessionTurnLike = {
  question: string;
  answer: string;
};

/** Align with server ask_course v2 preferred shape. */
export const ASK_CLIENT_MAX_PRIOR_USER_TURNS = 2 as const;
export const ASK_CLIENT_MAX_PRIOR_ASSISTANT_TURNS = 1 as const;
export const ASK_CLIENT_MAX_PRIOR_USER_CHARS = 500 as const;
export const ASK_CLIENT_MAX_PRIOR_ASSISTANT_CHARS = 1200 as const;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd();
}

/**
 * Build recentTurns from completed turns only (oldest → newest input).
 * Prefers newest 2 user questions + newest 1 assistant answer.
 */
export function buildAskCourseRecentTurns(
  completedTurns: readonly AskSessionTurnLike[],
): AskCourseRecentTurn[] {
  if (!completedTurns.length) return [];

  const chronological: AskCourseRecentTurn[] = [];
  for (const t of completedTurns) {
    const q = t.question.trim();
    const a = t.answer.trim();
    if (q) chronological.push({ role: 'user', content: truncate(q, ASK_CLIENT_MAX_PRIOR_USER_CHARS) });
    if (a) {
      chronological.push({
        role: 'assistant',
        content: truncate(a, ASK_CLIENT_MAX_PRIOR_ASSISTANT_CHARS),
      });
    }
  }

  let userCount = 0;
  let assistantCount = 0;
  const pickedRev: AskCourseRecentTurn[] = [];
  for (let i = chronological.length - 1; i >= 0; i--) {
    const turn = chronological[i]!;
    if (turn.role === 'user') {
      if (userCount >= ASK_CLIENT_MAX_PRIOR_USER_TURNS) continue;
      userCount += 1;
    } else {
      if (assistantCount >= ASK_CLIENT_MAX_PRIOR_ASSISTANT_TURNS) continue;
      assistantCount += 1;
    }
    pickedRev.push(turn);
    if (pickedRev.length >= 3) break;
  }
  return pickedRev.reverse();
}
