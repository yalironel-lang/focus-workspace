/**
 * @vitest-environment node
 * Diagnostics record decision codes only. They must not change the answer.
 */

import { describe, expect, it } from 'vitest';
import { applyClaimLevelGrounding } from './evaluateGroundingProvenance.ts';
import {
  createGroundingCorrelationId,
  formatGroundingDecisionLog,
  isGroundingDecisionDiagnosticsEnabled,
  readGroundingDecisionDiagnosticsEnabled,
  type GroundingDecisionDiagnosticSink,
} from './groundingDecisionDiagnostics.ts';

const STAGING_URL = 'https://lmgrhmyurhjlwwdedojk.supabase.co';
const PRODUCTION_URL = 'https://comxmviofnotfwzbupxg.supabase.co';
const QUESTION = 'According to the PDF, what is the cyclical part of real GDP?';
const FORMULA = 'The cyclical part of real GDP is: Real GDP − Trend real GDP.';
const SOURCE = 'The cyclical part of real GDP is real GDP less trend real GDP.';
const ISOLATION_TOKEN = 'zzisolation9f3a';
const CONTEXT = { hasIndexedChunks: true, hasPdfCapture: false } as const;

function sink(): { diagnostics: GroundingDecisionDiagnosticSink; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    diagnostics: {
      correlationId: '0123456789ab',
      emit(line: string) {
        lines.push(line);
      },
    },
  };
}

function judge(
  answerText: string,
  chunkText: string,
  diagnostics?: GroundingDecisionDiagnosticSink,
  question = QUESTION,
) {
  return applyClaimLevelGrounding({
    question,
    answerText,
    chunks: [{ citationIndex: 1, text: chunkText }],
    captureText: '',
    contextAvailable: CONTEXT,
    ...(diagnostics ? { diagnostics } : {}),
  });
}

describe('grounding decision diagnostics', () => {
  it('stays off unless the flag is 1 and the host is staging', () => {
    expect(isGroundingDecisionDiagnosticsEnabled({ flag: undefined, supabaseUrl: STAGING_URL })).toBe(false);
    expect(isGroundingDecisionDiagnosticsEnabled({ flag: 'true', supabaseUrl: STAGING_URL })).toBe(false);
    expect(isGroundingDecisionDiagnosticsEnabled({ flag: '1', supabaseUrl: undefined })).toBe(false);
    expect(isGroundingDecisionDiagnosticsEnabled({ flag: '1', supabaseUrl: PRODUCTION_URL })).toBe(false);
    expect(
      isGroundingDecisionDiagnosticsEnabled({
        flag: '1',
        supabaseUrl: `${STAGING_URL}?ref=comxmviofnotfwzbupxg`,
      }),
    ).toBe(false);
    expect(
      isGroundingDecisionDiagnosticsEnabled({
        flag: '1',
        supabaseUrl: 'https://lmgrhmyurhjlwwdedojk.supabase.co.evil.example',
      }),
    ).toBe(false);
    expect(isGroundingDecisionDiagnosticsEnabled({ flag: '1', supabaseUrl: STAGING_URL })).toBe(true);
    expect(readGroundingDecisionDiagnosticsEnabled()).toBe(false);
    expect(createGroundingCorrelationId()).toMatch(/^[a-f0-9]{12}$/);
  });

  it('does not change a supported formula, a rejected claim, a cause, or a wrong letter', () => {
    const chunk = `${SOURCE}\n${ISOLATION_TOKEN}`;
    const cases = [
      FORMULA,
      `${FORMULA} Nominal wages determine the contract.`,
      `${FORMULA.replace(/\.$/, '')} because wages are sticky.`,
      `${FORMULA} So the correct answer is (c).`,
    ];
    const choiceChunk = [
      'Question 1. What is the cyclical part of real GDP?',
      SOURCE,
      '(a) government spending',
      '(b) real GDP less trend real GDP',
      '(c) nominal GDP',
      ISOLATION_TOKEN,
    ].join('\n');
    const captured = sink();
    for (const answerText of cases) {
      const chunkText = answerText.includes('(c)') ? choiceChunk : chunk;
      const plain = judge(answerText, chunkText);
      const logged = judge(answerText, chunkText, captured.diagnostics);
      expect(logged).toEqual(plain);
    }
    const ordinaryPlain = judge('Saving adds to the capital stock.', 'Saving adds to the capital stock.', undefined, 'What is monetary policy?');
    const ordinaryLogged = judge(
      'Saving adds to the capital stock.',
      `Saving adds to the capital stock. ${ISOLATION_TOKEN}`,
      captured.diagnostics,
      'What is monetary policy?',
    );
    expect(ordinaryLogged.text).toBe(ordinaryPlain.text);
    expect(ordinaryLogged.knowledgeTier).toBe(ordinaryPlain.knowledgeTier);
  });

  it('records the rejection branch without the claim, source, or question', () => {
    const captured = sink();
    const chunk = `${SOURCE}\n${ISOLATION_TOKEN}`;
    const rejected = judge(`${FORMULA} Nominal wages determine the contract.`, chunk, captured.diagnostics);
    expect(rejected.knowledgeTier).toBe('mixed');
    expect(rejected.text).toContain(FORMULA);
    expect(rejected.text).toContain('The unsupported part cannot be established from the available source.');
    expect(rejected.text).not.toContain('Nominal wages');

    const decisions = captured.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const claims = decisions.filter((line) => line.event === 'ask_course_grounding_decision');
    const summary = decisions.find((line) => line.event === 'ask_course_grounding_summary');
    expect(claims.map((line) => line.decision)).toEqual(['equivalent', 'zero_overlap']);
    expect(claims.map((line) => line.disposition)).toEqual(['retained', 'removed']);
    expect(claims.map((line) => line.claimIndex)).toEqual([0, 1]);
    expect(claims.every((line) => line.claimCount === 2)).toBe(true);
    expect(claims.every((line) => line.knowledgeTier === 'mixed' && line.notice === 'rejected_part')).toBe(true);
    expect(summary).toMatchObject({
      event: 'ask_course_grounding_summary',
      correlationId: '0123456789ab',
      claimCount: 2,
      knowledgeTier: 'mixed',
      notice: 'rejected_part',
    });

    const causal = sink();
    const caused = judge(`${FORMULA.replace(/\.$/, '')} because wages are sticky.`, chunk, causal.diagnostics);
    expect(caused.text).not.toContain('sticky');
    expect(caused.knowledgeTier).toBe('mixed');
    const causalClaim = causal.lines.map((line) => JSON.parse(line) as { decision?: string; disposition?: string });
    expect(causalClaim[0]).toMatchObject({ decision: 'causal_split', disposition: 'rewritten' });

    const wrong = sink();
    const choiceChunk = [
      'Question 1. What is the cyclical part of real GDP?',
      SOURCE,
      '(a) government spending',
      '(b) real GDP less trend real GDP',
      '(c) nominal GDP',
    ].join('\n');
    const labeled = judge(`${FORMULA} So the correct answer is (c).`, choiceChunk, wrong.diagnostics);
    expect(labeled.text).not.toContain('(c)');
    expect(labeled.text).toContain('The named option does not match the available source.');
    const labelClaim = wrong.lines.map((line) => JSON.parse(line) as { decision?: string; notice?: string });
    expect(labelClaim[1]).toMatchObject({ decision: 'label_contradicted', notice: 'contradicted_option' });

    const blob = captured.lines.join('\n');
    expect(blob).not.toContain(ISOLATION_TOKEN);
    expect(blob).not.toContain('Nominal');
    expect(blob).not.toContain('cyclical');
    expect(blob).not.toContain(QUESTION);
    for (const line of decisions) {
      expect(Object.keys(line).sort()).toEqual(
        line.event === 'ask_course_grounding_summary'
          ? ['claimCount', 'correlationId', 'event', 'knowledgeTier', 'notice']
          : [
              'claimCount',
              'claimIndex',
              'correlationId',
              'decision',
              'disposition',
              'event',
              'knowledgeTier',
              'notice',
              'relation',
            ],
      );
    }
  });

  it('keeps the answer when diagnostic formatting or logging fails', () => {
    const plain = judge(FORMULA, SOURCE);
    const invalid: GroundingDecisionDiagnosticSink = {
      correlationId: 'not-a-safe-id',
      emit() {
        throw new Error('sink should not be reached with an invalid id');
      },
    };
    expect(judge(FORMULA, SOURCE, invalid)).toEqual(plain);

    const exploding: GroundingDecisionDiagnosticSink = {
      correlationId: '0123456789ab',
      emit() {
        throw new Error('log sink failed');
      },
    };
    expect(judge(`${FORMULA} Nominal wages determine the contract.`, SOURCE, exploding)).toEqual(
      judge(`${FORMULA} Nominal wages determine the contract.`, SOURCE),
    );
    expect(() =>
      formatGroundingDecisionLog({
        correlationId: 'short',
        claimCount: 1,
        knowledgeTier: 'mixed',
        notice: 'rejected_part',
        trace: {
          claimIndex: 0,
          relation: 'none',
          decision: 'zero_overlap',
          disposition: 'removed',
        },
      }),
    ).toThrow(/correlation id/);
  });
});
