/**
 * M0.9C1 — deterministic contextual retrieval query for ask_course v2.
 *
 * CONVERSATION tells ZIKUK what we are talking about (prior USER questions only).
 * COURSE MATERIAL (retrieved later) tells ZIKUK what is true.
 *
 * Never includes prior assistant text in the embedding input.
 * Current question always dominates (first, full).
 */

import type { AskCourseRecentTurn } from '../requestTypes.ts';
import { ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS } from './bounds.ts';

export function buildAskCourseRetrievalQuery(input: {
  question: string;
  recentTurns?: AskCourseRecentTurn[];
}): string {
  const question = input.question.trim();
  const priorUsers = (input.recentTurns ?? []).filter((t) => t.role === 'user');

  // Newest preferred when packing the prior budget; emit chronological.
  let budget = ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS;
  const linesNewestFirst: string[] = [];
  for (let i = priorUsers.length - 1; i >= 0; i--) {
    if (budget <= 0) break;
    const raw = priorUsers[i]!.content.trim();
    if (!raw) continue;
    const text = raw.length > budget ? raw.slice(0, budget).trimEnd() : raw;
    if (!text) continue;
    linesNewestFirst.push(text);
    budget -= text.length;
  }
  const priorLines = linesNewestFirst.reverse();

  if (priorLines.length === 0) {
    return `CURRENT QUESTION:\n${question}`;
  }

  let priorBlock = priorLines.join('\n');
  if (priorBlock.length > ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS) {
    priorBlock = priorBlock.slice(0, ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS).trimEnd();
  }

  return (
    `CURRENT QUESTION:\n${question}\n\n` +
    `RECENT USER CONTEXT:\n${priorBlock}`
  );
}
