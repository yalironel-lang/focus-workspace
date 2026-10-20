import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import { pushEscapeHandler } from '../../ui/overlayStack';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';
import type {
  TutorCaptureAction,
  TutorCaptureChrome,
  TutorCaptureIntent,
} from './tutorCaptureTypes';

type Options = {
  enabled: boolean;
  sectionId: string;
  sourceObjectId: string;
  pageNumber: number;
  onIntent?: (intent: TutorCaptureIntent) => void;
  onChromeChange?: (chrome: TutorCaptureChrome | null) => void;
  onCaptureModeChange?: (active: boolean) => void;
  extractText?: (region: NormalizedPageRegion) => Promise<string | undefined>;
};

export function useTutorPdfCapture({
  enabled,
  sectionId,
  sourceObjectId,
  pageNumber,
  onIntent,
  onChromeChange,
  onCaptureModeChange,
  extractText,
}: Options) {
  const [captureMode, setCaptureModeState] = useState(false);
  const [selection, setSelection] = useState<NormalizedPageRegion | null>(null);

  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;
  const onCaptureModeChangeRef = useRef(onCaptureModeChange);
  onCaptureModeChangeRef.current = onCaptureModeChange;
  const extractTextRef = useRef(extractText);
  extractTextRef.current = extractText;

  const setCaptureMode = useCallback((on: boolean) => {
    setCaptureModeState(on);
    if (!on) setSelection(null);
    onCaptureModeChangeRef.current?.(on);
  }, []);

  const cancel = useCallback(() => {
    setCaptureModeState(false);
    setSelection(null);
    onCaptureModeChangeRef.current?.(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const commitSelection = useCallback((region: NormalizedPageRegion | null) => {
    setSelection(region);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCaptureModeState(false);
      setSelection(null);
      onCaptureModeChangeRef.current?.(false);
    }
  }, [enabled]);

  useEffect(() => {
    setSelection(null);
  }, [pageNumber]);

  useEffect(() => {
    if (!captureMode) return;
    return pushEscapeHandler(() => {
      cancel();
      return true;
    });
  }, [captureMode, cancel]);

  useEffect(() => {
    if (!enabled) {
      onChromeChange?.(null);
      return;
    }
    onChromeChange?.({
      captureMode,
      setCaptureMode,
      cancel,
    });
  }, [enabled, captureMode, setCaptureMode, cancel, onChromeChange]);

  const chooseAction = useCallback(
    async (action: TutorCaptureAction) => {
      if (!enabled || !selection) return;
      try {
        const text = await extractTextRef.current?.(selection);
        if (!isUsefulTutorExtractedText(text, selection)) {
          toast('No readable text found in selection. Drag over text lines to capture.');
          return;
        }

        const intent: TutorCaptureIntent = {
          action,
          attachment: {
            sourceKind: 'free_space_pdf',
            sourceObjectId,
            sectionId,
            pageNumber,
            regionNorm: selection,
            attachmentType: 'text_selection',
            extractedText: text!.trim(),
          },
        };

        setCaptureModeState(false);
        setSelection(null);
        onCaptureModeChangeRef.current?.(false);
        onIntentRef.current?.(intent);
      } catch {
        toast('Could not extract text from this PDF region. Try selecting again.');
      }
    },
    [enabled, selection, sourceObjectId, sectionId, pageNumber],
  );

  return {
    captureMode,
    selection,
    setCaptureMode,
    cancel,
    clearSelection,
    commitSelection,
    chooseAction,
  };
}
