/**
 * Small safe expression evaluator — no eval().
 * Graph: pass `x` in variables via safeEvaluateAtX.
 *
 * Supports: + - * / ^ ( ) decimals, pi, e,
 * functions sqrt sin cos tan log ln abs exp (one argument each).
 *
 * Graph input is normalized first (see graphExprNormalize) for human-style syntax.
 */

import { normalizeGraphExpression } from './graphExprNormalize';

export type EvalResult = { ok: true; value: number } | { ok: false; error: string };

type Tok =
  | { k: 'num'; v: number }
  | { k: 'op'; v: string }
  | { k: 'name'; v: string }
  | { k: 'lp' }
  | { k: 'rp' }
  | { k: 'eof' };

function tokSnippet(t: Tok): string {
  switch (t.k) {
    case 'num':
      return String(t.v);
    case 'op':
      return t.v;
    case 'name':
      return t.v;
    case 'lp':
      return '(';
    case 'rp':
      return ')';
    case 'eof':
      return 'end';
    default:
      return '?';
  }
}

function lex(input: string): Tok[] {
  const s = input.trim();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j]!)) j++;
      const raw = s.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error('BAD_NUMBER');
      out.push({ k: 'num', v });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j]!)) j++;
      out.push({ k: 'name', v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ('+-*/^'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ k: 'lp' });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ k: 'rp' });
      i++;
      continue;
    }
    if (c === ',') {
      out.push({ k: 'op', v: ',' });
      i++;
      continue;
    }
    const near = s.slice(Math.max(0, i - 6), Math.min(s.length, i + 7));
    throw new Error(`UNEXPECTED_SYMBOL:${c}:${near}`);
  }
  out.push({ k: 'eof' });
  return out;
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

class Parser {
  toks: Tok[];
  i = 0;

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  peek(): Tok {
    return this.toks[this.i] ?? { k: 'eof' };
  }

  advance(): void {
    this.i++;
  }

  parse(): Node {
    const n = this.parseAdd();
    if (this.peek().k !== 'eof') {
      const t = this.peek();
      throw new Error(`EXTRA_INPUT:${tokSnippet(t)}`);
    }
    return n;
  }

  parseAdd(): Node {
    let n = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && t.v === '+') {
        this.advance();
        n = { t: 'bin', op: '+', a: n, b: this.parseMul() };
      } else if (t.k === 'op' && t.v === '-') {
        this.advance();
        n = { t: 'bin', op: '-', a: n, b: this.parseMul() };
      } else break;
    }
    return n;
  }

  parseMul(): Node {
    let n = this.parsePow();
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && t.v === '*') {
        this.advance();
        n = { t: 'bin', op: '*', a: n, b: this.parsePow() };
      } else if (t.k === 'op' && t.v === '/') {
        this.advance();
        n = { t: 'bin', op: '/', a: n, b: this.parsePow() };
      } else break;
    }
    return n;
  }

  parsePow(): Node {
    let n = this.parseUnary();
    const t = this.peek();
    if (t.k === 'op' && t.v === '^') {
      this.advance();
      return { t: 'bin', op: '^', a: n, b: this.parsePow() };
    }
    return n;
  }

  parseUnary(): Node {
    const t = this.peek();
    if (t.k === 'op' && t.v === '+') {
      this.advance();
      return this.parseUnary();
    }
    if (t.k === 'op' && t.v === '-') {
      this.advance();
      return { t: 'neg', a: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): Node {
    const t = this.peek();
    if (t.k === 'num') {
      this.advance();
      return { t: 'num', v: t.v };
    }
    if (t.k === 'name') {
      const name = t.v;
      this.advance();
      if (this.peek().k === 'lp') {
        this.advance();
        const args: Node[] = [];
        if (this.peek().k !== 'rp') {
          args.push(this.parseAdd());
          for (;;) {
            const p = this.peek();
            if (p.k === 'op' && p.v === ',') {
              this.advance();
              args.push(this.parseAdd());
            } else break;
          }
        }
        if (this.peek().k !== 'rp') throw new Error('MISSING_PAREN');
        this.advance();
        return { t: 'call', fn: name, args };
      }
      if (name === 'pi') return { t: 'num', v: Math.PI };
      if (name === 'e') return { t: 'num', v: Math.E };
      return { t: 'var', name };
    }
    if (t.k === 'lp') {
      this.advance();
      const inner = this.parseAdd();
      if (this.peek().k !== 'rp') throw new Error('MISSING_PAREN');
      this.advance();
      return inner;
    }
    throw new Error('EXPECTED_VALUE');
  }
}

function evalNode(n: Node, vars: Record<string, number>): number {
  switch (n.t) {
    case 'num':
      return n.v;
    case 'var': {
      if (!(n.name in vars)) throw new Error(`UNKNOWN_VAR:${n.name}`);
      return vars[n.name]!;
    }
    case 'neg':
      return -evalNode(n.a, vars);
    case 'bin': {
      const L = evalNode(n.a, vars);
      const R = evalNode(n.b, vars);
      switch (n.op) {
        case '+':
          return L + R;
        case '-':
          return L - R;
        case '*':
          return L * R;
        case '/':
          if (R === 0) throw new Error('DIV0');
          return L / R;
        case '^':
          return L ** R;
        default:
          throw new Error('BAD_OP');
      }
    }
    case 'call': {
      const args = n.args.map((a) => evalNode(a, vars));
      if (args.length !== 1) throw new Error('BAD_ARG_COUNT');
      const x = args[0]!;
      switch (n.fn) {
        case 'sqrt':
          return Math.sqrt(x);
        case 'sin':
          return Math.sin(x);
        case 'cos':
          return Math.cos(x);
        case 'tan':
          return Math.tan(x);
        case 'log':
          return Math.log10(x);
        case 'ln':
          return Math.log(x);
        case 'abs':
          return Math.abs(x);
        case 'exp':
          return Math.exp(x);
        default:
          throw new Error(`UNKNOWN_FN:${n.fn}`);
      }
    }
    default:
      throw new Error('BAD_NODE');
  }
}

function humanizeExprError(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  if (raw.startsWith('UNEXPECTED_SYMBOL:')) {
    const parts = raw.split(':');
    const sym = parts[1] ?? '';
    const near = parts[2] ?? '';
    return `Unexpected symbol “${sym}” near “${near}”. Check parentheses or spacing.`;
  }
  if (raw.startsWith('EXTRA_INPUT:')) {
    const bit = raw.slice('EXTRA_INPUT:'.length);
    return `Unexpected extra text after a complete expression (near “${bit}”). Try adding an operator or removing “${bit}”.`;
  }
  if (raw === 'MISSING_PAREN') {
    return 'Missing closing parenthesis — add ) where the grouping ends.';
  }
  if (raw === 'EXPECTED_VALUE') {
    return 'Incomplete expression — add a number, x, or parentheses.';
  }
  if (raw === 'BAD_NUMBER') {
    return 'That number could not be read — try 0.2 or 2 instead of ambiguous decimals.';
  }
  if (raw.startsWith('UNKNOWN_VAR:')) {
    const name = raw.slice('UNKNOWN_VAR:'.length);
    return `Unknown symbol “${name}”. Use x as the variable, or try 2*x if you meant multiply.`;
  }
  if (raw.startsWith('UNKNOWN_FN:')) {
    const name = raw.slice('UNKNOWN_FN:'.length);
    return `Unsupported function “${name}”. Use sqrt, sin, cos, tan, log, ln, abs, or exp.`;
  }
  if (raw === 'DIV0') {
    return 'Division by zero — adjust the expression or graph range.';
  }
  if (raw === 'BAD_ARG_COUNT') {
    return 'Functions need exactly one argument, e.g. sin(x).';
  }
  return 'Could not read that expression — try simpler steps or explicit * between parts.';
}

function parseNormalized(normalized: string): Node {
  const toks = lex(normalized);
  return new Parser(toks).parse();
}

/**
 * Returns normalized form if the expression parses; otherwise a calm error string.
 */
export function validateGraphExpression(raw: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Type an expression using x (for example 2*x+1).' };
  try {
    const normalized = normalizeGraphExpression(trimmed);
    if (!normalized) return { ok: false, error: 'Expression is empty after cleaning — try y = … or a formula in x.' };
    parseNormalized(normalized);
    return { ok: true, normalized };
  } catch (e) {
    return { ok: false, error: humanizeExprError(e) };
  }
}

export function safeEvaluateExpression(expr: string, vars: Record<string, number> = {}): EvalResult {
  const trimmed = expr.trim();
  if (!trimmed) return { ok: false, error: 'Empty' };
  try {
    const normalized = normalizeGraphExpression(trimmed);
    if (!normalized) return { ok: false, error: 'Empty' };
    const ast = parseNormalized(normalized);
    const v = evalNode(ast, vars);
    if (!Number.isFinite(v)) return { ok: false, error: 'Not a finite number for this x — try another window or check log/sqrt/tan.' };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: humanizeExprError(e) };
  }
}

export function safeEvaluateAtX(expression: string, x: number): EvalResult {
  return safeEvaluateExpression(expression, { x });
}
