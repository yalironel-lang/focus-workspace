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

/** Full-page region used when attaching recovered OCR or native page text (not a drag selection). */
export const RECOVERED_PAGE_REGION_NORM: NormalizedPageRegion = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
};

/** Alias for full-page native fallback (same geometry; distinct attachmentType). */
export const NATIVE_PAGE_REGION_NORM = RECOVERED_PAGE_REGION_NORM;

export type TutorAttachmentType =
  | 'text_selection'
  | 'recovered_page'
  | 'native_page'
  | 'visual_selection';

/** Ephemeral JPEG payload — must not be written to session storage / IDB. */
export type TutorVisualPayload = {
  mime: 'image/jpeg' | 'image/png';
  imageBase64: string;
  widthPx: number;
  heightPx: number;
};

export type TutorContextAttachment = {
  sourceKind: 'free_space_pdf';
  sourceObjectId: string;
  sectionId: string;
  pageNumber: number;
  regionNorm: NormalizedPageRegion;
  attachmentType: TutorAttachmentType;
  /**
   * Text extract for text/native/recovered; for visual_selection a short label only
   * (not a transcription of the image).
   */
  extractedText: string;
  /** Present only for visual_selection; never persist. */
  visual?: TutorVisualPayload;
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
