import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import type { TeachingMode } from '../gatewayClient/types';

export type { TeachingMode } from '../gatewayClient/types';
export type TutorCaptureAction = 'hint' | 'explain' | 'solve';

export const TUTOR_CAPTURE_ACTION_OPTIONS: ReadonlyArray<{
  action: TutorCaptureAction;
  label: string;
}> = [
  { action: 'hint', label: 'Hint' },
  { action: 'explain', label: 'Explain' },
  { action: 'solve', label: 'Solve' },
];

export const TEACHING_MODE_OPTIONS: ReadonlyArray<{
  mode: TeachingMode;
  label: string;
  shortLabel: string;
  description: string;
  tagline: string;
}> = [
  {
    mode: 'explain',
    label: 'Explain',
    shortLabel: 'Explain',
    description: 'Clear conceptual explanations with intuition & concrete examples',
    tagline: 'Deep intuition & examples',
  },
  {
    mode: 'teach_me',
    label: 'Teach Me',
    shortLabel: 'Teach Me',
    description: 'Interactive step-by-step Socratic guidance one checkpoint at a time',
    tagline: 'Socratic step-by-step guidance',
  },
  {
    mode: 'just_answer',
    label: 'Just Answer',
    shortLabel: 'Answer',
    description: 'Direct, concise answer or solution with minimal preamble',
    tagline: 'Direct, concise solution',
  },
  {
    mode: 'exam_prep',
    label: 'Exam Prep',
    shortLabel: 'Exam',
    description: 'Exam traps, rubric guidance & assessment practice checks',
    tagline: 'Exam focus, traps & rubrics',
  },
];

export function legacyActionToTeachingMode(action?: string | null): TeachingMode {
  if (action === 'hint') return 'teach_me';
  if (action === 'solve') return 'just_answer';
  if (action === 'teach_me' || action === 'just_answer' || action === 'exam_prep' || action === 'explain') {
    return action;
  }
  return 'explain';
}

export function teachingModeToLegacyAction(mode: TeachingMode): TutorCaptureAction {
  if (mode === 'teach_me') return 'hint';
  if (mode === 'just_answer') return 'solve';
  return 'explain';
}

export type TutorContextAttachment = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  sectionId: string;
  pageNumber: number;
  regionNorm: NormalizedPageRegion;
  attachmentType: 'text_selection';
  extractedText: string;
};

export type TutorCaptureIntent = {
  action: TutorCaptureAction;
  mode?: TeachingMode;
  attachment: TutorContextAttachment;
};

export type TutorCaptureChrome = {
  captureMode: boolean;
  setCaptureMode: (on: boolean) => void;
  cancel: () => void;
};
