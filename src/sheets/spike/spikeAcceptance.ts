/** Acceptance matrix keys for the PR1 Univer spike. */

export type SpikeVerdict = 'PASS' | 'FAIL' | 'MANUAL_REQUIRED' | 'CONDITIONAL' | 'UNTESTED';

export type SpikeCriterionId =
  | 'react19'
  | 'editableGrid'
  | 'rangeSelection'
  | 'keyboardNav'
  | 'copyPaste'
  | 'multiCellPaste'
  | 'formulaEval'
  | 'dependencyRecalc'
  | 'undoRedo'
  | 'resize'
  | 'mountUnmountRestore'
  | 'serializableState'
  | 'perf1k'
  | 'keyboardIsolation'
  | 'license'
  | 'transformParent'
  | 'perf10k'
  | 'cssIsolation'
  | 'lazyLoad';

export type SpikeCriterion = {
  id: SpikeCriterionId;
  label: string;
  required: boolean;
  verdict: SpikeVerdict;
  notes: string;
};

export function createInitialAcceptanceMatrix(): SpikeCriterion[] {
  return [
    { id: 'react19', label: 'React 19 compatibility', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'editableGrid', label: 'Editable grid', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'rangeSelection', label: 'Range selection', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'keyboardNav', label: 'Keyboard navigation', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'copyPaste', label: 'Copy/paste', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'multiCellPaste', label: 'Multi-cell paste', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'formulaEval', label: 'Formula evaluation', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'dependencyRecalc', label: 'Dependency recalculation', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'undoRedo', label: 'Undo/redo', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'resize', label: 'Container resize', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'mountUnmountRestore', label: 'Mount/unmount restore', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'serializableState', label: 'Serializable state', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'perf1k', label: 'Reasonable 1k-cell performance', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'keyboardIsolation', label: 'Keyboard isolation feasibility', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'license', label: 'License acceptable (OSS, no Pro required)', required: true, verdict: 'UNTESTED', notes: '' },
    { id: 'transformParent', label: 'Transformed-parent (scale)', required: false, verdict: 'UNTESTED', notes: '' },
    { id: 'perf10k', label: '10k-cell performance', required: false, verdict: 'UNTESTED', notes: '' },
    { id: 'cssIsolation', label: 'CSS isolation', required: false, verdict: 'UNTESTED', notes: '' },
    { id: 'lazyLoad', label: 'Lazy-loading effectiveness', required: false, verdict: 'UNTESTED', notes: '' },
  ];
}
