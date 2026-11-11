import { describe, it, expect } from 'vitest';
import {
  parseAllowedUserIds,
  resolveEffectiveModelForUser,
} from './userScopedRouting.ts';
import { preflightGatewayRequest } from './preflightGatewayRequest.ts';

describe('User-Scoped Gemini Routing (Phase 6A.1)', () => {
  const QA_USER_ID = '36e9cf41-95d7-49df-8e64-983f421b452c';
  const OTHER_USER_ID = 'fdf687c3-6580-4c96-a49e-63455dd439a4';
  const DEFAULT_MODEL = 'gpt-5.6-luna';
  const TEST_MODEL = 'gemini-3.6-flash';

  describe('1. Allowlist Parsing & UUID Validation', () => {
    it('returns empty set when raw configuration is empty, undefined, or whitespace', () => {
      expect(parseAllowedUserIds(undefined)).toEqual({ ok: true, userIds: new Set() });
      expect(parseAllowedUserIds(null)).toEqual({ ok: true, userIds: new Set() });
      expect(parseAllowedUserIds('')).toEqual({ ok: true, userIds: new Set() });
      expect(parseAllowedUserIds('   ')).toEqual({ ok: true, userIds: new Set() });
    });

    it('parses single and multiple valid UUIDs with various delimiters', () => {
      const single = parseAllowedUserIds(QA_USER_ID);
      expect(single.ok).toBe(true);
      expect(single.userIds.has(QA_USER_ID)).toBe(true);

      const multi = parseAllowedUserIds(`${QA_USER_ID}, ${OTHER_USER_ID}`);
      expect(multi.ok).toBe(true);
      expect(multi.userIds.size).toBe(2);
      expect(multi.userIds.has(QA_USER_ID)).toBe(true);
      expect(multi.userIds.has(OTHER_USER_ID)).toBe(true);

      const mixed = parseAllowedUserIds(`${QA_USER_ID};\n${OTHER_USER_ID}   `);
      expect(mixed.ok).toBe(true);
      expect(mixed.userIds.size).toBe(2);
    });

    it('normalizes uppercase UUIDs to lowercase', () => {
      const upper = QA_USER_ID.toUpperCase();
      const res = parseAllowedUserIds(upper);
      expect(res.ok).toBe(true);
      expect(res.userIds.has(QA_USER_ID.toLowerCase())).toBe(true);
    });

    it('fails closed when configuration contains an invalid non-UUID token', () => {
      const res = parseAllowedUserIds(`${QA_USER_ID}, not-a-uuid`);
      expect(res.ok).toBe(false);
      expect(res.userIds.size).toBe(0);
      expect(res.error).toContain('Invalid UUID');
    });

    it('fails closed when email address is mistakenly provided instead of UUID', () => {
      const res = parseAllowedUserIds('c11-qa-tester@focus-staging.internal');
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Invalid UUID');
    });
  });

  describe('2. Model Resolution Invariants', () => {
    it('disabled by default: all users retain baseline when allowlist is empty or unconfigured', () => {
      // Unconfigured (production default)
      const res1 = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: undefined,
        hasGeminiApiKey: true,
      });
      expect(res1).toEqual({
        ok: true,
        model: DEFAULT_MODEL,
        isTestRouted: false,
      });

      // Empty string
      const res2 = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: '   ',
        hasGeminiApiKey: true,
      });
      expect(res2).toEqual({
        ok: true,
        model: DEFAULT_MODEL,
        isTestRouted: false,
      });
    });

    it('routes specifically authorized QA user to Gemini when configured', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: QA_USER_ID,
        geminiTestModelRaw: TEST_MODEL,
        hasGeminiApiKey: true,
      });
      expect(res).toEqual({
        ok: true,
        model: TEST_MODEL,
        isTestRouted: true,
      });
    });

    it('retains baseline gpt-5.6-luna for non-allowlisted users', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: OTHER_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: QA_USER_ID,
        geminiTestModelRaw: TEST_MODEL,
        hasGeminiApiKey: true,
      });
      expect(res).toEqual({
        ok: true,
        model: DEFAULT_MODEL,
        isTestRouted: false,
      });
    });

    it('defaults test model to gemini-3.6-flash if AI_GEMINI_TEST_MODEL is omitted', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: QA_USER_ID,
        geminiTestModelRaw: undefined,
        hasGeminiApiKey: true,
      });
      expect(res).toEqual({
        ok: true,
        model: 'gemini-3.6-flash',
        isTestRouted: true,
      });
    });

    it('fails closed if allowlisted user routes to Gemini but server lacks GEMINI_API_KEY', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: QA_USER_ID,
        geminiTestModelRaw: TEST_MODEL,
        hasGeminiApiKey: false, // Key missing!
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('internal_error');
        expect(res.error.reason).toBe('missing_gemini_api_key');
      }
    });

    it('safely falls back to baseline model on malformed allowlist configuration without disrupting users', () => {
      // For both QA user and standard user, malformed allowlist configuration
      // must safely deactivate experimental routing and retain baseline gpt-5.6-luna.
      const resQa = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: 'malformed-entry-not-uuid',
        hasGeminiApiKey: true,
      });
      expect(resQa).toEqual({
        ok: true,
        model: DEFAULT_MODEL,
        isTestRouted: false,
      });

      const resOther = resolveEffectiveModelForUser({
        authUserId: OTHER_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: 'malformed-entry-not-uuid',
        hasGeminiApiKey: true,
      });
      expect(resOther).toEqual({
        ok: true,
        model: DEFAULT_MODEL,
        isTestRouted: false,
      });
    });

    it('fails closed if configured test model does not have a gemini- prefix', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: QA_USER_ID,
        geminiTestModelRaw: 'claude-sonnet-4-5', // Invalid target!
        hasGeminiApiKey: true,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('internal_error');
        expect(res.error.reason).toBe('invalid_gemini_test_model');
      }
    });

    it('fails closed if default model is missing or empty', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: QA_USER_ID,
        defaultModel: '',
        geminiAllowedUsersRaw: QA_USER_ID,
        hasGeminiApiKey: true,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('internal_error');
        expect(res.error.reason).toBe('missing_default_model');
      }
    });

    it('unauthenticated requests cannot match any allowlist', () => {
      const res = resolveEffectiveModelForUser({
        authUserId: null,
        defaultModel: DEFAULT_MODEL,
        geminiAllowedUsersRaw: QA_USER_ID,
        hasGeminiApiKey: true,
      });
      expect(res).toEqual({
        ok: true,
        model: DEFAULT_MODEL,
        isTestRouted: false,
      });
    });
  });

  describe('3. Security & Cross-User Boundaries', () => {
    it('client-provided model override in payload is strictly rejected at preflight', () => {
      const payloadWithModel = {
        version: 1,
        capability: 'ask_course',
        sectionId: '485282c1-dba3-4425-a900-65181a3e477a',
        question: 'Solve this calculus question',
        model: 'gemini-3.6-flash', // Client attempted model injection!
      };

      const preflight = preflightGatewayRequest({
        body: payloadWithModel,
        authUserId: OTHER_USER_ID, // Non-allowlisted user
      });

      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.response.error.code).toBe('invalid_request');
        expect(preflight.response.error.message).toContain('Unsupported field: model');
      }
    });

    it('client-provided provider override in payload is strictly rejected at preflight', () => {
      const payloadWithProvider = {
        version: 1,
        capability: 'ask_course',
        sectionId: '485282c1-dba3-4425-a900-65181a3e477a',
        question: 'Solve this calculus question',
        provider: 'gemini', // Client attempted provider injection!
      };

      const preflight = preflightGatewayRequest({
        body: payloadWithProvider,
        authUserId: QA_USER_ID,
      });

      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.response.error.code).toBe('invalid_request');
        expect(preflight.response.error.message).toContain('Unsupported field: provider');
      }
    });

    it('unauthenticated requests are rejected before model routing', () => {
      const preflight = preflightGatewayRequest({
        body: {
          version: 1,
          capability: 'ask_course',
          sectionId: '485282c1-dba3-4425-a900-65181a3e477a',
          question: 'Solve this calculus question',
        },
        authUserId: null, // No JWT
      });

      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.response.error.code).toBe('unauthenticated');
      }
    });

    it('allowlisted user routing to Gemini cannot bypass user mismatch in explain_selection', () => {
      const preflight = preflightGatewayRequest({
        body: {
          version: 1,
          capability: 'explain_selection',
          context: {
            identity: { userId: OTHER_USER_ID }, // Foreign user context
            academic: { sectionId: '485282c1-dba3-4425-a900-65181a3e477a' },
            focus: { kind: 'text', text: 'Some text' },
            surroundings: { blocks: [] },
          },
        },
        authUserId: QA_USER_ID, // QA user authenticated
      });

      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.response.error.code).toBe('auth_mismatch');
      }
    });
  });
});
