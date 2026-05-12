/**
 * Human-friendly graph expression normalization (Free Space graph).
 * Runs before lex/parse — no eval. Desmos-ish tolerances.
 */

const FUNC_WORDS = ['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs', 'exp'] as const;
const FUNC_ALT = FUNC_WORDS.join('|');

function skipSpaces(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j]!)) j++;
  return j;
}

function canStartPow(s: string, i: number): boolean {
  const j = skipSpaces(s, i);
  if (j >= s.length) return false;
  const c = s[j]!;
  return c === '(' || /[0-9.]/.test(c) || /[a-z]/i.test(c) || c === '+' || c === '-';
}

/**
 * Exclusive end index of one * / chain (mul precedence), stopping before top-level + -.
 * Handles implicit multiplication between factors (e.g. 2x, 2 sin x inner arg).
 */
export function scanOneMulEnd(s: string, i: number): number {
  const skip = (j: number) => skipSpaces(s, j);

  const parsePrimaryEnd = (start: number): number => {
    let q = skip(start);
    if (q >= s.length) return q;
    const c = s[q]!;
    if (c === '(') {
      let depth = 1;
      q++;
      while (q < s.length && depth > 0) {
        const ch = s[q]!;
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        q++;
      }
      return q;
    }
    if (/[0-9.]/.test(c)) {
      let q2 = q + 1;
      while (q2 < s.length && /[0-9.]/.test(s[q2]!)) q2++;
      return q2;
    }
    if (/[a-z]/i.test(c)) {
      let q2 = q + 1;
      while (q2 < s.length && /[a-z0-9_]/i.test(s[q2]!)) q2++;
      return q2;
    }
    return start;
  };

  const parsePowEnd = (start: number): number => {
    let q = start;
    for (;;) {
      const t = skip(q);
      if (t >= s.length) return t;
      if (s[t] === '+' || s[t] === '-') q = t + 1;
      else break;
    }
    q = skip(q);
    let q0 = parsePrimaryEnd(q);
    let after = skip(q0);
    if (after < s.length && s[after] === '^') {
      return parsePowEnd(after + 1);
    }
    return q0;
  };

  const parseMulEndInner = (start: number): number => {
    let q = parsePowEnd(start);
    for (;;) {
      let t = skip(q);
      if (t >= s.length) return t;
      const op = s[t]!;
      if (op === '*' || op === '/') {
        q = parsePowEnd(t + 1);
        continue;
      }
      // Implicit multiplication: next token can start another pow factor.
      if (op !== '+' && op !== '-' && canStartPow(s, t)) {
        q = parsePowEnd(t);
        continue;
      }
      break;
    }
    return q;
  };

  return parseMulEndInner(i);
}

/** If at i starts a FUNC_WORD, return its length; else 0. */
function funcWordLen(s: string, i: number): number {
  const slice = s.slice(i).toLowerCase();
  for (const w of FUNC_WORDS) {
    if (slice.startsWith(w)) {
      const after = i + w.length;
      if (after < s.length && /[a-z0-9_]/i.test(s[after]!)) continue;
      return w.length;
    }
  }
  return 0;
}

/**
 * sin x → sin(x), cos x, … when not already sin(.
 */
export function wrapFuncSpaceShorthand(spaced: string): string {
  let out = '';
  let i = 0;
  while (i < spaced.length) {
    const at = skipSpaces(spaced, i);
    if (at > i) {
      out += spaced.slice(i, at);
      i = at;
    }
    if (i >= spaced.length) break;
    const fl = funcWordLen(spaced, i);
    if (fl > 0) {
      const name = spaced.slice(i, i + fl).toLowerCase();
      let j = skipSpaces(spaced, i + fl);
      if (j < spaced.length && spaced[j] === '(') {
        out += spaced.slice(i, j);
        i = j;
        continue;
      }
      const argEnd = scanOneMulEnd(spaced, j);
      if (argEnd <= j) {
        out += spaced[i]!;
        i++;
        continue;
      }
      out += `${name}(${spaced.slice(j, argEnd)})`;
      i = argEnd;
      continue;
    }
    out += spaced[i]!;
    i++;
  }
  return out;
}

function stripLeadingYEquals(s: string): string {
  return s.replace(/^\s*y\s*=\s*/i, '').trim();
}

function unicodeMinusToAscii(s: string): string {
  return s.replace(/\u2212|\u2013|\u2014/g, '-');
}

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function removeAllSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

/**
 * Insert * for implicit multiplication on compact string (no spaces).
 */
export function insertImplicitMultiplication(compact: string): string {
  let s = compact;
  const pass = () => {
    const next = s
      .replace(/\)\(/g, ')*(')
      .replace(/(\))(\d)/g, '$1*$2')
      .replace(/(\))([a-z])/gi, '$1*$2')
      .replace(/(\d)\(/g, '$1*(')
      .replace(/([a-z])\(/gi, '$1*(')
      .replace(new RegExp(`(\\d)(${FUNC_ALT})\\b`, 'gi'), '$1*$2')
      .replace(/(\d)(pi)\b/gi, '$1*$2')
      .replace(/(\d)(e)(?![a-z0-9])/gi, '$1*$2')
      .replace(/(\d)(x)(?![a-z0-9_])/gi, '$1*$2')
      .replace(/(\))(?=(?:sin|cos|tan|log|ln|sqrt|abs|exp)\b)/gi, ')*')
      .replace(new RegExp(`([a-z])((?:${FUNC_ALT})\\b)`, 'gi'), '$1*$2');
    if (next !== s) {
      s = next;
      return true;
    }
    return false;
  };
  for (let k = 0; k < 16 && pass(); k++);
  // Decimals ending in digit then x: 0.2x → 0.2*x
  s = s.replace(/(\d\.\d+)(x)(?![a-z0-9_])/gi, '$1*$2');
  return s;
}

/**
 * Full pipeline: trim, unicode minus, X→x, strip y=, func shorthand, implicit *, collapse.
 */
export function normalizeGraphExpression(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = unicodeMinusToAscii(s);
  s = s.replace(/X/g, 'x');
  s = stripLeadingYEquals(s);
  s = collapseSpaces(s);
  s = wrapFuncSpaceShorthand(s);
  s = removeAllSpaces(s);
  s = insertImplicitMultiplication(s);
  return s;
}
