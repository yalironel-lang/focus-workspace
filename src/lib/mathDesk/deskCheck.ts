import { safeEvaluateExpression } from '../safeMathExpr';

export type DeskCheckDisplay =
  | { kind: 'suffix'; message: string; tone: 'neutral' | 'ok' }
  | { kind: 'whisper'; message: string };

const EQ_OPS = /(<=|>=|==|!=|=>)/;

function formatNum(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) > 0 && Math.abs(n) < 1e-4)) return n.toPrecision(4);
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

/** Strip step prefix and display math. */
export function normalizeLineForCheck(raw: string): string {
  let t = raw.trim();
  if (t.startsWith('=>')) t = t.slice(2).trim();
  return t;
}

function findEquationSplit(t: string): { left: string; right: string } | null {
  if (EQ_OPS.test(t)) {
    if (t.includes('=>')) {
      const after = t.split('=>').pop()?.trim() ?? '';
      return findEquationSplitSimple(after);
    }
    return null;
  }
  return findEquationSplitSimple(t);
}

function findEquationSplitSimple(t: string): { left: string; right: string } | null {
  const idx = t.indexOf('=');
  if (idx <= 0 || idx >= t.length - 1) return null;
  const left = t.slice(0, idx).trim();
  const right = t.slice(idx + 1).trim();
  if (!left || !right) return null;
  if (/^(let|set|where|so|then)\b/i.test(left)) return null;
  return { left, right };
}

function evalSide(expr: string): { ok: true; value: number } | { ok: false } {
  const r = safeEvaluateExpression(expr, {});
  if (!r.ok) return { ok: false };
  return { ok: true, value: r.value };
}

function isMostlyProse(t: string): boolean {
  if (!t) return true;
  const words = t.match(/[a-zA-Z]{3,}/g);
  if (!words?.length) return false;
  const mathWords = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'abs']);
  const significant = words.filter(w => !mathWords.has(w.toLowerCase()));
  return significant.length >= 2 && !/[0-9=^+\-*/()]/.test(t);
}

function hasLetters(t: string): boolean {
  return /[a-zA-Z]/.test(t.replace(/=>/g, ''));
}

function unsupportedSuffix(t: string): DeskCheckDisplay {
  if (isMostlyProse(t) || hasLetters(t)) {
    return { kind: 'suffix', message: '→ add numbers to check', tone: 'neutral' };
  }
  return { kind: 'suffix', message: "→ can't evaluate", tone: 'neutral' };
}

/**
 * V1 Check: numeric expressions and equation balance only (local, no variables).
 */
export function computeDeskCheck(rawLine: string): DeskCheckDisplay {
  const t = normalizeLineForCheck(rawLine);
  if (!t) {
    return { kind: 'suffix', message: '→ —', tone: 'neutral' };
  }

  if (isMostlyProse(t)) {
    return { kind: 'suffix', message: '→ add numbers to check', tone: 'neutral' };
  }

  const eq = findEquationSplit(t);
  if (eq) {
    const l = evalSide(eq.left);
    const r = evalSide(eq.right);
    if (!l.ok || !r.ok) {
      return unsupportedSuffix(eq.left + eq.right);
    }
    const tol = 1e-6 * Math.max(1, Math.abs(l.value), Math.abs(r.value));
    const match = Math.abs(l.value - r.value) <= tol;
    if (match) {
      return { kind: 'suffix', message: '✓ balances', tone: 'ok' };
    }
    return {
      kind: 'whisper',
      message: `≠ · left ${formatNum(l.value)} · right ${formatNum(r.value)} · doesn't balance`,
    };
  }

  if (hasLetters(t)) {
    return { kind: 'suffix', message: '→ add numbers to check', tone: 'neutral' };
  }

  const ev = evalSide(t);
  if (ev.ok) {
    return { kind: 'suffix', message: `= ${formatNum(ev.value)}`, tone: 'neutral' };
  }

  return { kind: 'suffix', message: "→ can't evaluate", tone: 'neutral' };
}
