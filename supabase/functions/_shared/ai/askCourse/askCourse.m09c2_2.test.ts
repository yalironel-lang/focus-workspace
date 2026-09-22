/**
 * M0.9C2.2 — referential follow-up detection + retrieval query hardening.
 */

import { describe, expect, it } from 'vitest';
import { buildAskCourseRetrievalQuery } from './buildAskCourseRetrievalQuery.ts';
import {
  isExplicitStandaloneAskCourseQuestion,
  isReferentialAskCourseFollowUp,
  shouldLeadRetrievalWithPriorUserContext,
} from './isReferentialAskCourseFollowUp.ts';

const VIOLET_Q =
  'What is the Violet Doctrine, and what must happen before the Silver Gate may be opened?';

describe('isReferentialAskCourseFollowUp', () => {
  it.each([
    'Why?',
    'How?',
    'What do you mean?',
    'What do you mean by that?',
    'Explain that.',
    'Can you explain that more simply?',
    'Can you give me an example?',
    'What about the second one?',
    "I don't understand the second step.",
  ])('detects referential: %s', q => {
    expect(isReferentialAskCourseFollowUp(q)).toBe(true);
  });

  it('does not treat explicit topical asks as referential', () => {
    expect(isReferentialAskCourseFollowUp('Explain the Code of Hammurabi.')).toBe(false);
    expect(isReferentialAskCourseFollowUp('What is natural law in English legal history?')).toBe(
      false,
    );
  });
});

describe('isExplicitStandaloneAskCourseQuestion', () => {
  it('recognizes clear topical standalone asks', () => {
    expect(isExplicitStandaloneAskCourseQuestion('Explain the Code of Hammurabi.')).toBe(true);
  });

  it('does not classify short referentials as standalone', () => {
    expect(isExplicitStandaloneAskCourseQuestion('Can you explain that more simply?')).toBe(false);
    expect(isExplicitStandaloneAskCourseQuestion('Why?')).toBe(false);
  });
});

describe('M0.9C2.2 referential retrieval query', () => {
  function prior(user: string) {
    return [
      { role: 'user' as const, content: user },
      { role: 'assistant' as const, content: 'Prior answer must not appear in embedding.' },
    ];
  }

  it('A. Violet referential: prior topic leads; follow-up intent present; no assistant', () => {
    const q = 'Can you explain that more simply?';
    const out = buildAskCourseRetrievalQuery({
      question: q,
      recentTurns: prior(VIOLET_Q),
    });
    expect(out.startsWith('Previous question:\n')).toBe(true);
    expect(out).toContain(VIOLET_Q);
    expect(out).toContain('Follow-up:\n');
    expect(out).toContain(q);
    expect(out.indexOf('Violet Doctrine')).toBeLessThan(out.indexOf('Follow-up:'));
    expect(out).not.toContain('must not appear');
    expect(out).not.toContain('CURRENT QUESTION:');
  });

  it('B. Why?', () => {
    const out = buildAskCourseRetrievalQuery({
      question: 'Why?',
      recentTurns: prior(VIOLET_Q),
    });
    expect(out).toContain('Previous question:');
    expect(out).toContain(VIOLET_Q);
    expect(out).toContain('Follow-up:\nWhy?');
  });

  it('C. What do you mean by that?', () => {
    const out = buildAskCourseRetrievalQuery({
      question: 'What do you mean by that?',
      recentTurns: prior(VIOLET_Q),
    });
    expect(shouldLeadRetrievalWithPriorUserContext({ question: 'What do you mean by that?', hasPriorUserContext: true })).toBe(true);
    expect(out.indexOf('Violet')).toBeLessThan(out.indexOf('Follow-up:'));
  });

  it('D. Can you give me an example?', () => {
    const out = buildAskCourseRetrievalQuery({
      question: 'Can you give me an example?',
      recentTurns: prior(VIOLET_Q),
    });
    expect(out.startsWith('Previous question:')).toBe(true);
    expect(out).toContain('example');
  });

  it("E. I don't understand the second step.", () => {
    const out = buildAskCourseRetrievalQuery({
      question: "I don't understand the second step.",
      recentTurns: prior(VIOLET_Q),
    });
    expect(out.startsWith('Previous question:')).toBe(true);
    expect(out).toContain('second step');
  });

  it('E2. I do not understand the second step. (expanded negation)', () => {
    const out = buildAskCourseRetrievalQuery({
      question: 'I do not understand the second step.',
      recentTurns: prior(VIOLET_Q),
    });
    expect(out.startsWith('Previous question:')).toBe(true);
  });

  it('F. explicit topic switch — current topic dominates (no Violet hijack)', () => {
    const q = 'Explain the Code of Hammurabi.';
    const out = buildAskCourseRetrievalQuery({
      question: q,
      recentTurns: prior('What is the Violet Doctrine?'),
    });
    expect(isExplicitStandaloneAskCourseQuestion(q)).toBe(true);
    expect(out.startsWith(`CURRENT QUESTION:\n${q}`)).toBe(true);
    expect(out.indexOf('Hammurabi')).toBeLessThan(out.indexOf('Violet'));
    expect(out).toContain('RECENT USER CONTEXT:');
  });

  it('G. standalone v2 with no history', () => {
    expect(
      buildAskCourseRetrievalQuery({
        question: 'What is the Violet Doctrine?',
        recentTurns: [],
      }),
    ).toBe('CURRENT QUESTION:\nWhat is the Violet Doctrine?');
  });

  it('H. non-referential with prior keeps current-first shape', () => {
    const q = 'What does my course material say about inflation?';
    const out = buildAskCourseRetrievalQuery({
      question: q,
      recentTurns: [{ role: 'user', content: "Explain Euler's theorem in detail please." }],
    });
    expect(out.startsWith('CURRENT QUESTION:')).toBe(true);
    expect(out.indexOf('inflation')).toBeLessThan(out.indexOf('Euler'));
  });
});
