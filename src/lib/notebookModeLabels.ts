import type { NotebookMode } from '../hooks/useSectionFreeSpaceObjects';

/** User-facing notebook mode labels (internal enum values unchanged for data compat). */
export function getNotebookModeLabel(mode: NotebookMode | undefined): string {
  switch (mode) {
    case 'math':
      return 'Math';
    case 'math-workspace':
      return 'Derivation';
    case 'scratch':
      return 'Scratch';
    case 'normal':
    default:
      return 'Normal';
  }
}

export const NOTEBOOK_MODE_OPTIONS: ReadonlyArray<{ value: NotebookMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'math', label: 'Math' },
  { value: 'math-workspace', label: 'Derivation' },
  { value: 'scratch', label: 'Scratch' },
];

/** Short badge for spatial notebook chrome — not a separate app entry. */
export function getMathNotebookDiscoverabilityLabel(mode: NotebookMode): string | null {
  if (mode === 'math') return '∑ Math notebook';
  if (mode === 'math-workspace') return '∑ Derivation';
  return null;
}
