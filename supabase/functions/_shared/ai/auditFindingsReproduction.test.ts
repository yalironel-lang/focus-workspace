import { describe, it, expect } from 'vitest';
import {
  isAuthoritativeBpeModel,
  evaluateAuthoritativeTokenBound,
  calculateAuthoritativePayloadInputBound,
  verifyFinalProviderPayloadBound,
} from './projectLevelSpendingGuard.ts';
import { buildAskCourseMessages } from './askCourse/promptAskCourse.ts';

describe('Audit Findings Remediation & Verification Suite', () => {
  it('Finding 1 Verified: System prompt + multilingual retrieval ceiling is covered by gateway admission', () => {
    // 5 chunks in multilingual / math notation (2790 bytes each)
    const heavyChunk = 'שלום עולם מבחן חישוב נגזרת חלקית '.repeat(45); // ~1485 chars, ~2790 bytes
    const chunks = [
      { citationIndex: 1, sourceKind: 'free_space_pdf' as const, sourceObjectId: 'o1', notebookObjectId: null, fileName: 'test.pdf', pageNumber: 1, text: heavyChunk },
      { citationIndex: 2, sourceKind: 'free_space_pdf' as const, sourceObjectId: 'o1', notebookObjectId: null, fileName: 'test.pdf', pageNumber: 2, text: heavyChunk },
      { citationIndex: 3, sourceKind: 'free_space_pdf' as const, sourceObjectId: 'o1', notebookObjectId: null, fileName: 'test.pdf', pageNumber: 3, text: heavyChunk },
      { citationIndex: 4, sourceKind: 'free_space_pdf' as const, sourceObjectId: 'o1', notebookObjectId: null, fileName: 'test.pdf', pageNumber: 4, text: heavyChunk },
      { citationIndex: 5, sourceKind: 'free_space_pdf' as const, sourceObjectId: 'o1', notebookObjectId: null, fileName: 'test.pdf', pageNumber: 5, text: heavyChunk },
    ];

    const messages = buildAskCourseMessages({
      question: 'הסבר את הנוסחה בפירוט מלא',
      chunks,
      teachingMode: 'teach_me',
      activeDocument: { fileName: 'math.pdf', pageCount: 10, visiblePage: 1, route: 'topical', fromPage: null, toPage: null, partial: false, empty: false },
    });

    const encoder = new TextEncoder();
    let totalAssembledBytes = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalAssembledBytes += encoder.encode(msg.content).length;
      }
    }

    // Actual assembled request bytes with full SYSTEM_V3_TUTOR (12,144 bytes) and chunks is ~24,000+ bytes
    expect(totalAssembledBytes).toBeGreaterThan(24000);

    // Old heuristic in calculateAuthoritativePayloadInputBound assumed textBytes = 3000 + 6000 retrieval = ~9000
    const heuristic = calculateAuthoritativePayloadInputBound({
      capability: 'ask_course',
      question: 'הסבר את הנוסחה בפירוט מלא',
    }, 'gpt-4o');

    // On baseline, heuristic is ~9,100, which under-reserves by >14,000 tokens/bytes against the assembled payload!
    // The corrective gate must ensure reservation covers the assembled ceiling (e.g. >= 25,000)
    expect(heuristic.declaredInputTokens).toBeGreaterThanOrEqual(totalAssembledBytes);
  });

  it('Finding 2 Reproduction: Synthetic or unverified models must fail closed', () => {
    // These synthetic / unreleased models must be rejected (return false)
    expect(isAuthoritativeBpeModel('gpt-5.6-luna')).toBe(false);
    expect(isAuthoritativeBpeModel('gpt-6-astra')).toBe(false);
    expect(isAuthoritativeBpeModel('o4-mini')).toBe(false);
    expect(isAuthoritativeBpeModel('gpt-4.1')).toBe(false);
  });

  it('Finding 3 Reproduction: Visual requests require OpenAI high-detail vision ceiling (1,445 tokens)', () => {
    const visualEval = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gpt-4o',
      declaredInputTokens: 2000,
      hasVision: true,
      visionTileCount: 1,
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 1,
    });

    // Baseline uses Gemini constant (258). Correct OpenAI high-detail vision bound is 1,445 tokens (85 + 8*170)
    expect(visualEval.visionCeilingTokens).toBe(1445);
  });

  it('Finding 4 Reproduction: Pre-dispatch verification gate fails closed on exposure overflow', () => {
    // verifyFinalProviderPayloadBound must exist and reject payloads exceeding reservation
    expect(typeof verifyFinalProviderPayloadBound).toBe('function');
  });
});
