/**
 * @vitest-environment node
 * Quotation equivalence and a local timing comparison for the production
 * grounding path. Timings are not a Supabase CPU-time measurement.
 */
import { describe, expect, it } from 'vitest';
import {
  answerQuotesSource,
  applyClaimLevelGrounding,
  contextAvailableForGrounding,
  evaluateGroundingProvenance,
  SOURCE_ONLY_INTERPRETATION_NOTICE,
} from './evaluateGroundingProvenance.ts';

const QUESTION =
  'Explain the Solow Growth Model step by step. Use clear headings, numbered steps, mathematical equations, and a short summary.';

function sentence(prefix: string, index: number): string {
  const words = Array.from({ length: 12 }, (_, word) => `${prefix}${index}w${word}`);
  return `${words.join(' ')}.`;
}

function longAnswer(sentences: number, extra = ''): string {
  const lines = ['**Growth model**', '', '### Step 1. Define the production function', ''];
  for (let i = 0; i < sentences; i++) lines.push(sentence('ans', i));
  lines.push('', '### Summary', '', sentence('sum', 0));
  if (extra) lines.push('', extra);
  return lines.join('\n');
}

function chunk(id: number, sentences = 40): string {
  return Array.from({ length: sentences }, (_, i) => sentence(`chunk${id}`, i)).join('\n');
}

const CAPTURE = 'pdfsel '.repeat(20).slice(0, 125);
const ANSWER = longAnswer(160);
const CHUNKS = [0, 1, 2, 3, 4].map((id) => chunk(id));

function productionPath(answer = ANSWER, chunks = CHUNKS, capture = CAPTURE) {
  const contextAvailable = contextAvailableForGrounding({
    indexedChunkTexts: chunks,
    captureText: capture,
  });
  return applyClaimLevelGrounding({
    question: QUESTION,
    answerText: answer,
    chunks: chunks.map((text, index) => ({ citationIndex: index + 1, text })),
    captureText: capture,
    contextAvailable,
  });
}

/** Previous phrase walk: every in-range phrase from each start word. */
function answerQuotesSourceLegacy(answerText: string, sourceText: string): boolean {
  const answerNorm = answerText.toLowerCase().replace(/\s+/g, ' ').trim();
  const sourceNorm = sourceText.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!answerNorm || !sourceNorm) return false;
  if (sourceNorm.length >= 8 && answerNorm.includes(sourceNorm)) return true;
  const words = sourceNorm.split(' ').filter((word) => word.length > 0);
  for (let start = 0; start < words.length; start++) {
    let phrase = '';
    for (let end = start; end < words.length; end++) {
      phrase = phrase ? `${phrase} ${words[end]}` : words[end]!;
      if (phrase.length > 160) break;
      if (phrase.length < 24) continue;
      if (!/\p{L}{4,}/u.test(phrase)) continue;
      if (answerNorm.includes(phrase)) return true;
    }
  }
  return false;
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe('quotation detection equivalence', () => {
  it('finds a mid-source phrase and ignores a shorter overlap', () => {
    const phrase = 'capital accumulation exceeds depreciation';
    expect(phrase.length).toBeGreaterThanOrEqual(24);
    expect(phrase.length).toBeLessThanOrEqual(160);
    const source = `intro words before the note ${phrase} and then unrelated trailer words`;
    const answer = `The steady state uses ${phrase} as its description.`;
    expect(answerQuotesSource(answer, source)).toBe(true);
    expect(answerQuotesSourceLegacy(answer, source)).toBe(true);
    expect(answer.includes('trailer')).toBe(false);

    const shortOverlap = 'short overlap only';
    expect(shortOverlap.length).toBeLessThan(24);
    expect(answerQuotesSource(`See ${shortOverlap} here.`, `notes say ${shortOverlap} today`)).toBe(false);
  });

  it('keeps a whole-source quotation and a PDF-selection tier', () => {
    const source = 'Saving adds to the capital stock.';
    expect(answerQuotesSource(`Preface. ${source} After.`, source)).toBe(true);

    const capture = CAPTURE;
    const pdfAnswer = `The selection says ${capture}`;
    const pdf = evaluateGroundingProvenance({
      question: QUESTION,
      answerText: pdfAnswer,
      indexedChunkTexts: ['unrelated chunk vocabulary stays separate here'],
      captureText: capture,
    });
    expect(pdf.tier).toBe('pdf_selection');
    expect(pdf.contextAvailable).toEqual({ hasIndexedChunks: true, hasPdfCapture: true });
  });

  it('derives context flags without a quotation scan', () => {
    const flags = contextAvailableForGrounding({
      indexedChunkTexts: ['  ', 'real chunk'],
      captureText: '   ',
    });
    const provenance = evaluateGroundingProvenance({
      question: QUESTION,
      answerText: 'A general explanation of growth.',
      indexedChunkTexts: ['  ', 'real chunk'],
      captureText: '   ',
    });
    expect(flags).toEqual(provenance.contextAvailable);
    expect(flags).toEqual({ hasIndexedChunks: true, hasPdfCapture: false });
  });

  it('keeps a long quoted answer and leaves a long non-quoting answer unchanged', () => {
    const quoted = 'capital accumulation exceeds depreciation';
    const quotingChunks = [quoted, ...CHUNKS.slice(1)];
    const quotingAnswer = longAnswer(40, `${quoted} [1]`);
    const quotedResult = productionPath(quotingAnswer, quotingChunks, '');
    expect(quotedResult.knowledgeTier).toBe('mixed');
    expect(quotedResult.text).toContain(quoted);
    expect(quotedResult.text).toContain('[1]');
    expect(quotedResult.text).toContain('### Step 1. Define the production function');
    expect(quotedResult.text).toContain('goes beyond a direct statement');

    const plain = productionPath();
    expect(plain.knowledgeTier).toBe('general_academic');
    expect(plain.text).toBe(ANSWER);
    expect(CAPTURE.length).toBe(125);
    expect(ANSWER.split(/\s+/).length).toBeGreaterThan(1800);
  });
});

describe('grounding CPU benchmark', () => {
  it('finishes the representative non-quoting request quickly', () => {
    productionPath();
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      const started = performance.now();
      const result = productionPath();
      samples.push(performance.now() - started);
      expect(result.knowledgeTier).toBe('general_academic');
    }
    const worst = Math.max(...samples);
    console.log(
      JSON.stringify({
        path: 'optimized_production',
        samples: samples.map((n) => Math.round(n * 10) / 10),
        medianMs: Math.round(median(samples) * 10) / 10,
        worstMs: Math.round(worst * 10) / 10,
      }),
    );
    expect(worst).toBeLessThan(1000);
  });

  it('measures the previous per-sentence walk on the same fixture', () => {
    const budgetMs = 8000;
    const started = performance.now();
    let scans = 0;
    let finished = true;
    for (const source of CHUNKS) {
      for (const part of ANSWER.split(/(?<=[.!?])\s+|\n+/)) {
        if (!part.trim()) continue;
        answerQuotesSourceLegacy(part, source);
        scans += 1;
        if (performance.now() - started > budgetMs) {
          finished = false;
          break;
        }
      }
      if (!finished) break;
    }
    const elapsed = performance.now() - started;
    console.log(
      JSON.stringify({
        path: 'legacy_per_sentence',
        elapsedMs: Math.round(elapsed),
        scansCompleted: scans,
        finished,
      }),
    );
    expect(scans).toBeGreaterThan(0);
  }, 12_000);
});

describe('faithful paraphrase versus unsupported source claims', () => {
  const question = 'According to the PDF, what is the cyclical part of real GDP?';
  const page = 'The cyclical component of real GDP is (b) real GDP less trend real GDP.';

  function ground(answer: string, chunk = page) {
    return applyClaimLevelGrounding({
      question,
      answerText: answer,
      chunks: chunk ? [{ citationIndex: 1, text: chunk }] : [],
      contextAvailable: { hasIndexedChunks: Boolean(chunk), hasPdfCapture: false },
    });
  }

  it('keeps a close paraphrase without calling the source unsupported', () => {
    const result = ground('It is option (b): real GDP minus trend real GDP.');
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toContain('real GDP minus trend real GDP');
    expect(result.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    expect(result.text).not.toContain('cannot be established');
  });

  it('keeps a verbatim option as course material', () => {
    const result = ground('The cyclical component of real GDP is (b) real GDP less trend real GDP.');
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
  });

  it('does not treat a different claim as supported', () => {
    const loose = ground('The cyclical part is government spending.');
    expect(loose.knowledgeTier).toBe('mixed');
    expect(loose.text).toContain('general academic reasoning');
    expect(loose.knowledgeTier).not.toBe('course_material');

    const unrelated = ground('Nominal wages determine the contract.');
    expect(unrelated.text).not.toContain('Nominal wages');
    expect(unrelated.text).toContain('cannot be established from the available source');
  });

  it('does not invent support when no document text was retrieved', () => {
    const result = ground('It is option (b): real GDP minus trend real GDP.', '');
    expect(result.text).toContain('No PDF selection or course material was available');
    expect(result.text).not.toContain('real GDP minus');
  });
});
