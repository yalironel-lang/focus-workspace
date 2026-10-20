/**
 * Conservative server-authoritative knowledge provenance (SKE1.2).
 *
 * Available context (what the model was given) is reported separately from
 * supported answer provenance (what the answer can be attributed to).
 *
 * A tier of course_material or pdf_selection requires a direct quotation that
 * does not reverse the source or change its numbers. Paraphrase, simplification,
 * translation, and mathematical restatement stay mixed: useful, and explicitly
 * uncertain. Distinctive-term overlap is not verified grounding.
 *
 * Source-only questions are judged sentence by sentence. A faithful explanation
 * is kept and qualified. A course-specific fact, reversal, changed number,
 * unsupported cause, or unrelated substitution is removed.
 */

import type { ContextAvailable, KnowledgeTier } from '../requestTypes.ts';

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

const REJECTED_PART_NOTICE =
  'The unsupported part cannot be established from the available source.';

/**
 * A contradicted choice is a real selection error, so the remaining text is
 * not fully grounded. It is not an unsupported academic statement.
 */
export const CONTRADICTED_OPTION_NOTICE =
  'The named option does not match the available source.';

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

export function splitClaims(text: string): string[] {
  const rough = text.split(/(?<=[.!?])\s+|\n+/);
  const claims: string[] = [];
  for (const part of rough) {
    const trimmed = part.trim();
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
  const normalized = textForSupportMeasurement(text)
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

function hasSupportedQuotation(answer: string, source: string, question: string): boolean {
  // No sentence can quote a source phrase that the complete answer lacks.
  if (!answerQuotesSource(answer, source)) return false;
  const parts = splitClaims(answer);
  const pieces = parts.length > 0 ? parts : [answer];
  return pieces.some(
    (part) =>
      answerQuotesSource(part, source) &&
      !hasPolarityConflict(part, source) &&
      !hasNumericOrMagnitudeConflict(part, source, question),
  );
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
  const parts = text.split(/((?<=[.!?])\s+|\n+)/);
  const segs: AcademicClaimSegment[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? '';
    const trailing = parts[i + 1] ?? '';
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
  return [REJECTED_PART_NOTICE, CONTRADICTED_OPTION_NOTICE].some(
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

function acceptSourceOnlyClaim(
  claim: string,
  input: {
    question: string;
    chunks: { citationIndex: number; text: string }[];
    captureText: string;
    corpus: string;
  },
): { text: string | null; quoted: boolean; interpretive: boolean; rejected: boolean } {
  if (!claim.trim()) return { text: null, quoted: false, interpretive: false, rejected: false };
  if (isSelfLimitation(claim)) {
    return { text: stripMarkers(claim), quoted: false, interpretive: true, rejected: false };
  }

  const causal = splitUnsupportedCause(claim, input.corpus);
  if (causal) {
    const main = causal.main
      ? acceptSourceOnlyClaim(causal.main, input)
      : { text: null, quoted: false, interpretive: false, rejected: false };
    return {
      text: main.text,
      quoted: main.quoted,
      interpretive: main.interpretive,
      rejected: true,
    };
  }

  if (isUnsupportedCourseFact(claim, input.corpus) || hasPolarityConflict(claim, input.corpus) || hasNumericOrMagnitudeConflict(claim, input.corpus, input.question)) {
    return { text: null, quoted: false, interpretive: false, rejected: true };
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
    return { text: quoted, quoted: true, interpretive: false, rejected: false };
  }
  if (claimIsRejected(claim, input.corpus, input.question)) {
    return { text: null, quoted: false, interpretive: false, rejected: true };
  }
  if (isFaithfulParaphrase(claim, input.corpus)) {
    return { text: stripMarkers(claim), quoted: false, interpretive: false, rejected: false };
  }
  return { text: stripMarkers(claim), quoted: false, interpretive: true, rejected: false };
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
export function applyClaimLevelGrounding(input: {
  question: string;
  answerText: string;
  chunks: { citationIndex: number; text: string }[];
  captureText?: string | null;
  contextAvailable: ContextAvailable;
}): { text: string; knowledgeTier: KnowledgeTier } {
  const captureText = input.captureText?.trim() ?? '';
  const chunkTexts = input.chunks.map((chunk) => chunk.text.trim()).filter((text) => text.length > 0);
  const corpus = [captureText, ...chunkTexts].filter((text) => text.length > 0).join('\n');
  const sourceOnly = isExplicitSourceOnlyQuestion(input.question);
  const answerText = omitRetrievalStatusSentences(input.answerText);

  if (!sourceOnly) {
    const cited = enforceServerCitationIntegrity({
      text: answerText,
      chunks: input.chunks,
      captureText,
      question: input.question,
    });
    const text = dropUnsupportedCourseFacts(cited, corpus);
    if (!text) {
      return {
        text: sourceOnlyLimitationMessage(input.contextAvailable),
        knowledgeTier: 'mixed',
      };
    }
    const tier = evaluateGroundingProvenance({
      question: input.question,
      answerText: text,
      indexedChunkTexts: chunkTexts,
      captureText,
    }).tier;
    return { text, knowledgeTier: tier };
  }

  if (!corpus) {
    return {
      text: sourceOnlyLimitationMessage(input.contextAvailable),
      knowledgeTier: 'mixed',
    };
  }

  let quotedKept = 0;
  let interpretiveKept = 0;
  let academicRejections = 0;
  let contradictedLabels = 0;
  const claims = splitClaims(answerText);
  const academic: Array<ReturnType<typeof acceptSourceOnlyClaim> | null> = [];
  const substantive: string[] = [];
  for (const claim of claims) {
    if (
      claimLabelLetter(claim) ||
      isEchoedCheckerNotice(claim) ||
      isHarmlessRetrievalNarration(claim) ||
      isSymbolicNotation(claim, corpus, input.question)
    ) {
      academic.push(null);
      continue;
    }
    const decision = acceptSourceOnlyClaim(claim, {
      question: input.question,
      chunks: input.chunks,
      captureText,
      corpus,
    });
    academic.push(decision);
    if (decision.text && !decision.interpretive && !decision.rejected) substantive.push(decision.text);
    if (decision.quoted) quotedKept += 1;
    if (decision.interpretive) interpretiveKept += 1;
    if (decision.rejected) academicRejections += 1;
  }

  const substantiveText = substantive.join('\n');
  const kept: string[] = [];
  claims.forEach((claim, index) => {
    const letter = claimLabelLetter(claim);
    if (letter) {
      const verdict = judgeOptionLabel(letter, substantiveText, corpus);
      if (verdict === 'verified') kept.push(claim);
      else if (verdict === 'contradicted') contradictedLabels += 1;
      return;
    }
    const decision = academic[index];
    if (decision?.text) kept.push(decision.text);
  });

  if (kept.length === 0) {
    return {
      text: sourceOnlyLimitationMessage(input.contextAvailable),
      knowledgeTier: 'mixed',
    };
  }

  const pieces = [...kept];
  const alreadyLimited = kept.some((claim) => isSelfLimitation(claim));
  if (!alreadyLimited && interpretiveKept > 0 && academicRejections > 0) {
    pieces.push(
      'This explanation is not a direct statement of the available source, and the unsupported part cannot be established from that source.',
    );
  } else if (!alreadyLimited && interpretiveKept > 0) {
    pieces.push(SOURCE_ONLY_INTERPRETATION_NOTICE);
  } else if (!alreadyLimited && academicRejections > 0) {
    pieces.push(REJECTED_PART_NOTICE);
  }
  // A wrong letter is disclosed on its own. An academic rejection already
  // says the answer is not fully grounded, so the letter stays removed
  // without a second notice.
  if (!alreadyLimited && contradictedLabels > 0 && academicRejections === 0) {
    pieces.push(CONTRADICTED_OPTION_NOTICE);
  }
  const text = cleanupCitationGaps(pieces.join(' '));

  if (interpretiveKept === 0 && academicRejections === 0 && contradictedLabels === 0) {
    const tier = evaluateGroundingProvenance({
      question: input.question,
      answerText: text,
      indexedChunkTexts: chunkTexts,
      captureText,
    }).tier;
    return { text, knowledgeTier: tier === 'general_academic' ? 'mixed' : tier };
  }

  return { text, knowledgeTier: 'mixed' };
}
