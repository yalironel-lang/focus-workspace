import {
  buildSimpleDefault,
  type MathTemplateId,
} from './mathInputAssistant';

/** Structure ids for the Study Composition System (FLM snippets / templates). */
export type CompositionStructureId =
  | MathTemplateId
  | 'subscript'
  | 'grouping'
  | 'derivative'
  | 'answer'
  | 'equation-block';

export type CompositionFavoriteId = Exclude<CompositionStructureId, 'equation-block'>;

export interface CompositionStructureDef {
  id: CompositionStructureId;
  label: string;
  title: string;
  section: 'calculus' | 'algebra' | 'document';
  pinnable: boolean;
  /** Inline insert at caret; false = block-level action */
  inline: boolean;
}

export const BUBBLE_OVERFLOW_STRUCTURES: CompositionStructureDef[] = [
  { id: 'root', label: '√', title: 'Square root', section: 'algebra', pinnable: true, inline: true },
  { id: 'grouping', label: '( )', title: 'Grouping', section: 'algebra', pinnable: true, inline: true },
  { id: 'derivative', label: 'd/dx', title: 'Derivative', section: 'calculus', pinnable: true, inline: true },
  { id: 'answer', label: 'Ans', title: 'Answer line', section: 'document', pinnable: true, inline: true },
];

export const SHEET_CALCULUS: CompositionStructureDef[] = [
  { id: 'integral', label: '∫', title: 'Integral', section: 'calculus', pinnable: true, inline: true },
  { id: 'derivative', label: 'd/dx', title: 'Derivative', section: 'calculus', pinnable: true, inline: true },
  { id: 'limit', label: 'lim', title: 'Limit', section: 'calculus', pinnable: true, inline: true },
  { id: 'sum', label: 'Σ', title: 'Summation', section: 'calculus', pinnable: true, inline: true },
];

export const SHEET_ALGEBRA: CompositionStructureDef[] = [
  { id: 'root', label: '√', title: 'Square root', section: 'algebra', pinnable: true, inline: true },
  { id: 'grouping', label: '( )', title: 'Grouping', section: 'algebra', pinnable: true, inline: true },
];

export const SHEET_DOCUMENT: CompositionStructureDef[] = [
  { id: 'equation-block', label: '$$', title: 'Display equation block', section: 'document', pinnable: false, inline: false },
  { id: 'answer', label: 'Ans', title: 'Answer line', section: 'document', pinnable: true, inline: true },
];

const PINNABLE_IDS = new Set<string>([
  'fraction',
  'exponent',
  'root',
  'integral',
  'limit',
  'sum',
  'subscript',
  'grouping',
  'derivative',
  'answer',
]);

export function defaultCompositionFavorite(notebookMode: string): CompositionFavoriteId {
  if (notebookMode === 'math-workspace') return 'derivative';
  return 'integral';
}

export function isMathTemplateId(id: CompositionStructureId): id is MathTemplateId {
  return (
    id === 'fraction' ||
    id === 'exponent' ||
    id === 'root' ||
    id === 'integral' ||
    id === 'limit' ||
    id === 'sum'
  );
}

export function isPinnableStructureId(id: CompositionStructureId): id is CompositionFavoriteId {
  return PINNABLE_IDS.has(id);
}

export function compositionInsertSnippet(id: CompositionStructureId): string {
  if (isMathTemplateId(id)) {
    return buildSimpleDefault(id);
  }
  switch (id) {
    case 'subscript':
      return 'x_n';
    case 'grouping':
      return '( )';
    case 'derivative':
      return 'd/dx ';
    case 'answer':
      return 'Answer: ';
    default:
      return '';
  }
}

export function structureLabel(id: CompositionStructureId): string {
  const all = [...SHEET_CALCULUS, ...SHEET_ALGEBRA, ...SHEET_DOCUMENT, ...BUBBLE_OVERFLOW_STRUCTURES];
  const hit = all.find(s => s.id === id);
  if (hit) return hit.label;
  if (id === 'fraction') return 'a/b';
  if (id === 'exponent') return 'xⁿ';
  if (id === 'subscript') return 'xₙ';
  return String(id);
}

export function favoriteBubbleLabel(id: CompositionFavoriteId): string {
  return structureLabel(id);
}

export function isMathCapableBlockKind(kind: string): boolean {
  return kind === 'paragraph' || kind === 'step' || kind === 'math';
}
