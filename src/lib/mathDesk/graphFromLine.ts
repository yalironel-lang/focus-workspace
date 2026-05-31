import { normalizeLineForCheck } from './deskCheck';
import { safeEvaluateExpression, validateGraphExpression } from '../safeMathExpr';

export type GraphFromLineResult =
  | { ok: true; normalized: string; source: string }
  | { ok: false; reason: 'empty' | 'not_graphable' };

/** Collect expression candidates from one derivation line. */
function candidatesFromLine(raw: string): string[] {
  const t = normalizeLineForCheck(raw);
  if (!t) return [];

  const out: string[] = [t];

  const yMatch = t.match(/^\s*y\s*=\s*(.+)$/i);
  if (yMatch?.[1]?.trim()) out.push(yMatch[1].trim());

  const fxMatch = t.match(/^\s*f\s*\(\s*x\s*\)\s*=\s*(.+)$/i);
  if (fxMatch?.[1]?.trim()) out.push(fxMatch[1].trim());

  const eqIdx = t.indexOf('=');
  if (eqIdx > 0 && eqIdx < t.length - 1) {
    const left = t.slice(0, eqIdx).trim();
    const right = t.slice(eqIdx + 1).trim();
    if (right && !looksLikeNumericBalance(left, right)) {
      out.push(right);
      if (!/[a-zA-Z]/.test(left) || /^y$/i.test(left)) {
        out.push(left);
      }
    }
  }

  return [...new Set(out.map(s => s.trim()).filter(Boolean))];
}

/** True when both sides are plain numeric equalities (2+3=5), not functions of x. */
function looksLikeNumericBalance(left: string, right: string): boolean {
  if (/[a-zA-Z]/.test(left + right)) {
    const hasX = /\bx\b/i.test(left + right);
    if (hasX) return false;
  }
  const l = safeEvaluateExpression(left, {});
  const r = safeEvaluateExpression(right, {});
  return l.ok && r.ok;
}

/**
 * Pick a graphable expression from paper line text, if any.
 */
export function extractGraphableFromLine(rawLine: string): GraphFromLineResult {
  const candidates = candidatesFromLine(rawLine);
  if (!candidates.length) return { ok: false, reason: 'empty' };

  for (const source of candidates) {
    const v = validateGraphExpression(source);
    if (v.ok) return { ok: true, normalized: v.normalized, source };
  }

  return { ok: false, reason: 'not_graphable' };
}
