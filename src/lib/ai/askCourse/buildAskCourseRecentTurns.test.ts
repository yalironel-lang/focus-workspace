/**
 * M0.9C2 — bounded recentTurns derivation (unit).
 */

import { describe, expect, it } from 'vitest';
import {
  ASK_CLIENT_MAX_PRIOR_ASSISTANT_CHARS,
  ASK_CLIENT_MAX_PRIOR_USER_CHARS,
  buildAskCourseRecentTurns,
} from './buildAskCourseRecentTurns';

describe('buildAskCourseRecentTurns', () => {
  it('returns empty for first turn', () => {
    expect(buildAskCourseRecentTurns([])).toEqual([]);
  });

  it('prefers newest 2 user + 1 assistant and excludes sources metadata', () => {
    const turns = [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3' },
      { question: 'Q4', answer: 'A4' },
    ];
    const recent = buildAskCourseRecentTurns(turns);
    expect(recent).toEqual([
      { role: 'user', content: 'Q3' },
      { role: 'user', content: 'Q4' },
      { role: 'assistant', content: 'A4' },
    ]);
    expect(recent.every(t => Object.keys(t).sort().join(',') === 'content,role')).toBe(true);
  });

  it('truncates user and assistant content to client bounds', () => {
    const user = 'U'.repeat(ASK_CLIENT_MAX_PRIOR_USER_CHARS + 40);
    const assistant = 'A'.repeat(ASK_CLIENT_MAX_PRIOR_ASSISTANT_CHARS + 40);
    const recent = buildAskCourseRecentTurns([{ question: user, answer: assistant }]);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.role).toBe('user');
    expect(recent[0]!.content.length).toBeLessThanOrEqual(ASK_CLIENT_MAX_PRIOR_USER_CHARS);
    expect(recent[1]!.role).toBe('assistant');
    expect(recent[1]!.content.length).toBeLessThanOrEqual(ASK_CLIENT_MAX_PRIOR_ASSISTANT_CHARS);
  });

  it('never includes more than 3 messages', () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({
      question: `Q${i + 1}`,
      answer: `A${i + 1}`,
    }));
    expect(buildAskCourseRecentTurns(turns).length).toBeLessThanOrEqual(3);
  });
});
