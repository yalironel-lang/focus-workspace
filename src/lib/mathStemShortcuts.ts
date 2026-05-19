/** Lightweight STEM slash + Tab expansions — no autocomplete framework. */

export type MathSlashId =
  | 'eq'
  | 'derivative'
  | 'integral'
  | 'matrix'
  | 'cases'
  | 'vector'
  | 'limit'
  | 'sum'
  | 'graph';

export const MATH_SLASH_COMMANDS: Array<{ id: MathSlashId; label: string; hint: string }> = [
  { id: 'eq', label: 'Equation', hint: 'y = x²' },
  { id: 'derivative', label: 'Derivative', hint: 'd/dx' },
  { id: 'integral', label: 'Integral', hint: '∫ bounds' },
  { id: 'limit', label: 'Limit', hint: 'lim x→a' },
  { id: 'sum', label: 'Sum', hint: 'Σ notation' },
  { id: 'matrix', label: 'Matrix', hint: '2×2 grid' },
  { id: 'cases', label: 'Cases', hint: 'piecewise' },
  { id: 'vector', label: 'Vector', hint: 'components' },
  { id: 'graph', label: 'Graph', hint: 'y = f(x)' },
];

export const MATH_SLASH_TEMPLATES: Record<MathSlashId, string> = {
  eq: 'y=x^2',
  derivative: 'd/dx x^2',
  integral: 'int 0 to 1 x^2 dx',
  limit: 'lim x->0',
  sum: 'sum i=1 to n i',
  matrix: '[[1,0],[0,1]]',
  cases: 'f(x) = 1 if x>0 else 0',
  vector: 'v = (1, 2, 3)',
  graph: 'y=x^2',
};

const TAB_TRIGGERS: Array<{ trigger: string; template: string }> = [
  { trigger: 'int', template: 'int 0 to 1 x^2 dx' },
  { trigger: 'lim', template: 'lim x->0' },
  { trigger: 'sqrt', template: 'sqrt(x)' },
  { trigger: 'sum', template: 'sum i=1 to n i' },
  { trigger: 'd/dx', template: 'd/dx x^2' },
];

export interface TabExpansionResult {
  text: string;
  caret: number;
}

/** Expand int/lim/sqrt/sum/d/dx + Tab at end of token. */
export function tryMathTabExpansion(fullText: string, caretOffset: number): TabExpansionResult | null {
  const before = fullText.slice(0, caretOffset);
  const after = fullText.slice(caretOffset);
  const trimmedEnd = before.replace(/\s+$/, '');
  for (const { trigger, template } of TAB_TRIGGERS) {
    if (!trimmedEnd.endsWith(trigger)) continue;
    const prefix = before.slice(0, before.length - (before.length - trimmedEnd.length) - trigger.length);
    const text = prefix + template + after;
    const caret = prefix.length + template.length;
    return { text, caret };
  }
  return null;
}

export function fuzzyMathSlashScore(query: string, label: string, hint: string): number {
  const q = query.trim().toLowerCase();
  const hay = `${label} ${hint}`.toLowerCase();
  if (!q) return 1;
  if (hay.includes(q) || label.toLowerCase().startsWith(q)) return 3;
  let j = 0;
  for (let i = 0; i < hay.length && j < q.length; i++) if (hay[i] === q[j]) j++;
  return j === q.length ? 2 : 0;
}

export function getMathSlashFiltered(
  query: string,
): Array<{ id: MathSlashId; label: string; hint: string }> {
  return MATH_SLASH_COMMANDS.map(c => ({ c, s: fuzzyMathSlashScore(query, c.label, c.hint) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.c);
}
