/**
 * WC-6A2 — Structured Student Work / Question Navigation.
 * Pure parser & helpers for recognized question sections in student notebooks.
 *
 * Grammar:
 * - Level-2 markdown headings: `## ...`
 * - Recognized patterns:
 *   - `Question N`
 *   - `QuestionN`
 *   - `QN`
 *   - `Q N`
 *   (case-insensitive, optional trailing description e.g. `## Question 5: Derivatives`)
 */

import {
  parseExamQuestionsFromBody,
  type ExamQuestionSection,
  type ExamQuestionBlockRef,
  findOwningQuestionNumber,
  findSectionBlockIdForQuestionNumber,
} from '../studySession/parseExamQuestions';

export type DerivedQuestionSection = ExamQuestionSection;

export const parseNotebookQuestionSections = parseExamQuestionsFromBody;

export {
  findOwningQuestionNumber,
  findSectionBlockIdForQuestionNumber,
  type ExamQuestionBlockRef,
};
