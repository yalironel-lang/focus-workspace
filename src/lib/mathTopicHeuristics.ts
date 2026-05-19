/**
 * Lightweight math topic tags from equation text — heuristic only, no AI.
 */

export interface MathTopicInsight {
  tags: string[];
  recallHint?: string;
}

export function inferMathTopicsFromText(text: string): string[] {
  const t = text.toLowerCase();
  const tags = new Set<string>();

  if (/\bpartial\b|∂|∂p\/∂q|marginal|elasticity|p\s*\(|q\s*\(|mc\s*=|mr\s*=|demand|supply/.test(t)) {
    tags.add('Economics calculus');
    tags.add('Marginal analysis');
  }
  if (/\bint\b|integral|∫/.test(t)) tags.add('Integration');
  if (/\blim\b|limit|->|→/.test(t)) tags.add('Limits');
  if (/\bd\/d[a-z]|derivative|′|prime/.test(t)) tags.add('Differentiation');
  if (/\bsum\b|sigma|∑|series/.test(t)) tags.add('Series & summation');
  if (/\bmatrix\b|\[\[|det\b|eigen/.test(t)) tags.add('Linear algebra');
  if (/\bvector\b|\(\s*\d+\s*,/.test(t)) tags.add('Vectors');
  if (/\bprobability|variance|normal|bayes/.test(t)) tags.add('Statistics');
  if (/\bsin\b|\bcos\b|\btan\b|theta|trig/.test(t)) tags.add('Trigonometry');

  return [...tags].slice(0, 4);
}

export function inferMathTopicsFromNotebook(body: string): MathTopicInsight {
  const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const all = new Set<string>();
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('!') || line.startsWith('$$')) continue;
    for (const tag of inferMathTopicsFromText(line)) all.add(tag);
  }
  const tags = [...all].slice(0, 5);
  let recallHint: string | undefined;
  if (tags.includes('Integration')) recallHint = 'Practice substitution or bounds on similar integrals';
  else if (tags.includes('Limits')) recallHint = 'Check one-sided limits and L\'Hôpital patterns';
  else if (tags.includes('Marginal analysis')) recallHint = 'Relate MC, MR, and elasticity on this curve';
  else if (tags.includes('Differentiation')) recallHint = 'Review chain rule on comparable expressions';
  return { tags, recallHint };
}
