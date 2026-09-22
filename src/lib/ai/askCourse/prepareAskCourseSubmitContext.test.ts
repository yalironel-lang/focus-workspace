/**
 * M0.9C2.2 — prepareAskCourseSubmitContext invariant.
 */

import { describe, expect, it } from 'vitest';
import { prepareAskCourseSubmitContext } from './prepareAskCourseSubmitContext';

describe('prepareAskCourseSubmitContext', () => {
  it('returns empty recentTurns for first turn', () => {
    const r = prepareAskCourseSubmitContext([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.priorSuccessfulTurnCount).toBe(0);
    expect(r.context.recentTurns).toEqual([]);
    expect(r.context.recentTurnsCount).toBe(0);
  });

  it('builds non-empty recentTurns when prior turns exist', () => {
    const r = prepareAskCourseSubmitContext([
      {
        question:
          'What is the Violet Doctrine, and what must happen before the Silver Gate may be opened?',
        answer:
          'The Violet Doctrine requires exactly three witnesses before the Silver Gate may be opened.',
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.priorSuccessfulTurnCount).toBe(1);
    expect(r.context.recentTurnsCount).toBe(2);
    expect(r.context.recentUserTurnCount).toBe(1);
    expect(r.context.recentAssistantTurnCount).toBe(1);
    expect(r.context.recentTurns[0]).toEqual({
      role: 'user',
      content:
        'What is the Violet Doctrine, and what must happen before the Silver Gate may be opened?',
    });
  });

  it('fails closed when prior turns exist but recentTurns would be empty', () => {
    const r = prepareAskCourseSubmitContext([{ question: '   ', answer: '   ' }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('empty_recent_turns_with_prior');
    expect(r.priorSuccessfulTurnCount).toBe(1);
  });
});
