/**
 * Deterministic semantic checks for MVT theorem recovery evidence (research only).
 * No LLM fill-in. Pattern family aligned with M1.0B0 spike.
 */

export type MvtSemanticChecks = {
  continuity: boolean;
  differentiability: boolean;
  interval_domain: boolean;
  interior_point: boolean;
  conclusion: boolean;
  derivative_formula: boolean;
};

export type MvtSemanticScore = {
  checks: MvtSemanticChecks;
  score: number;
  overall: 'PASS' | 'PARTIAL' | 'FAIL';
};

export function scoreMvtTheoremEvidence(text: string): MvtSemanticScore {
  const t = text.replace(/\s+/g, ' ');
  const checks: MvtSemanticChecks = {
    continuity: /continu/i.test(t),
    differentiability: /differenti/i.test(t),
    interval_domain:
      /\[[^\]]*[a-zA-Z0-9][^\]]*,[^\]]*[a-zA-Z0-9][^\]]*\]/.test(t) ||
      /\bon\s*\[[^\]]+\]/i.test(t) ||
      /closed interval/i.test(t),
    interior_point:
      /\((?:a\s*,\s*b|[^)]+)\)/.test(t) ||
      /interior/i.test(t) ||
      /\bc\s*(∈|in)\b/i.test(t) ||
      /there exists/i.test(t),
    conclusion:
      /then/i.test(t) &&
      (/there exists|∃|such that|f\s*['′]/i.test(t) || /mean value/i.test(t)),
    derivative_formula:
      /f\s*['′]\s*\(\s*c\s*\)/.test(t) ||
      /\(f\s*\(\s*b\s*\)\s*[-−]\s*f\s*\(\s*a\s*\)\s*\)\s*\/\s*\(\s*b\s*[-−]\s*a\s*\)/.test(t) ||
      /f\(b\).*f\(a\).*(b.*a)/i.test(t),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const overall = score >= 6 ? 'PASS' : score >= 4 ? 'PARTIAL' : 'FAIL';
  return { checks, score, overall };
}
