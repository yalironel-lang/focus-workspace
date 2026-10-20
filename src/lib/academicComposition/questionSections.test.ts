import { describe, it, expect } from 'vitest';
import { parseNotebookQuestionSections } from './questionSections';

describe('WC-6A2 parseNotebookQuestionSections Parser Tests', () => {
  // A. ## Question 1 parses
  it('A. parses standard ## Question 1 format', () => {
    const res = parseNotebookQuestionSections('## Question 1\nSome text');
    expect(res).toEqual([{ number: 1, label: 'Question 1' }]);
  });

  // B. ## Question1 parses
  it('B. parses ## Question1 without space', () => {
    const res = parseNotebookQuestionSections('## Question1\nSome text');
    expect(res).toEqual([{ number: 1, label: 'Question 1' }]);
  });

  // C. ## Q3 parses
  it('C. parses ## Q3 short form', () => {
    const res = parseNotebookQuestionSections('## Q3\nWork here');
    expect(res).toEqual([{ number: 3, label: 'Question 3' }]);
  });

  // D. case-insensitive
  it('D. handles case-insensitivity (## question 2, ## q 4)', () => {
    const res = parseNotebookQuestionSections('## question 2\n## q 4');
    expect(res).toEqual([
      { number: 2, label: 'Question 2' },
      { number: 4, label: 'Question 4' },
    ]);
  });

  // E. trailing descriptive text
  it('E. handles trailing descriptive text (## Question 5: Derivatives)', () => {
    const res = parseNotebookQuestionSections('## Question 5: Derivatives and Integrals');
    expect(res).toEqual([{ number: 5, label: 'Question 5' }]);
  });

  // F. H1 ignored
  it('F. ignores H1 headings (# Question 1)', () => {
    const res = parseNotebookQuestionSections('# Question 1\n## Question 2');
    expect(res).toEqual([{ number: 2, label: 'Question 2' }]);
  });

  // G. H3 ignored
  it('G. ignores H3 headings (### Question 1)', () => {
    const res = parseNotebookQuestionSections('### Question 1\n## Question 2');
    expect(res).toEqual([{ number: 2, label: 'Question 2' }]);
  });

  // H. plain "Question 1" ignored
  it('H. ignores plain text Question 1 without heading prefix', () => {
    const res = parseNotebookQuestionSections('Question 1\n## Question 2');
    expect(res).toEqual([{ number: 2, label: 'Question 2' }]);
  });

  // I. Problem 1 ignored
  it('I. ignores Problem 1', () => {
    const res = parseNotebookQuestionSections('## Problem 1\n## Question 2');
    expect(res).toEqual([{ number: 2, label: 'Question 2' }]);
  });

  // J. Exercise 1 ignored
  it('J. ignores Exercise 1', () => {
    const res = parseNotebookQuestionSections('## Exercise 1\n## Question 2');
    expect(res).toEqual([{ number: 2, label: 'Question 2' }]);
  });

  // K. malformed heading ignored
  it('K. ignores malformed heading', () => {
    const res = parseNotebookQuestionSections('## Question\n## Question abc\n## Question 1');
    expect(res).toEqual([{ number: 1, label: 'Question 1' }]);
  });

  // L. duplicate number deterministic
  it('L. handles duplicate question numbers deterministically without duplicate sections', () => {
    const res = parseNotebookQuestionSections('## Question 2\n## Question 2\n## Question 1');
    expect(res).toEqual([
      { number: 1, label: 'Question 1' },
      { number: 2, label: 'Question 2' },
    ]);
  });

  // M. ordering deterministic
  it('M. sorts sections in numerical ascending order regardless of document order', () => {
    const res = parseNotebookQuestionSections('## Question 10\n## Question 2\n## Question 1');
    expect(res).toEqual([
      { number: 1, label: 'Question 1' },
      { number: 2, label: 'Question 2' },
      { number: 10, label: 'Question 10' },
    ]);
  });

  // N. empty body
  it('N. handles empty or whitespace body safely', () => {
    expect(parseNotebookQuestionSections('')).toEqual([]);
    expect(parseNotebookQuestionSections('   \n\n  ')).toEqual([]);
  });

  // O. large body
  it('O. handles large document body with 50 questions efficiently', () => {
    const lines: string[] = [];
    for (let i = 50; i >= 1; i--) {
      lines.push(`## Question ${i}`);
      lines.push('Lorem ipsum dolor sit amet work content...\n');
    }
    const res = parseNotebookQuestionSections(lines.join('\n'));
    expect(res.length).toBe(50);
    expect(res[0]?.number).toBe(1);
    expect(res[49]?.number).toBe(50);
  });
});
