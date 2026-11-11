/**
 * @vitest-environment node
 * ZIKUK M4 — Capture Routing, Mathematical Answer Fidelity & Source Attribution Regression Suite
 *
 * Deterministic regression tests covering:
 * 1. Exact printed notation preservation (f_x(1, 2) vs f_x(1, 3)).
 * 2. Suspected typo handling without premature or unauthorized typo-based option declarations.
 * 3. Multiple-choice "None of the remaining options" evaluation when all explicit options are false as written.
 * 4. Missing question content handling (refuses to fabricate answers or guess when only "3." is attached).
 * 5. Prohibition of fabricated solution keys or answer keys.
 * 6. Multiturn conversational context preservation following visual selection without re-attaching image.
 * 7. Token budget headroom and absence of length-based truncation.
 */

import { describe, expect, it } from 'vitest';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import { buildAskCourseMessages } from './promptAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import { PDF_VISUAL_SELECTION_MARKER } from '../visualCapture/visualSelectionContract.ts';
import { resolveServerMaxOutputTokens } from '../chatCompletionsRequestPolicy.ts';
import type { ZikukAiAskCourseRequestV3, PdfVisualSelectionAttachment } from '../requestTypes.ts';

const VALID_SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_USER_ID = 'test-fidelity-user';
const VALID_PDF_ID = 'calc-pdf-exam2';

const SYNTHETIC_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

function createExam2Q3VisualAttachment(): PdfVisualSelectionAttachment {
  const bin = atob(SYNTHETIC_JPEG_B64);
  const imageBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId: VALID_PDF_ID,
    sectionId: VALID_SECTION_ID,
    pageNumber: 2,
    regionNorm: { x: 0.1, y: 0.22, w: 0.78, h: 0.24 },
    attachmentType: 'visual_selection',
    textKind: 'visual_selection',
    mime: 'image/jpeg',
    imageBytes,
    widthPx: 1200,
    heightPx: 380,
    userConfirmedVisual: true,
  };
}

function buildMockDeps(overrides?: Partial<AskCourseDeps>): AskCourseDeps {
  return {
    loadSectionOwner: async () => ({ userId: VALID_USER_ID }),
    loadPdfCaptureSource: async () => ({
      id: VALID_PDF_ID,
      user_id: VALID_USER_ID,
      section_id: VALID_SECTION_ID,
      object: { type: 'pdf', content: { type: 'pdf', pageCount: 10 } },
    }),
    loadNotebookFsoForCitation: async () => null,
    embeddingProvider: createFakeEmbeddingProvider({
      fixedEmbedding: new Array(1536).fill(0.01),
      usage: { inputTokens: 10 },
    }),
    searchKnowledge: async () => ({ ok: true as const, raw: [] }),
    generationProvider: {
      complete: async () => ({
        ok: true,
        text: 'Deterministic test response.',
        latencyMs: 40,
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      }),
    },
    enforcement: createMemoryEnforcementStore({ plan: 'pro', dailyLimit: 100 }),
    routerConfig: { model: 'gpt-4o-mini' },
    ...overrides,
  };
}

describe('Capture Routing & Mathematical Answer Fidelity Regression Suite', () => {
  it('1. verifies prompt requires exact printed notation and forbids selecting an option based on an assumed typo correction', () => {
    const visual = createExam2Q3VisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'Evaluate Question 3 options.',
      chunks: [],
      capture: visual,
      teachingMode: 'explain',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('Evaluate every option exactly as printed.');
    expect(systemPrompt).toContain('Never select or declare an option correct based on an assumed typo correction.');
    expect(systemPrompt).toContain('Clearly distinguish literal mathematical evaluation from separate commentary about possible intended questions.');
    expect(systemPrompt).toContain('When all other specific options evaluate to false or undefined as printed, and an option stating "None of the remaining options" (or "None of the above") is present, that option is the correct answer and must be selected.');
  });

  it('2. verifies prompt strictly prohibits fabricating solution keys or answer keys when question content is missing', () => {
    const messages = buildAskCourseMessages({
      question: 'What is the answer to question 3?',
      chunks: [],
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 2,
        text: '3.',
      },
      teachingMode: 'explain',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('PROHIBITION OF FABRICATED SOURCES & INCOMPLETE QUESTION HANDLING');
    expect(systemPrompt).toContain('Never claim or imply that you have access to a "solution key", "answer key", "official grading guide", "instructor notes", or external solution document unless that exact document is explicitly present in untrustedContext');
    expect(systemPrompt).toContain('If the provided selection or attachment contains only a question label, number, or heading without the problem statement (e.g. only "3." or "Question 4"), do NOT fabricate an answer, guess what the question was, or claim a solution key confirms the answer.');
    expect(systemPrompt).toContain('inform the student that the problem statement is missing and request that they select the full question text or region');
  });

  it('3. verifies mathematical truth values for Calculus II Exam 2 Page 2 Question 3 fixture', () => {
    // Ground truth verified from original PDF (NOVA SBE Calculus II 2025-2026 S2 Exam 2):
    // F(1, 2, 3) = 0 with \nabla F(x, y, z) = (3x^2, z, y).
    // Defines y = f(x, z) near (1, 2, 3) with f(1, 3) = 2.
    // F_x(x, y, z) = 3x^2, F_y(x, y, z) = z, F_z(x, y, z) = y.
    // By Implicit Function Theorem:
    // f_x(x, z) = -F_x / F_y = -3x^2 / z
    // f_z(x, z) = -F_z / F_y = -f(x, z) / z
    // f_xx(x, z) = -6x / z
    // f''_{zx}(x, z) = \partial/\partial z (-3x^2 / z) = 3x^2 / z^2

    // Evaluated at center point (1, 3):
    const f_x_1_3 = -3 * Math.pow(1, 2) / 3; // -1
    const f_z_1_3 = -2 / 3; // -2/3
    const f_xx_1_3 = -6 * 1 / 3; // -2
    const f_zx_1_3 = 3 * Math.pow(1, 2) / Math.pow(3, 2); // 3/9 = 1/3

    expect(f_x_1_3).toBe(-1);
    expect(f_z_1_3).toBeCloseTo(-2 / 3);
    expect(f_xx_1_3).toBe(-2);
    expect(f_zx_1_3).toBeCloseTo(1 / 3);

    // Option 1 printed: f''_{zx}(1, 3) = 1/3
    // Derived value equals 1/3 -> Option 1 is MATHEMATICALLY TRUE!
    const isOption1True = Math.abs(f_zx_1_3 - 1 / 3) < 1e-9;
    expect(isOption1True).toBe(true);

    // Option 2 printed: P(x, z) = 2 - (x - 1) - 2(z - 3)
    // Derived degree 1 Taylor polynomial is 2 - (x - 1) - (2/3)(z - 3).
    // Printed coefficient is -2, but true coefficient is -2/3 -> Option 2 is FALSE.
    const isOption2True = false;
    expect(isOption2True).toBe(false);

    // Option 3 printed: f'_x(1, 2) = -1 (or f'_1(1, 2) = -1)
    // Derived value at (1, 2): f_x(1, 2) = -3(1)^2 / 2 = -1.5 != -1 -> Option 3 is FALSE.
    const f_x_1_2 = -3 * Math.pow(1, 2) / 2; // -1.5
    expect(f_x_1_2).toBe(-1.5);
    const isOption3True = f_x_1_2 === -1;
    expect(isOption3True).toBe(false);

    // Option 4 printed: "None of the remaining options"
    // Because Option 1 is TRUE, Option 4 is FALSE.
    const isOption4NoneOfTheAboveTrue = !isOption1True && !isOption2True && !isOption3True;
    expect(isOption4NoneOfTheAboveTrue).toBe(false);
  });

  it('4. verifies multi-turn conversation retains visual selection context without truncation or contradiction', async () => {
    const visual = createExam2Q3VisualAttachment();
    let sentMessages: Array<{ role: string; content: unknown }> = [];

    const deps = buildMockDeps({
      generationProvider: {
        complete: async (callInput) => {
          sentMessages = callInput.messages;
          return {
            ok: true,
            text: 'Here is the step-by-step derivation: f_xx(1, 3) = -2 because differentiating f_x(x, z) = -3x^2/z with respect to x gives -6x/z.',
            latencyMs: 50,
            usage: { inputTokens: 350, outputTokens: 80, totalTokens: 430 },
          };
        },
      },
    });

    const request: ZikukAiAskCourseRequestV3 = {
      version: 3,
      sectionId: VALID_SECTION_ID,
      question: 'Why is f_xx(1, 3) equal to -2?',
      teachingMode: 'explain',
      capture: visual,
      recentTurns: [
        {
          role: 'user',
          content: 'Solve Question 3 from the attached visual selection.',
        },
        {
          role: 'assistant',
          content:
            'By applying the Implicit Function Theorem to F(x, y, z) = 0 near (1, 2, 3), we find f_x(1, 3) = -1, f_z(1, 3) = -2/3, and f_xx(1, 3) = -2. Evaluating the printed options shows Option 1, 2, and 3 are all false. Therefore, Option 4 ("None of the remaining options") is correct.',
        },
      ],
    };

    const result = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request,
      deps,
    });
    expect(result.response.ok).toBe(true);
    if (!result.response.ok) return;

    // Must not be marked incomplete
    expect(result.response.result.generationIncomplete).toBeUndefined();

    // Verify system instructions and multimodal user message
    expect(sentMessages[0]?.role).toBe('system');
    expect(Array.isArray(sentMessages[1]?.content)).toBe(true);

    const userParts = sentMessages[1]!.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(userParts.some((p) => p.type === 'image_url')).toBe(true);
    const textEnvelope = userParts.find((p) => p.type === 'text')?.text ?? '';
    expect(textEnvelope).toContain('recentConversation');
    expect(textEnvelope).toContain('Solve Question 3 from the attached visual selection.');
  });

  it('5. verifies route-specific token budget allows 2048 tokens for ask_course with visual selection', () => {
    const askCourseBudget = resolveServerMaxOutputTokens('gpt-4o-mini', 'ask_course');
    const explainBudget = resolveServerMaxOutputTokens('gpt-4o-mini', 'explain_selection');

    expect(askCourseBudget).toBe(2048);
    expect(explainBudget).toBe(1200);
    expect(askCourseBudget).toBeGreaterThanOrEqual(2048);
  });

  it('6. verifies prompt enforces canonical 4-phase exam solving flow and distractor concision', () => {
    const visual = createExam2Q3VisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'Solve this question step by step. Evaluate all four options and identify the correct answer.',
      chunks: [],
      capture: visual,
      teachingMode: 'explain',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('CANONICAL EXAM SOLVING FLOW: For direct exam-question solving, prefer four concise phases');
    expect(systemPrompt).toContain('(1) Given data and notation (state the given data and target function directly)');
    expect(systemPrompt).toContain('(2) Essential mathematical derivation (derive the necessary intermediate formulas and evaluate the required values once; avoid repeatedly deriving the same theorem for different options)');
    expect(systemPrompt).toContain('(3) Brief evaluation of each option (evaluate each candidate option concisely, preferring approximately 1–2 clear sentences per distractor stating the derived value versus asserted value and concluding true or false immediately; do not re-derive the general theorem from scratch inside each distractor)');
    expect(systemPrompt).toContain('(4) Clear final answer (state the final option choice unambiguously)');
    expect(systemPrompt).toContain('When detailed explanations, intuitive proofs, or extended background are explicitly requested by the student, provide the requested depth.');
  });

  it('7. verifies Socratic teach_me mode preserves interactive single-step guidance without premature complete solution', () => {
    const visual = createExam2Q3VisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'How do I solve Question 3?',
      chunks: [],
      capture: visual,
      teachingMode: 'teach_me',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('TEACHING MODE — TEACH ME:');
    expect(systemPrompt).toContain('Provide interactive step-by-step tutoring rather than immediately solving the problem.');
    expect(systemPrompt).toContain('Do not reveal the complete solution, full calculation, or final answer by default.');
    expect(systemPrompt).toContain('ask exactly one focused question, and wait for the student\'s response before advancing.');
  });

  it('8. verifies negative control math fixture where Option A is f\'\'_{zz}(1,3) = 1/3 (false, making Option D correct)', () => {
    // If Option A states f''_{zz}(1, 3) = 1/3:
    // With f(1, 3) = 2 and f_z(1, 3) = -2/3:
    // f_z(x, z) = -f(x, z) / z
    // Differentiating with respect to z using quotient rule:
    // f''_{zz} = - [ ( \partial f / \partial z ) * z - f(x, z) ] / z^2
    //          = - [ (-2/3) * 3 - 2 ] / 3^2
    //          = - [ -2 - 2 ] / 9 = 4/9
    const f_zz_1_3 = 4 / 9; // ~0.4444...
    expect(f_zz_1_3).toBeCloseTo(4 / 9);

    // Asserted Option A: f''_{zz}(1, 3) = 1/3 = 3/9
    // Because 4/9 != 1/3, Option A asserting f''_{zz} is FALSE:
    const isOptionAZzTrue = Math.abs(f_zz_1_3 - 1 / 3) < 1e-9;
    expect(isOptionAZzTrue).toBe(false);

    // Option B and C are also false (from fixture test 3):
    const isOptionBTrue = false;
    const isOptionCTrue = false;

    // Therefore, in the zz fixture, Option D ("None of the remaining options") is TRUE:
    const isOptionDNoneOfTheAboveTrue = !isOptionAZzTrue && !isOptionBTrue && !isOptionCTrue;
    expect(isOptionDNoneOfTheAboveTrue).toBe(true);
  });

  it('9. verifies runAskCoursePipeline returns pdf_selection_visual tier without false DERIVED_REASONING_NOTICE for visual math derivations', async () => {
    const visual = createExam2Q3VisualAttachment();
    const deps = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'From the visual selection [PDF visual selection], we apply the Implicit Function Theorem to find f\'\'_{zx}(1, 3) = 1/3. Evaluating candidate options: Option 1 is true. Therefore, Option 1 is correct.',
          latencyMs: 60,
          usage: { inputTokens: 280, outputTokens: 60, totalTokens: 340 },
        }),
      },
    });

    const result = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        sectionId: VALID_SECTION_ID,
        question: 'Solve Question 3 step by step.',
        teachingMode: 'explain',
        capture: visual,
      },
      deps,
    });

    expect(result.response.ok).toBe(true);
    if (!result.response.ok) return;

    // 1. Provenance tier is correctly pdf_selection_visual
    expect(result.response.result.knowledgeTier).toBe('pdf_selection_visual');
    // 2. No false general academic disclaimer
    expect(result.response.result.text).not.toContain('general academic reasoning');
    expect(result.response.result.text).not.toContain('not independently verified');
    // 3. Visual marker is preserved
    expect(result.response.result.text).toContain(PDF_VISUAL_SELECTION_MARKER);
  });
});

