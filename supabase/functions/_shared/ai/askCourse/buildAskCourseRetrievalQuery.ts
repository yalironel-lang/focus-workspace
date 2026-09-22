/**
 * M0.9C1 / M0.9C2.2 — deterministic contextual retrieval query for ask_course v2.
 *
 * CONVERSATION tells ZIKUK what we are talking about (prior USER questions only).
 * COURSE MATERIAL (retrieved later) tells ZIKUK what is true.
 *
 * Never includes prior assistant text in the embedding input.
 *
 * M0.9C2.2: referential follow-ups lead with prior topical user question so
 * short anaphora ("Why?", "explain that more simply") still retrieve the topic.
 * Explicit standalone topics keep current-question dominance (no context hijack).
 */

import type { AskCourseRecentTurn } from '../requestTypes.ts';
import { ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS } from './bounds.ts';
import { shouldLeadRetrievalWithPriorUserContext } from './isReferentialAskCourseFollowUp.ts';

function packPriorUserLines(priorUsers: AskCourseRecentTurn[]): string[] {
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
  return linesNewestFirst.reverse();
}

function boundPriorBlock(priorLines: string[]): string {
  let priorBlock = priorLines.join('\n');
  if (priorBlock.length > ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS) {
    priorBlock = priorBlock.slice(0, ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS).trimEnd();
  }
  return priorBlock;
}

export function buildAskCourseRetrievalQuery(input: {
  question: string;
  recentTurns?: AskCourseRecentTurn[];
}): string {
  const question = input.question.trim();
  const priorUsers = (input.recentTurns ?? []).filter((t) => t.role === 'user');
  const priorLines = packPriorUserLines(priorUsers);

  if (priorLines.length === 0) {
    return `CURRENT QUESTION:\n${question}`;
  }

  const priorBlock = boundPriorBlock(priorLines);

  if (
    shouldLeadRetrievalWithPriorUserContext({
      question,
      hasPriorUserContext: true,
    })
  ) {
    // Prior topic first — short referential follow-ups need topical vocabulary in the embedding.
    return (
      `Previous question:\n${priorBlock}\n\n` +
      `Follow-up:\n${question}`
    );
  }

  // Non-referential / explicit new topic: current question remains dominant.
  return (
    `CURRENT QUESTION:\n${question}\n\n` +
    `RECENT USER CONTEXT:\n${priorBlock}`
  );
}
