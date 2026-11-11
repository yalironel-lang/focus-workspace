import { describe, expect, it } from 'vitest';
import {
  messageForCaptureRecoveryFailure,
  messageForNativeCaptureMiss,
  normalizeRecoveryFailureCode,
} from './recoveryLookupMessages';

describe('recoveryLookupMessages', () => {
  it('maps query_failed to lookup_error internally', () => {
    expect(normalizeRecoveryFailureCode('query_failed')).toBe('lookup_error');
    expect(normalizeRecoveryFailureCode('source_not_found')).toBe('source_not_found');
  });

  it('does not embed identifiers in user-facing recovery messages', () => {
    const codes = [
      'unauthenticated',
      'invalid_request',
      'source_not_found',
      'page_not_found',
      'no_recovered_text',
      'query_failed',
    ] as const;
    for (const code of codes) {
      const msg = messageForCaptureRecoveryFailure({ code, pageTextKind: 'empty' });
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(msg.toLowerCase()).not.toContain('source_id');
      expect(msg.toLowerCase()).not.toContain('objectid');
    }
  });

  it('prefers region-miss copy when the page has useful native text elsewhere', () => {
    const msg = messageForNativeCaptureMiss({
      pageTextKind: 'useful',
      recoveryCode: 'no_recovered_text',
    });
    expect(msg).toContain('Selection did not intersect readable text');
  });

  it('uses recovery-specific copy when the page text layer is empty', () => {
    const msg = messageForNativeCaptureMiss({
      pageTextKind: 'empty',
      recoveryCode: 'source_not_found',
    });
    expect(msg).toContain('No recovered page text is indexed');
  });
});
