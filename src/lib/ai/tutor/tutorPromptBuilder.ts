import type { TeachingMode } from '../gatewayClient/types';
import type { TutorCaptureAction } from './tutorCaptureTypes';

export function getDefaultModeQuestionText(mode: TeachingMode): string {
  switch (mode) {
    case 'teach_me':
      return 'Guide me through this step-by-step.';
    case 'just_answer':
      return 'What is the direct answer or solution to this?';
    case 'exam_prep':
      return 'How is this concept tested on exams, and what common traps should I avoid?';
    case 'explain':
    default:
      return 'Can you explain this concept step by step?';
  }
}

const DEFAULT_QUESTION_TEXTS = new Set([
  'Can you explain this concept step by step?',
  'Guide me through this step-by-step.',
  'What is the direct answer or solution to this?',
  'How is this concept tested on exams, and what common traps should I avoid?',
]);

export function isDefaultQuestionText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return DEFAULT_QUESTION_TEXTS.has(trimmed) || trimmed.startsWith('[Focus: Page');
}

/**
 * Clean question builder without page-focus or meta-retrieval boilerplate.
 */
export function buildTutorQuestionText(
  actionOrMode: TutorCaptureAction | TeachingMode,
  extractedText?: string,
  pageNumber?: number,
): string {
  void extractedText;
  void pageNumber;
  if (actionOrMode === 'hint' || actionOrMode === 'teach_me') {
    return getDefaultModeQuestionText('teach_me');
  }
  if (actionOrMode === 'solve' || actionOrMode === 'just_answer') {
    return getDefaultModeQuestionText('just_answer');
  }
  if (actionOrMode === 'exam_prep') {
    return getDefaultModeQuestionText('exam_prep');
  }
  return getDefaultModeQuestionText('explain');
}
