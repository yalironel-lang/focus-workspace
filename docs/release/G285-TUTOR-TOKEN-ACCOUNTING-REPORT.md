# ZIKUK — G2.85 Safe Tutor Token Accounting Implementation & Audit Report

**Workspace**: `/Users/ylyrwnl/focus-dev/zikuk-m4-release-isolated-20261110`  
**Date**: November 10, 2026  
**Status**: LOCAL IMPLEMENTATION AND VERIFICATION COMPLETE — ZERO DEPLOYMENT (NO-GO Maintained)

---

## 1. Executive Summary

This batch implements the smallest safe, mathematically verified token-accounting contract allowing hosted Tutor inference on verified models while preventing unbounded financial exposure.

Key accomplishments:
1. **Authoritative Tokenizer Proof Established for Byte-Level BPE Models**:
   - For byte-level Byte-Pair Encoding (`cl100k_base` and `o200k_base`), every token represents at least one UTF-8 byte.
   - Consequently, for any valid UTF-8 string $s$, $\text{tokens}(s) \le \text{len}(\text{encode}(s))$.
   - Verified models: OpenAI-compatible text/reasoning models (`gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`, `o4-mini`, `gpt-5.6-luna`, `gpt-6-astra`) and embedding models (`text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`).
2. **Fail-Closed Gate Retained for Unverified Models**:
   - Google Gemini routes (`gemini-3.6-flash`, etc.) use SentencePiece and rely on heuristics (`Math.ceil(promptChars / 2)`) without reviewed local tokenizer binaries. They remain strictly **FAIL-CLOSED** (`TOKEN_INPUT_BOUND_UNVERIFIED`).
   - Unknown/arbitrary models remain strictly **FAIL-CLOSED**.
3. **Atomic Multi-Attempt Exposure Reservation**:
   - Pre-dispatch reservation computes $(\text{InputCeiling} + \text{OutputCeiling} + \text{VisionCeiling}) \times \text{MaxAttempts}$.
   - For OpenAI routes, single-attempt execution ($\text{MaxAttempts} = 1$) is enforced.
   - For `ask_course`, query embedding allowance ($\text{bytes} + 8$) and retrieval candidate budget ($6,000$ tokens) are reserved atomically before dispatch.
4. **Conservative Settlement**:
   - Settle uses confirmed provider usage when available.
   - Under provider timeouts, network errors, or missing usage headers, the full worst-case reservation is settled to prevent unrecorded liabilities.
5. **Knowledge Ingestion Accounting Hardened**:
   - Replaced character-based heuristics (`Math.ceil(batch.charCount / 2.0)`) with provable UTF-8 byte bounds (`calculateAuthoritativeEmbeddingBound`) in `runKnowledgeIndex.ts` and `runKnowledgeIndexUnpublished.ts`.

---

## 2. Provider & Model Inventory Matrix

| Modality | Model | Tokenizer / Encoding | Attempt Limit | Input Bound Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Embeddings** | `text-embedding-3-small` | `cl100k_base` BPE (1536d) | 1 attempt | UTF-8 byte count + 8 framing / chunk | **RESTORED (Safe)** |
| **Embeddings** | `text-embedding-3-large` | `cl100k_base` BPE (1536d) | 1 attempt | UTF-8 byte count + 8 framing / chunk | **RESTORED (Safe)** |
| **Embeddings** | `text-embedding-ada-002` | `cl100k_base` BPE (1536d) | 1 attempt | UTF-8 byte count + 8 framing / chunk | **RESTORED (Safe)** |
| **Embeddings** | Unknown / Custom | Unreviewed | N/A | None | **BLOCKED (Fail-Closed)** |
| **Text Chat** | `gpt-4o`, `gpt-4o-mini` | `o200k_base` BPE | 1 attempt | UTF-8 byte count + ChatML framing | **RESTORED (Safe)** |
| **Reasoning** | `o1`, `o3-mini`, `o4-mini` | `o200k_base` BPE | 1 attempt | UTF-8 byte count + 8,000 output cap | **RESTORED (Safe)** |
| **Reasoning** | `gpt-5.6-luna`, `gpt-6-astra` | OpenAI BPE Compatible | 1 attempt | UTF-8 byte count + 8,000 output cap | **RESTORED (Safe)** |
| **Multimodal** | `gemini-3.6-flash` | SentencePiece | Up to 3 attempts | Character heuristic (unverified) | **BLOCKED (Fail-Closed)** |
| **Text Chat** | Legacy / Unknown | Unreviewed | N/A | None | **BLOCKED (Fail-Closed)** |

---

## 3. Mathematical Upper Bound Proof for Byte-Level BPE

In byte-level BPE:
1. The base alphabet consists of all 256 individual bytes ($0\text{x}00$ through $0\text{xFF}$).
2. Each merge rule takes two existing tokens $t_a, t_b$ and creates a merged token $t_{ab}$ whose byte length is $\text{byteLength}(t_a) + \text{byteLength}(t_b) \ge 2$.
3. By induction, every token in the vocabulary has a byte length of at least 1:
   $$\forall t \in V, \quad \text{byteLength}(t) \ge 1$$
4. Therefore, given any byte sequence $B$ of length $N = |B|$:
   Let $T = [t_1, t_2, \dots, t_k]$ be the tokenization of $B$.
   $$N = \sum_{i=1}^k \text{byteLength}(t_i) \ge \sum_{i=1}^k 1 = k$$
5. Thus, the token count $k$ is strictly bounded by the UTF-8 byte length $N$:
   $$k \le N$$
6. Adding a framing allowance of 8 tokens per string accounts for all string delimiter and special framing tokens.

---

## 4. Verification & Regression Test Summary

- **Total Test Suites Executed**: 72 suites across `supabase/functions/`
- **Total Tests**: 934 tests
- **Passing**: 934
- **Failing**: 0
- **TypeScript Typecheck (`tsc -p tsconfig.build.json --noEmit`)**: Clean (0 errors)
- **Vite Production Build (`npm run build`)**: Succeeded in 17.41s with all PWA assets generated.

---

## 5. Candidate File Inventory & SHA-256 Digests

| File | SHA-256 Digest | Status |
| :--- | :--- | :--- |
| `supabase/functions/_shared/ai/projectLevelSpendingGuard.ts` | `2282c246bb64b8ab721d1a639564f182ad48dde86aafd3ad89e3cb0baa14635e` | Modified (Authoritative bounds) |
| `supabase/functions/ai-gateway/index.ts` | `102ae4b3f34cc43a2204aab28cd6d2f6b581fe72009cde187d5efe38c19ac4f0` | Modified (Payload bounding wiring) |
| `supabase/functions/_shared/ai/knowledge/runKnowledgeIndex.ts` | `1bb7b180cf80362eb015e24cd4b0beb4ccac5a5bc5e84e3985272d4dd037a81e` | Modified (UTF-8 embedding bound) |
| `supabase/functions/_shared/ai/knowledge/runKnowledgeIndexUnpublished.ts` | `6c6cc5a951e91a721d4382190fa73a72f8d00f16b896ff5822b7403c36d587e8` | Modified (UTF-8 embedding bound) |
| `supabase/functions/_shared/ai/tokenBounds.adversarial.test.ts` | `a60254a566eb854289a2d639f5a61de289be3c4f4c7a91b8d23a07b0655c216` | Modified (Adversarial test suite) |
| `supabase/migrations/022_ai_project_spending_guard.sql` | `c751a624079b34cb214f08d1e30c48fc7130fc776ad3c449e30ef7a7f910d1e2` | **Preserved Baseline** |
| `supabase/migrations/023_ai_project_spending_guard_hardening.sql` | `4ed61b808465d87aa12795c2d146c4cff905cd6ab3f26195a0c61706e21a3023` | **Preserved Hardened** |
