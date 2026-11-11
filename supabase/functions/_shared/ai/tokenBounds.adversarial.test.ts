import { describe, it, expect, vi } from 'vitest';
import {
  evaluateAuthoritativeTokenBound,
  requireVerifiedTokenReservation,
  createPostgresProjectSpendingStore,
  isAuthoritativeBpeModel,
  isAuthoritativeBpeEmbeddingModel,
  calculateAuthoritativeEmbeddingBound,
  calculateAuthoritativePayloadInputBound,
  verifyFinalProviderPayloadBound,
  OPENAI_VISION_HIGH_DETAIL_MAX_TOKENS,
} from './projectLevelSpendingGuard.ts';
import {
  SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS,
  SERVER_MAX_OUTPUT_TOKENS,
  SERVER_REASONING_MAX_OUTPUT_TOKENS,
  SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS,
} from './bounds.ts';

describe('Task B: Token-Bound Adversarial & Reservation Regressions', () => {
  it('unverified routes fail closed without authoritative tokenizer proof', () => {
    const paid = vi.fn();
    expect(() => {
      requireVerifiedTokenReservation('ask_course', 'gemini-3.6-flash');
      paid();
    }).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');
    expect(paid).not.toHaveBeenCalled();

    const evaluation = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gemini-3.6-flash',
      hasAuthoritativeTokenizerProof: false,
    });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toBe('TOKEN_INPUT_BOUND_UNVERIFIED');
    expect(evaluation.isAuthoritative).toBe(false);
  });

  it('output ceiling alone cannot be substituted as total token ceiling', () => {
    const evalResult = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gpt-4o',
      declaredInputTokens: 5000,
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 1,
    });

    expect(evalResult.allowed).toBe(true);
    // Total reservation must strictly exceed output ceiling alone
    expect(evalResult.totalReservationTokens).toBeGreaterThan(SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS);
    expect(evalResult.totalReservationTokens).toBe(5000 + SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS);
  });

  it('non-positive, non-integer, or oversized NaN input token declarations are rejected', () => {
    for (const invalidInput of [0, -100, 1.5, NaN, Infinity, undefined as any]) {
      const evaluation = evaluateAuthoritativeTokenBound({
        capability: 'ask_course',
        model: 'gemini-3.6-flash',
        declaredInputTokens: invalidInput,
        hasAuthoritativeTokenizerProof: true,
      });

      expect(evaluation.allowed).toBe(false);
      expect(evaluation.reason).toBe('INVALID_INPUT_TOKEN_BOUND');
    }
  });

  it('vision tile token ceiling is explicitly bounded and added to reservation', () => {
    const textOnly = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gpt-4o',
      declaredInputTokens: 2000,
      hasVision: false,
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 1,
    });

    const withVisionMultiTile = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gpt-4o',
      declaredInputTokens: 2000,
      hasVision: true,
      visionTileCount: 2, // 2 tiles: 85 + 2 * 170 = 425 tokens
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 1,
    });

    const withVisionSingleImageDefault = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gpt-4o',
      declaredInputTokens: 2000,
      hasVision: true,
      visionTileCount: 1, // Default single image high-detail ceiling = 1,445 tokens
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 1,
    });

    expect(textOnly.allowed).toBe(true);
    expect(withVisionMultiTile.allowed).toBe(true);
    expect(withVisionMultiTile.visionCeilingTokens).toBe(85 + 2 * 170); // 425
    expect(withVisionMultiTile.totalReservationTokens).toBe(
      textOnly.totalReservationTokens! + 425
    );

    expect(withVisionSingleImageDefault.allowed).toBe(true);
    expect(withVisionSingleImageDefault.visionCeilingTokens).toBe(1445);
    expect(withVisionSingleImageDefault.totalReservationTokens).toBe(
      textOnly.totalReservationTokens! + 1445
    );
  });

  it('retry exposure multiplier expands reservation proportionally to max attempts', () => {
    const singleAttempt = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gemini-3.6-flash',
      declaredInputTokens: 1000,
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 1,
    });

    const tripleAttempt = evaluateAuthoritativeTokenBound({
      capability: 'ask_course',
      model: 'gemini-3.6-flash',
      declaredInputTokens: 1000,
      hasAuthoritativeTokenizerProof: true,
      maxAttempts: 3,
    });

    expect(singleAttempt.allowed).toBe(true);
    expect(tripleAttempt.allowed).toBe(true);
    expect(tripleAttempt.attemptsMultiplier).toBe(3);
    expect(tripleAttempt.totalReservationTokens).toBe(
      singleAttempt.totalReservationTokens! * 3
    );
  });

  it('conservative settlement retains full reservation when usage is unconfirmed or partial', async () => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'ai_gateway_project_begin') {
        return { data: { ok: true, reservation_id: 'res-unknown-usage' }, error: null };
      }
      if (fn === 'ai_gateway_project_settle') {
        return { data: { ok: true, settled_tokens: args.p_actual_tokens }, error: null };
      }
      return { data: { ok: true }, error: null };
    });

    const store = createPostgresProjectSpendingStore({ rpc });
    const decision = await store.begin({
      userId: 'user-adv-1',
      capability: 'ask_course',
      config: { maxDailyTokens: 50000 },
      estimatedTokens: 8500,
    });

    expect(decision.allowed).toBe(true);
    // Settle with undefined / missing usage -> retains full conservative 8500 tokens
    const settlement = await decision.settleReservation(8500);
    expect(settlement.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('ai_gateway_project_settle', {
      p_reservation_id: 'res-unknown-usage',
      p_actual_tokens: 8500,
    });
  });

  it('conflicting or duplicate settlement is rejected with ACCOUNTING_UNCONFIRMED', async () => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'ai_gateway_project_begin') {
        return { data: { ok: true, reservation_id: 'res-conflict' }, error: null };
      }
      if (fn === 'ai_gateway_project_settle') {
        return { data: { ok: true, settled_tokens: args.p_actual_tokens }, error: null };
      }
      return { data: { ok: true }, error: null };
    });

    const store = createPostgresProjectSpendingStore({ rpc });
    const decision = await store.begin({
      userId: 'user-adv-2',
      capability: 'ask_course',
      config: { maxDailyTokens: 50000 },
      estimatedTokens: 3000,
    });

    const first = await decision.settleReservation(2500);
    expect(first.ok).toBe(true);

    // Second conflicting settlement with different tokens must fail
    const conflict = await decision.settleReservation(1000);
    expect(conflict.ok).toBe(false);
    expect(conflict.error).toBe('ACCOUNTING_UNCONFIRMED');
  });

  describe('Authoritative BPE Tokenizer Bounds & Model Classification', () => {
    it('accurately identifies authoritative byte-level BPE models and rejects unverified ones', () => {
      // Allowlisted OpenAI BPE models
      expect(isAuthoritativeBpeModel('gpt-4o')).toBe(true);
      expect(isAuthoritativeBpeModel('gpt-4o-mini')).toBe(true);
      expect(isAuthoritativeBpeModel('gpt-4-turbo')).toBe(true);
      expect(isAuthoritativeBpeModel('gpt-4')).toBe(true);
      expect(isAuthoritativeBpeModel('o1')).toBe(true);
      expect(isAuthoritativeBpeModel('o3-mini')).toBe(true);
      // Synthetic or unverified models must strictly fail closed
      expect(isAuthoritativeBpeModel('o4-mini')).toBe(false);
      expect(isAuthoritativeBpeModel('gpt-5.6-luna')).toBe(false);
      expect(isAuthoritativeBpeModel('gpt-6-astra')).toBe(false);
      expect(isAuthoritativeBpeModel('gpt-4.1')).toBe(false);

      // Unverified models must be rejected
      expect(isAuthoritativeBpeModel('gemini-3.6-flash')).toBe(false);
      expect(isAuthoritativeBpeModel('gemini-2.5-flash')).toBe(false);
      expect(isAuthoritativeBpeModel('claude-3-5-sonnet')).toBe(false);
      expect(isAuthoritativeBpeModel('unknown')).toBe(false);
      expect(isAuthoritativeBpeModel('')).toBe(false);
      expect(isAuthoritativeBpeModel(undefined)).toBe(false);
    });

    it('identifies authoritative byte-level BPE embedding models', () => {
      expect(isAuthoritativeBpeEmbeddingModel('text-embedding-3-small')).toBe(true);
      expect(isAuthoritativeBpeEmbeddingModel('text-embedding-3-large')).toBe(true);
      expect(isAuthoritativeBpeEmbeddingModel('text-embedding-ada-002')).toBe(true);

      expect(isAuthoritativeBpeEmbeddingModel('text-embedding-004')).toBe(false);
      expect(isAuthoritativeBpeEmbeddingModel('custom-embedder')).toBe(false);
      expect(isAuthoritativeBpeEmbeddingModel(undefined)).toBe(false);
    });

    it('calculates provable upper bounds on embedding tokens across languages and emojis', () => {
      // Empty input
      expect(calculateAuthoritativeEmbeddingBound([])).toBe(0);
      expect(calculateAuthoritativeEmbeddingBound([''])).toBe(100); // 100 token floor

      // English text: UTF-8 bytes = ASCII chars
      const ascii = 'The quick brown fox jumps over the lazy dog';
      const asciiBound = calculateAuthoritativeEmbeddingBound(ascii);
      expect(asciiBound).toBe(Math.max(100, ascii.length + 8));

      // Multilingual: Hebrew, Arabic, Cyrillic (2 bytes per char in UTF-8)
      const hebrew = 'שלום עולם מבחן חישוב טוקנים';
      const hebrewBytes = new TextEncoder().encode(hebrew).length;
      expect(hebrewBytes).toBeGreaterThan(hebrew.length);
      const hebrewBound = calculateAuthoritativeEmbeddingBound(hebrew);
      expect(hebrewBound).toBe(Math.max(100, hebrewBytes + 8));

      // Emoji: 4 bytes per emoji
      const emojis = '😀🚀🌍🔥💡🎉';
      const emojiBytes = new TextEncoder().encode(emojis).length;
      const emojiBound = calculateAuthoritativeEmbeddingBound(emojis);
      expect(emojiBound).toBe(Math.max(100, emojiBytes + 8));

      // Multi-string batching: applies per-item framing and sums all bytes
      const batch = ['chunk 1', 'chunk 2', 'חלק 3'];
      const batchBytes = batch.reduce((sum, s) => sum + new TextEncoder().encode(s).length, 0);
      const batchBound = calculateAuthoritativeEmbeddingBound(batch);
      expect(batchBound).toBe(Math.max(batch.length * 100, batchBytes + batch.length * 8));

      // Non-BPE embedding model rejects bound calculation
      expect(() => calculateAuthoritativeEmbeddingBound(ascii, 'unverified-model')).toThrow('TOKEN_EMBEDDING_BOUND_UNVERIFIED');
    });

    it('measures authoritative payload input bounds for explain_selection and ask_course', () => {
      // explain_selection with verified model
      const explainReq = {
        capability: 'explain_selection',
        context: {
          academic: { sectionId: 'sec-1', sectionTitle: 'Linear Algebra' },
          focus: { kind: 'text', text: 'Matrix eigenvalues and eigenvectors' },
          surroundings: {
            blocks: [
              { role: 'previous', blockKind: 'text', content: { type: 'text', text: 'Prior theorem context' } },
            ],
            truncated: false,
          },
        },
      };

      const explainBound = calculateAuthoritativePayloadInputBound(explainReq, 'gpt-4o');
      expect(explainBound.isAuthoritative).toBe(true);
      expect(explainBound.declaredInputTokens).toBeGreaterThanOrEqual(500);
      expect(explainBound.hasVision).toBe(false);

      // ask_course with verified model and recent turns
      const askReq = {
        capability: 'ask_course',
        sectionId: 'sec-1',
        question: 'Explain how to compute the determinant of a 3x3 matrix',
        recentTurns: [
          { role: 'user', content: 'What is a matrix?' },
          { role: 'assistant', content: 'A matrix is a rectangular array of numbers.' },
        ],
      };

      const askBound = calculateAuthoritativePayloadInputBound(askReq, 'gpt-4o');
      expect(askBound.isAuthoritative).toBe(true);
      expect(askBound.declaredInputTokens).toBeGreaterThanOrEqual(1000);
      // Must cover system prompt ceiling (15,000), retrieval ceiling (24,000), question, turns, and embedding query allowance
      expect(askBound.declaredInputTokens).toBeGreaterThan(39000);

      // ask_course with visual selection capture
      const visualReq = {
        capability: 'ask_course',
        sectionId: 'sec-1',
        question: 'Solve this diagram',
        capture: {
          kind: 'visual_selection',
          imageBytes: new Uint8Array([1, 2, 3]),
          pageNumber: 1,
        },
      };
      const visualBound = calculateAuthoritativePayloadInputBound(visualReq, 'gpt-4o');
      expect(visualBound.isAuthoritative).toBe(true);
      expect(visualBound.hasVision).toBe(true);
      expect(visualBound.visionTileCount).toBe(1);

      // Unverified models return isAuthoritative: false
      const unverifiedBound = calculateAuthoritativePayloadInputBound(askReq, 'gemini-3.6-flash');
      expect(unverifiedBound.isAuthoritative).toBe(false);
      expect(unverifiedBound.declaredInputTokens).toBe(0);

      // Synthetic models return isAuthoritative: false
      const syntheticBound = calculateAuthoritativePayloadInputBound(askReq, 'gpt-5.6-luna');
      expect(syntheticBound.isAuthoritative).toBe(false);
      expect(syntheticBound.declaredInputTokens).toBe(0);
    });

    it('requireVerifiedTokenReservation succeeds with verified payload bounds and fails without them', () => {
      // 1. Without options, fails closed even for BPE models (containment invariant)
      expect(() => requireVerifiedTokenReservation('ask_course', 'gpt-4o')).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');

      // 2. With verified options on verified model, returns exact authoritative reservation
      const res = requireVerifiedTokenReservation('ask_course', 'gpt-4o', {
        declaredInputTokens: 5000,
        hasVision: false,
        maxAttempts: 1,
      });
      expect(res).toBe(5000 + SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS);

      // 3. Reasoning model includes SERVER_REASONING_MAX_OUTPUT_TOKENS (8000)
      const reasoningRes = requireVerifiedTokenReservation('ask_course', 'o1', {
        declaredInputTokens: 5000,
        hasVision: false,
        maxAttempts: 1,
      });
      expect(reasoningRes).toBe(5000 + SERVER_REASONING_MAX_OUTPUT_TOKENS);

      const o3MiniRes = requireVerifiedTokenReservation('ask_course', 'o3-mini', {
        declaredInputTokens: 5000,
        hasVision: false,
        maxAttempts: 1,
      });
      expect(o3MiniRes).toBe(5000 + SERVER_REASONING_MAX_OUTPUT_TOKENS);

      // 4. Synthetic model fails closed even when options are provided
      expect(() => requireVerifiedTokenReservation('ask_course', 'gpt-5.6-luna', {
        declaredInputTokens: 5000,
        maxAttempts: 1,
      })).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');

      // 5. Unverified model fails closed even when options are provided
      expect(() => requireVerifiedTokenReservation('ask_course', 'gemini-3.6-flash', {
        declaredInputTokens: 5000,
        maxAttempts: 1,
      })).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');

      // 6. Unknown model fails closed
      expect(() => requireVerifiedTokenReservation('ask_course', 'unknown-model', {
        declaredInputTokens: 5000,
      })).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');
    });

    it('verifyFinalProviderPayloadBound enforces strict pre-dispatch gating on fully assembled messages', () => {
      const messages = [
        { role: 'system', content: 'You are ZIKUK academic tutor.' },
        { role: 'user', content: 'What is an eigenvalue?' },
      ];

      // 1. Success when payload fits within reserved liability
      const valid = verifyFinalProviderPayloadBound({
        capability: 'ask_course',
        model: 'gpt-4o',
        messages,
        maxTokens: 2048,
        reservedTokens: 10000,
        embeddingTokens: 250,
      });
      expect(valid.ok).toBe(true);
      expect(valid.totalRequiredTokens).toBeLessThan(10000);
      expect(valid.reservedTokens).toBe(10000);

      // 2. Fails closed when payload exceeds reserved liability
      const overflow = verifyFinalProviderPayloadBound({
        capability: 'ask_course',
        model: 'gpt-4o',
        messages,
        maxTokens: 2048,
        reservedTokens: 100, // Insufficient reservation
      });
      expect(overflow.ok).toBe(false);
      expect(overflow.code).toBe('quota_exceeded');
      expect(overflow.error).toContain('RESERVATION_EXPOSURE_EXCEEDED');

      // 3. Fails closed on unverified or synthetic models
      const unverified = verifyFinalProviderPayloadBound({
        capability: 'ask_course',
        model: 'gpt-5.6-luna',
        messages,
        maxTokens: 2048,
        reservedTokens: 10000,
      });
      expect(unverified.ok).toBe(false);
      expect(unverified.code).toBe('unauthorized_inference');
      expect(unverified.error).toContain('TOKEN_INPUT_BOUND_UNVERIFIED');

      // 4. Accounts for OpenAI vision ceiling (1,445 tokens per image part)
      const visualMessages = [
        { role: 'system', content: 'Vision tutor' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Solve this' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
          ],
        },
      ];
      const visualCheck = verifyFinalProviderPayloadBound({
        capability: 'ask_course',
        model: 'gpt-4o',
        messages: visualMessages,
        maxTokens: 2048,
        reservedTokens: 10000,
      });
      expect(visualCheck.ok).toBe(true);
      expect(visualCheck.totalRequiredTokens).toBeGreaterThanOrEqual(1445 + 2048);
    });
  });
});
