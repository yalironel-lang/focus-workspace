import { Z_STUDY_SESSION_SHELL } from '../ui/zIndexLayers';

export type StudyPaneFocus = 'balanced' | 'exam' | 'work';

export interface StudySessionChrome {
  zIndex: number;
  top: number;
  left: number;
  width: string;
  height: string;
  bodyDirection: 'row' | 'column';
  sourcePanel: { flex: string; minWidth?: number; minHeight?: number };
  workPanel: { flex: string; minWidth?: number; minHeight?: number };
}

const FOCUS_ROW = {
  balanced: { source: '1 1 50%', work: '1 1 50%' },
  exam: { source: '1 1 75%', work: '1 1 25%' },
  work: { source: '1 1 28%', work: '1 1 72%' },
} as const;

const FOCUS_COLUMN = {
  balanced: { source: '1 1 50%', work: '1 1 50%' },
  exam: { source: '1 1 78%', work: '1 1 22%' },
  work: { source: '1 1 35%', work: '1 1 65%' },
} as const;

/** Split geometry for study session shell; pane focus adjusts flex ratios only. */
export function computeStudySessionChrome(
  shellTopInset = 56,
  paneFocus: StudyPaneFocus = 'exam',
  isNarrow = false,
): StudySessionChrome {
  const ratios = isNarrow ? FOCUS_COLUMN[paneFocus] : FOCUS_ROW[paneFocus];
  const minSource = isNarrow ? 120 : 320;
  const minWork = isNarrow ? 120 : 320;
  return {
    zIndex: Z_STUDY_SESSION_SHELL,
    top: shellTopInset,
    left: 0,
    width: '100vw',
    height: `calc(100dvh - ${shellTopInset}px)`,
    bodyDirection: isNarrow ? 'column' : 'row',
    sourcePanel: {
      flex: ratios.source,
      minWidth: isNarrow ? undefined : minSource,
      minHeight: isNarrow ? minSource || 120 : undefined,
    },
    workPanel: {
      flex: ratios.work,
      minWidth: isNarrow ? undefined : minWork,
      minHeight: isNarrow ? minWork : undefined,
    },
  };
}
