import { describe, it, expect } from 'vitest';
import {
  buildTutorQuestionText,
  getDefaultModeQuestionText,
  isDefaultQuestionText,
} from './tutorPromptBuilder';

describe('tutorPromptBuilder', () => {
  it('generates clean default question text for all four modes without boilerplate', () => {
    const explainPrompt = buildTutorQuestionText('explain');
    expect(explainPrompt).toBe('Can you explain this concept step by step?');
    expect(explainPrompt).not.toContain('Focus: Page');
    expect(explainPrompt).not.toContain('captured text');

    const teachMePrompt = buildTutorQuestionText('teach_me');
    expect(teachMePrompt).toBe('Guide me through this step-by-step.');
    expect(teachMePrompt).not.toContain('do NOT give the full solution');

    const justAnswerPrompt = buildTutorQuestionText('just_answer');
    expect(justAnswerPrompt).toBe('What is the direct answer or solution to this?');

    const examPrepPrompt = buildTutorQuestionText('exam_prep');
    expect(examPrepPrompt).toBe('How is this concept tested on exams, and what common traps should I avoid?');
  });

  it('maps legacy actions (hint, solve) to clean mode questions', () => {
    expect(buildTutorQuestionText('hint')).toBe('Guide me through this step-by-step.');
    expect(buildTutorQuestionText('solve')).toBe('What is the direct answer or solution to this?');
  });

  it('accurately identifies default vs user-authored question text', () => {
    expect(isDefaultQuestionText('')).toBe(true);
    expect(isDefaultQuestionText('Can you explain this concept step by step?')).toBe(true);
    expect(isDefaultQuestionText('Guide me through this step-by-step.')).toBe(true);
    expect(isDefaultQuestionText('[Focus: Page 3] Legacy boilerplate...')).toBe(true);

    // User-authored questions:
    expect(isDefaultQuestionText('What does the constant C mean in this equation?')).toBe(false);
    expect(isDefaultQuestionText('Why is this function discontinuous at x = 0?')).toBe(false);
  });
});
