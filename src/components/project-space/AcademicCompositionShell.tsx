import type { TutorCaptureIntent, TutorCaptureChrome } from "../../lib/ai/tutor/tutorCaptureTypes";
import { readTutorLayout, resolveTutorSurface } from "../../lib/ai/tutor/tutorLayoutStorage";
import {
  deriveWorkspaceFromTutorLayout,
  fitPaneWidths,
  resizeAdjacent,
  movePane,
  readAcademicWorkspace,
  writeAcademicWorkspace,
  WORKSPACE_DEFAULT_ORDER,
  type WorkspacePaneId,
} from "../../lib/studySession/academicWorkspaceLayout";
import { ContextualTutorCard, type TutorDockCollapseCue, type TutorDockResizeApi } from "./ContextualTutorCard";
import { AcademicWorkspaceGrid } from "./AcademicWorkspaceGrid";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, FileText, Sparkles, ArrowLeft, MessageSquare } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { acquireBodyScrollLock, pushEscapeHandler } from '../../lib/ui/overlayStack';
import { Z_STUDY_SESSION_BACKDROP, Z_STUDY_SESSION_SHELL } from '../../lib/ui/zIndexLayers';

import type { DerivedQuestionSection } from '../../lib/academicComposition/questionSections';

interface Props {
  tokens: AtmosphereTokens;
  pdfTitle: string;
  notebookTitle: string;
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  onSplitRatioCommit?: (ratio: number) => void;
  onClose: () => void;
  pdfSurface: React.ReactNode;
  notebookSurface: React.ReactNode;
  contextualTutorOpen?: boolean;
  onCloseContextualTutor?: () => void;
  onPromoteContextualTutorToAsk?: () => void;
  secondarySurface?: 'notebook' | 'ask';
  onRestoreNotebook?: () => void;
  questions?: DerivedQuestionSection[];
  activeQuestionNumber?: number | null;
  onSelectQuestion?: (questionNumber: number) => void;
  topOffset?: number;
  sectionId?: string;
  sourceObjectId?: string | null;
  /** Visible page of the composition PDF. Not a capture. */
  visiblePage?: number | null;
  userId?: string | null;
  tutorIntent?: TutorCaptureIntent | null;
  /** Explicit Tutor presence. A capture intent alone does not mount the card. */
  tutorOpen?: boolean;
  onOpenTutor?: () => void;
  onCloseTutor?: () => void;
  onNavigateToSource?: (pageNumber: number) => void;
  tutorChrome?: TutorCaptureChrome | null;
}

const NARROW_BREAKPOINT_PX = 960;

export function AcademicCompositionShell({
  tokens,
  pdfTitle,
  notebookTitle,
  splitRatio,
  onSplitRatioChange,
  onSplitRatioCommit,
  onClose,
  pdfSurface,
  notebookSurface,
  contextualTutorOpen = false,
  onCloseContextualTutor,
  onPromoteContextualTutorToAsk: _onPromoteContextualTutorToAsk,
  secondarySurface = 'notebook',
  onRestoreNotebook,
  questions = [],
  activeQuestionNumber = null,
  onSelectQuestion,
  topOffset,
  sectionId,
  sourceObjectId,
  visiblePage = null,
  userId,
  tutorIntent,
  tutorOpen = false,
  onOpenTutor,
  onCloseTutor,
  onNavigateToSource,
  tutorChrome,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );

  // B2: Dynamically calculate course navigation (FloatingWorkspaceShell) height
  // to stack Course nav -> Compact Composition header -> TwoSurfaceLayout without overlap
  const [courseNavHeight, setCourseNavHeight] = useState<number>(() => {
    if (topOffset !== undefined) return topOffset;
    if (typeof document !== 'undefined') {
      const banner = document.querySelector('div[role="banner"][aria-label="Workspace controls"]');
      if (banner) {
        const rect = banner.getBoundingClientRect();
        return rect.bottom > 0 ? Math.round(rect.bottom) : 0;
      }
    }
    return 0;
  });

  useEffect(() => {
    if (topOffset !== undefined) {
      setCourseNavHeight(topOffset);
      return;
    }

    const measureNav = () => {
      if (typeof document === 'undefined') return;
      const banner = document.querySelector('div[role="banner"][aria-label="Workspace controls"]');
      if (banner) {
        const rect = banner.getBoundingClientRect();
        setCourseNavHeight(rect.bottom > 0 ? Math.round(rect.bottom) : 0);
      } else {
        setCourseNavHeight(0);
      }
    };

    measureNav();
    window.addEventListener('resize', measureNav);

    let ro: ResizeObserver | null = null;
    const banner = document.querySelector('div[role="banner"][aria-label="Workspace controls"]');
    if (banner && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measureNav());
      ro.observe(banner);
    }

    return () => {
      window.removeEventListener('resize', measureNav);
      ro?.disconnect();
    };
  }, [topOffset]);
  const isNarrow = containerWidth < NARROW_BREAKPOINT_PX;
  const tutorMounted = Boolean(sectionId && sourceObjectId);
  const [tutorFocusToken, setTutorFocusToken] = useState(0);
  const [tutorLayoutTick, setTutorLayoutTick] = useState(0);
  const noteTutorLayout = useCallback(() => {
    setTutorLayoutTick(tick => tick + 1);
  }, []);
  const tutorFrame = useMemo(
    () =>
      resolveTutorSurface(
        userId && sectionId ? readTutorLayout(userId, sectionId) : null,
        containerWidth,
      ),
    [userId, sectionId, containerWidth, tutorLayoutTick],
  );
  const tutorVisual = tutorFrame.visual;
  const sideDockOpen = tutorVisual === 'side-left' || tutorVisual === 'side-right';
  const [workspaceTick, setWorkspaceTick] = useState(0);
  const [liveWidths, setLiveWidths] = useState<Record<WorkspacePaneId, number> | null>(null);
  const tutorLayout = useMemo(
    () => (userId && sectionId ? readTutorLayout(userId, sectionId) : null),
    [userId, sectionId, tutorLayoutTick],
  );
  const storedWorkspace = useMemo(
    () => (userId && sectionId ? readAcademicWorkspace(userId, sectionId) : null),
    [userId, sectionId, workspaceTick],
  );
  const derivedWorkspace = useMemo(() => deriveWorkspaceFromTutorLayout(tutorLayout), [tutorLayout]);
  const workspace = storedWorkspace ?? derivedWorkspace;
  useEffect(() => {
    if (!userId || !sectionId || storedWorkspace || !derivedWorkspace) return;
    if (tutorLayout?.placement !== 'side-left' && tutorLayout?.placement !== 'side-right') return;
    writeAcademicWorkspace(userId, sectionId, derivedWorkspace);
    setWorkspaceTick(tick => tick + 1);
  }, [userId, sectionId, storedWorkspace, derivedWorkspace, tutorLayout?.placement]);
  const columnOrder = workspace?.order ?? WORKSPACE_DEFAULT_ORDER;
  const fittedWidths = useMemo(
    () => (sideDockOpen ? fitPaneWidths(columnOrder, workspace?.sizes, containerWidth) : null),
    [sideDockOpen, columnOrder, workspace?.sizes, containerWidth],
  );
  const columnWidths = liveWidths ?? fittedWidths;
  const widthsRef = useRef(columnWidths);
  widthsRef.current = columnWidths;
  const commitWorkspace = useCallback((order: readonly WorkspacePaneId[], sizes: Record<WorkspacePaneId, number>) => {
    widthsRef.current = sizes;
    if (userId && sectionId) writeAcademicWorkspace(userId, sectionId, { order: [...order], sizes });
    setLiveWidths(null);
    setWorkspaceTick(tick => tick + 1);
  }, [userId, sectionId]);
  const resizeWorkspaceBy = useCallback((separatorIndex: number, deltaPx: number) => {
    const current = widthsRef.current;
    if (!current) return;
    commitWorkspace(columnOrder, resizeAdjacent(columnOrder, current, separatorIndex, deltaPx));
  }, [columnOrder, commitWorkspace]);
  const moveWorkspacePane = useCallback((pane: WorkspacePaneId, direction: -1 | 1) => {
    if (!columnWidths) return;
    commitWorkspace(movePane(columnOrder, pane, direction), columnWidths);
  }, [columnOrder, columnWidths, commitWorkspace]);
  const tutorOpenRef = useRef(tutorOpen);
  const dockResizeRef = useRef<TutorDockResizeApi | null>(null);
  const acceptDockResize = useCallback((api: TutorDockResizeApi | null) => {
    dockResizeRef.current = api;
  }, []);
  const [quickAskReveal, setQuickAskReveal] = useState(false);
  const acceptQuickAskReveal = useCallback((open: boolean) => {
    setQuickAskReveal(open);
  }, []);
  const [dockCollapseCue, setDockCollapseCue] = useState<TutorDockCollapseCue | null>(null);
  const acceptDockCollapseCue = useCallback((cue: TutorDockCollapseCue | null) => {
    setDockCollapseCue(prev => {
      if (cue === null) return prev === null ? prev : null;
      if (prev && prev.atMinimum === cue.atMinimum && prev.armed === cue.armed) return prev;
      return cue;
    });
  }, []);
  useEffect(() => {
    const previous = tutorOpenRef.current;
    tutorOpenRef.current = tutorOpen;
    if (tutorOpen && !previous) setTutorFocusToken(token => token + 1);
  }, [tutorOpen]);
  const tutorConversationOpen =
    tutorVisual === 'expanded' ||
    tutorVisual === 'floating' ||
    sideDockOpen;

  // Measure real composition container width using ResizeObserver where available,
  // falling back to window resize events
  useEffect(() => {
    const el = containerRef.current;
    const syncWindow = () => {
      if (typeof window !== 'undefined') {
        setContainerWidth(window.innerWidth);
      }
    };
    window.addEventListener('resize', syncWindow);

    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (width > 0) {
            setContainerWidth(width);
          }
        }
      });
      ro.observe(el);
      return () => {
        window.removeEventListener('resize', syncWindow);
        ro.disconnect();
      };
    }

    return () => {
      window.removeEventListener('resize', syncWindow);
    };
  }, []);

  // Narrow presentation state: 'primary' (surface A - PDF) or 'secondary' (surface B - Notebook or Ask)
  const [narrowActiveSurface, setNarrowActiveSurface] = useState<'primary' | 'secondary'>(() =>
    secondarySurface === 'ask' ? 'secondary' : 'primary',
  );
  const prevSecondarySurfaceRef = React.useRef(secondarySurface);

  // Coherent transition: when secondarySurface promotes to 'ask', make Ask the active surface immediately
  // When restoring to 'notebook', make Notebook the active surface immediately
  useEffect(() => {
    if (prevSecondarySurfaceRef.current !== secondarySurface) {
      prevSecondarySurfaceRef.current = secondarySurface;
      setNarrowActiveSurface('secondary');
    }
  }, [secondarySurface]);

  useEffect(() => {
    return acquireBodyScrollLock();
  }, []);

  useEffect(() => {
    return pushEscapeHandler(() => {
      if (contextualTutorOpen && onCloseContextualTutor) {
        onCloseContextualTutor();
        return true;
      }
      onClose();
    });
  }, [onClose, contextualTutorOpen, onCloseContextualTutor]);

  if (typeof document === 'undefined') return null;

  const secondaryLabel = secondarySurface === 'ask' ? 'Ask' : 'Notebook';

  return createPortal(
    <>
      <div
        aria-hidden
        data-testid="academic-composition-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: Z_STUDY_SESSION_BACKDROP,
          background: 'rgba(8, 10, 14, 0.38)',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={containerRef}
        role="region"
        aria-label="Academic workspace composition"
        data-testid="academic-composition-shell"
        style={{
          position: 'fixed',
          top: courseNavHeight,
          left: 0,
          width: '100vw',
          height: courseNavHeight > 0 ? `calc(100dvh - ${courseNavHeight}px)` : '100dvh',
          zIndex: Z_STUDY_SESSION_SHELL,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overscrollBehavior: 'contain',
          overflow: 'hidden',
          background: tokens.pageBg,
          boxShadow: '0 -4px 40px rgba(0,0,0,0.2)',
        }}
      >
        <header
          data-testid="academic-composition-header"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 16px',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.wellBg,
          }}
        >
          {isNarrow ? (
            /* Narrow explicit surface switcher (>=44px touch target) */
            <div
              role="tablist"
              aria-label="Active academic surface"
              data-testid="academic-composition-surface-switcher"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: tokens.cardBg,
                padding: 3,
                borderRadius: 10,
                border: `1px solid ${tokens.cardBorder}`,
                gap: 2,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={narrowActiveSurface === 'primary'}
                data-testid="academic-switcher-pdf-tab"
                onClick={() => setNarrowActiveSurface('primary')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 44,
                  minWidth: 90,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    narrowActiveSurface === 'primary' ? `${tokens.accent}20` : 'transparent',
                  color:
                    narrowActiveSurface === 'primary' ? tokens.accent : tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'manipulation',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={narrowActiveSurface === 'secondary'}
                data-testid="academic-switcher-secondary-tab"
                onClick={() => setNarrowActiveSurface('secondary')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 44,
                  minWidth: 100,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    narrowActiveSurface === 'secondary' ? `${tokens.accent}20` : 'transparent',
                  color:
                    narrowActiveSurface === 'secondary' ? tokens.accent : tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'manipulation',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                {secondarySurface === 'ask' ? (
                  <Sparkles className="w-4 h-4 shrink-0" />
                ) : (
                  <BookOpen className="w-4 h-4 shrink-0" />
                )}
                <span>{secondaryLabel}</span>
              </button>
            </div>
          ) : (
            /* Wide screen header title */
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <FileText className="w-4 h-4 shrink-0" style={{ color: tokens.accent }} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: tokens.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 240,
                  }}
                >
                  {pdfTitle || 'PDF Document'}
                </span>
              </div>
              <span style={{ color: tokens.textMuted, fontSize: 12 }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {secondarySurface === 'ask' ? (
                  <Sparkles className="w-4 h-4 shrink-0" style={{ color: tokens.accent }} />
                ) : (
                  <BookOpen className="w-4 h-4 shrink-0" style={{ color: tokens.accent }} />
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: tokens.textPrimary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 240,
                  }}
                >
                  {secondarySurface === 'ask' ? 'Ask ZIKUK' : (notebookTitle || 'Notebook')}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              data-testid="academic-composition-open-tutor"
              aria-label={tutorConversationOpen ? 'Tutor is open' : 'Open Tutor'}
              aria-expanded={tutorConversationOpen}
              onClick={() => {
                setTutorFocusToken(token => token + 1);
                onOpenTutor?.();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: isNarrow ? 44 : undefined,
                minWidth: isNarrow ? 44 : undefined,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${tutorConversationOpen ? `${tokens.accent}66` : tokens.cardBorder}`,
                background: tutorConversationOpen ? `${tokens.accent}22` : tokens.cardBg,
                color: tutorConversationOpen ? tokens.accent : tokens.textPrimary,
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'manipulation',
              }}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Tutor</span>
            </button>
            {tutorChrome && (
              <button
                type="button"
                data-testid="academic-composition-capture-toggle"
                onClick={() => tutorChrome.setCaptureMode(!tutorChrome.captureMode)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: isNarrow ? 44 : undefined,
                  minWidth: isNarrow ? 44 : undefined,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${tokens.accent}66`,
                  background: tutorChrome.captureMode ? `${tokens.accent}30` : `${tokens.accent}18`,
                  color: tokens.accent,
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'manipulation',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{tutorChrome.captureMode ? 'Cancel Capture' : 'Capture for ZIKUK'}</span>
              </button>
            )}
            {secondarySurface === 'ask' && onRestoreNotebook ? (
              <button
                type="button"
                data-testid="academic-composition-restore-notebook-btn"
                onClick={onRestoreNotebook}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minHeight: isNarrow ? 44 : undefined,
                  minWidth: isNarrow ? 44 : undefined,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: `1px solid ${tokens.accent}55`,
                  background: `${tokens.accent}14`,
                  color: tokens.accent,
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'manipulation',
                  transition: 'all 0.15s ease',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Restore Notebook</span>
              </button>
            ) : null}

            <button
              type="button"
              data-testid="academic-composition-close-btn"
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: isNarrow ? 44 : undefined,
                minWidth: isNarrow ? 44 : undefined,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${tokens.cardBorder}`,
                background: tokens.cardBg,
                color: tokens.textPrimary,
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'manipulation',
              }}
            >
              <X className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          </div>
        </header>

        <AcademicWorkspaceGrid
            frame={tutorMounted ? (quickAskReveal && tutorVisual === 'compact' ? 'expanded' : tutorVisual) : 'hidden'}
            dockResizeRef={dockResizeRef}
            tokens={tokens}
            columnMode={sideDockOpen}
            floating={tutorVisual === 'floating'}
            narrow={isNarrow}
            narrowPdfActive={narrowActiveSurface === 'primary'}
            order={columnOrder}
            widths={columnWidths}
            containerWidth={containerWidth}
            splitRatio={splitRatio}
            onSplitRatioChange={onSplitRatioChange}
            onSplitRatioCommit={onSplitRatioCommit}
            onPreviewWidths={setLiveWidths}
            onCommitWidths={sizes => commitWorkspace(columnOrder, sizes)}
            onResizeBy={resizeWorkspaceBy}
            onMove={moveWorkspacePane}
            collapseCue={dockCollapseCue}
            pdfSurface={pdfSurface}
            notebookSurface={notebookSurface}
            tutor={tutorMounted ? (
              <ContextualTutorCard
                tokens={tokens}
                sectionId={sectionId!}
                sourceObjectId={sourceObjectId}
                visiblePage={visiblePage}
                pdfTitle={pdfTitle}
                userId={userId}
                intent={tutorIntent ?? null}
                onClose={onCloseTutor ?? (() => {})}
                onNavigateToSource={onNavigateToSource}
                embedded
                isNarrow={isNarrow}
                containerWidth={containerWidth}
                focusToken={tutorFocusToken}
                onVisualChange={noteTutorLayout}
                columnLayout={sideDockOpen}
                columnWidth={columnWidths?.tutor ?? null}
                onDockResizeReady={acceptDockResize}
                onDockCollapseCue={acceptDockCollapseCue}
                onQuickAskReveal={acceptQuickAskReveal}
              />
            ) : null}
            questions={questions}
            activeQuestionNumber={activeQuestionNumber}
            onSelectQuestion={onSelectQuestion}
            showQuestionNav={secondarySurface === 'notebook' && questions.length >= 2}
            paneLabel={{
              pdf: 'PDF',
              notebook: secondarySurface === 'ask' ? 'Ask ZIKUK' : 'Notebook',
              tutor: 'Tutor',
            }}
          />
      </div>
    </>,
    document.body,
  );
}
