/**
 * M1.1F — historical enrollment default-ON + kill-switch semantics.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCourseKnowledgeHistoricalEnrollEnabled,
  setCourseKnowledgeHistoricalEnrollLocalStorageForTests,
} from './historicalEnrollmentFlag';

describe('isCourseKnowledgeHistoricalEnrollEnabled', () => {
  afterEach(() => {
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests(null);
    vi.unstubAllEnvs();
  });

  it('defaults ON when env unset', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', '');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests(null);
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(true);
  });

  it('env true enables', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', 'true');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(true);
  });

  it('env false is emergency kill switch even if localStorage on', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', 'false');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests('1');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(false);
  });

  it('env 0 is emergency kill switch', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', '0');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests('1');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(false);
  });

  it('localStorage 0 disables when env unset (session kill)', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', '');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests('0');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(false);
  });

  it('localStorage 1 enables when env unset (redundant with default)', () => {
    vi.stubEnv('VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL', '');
    setCourseKnowledgeHistoricalEnrollLocalStorageForTests('1');
    expect(isCourseKnowledgeHistoricalEnrollEnabled()).toBe(true);
  });
});
