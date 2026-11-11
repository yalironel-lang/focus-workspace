import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import { pushEscapeHandler } from '../../ui/overlayStack';
import type { PdfPageTextAssessmentKind } from './assessPdfPageTextLayer';
import {
  isInvalidCaptureRegionGeometry,
  logCaptureRegionDiagnosticsIfEnabled,
  recordCaptureRegionDiagnostics,
  withPageProbe,
  type CaptureRegionDiagnostics,
} from './captureRegionDiagnostics';
import { isCaptureRegionDiagActive } from './captureRegionDiagOptIn';
import {
  fetchRecoveredPdfPageText,
  RECOVERED_PAGE_TEXT_MAX_CHARS,
} from './fetchRecoveredPdfPageText';
import { assessNativePageFallbackEligibility } from './nativePageFallbackAssessment';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';
import type {
  TutorAttachmentType,
  TutorCaptureAction,
  TutorCaptureChrome,
  TutorCaptureIntent,
  TutorVisualPayload,
} from './tutorCaptureTypes';
import { NATIVE_PAGE_REGION_NORM, RECOVERED_PAGE_REGION_NORM } from './tutorCaptureTypes';
import type { RenderPdfRegionImageResult } from '../visualCapture/renderPdfRegionImage';
import { PDF_VISUAL_SELECTION_MARKER } from '../visualCapture/visualSelectionContract';

export type PageTextLayerProbe = {
  kind: PdfPageTextAssessmentKind;
  itemCount: number;
  meaningfulCharCount: number;
  pageText?: string;
  /**
   * True only when full-page native text is Tutor-useful.
   * Kept for call sites; prefer `kind === 'useful'`.
   */
  hasReadableText: boolean;
};

type Options = {
  enabled: boolean;
  sectionId: string;
  sourceObjectId: string;
  pageNumber: number;
  onIntent?: (intent: TutorCaptureIntent) => void;
  onChromeChange?: (chrome: TutorCaptureChrome | null) => void;
  onCaptureModeChange?: (active: boolean) => void;
  extractText?: (region: NormalizedPageRegion) => Promise<string | undefined>;
  /** Optional probe of the whole page text layer (native PDF.js). */
  probePageTextLayer?: (pageNumber: number) => Promise<PageTextLayerProbe>;
  /**
   * Optional privacy-safe region assessment (counters/codes only).
   * When omitted, Capture still works; diagnostics use a coarse fallback.
   */
  assessRegion?: (region: NormalizedPageRegion) => Promise<CaptureRegionDiagnostics | null>;
  /**
   * Offscreen PDF.js region → JPEG. Required for Visual Capture V1.
   * Must not capture browser chrome.
   */
  renderRegionImage?: (region: NormalizedPageRegion) => Promise<RenderPdfRegionImageResult>;
};

type PendingFullPage = {
  action: TutorCaptureAction;
  text: string;
  truncated: boolean;
  attachmentType: 'recovered_page' | 'native_page';
};

function captureDiagEnabledNow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isCaptureRegionDiagActive({
      search: window.location.search,
      storage: window.sessionStorage,
    });
  } catch {
    return false;
  }
}

function coarseRegionDiagnostics(
  region: NormalizedPageRegion,
  text: string | undefined,
  pageKind: PdfPageTextAssessmentKind | 'unknown',
): CaptureRegionDiagnostics {
  const regionUseful: 0 | 1 = isUsefulTutorExtractedText(text, region) ? 1 : 0;
  const extractedCharCount = (text?.match(/[\p{L}\p{N}]/gu) ?? []).length;
  let code: CaptureRegionDiagnostics['code'];
  if (isInvalidCaptureRegionGeometry(region)) code = 'invalid_geometry';
  else if (regionUseful === 1) code = 'region_usable';
  else if (!text?.trim()) code = 'no_intersecting_items';
  else code = 'intersecting_unusable';
  return withPageProbe(
    {
      code,
      intersectingItemCount: text?.trim() ? 1 : 0,
      extractedCharCount,
      regionUseful,
      pageKindCode: 3,
      pageUseful: 0,
      nativePageEligible: 0,
    },
    pageKind,
  );
}

function showNativePageOfferToast(input: {
  onUse: () => void;
  onVisual?: () => void;
  onDismiss: () => void;
}): string {
  return toast.custom(
    (t) =>
      createElement(
        'div',
        {
          'data-testid': 'capture-native-page-offer',
          style: {
            maxWidth: 360,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(12,16,28,0.96)',
            border: '1px solid rgba(148,163,184,0.35)',
            color: '#e2e8f0',
            fontSize: 13,
            lineHeight: 1.4,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          },
        },
        createElement(
          'div',
          { style: { fontWeight: 600, marginBottom: 6 } },
          'Use full-page PDF text',
        ),
        createElement(
          'div',
          { style: { color: '#cbd5e1', marginBottom: 10 } },
          'The selected area could not be read. ZIKUK can use text from the entire page instead, but this may not include the selected formula.',
        ),
        createElement(
          'div',
          { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' } },
          input.onVisual
            ? createElement(
                'button',
                {
                  type: 'button',
                  'data-testid': 'capture-native-page-visual',
                  onClick: () => {
                    toast.dismiss(t.id);
                    input.onVisual?.();
                  },
                  style: {
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(56,189,248,0.5)',
                    background: 'transparent',
                    color: '#7dd3fc',
                    cursor: 'pointer',
                    fontSize: 12,
                  },
                },
                'Understand visually',
              )
            : null,
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'capture-native-page-dismiss',
              onClick: () => {
                toast.dismiss(t.id);
                input.onDismiss();
              },
              style: {
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'transparent',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: 12,
              },
            },
            'Cancel',
          ),
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'capture-native-page-confirm',
              onClick: () => {
                toast.dismiss(t.id);
                input.onUse();
              },
              style: {
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: '#38bdf8',
                color: '#0f172a',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              },
            },
            'Use full-page PDF text',
          ),
        ),
      ),
    { duration: 20000 },
  );
}

function showRecoveryOfferToast(input: {
  truncated: boolean;
  onUse: () => void;
  onVisual?: () => void;
  onDismiss: () => void;
}): string {
  return toast.custom(
    (t) =>
      createElement(
        'div',
        {
          'data-testid': 'capture-recovery-offer',
          style: {
            maxWidth: 360,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(12,16,28,0.96)',
            border: '1px solid rgba(148,163,184,0.35)',
            color: '#e2e8f0',
            fontSize: 13,
            lineHeight: 1.4,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          },
        },
        createElement(
          'div',
          { style: { fontWeight: 600, marginBottom: 6 } },
          'Recovered page text available',
        ),
        createElement(
          'div',
          { style: { color: '#cbd5e1', marginBottom: 10 } },
          `No usable text in this selection. Tutor can analyze the recovered OCR text for this whole page (not the exact selection). Mathematical symbols may be imperfect.${
            input.truncated ? ' Text was truncated to the capture limit.' : ''
          }`,
        ),
        createElement(
          'div',
          { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' } },
          input.onVisual
            ? createElement(
                'button',
                {
                  type: 'button',
                  'data-testid': 'capture-recovery-visual',
                  onClick: () => {
                    toast.dismiss(t.id);
                    input.onVisual?.();
                  },
                  style: {
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(56,189,248,0.5)',
                    background: 'transparent',
                    color: '#7dd3fc',
                    cursor: 'pointer',
                    fontSize: 12,
                  },
                },
                'Understand visually',
              )
            : null,
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'capture-recovery-dismiss',
              onClick: () => {
                toast.dismiss(t.id);
                input.onDismiss();
              },
              style: {
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'transparent',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: 12,
              },
            },
            'Cancel',
          ),
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'capture-recovery-confirm',
              onClick: () => {
                toast.dismiss(t.id);
                input.onUse();
              },
              style: {
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: '#38bdf8',
                color: '#0f172a',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              },
            },
            'Use recovered page text',
          ),
        ),
      ),
    { duration: 20000 },
  );
}


function showVisualOfferToast(input: {
  onUse: () => void;
  onDismiss: () => void;
}): string {
  return toast.custom(
    (t) =>
      createElement(
        'div',
        {
          'data-testid': 'capture-visual-offer',
          style: {
            maxWidth: 360,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(12,16,28,0.96)',
            border: '1px solid rgba(148,163,184,0.35)',
            color: '#e2e8f0',
            fontSize: 13,
            lineHeight: 1.4,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          },
        },
        createElement(
          'div',
          { style: { fontWeight: 600, marginBottom: 6 } },
          'Understand selected area visually',
        ),
        createElement(
          'div',
          { style: { color: '#cbd5e1', marginBottom: 10 } },
          'Text could not be read from this selection. ZIKUK can send an image of the selected PDF area to a vision-capable Tutor model. This is not a text transcription. Confirm to continue.',
        ),
        createElement(
          'div',
          { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' } },
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'capture-visual-dismiss',
              onClick: () => {
                toast.dismiss(t.id);
                input.onDismiss();
              },
              style: {
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'transparent',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: 12,
              },
            },
            'Cancel',
          ),
          createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'capture-visual-confirm',
              onClick: () => {
                toast.dismiss(t.id);
                input.onUse();
              },
              style: {
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: '#38bdf8',
                color: '#0f172a',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              },
            },
            'Understand selected area visually',
          ),
        ),
      ),
    { duration: 20000 },
  );
}

export function useTutorPdfCapture({
  enabled,
  sectionId,
  sourceObjectId,
  pageNumber,
  onIntent,
  onChromeChange,
  onCaptureModeChange,
  extractText,
  probePageTextLayer,
  assessRegion,
  renderRegionImage,
}: Options) {
  const [captureMode, setCaptureModeState] = useState(false);
  const [selection, setSelection] = useState<NormalizedPageRegion | null>(null);
  const [pendingFullPage, setPendingFullPage] = useState<PendingFullPage | null>(null);

  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;
  const onCaptureModeChangeRef = useRef(onCaptureModeChange);
  onCaptureModeChangeRef.current = onCaptureModeChange;
  const extractTextRef = useRef(extractText);
  extractTextRef.current = extractText;
  const probePageTextLayerRef = useRef(probePageTextLayer);
  probePageTextLayerRef.current = probePageTextLayer;
  const assessRegionRef = useRef(assessRegion);
  assessRegionRef.current = assessRegion;
  const renderRegionImageRef = useRef(renderRegionImage);
  renderRegionImageRef.current = renderRegionImage;
  const offerToastIdRef = useRef<string | null>(null);
  const pendingVisualActionRef = useRef<TutorCaptureAction | null>(null);

  const dismissOfferToast = useCallback(() => {
    if (offerToastIdRef.current) {
      toast.dismiss(offerToastIdRef.current);
      offerToastIdRef.current = null;
    }
    setPendingFullPage(null);
  }, []);

  const setCaptureMode = useCallback(
    (on: boolean) => {
      setCaptureModeState(on);
      if (!on) {
        setSelection(null);
        dismissOfferToast();
      }
      onCaptureModeChangeRef.current?.(on);
    },
    [dismissOfferToast],
  );

  const cancel = useCallback(() => {
    setCaptureModeState(false);
    setSelection(null);
    dismissOfferToast();
    onCaptureModeChangeRef.current?.(false);
  }, [dismissOfferToast]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    dismissOfferToast();
  }, [dismissOfferToast]);

  const commitSelection = useCallback((region: NormalizedPageRegion | null) => {
    setSelection(region);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCaptureModeState(false);
      setSelection(null);
      dismissOfferToast();
      onCaptureModeChangeRef.current?.(false);
    }
  }, [enabled, dismissOfferToast]);

  useEffect(() => {
    setSelection(null);
    dismissOfferToast();
  }, [pageNumber, dismissOfferToast]);

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

  const emitIntent = useCallback(
    (
      action: TutorCaptureAction,
      text: string,
      attachmentType: TutorAttachmentType,
      visual?: TutorVisualPayload,
    ) => {
      const intent: TutorCaptureIntent = {
        action,
        attachment: {
          sourceKind: 'free_space_pdf',
          sourceObjectId,
          sectionId,
          pageNumber,
          regionNorm:
            attachmentType === 'recovered_page' || attachmentType === 'native_page'
              ? attachmentType === 'native_page'
                ? NATIVE_PAGE_REGION_NORM
                : RECOVERED_PAGE_REGION_NORM
              : (selection ?? RECOVERED_PAGE_REGION_NORM),
          attachmentType,
          extractedText: text.trim(),
          ...(attachmentType === 'visual_selection' && visual ? { visual } : {}),
        },
      };

      setCaptureModeState(false);
      setSelection(null);
      pendingVisualActionRef.current = null;
      dismissOfferToast();
      onCaptureModeChangeRef.current?.(false);
      onIntentRef.current?.(intent);
    },
    [selection, sourceObjectId, sectionId, pageNumber, dismissOfferToast],
  );

  const runConfirmedVisual = useCallback(
    async (action: TutorCaptureAction, region: NormalizedPageRegion) => {
      const render = renderRegionImageRef.current;
      if (!render) {
        toast('Visual capture is not available for this PDF viewer.');
        return;
      }
      try {
        const rendered = await render(region);
        if (!rendered.ok) {
          toast(
            rendered.code === 'too_large'
              ? 'The selected area image is too large. Try a smaller selection.'
              : 'Could not render the selected PDF area. Try again.',
          );
          return;
        }
        const imageBase64 = rendered.dataUrl.replace(/^data:image\/(?:jpeg|png);base64,/i, '');
        emitIntent(action, PDF_VISUAL_SELECTION_MARKER, 'visual_selection', {
          mime: rendered.mime,
          imageBase64,
          widthPx: rendered.widthPx,
          heightPx: rendered.heightPx,
        });
      } catch {
        toast('Could not render the selected PDF area. Try again.');
      }
    },
    [emitIntent],
  );

  const offerVisualForSelection = useCallback(
    (action: TutorCaptureAction, region: NormalizedPageRegion) => {
      pendingVisualActionRef.current = action;
      offerToastIdRef.current = showVisualOfferToast({
        onUse: () => {
          void runConfirmedVisual(action, region);
        },
        onDismiss: () => {
          pendingVisualActionRef.current = null;
          offerToastIdRef.current = null;
        },
      });
    },
    [runConfirmedVisual],
  );

  const confirmPendingRecovery = useCallback(() => {
    if (!pendingFullPage || pendingFullPage.attachmentType !== 'recovered_page') return;
    emitIntent(pendingFullPage.action, pendingFullPage.text, 'recovered_page');
  }, [pendingFullPage, emitIntent]);

  const confirmPendingNativePage = useCallback(() => {
    if (!pendingFullPage || pendingFullPage.attachmentType !== 'native_page') return;
    emitIntent(pendingFullPage.action, pendingFullPage.text, 'native_page');
  }, [pendingFullPage, emitIntent]);

  const chooseAction = useCallback(
    async (action: TutorCaptureAction, options?: { forceVisual?: boolean }) => {
      if (!enabled || !selection) return;
      try {
        if (isInvalidCaptureRegionGeometry(selection)) {
          const diag = coarseRegionDiagnostics(selection, undefined, 'unknown');
          recordCaptureRegionDiagnostics(diag);
          logCaptureRegionDiagnosticsIfEnabled(captureDiagEnabledNow(), diag);
          toast('Could not extract text from this PDF region. Try selecting again.');
          return;
        }

        if (options?.forceVisual) {
          offerVisualForSelection(action, selection);
          return;
        }

        const text = await extractTextRef.current?.(selection);
        const regionUseful = isUsefulTutorExtractedText(text, selection);

        if (regionUseful) {
          const assessed =
            (await assessRegionRef.current?.(selection)) ??
            coarseRegionDiagnostics(selection, text, 'unknown');
          recordCaptureRegionDiagnostics(assessed);
          logCaptureRegionDiagnosticsIfEnabled(captureDiagEnabledNow(), assessed);
          emitIntent(action, text!.trim(), 'text_selection');
          return;
        }

        const probe = await probePageTextLayerRef.current?.(pageNumber);
        const pageTextKind: PdfPageTextAssessmentKind | 'unknown' = probe?.kind ?? 'unknown';

        let regionDiag =
          (await assessRegionRef.current?.(selection)) ??
          coarseRegionDiagnostics(selection, text, pageTextKind);
        regionDiag = withPageProbe(regionDiag, pageTextKind);
        recordCaptureRegionDiagnostics(regionDiag);
        logCaptureRegionDiagnosticsIfEnabled(captureDiagEnabledNow(), regionDiag);

        const nativeEligible = assessNativePageFallbackEligibility({
          regionTextUseful: false,
          pageKind: pageTextKind,
          pageText: probe?.pageText,
        });

        if (nativeEligible.eligible && nativeEligible.pageText) {
          // Match Gateway MAX_PDF_CAPTURE_CHARS — same cap as recovered OCR path.
          const raw = nativeEligible.pageText;
          const truncated = raw.length > RECOVERED_PAGE_TEXT_MAX_CHARS;
          const pageText = truncated
            ? raw.slice(0, RECOVERED_PAGE_TEXT_MAX_CHARS).trimEnd()
            : raw;
          const pending: PendingFullPage = {
            action,
            text: pageText,
            truncated,
            attachmentType: 'native_page',
          };
          setPendingFullPage(pending);
          offerToastIdRef.current = showNativePageOfferToast({
            onUse: () => {
              emitIntent(action, pageText, 'native_page');
            },
            onVisual: () => {
              setPendingFullPage(null);
              offerVisualForSelection(action, selection);
            },
            onDismiss: () => {
              setPendingFullPage(null);
              offerToastIdRef.current = null;
            },
          });
          return;
        }

        const recovery = await fetchRecoveredPdfPageText({
          sectionId,
          sourceObjectId,
          pageNumber,
        });

        if (recovery.ok) {
          const pending: PendingFullPage = {
            action,
            text: recovery.text,
            truncated: recovery.truncated,
            attachmentType: 'recovered_page',
          };
          setPendingFullPage(pending);
          offerToastIdRef.current = showRecoveryOfferToast({
            truncated: recovery.truncated,
            onUse: () => {
              emitIntent(action, recovery.text, 'recovered_page');
            },
            onVisual: () => {
              setPendingFullPage(null);
              offerVisualForSelection(action, selection);
            },
            onDismiss: () => {
              setPendingFullPage(null);
              offerToastIdRef.current = null;
            },
          });
          return;
        }

        offerVisualForSelection(action, selection);
      } catch {
        toast('Could not extract text from this PDF region. Try selecting again.');
      }
    },
    [enabled, selection, sourceObjectId, sectionId, pageNumber, emitIntent, offerVisualForSelection],
  );

  return {
    captureMode,
    selection,
    /** @deprecated Prefer pendingFullPage — kept for recovery-bridge tests. */
    pendingRecovery:
      pendingFullPage?.attachmentType === 'recovered_page'
        ? {
            action: pendingFullPage.action,
            text: pendingFullPage.text,
            truncated: pendingFullPage.truncated,
          }
        : null,
    pendingFullPage,
    setCaptureMode,
    cancel,
    clearSelection,
    commitSelection,
    chooseAction,
    confirmPendingRecovery,
    confirmPendingNativePage,
    dismissPendingRecovery: dismissOfferToast,
  };
}
