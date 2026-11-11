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

import type { AskCourseRecentTurn, PdfCaptureAttachment } from '../requestTypes.ts';
import { isVisualSelectionCapture } from '../requestTypes.ts';
import { PDF_VISUAL_SELECTION_MARKER } from '../visualCapture/visualSelectionContract.ts';
import { ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS } from './bounds.ts';
import { isExplicitSourceOnlyQuestion } from './evaluateGroundingProvenance.ts';
import {
  isExplicitStandaloneAskCourseQuestion,
  isReferentialAskCourseFollowUp,
  shouldLeadRetrievalWithPriorUserContext,
} from './isReferentialAskCourseFollowUp.ts';

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
  capture?: PdfCaptureAttachment;
}): string {
  const question = input.question.trim();

  // Attached PDF selection handling (SKE1.2):
  // Prevent query pollution for standalone questions while preserving context for referential queries.
  if (input.capture) {
    if (isVisualSelectionCapture(input.capture)) {
      // No OCR text — avoid embedding image bytes; light marker only for referential continuity.
      return `CURRENT QUESTION:\n${question}\n\nATTACHED SELECTION CONTEXT:\n${PDF_VISUAL_SELECTION_MARKER}`;
    }
    const rawCapture = input.capture.text.trim();
    const boundedCapture = rawCapture.length > 500 ? rawCapture.slice(0, 500).trimEnd() : rawCapture;

    const isStandalone = isExplicitStandaloneAskCourseQuestion(question);
    const isReferential = isReferentialAskCourseFollowUp(question);
    const sourceOnly = isExplicitSourceOnlyQuestion(question);

    if (isStandalone && !isReferential && !sourceOnly) {
      const qWords = new Set(question.toLowerCase().split(/\W+/).filter(w => w.length >= 4));
      const cWords = new Set(rawCapture.toLowerCase().split(/\W+/).filter(w => w.length >= 4));
      let overlap = 0;
      for (const w of qWords) {
        if (cWords.has(w)) overlap++;
      }
      if (overlap === 0) {
        // Disjoint standalone question: question only to prevent vector pollution
        return `CURRENT QUESTION:\n${question}`;
      }
      return `CURRENT QUESTION:\n${question}\n\nATTACHED SELECTION CONTEXT:\n${boundedCapture}`;
    }

    if (
      sourceOnly ||
      isReferential ||
      /\b(this|the|selected|above|here|paragraph|quote|excerpt)\b/i.test(question)
    ) {
      return `PDF SELECTION:\n${boundedCapture}\n\nQUESTION:\n${question}`;
    }

    return `CURRENT QUESTION:\n${question}\n\nATTACHED SELECTION CONTEXT:\n${boundedCapture}`;
  }
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
