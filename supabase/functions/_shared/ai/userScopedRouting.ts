/**
 * Server-controlled QA model routing (Phase 6A.1).
 *
 * Allows designated, authenticated staging QA users to route to an experimental
 * model (e.g. gemini-3.6-flash) while all other users strictly retain the
 * standard production/staging AI_MODEL baseline (e.g. gpt-5.6-luna).
 *
 * Invariants:
 * 1. Disabled by default (when AI_GEMINI_ALLOWED_USERS is empty or not set).
 * 2. Authenticated user ID (from verified Supabase Auth JWT) is required;
 *    never uses client-supplied identifiers or headers.
 * 3. Client cannot select or override the provider or model.
 * 4. Fail-closed: if an allowlisted user routes to Gemini but Gemini credentials
 *    are missing or configuration is invalid, the request fails closed with an
 *    internal error rather than silently falling back.
 * 5. Production behavior is 100% untouched when unconfigured.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParseAllowlistResult = {
  ok: boolean;
  userIds: Set<string>;
  error?: string;
};

/**
 * Parses a comma-, semicolon-, or whitespace-delimited list of authorized user UUIDs.
 * Enforces strict UUID formatting to prevent configuration mistakes.
 */
export function parseAllowedUserIds(raw: string | undefined | null): ParseAllowlistResult {
  if (!raw || typeof raw !== 'string') {
    return { ok: true, userIds: new Set() };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, userIds: new Set() };
  }

  const tokens = trimmed
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const userIds = new Set<string>();
  for (const token of tokens) {
    if (!UUID_REGEX.test(token)) {
      return {
        ok: false,
        userIds: new Set(),
        error: `Invalid UUID in allowed users configuration: "${token}"`,
      };
    }
    userIds.add(token);
  }

  return { ok: true, userIds };
}

export type ResolveEffectiveModelInput = {
  /** Authenticated user ID from verified Supabase JWT. */
  authUserId: string | null | undefined;
  /** Default server model (from AI_MODEL secret). */
  defaultModel: string;
  /** Raw server allowlist string (from AI_GEMINI_ALLOWED_USERS). */
  geminiAllowedUsersRaw?: string | null;
  /** Configured test model for allowlisted users (from AI_GEMINI_TEST_MODEL). Defaults to 'gemini-3.6-flash'. */
  geminiTestModelRaw?: string | null;
  /** Whether Gemini API key is configured on the server. */
  hasGeminiApiKey: boolean;
};

export type ResolveEffectiveModelSuccess = {
  ok: true;
  model: string;
  isTestRouted: boolean;
};

export type ResolveEffectiveModelFailure = {
  ok: false;
  error: {
    code: 'internal_error' | 'unauthenticated';
    reason: string;
    message: string;
  };
};

export type ResolveEffectiveModelResult =
  | ResolveEffectiveModelSuccess
  | ResolveEffectiveModelFailure;

/**
 * Resolves the effective model for an authenticated gateway request.
 *
 * Must be called strictly AFTER JWT authentication and preflight validation.
 */
export function resolveEffectiveModelForUser(
  input: ResolveEffectiveModelInput,
): ResolveEffectiveModelResult {
  const defaultModel = (input.defaultModel || '').trim();
  if (!defaultModel) {
    return {
      ok: false,
      error: {
        code: 'internal_error',
        reason: 'missing_default_model',
        message: 'AI Gateway model is not configured.',
      },
    };
  }

  // 1. If no allowlist is configured, return default model (disabled by default)
  if (!input.geminiAllowedUsersRaw || !input.geminiAllowedUsersRaw.trim()) {
    return {
      ok: true,
      model: defaultModel,
      isTestRouted: false,
    };
  }

  // 2. Parse allowlist strictly
  const allowlist = parseAllowedUserIds(input.geminiAllowedUsersRaw);
  if (!allowlist.ok) {
    // Malformed allowlist configuration must NEVER disrupt regular users or take down the baseline service.
    // Log the error loudly, disable test routing, and safely fall back to the default baseline model for all users.
    console.error(
      JSON.stringify({
        event: 'user_scoped_routing_error',
        reason: 'malformed_allowlist_fallback_to_baseline',
        error: allowlist.error,
      }),
    );
    return {
      ok: true,
      model: defaultModel,
      isTestRouted: false,
    };
  }

  // If allowlist is empty after parsing
  if (allowlist.userIds.size === 0) {
    return {
      ok: true,
      model: defaultModel,
      isTestRouted: false,
    };
  }

  // 3. User must be authenticated to match allowlist
  if (!input.authUserId || typeof input.authUserId !== 'string') {
    // Unauthenticated requests cannot match any allowlist
    return {
      ok: true,
      model: defaultModel,
      isTestRouted: false,
    };
  }

  const normalizedUserId = input.authUserId.trim().toLowerCase();
  const isAllowlisted = allowlist.userIds.has(normalizedUserId);

  // 4. Non-allowlisted users retain baseline
  if (!isAllowlisted) {
    return {
      ok: true,
      model: defaultModel,
      isTestRouted: false,
    };
  }

  // 5. Allowlisted user: resolve test model and verify credentials (fail closed)
  const testModel = (input.geminiTestModelRaw || 'gemini-3.6-flash').trim();
  if (!testModel.toLowerCase().startsWith('gemini-')) {
    console.error(
      JSON.stringify({
        event: 'user_scoped_routing_error',
        reason: 'invalid_gemini_test_model',
        model: testModel,
      }),
    );
    return {
      ok: false,
      error: {
        code: 'internal_error',
        reason: 'invalid_gemini_test_model',
        message: 'AI Gateway test model configuration is invalid.',
      },
    };
  }

  if (!input.hasGeminiApiKey) {
    console.error(
      JSON.stringify({
        event: 'user_scoped_routing_error',
        reason: 'missing_gemini_api_key_for_allowlisted_user',
        userId: normalizedUserId,
      }),
    );
    return {
      ok: false,
      error: {
        code: 'internal_error',
        reason: 'missing_gemini_api_key',
        message: 'AI Gateway test provider is not configured.',
      },
    };
  }

  return {
    ok: true,
    model: testModel,
    isTestRouted: true,
  };
}
