/**
 * Study layout modes — viewport-docked math notebook beside PDF/source on canvas.
 * Persisted on notebook content (`studyLayout`); same object, alternate host.
 */

export type StudyLayoutMode =
  | 'canvas'
  | 'fullscreen'
  | 'dock-right-half'
  | 'dock-right-third'
  | 'dock-left-half';

export const STUDY_LAYOUT_MODES: StudyLayoutMode[] = [
  'canvas',
  'fullscreen',
  'dock-right-half',
  'dock-right-third',
  'dock-left-half',
];

export function sanitizeStudyLayout(raw: unknown): StudyLayoutMode {
  if (typeof raw !== 'string') return 'canvas';
  return STUDY_LAYOUT_MODES.includes(raw as StudyLayoutMode) ? (raw as StudyLayoutMode) : 'canvas';
}

export function isStudyLayoutDocked(mode: StudyLayoutMode | undefined): boolean {
  return mode !== undefined && mode !== 'canvas';
}

export function studyLayoutLabel(mode: StudyLayoutMode): string {
  switch (mode) {
    case 'canvas':
      return 'Floating on canvas';
    case 'fullscreen':
      return 'Fullscreen';
    case 'dock-right-half':
      return 'Right half';
    case 'dock-right-third':
      return 'Right third';
    case 'dock-left-half':
      return 'Left half';
    default:
      return 'Floating on canvas';
  }
}

export type StudyLayoutPanelPlacement = {
  position: 'fixed';
  top: number;
  right?: number;
  left?: number;
  bottom: number;
  width: string;
  zIndex: number;
};

/** Viewport panel geometry for dock / fullscreen hosts. */
export function getStudyLayoutPanelPlacement(mode: StudyLayoutMode): StudyLayoutPanelPlacement | null {
  if (mode === 'canvas') return null;

  const narrow =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  if (mode === 'fullscreen') {
    return { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', zIndex: 9992 };
  }

  if (narrow && (mode === 'dock-right-third' || mode === 'dock-left-half')) {
    return { position: 'fixed', top: 0, right: 0, bottom: 0, width: '100vw', zIndex: 9988 };
  }

  switch (mode) {
    case 'dock-right-half':
      return { position: 'fixed', top: 0, right: 0, bottom: 0, width: '50vw', zIndex: 9988 };
    case 'dock-right-third':
      return { position: 'fixed', top: 0, right: 0, bottom: 0, width: '33.333vw', zIndex: 9988 };
    case 'dock-left-half':
      return { position: 'fixed', top: 0, left: 0, bottom: 0, width: '50vw', zIndex: 9988 };
    default:
      return null;
  }
}
