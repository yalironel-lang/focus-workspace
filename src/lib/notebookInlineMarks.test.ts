import {
  applyMarkToggle,
  clearAllMarksInRange,
  duplicateRange,
  mergeAdjacentMarks,
  parseRichLine,
  serializeRichLine,
  stripInlineMarks,
} from './notebookInlineMarks';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function eq<T>(a: T, b: T, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

// parse / serialize round-trip
const line = { plain: 'Hello world', marks: [{ s: 0, e: 5, t: 'b' as const }] };
const serialized = serializeRichLine(line);
assert(serialized.includes('Hello world'), 'serialized contains plain');
eq(parseRichLine(serialized).plain, 'Hello world', 'round-trip plain');
eq(parseRichLine(serialized).marks[0]?.t, 'b', 'round-trip mark type');

// backward compat: no prefix
eq(parseRichLine('plain only').marks.length, 0, 'no marks on plain line');

// toggle bold
let marks = applyMarkToggle([], 0, 3, 'b');
eq(marks.length, 1, 'toggle adds bold');
marks = applyMarkToggle(marks, 0, 3, 'b');
eq(marks.length, 0, 'toggle removes bold');

// merge adjacent
eq(
  mergeAdjacentMarks([
    { s: 0, e: 3, t: 'b' },
    { s: 3, e: 6, t: 'b' },
  ]).length,
  1,
  'merge adjacent bold',
);

// duplicate range
const dup = duplicateRange('abc', [{ s: 0, e: 1, t: 'b' }], 0, 1);
eq(dup.plain, 'aabc', 'duplicate inserts slice');

// clear formatting
marks = [{ s: 0, e: 5, t: 'b' }, { s: 0, e: 5, t: 'i' }];
eq(clearAllMarksInRange(marks, 0, 5).length, 0, 'clear range');

// strip inline marks mid-line
eq(stripInlineMarks('# ⟨m⟩[{"s":0,"e":1,"t":"b"}]⟨/m⟩Hi'), '# Hi', 'strip marks after heading');

console.log('notebookInlineMarks.test.ts: all assertions passed');
