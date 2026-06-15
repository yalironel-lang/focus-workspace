import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { ensureProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';
import { HandwritingBlock } from '../notebook/HandwritingBlock';
import { FreeSpacePdfCard } from './FreeSpacePdfCard';
import { RV_INK_BLOCK_KEY } from '../../lib/rvStudySurface';
import { hydrateHandwritingBlocks } from '../../lib/notebookHandwritingStore';
import { PAGE_INK_INITIAL_HEIGHT } from '../../lib/handwritingTypes';
import type { PdfStudyMarksChrome } from '../../lib/pdfStudyMarks/usePdfStudyMarks';
import { acquireBodyScrollLock, pushEscapeHandler } from '../../lib/ui/overlayStack';
import { Z_RV_STUDY_BACKDROP, Z_RV_STUDY_SHELL } from '../../lib/ui/zIndexLayers';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

const SOURCE_FLEX = '0 0 44%';
const WORK_FLEX = '1 1 56%';

const RV_GRID_BG = {
  backgroundColor: 'rgba(255,251,245,0.98)',
  backgroundImage: `
    linear-gradient(rgba(28,25,23,0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28,25,23,0.07) 1px, transparent 1px)
  `,
  backgroundSize: '24px 24px',
} as const;

interface Props {
  tokens: AtmosphereTokens;
  sectionId: string;
  pdfObjectId: string;
  pdfContent: ProjectObjectContent;
  pdfTitle: string;
  onPdfContentChange: (content: ProjectObjectContent) => void;
  onClose: () => void;
  /** Notebook object for per-page ink (defaults to pdfObjectId + rv-ink). */
  inkObjectId?: string;
  inkBlockKey?: string;
  headerTitle?: string;
}

/** Minimal fullscreen PDF + ink split for 30-minute iPad validation. */
export function RvStudySurface({
  tokens,
  sectionId,
  pdfObjectId,
  pdfContent,
  pdfTitle,
  onPdfContentChange,
  onClose,
  inkObjectId,
  inkBlockKey,
  headerTitle,
}: Props) {
  const resolvedInkObjectId = inkObjectId ?? pdfObjectId;
  const resolvedInkBlockKey = inkBlockKey ?? RV_INK_BLOCK_KEY;
  const surfaceTitle = headerTitle ?? 'RV Study Surface';
  const suppressMarksChrome = useCallback((_chrome: PdfStudyMarksChrome | null) => {}, []);
  const content = ensureProjectObjectContent('pdf', pdfContent);
  if (content.type !== 'pdf') return null;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    void hydrateHandwritingBlocks(resolvedInkObjectId, [resolvedInkBlockKey]);
  }, [resolvedInkObjectId, resolvedInkBlockKey]);

  useEffect(() => pushEscapeHandler(handleClose), [handleClose]);
  useEffect(() => acquireBodyScrollLock(), []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: Z_RV_STUDY_BACKDROP,
          background: 'rgba(6, 8, 12, 0.55)',
          pointerEvents: 'auto',
        }}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="RV Study Surface"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: Z_RV_STUDY_SHELL,
          display: 'flex',
          flexDirection: 'column',
          background: tokens.pageBg,
          boxSizing: 'border-box',
          pointerEvents: 'auto',
        }}
      >
        <header
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            paddingRight: 'max(12px, env(safe-area-inset-right))',
            paddingBottom: 8,
            paddingLeft: 'max(12px, env(safe-area-inset-left))',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 13,
              fontWeight: 600,
              color: tokens.textPrimary,
            }}
          >
            {surfaceTitle}
          </div>
          <button
            type="button"
            title="Done"
            aria-label="Done"
            onClick={handleClose}
            style={{
              minWidth: TOUCH_TARGET_MIN_PX,
              minHeight: TOUCH_TARGET_MIN_PX,
              padding: '0 14px',
              border: `1px solid ${tokens.cardBorder}`,
              background: `${tokens.accent}18`,
              color: tokens.accent,
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.02em',
              touchAction: 'manipulation',
            }}
          >
            Done
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: SOURCE_FLEX,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRight: `1px solid ${tokens.cardBorder}`,
              overflow: 'hidden',
            }}
          >
            <FreeSpacePdfCard
              objectId={pdfObjectId}
              content={content}
              tokens={tokens}
              sectionId={sectionId}
              onChange={onPdfContentChange}
              pdfTitle={pdfTitle}
              presentation="rv-study"
              suppressExternalTabLink
              onStudyMarksChromeChange={suppressMarksChrome}
            />
          </div>

          <div
            style={{
              flex: WORK_FLEX,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              ...RV_GRID_BG,
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                padding: '8px 10px 16px',
              }}
            >
              <HandwritingBlock
                blockId={`__rv-ink-${resolvedInkBlockKey}__`}
                objectId={resolvedInkObjectId}
                blockKey={resolvedInkBlockKey}
                tokens={tokens}
                pageLayout
                surfaceChrome={{
                  margin: 0,
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  flexShrink: 0,
                }}
              />
              <div style={{ height: PAGE_INK_INITIAL_HEIGHT, flexShrink: 0 }} aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
