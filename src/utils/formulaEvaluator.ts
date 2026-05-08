/**
 * Safe formula evaluator — NO eval(), NO Function(), NO arbitrary code.
 *
 * Supports:
 *   Numbers:    42, 3.14, .5
 *   Variables:  identifiers starting with [a-zA-Z_], then [a-zA-Z0-9_]
 *   Operators:  + - * / ^ % ( )
 *   Unary:      -x
 *   Precedence: parens > power > unary minus > mul/div/mod > add/sub
 *
 * Usage:
 *   evaluateFormula('midterm * 0.4 + final * 0.6', { midterm: 80, final: 90 })
 *   evaluateFormula('1 / 0', {})  -- returns error 'Division by zero'
 */

export type FormulaVars = Record<string, number>;

export type FormulaResult =
  | { ok: true;  value: number }
  | { ok: false; error: string };

// ── Tokeniser ─────────────────────────────────────────────────────────────────

type Token =
  | { t: 'num'; v: number }
  | { t: 'var'; n: string }
  | { t: 'op';  c: string };

function tokenise(src: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    // whitespace
    if (' \t\r\n'.includes(ch)) { i++; continue; }
    // number
    if (ch >= '0' && ch <= '9' || ch === '.') {
      let s = '';
      let hasDot = false;
      while (i < src.length) {
        const c = src[i];
        if (c === '.' && !hasDot) { hasDot = true; s += c; i++; }
        else if (c >= '0' && c <= '9') { s += c; i++; }
        else break;
      }
      const v = parseFloat(s);
      if (!isFinite(v)) return `Invalid number: "${s}"`;
      tokens.push({ t: 'num', v });
      continue;
    }
    // identifier / keyword
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let n = '';
      while (i < src.length) {
        const c = src[i];
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_') {
          n += c; i++;
        } else break;
      }
      tokens.push({ t: 'var', n });
      continue;
    }
    // operator / paren
    if ('+-*/^%()'.includes(ch)) {
      tokens.push({ t: 'op', c: ch });
      i++;
      continue;
    }
    return `Unexpected character: "${ch}"`;
  }
  return tokens;
}

// ── Recursive-descent parser ──────────────────────────────────────────────────

class Parser {
  private i = 0;
  constructor(private toks: Token[], private vars: FormulaVars) {}

  parse(): number {
    const v = this.expr();
    if (this.i < this.toks.length) {
      throw new Error(`Unexpected token at position ${this.i}: ${JSON.stringify(this.toks[this.i])}`);
    }
    return v;
  }

  private peek(): Token | undefined { return this.toks[this.i]; }
  private eat(): Token { return this.toks[this.i++]; }
  private eatOp(c: string): boolean {
    const t = this.peek();
    if (t && t.t === 'op' && t.c === c) { this.i++; return true; }
    return false;
  }

  // expr = term (('+' | '-') term)*
  private expr(): number {
    let v = this.term();
    while (true) {
      const t = this.peek();
      if (!t || t.t !== 'op') break;
      if (t.c === '+') { this.eat(); v += this.term(); }
      else if (t.c === '-') { this.eat(); v -= this.term(); }
      else break;
    }
    return v;
  }

  // term = power (('*' | '/' | '%') power)*
  private term(): number {
    let v = this.power();
    while (true) {
      const t = this.peek();
      if (!t || t.t !== 'op') break;
      if (t.c === '*') { this.eat(); v *= this.power(); }
      else if (t.c === '/') {
        this.eat();
        const r = this.power();
        if (r === 0) throw new Error('Division by zero');
        v /= r;
      } else if (t.c === '%') {
        this.eat();
        const r = this.power();
        if (r === 0) throw new Error('Modulo by zero');
        v %= r;
      } else break;
    }
    return v;
  }

  // power = unary ('^' unary)?  (right-assoc)
  private power(): number {
    const base = this.unary();
    if (this.eatOp('^')) return Math.pow(base, this.unary());
    return base;
  }

  // unary = ('-')? primary
  private unary(): number {
    if (this.eatOp('-')) return -this.primary();
    return this.primary();
  }

  // primary = NUMBER | VARIABLE | '(' expr ')'
  private primary(): number {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of formula');

    if (t.t === 'num') { this.eat(); return t.v; }

    if (t.t === 'var') {
      this.eat();
      if (!(t.n in this.vars)) throw new Error(`Unknown variable: "${t.n}"`);
      return this.vars[t.n];
    }

    if (t.t === 'op' && t.c === '(') {
      this.eat();
      const v = this.expr();
      const close = this.peek();
      if (!close || close.t !== 'op' || close.c !== ')') {
        throw new Error('Expected closing parenthesis ")"');
      }
      this.eat();
      return v;
    }

    throw new Error(`Unexpected token: "${JSON.stringify(t)}"`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function evaluateFormula(formula: string, vars: FormulaVars): FormulaResult {
  const trimmed = formula.trim();
  if (!trimmed) return { ok: false, error: 'Formula is empty' };

  const tokens = tokenise(trimmed);
  if (typeof tokens === 'string') return { ok: false, error: tokens };
  if (tokens.length === 0) return { ok: false, error: 'Formula is empty' };

  try {
    const value = new Parser(tokens, vars).parse();
    if (!isFinite(value)) return { ok: false, error: 'Result is not a finite number' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Validate a formula against a set of input IDs.
 * Returns null if valid, or an error string if not.
 */
export function validateFormula(formula: string, inputIds: string[]): string | null {
  const testVars: FormulaVars = {};
  for (const id of inputIds) testVars[id] = 1;
  const result = evaluateFormula(formula, testVars);
  if (!result.ok) return result.error;
  return null;
}

/**
 * Extract all variable names referenced in a formula.
 * Useful for validating that all variables exist in inputs.
 */
export function extractVariables(formula: string): string[] {
  const tokens = tokenise(formula.trim());
  if (typeof tokens === 'string') return [];
  return [...new Set(tokens.filter(t => t.t === 'var').map(t => (t as { t: 'var'; n: string }).n))];
}
