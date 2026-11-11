import { describe, expect, it } from 'vitest';
import { evaluateGroundingProvenance } from './evaluateGroundingProvenance.ts';
import { buildAskCourseMessages } from './promptAskCourse.ts';

const PAGE =
  'Mean Value Theorem: there exists c in (a, b) such that f\'(c) = (f(b) - f(a)) / (b - a).';

describe('recovery bridge provenance', () => {
  it('labels recovered full-page quotation as pdf_page_recovered, not pdf_selection', () => {
    const result = evaluateGroundingProvenance({
      question: 'Explain the Mean Value Theorem from this page.',
      answerText: `${PAGE} [PDF page recovery]`,
      indexedChunkTexts: [],
      captureText: PAGE,
      captureTextKind: 'recovered_page',
    });
    expect(result.tier).toBe('pdf_page_recovered');
    expect(result.contextAvailable.hasPdfCapture).toBe(true);
  });

  it('keeps exact native selection as pdf_selection (SKE1.1)', () => {
    const result = evaluateGroundingProvenance({
      question: 'Explain the Mean Value Theorem from this selection.',
      answerText: `${PAGE} [PDF selection]`,
      indexedChunkTexts: [],
      captureText: PAGE,
      captureTextKind: 'native_selection',
    });
    expect(result.tier).toBe('pdf_selection');
  });

  it('labels confirmed full-page native fallback as pdf_page_native, not OCR', () => {
    const result = evaluateGroundingProvenance({
      question: 'Explain the Mean Value Theorem from this page.',
      answerText: `${PAGE} [PDF page text]`,
      indexedChunkTexts: [],
      captureText: PAGE,
      captureTextKind: 'native_page',
    });
    expect(result.tier).toBe('pdf_page_native');
    expect(result.tier).not.toBe('pdf_page_recovered');
    expect(result.tier).not.toBe('pdf_selection');
  });

  it('builds native-page prompt envelope without claiming selection or OCR', () => {
    const msgs = buildAskCourseMessages({
      question: 'Explain this page.',
      chunks: [],
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'pdf-1',
        sectionId: 'sec-1',
        pageNumber: 1,
        text: PAGE,
        textKind: 'native_page',
      },
    });
    const user = JSON.parse(msgs[1]!.content);
    expect(user.untrustedContext.userProvidedNativePdfPage).toMatchObject({
      pageNumber: 1,
      scope: 'full_page',
    });
    expect(user.untrustedContext.userProvidedPdfSelection).toBeUndefined();
    expect(user.untrustedContext.userProvidedRecoveredPdfPage).toBeUndefined();
    expect(msgs[0]!.content).toContain('[PDF page text]');
    expect(msgs[0]!.content).toContain('Never label native page text as OCR recovery');
    expect(user.untrustedContext.userProvidedNativePdfPage.notice).not.toMatch(/OCR/i);
  });

  it('builds recovered-page prompt envelope without claiming selection', () => {
    const msgs = buildAskCourseMessages({
      question: 'Explain this page.',
      chunks: [],
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: 'pdf-1',
        sectionId: 'sec-1',
        pageNumber: 3,
        text: PAGE,
        textKind: 'recovered_page',
      },
    });
    const user = JSON.parse(msgs[1]!.content);
    expect(user.untrustedContext.userProvidedRecoveredPdfPage).toMatchObject({
      pageNumber: 3,
      scope: 'full_page',
    });
    expect(user.untrustedContext.userProvidedPdfSelection).toBeUndefined();
    expect(msgs[0]!.content).toContain('[PDF page recovery]');
    expect(msgs[0]!.content).toContain('OCR formulas may be imperfect');
  });
});
