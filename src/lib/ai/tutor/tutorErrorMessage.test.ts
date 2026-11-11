import { describe, expect, it } from 'vitest';
import {
  formatStudentTutorErrorMessage,
  isTechnicalLeak,
  isTutorRetryAllowed,
} from './tutorErrorMessage';

describe('formatStudentTutorErrorMessage', () => {
  it('formats emergency killswitch as scheduled maintenance without account ban implication', () => {
    const msg = formatStudentTutorErrorMessage('ai_disabled', 'AI emergency killswitch is active.');
    expect(msg).toContain('temporarily unavailable for scheduled maintenance');
    expect(msg).toContain('consult your course materials directly');
    expect(msg).not.toContain('banned');
    expect(msg).not.toContain('disabled for this account');
    expect(msg).not.toContain('killswitch');
  });

  it('formats daily request limit with midnight UTC reset and next step', () => {
    const msg = formatStudentTutorErrorMessage(
      'quota_exceeded',
      'AI daily request capacity reached for this project. Please try again tomorrow.',
    );
    expect(msg).toContain('Daily question limit reached');
    expect(msg).toContain('midnight UTC');
    expect(msg).toContain('continue reading your course materials');
    expect(msg).not.toContain('project');
  });

  it('formats daily token limit as reading capacity with midnight UTC reset', () => {
    const msg = formatStudentTutorErrorMessage(
      'quota_exceeded',
      'AI daily token capacity reached for this project. Please try again tomorrow.',
    );
    expect(msg).toContain('Daily reading capacity reached for this course');
    expect(msg).toContain('midnight UTC');
    expect(msg).toContain('reviewing your notes and documents directly');
    expect(msg).not.toContain('token');
    expect(msg).not.toContain('project');
  });

  it('sanitizes internal SQL and RPC errors', () => {
    const rawSql = 'relation "ai_project_usage_counters" does not exist; function zikuk_spend_guard_rpc() failed';
    expect(isTechnicalLeak(rawSql)).toBe(true);
    const msg = formatStudentTutorErrorMessage('internal_error', rawSql);
    expect(msg).not.toContain('relation');
    expect(msg).not.toContain('ai_project_usage_counters');
    expect(msg).not.toContain('rpc');
    expect(msg).toBe(
      'Something went wrong while generating an answer. Please try again or consult your course materials directly.',
    );
  });

  it('disallows retry for quota_exceeded, ai_disabled, output_budget_exhausted', () => {
    expect(isTutorRetryAllowed('quota_exceeded')).toBe(false);
    expect(isTutorRetryAllowed('ai_disabled')).toBe(false);
    expect(isTutorRetryAllowed('output_budget_exhausted')).toBe(false);
    expect(isTutorRetryAllowed('provider_timeout')).toBe(true);
    expect(isTutorRetryAllowed('rate_limited')).toBe(true);
  });
});
