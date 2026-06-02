/** Minimal block shape for question ownership (matches notebook section blocks). */
export type ExamQuestionBlockRef = {
  id: string;
  kind: string;
  text: string;
};

export type ExamQuestionSection = {
  number: number;
  label: string;
};

const QUESTION_TEXT_RE = /^question\s*(\d+)\b/i;
const QUESTION_SHORT_RE = /^q\s*(\d+)\b/i;

export function parseQuestionNumberFromSectionText(text: string): number | null {
  const t = text.trim();
  let m = t.match(QUESTION_TEXT_RE);
  if (m) return Math.max(1, parseInt(m[1]!, 10));
  m = t.match(QUESTION_SHORT_RE);
  if (m) return Math.max(1, parseInt(m[1]!, 10));
  return null;
}

/** Scan notebook body markdown for `## Question N` / `## QN` section headings. */
export function parseExamQuestionsFromBody(body: string): ExamQuestionSection[] {
  const lines = body.split(/\r?\n/);
  const found: ExamQuestionSection[] = [];
  const seen = new Set<number>();

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (!heading) continue;
    const num = parseQuestionNumberFromSectionText(heading[1] ?? '');
    if (num == null || seen.has(num)) continue;
    seen.add(num);
    found.push({ number: num, label: `Question ${num}` });
  }

  return found.sort((a, b) => a.number - b.number);
}

export function findOwningQuestionNumber(
  blocks: ExamQuestionBlockRef[],
  blockId: string | null,
): number | null {
  if (!blockId) return null;
  const idx = blocks.findIndex(b => b.id === blockId);
  if (idx < 0) return null;

  let last: number | null = null;
  for (let i = 0; i <= idx; i++) {
    const b = blocks[i]!;
    if (b.kind !== 'section') continue;
    const n = parseQuestionNumberFromSectionText(b.text);
    if (n != null) last = n;
  }
  return last;
}

export function findSectionBlockIdForQuestionNumber(
  blocks: ExamQuestionBlockRef[],
  questionNumber: number,
): string | null {
  const section = blocks.find(
    b => b.kind === 'section' && parseQuestionNumberFromSectionText(b.text) === questionNumber,
  );
  return section?.id ?? null;
}

/** Map any block id to its owning question section block id. */
export function findSectionBlockIdForOwningBlock(
  blocks: ExamQuestionBlockRef[],
  blockId: string | null,
): string | null {
  const n = findOwningQuestionNumber(blocks, blockId);
  if (n == null) return null;
  return findSectionBlockIdForQuestionNumber(blocks, n);
}

/** Default body when a study notebook has no question sections yet. */
export const EXAM_QUESTION_SEED_BODY = `## Question 1

## Question 2

## Question 3

`;
