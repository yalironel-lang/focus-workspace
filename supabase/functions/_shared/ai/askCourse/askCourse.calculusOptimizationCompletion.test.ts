import { describe, expect, it } from 'vitest';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import { PDF_VISUAL_SELECTION_MARKER } from '../visualCapture/visualSelectionContract.ts';
import { buildAskCourseMessages } from './promptAskCourse.ts';
import { resolveServerMaxOutputTokens } from '../chatCompletionsRequestPolicy.ts';
import { SERVER_MAX_OUTPUT_TOKENS } from '../bounds.ts';
import type { ZikukAiAskCourseRequestV3, PdfVisualSelectionAttachment } from '../requestTypes.ts';

const VALID_SECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VALID_USER_ID = 'calc-test-user-id';
const VALID_PDF_ID = 'calc-pdf-obj-1';

const SYNTHETIC_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

function createVisualAttachment(): PdfVisualSelectionAttachment {
  const bin = atob(SYNTHETIC_JPEG_B64);
  const imageBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId: VALID_PDF_ID,
    sectionId: VALID_SECTION_ID,
    pageNumber: 1,
    regionNorm: { x: 0.095, y: 0.11, w: 0.81, h: 0.19 }, // Normalized region matching img_p0_2
    attachmentType: 'visual_selection',
    textKind: 'visual_selection',
    mime: 'image/jpeg',
    imageBytes,
    widthPx: 1338,
    heightPx: 443,
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
        text: 'Mathematical explanation.',
        latencyMs: 30,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    },
    enforcement: createMemoryEnforcementStore({ plan: 'pro', dailyLimit: 100 }),
    routerConfig: { model: 'gpt-4.1-mini', visionModel: 'gpt-4.1-mini' },
    ...overrides,
  };
}

describe('Calculus II Optimization Acceptance & Completion Regression Suite', () => {
  it('1. verifies token budget isolation: 2048 for ask_course vs 1200 for explain_selection', () => {
    expect(resolveServerMaxOutputTokens('gpt-4.1-mini', 'ask_course')).toBe(2048);
    expect(resolveServerMaxOutputTokens('gpt-4.1-mini', 'explain_selection')).toBe(1200);
    expect(resolveServerMaxOutputTokens('gpt-4.1-mini')).toBe(1200);
  });

  it('2. reproduces truncation flag: provider returning length exhaustion results in generationIncomplete: true', async () => {
    // Truncated response simulating token exhaustion during multiple-choice analysis
    const truncatedText = [
      '### Optimization Problem Solution',
      'We consider the optimization problem \\( \\max/\\min f(x,y) = x^2 + y^2 \\) subject to \\( (x-1)^2 + y^2 \\le 4 \\).',
      'The feasible region \\( D \\) is a closed disk centered at \\( (1,0) \\) with radius 2.',
      '',
      '#### Step 1: Interior Critical Points',
      '\\( \\nabla f(x,y) = (2x, 2y) = (0,0) \\implies (x,y) = (0,0) \\).',
      'Testing feasibility: \\( (0-1)^2 + 0^2 = 1 \\le 4 \\), so \\( (0,0) \\) is in the feasible disk.',
      'Here \\( f(0,0) = 0 \\), which is the global minimum since \\( f(x,y) \\ge 0 \\) everywhere.',
      '',
      '#### Step 2: Boundary Extrema',
      'On \\( (x-1)^2 + y^2 = 4 \\), \\( y^2 = 4 - (x-1)^2 = 3 + 2x - x^2 \\) for \\( x \\in [-1, 3] \\).',
      'Substituting gives \\( g(x) = x^2 + (3 + 2x - x^2) = 2x + 3 \\).',
      'At \\( x = 3, y = 0 \\): \\( f(3,0) = 9 \\) (strict global maximum).',
      'At \\( x = -1, y = 0 \\): \\( f(-1,0) = 1 \\).',
      '',
      '#### Step 3: Analysis of Options',
      '1. (-1, 0) is a global maximizer of P: False.',
      '2. P does not admit strict global extrema points: False.',
      // Truncated here before option 3 and 4!
    ].join('\n');

    let capturedMaxTokens: number | undefined;
    const deps = buildMockDeps({
      generationProvider: {
        complete: async (input) => {
          capturedMaxTokens = input.maxTokens;
          return {
            ok: true as const,
            text: truncatedText,
            rawModel: 'gpt-4.1-mini',
            latencyMs: 120,
            generationIncomplete: true, // Provider returned finish_reason: 'length'
            usage: { inputTokens: 400, outputTokens: 1200, totalTokens: 1600 },
          };
        },
      },
    });

    const request: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Solve this optimization problem and evaluate which multiple-choice option is correct.',
      teachingMode: 'explain',
      capture: createVisualAttachment(),
      recentTurns: [
        {
          role: 'user',
          content: 'Transcribe the objective function and constraint from the selected area.',
        },
        {
          role: 'assistant',
          content: 'The objective function is \\( f(x,y) = x^2 + y^2 \\) and the constraint is \\( (x-1)^2 + y^2 \\le 4 \\).',
        },
      ],
    };

    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request,
      deps,
    });

    expect(capturedMaxTokens).toBe(2048);
    expect(out.response.ok).toBe(true);
    if (!out.response.ok || out.response.result.type !== 'ask_course') return;

    // Failsafe contract: generationIncomplete is preserved on truncated responses
    expect(out.response.result.generationIncomplete).toBe(true);
    expect(out.response.result.text).toContain('f(0,0) = 0');
    expect(out.response.result.text).toContain('f(3,0) = 9');
  });

  it('3. completes full response including multiple-choice conclusion when adequate headroom is present', async () => {
    const completeText = [
      '### Optimization Problem Solution',
      'We consider \\( \\max/\\min f(x,y) = x^2 + y^2 \\) subject to \\( (x-1)^2 + y^2 \\le 4 \\) [PDF visual selection].',
      '',
      '#### Step 1: Interior Critical Points',
      'The gradient \\( \\nabla f(x,y) = (2x, 2y) = (0,0) \\) gives \\( (0,0) \\).',
      'Testing the constraint: \\( (0-1)^2 + 0^2 = 1 \\le 4 \\).',
      'Thus the origin lies strictly inside the feasible region, yielding \\( f(0,0) = 0 \\).',
      'Because \\( f(x,y) \\ge 0 \\) on \\( \\mathbb{R}^2 \\), 0 is the unique strict global minimum.',
      '',
      '#### Step 2: Boundary Analysis',
      'On the boundary circle \\( (x-1)^2 + y^2 = 4 \\), \\( y^2 = 4 - (x-1)^2 = 3 + 2x - x^2 \\) for \\( x \\in [-1, 3] \\).',
      'Substituting gives \\( g(x) = 2x + 3 \\).',
      'The maximum on \\( [-1, 3] \\) occurs at \\( x = 3, y = 0 \\), giving \\( f(3,0) = 9 \\).',
      'The point \\( (-1, 0) \\) gives \\( f(-1,0) = 1 \\).',
      '',
      '#### Step 3: Evaluation of Multiple-Choice Options',
      '- "(-1, 0) is a global maximizer of P": False, maximum is 9 at (3,0).',
      '- "P does not admit strict global extrema points": False, both minimum and maximum are unique and strict.',
      '- "None of the remaining options is a true proposition": False.',
      '- "0 and 9 are, respectively, the strict global minimum and the strict global maximum of P": True.',
      '',
      '**Conclusion:**',
      'The true proposition is: **0 and 9 are, respectively, the strict global minimum and the strict global maximum of P**.',
    ].join('\n');

    const deps = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true as const,
          text: completeText,
          rawModel: 'gpt-4.1-mini',
          latencyMs: 180,
          generationIncomplete: undefined, // Provider returned finish_reason: 'stop'
          usage: { inputTokens: 400, outputTokens: 850, totalTokens: 1250 },
        }),
      },
    });

    const request: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Solve this optimization problem and evaluate which multiple-choice option is correct.',
      teachingMode: 'explain',
      capture: createVisualAttachment(),
      recentTurns: [
        {
          role: 'user',
          content: 'Transcribe the objective function and constraint from the selected area.',
        },
        {
          role: 'assistant',
          content: 'The objective function is \\( f(x,y) = x^2 + y^2 \\) and the constraint is \\( (x-1)^2 + y^2 \\le 4 \\).',
        },
      ],
    };

    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request,
      deps,
    });

    expect(out.response.ok).toBe(true);
    if (!out.response.ok || out.response.result.type !== 'ask_course') return;

    expect(out.response.result.generationIncomplete).toBeUndefined();
    expect(out.response.result.text).toContain('0 and 9 are, respectively, the strict global minimum and the strict global maximum of P');
    expect(out.response.result.text).toContain('[PDF visual selection]');
    expect(out.response.result.sources).toEqual([]);
  });

  it('4. preserves visual selection context and multiple-choice question in multimodal messages across turns', () => {
    const visual = createVisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'Which of the following options is a true proposition?',
      chunks: [],
      capture: visual,
      recentTurns: [
        {
          role: 'user',
          content: 'Transcribe the objective function and constraint.',
        },
        {
          role: 'assistant',
          content: 'f(x,y) = x^2 + y^2, (x-1)^2 + y^2 <= 4.',
        },
      ],
      teachingMode: 'explain',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    expect(Array.isArray(messages[1]?.content)).toBe(true);

    const parts = messages[1]!.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    const textPart = parts.find((p) => p.type === 'text');
    const imagePart = parts.find((p) => p.type === 'image_url');

    expect(imagePart?.image_url?.url).toContain('data:image/jpeg;base64,');
    expect(textPart?.text).toContain('Which of the following options is a true proposition?');
    expect(textPart?.text).toContain(PDF_VISUAL_SELECTION_MARKER);
    expect(textPart?.text).toContain('Transcribe the objective function and constraint.');
  });

  it('5. instructs multiple-choice answers to derive results first, avoid premature declarations, and maintain consistency', () => {
    const visual = createVisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'Which of the following options is a true proposition?',
      chunks: [],
      capture: visual,
      teachingMode: 'explain',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('MULTIPLE-CHOICE QUESTIONS & ANSWER CONSISTENCY');
    expect(systemPrompt).toContain('interpret the question statement and all candidate options accurately before deriving solutions');
    expect(systemPrompt).toContain('derive the relevant mathematical results from the interpreted problem data, compare every candidate option directly against the derived values, and state one clear, unambiguous final conclusion');
    expect(systemPrompt).toContain('distinguishing mixed partials \\( f\'\'_{zx} \\) from repeated partials \\( f\'\'_{zz} \\)');
    expect(systemPrompt).toContain('Never make premature declarations or state an option choice before the supporting calculations are done');
    expect(systemPrompt).toContain('zero contradictory option claims');
    expect(systemPrompt).toContain('avoid circular repetition, redundant restatements of theorems, or speculative discussions of author intent');
    expect(systemPrompt).toContain('preferring approximately 1–2 clear sentences per distractor');
    expect(systemPrompt).toContain('Keep distractor analysis targeted and bounded');
    expect(systemPrompt).toContain('do not append open-ended conversational offers, trailing sign-offs, or chat filler (e.g. avoid "If you want, I can...")');
    expect(systemPrompt).toContain('Never sacrifice mathematical correctness for brevity');
  });

  it('6. enforces source fidelity, higher-order gradient differentiability, domain vs algebraic extension distinction, and forbids silent argument substitution (Calculus II Exam 2 Q3)', () => {
    const visual = createVisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'Evaluate Question 3 options.',
      chunks: [],
      capture: visual,
      teachingMode: 'explain',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('13. SOURCE FIDELITY, HIGHER DERIVATIVES & NOTATION INTEGRITY');
    expect(systemPrompt).toContain('Preserve exact visible mathematical notation, variables, subscripts, indices, and coordinate arguments');
    expect(systemPrompt).toContain('Clearly distinguish mixed partial derivatives (e.g. \\( f\'\'_{zx} = \\frac{\\partial^2 f}{\\partial z \\partial x} \\)) from repeated partial derivatives (e.g. \\( f\'\'_{zz} = \\frac{\\partial^2 f}{\\partial z^2} \\)), and do not conflate their notation or values');
    expect(systemPrompt).toContain('do not claim insufficient information when closed-form expressions can be differentiated');
    expect(systemPrompt).toContain('Clearly distinguish literal transcription from mathematical interpretation');
    expect(systemPrompt).toContain('do not claim it is uncomputable solely because the second variable is named');
    expect(systemPrompt).toContain('Distinguish what is guaranteed by the local implicit-function domain from what can be evaluated using an algebraic extension');
    expect(systemPrompt).toContain('Never silently alter, substitute, or "fix" an apparent typographical error or mismatched argument');
    expect(systemPrompt).toContain('Never claim an option is "necessarily true" or "correct" based on an unacknowledged alteration of the printed question or option text');

    // Visual selection envelope notice check
    const userEnvelope = messages[1]!.content as Array<{ type: string; text?: string }>;
    const textEnvelope = userEnvelope.find((p) => p.type === 'text')?.text ?? '';
    expect(textEnvelope).toContain('Preserve visible notation, arguments, and coordinate tuples exactly; do not silently alter apparent typos.');
  });

  it('7. reproduces and solves Calculus II Exam 2 Page 2 Question 3: derives f_x, f_z, f_xx, f_zx, refutes Taylor polynomial, evaluates literal coordinates, and concludes Option 1 without contradiction', async () => {
    // Note the structure: Derivations first, options evaluation, then one unambiguous conclusion.
    // Zero contradictory opening declarations (e.g. does NOT claim Option 2 is correct upfront).
    const q3SolutionText = [
      'To determine which option is necessarily true for \\( F(x, y, z) = 0 \\) near \\( (1, 2, 3) \\), we apply the Implicit Function Theorem [PDF visual selection].',
      '',
      '#### 1. Mathematical Derivation of Partial Derivatives',
      'The gradient of \\( F \\) is given everywhere by \\( \\nabla F(x, y, z) = (3x^2, z, y) \\).',
      'At \\( (x_0, y_0, z_0) = (1, 2, 3) \\):',
      '- \\( F_x(1, 2, 3) = 3(1)^2 = 3 \\).',
      '- \\( F_y(1, 2, 3) = z = 3 \\ne 0 \\).',
      '- \\( F_z(1, 2, 3) = y = 2 \\).',
      'Since \\( F_y(1, 2, 3) \\ne 0 \\), \\( F(x, y, z) = 0 \\) implicitly defines \\( y = f(x, z) \\) in a neighborhood of \\( (x_0, z_0) = (1, 3) \\) with \\( f(1, 3) = 2 \\).',
      '',
      'First partial derivatives at \\( (1, 3) \\):',
      '\\[ f_x(1, 3) = -\\frac{F_x(1, 2, 3)}{F_y(1, 2, 3)} = -\\frac{3}{3} = -1. \\]',
      '\\[ f_z(1, 3) = -\\frac{F_z(1, 2, 3)}{F_y(1, 2, 3)} = -\\frac{2}{3}. \\]',
      '',
      'Second partial derivatives:',
      'Because \\( \\nabla F \\) is algebraically specified everywhere, \\( f_x(x, z) = -\\frac{3x^2}{z} \\).',
      'Differentiating with respect to \\( z \\) gives the mixed partial derivative:',
      '\\[ f\'\'_{zx}(x, z) = \\frac{\\partial}{\\partial z}\\left(-\\frac{3x^2}{z}\\right) = \\frac{3x^2}{z^2} \\implies f\'\'_{zx}(1, 3) = \\frac{3(1)^2}{3^2} = \\frac{3}{9} = \\frac{1}{3}. \\]',
      'Differentiating with respect to \\( x \\) gives:',
      '\\[ f_{xx}(x, z) = \\frac{\\partial}{\\partial x}\\left(-\\frac{3x^2}{z}\\right) = -\\frac{6x}{z} \\implies f_{xx}(1, 3) = -\\frac{6(1)}{3} = -2. \\]',
      '',
      '#### 2. Evaluation of Multiple-Choice Options',
      '- **Option 1**: \\( f\'\'_{zx}(1, 3) = \\frac{1}{3} \\). The derived mixed second partial derivative \\( f\'\'_{zx}(1, 3) \\) equals \\( \\frac{1}{3} \\). Therefore, Option 1 is **true**.',
      '- **Option 2**: The degree 1 Taylor polynomial around \\( (1, 3) \\) is \\( P(x, z) = f(1, 3) + f_x(1, 3)(x - 1) + f_z(1, 3)(z - 3) = 2 - (x - 1) - \\frac{2}{3}(z - 3) \\). The printed option states \\( -2(z - 3) \\) instead of \\( -\\frac{2}{3}(z - 3) \\), so Option 2 is false.',
      '- **Option 3 (Source fidelity check)**: The printed text states \\( f\'_x(1, 2) = -1 \\). At \\( (1, 2) \\), \\( f_x(1, 2) = -\\frac{3(1)^2}{2} = -1.5 \\ne -1 \\). Thus Option 3 is false as printed.',
      '- **Option 4**: "None of the remaining options" is false because Option 1 is true.',
      '',
      '#### 3. Conclusion',
      'The necessarily true statement is **Option 1**: \\( f\'\'_{zx}(1, 3) = \\frac{1}{3} \\).',
    ].join('\n');

    let capturedMaxTokens: number | undefined;
    const deps = buildMockDeps({
      generationProvider: {
        complete: async (input) => {
          capturedMaxTokens = input.maxTokens;
          return {
            ok: true as const,
            text: q3SolutionText,
            rawModel: 'gpt-4.1-mini',
            latencyMs: 150,
            usage: { inputTokens: 450, outputTokens: 650, totalTokens: 1100 },
          };
        },
      },
    });

    const request: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Which of the following options is necessarily true for Question 3?',
      teachingMode: 'explain',
      capture: createVisualAttachment(),
    };

    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request,
      deps,
    });

    expect(capturedMaxTokens).toBe(2048);
    expect(out.response.ok).toBe(true);
    if (!out.response.ok) return;

    const answer = out.response.result.text;

    // 1. Derivations verified
    expect(answer).toContain('f_x(1, 3) = -\\frac{F_x(1, 2, 3)}{F_y(1, 2, 3)} = -\\frac{3}{3} = -1');
    expect(answer).toContain('f_z(1, 3) = -\\frac{F_z(1, 2, 3)}{F_y(1, 2, 3)} = -\\frac{2}{3}');
    expect(answer).toContain('f\'\'_{zx}(1, 3) = \\frac{3(1)^2}{3^2} = \\frac{3}{9} = \\frac{1}{3}');
    expect(answer).toContain('f_{xx}(1, 3) = -\\frac{6(1)}{3} = -2');

    // 2. Option 1 truth verified
    expect(answer).toContain('Option 1 is **true**');

    // 3. Taylor polynomial falsity verified
    expect(answer).toContain('Option 2 is false');
    expect(answer).toContain('-\\frac{2}{3}(z - 3)');

    // 4. Literal (1,2) vs (1,3) distinction preserved
    expect(answer).toContain('f\'_x(1, 2) = -1');
    expect(answer).toContain('-1.5');
    expect(answer).toContain('Option 3 (Source fidelity check)');

    // 5. Correct conclusion is Option 1
    expect(answer).toContain('The necessarily true statement is **Option 1**');

    // 6. Zero contradiction: NO premature declaration claiming Option 2 or Option 4 is correct
    expect(answer).not.toMatch(/Option 2\b.*(?:is correct|is necessarily true|is the correct option)/i);
    expect(answer).not.toMatch(/Option 4\b.*(?:is correct|is necessarily true|is the correct option)/i);
    expect(answer).not.toContain('If you want, I can');
    expect(out.response.result.generationIncomplete).toBeUndefined();
  });

  it('8. preserves generationIncomplete: true when finish_reason is length and omits it on complete answers', async () => {
    const depsIncomplete = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true as const,
          text: 'The derivation stops here...',
          rawModel: 'gpt-4.1-mini',
          latencyMs: 100,
          generationIncomplete: true,
          usage: { inputTokens: 200, outputTokens: 2048, totalTokens: 2248 },
        }),
      },
    });

    const reqIncomplete: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain Question 3.',
      teachingMode: 'explain',
      capture: createVisualAttachment(),
    };

    const outIncomplete = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: reqIncomplete,
      deps: depsIncomplete,
    });

    expect(outIncomplete.response.ok).toBe(true);
    if (outIncomplete.response.ok) {
      expect(outIncomplete.response.result.generationIncomplete).toBe(true);
    }

    const depsComplete = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true as const,
          text: 'Complete solution and conclusive answer.',
          rawModel: 'gpt-4.1-mini',
          latencyMs: 100,
          usage: { inputTokens: 200, outputTokens: 500, totalTokens: 700 },
        }),
      },
    });

    const outComplete = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: reqIncomplete,
      deps: depsComplete,
    });

    expect(outComplete.response.ok).toBe(true);
    if (outComplete.response.ok) {
      expect(outComplete.response.result.generationIncomplete).toBeUndefined();
    }
  });

  it('9. negative control: when Option 1 is printed as repeated partial f\'\'_{zz}(1, 3) = 4/9, derives f\'\'_{zz} = 4/9 and selects Option 1 (no bias toward zx)', async () => {
    // Problem variant where Option 1 printed in the exam actually IS the repeated partial f''_{zz}(1, 3) = 4/9.
    // Verifies the system derives f''_{zz}(1, 3) = 2f(1, 3)/z^2 = 4/9 and concludes Option 1 is true.
    const zzSolutionText = [
      'To evaluate the printed options for \\( F(x, y, z) = 0 \\) near \\( (1, 2, 3) \\) with \\( \\nabla F(x,y,z) = (3x^2, z, y) \\) [PDF visual selection]:',
      '',
      '#### 1. Mathematical Derivations',
      'The implicit function theorem yields \\( y = f(x, z) \\) near \\( (1, 3) \\) with \\( f(1, 3) = 2 \\).',
      'The first partial derivative with respect to \\( z \\) is:',
      '\\[ f_z(x, z) = -\\frac{F_z(x, y, z)}{F_y(x, y, z)} = -\\frac{y}{z} = -\\frac{f(x, z)}{z}. \\]',
      'Differentiating \\( f_z \\) again with respect to \\( z \\) using the quotient rule:',
      '\\[ f\'\'_{zz}(x, z) = \\frac{\\partial}{\\partial z}\\left(-\\frac{f(x, z)}{z}\\right) = -\\frac{f_z(x, z)z - f(x, z)}{z^2} = \\frac{2f(x, z)}{z^2}. \\]',
      'Evaluating at \\( (1, 3) \\):',
      '\\[ f\'\'_{zz}(1, 3) = \\frac{2(2)}{3^2} = \\frac{4}{9}. \\]',
      '',
      '#### 2. Option Evaluation',
      '- **Option 1**: \\( f\'\'_{zz}(1, 3) = \\frac{4}{9} \\). The derived repeated partial derivative \\( f\'\'_{zz}(1, 3) \\) equals \\( \\frac{4}{9} \\). Therefore, Option 1 is **true**.',
      '- **Option 2**: False (Taylor coefficient of \\( (z - 3) \\) is \\( -2/3 \\), not \\( -2 \\)).',
      '- **Option 3**: False (algebraic formula yields \\( -1.5 \\ne -1 \\) and \\( (1, 2) \\) is outside guaranteed domain).',
      '- **Option 4**: False because Option 1 is true.',
      '',
      '#### 3. Conclusion',
      'The necessarily true statement is **Option 1**: \\( f\'\'_{zz}(1, 3) = \\frac{4}{9} \\).',
    ].join('\n');

    const deps = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true as const,
          text: zzSolutionText,
          rawModel: 'gpt-4.1-mini',
          latencyMs: 120,
          usage: { inputTokens: 400, outputTokens: 450, totalTokens: 850 },
        }),
      },
    });

    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Solve this question and evaluate which option is correct.',
        teachingMode: 'explain',
        capture: createVisualAttachment(),
      },
      deps,
    });

    expect(out.response.ok).toBe(true);
    if (!out.response.ok) return;

    const answer = out.response.result.text;
    expect(answer).toContain('f\'\'_{zz}(1, 3) = \\frac{4}{9}');
    expect(answer).toContain('Option 1 is **true**');
    expect(answer).toContain('The necessarily true statement is **Option 1**');
    expect(answer).not.toContain('Option 1 is false');
  });

  it('10. negative control: when Option 1 asserts f\'\'_{zz}(1, 3) = 1/3 (false), correctly refutes Option 1 and selects Option 4', async () => {
    // Problem variant where Option 1 asserts f''_{zz}(1, 3) = 1/3 (false, since f''_{zz} is 4/9).
    // Verifies the system correctly calculates 4/9 != 1/3, rejects Option 1, and chooses Option 4.
    const refutationSolutionText = [
      'To evaluate the printed options for \\( F(x, y, z) = 0 \\) near \\( (1, 2, 3) \\) [PDF visual selection]:',
      '',
      '#### 1. Mathematical Derivations',
      'The implicit function theorem yields \\( y = f(x, z) \\) near \\( (1, 3) \\) with \\( f(1, 3) = 2 \\).',
      'The repeated partial derivative \\( f\'\'_{zz}(1, 3) \\) is:',
      '\\[ f\'\'_{zz}(1, 3) = \\frac{2f(1, 3)}{3^2} = \\frac{4}{9}. \\]',
      '',
      '#### 2. Option Evaluation',
      '- **Option 1**: \\( f\'\'_{zz}(1, 3) = \\frac{1}{3} \\). The derived value is \\( \\frac{4}{9} \\ne \\frac{1}{3} \\). Option 1 is **false**.',
      '- **Option 2**: False (Taylor coefficient of \\( (z - 3) \\) is \\( -2/3 \\ne -2 \\)).',
      '- **Option 3**: False (algebraic value \\( f_x(1, 2) = -1.5 \\ne -1 \\)).',
      '- **Option 4**: "None of the remaining options" is **true** because Options 1, 2, and 3 are all false.',
      '',
      '#### 3. Conclusion',
      'The correct answer is **Option 4**: None of the remaining options.',
    ].join('\n');

    const deps = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true as const,
          text: refutationSolutionText,
          rawModel: 'gpt-4.1-mini',
          latencyMs: 120,
          usage: { inputTokens: 400, outputTokens: 400, totalTokens: 800 },
        }),
      },
    });

    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Solve this question and evaluate which option is correct.',
        teachingMode: 'explain',
        capture: createVisualAttachment(),
      },
      deps,
    });

    expect(out.response.ok).toBe(true);
    if (!out.response.ok) return;

    const answer = out.response.result.text;
    expect(answer).toContain('\\frac{4}{9} \\ne \\frac{1}{3}');
    expect(answer).toContain('Option 1 is **false**');
    expect(answer).toContain('The correct answer is **Option 4**');
  });

  it('11. verifies notation fidelity across primes, exponents, fractions, negative signs, and variable indices', () => {
    const visual = createVisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'Evaluate derivatives with subscripts and powers.',
      chunks: [],
      capture: visual,
      teachingMode: 'explain',
    });

    const systemPrompt = messages[0]?.content as string;
    // 1. Primes vs powers distinction
    expect(systemPrompt).toContain('derivative orders, primes, exponents, fractions, negative signs');
    // 2. Subscript variable vs numerical index distinction
    expect(systemPrompt).toContain('index \\( 1 \\) from variable \\( x \\)');
    // 3. Mixed vs repeated partial derivative distinction
    expect(systemPrompt).toContain('distinguishing mixed partials \\( f\'\'_{zx} \\) from repeated partials \\( f\'\'_{zz} \\)');
    // 4. Do not silently alter unfamiliar or subtle notation
    expect(systemPrompt).toContain('Do not silently replace unfamiliar or visually subtle subscripts with more common ones');
    // 5. Explicitly acknowledge visual ambiguity if genuinely unreadable
    expect(systemPrompt).toContain('If a printed character is genuinely illegible, acknowledge the visual ambiguity rather than guessing');
  });

  it('12. preserves visual capture and prevents fabricated solution-key attribution when selection includes question number "3."', async () => {
    const visual = createVisualAttachment();
    const deps = buildMockDeps({
      generationProvider: {
        complete: async () => ({
          ok: true as const,
          text: 'Evaluating Question 3 from the provided visual selection [PDF visual selection]. Deriving f_x and f_z...',
          rawModel: 'gpt-4.1-mini',
          latencyMs: 100,
          usage: { inputTokens: 250, outputTokens: 100, totalTokens: 350 },
        }),
      },
    });

    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Solve Question 3.',
        teachingMode: 'explain',
        capture: visual,
      },
      deps,
    });

    expect(out.response.ok).toBe(true);
    if (!out.response.ok) return;

    // Confirms visual grounding marker
    expect(out.response.result.text).toContain(PDF_VISUAL_SELECTION_MARKER);
    // Never fabricates solution key
    expect(out.response.result.text).not.toContain('solution key');
    expect(out.response.result.text).not.toContain('answer key');
    expect(out.response.result.text).not.toContain('grading rubric');
  });

  it('13. preserves interactive scaffolding in teach_me mode for Implicit Function Theorem questions', () => {
    const visual = createVisualAttachment();
    const messages = buildAskCourseMessages({
      question: 'How do I solve this question?',
      chunks: [],
      capture: visual,
      teachingMode: 'teach_me',
    });

    const systemPrompt = messages[0]?.content as string;
    expect(systemPrompt).toContain('TEACHING MODE — TEACH ME:');
    expect(systemPrompt).toContain('Provide interactive step-by-step tutoring rather than immediately solving the problem');
    expect(systemPrompt).toContain('Start by identifying the immediate learning objective and explain ONLY what is necessary for the next step');
    expect(systemPrompt).toContain('Questions such as "How do I find c?", "How do I solve this?", or asking for help with an exercise must trigger guided tutoring, NOT the complete solution');
  });
});

