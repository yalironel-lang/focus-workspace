/**
 * @vitest-environment node
 * G2.23 leaks closed in G2.24. A quoted clause or a selected sentence
 * does not carry an unsupported claim.
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_EXPLANATION_NOTICE,
  applyClaimLevelGrounding,
} from './evaluateGroundingProvenance.ts';

const QUOTATION = 'Consideration requires a bargained-for exchange.';
const APPENDED = 'sticky wages explain the remaining adjustment';

function judge(input: {
  question: string;
  answerText: string;
  chunk?: string;
  capture?: string;
}) {
  return applyClaimLevelGrounding({
    question: input.question,
    answerText: input.answerText,
    chunks: input.chunk ? [{ citationIndex: 1, text: input.chunk }] : [],
    captureText: input.capture ?? '',
    contextAvailable: {
      hasIndexedChunks: Boolean(input.chunk),
      hasPdfCapture: Boolean(input.capture),
    },
  });
}

describe('G2.23 attribution leaks closed', () => {
  it('withholds course material when a quoted sentence appends a new claim', () => {
    const answer = `${QUOTATION.replace(/\.$/, '')}, and ${APPENDED}.`;
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text.startsWith(answer)).toBe(true);
    expect(result.text).toContain(APPENDED);
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('withholds pdf selection when another sentence is not in the selected text', () => {
    const answer = `${QUOTATION} [PDF selection] Promissory estoppel supplies a substitute for consideration.`;
    const result = judge({
      question: 'What does this paragraph say about consideration?',
      answerText: answer,
      capture: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(QUOTATION);
    expect(result.text).toContain('[PDF selection]');
    expect(result.text).toContain('Promissory estoppel');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });
});
