/**
 * Beginner-friendly math input → LaTeX for KaTeX.
 * Existing LaTeX ($...$, $$...$$, raw \\commands) is preserved when detected.
 */

const GREEK_WORDS: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  theta: '\\theta',
  lambda: '\\lambda',
  mu: '\\mu',
  pi: '\\pi',
  sigma: '\\sigma',
  omega: '\\omega',
  phi: '\\phi',
  rho: '\\rho',
  tau: '\\tau',
  infinity: '\\infty',
  infty: '\\infty',
};

const LATEX_COMMAND = /\\(?:frac|int|sum|lim|sqrt|left|right|leq|geq|neq|to|alpha|beta|theta|pi)/;

/** True when string is likely authored LaTeX (keep as-is). */
export function looksLikeLatex(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return LATEX_COMMAND.test(t) || /\\[a-zA-Z]+/.test(t);
}

function convertExpSub(s: string): string {
  return s
    .replace(/\^(\d+)/g, '^{$1}')
    .replace(/_(\d+)/g, '_{$1}')
    .replace(/\^([a-zA-Z]+)/g, '^{$1}')
    .replace(/_([a-zA-Z]+)/g, '_{$1}');
}

function convertGreekAndOps(s: string): string {
  let out = s;
  for (const [word, cmd] of Object.entries(GREEK_WORDS)) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'gi'), cmd);
  }
  out = out.replace(/<=/g, '\\leq ');
  out = out.replace(/>=/g, '\\geq ');
  out = out.replace(/!=/g, '\\neq ');
  out = out.replace(/->/g, '\\to ');
  return out;
}

function convertAtom(s: string): string {
  let a = s.trim();
  a = convertGreekAndOps(a);
  a = convertExpSub(a);
  return a;
}

function convertFractions(s: string): string {
  return s.replace(
    /([a-zA-Z0-9]+|\([^)]+\))\s*\/\s*([a-zA-Z0-9]+|\([^)]+\))/g,
    (_, num, den) => `\\frac{${convertAtom(num)}}{${convertAtom(den)}}`,
  );
}

/**
 * Convert student-friendly notation to LaTeX for rendering.
 */
export function plainMathToLatex(input: string): string {
  const raw = input.trim();
  if (!raw) return '';

  if (looksLikeLatex(raw)) {
    return raw;
  }

  let s = raw;

  const fnEq = s.match(/^([A-Za-z]+)\s*\(\s*([A-Za-z]+)\s*\)\s*=\s*(.+)$/);
  if (fnEq) {
    const [, f, arg, rhs] = fnEq;
    return `${f}(${arg}) = ${plainMathToLatex(rhs!.trim())}`;
  }

  const shortEq = s.match(/^([A-Z]{1,4})=([^\s].*)$/);
  if (shortEq) {
    return `${shortEq[1]} = ${plainMathToLatex(shortEq[2]!.trim())}`;
  }

  // ∫ from a to b of … dx
  const intMatch = s.match(
    /^\s*int\s+(\S+)\s+to\s+(\S+)\s+(.+?)\s*d([a-zA-Z])\s*$/i,
  );
  if (intMatch) {
    const [, lo, hi, expr, v] = intMatch;
    return `\\int_{${plainMathToLatex(lo)}}^{${plainMathToLatex(hi)}} ${plainMathToLatex(expr.trim())} \\, d${v}`;
  }

  // d/dx f(x)
  const derivMatch = s.match(/^\s*d\s*\/\s*d([a-zA-Z])\s+(.+)$/i);
  if (derivMatch) {
    const [, v, expr] = derivMatch;
    return `\\frac{d}{d${v}} ${plainMathToLatex(expr!.trim())}`;
  }

  // partial P / partial Q
  const partialMatch = s.match(
    /^\s*partial\s+([a-zA-Z]+)\s*\/\s*partial\s+([a-zA-Z]+)\s*$/i,
  );
  if (partialMatch) {
    const [, a, b] = partialMatch;
    return `\\frac{\\partial ${a}}{\\partial ${b}}`;
  }

  // lim x -> 0
  s = s.replace(/\blim\s+([a-zA-Z]+)\s*-?>\s*([^\s,;]+)/gi, (_, v, t) => {
    return `\\lim_{${v} \\to ${plainMathToLatex(t.trim())}}`;
  });

  // sigma i=1 to n
  s = s.replace(
    /\bsigma\s+([a-zA-Z])\s*=\s*(\S+)\s+to\s+(\S+)(?:\s+(.+))?/gi,
    (_, i, lo, hi, expr) => {
      const body = expr?.trim() ? ` ${plainMathToLatex(expr)}` : '';
      return `\\sum_{${i}=${plainMathToLatex(lo)}}^{${plainMathToLatex(hi)}}${body}`;
    },
  );

  // sum i=1 to n (expr) or sum i=1 to n expr
  s = s.replace(
    /\bsum\s+([a-zA-Z])\s*=\s*(\S+)\s+to\s+(\S+)(?:\s+(.+))?/gi,
    (_, i, lo, hi, expr) => {
      const body = expr?.trim() ? ` ${plainMathToLatex(expr)}` : '';
      return `\\sum_{${i}=${plainMathToLatex(lo)}}^{${plainMathToLatex(hi)}}${body}`;
    },
  );

  s = s.replace(/\bsqrt\s*\(\s*([^)]+)\s*\)/gi, (_, x) => `\\sqrt{${plainMathToLatex(x)}}`);

  s = convertGreekAndOps(s);
  s = convertFractions(s);
  s = convertExpSub(s);

  return s.replace(/\s{2,}/g, ' ').trim();
}

/** Best-effort inverse for simple-mode editing of existing LaTeX. */
export function latexToSimple(latex: string): string {
  let s = latex.trim();
  if (!s || !looksLikeLatex(s)) return s;

  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\int_\{([^}]*)\}\^\{([^}]*)\}\s*(.*?)\s*\\,?\s*d([a-zA-Z])/g, 'int $1 to $2 $3 d$4');
  s = s.replace(/\\lim_\{([^}]*)\s*\\to\s*([^}]*)\}/g, 'lim $1->$2');
  s = s.replace(/\\sum_\{([^}]*)\}\^\{([^}]*)\}/g, 'sum $1 to $2');
  s = s.replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)');
  for (const [word, cmd] of Object.entries(GREEK_WORDS)) {
    s = s.replace(new RegExp(cmd.replace('\\', '\\\\'), 'g'), word);
  }
  s = s.replace(/\\leq/g, '<=').replace(/\\geq/g, '>=').replace(/\\neq/g, '!=');
  s = s.replace(/\\to/g, '->');
  s = s.replace(/\^\{([^}]+)\}/g, '^$1').replace(/_\{([^}]+)\}/g, '_$1');
  s = s.replace(/\\,/g, ' ');
  return s.trim();
}

export type PlainSegment = { type: 'text'; value: string } | { type: 'math'; value: string };

/** Split plain text into math-like spans for inline rendering (math notebook preview). */
export function splitPlainMathSpans(text: string): PlainSegment[] {
  if (!text) return [{ type: 'text', value: '' }];

  const pattern =
    /(\bd\s*\/\s*d[a-zA-Z]\s+[^\n,;]+|\bpartial\s+[a-zA-Z]+\s*\/\s*partial\s+[a-zA-Z]+|\bint\s+\S+\s+to\s+\S+\s+.+?\s+d[a-zA-Z]\b|\blim\s+[a-zA-Z]+\s*-?>\s*\S+|\bsqrt\s*\([^)]+\)|\bsum\s+[a-zA-Z]\s*=\s*\S+\s+to\s+\S+(?:\s+\S+)?|\bsigma\s+[a-zA-Z]\s*=\s*\S+\s+to\s+\S+(?:\s+\S+)?|[A-Z]\([A-Za-z]+\)=[^\s,;.]+|[A-Z]{1,3}=[^\s,;.]+|[a-zA-Z]\s*\^[^\s,;.+]+|[a-zA-Z]_\d+|\b(?:alpha|beta|gamma|delta|theta|pi|sigma|omega|phi|infty|infinity)\b(?:\s*[+\-]\s*\b(?:alpha|beta|gamma|delta|theta|pi|sigma|omega|phi|infty|infinity)\b)*|[a-zA-Z0-9]+\s*\/\s*[a-zA-Z0-9]+|[a-zA-Z]=[^\s,;.]+)/gi;

  const segments: PlainSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags);

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', value: text.slice(last, m.index) });
    }
    segments.push({ type: 'math', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

export function textLikelyHasPlainMath(text: string): boolean {
  if (textHasMathDelimiters(text)) return true;
  return splitPlainMathSpans(text).some(s => s.type === 'math');
}

/** True when the line is only math (display equation), not prose with math. */
const PROSE_LEAD =
  /^(the|a|an|this|that|when|where|why|how|we|i|you|if|so|but|and|or|for|with|from|in|on|at|to|of|is|are|was|were|have|has|had|will|can|should|could|would|note|chapter|section|read|see|think|because|demand curve is)\b/i;

/** Auto-detect math lines without requiring math mode toggle. */
export function isLikelyMathLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 160) return false;
  if (isWholeLineMath(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 16) return false;
  if (PROSE_LEAD.test(t) && !isWholeLineMath(t)) return false;
  if (textLikelyHasPlainMath(t) && words.length <= 10) return true;
  return false;
}

export function isWholeLineMath(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const spans = splitPlainMathSpans(t);
  const significant = spans.filter(s => (s.type === 'math' ? true : s.value.trim().length > 0));
  if (significant.length === 0) return false;
  if (!significant.every(s => s.type === 'math')) return false;
  if (significant.length === 1) return significant[0]!.value.trim() === t;
  const rebuilt = significant.map(s => s.value).join('').replace(/\s+/g, '');
  return rebuilt === t.replace(/\s+/g, '');
}

function textHasMathDelimiters(text: string): boolean {
  return /\$/.test(text);
}

export type MathTemplateId = 'fraction' | 'exponent' | 'root' | 'integral' | 'limit' | 'sum';

export interface MathTemplateField {
  key: string;
  label: string;
  placeholder: string;
}

export interface MathTemplateDef {
  id: MathTemplateId;
  label: string;
  title: string;
  fields: MathTemplateField[];
  buildLatex: (v: Record<string, string>) => string;
  buildSimple: (v: Record<string, string>) => string;
}

export const MATH_TEMPLATES: MathTemplateDef[] = [
  {
    id: 'fraction',
    label: 'a/b',
    title: 'Fraction',
    fields: [
      { key: 'num', label: 'Numerator', placeholder: 'e.g. 1' },
      { key: 'den', label: 'Denominator', placeholder: 'e.g. 2' },
    ],
    buildLatex: v => `\\frac{${plainMathToLatex(v.num || 'a')}}{${plainMathToLatex(v.den || 'b')}}`,
    buildSimple: v => `${v.num || ' '}/${v.den || ' '}`,
  },
  {
    id: 'exponent',
    label: 'xⁿ',
    title: 'Exponent',
    fields: [
      { key: 'base', label: 'Base', placeholder: 'x' },
      { key: 'exp', label: 'Exponent', placeholder: '2' },
    ],
    buildLatex: v => `${plainMathToLatex(v.base || 'x')}^{${plainMathToLatex(v.exp || 'n')}}`,
    buildSimple: v => `${v.base || 'x'}^${v.exp || 'n'}`,
  },
  {
    id: 'root',
    label: '√',
    title: 'Square root',
    fields: [{ key: 'x', label: 'Under the root', placeholder: 'x' }],
    buildLatex: v => `\\sqrt{${plainMathToLatex(v.x || 'x')}}`,
    buildSimple: v => `sqrt(${v.x || 'x'})`,
  },
  {
    id: 'integral',
    label: '∫',
    title: 'Integral',
    fields: [
      { key: 'lo', label: 'From', placeholder: '0' },
      { key: 'hi', label: 'To', placeholder: '1' },
      { key: 'expr', label: 'Expression', placeholder: 'x^2' },
      { key: 'var', label: 'Variable', placeholder: 'x' },
    ],
    buildLatex: v =>
      `\\int_{${plainMathToLatex(v.lo || '0')}}^{${plainMathToLatex(v.hi || '1')}} ${plainMathToLatex(v.expr || 'x^2')} \\, d${v.var || 'x'}`,
    buildSimple: v => `int ${v.lo || '0'} to ${v.hi || '1'} ${v.expr || 'x^2'} d${v.var || 'x'}`,
  },
  {
    id: 'limit',
    label: 'lim',
    title: 'Limit',
    fields: [
      { key: 'var', label: 'Variable', placeholder: 'x' },
      { key: 'to', label: 'Approaches', placeholder: '0' },
    ],
    buildLatex: v => `\\lim_{${v.var || 'x'} \\to ${plainMathToLatex(v.to || '0')}}`,
    buildSimple: v => `lim ${v.var || 'x'}->${v.to || '0'}`,
  },
  {
    id: 'sum',
    label: 'Σ',
    title: 'Summation',
    fields: [
      { key: 'i', label: 'Index', placeholder: 'i' },
      { key: 'lo', label: 'From', placeholder: '1' },
      { key: 'hi', label: 'To', placeholder: 'n' },
      { key: 'expr', label: 'Expression', placeholder: 'i' },
    ],
    buildLatex: v =>
      `\\sum_{${v.i || 'i'}=${plainMathToLatex(v.lo || '1')}}^{${plainMathToLatex(v.hi || 'n')}} ${plainMathToLatex(v.expr || 'i')}`,
    buildSimple: v => `sum ${v.i || 'i'}=${v.lo || '1'} to ${v.hi || 'n'} ${v.expr || 'i'}`,
  },
];

export function getMathTemplate(id: MathTemplateId): MathTemplateDef | undefined {
  return MATH_TEMPLATES.find(t => t.id === id);
}

/** Quick symbol inserts (plain-friendly). */
export const QUICK_MATH_SYMBOLS: Array<{ label: string; insert: string; title?: string }> = [
  { label: 'α', insert: 'alpha', title: 'Alpha' },
  { label: 'β', insert: 'beta', title: 'Beta' },
  { label: 'θ', insert: 'theta', title: 'Theta' },
  { label: 'π', insert: 'pi', title: 'Pi' },
  { label: '∞', insert: 'infinity', title: 'Infinity' },
  { label: '→', insert: '->', title: 'Arrow' },
  { label: '≥', insert: '>=', title: 'Greater or equal' },
  { label: '≤', insert: '<=', title: 'Less or equal' },
];
