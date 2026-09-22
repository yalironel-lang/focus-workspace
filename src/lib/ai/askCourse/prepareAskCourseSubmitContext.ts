/**
 * M0.9C2.2 — single immutable snapshot for ask_course v2 submit context.
 * Guarantees: prior successful turns ⇒ non-empty recentTurns (never silent degrade).
 */

import type { AskCourseRecentTurn } from '../gatewayClient';
import {
  buildAskCourseRecentTurns,
  type AskSessionTurnLike,
} from './buildAskCourseRecentTurns';

export type AskCourseSubmitContext = {
  priorSuccessfulTurnCount: number;
  recentTurns: AskCourseRecentTurn[];
  recentTurnsCount: number;
  recentUserTurnCount: number;
  recentAssistantTurnCount: number;
  recentTurnsTotalChars: number;
};

export type PrepareAskCourseSubmitContextResult =
  | { ok: true; context: AskCourseSubmitContext }
  | {
      ok: false;
      reason: 'empty_recent_turns_with_prior';
      priorSuccessfulTurnCount: number;
    };

function summarize(recentTurns: AskCourseRecentTurn[]): Omit<
  AskCourseSubmitContext,
  'priorSuccessfulTurnCount' | 'recentTurns'
> {
  let recentUserTurnCount = 0;
  let recentAssistantTurnCount = 0;
  let recentTurnsTotalChars = 0;
  for (const t of recentTurns) {
    if (t.role === 'user') recentUserTurnCount += 1;
    else recentAssistantTurnCount += 1;
    recentTurnsTotalChars += t.content.length;
  }
  return {
    recentTurnsCount: recentTurns.length,
    recentUserTurnCount,
    recentAssistantTurnCount,
    recentTurnsTotalChars,
  };
}

/**
 * Capture submit context from a frozen prior-turns snapshot.
 * Current question is never included (caller sends it separately).
 */
export function prepareAskCourseSubmitContext(
  priorSuccessfulTurns: readonly AskSessionTurnLike[],
): PrepareAskCourseSubmitContextResult {
  // Immutable copy — callers must not mutate after this point for this submit.
  const snapshot = priorSuccessfulTurns.map(t => ({
    question: t.question,
    answer: t.answer,
  }));
  const priorSuccessfulTurnCount = snapshot.length;
  const recentTurns = buildAskCourseRecentTurns(snapshot);

  if (priorSuccessfulTurnCount > 0 && recentTurns.length === 0) {
    return {
      ok: false,
      reason: 'empty_recent_turns_with_prior',
      priorSuccessfulTurnCount,
    };
  }

  return {
    ok: true,
    context: {
      priorSuccessfulTurnCount,
      recentTurns,
      ...summarize(recentTurns),
    },
  };
}
