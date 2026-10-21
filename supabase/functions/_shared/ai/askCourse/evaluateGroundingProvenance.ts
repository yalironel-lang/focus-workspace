/**
 * Conservative server-authoritative knowledge provenance (SKE1.2).
 *
 * Available context (what the model was given) is reported separately from
 * supported answer provenance (what the answer can be attributed to).
 *
 * A tier of course_material or pdf_selection requires source support that
 * preserves any recognized mathematical relation. A shared opening cannot
 * override a different operator, operand order, negation, or quantity.
 * Equivalent subtraction wording is supported without being a verbatim
 * quotation. An added explanation does not erase that support. A new number,
 * reversal, unsupported cause, or unrelated substitution is still removed.
 *
 * Source-only questions are judged sentence by sentence. A faithful explanation
 * is kept and qualified. A course-specific fact, reversal, changed number,
 * unsupported cause, or unrelated substitution is removed.
 *
 * A strong badge is a second decision. Every substantive claim in the retained
 * answer must be supported or equivalent against that badge's evidence.
 * Retrieved prose, an explicit answer key, or the selected PDF is that
 * evidence. A quoted span does not cover a later claim, including one that
 * reuses a source word or has no comma.
 */

import type { ContextAvailable, KnowledgeTier } from '../requestTypes.ts';
import {
  claimDisposition,
  emitGroundingDecisionDiagnostics,
  type GroundingDecisionCode,
  type GroundingDecisionDiagnosticSink,
  type GroundingNoticeClass,
  type GroundingRelationClass,
} from './groundingDecisionDiagnostics.ts';

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'and', 'any', 'are', 'aren',
  'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'can', 'cannot',
  'could', 'couldn', 'did', 'didn', 'does', 'doesn', 'doing', 'don', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn', 'has', 'hasn', 'have', 'haven',
  'having', 'here', 'how', 'into', 'its', 'itself', 'just', 'more', 'most', 'mustn',
  'nor', 'not', 'now', 'off', 'once', 'only', 'other', 'ought', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'shan', 'she', 'should', 'shouldn', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'too', 'under', 'until', 'very', 'was',
  'wasn', 'were', 'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'wouldn', 'your', 'yours', 'yourself', 'yourselves',
  'explain', 'describe', 'summarize', 'please', 'tell', 'question', 'answer',
  'of', 'in', 'or', 'if', 'is', 'be', 'at', 'by', 'an', 'as', 'on', 'to', 'it',
  'we', 'he', 'me', 'my', 'so', 'no', 'do', 'up', 'us', 'am', 'may', 'per', 'via',
]);

function extractSignificantTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/** Remove attribution markers before measuring support. Markers are not evidence. */
function textForSupportMeasurement(text: string): string {
  return text
    .replace(/\[\s*pdf selection\s*\]/gi, ' ')
    .replace(/\[\s*\d+\s*\]/g, ' ');
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count++;
  }
  return count;
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Quotation evidence only. A shared bag of distinctive terms is not enough.
 * The answer must contain the whole source, or a contiguous phrase from it.
 */
export function answerQuotesSource(answerText: string, sourceText: string): boolean {
  const answerNorm = normalizeForMatch(textForSupportMeasurement(answerText));
  const sourceNorm = normalizeForMatch(sourceText);
  if (!answerNorm || !sourceNorm) return false;
  if (sourceNorm.length >= 8 && answerNorm.includes(sourceNorm)) return true;

  const words = sourceNorm.split(' ').filter((word) => word.length > 0);
  for (let start = 0; start < words.length; start++) {
    let phrase = '';
    for (let end = start; end < words.length; end++) {
      phrase = phrase ? `${phrase} ${words[end]}` : words[end]!;
      if (phrase.length > 160) break;
      if (phrase.length < 24) continue;
      if (!/\p{L}{4,}/u.test(phrase)) continue;
      // The first phrase from this start that meets the length and letter
      // rules is a prefix of every longer phrase from the same start.
      // A longer phrase can occur only when this one does, so one check
      // covers the previous inner walk without dropping a real quotation.
      if (answerNorm.includes(phrase)) return true;
      break;
    }
  }
  return false;
}

/**
 * Explicit requests to stay inside supplied notes, a selection, or course materials.
 * Does not match an ordinary topical question such as "Explain the divergence theorem".
 */
export function isExplicitSourceOnlyQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return (
    /\b(?:only|strictly|exclusively)\b(?:\s+\w+){0,6}\s+(?:the\s+)?(?:source|notes|materials?|pdf|selection|text|slides?|pages?|documents?)\b/i.test(q) ||
    /\b(?:according to|based only on|based strictly on)\s+(?:the\s+)?(?:notes|materials?|pdf|selection|slides?|professor|course materials?|text)\b/i.test(q) ||
    /\bwhat does (?:the )?(?:professor|text|selection|page|slide|notes|document)\b/i.test(q) ||
    /\b(?:in|from) (?:the )?(?:uploaded|provided|supplied|selected) (?:materials?|notes|text|pdf|selection)\b/i.test(q)
  );
}

export type GroundingProvenanceInput = {
  question: string;
  answerText: string;
  /** Retrieved chunk texts. Presence alone is context, not verified grounding. */
  indexedChunkTexts: string[];
  captureText?: string | null;
};

export type GroundingProvenanceResult = {
  tier: KnowledgeTier;
  contextAvailable: ContextAvailable;
  /** True only when the answer repeats supplied source wording. */
  quotedFromAvailableSource: boolean;
};

export function sourceOnlyLimitationMessage(input: {
  hasPdfCapture: boolean;
  hasIndexedChunks: boolean;
}): string {
  if (input.hasPdfCapture && input.hasIndexedChunks) {
    return 'This cannot be established from the available source. Neither the attached PDF selection nor the retrieved course material states it.';
  }
  if (input.hasPdfCapture) {
    return 'This cannot be established from the available source. The attached PDF selection does not state it.';
  }
  if (input.hasIndexedChunks) {
    return 'This cannot be established from the available source. The retrieved course material does not state it.';
  }
  return 'This cannot be established from the available source. No PDF selection or course material was available for this question.';
}

function cleanupCitationGaps(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/** Shown once when a source-only answer is kept without a direct quotation. */
export const SOURCE_ONLY_INTERPRETATION_NOTICE =
  'This explanation is not established as a direct statement of the available source.';

/** A model sentence the source does not establish. It is not a verified derivation. */
export const DERIVED_REASONING_NOTICE =
  'This part is general academic reasoning. It is not a statement from the PDF, and it is not independently verified.';

/** A copied choice. It is not an explanation and it is not the keyed answer. */
export const OPTION_REPEAT_NOTICE =
  'This repeats a listed option. The PDF does not identify it as the answer, and it is not independently verified.';

const REJECTED_PART_NOTICE =
  'The unsupported part cannot be established from the available source.';

/**
 * A contradicted choice is a real selection error, so the remaining text is
 * not fully grounded. It is not an unsupported academic statement.
 */
export const CONTRADICTED_OPTION_NOTICE =
  'The named option does not match the available source.';

/** Separates a kept explanation from a definition the source does support. */
export const ADDITIONAL_EXPLANATION_NOTICE =
  'The additional explanation goes beyond a direct statement of the available source.';

const CAUSAL_RE =
  /\b(because|therefore|thus|hence|caused by|causes|leads to|results in|due to)\b/i;

const MAGNITUDE_RE =
  /\b(twice|doubled|tripled)\b|\b(?:double|triple)\s+(?:the|that|this|its|a|an)\b|\bhalf\s+(?:the|of)\b/i;

const COURSE_FACT_RE =
  /\b(exams?|midterms?|final exams?|deadlines?|due dates?|grading|rubrics?|late submissions?|late work|penalt(?:y|ies)|homework|assignments?)\b|\b\d+\s*(?:percent|%|marks|points)\b|\b(?:professor|instructor|lecturer)\b[^.]{0,48}\b(?:said|says|announced|stated|requires|required|told)\b/i;

const FOREIGN_FUNCTION = new Set([
  'le', 'la', 'les', 'des', 'une', 'est', 'dans', 'pour', 'avec', 'que', 'qui', 'sur', 'par',
  'du', 'au', 'aux', 'der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'von',
  'den', 'dem', 'los', 'las', 'una', 'por', 'con', 'del', 'che', 'non', 'sono',
]);

/** Periods inside these abbreviations are not sentence boundaries. */
const ABBREVIATION_PERIOD = /\b(i\.e|e\.g|etc|vs|cf|viz)\./gi;
const ABBREVIATION_PERIOD_MARK = '\uE000';

function protectAbbreviations(text: string): string {
  return text.replace(ABBREVIATION_PERIOD, `$1${ABBREVIATION_PERIOD_MARK}`);
}

function restoreAbbreviations(text: string): string {
  return text.split(ABBREVIATION_PERIOD_MARK).join('.');
}

export function splitClaims(text: string): string[] {
  const rough = protectAbbreviations(text).split(/(?<=[.!?])\s+|\n+/);
  const claims: string[] = [];
  for (const part of rough) {
    const trimmed = restoreAbbreviations(part.trim());
    if (!trimmed) continue;
    if (/^(?:\[\s*(?:\d+|pdf selection)\s*\]\s*)+$/i.test(trimmed) && claims.length > 0) {
      claims[claims.length - 1] += ` ${trimmed}`;
    } else {
      claims.push(trimmed);
    }
  }
  return claims.length > 0 ? claims : [text.trim()].filter((part) => part.length > 0);
}

function contentStems(text: string): Set<string> {
  const normalized = unwrapInlineTex(textForSupportMeasurement(text))
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  const words = normalized
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  return new Set(words.map((word) => word.slice(0, 5)));
}

function stemOverlapCount(left: string, right: string): number {
  const rightStems = contentStems(right);
  let count = 0;
  for (const stem of contentStems(left)) {
    if (rightStems.has(stem)) count++;
  }
  return count;
}

function negationCount(text: string): number {
  const normalized = text
    .toLowerCase()
    .replace(/n't\b/g, ' not ')
    .replace(/\bcan not\b/g, 'cannot');
  const matches = normalized.match(/\b(not|no|never|cannot|without|neither|nor|fails)\b/g);
  return matches?.length ?? 0;
}

function bestSourceFragment(claim: string, corpus: string): string {
  const parts = splitClaims(corpus);
  const pool = parts.length > 0 ? parts : [corpus];
  let best = pool[0] ?? corpus;
  let bestScore = -1;
  for (const part of pool) {
    const score = stemOverlapCount(claim, part);
    if (score > bestScore) {
      best = part;
      bestScore = score;
    }
  }
  return best;
}

/** True when the claim adds or deletes a negation that reverses a source sentence. */
export function hasPolarityConflict(claim: string, source: string): boolean {
  const fragment = bestSourceFragment(claim, source);
  const claimNeg = negationCount(claim);
  const sourceNeg = negationCount(fragment);
  if (claimNeg === sourceNeg) return false;
  const overlap = stemOverlapCount(claim, fragment);
  const quoted = answerQuotesSource(claim, fragment) || answerQuotesSource(claim, source);
  if (claimNeg > sourceNeg && (quoted || overlap >= 3)) return true;
  if (claimNeg < sourceNeg && removesNegatedWording(claim, fragment)) return true;
  return false;
}

function removesNegatedWording(claim: string, source: string): boolean {
  const sourceNorm = normalizeForMatch(source);
  const claimNorm = normalizeForMatch(claim);
  const cues = [...sourceNorm.matchAll(/\b(not|no|never|cannot|without|neither|nor|fails)\b/g)];
  if (cues.length === 0 || negationCount(claim) >= negationCount(source)) return false;
  const words = sourceNorm.split(' ').filter((word) => word.length > 0);
  for (const cue of cues) {
    const cueWord = cue[1] ?? '';
    const at = words.findIndex((word) => word === cueWord || word.startsWith(`${cueWord}`));
    if (at < 0) continue;
    const around = words
      .slice(Math.max(0, at - 3), at)
      .concat(words.slice(at + 1, at + 4))
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
    if (around.length >= 2 && around.every((word) => claimNorm.includes(word))) return true;
  }
  return false;
}

function extractNumbers(text: string): string[] {
  const cleaned = textForSupportMeasurement(text);
  return [...cleaned.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) =>
    match[0].replace(/\.0+$/, '').replace(/^0+(?=\d)/, ''),
  );
}

/** A page label is not a changed quantity. Other numbers in the same sentence still count. */
function withoutPageLabels(text: string): string {
  return text.replace(/\bpages?\s+\d{1,4}(?:\s*[-\u2013\u2014]\s*\d{1,4})?\b/gi, ' ');
}

export function hasNumericOrMagnitudeConflict(claim: string, source: string, question: string): boolean {
  const allowed = new Set([...extractNumbers(source), ...extractNumbers(question)]);
  const novel = extractNumbers(withoutPageLabels(claim)).filter((value) => !allowed.has(value));
  if (novel.length > 0) return true;
  const magnitude = claim.match(MAGNITUDE_RE);
  if (!magnitude) return false;
  return !source.toLowerCase().includes(magnitude[0].toLowerCase());
}

function isSelfLimitation(sentence: string): boolean {
  return /\b(cannot be established|not established as a direct statement|does not (?:state|mention|include|contain)|do not (?:state|mention)|is not (?:in|stated)|not in the (?:notes|source|material|selection|text))\b/i.test(
    sentence,
  );
}

export function isUnsupportedCourseFact(sentence: string, corpus: string): boolean {
  if (!COURSE_FACT_RE.test(sentence) || isSelfLimitation(sentence)) return false;
  if (hasNumericOrMagnitudeConflict(sentence, corpus, '')) return true;
  const matched = sentence.match(COURSE_FACT_RE);
  const label = matched?.[0]?.toLowerCase() ?? '';
  if (label && !corpus.toLowerCase().includes(label)) return true;
  return false;
}

function sourceLooksMathematical(text: string): boolean {
  return /[=<>≤≥∫∑√^]|\\frac|\\int|f\s*'|\bdiv\b/i.test(text);
}

function answerExplainsMath(text: string): boolean {
  return /\b(rate|average|derivative|integral|flux|divergence|equals?|equation|formula|continuous|interval|slope|tangent)\b/i.test(
    text,
  );
}

function isMathReformulation(claim: string, corpus: string): boolean {
  if (!sourceLooksMathematical(corpus) || !answerExplainsMath(claim)) return false;
  if (negationCount(claim) > negationCount(corpus)) return false;
  if (hasNumericOrMagnitudeConflict(claim, corpus, '')) return false;
  return true;
}

function latinLetterRatio(text: string): number {
  const letters = [...text].filter((char) => /\p{L}/u.test(char));
  if (letters.length === 0) return 1;
  const latin = letters.filter((char) => /\p{Script=Latin}/u.test(char));
  return latin.length / letters.length;
}

function isCrossScriptTranslation(claim: string, corpus: string): boolean {
  return latinLetterRatio(corpus) < 0.5 && latinLetterRatio(claim) > 0.8 && claim.trim().length > 20;
}

function hasForeignFunctionWords(text: string): boolean {
  const tokens = text.toLowerCase().split(/[^\p{L}]+/u);
  let count = 0;
  for (const token of tokens) {
    if (FOREIGN_FUNCTION.has(token)) count++;
  }
  return count >= 2;
}

function isCognateTranslation(claim: string, corpus: string): boolean {
  if (!hasForeignFunctionWords(corpus)) return false;
  const english = claim.toLowerCase().match(/\b(the|and|that|this|with|from|have|are|for)\b/g);
  return (english?.length ?? 0) >= 2 && stemOverlapCount(claim, corpus) >= 1;
}

function stripMarkers(text: string): string {
  return cleanupCitationGaps(text.replace(/\[\s*(?:\d+|pdf selection)\s*\]/gi, ' '));
}

/**
 * A causal marker the source does not use, or a cause clause with new wording.
 * Returns the clause that precedes the marker so a true statement can remain.
 */
function splitUnsupportedCause(claim: string, corpus: string): { main: string } | null {
  const match = CAUSAL_RE.exec(claim);
  if (!match || match.index === undefined) return null;
  const cause = claim.slice(match.index);
  const sourceHasSameCause =
    CAUSAL_RE.test(corpus) && stemOverlapCount(cause, corpus) >= contentStems(cause).size && contentStems(cause).size > 0;
  if (sourceHasSameCause) return null;
  const main = claim.slice(0, match.index).trim().replace(/[,:;]\s*$/, '');
  return { main };
}

function claimWindow(text: string, markerStart: number, markerEnd: number): string {
  const boundary = /(?<!\d)\.(?!\d)|[!?\n]/g;
  let sentenceStart = 0;
  boundary.lastIndex = 0;
  let boundaryMatch: RegExpExecArray | null;
  while ((boundaryMatch = boundary.exec(text)) && boundaryMatch.index < markerStart) {
    sentenceStart = boundaryMatch.index + 1;
  }
  const after = text.slice(markerEnd);
  const next = after.search(/[.!?\n]/);
  const sentenceEnd = next >= 0 ? markerEnd + next : text.length;
  const previousStart = (() => {
    const prior = text.slice(0, Math.max(0, sentenceStart - 1));
    let start = 0;
    boundary.lastIndex = 0;
    while ((boundaryMatch = boundary.exec(prior))) start = boundaryMatch.index + 1;
    return start;
  })();
  return text.slice(previousStart, sentenceEnd);
}

/**
 * Drop numbered markers that do not name a retrieved source whose wording
 * appears in the cited claim. Keep [PDF selection] only for a claim that
 * repeats the attached selection.
 */
function citationWindowSupportsSource(claimWindowText: string, source: string, question: string): boolean {
  // A sentence can quote the source only when the whole window does.
  if (!answerQuotesSource(claimWindowText, source)) return false;
  const parts = splitClaims(claimWindowText);
  const pieces = parts.length > 0 ? parts : [claimWindowText];
  return pieces.some(
    (part) =>
      answerQuotesSource(part, source) &&
      !hasPolarityConflict(part, source) &&
      !hasNumericOrMagnitudeConflict(part, source, question),
  );
}

export function enforceServerCitationIntegrity(input: {
  text: string;
  chunks: { citationIndex: number; text: string }[];
  captureText?: string | null;
  question?: string;
}): string {
  const capture = input.captureText?.trim() ?? '';
  const pattern = /\[\s*(?:(\d+)|pdf selection)\s*\]/gi;
  let result = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input.text))) {
    result += input.text.slice(last, match.index);
    const claim = claimWindow(input.text, match.index, match.index + match[0].length);
    const indexText = match[1];
    let keep = false;
    if (indexText) {
      const index = Number(indexText);
      const chunk = input.chunks.find((item) => item.citationIndex === index);
      keep = Boolean(chunk && citationWindowSupportsSource(claim, chunk.text, input.question ?? ''));
    } else if (capture) {
      keep = citationWindowSupportsSource(claim, capture, input.question ?? '');
    }
    if (keep) result += match[0];
    last = match.index + match[0].length;
  }
  result += input.text.slice(last);
  return cleanupCitationGaps(result);
}

type RelationOp = 'difference' | 'sum' | 'less_than' | 'greater_than';

type MathRelation = {
  op: RelationOp;
  left: string;
  right: string;
  leftHarmful: string[];
  rightHarmful: string[];
  strippedHarmless: boolean;
  negated: boolean;
};

const RELATION_BOUNDARY = new Set([
  'is', 'are', 'was', 'were', 'equals', 'equal', 'be', 'means', 'defined', 'as',
  'not', 'never', 'no', 'bound', 'diff', 'sum',
]);

function relationSentences(text: string): string[] {
  return protectAbbreviations(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => restoreAbbreviations(sentence.trim()))
    .filter((sentence) => sentence.length > 0);
}

/**
 * A spaced en dash is subtraction only when it is the single dash in the
 * claim and both sides are words, not a number range or a clause aside.
 * Paired dashes and unspaced compounds stay punctuation.
 */
const EN_DASH_ASIDE = new Set([
  'which', 'who', 'whom', 'where', 'when', 'while', 'although', 'however',
  'because', 'if', 'that', 'this', 'these', 'those', 'see', 'including',
  'unlike', 'rather', 'instead', 'namely', 'below', 'above',
]);

function applyClearSubtractionEnDash(text: string): string {
  const spaced = [...text.matchAll(/(?<=[\p{L}\p{N}])[ \t]+\u2013[ \t]+(?=[\p{L}\p{N}])/gu)];
  if (spaced.length !== 1) return text;
  const match = spaced[0]!;
  const at = match.index ?? 0;
  const leftToken = text.slice(0, at).match(/[\p{L}\p{N}]+$/u)?.[0]?.toLowerCase() ?? '';
  const rightToken = text.slice(at + match[0].length).match(/^[\p{L}\p{N}]+/u)?.[0]?.toLowerCase() ?? '';
  if (!leftToken || !rightToken) return text;
  if (/^\d+$/.test(leftToken) || /^\d+$/.test(rightToken)) return text;
  if (EN_DASH_ASIDE.has(leftToken) || EN_DASH_ASIDE.has(rightToken)) return text;
  return `${text.slice(0, at)} diff ${text.slice(at + match[0].length)}`;
}

/** Formatting around an expression. The words and the minus sign stay. */
function unwrapInlineTex(text: string): string {
  return text
    .replace(/\\text\{([^{}]*)\}/gi, '$1')
    .replace(/\\(?:mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/gi, '$1')
    .replace(/\\\[|\\\]|\\\(|\\\)/g, ' ');
}

function prepareRelationText(text: string): string {
  return applyClearSubtractionEnDash(unwrapInlineTex(text))
    .replace(/\bdifference between\s+([^.;]{1,80}?)\s+and\s+([^.;]{1,80})/gi, '$1 diff $2')
    .replace(/\u2212/g, ' diff ')
    .replace(/(\p{L}|\p{N})\s+-\s+(\p{L}|\p{N})/gu, '$1 diff $2')
    .replace(/\bminus\b/gi, ' diff ')
    .replace(/\bless than\b/gi, ' lt ')
    .replace(/\bgreater than\b/gi, ' gt ')
    .replace(/</g, ' lt ')
    .replace(/>/g, ' gt ')
    .replace(/\bless\b/gi, ' diff ')
    .replace(/\bplus\b/gi, ' sum ')
    .replace(/\+/g, ' sum ')
    .replace(/=/g, ' bound ')
    .replace(/[,:;]/g, ' bound ');
}

function hasUnparsedOperator(text: string): boolean {
  const unwrapped = unwrapInlineTex(text);
  if (applyClearSubtractionEnDash(unwrapped) !== unwrapped) return true;
  if (/[\u2212+]/.test(unwrapped)) return true;
  if (/(?:\p{L}|\p{N})\s+-\s+(?:\p{L}|\p{N})/u.test(unwrapped)) return true;
  if (/\bminus\b/i.test(unwrapped)) return true;
  if (/\bplus\b/i.test(unwrapped)) return true;
  if (/\bless\b(?!\s+than\b)/i.test(unwrapped)) return true;
  return false;
}

function normalizeOperand(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/\b(the|a|an|its|their)\b/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.replace(/^[a-d]\s+(?=\p{L})/u, '');
}

/** Words that restate the same measured quantity. Anything else is not assumed harmless. */
const HARMLESS_OPERAND_MODIFIERS = new Set(['measured', 'observed']);

/**
 * Modifiers that change quantity, sign, timing, or scope. An unrecognized
 * extra word is not in this set and is not treated as a contradiction.
 */
const HARMFUL_OPERAND_MODIFIERS = new Set([
  'twice', 'double', 'doubled', 'triple', 'tripled', 'half', 'percent', 'percentage',
  'negative', 'positive',
  'previous', 'prior', 'last', 'next', 'future', 'past', 'current', 'today',
  'yesterday', 'tomorrow', 'annual', 'quarterly', 'monthly', 'lagged', 'expected',
  'nominal', 'potential', 'capita', 'domestic', 'national', 'local', 'regional', 'gross', 'net',
]);

function analyzeOperand(text: string): { core: string; harmful: string[]; strippedHarmless: boolean } {
  const tokens = normalizeOperand(text).split(' ').filter((token) => token.length > 0);
  const harmful = tokens.filter((token) => HARMFUL_OPERAND_MODIFIERS.has(token) || /^\d+$/.test(token));
  const core = tokens.filter(
    (token) => !HARMLESS_OPERAND_MODIFIERS.has(token) && !HARMFUL_OPERAND_MODIFIERS.has(token) && !/^\d+$/.test(token),
  );
  return {
    core: core.join(' '),
    harmful,
    strippedHarmless: tokens.some((token) => HARMLESS_OPERAND_MODIFIERS.has(token)),
  };
}

function isChoiceLine(sentence: string): boolean {
  return /^\s*(?:\([a-d]\)|[a-d][.)])\s+\S/i.test(sentence);
}

/** Solution prose. A listed choice is not, by itself, the worked answer. */
function solutionProse(corpus: string): string {
  return relationSentences(corpus)
    .filter((sentence) => !isChoiceLine(sentence))
    .join('\n');
}

function extractRelations(text: string): MathRelation[] {
  // A citation marker is not an operand. [1] must not become a harmful digit.
  const tokens = prepareRelationText(stripMarkers(text))
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
  const relations: MathRelation[] = [];
  tokens.forEach((token, index) => {
    if (token !== 'diff' && token !== 'sum' && token !== 'lt' && token !== 'gt') return;
    const op: RelationOp =
      token === 'diff' ? 'difference' : token === 'sum' ? 'sum' : token === 'lt' ? 'less_than' : 'greater_than';
    const left: string[] = [];
    for (let cursor = index - 1; cursor >= 0 && left.length < 6; cursor -= 1) {
      const word = tokens[cursor]!;
      if (RELATION_BOUNDARY.has(word)) break;
      left.unshift(word);
      if (/^\d+$/.test(word)) break;
    }
    const right: string[] = [];
    for (let cursor = index + 1; cursor < tokens.length && right.length < 6; cursor += 1) {
      const word = tokens[cursor]!;
      if (RELATION_BOUNDARY.has(word)) break;
      right.push(word);
      if (/^\d+$/.test(word)) break;
    }
    const leftShape = analyzeOperand(left.join(' '));
    const rightShape = analyzeOperand(right.join(' '));
    if (!leftShape.core || !rightShape.core) return;
    const before = tokens.slice(Math.max(0, index - 5), index);
    relations.push({
      op,
      left: leftShape.core,
      right: rightShape.core,
      leftHarmful: leftShape.harmful,
      rightHarmful: rightShape.harmful,
      strippedHarmless: leftShape.strippedHarmless || rightShape.strippedHarmless,
      negated: before.some((word) => word === 'not' || word === 'never' || word === 'no'),
    });
  });
  return relations;
}

function sameTokens(left: string[], right: string[]): boolean {
  return left.join(' ') === right.join(' ');
}

function coresAlign(left: string, right: string): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.endsWith(` ${right}`) || right.endsWith(` ${left}`);
}

/**
 * The operands line up, but one side adds a harmful subject such as nominal.
 * An ordinary extra word stays unrelated.
 */
function alignedHarmfulConflict(claim: MathRelation, source: MathRelation): boolean {
  if (claim.negated !== source.negated) return false;
  if (!coresAlign(claim.left, source.left) || !coresAlign(claim.right, source.right)) return false;
  return !sameTokens(claim.leftHarmful, source.leftHarmful) || !sameTokens(claim.rightHarmful, source.rightHarmful);
}

function orderSensitive(op: RelationOp): boolean {
  return op !== 'sum';
}

/**
 * Equivalent when the operation and cores match, including a harmless modifier.
 * A harmful modifier, reversed order, different operation, or negation is a
 * contradiction. Cores that are not the same relation are unrelated.
 */
function compareRelations(
  claim: MathRelation,
  source: MathRelation,
): 'equivalent' | 'contradiction' | 'unrelated' {
  const sameOrder = claim.left === source.left && claim.right === source.right;
  const swapped = claim.left === source.right && claim.right === source.left;
  if (!sameOrder && !swapped) {
    if (alignedHarmfulConflict(claim, source)) return 'contradiction';
    return 'unrelated';
  }
  const harmfulOk = sameOrder
    ? sameTokens(claim.leftHarmful, source.leftHarmful) && sameTokens(claim.rightHarmful, source.rightHarmful)
    : sameTokens(claim.leftHarmful, source.rightHarmful) && sameTokens(claim.rightHarmful, source.leftHarmful);
  if (claim.op !== source.op || claim.negated !== source.negated) return 'contradiction';
  if (!harmfulOk) return 'contradiction';
  if (orderSensitive(claim.op) && swapped) return 'contradiction';
  return 'equivalent';
}

function relationDecision(
  claim: MathRelation,
  sources: MathRelation[],
): 'equivalent' | 'contradiction' | 'unmatched' {
  let contradicted = false;
  for (const source of sources) {
    const compared = compareRelations(claim, source);
    if (compared === 'equivalent') return 'equivalent';
    if (compared === 'contradiction') contradicted = true;
  }
  return contradicted ? 'contradiction' : 'unmatched';
}

function supportedOnlyByChoice(claim: string, corpus: string): boolean {
  const claimRelations = extractRelations(claim);
  if (claimRelations.length === 0) return false;
  const proseRelations = relationSentences(solutionProse(corpus)).flatMap((sentence) => extractRelations(sentence));
  if (claimRelations.every((relation) => proseRelations.some((source) => compareRelations(relation, source) === 'equivalent'))) {
    return false;
  }
  const choiceRelations = relationSentences(corpus)
    .filter((sentence) => isChoiceLine(sentence))
    .flatMap((sentence) => extractRelations(sentence));
  return claimRelations.every((relation) =>
    choiceRelations.some((source) => compareRelations(relation, source) === 'equivalent'),
  );
}

function quotesOperatorPhrase(claim: string, source: string): boolean {
  const claimNorm = normalizeForMatch(claim);
  const sourceNorm = normalizeForMatch(source);
  const operator =
    /(?:\u2212|\bminus\b|\bplus\b|\bless\b(?!\s+than\b)|(?<=[\p{L}\p{N}])\s+-\s+(?=[\p{L}\p{N}]))/giu;
  for (const match of sourceNorm.matchAll(operator)) {
    const at = match.index ?? 0;
    let start = at;
    let end = at + match[0].length;
    while (end - start < 24 && (start > 0 || end < sourceNorm.length)) {
      if (start > 0) start -= 1;
      if (end < sourceNorm.length && end - start < 24) end += 1;
    }
    const phrase = sourceNorm.slice(start, end);
    if (phrase.length >= 24 && claimNorm.includes(phrase)) return true;
  }
  return false;
}

/**
 * Verbatim only when the source's own operator wording is quoted.
 * Equivalent when the operation and operand order match, including a
 * harmless modifier such as "measured". A shared opening cannot save a
 * different operator, order, negation, or harmful modifier. A choice is
 * not solution evidence. An unrecognized operand change is unmatched,
 * which is uncertain rather than a contradiction.
 */
export function mathRelationSupport(
  claim: string,
  corpus: string,
): 'verbatim' | 'equivalent' | 'contradiction' | 'unmatched' | 'unparsed' | 'none' {
  const claimRelations = extractRelations(claim);
  if (claimRelations.length === 0) {
    return hasUnparsedOperator(claim) ? 'unparsed' : 'none';
  }
  const prose = solutionProse(corpus);
  const sentences = relationSentences(prose);
  const anchored = sentences.filter((sentence) => answerQuotesSource(claim, sentence));
  const anchoredRelations = anchored.flatMap((sentence) => extractRelations(sentence));
  const sourceRelations = sentences.flatMap((sentence) => extractRelations(sentence));
  const pool = anchoredRelations.length > 0 ? anchoredRelations : sourceRelations;
  const decisions = claimRelations.map((relation) => relationDecision(relation, pool));
  if (decisions.some((decision) => decision === 'contradiction')) return 'contradiction';
  if (decisions.every((decision) => decision === 'equivalent')) {
    const stripped = claimRelations.some((relation) => relation.strippedHarmless);
    if (!stripped && quotesOperatorPhrase(claim, prose)) return 'verbatim';
    return 'equivalent';
  }
  return 'unmatched';
}

function signedQuantities(text: string): Array<{ sign: '+' | '-'; bare: string }> {
  const normalized = text.toLowerCase().replace(/\u2212/g, '-').replace(/\bnegative\b/g, '-');
  const found: Array<{ sign: '+' | '-'; bare: string }> = [];
  for (const match of normalized.matchAll(/(?:^|[^\p{L}\p{N}])(-)?\s*(\d+(?:\.\d+)?\p{L}*)/gu)) {
    const bare = match[2];
    if (!bare) continue;
    found.push({ sign: match[1] ? '-' : '+', bare });
  }
  return found;
}

/** A quoted expression whose sign differs from the source sentence. */
function statedSignDisagrees(claim: string, corpus: string): boolean {
  const sentences = relationSentences(solutionProse(corpus));
  return sentences.some((sentence) => {
    if (!answerQuotesSource(claim, sentence)) return false;
    const sourceSigns = new Map<string, Set<'+' | '-'>>();
    for (const item of signedQuantities(sentence)) {
      const signs = sourceSigns.get(item.bare) ?? new Set<'+' | '-'>();
      signs.add(item.sign);
      sourceSigns.set(item.bare, signs);
    }
    return signedQuantities(claim).some((item) => {
      const signs = sourceSigns.get(item.bare);
      return Boolean(signs && !signs.has(item.sign));
    });
  });
}

function hasSupportedQuotation(answer: string, source: string, question: string): boolean {
  const prose = solutionProse(source);
  if (!prose || !answerQuotesSource(answer, prose) || statedSignDisagrees(answer, source)) return false;
  const parts = splitClaims(answer);
  const pieces = parts.length > 0 ? parts : [answer];
  // Judge each sentence on its own so the next sentence cannot extend an operand.
  if (pieces.some((part) => mathRelationSupport(part, source) === 'contradiction')) return false;
  return pieces.some((part) => {
    const support = mathRelationSupport(part, source);
    return (
      answerQuotesSource(part, prose) &&
      (support === 'verbatim' || support === 'none') &&
      !hasPolarityConflict(part, source) &&
      !hasNumericOrMagnitudeConflict(part, source, question)
    );
  });
}

/** Same flags evaluateGroundingProvenance reports, without scanning quotations. */
export function contextAvailableForGrounding(input: {
  indexedChunkTexts: string[];
  captureText?: string | null;
}): ContextAvailable {
  const hasIndexedChunks = input.indexedChunkTexts.some((text) => text.trim().length > 0);
  const hasPdfCapture = (input.captureText?.trim() ?? '').length > 0;
  return { hasIndexedChunks, hasPdfCapture };
}

export function evaluateGroundingProvenance(
  input: GroundingProvenanceInput,
): GroundingProvenanceResult {
  const chunkTexts = input.indexedChunkTexts.map((text) => text.trim()).filter((text) => text.length > 0);
  const captureText = input.captureText?.trim() ?? '';
  const contextAvailable = contextAvailableForGrounding({
    indexedChunkTexts: input.indexedChunkTexts,
    captureText: input.captureText,
  });
  const { hasIndexedChunks, hasPdfCapture } = contextAvailable;

  const measuredAnswer = textForSupportMeasurement(input.answerText);
  const answerTokens = extractSignificantTokens(measuredAnswer);
  const questionTokens = extractSignificantTokens(input.question);

  const chunkQuoted = chunkTexts.some((text) => hasSupportedQuotation(measuredAnswer, text, input.question));
  const captureQuoted = hasPdfCapture && hasSupportedQuotation(measuredAnswer, captureText, input.question);
  const quotedFromAvailableSource = chunkQuoted || captureQuoted;

  if (chunkQuoted && captureQuoted) {
    const chunkTokens = new Set<string>();
    for (const text of chunkTexts) {
      for (const token of extractSignificantTokens(text)) chunkTokens.add(token);
    }
    const captureTokens = extractSignificantTokens(captureText);
    let distinctCaptureTokens = 0;
    for (const token of captureTokens) {
      if (!chunkTokens.has(token)) distinctCaptureTokens++;
    }
    return {
      tier: distinctCaptureTokens >= 2 ? 'mixed' : 'course_material',
      contextAvailable,
      quotedFromAvailableSource,
    };
  }

  if (chunkQuoted) {
    return { tier: 'course_material', contextAvailable, quotedFromAvailableSource };
  }
  if (captureQuoted) {
    return { tier: 'pdf_selection', contextAvailable, quotedFromAvailableSource };
  }

  const captureTokens = hasPdfCapture ? extractSignificantTokens(captureText) : new Set<string>();
  const chunkTokenUnion = new Set<string>();
  for (const text of chunkTexts) {
    for (const token of extractSignificantTokens(text)) chunkTokenUnion.add(token);
  }
  const weakInfluence =
    overlapCount(captureTokens, answerTokens) +
      overlapCount(captureTokens, questionTokens) +
      overlapCount(chunkTokenUnion, answerTokens) >=
    1;

  if (weakInfluence || (isExplicitSourceOnlyQuestion(input.question) && (hasPdfCapture || hasIndexedChunks))) {
    return { tier: 'mixed', contextAvailable, quotedFromAvailableSource: false };
  }

  return { tier: 'general_academic', contextAvailable, quotedFromAvailableSource: false };
}

type AcademicClaimSegment = {
  body: string;
  trailing: string;
  claim: string;
};

/**
 * Same claim boundaries as splitClaims, but the original characters stay in
 * place. A citation-only fragment stays attached to the previous claim for
 * the course-fact check without discarding the whitespace between them.
 */
function academicClaimSegments(text: string): AcademicClaimSegment[] {
  const parts = protectAbbreviations(text).split(/((?<=[.!?])\s+|\n+)/);
  const segs: AcademicClaimSegment[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = restoreAbbreviations(parts[i] ?? '');
    const trailing = restoreAbbreviations(parts[i + 1] ?? '');
    const trimmed = body.trim();
    if (!trimmed) {
      if (segs.length > 0) {
        const prev = segs[segs.length - 1]!;
        prev.trailing += body + trailing;
      } else {
        segs.push({ body: '', trailing: body + trailing, claim: '' });
      }
      continue;
    }
    if (/^(?:\[\s*(?:\d+|pdf selection)\s*\]\s*)+$/i.test(trimmed) && segs.length > 0) {
      const prev = segs[segs.length - 1]!;
      prev.body += prev.trailing + body;
      prev.trailing = trailing;
      prev.claim = `${prev.claim} ${trimmed}`.trim();
      continue;
    }
    segs.push({ body, trailing, claim: trimmed });
  }
  return segs;
}

/**
 * A sentence that only names the retrieved page span, or only says that the
 * requested question is inside it. It is not an academic claim. Anything
 * longer, a sentence that also states a fact, or a statement that the
 * question is absent stays.
 */
const RETRIEVAL_STATUS_SENTENCE =
  /^(?:retrieved\s+pages?\s*:\s*\d{1,4}(?:\s*[-\u2013\u2014]\s*\d{1,4})?(?:\s+of\s+\d{1,4})?|pages?\s+\d{1,4}(?:\s*[-\u2013\u2014]\s*\d{1,4})?\s+(?:was|were)\s+retrieved)$/i;

const QUESTION_SPAN_STATUS_SENTENCE =
  /^(?:the\s+)?(?:requested\s+)?question\s+(?:is\s+in|appears\s+in)\s+the\s+retrieved\s+(?:span|pages?)$/i;

export function isStandaloneRetrievalStatusSentence(claim: string): boolean {
  const normalized = claim
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*\[\s*(?:\d+|pdf selection)\s*\])+\s*$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (!normalized || normalized.length > 80) return false;
  return RETRIEVAL_STATUS_SENTENCE.test(normalized) || QUESTION_SPAN_STATUS_SENTENCE.test(normalized);
}

const OPTION_LABEL_STEMS = new Set([
  'corre',
  'optio',
  'choic',
  'lette',
  'right',
  'selec',
  'choos',
  'match',
  'follo',
]);

const RETRIEVAL_NARRATION_STEMS = new Set([
  'relev',
  'passa',
  'retri',
  'visib',
  'page',
  'pages',
  'limit',
  'index',
  'match',
  'selec',
  'docum',
  'sourc',
  'mater',
  'file',
  'entir',
  'whole',
  'anywh',
  'cover',
  'reque',
  'span',
  'readi',
  'anoth',
]);

/**
 * A sentence that only points at one choice, whatever the surrounding label
 * words are. Academic wording keeps it on the normal claim path.
 */
export function optionReferenceLetter(claim: string): string | null {
  const normalized = claim.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').trim();
  if (!normalized || normalized.length > 160) return null;
  if (extractNumbers(normalized).length > 0) return null;
  const letters = new Set<string>();
  for (const match of normalized.matchAll(/\(([a-d])\)|\b([a-d])\)/gi)) {
    const letter = (match[1] ?? match[2] ?? '').toLowerCase();
    if (letter) letters.add(letter);
  }
  if (letters.size !== 1) return null;
  for (const stem of contentStems(normalized)) {
    if (!OPTION_LABEL_STEMS.has(stem)) return null;
  }
  return [...letters][0] ?? null;
}

function claimLabelLetter(claim: string): string | null {
  return standaloneAnswerLabel(claim) ?? optionReferenceLetter(claim);
}

/**
 * Retrieval talk with no academic stem and no new number. A self-limitation
 * stays, because absence is a real uncertainty rather than a page label.
 */
function isHarmlessRetrievalNarration(claim: string): boolean {
  if (isSelfLimitation(claim) || CAUSAL_RE.test(claim)) return false;
  if (extractNumbers(withoutPageLabels(claim)).length > 0) return false;
  const stems = contentStems(claim);
  if (stems.size === 0) return false;
  for (const stem of stems) {
    if (!RETRIEVAL_NARRATION_STEMS.has(stem)) return false;
  }
  return true;
}

/** A symbol-only restatement. A new number is still an academic claim. */
function isSymbolicNotation(claim: string, corpus: string, question: string): boolean {
  if (contentStems(claim).size > 0) return false;
  if (hasNumericOrMagnitudeConflict(claim, corpus, question)) return false;
  return /[=<>≤≥∫∑√^]|\\frac|\\int|−|[-+*/]/.test(claim);
}

/** The exact checker notice, not a model-written caveat. */
const PRIOR_CHECKER_NOTICES = [
  REJECTED_PART_NOTICE,
  CONTRADICTED_OPTION_NOTICE,
  ADDITIONAL_EXPLANATION_NOTICE,
  SOURCE_ONLY_INTERPRETATION_NOTICE,
  'This explanation is not a direct statement of the available source, and the unsupported part cannot be established from that source.',
];

/** Remove an earlier checker notice from conversation history so it is not copied forward. */
export function stripPriorCheckerNotices(text: string): string {
  const notices = new Set(
    PRIOR_CHECKER_NOTICES.map((notice) => notice.replace(/[.!?]+$/g, '').trim().toLowerCase()),
  );
  const segs = academicClaimSegments(text);
  const kept = segs.filter((seg) => {
    if (!seg.claim) return true;
    return !notices.has(normalizedClaim(seg.claim));
  });
  if (kept.length === segs.length) return text;
  return cleanupCitationGaps(kept.map((seg) => seg.body + seg.trailing).join(''));
}

function normalizedClaim(claim: string): string {
  return claim
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*\[\s*(?:\d+|pdf selection)\s*\])+\s*$/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Disclosures this checker may append again. A model caveat that matches
 * the interpretation notice is kept as uncertainty instead.
 */
function isEchoedCheckerNotice(claim: string): boolean {
  const normalized = normalizedClaim(claim);
  return [REJECTED_PART_NOTICE, CONTRADICTED_OPTION_NOTICE, ADDITIONAL_EXPLANATION_NOTICE].some(
    (notice) => notice.replace(/[.!?]+$/g, '').trim().toLowerCase() === normalized,
  );
}

function omitRetrievalStatusSentences(text: string): string {
  const segs = academicClaimSegments(text);
  const kept = segs.filter((seg) => !seg.claim || !isStandaloneRetrievalStatusSentence(seg.claim));
  if (kept.length === segs.length) return text;
  return cleanupCitationGaps(kept.map((seg) => seg.body + seg.trailing).join(''));
}

function dropUnsupportedCourseFacts(text: string, corpus: string): string {
  const segs = academicClaimSegments(text);
  const kept: AcademicClaimSegment[] = [];
  let removed = false;
  for (const seg of segs) {
    if (seg.claim && isUnsupportedCourseFact(seg.claim, corpus)) {
      removed = true;
      continue;
    }
    kept.push(seg);
  }
  if (!removed) return text;
  return cleanupCitationGaps(kept.map((seg) => seg.body + seg.trailing).join(''));
}

/**
 * The claim restates one retrieved sentence closely enough that calling it
 * unsupported would be false. A shared word is not enough, and a new number,
 * reversal, or course-logistics fact never reaches this check.
 */
function isFaithfulParaphrase(claim: string, corpus: string): boolean {
  const fragment = bestSourceFragment(claim, corpus);
  const claimStems = contentStems(claim);
  if (claimStems.size === 0) return false;
  const overlap = stemOverlapCount(claim, fragment);
  if (overlap >= 3) return true;
  return overlap >= 2 && overlap * 2 >= claimStems.size;
}

function claimIsRejected(
  claim: string,
  corpus: string,
  question: string,
): boolean {
  if (isUnsupportedCourseFact(claim, corpus)) return true;
  if (hasPolarityConflict(claim, corpus)) return true;
  if (hasNumericOrMagnitudeConflict(claim, corpus, question)) return true;
  if (
    stemOverlapCount(claim, corpus) === 0 &&
    !isMathReformulation(claim, corpus) &&
    !isCrossScriptTranslation(claim, corpus) &&
    !isCognateTranslation(claim, corpus)
  ) {
    return true;
  }
  return false;
}

type SourceClaimDecision = {
  text: string | null;
  quoted: boolean;
  equivalent: boolean;
  interpretive: boolean;
  rejected: boolean;
  relation: GroundingRelationClass;
  code: GroundingDecisionCode;
};

function rejectionCode(
  claim: string,
  corpus: string,
  question: string,
): GroundingDecisionCode {
  if (isUnsupportedCourseFact(claim, corpus)) return 'course_fact';
  if (hasPolarityConflict(claim, corpus)) return 'polarity_conflict';
  if (hasNumericOrMagnitudeConflict(claim, corpus, question)) return 'numeric_conflict';
  return 'zero_overlap';
}

const SOURCE_KEY_PATTERNS = [
  /\bthe\s+correct\s+answer\s+is\s+\(?([a-d])\)?/i,
  /\bthe\s+answer\s+is\s+\(?([a-d])\)?/i,
  /\boption\s+\(?([a-d])\)?\s+is\s+correct\b/i,
];

function lettersInSolutionProse(text: string): string[] {
  const found = new Set<string>();
  for (const sentence of relationSentences(solutionProse(text))) {
    for (const pattern of SOURCE_KEY_PATTERNS) {
      const letter = sentence.match(pattern)?.[1]?.toLowerCase();
      if (letter) found.add(letter);
    }
  }
  return [...found];
}

/** One letter per question region. A choice line cannot name the key. */
function keyedOptionBodies(corpus: string): string[] {
  const bodies: string[] = [];
  for (const region of questionRegions(corpus)) {
    const letters = lettersInSolutionProse(region);
    if (letters.length !== 1) continue;
    const letter = letters[0]!;
    for (const option of parseOptions(region)) {
      if (option.letter === letter && option.body) bodies.push(option.body);
    }
  }
  return bodies;
}

function uniqueSourceKeyLetters(corpus: string): string[] {
  const found = new Set<string>();
  for (const region of questionRegions(corpus)) {
    const letters = lettersInSolutionProse(region);
    if (letters.length === 1) found.add(letters[0]!);
  }
  return [...found];
}

function keyedRelationSupport(claim: string, corpus: string): 'equivalent' | 'contradiction' | 'none' {
  const bodies = keyedOptionBodies(corpus);
  if (bodies.length === 0) return 'none';
  let equivalent = false;
  let contradiction = false;
  for (const body of bodies) {
    const support = mathRelationSupport(claim, body);
    if (support === 'verbatim' || support === 'equivalent') equivalent = true;
    else if (support === 'contradiction') contradiction = true;
  }
  if (equivalent && contradiction) return 'none';
  if (equivalent) return 'equivalent';
  if (contradiction) return 'contradiction';
  return 'none';
}

function isBareOptionRepeat(claim: string, question: string, corpus: string): boolean {
  if (!supportedOnlyByChoice(claim, corpus)) return false;
  const choiceText = relationSentences(corpus)
    .filter((sentence) => isChoiceLine(sentence))
    .join('\n');
  const covered = new Set([...contentStems(question), ...contentStems(choiceText)]);
  return [...contentStems(claim)].every((stem) => covered.has(stem));
}

function optionRepeatClaim(claim: string, relation: GroundingRelationClass): SourceClaimDecision {
  return {
    text: stripMarkers(claim),
    quoted: false,
    equivalent: false,
    interpretive: false,
    rejected: false,
    relation,
    code: 'option_repeat',
  };
}

function derivedClaim(claim: string, relation: GroundingRelationClass): SourceClaimDecision {
  return {
    text: stripMarkers(claim),
    quoted: false,
    equivalent: false,
    interpretive: false,
    rejected: false,
    relation,
    code: 'derived_unverified',
  };
}

function judgeLabeledOption(
  letter: string,
  substantive: string,
  corpus: string,
): 'verified' | 'contradicted' | 'unverified' {
  const keys = uniqueSourceKeyLetters(corpus);
  if (keys.length === 1) return keys[0] === letter ? 'verified' : 'contradicted';
  return judgeOptionLabel(letter, substantive, corpus);
}

function acceptSourceOnlyClaim(
  claim: string,
  input: {
    question: string;
    chunks: { citationIndex: number; text: string }[];
    captureText: string;
    corpus: string;
  },
): SourceClaimDecision {
  if (!claim.trim()) {
    return {
      text: null,
      quoted: false,
      equivalent: false,
      interpretive: false,
      rejected: false,
      relation: 'none',
      code: 'empty',
    };
  }
  if (isSelfLimitation(claim)) {
    return {
      text: stripMarkers(claim),
      quoted: false,
      equivalent: false,
      interpretive: true,
      rejected: false,
      relation: 'not_applicable',
      code: 'self_limitation',
    };
  }

  const polar = judgePolarAnswer(claim, input.question, input.corpus);
  if (polar === 'supported') {
    return {
      text: stripMarkers(claim),
      quoted: false,
      equivalent: true,
      interpretive: false,
      rejected: false,
      relation: 'none',
      code: 'equivalent',
    };
  }
  if (polar === 'contradicted') {
    return {
      text: null,
      quoted: false,
      equivalent: false,
      interpretive: false,
      rejected: true,
      relation: 'none',
      code: 'polarity_conflict',
    };
  }

  const relation = mathRelationSupport(claim, input.corpus);
  const keyed = keyedRelationSupport(claim, input.corpus);
  // A contradicted relation rejects the whole sentence. A shared opening
  // must not survive as a quotation after the operator has been cut off.
  // A listed option is not source evidence. A prose answer key can be.
  if (relation === 'contradiction' || keyed === 'contradiction' || statedSignDisagrees(claim, input.corpus)) {
    return {
      text: null,
      quoted: false,
      equivalent: false,
      interpretive: false,
      rejected: true,
      relation: 'contradiction',
      code: 'relation_contradiction',
    };
  }

  const causal = splitUnsupportedCause(claim, input.corpus);
  if (causal) {
    const main = causal.main
      ? acceptSourceOnlyClaim(causal.main, input)
      : {
          text: null,
          quoted: false,
          equivalent: false,
          interpretive: false,
          rejected: false,
          relation: 'none' as const,
          code: 'empty' as const,
        };
    return {
      text: main.text,
      quoted: main.quoted,
      equivalent: main.equivalent,
      interpretive: main.interpretive,
      rejected: true,
      relation,
      code: 'causal_split',
    };
  }

  if (
    isUnsupportedCourseFact(claim, input.corpus) ||
    hasPolarityConflict(claim, input.corpus) ||
    hasNumericOrMagnitudeConflict(claim, input.corpus, input.question)
  ) {
    return {
      text: null,
      quoted: false,
      equivalent: false,
      interpretive: false,
      rejected: true,
      relation,
      code: rejectionCode(claim, input.corpus, input.question),
    };
  }
  if (keyed === 'equivalent') {
    return {
      text: stripMarkers(claim),
      quoted: false,
      equivalent: true,
      interpretive: false,
      rejected: false,
      relation: 'equivalent',
      code: 'equivalent',
    };
  }

  const quoted = enforceServerCitationIntegrity({
    text: claim,
    chunks: input.chunks,
    captureText: input.captureText,
    question: input.question,
  });
  const supported =
    input.chunks.some((chunk) => hasSupportedQuotation(claim, chunk.text, input.question)) ||
    (input.captureText.length > 0 && hasSupportedQuotation(claim, input.captureText, input.question));
  if (supported) {
    return {
      text: quoted,
      quoted: true,
      equivalent: false,
      interpretive: false,
      rejected: false,
      relation,
      code: 'quoted',
    };
  }
  if (relation === 'equivalent') {
    return {
      text: stripMarkers(claim),
      quoted: false,
      equivalent: true,
      interpretive: false,
      rejected: false,
      relation,
      code: 'equivalent',
    };
  }
  if (relation === 'unmatched' && supportedOnlyByChoice(claim, input.corpus)) {
    return isBareOptionRepeat(claim, input.question, input.corpus)
      ? optionRepeatClaim(claim, relation)
      : derivedClaim(claim, relation);
  }
  if (isPolarFragment(claim)) {
    return {
      text: null,
      quoted: false,
      equivalent: false,
      interpretive: false,
      rejected: true,
      relation,
      code: 'zero_overlap',
    };
  }
  if (claimIsRejected(claim, input.corpus, input.question)) {
    const code = rejectionCode(claim, input.corpus, input.question);
    if (code === 'zero_overlap' && stemOverlapCount(claim, input.question) > 0) return derivedClaim(claim, relation);
    return {
      text: null,
      quoted: false,
      equivalent: false,
      interpretive: false,
      rejected: true,
      relation,
      code,
    };
  }
  return derivedClaim(claim, relation);
}

const ANSWER_LABEL_PATTERNS = [
  /^(?:so\s+)?the\s+correct\s+answer\s+is\s+\(?([a-d])\)?$/i,
  /^(?:so\s+)?the\s+answer\s+is\s+\(?([a-d])\)?$/i,
  /^option\s+\(?([a-d])\)?\s+is\s+correct$/i,
];

/** A sentence that only names a multiple-choice letter. It is not judged by word overlap. */
export function standaloneAnswerLabel(claim: string): string | null {
  const normalized = claim
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (!normalized || normalized.length > 80) return null;
  for (const pattern of ANSWER_LABEL_PATTERNS) {
    const letter = normalized.match(pattern)?.[1];
    if (letter) return letter.toLowerCase();
  }
  return null;
}

type ParsedOption = { letter: string; body: string };

function questionRegions(corpus: string): string[] {
  const parts = corpus.split(
    /(?=(?:^|\n)\s*(?:question|problem|exercise)\s+\d+\b|(?:^|\n)\s*\d+\.\s+[A-Z])/i,
  );
  const regions = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  return regions.length > 0 ? regions : [corpus.trim()].filter((part) => part.length > 0);
}

function parseOptions(region: string): ParsedOption[] {
  const pattern = /\(([a-d])\)|(?:^|\n)\s*([a-d])\)\s+|(?:^|\n)\s*([a-d])\.\s+/gi;
  const marks: { letter: string; bodyStart: number; markerStart: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(region))) {
    const letter = (match[1] ?? match[2] ?? match[3] ?? '').toLowerCase();
    if (!letter) continue;
    marks.push({
      letter,
      markerStart: match.index,
      bodyStart: match.index + match[0].length,
    });
  }
  return marks.map((mark, index) => {
    const end = marks[index + 1]?.markerStart ?? region.length;
    const lineStart = region.lastIndexOf('\n', Math.max(0, mark.markerStart - 1)) + 1;
    const inline = region.slice(lineStart, mark.markerStart).trim().length > 0;
    const raw = region.slice(mark.bodyStart, end);
    const bounded = inline ? (raw.split(/(?<=[.!?])\s/)[0] ?? raw) : (raw.split(/\n\s*\n/)[0] ?? raw);
    const cut = bounded.split(/\n\s*(?:question|problem|exercise)\s+\d+\b/i)[0] ?? bounded;
    return {
      letter: mark.letter,
      body: cut.replace(/\s+/g, ' ').trim().slice(0, 180),
    };
  });
}

/** Treat a subtraction sign and the word "minus" as the same relation. */
function normalizeComparableWording(text: string): string {
  return text
    .replace(/\u2212/g, ' less ')
    .replace(/\bminus\b/gi, ' less ')
    .replace(/(\p{L}|\p{N})\s+-\s+(\p{L}|\p{N})/gu, '$1 less $2');
}

function optionBodySupportsAnswer(body: string, answer: string): boolean {
  if (!body || !answer) return false;
  const comparableBody = normalizeComparableWording(body);
  const comparableAnswer = normalizeComparableWording(answer);
  // Shared stems are not enough. A neighboring choice can reuse the same
  // words in another order. The choice has to repeat the answer's wording.
  return (
    answerQuotesSource(comparableAnswer, comparableBody) ||
    answerQuotesSource(comparableBody, comparableAnswer)
  );
}

/** A new (a) starts another question when one page lists several choice sets. */
function optionBlocks(options: ParsedOption[]): ParsedOption[][] {
  const blocks: ParsedOption[][] = [];
  let current: ParsedOption[] = [];
  for (const option of options) {
    if (option.letter === 'a' && current.some((item) => item.letter === 'a')) {
      blocks.push(current);
      current = [];
    }
    current.push(option);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Verified only when this letter's choice, inside a question whose choice
 * repeats the supported answer, matches that answer. Other questions on the
 * same page are not evidence. Contradicted when a different letter in that
 * question is the one that repeats the answer.
 */
function judgeOptionLabel(
  letter: string,
  substantive: string,
  corpus: string,
): 'verified' | 'contradicted' | 'unverified' {
  if (!substantive.trim()) return 'unverified';
  const blocks = questionRegions(corpus).flatMap((region) => optionBlocks(parseOptions(region)));
  const relevant = blocks.filter((block) =>
    block.some((option) => optionBodySupportsAnswer(option.body, substantive)),
  );
  if (relevant.length === 0) return 'unverified';
  const letterSupports = (block: ParsedOption[]) =>
    block.some((option) => option.letter === letter && optionBodySupportsAnswer(option.body, substantive));
  const otherSupports = (block: ParsedOption[]) =>
    block.some((option) => option.letter !== letter && optionBodySupportsAnswer(option.body, substantive));
  if (relevant.every(letterSupports)) return 'verified';
  if (relevant.some((block) => otherSupports(block) && !letterSupports(block))) return 'contradicted';
  return 'unverified';
}

/**
 * Source-only answers are kept claim by claim.
 * Direct quotations can keep a real citation and a specific tier.
 * A faithful paraphrase of one retrieved sentence is kept without an
 * unsupported-source notice. It is still not treated as a verbatim quotation.
 * Loose paraphrase, translation, and mathematical restatement stay mixed and
 * carry an explicit uncertainty sentence.
 * Unsupported claims are removed instead of discarding the rest of the answer.
 * Ordinary questions keep their text, with unsupported course-logistics
 * sentences removed and citations limited to supported quotations.
 */
/**
 * A fragment with no proposition of its own. Yes and No are not in this set:
 * they can affirm or deny the question.
 */
const HARMLESS_STANDALONE_FRAGMENTS = new Set([
  'ie',
  'eg',
  'etc',
  'cf',
  'viz',
  'vs',
  'for example',
  'for instance',
  'as follows',
  'see below',
  'see above',
  'note',
  'namely',
  'nb',
]);

function isPolarFragment(claim: string): boolean {
  return /^(?:yes|no|true|false)\.?$/i.test(claim.trim());
}

function isHarmlessFragment(claim: string): boolean {
  if (isPolarFragment(claim)) return false;
  if (!/[\p{L}\p{N}]/u.test(claim)) return true;
  const key = claim
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return HARMLESS_STANDALONE_FRAGMENTS.has(key);
}

function propositionFromQuestion(question: string): string | null {
  const match = question
    .trim()
    .replace(/[?\s]+$/g, '')
    .match(
      /^(?:according to\s+(?:the\s+)?(?:pdf|notes|source|text|material|materials|selection),?\s+)?(?:is|are|was|were)\s+(.+)$/i,
    );
  const proposition = match?.[1]?.trim();
  return proposition ? proposition : null;
}

/**
 * Yes or No is source-supported only when the question asks a proposition
 * whose relation is equivalent, verbatim, or contradicted. Anything less
 * stays on the ordinary rejection path.
 */
function judgePolarAnswer(
  claim: string,
  question: string,
  corpus: string,
): 'supported' | 'contradicted' | 'uncertain' | null {
  if (!isPolarFragment(claim)) return null;
  const proposition = propositionFromQuestion(question);
  if (!proposition) return 'uncertain';
  const support = mathRelationSupport(proposition, corpus);
  const affirms = /^(?:yes|true)\.?$/i.test(claim.trim());
  if (support === 'equivalent' || support === 'verbatim') return affirms ? 'supported' : 'contradicted';
  if (support === 'contradiction') return affirms ? 'contradicted' : 'supported';
  if (support === 'none' && answerQuotesSource(proposition, solutionProse(corpus))) {
    return affirms ? 'supported' : 'contradicted';
  }
  return 'uncertain';
}

function skippedClaimCode(
  claim: string,
  corpus: string,
  question: string,
): GroundingDecisionCode | 'skipped_label' | null {
  if (claimLabelLetter(claim)) return 'skipped_label';
  if (isEchoedCheckerNotice(claim)) return 'skipped_echo';
  if (isHarmlessRetrievalNarration(claim)) return 'skipped_narration';
  if (isHarmlessFragment(claim)) return 'skipped_fragment';
  if (isSymbolicNotation(claim, corpus, question)) return 'skipped_symbol';
  return null;
}

/**
 * Headings, labels, and connectives have no proposition of their own.
 * A later academic sentence still does.
 */
function isOrdinaryNonSubstantive(claim: string): boolean {
  const trimmed = claim.trim();
  if (!trimmed) return true;
  const withoutMarkers = trimmed.replace(/\[\s*(?:\d+|pdf selection)\s*\]/gi, ' ').trim();
  if (!withoutMarkers) return true;
  if (
    isEchoedCheckerNotice(withoutMarkers) ||
    isHarmlessFragment(withoutMarkers) ||
    isHarmlessRetrievalNarration(withoutMarkers) ||
    isStandaloneRetrievalStatusSentence(withoutMarkers) ||
    claimLabelLetter(withoutMarkers)
  ) {
    return true;
  }
  if (/^#{1,6}\s+\S/.test(withoutMarkers)) return true;
  if (/^\*\*[^*]{1,160}\*\*$/.test(withoutMarkers)) return true;
  if (contentStems(withoutMarkers).size === 0) return true;
  const connective = withoutMarkers.replace(/[.!?:]+$/g, '').trim();
  if (
    connective.length <= 48 &&
    contentStems(connective).size <= 2 &&
    /^(?:in other words|that is|for example|for instance|as follows|see below|see above|next|here|in short|in summary|to summarize|put differently|namely|note)\b/i.test(
      connective,
    )
  ) {
    return true;
  }
  return /:\s*$/.test(withoutMarkers) && withoutMarkers.length <= 80 && contentStems(withoutMarkers).size <= 4;
}

/**
 * Evidence decision for one substantive claim. Strong public tiers may use
 * only supported and equivalent. Uncertain withholds the badge.
 */
export type ClaimEvidenceKind =
  | 'supported'
  | 'equivalent'
  | 'choice_only'
  | 'contradicted'
  | 'unsupported'
  | 'uncertain'
  | 'not_substantive';

const SIGN_OR_HARMLESS_STEMS = new Set(['negat', 'posit', 'measu', 'obser']);
const FILLER_STEMS = new Set(['also', 'well', 'still', 'even', 'merel', 'simpl', 'indee']);

function normalizedClaimBody(claim: string): string {
  return normalizeForMatch(textForSupportMeasurement(claim)).replace(/[.!?]+$/g, '').trim();
}

/** Longest source wording that actually appears in the claim. A short prefix is not preferred over the whole sentence. */
function longestContainedPhrase(claimNorm: string, sourceNorm: string): string {
  if (!claimNorm || !sourceNorm) return '';
  if (sourceNorm.length >= 8 && claimNorm.includes(sourceNorm)) return sourceNorm;
  const words = sourceNorm.split(' ').filter((word) => word.length > 0);
  let best = '';
  for (let start = 0; start < words.length; start++) {
    let phrase = '';
    for (let end = start; end < words.length; end++) {
      const next = phrase ? `${phrase} ${words[end]}` : words[end]!;
      if (next.length > 160) break;
      if (!claimNorm.includes(next)) break;
      phrase = next;
    }
    if (phrase.length >= 24 && phrase.length > best.length && /\p{L}{4,}/u.test(phrase)) best = phrase;
  }
  return best;
}

/** Solution prose, plus an option body only when the source explicitly keys that letter. */
function coverageSentences(evidence: string): string[] {
  return [...relationSentences(solutionProse(evidence)), ...keyedOptionBodies(evidence)];
}

function quotationCoverage(
  claim: string,
  evidence: string,
): { phrase: string; sentence: string } | null {
  const claimNorm = normalizedClaimBody(claim);
  let best: { phrase: string; sentence: string } | null = null;
  for (const sentence of coverageSentences(evidence)) {
    const sentenceNorm = normalizeForMatch(sentence).replace(/[.!?]+$/g, '').trim();
    const phrase = longestContainedPhrase(claimNorm, sentenceNorm);
    if (!phrase) continue;
    if (!best || phrase.length > best.phrase.length) best = { phrase, sentence: sentenceNorm };
  }
  return best;
}

function residualAfterPhrase(claim: string, phrase: string): string {
  return normalizedClaimBody(claim).replace(phrase, ' ').replace(/\s+/g, ' ').trim();
}

const FRAME_STEMS = new Set([
  ...RETRIEVAL_NARRATION_STEMS,
  ...OPTION_LABEL_STEMS,
  'answe',
  'state',
  'says',
  'show',
  'accor',
  'indic',
  'menti',
  'write',
]);

/**
 * A sign word, a page label, or the question's own wording is not a second
 * proposition. A new academic stem still is.
 */
function residualIsTrivial(residual: string, claim: string, evidence: string, question: string): boolean {
  const stems = contentStems(residual);
  if (stems.size === 0) return true;
  const questionStems = contentStems(question);
  for (const stem of stems) {
    if (
      SIGN_OR_HARMLESS_STEMS.has(stem) ||
      FILLER_STEMS.has(stem) ||
      FRAME_STEMS.has(stem) ||
      questionStems.has(stem)
    ) {
      continue;
    }
    return false;
  }
  return !statedSignDisagrees(claim, evidence);
}

/**
 * The uncovered wording still restates the matched sentence.
 * One shared stem does not. A new stem majority does not.
 */
function residualRestatesSentence(residual: string, sentenceNorm: string): boolean {
  const stems = contentStems(residual);
  if (stems.size === 0) return true;
  const sourceStems = contentStems(sentenceNorm);
  let overlap = 0;
  for (const stem of stems) {
    if (sourceStems.has(stem)) overlap += 1;
  }
  const novel = stems.size - overlap;
  return overlap >= 2 && novel <= 1 && novel * 2 <= overlap;
}

/**
 * No verbatim span. Equivalent only when the claim restates one source
 * sentence and does not mostly add new stems. Question wording is not evidence.
 */
function paraphraseKind(claim: string, evidence: string): 'equivalent' | 'uncertain' {
  const prose = solutionProse(evidence);
  const fragment = bestSourceFragment(claim, prose);
  const stems = contentStems(claim);
  if (stems.size === 0 || !prose) return 'uncertain';
  const overlap = stemOverlapCount(claim, fragment);
  const novel = stems.size - overlap;
  if (overlap >= 3 && novel * 2 <= overlap) return 'equivalent';
  return 'uncertain';
}

/**
 * Shared claim-evidence decision. Ordinary, source-only, and selected-text
 * answers all use this before a strong badge. The evidence string is retrieved
 * prose, a keyed solution, or the selected PDF, not the question and not an
 * unkeyed choice line.
 */
export function decideClaimEvidence(
  claim: string,
  evidence: string,
  question: string,
): ClaimEvidenceKind {
  if (isOrdinaryNonSubstantive(claim)) return 'not_substantive';
  if (
    statedSignDisagrees(claim, evidence) ||
    hasPolarityConflict(claim, evidence) ||
    hasNumericOrMagnitudeConflict(claim, evidence, question)
  ) {
    return 'contradicted';
  }
  const relation = mathRelationSupport(claim, evidence);
  const keyed = keyedRelationSupport(claim, evidence);
  if (relation === 'contradiction' || keyed === 'contradiction') return 'contradicted';
  if ((relation === 'unmatched' || relation === 'unparsed') && keyed !== 'equivalent') {
    if (supportedOnlyByChoice(claim, evidence) && isBareOptionRepeat(claim, question, evidence)) {
      return 'choice_only';
    }
    return 'uncertain';
  }
  const covered = quotationCoverage(claim, evidence);
  if (covered) {
    const residual = residualAfterPhrase(claim, covered.phrase);
    const sameClaim =
      residualIsTrivial(residual, claim, evidence, question) ||
      residualRestatesSentence(residual, covered.sentence);
    if (!sameClaim) return 'unsupported';
    if (relation === 'equivalent' || keyed === 'equivalent') return 'equivalent';
    if (relation === 'verbatim') return 'supported';
    const sentenceCopied =
      covered.phrase === covered.sentence || residualIsTrivial(residual, claim, evidence, question);
    return sentenceCopied ? 'supported' : 'equivalent';
  }
  if (relation === 'verbatim') return 'supported';
  if (relation === 'equivalent' || keyed === 'equivalent') return 'equivalent';
  return paraphraseKind(claim, evidence);
}

function evidenceForStrongTier(
  tier: KnowledgeTier,
  chunkTexts: string[],
  captureText: string,
): string {
  if (tier === 'pdf_selection') return captureText;
  const chunks = chunkTexts.join('\n');
  if (chunks.trim()) return chunks;
  return captureText;
}

/** Strong tiers require every substantive claim to be supported or equivalent. Anything less is mixed. */
function applyStrongAttributionGate(
  text: string,
  tier: KnowledgeTier,
  evidence: string,
  question: string,
): { text: string; knowledgeTier: KnowledgeTier; downgraded: boolean } {
  if (tier !== 'course_material' && tier !== 'pdf_selection') {
    return { text, knowledgeTier: tier, downgraded: false };
  }
  for (const claim of splitClaims(text)) {
    const decision = decideClaimEvidence(claim, evidence, question);
    if (decision === 'supported' || decision === 'equivalent' || decision === 'not_substantive') continue;
    const distinguished = text.includes(ADDITIONAL_EXPLANATION_NOTICE)
      ? text
      : cleanupCitationGaps(`${text}\n\n${ADDITIONAL_EXPLANATION_NOTICE}`);
    return { text: distinguished, knowledgeTier: 'mixed', downgraded: true };
  }
  return { text, knowledgeTier: tier, downgraded: false };
}

/**
 * An ordinary answer keeps its wording. A relation the solution prose does
 * not establish still cannot make the whole answer course material.
 * A listed choice is not that proof.
 */
function ordinaryUnestablishedRelation(
  answer: string,
  corpus: string,
  question: string,
): { optionRepeat: boolean; derived: boolean } | null {
  let optionRepeat = false;
  let derived = false;
  for (const claim of splitClaims(answer)) {
    if (extractRelations(claim).length === 0) continue;
    const support = mathRelationSupport(claim, corpus);
    if (support === 'verbatim' || support === 'equivalent') continue;
    if (
      support === 'unmatched' &&
      supportedOnlyByChoice(claim, corpus) &&
      isBareOptionRepeat(claim, question, corpus)
    ) {
      optionRepeat = true;
    } else {
      derived = true;
    }
  }
  if (!optionRepeat && !derived) return null;
  return { optionRepeat, derived };
}

export function applyClaimLevelGrounding(input: {
  question: string;
  answerText: string;
  chunks: { citationIndex: number; text: string }[];
  captureText?: string | null;
  contextAvailable: ContextAvailable;
  diagnostics?: GroundingDecisionDiagnosticSink;
}): { text: string; knowledgeTier: KnowledgeTier } {
  const captureText = input.captureText?.trim() ?? '';
  const chunkTexts = input.chunks.map((chunk) => chunk.text.trim()).filter((text) => text.length > 0);
  const corpus = [captureText, ...chunkTexts].filter((text) => text.length > 0).join('\n');
  const sourceOnly = isExplicitSourceOnlyQuestion(input.question);
  const answerText = omitRetrievalStatusSentences(input.answerText);
  const finish = (
    output: { text: string; knowledgeTier: KnowledgeTier },
    notice: GroundingNoticeClass,
    traces: Parameters<typeof emitGroundingDecisionDiagnostics>[1]['traces'] = [],
    claimCount = traces.length,
  ) => {
    const gated = applyStrongAttributionGate(
      output.text,
      output.knowledgeTier,
      evidenceForStrongTier(output.knowledgeTier, chunkTexts, captureText),
      input.question,
    );
    const gatedNotice = gated.downgraded && notice === 'none' ? 'additional_explanation' : notice;
    emitGroundingDecisionDiagnostics(input.diagnostics, {
      claimCount,
      knowledgeTier: gated.knowledgeTier,
      notice: gatedNotice,
      traces,
    });
    return { text: gated.text, knowledgeTier: gated.knowledgeTier };
  };

  if (!sourceOnly) {
    const cited = enforceServerCitationIntegrity({
      text: answerText,
      chunks: input.chunks,
      captureText,
      question: input.question,
    });
    const text = dropUnsupportedCourseFacts(cited, corpus);
    if (!text) {
      return finish(
        {
          text: sourceOnlyLimitationMessage(input.contextAvailable),
          knowledgeTier: 'mixed',
        },
        'source_limitation',
      );
    }
    const unestablished = ordinaryUnestablishedRelation(text, corpus, input.question);
    if (unestablished) {
      const pieces = [text];
      if (unestablished.optionRepeat) pieces.push(OPTION_REPEAT_NOTICE);
      if (unestablished.derived) pieces.push(DERIVED_REASONING_NOTICE);
      return finish(
        { text: cleanupCitationGaps(pieces.join('\n\n')), knowledgeTier: 'mixed' },
        'derived_unverified',
      );
    }
    const tier = evaluateGroundingProvenance({
      question: input.question,
      answerText: text,
      indexedChunkTexts: chunkTexts,
      captureText,
    }).tier;
    return finish({ text, knowledgeTier: tier }, 'none');
  }

  if (!corpus) {
    return finish(
      {
        text: sourceOnlyLimitationMessage(input.contextAvailable),
        knowledgeTier: 'mixed',
      },
      'source_limitation',
    );
  }

  let quotedKept = 0;
  let equivalentKept = 0;
  let interpretiveKept = 0;
  let derivedKept = 0;
  let optionRepeats = 0;
  let academicRejections = 0;
  let contradictedLabels = 0;
  const claims = splitClaims(answerText);
  const academic: Array<ReturnType<typeof acceptSourceOnlyClaim> | null> = [];
  const skipCodes: Array<GroundingDecisionCode | 'skipped_label' | null> = [];
  const substantive: string[] = [];
  for (const claim of claims) {
    const skipped = skippedClaimCode(claim, corpus, input.question);
    if (skipped) {
      academic.push(null);
      skipCodes.push(skipped);
      continue;
    }
    const decision = acceptSourceOnlyClaim(claim, {
      question: input.question,
      chunks: input.chunks,
      captureText,
      corpus,
    });
    academic.push(decision);
    skipCodes.push(null);
    if (decision.code === 'derived_unverified') derivedKept += 1;
    if (decision.code === 'option_repeat') optionRepeats += 1;
    if (
      decision.text &&
      !decision.interpretive &&
      !decision.rejected &&
      decision.code !== 'derived_unverified' &&
      decision.code !== 'option_repeat'
    ) {
      substantive.push(decision.text);
    }
    if (decision.quoted) quotedKept += 1;
    if (decision.equivalent) equivalentKept += 1;
    if (decision.interpretive) interpretiveKept += 1;
    if (decision.rejected) academicRejections += 1;
  }

  const substantiveText = substantive.join('\n');
  const kept: string[] = [];
  const traces: Parameters<typeof emitGroundingDecisionDiagnostics>[1]['traces'] = [];
  claims.forEach((claim, index) => {
    const letter = claimLabelLetter(claim);
    if (letter) {
      const verdict = judgeLabeledOption(letter, substantiveText, corpus);
      if (verdict === 'verified') kept.push(claim);
      else if (verdict === 'contradicted') contradictedLabels += 1;
      traces.push({
        claimIndex: index,
        relation: 'not_applicable',
        decision:
          verdict === 'verified'
            ? 'label_verified'
            : verdict === 'contradicted'
              ? 'label_contradicted'
              : 'label_unverified',
        disposition: verdict === 'verified' ? 'retained' : 'removed',
      });
      return;
    }
    const decision = academic[index];
    if (decision?.text) kept.push(decision.text);
    if (!decision) {
      const skip = skipCodes[index];
      traces.push({
        claimIndex: index,
        relation: 'not_applicable',
        decision: skip && skip !== 'skipped_label' ? skip : 'skipped_echo',
        disposition: 'removed',
      });
      return;
    }
    traces.push({
      claimIndex: index,
      relation: decision.relation,
      decision: decision.code,
      disposition: claimDisposition(claim, decision.text),
    });
  });

  if (kept.length === 0) {
    return finish(
      {
        text: sourceOnlyLimitationMessage(input.contextAvailable),
        knowledgeTier: 'mixed',
      },
      'source_limitation',
      traces,
      claims.length,
    );
  }

  const pieces = [...kept];
  const alreadyLimited = kept.some((claim) => isSelfLimitation(claim));
  const supportedKept = quotedKept + equivalentKept;
  let notice: GroundingNoticeClass = 'none';
  if (!alreadyLimited && interpretiveKept > 0 && academicRejections > 0) {
    notice = 'combined';
    pieces.push(
      'This explanation is not a direct statement of the available source, and the unsupported part cannot be established from that source.',
    );
  } else if (!alreadyLimited && supportedKept > 0 && interpretiveKept > 0) {
    notice = 'additional_explanation';
    pieces.push(ADDITIONAL_EXPLANATION_NOTICE);
  } else if (!alreadyLimited && interpretiveKept > 0) {
    notice = 'interpretation';
    pieces.push(SOURCE_ONLY_INTERPRETATION_NOTICE);
  } else if (!alreadyLimited && academicRejections > 0) {
    notice = 'rejected_part';
    pieces.push(REJECTED_PART_NOTICE);
  }
  // A wrong letter is disclosed on its own. An academic rejection already
  // says the answer is not fully grounded, so the letter stays removed
  // without a second notice.
  if (optionRepeats > 0) {
    notice = 'derived_unverified';
    pieces.push(OPTION_REPEAT_NOTICE);
  }
  if (derivedKept > 0) {
    notice = 'derived_unverified';
    pieces.push(DERIVED_REASONING_NOTICE);
  }
  if (!alreadyLimited && contradictedLabels > 0 && academicRejections === 0) {
    if (notice === 'additional_explanation') notice = 'additional_explanation_and_contradicted_option';
    else if (notice === 'interpretation') notice = 'interpretation_and_contradicted_option';
    else notice = 'contradicted_option';
    pieces.push(CONTRADICTED_OPTION_NOTICE);
  }
  const text = cleanupCitationGaps(pieces.join(' '));

  if (academicRejections > 0 || contradictedLabels > 0 || derivedKept > 0 || optionRepeats > 0) {
    return finish({ text, knowledgeTier: 'mixed' }, notice, traces, claims.length);
  }
  if (interpretiveKept > 0 && supportedKept === 0) {
    return finish({ text, knowledgeTier: 'mixed' }, notice, traces, claims.length);
  }
  // A model-written limitation stays uncertain even beside a supported definition.
  if (alreadyLimited) {
    return finish({ text, knowledgeTier: 'mixed' }, notice, traces, claims.length);
  }
  // A verified relation is source support. It is not a verbatim quotation
  // unless the source's own operator wording was quoted.
  if (equivalentKept > 0 && quotedKept === 0) {
    return finish({ text, knowledgeTier: 'course_material' }, notice, traces, claims.length);
  }
  if (interpretiveKept === 0 && academicRejections === 0 && contradictedLabels === 0) {
    const tier = evaluateGroundingProvenance({
      question: input.question,
      answerText: text,
      indexedChunkTexts: chunkTexts,
      captureText,
    }).tier;
    return finish(
      { text, knowledgeTier: tier === 'general_academic' ? 'mixed' : tier },
      notice,
      traces,
      claims.length,
    );
  }
  if (supportedKept > 0) {
    return finish({ text, knowledgeTier: 'course_material' }, notice, traces, claims.length);
  }

  return finish({ text, knowledgeTier: 'mixed' }, notice, traces, claims.length);
}
