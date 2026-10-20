import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Sparkles,
  X,
  ArrowUp,
  RotateCcw,
  FileText,
  Minus,
  Maximize2,
  Trash2,
  ChevronDown,
  ChevronUp,
  PanelLeft,
  PanelRight,
  Check,
  Plus,
  History,
  Link2,
  Unlink,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { pushEscapeHandler } from '../../lib/ui/overlayStack';
import {
  type TutorCaptureIntent,
  type TeachingMode,
  TEACHING_MODE_OPTIONS,
  legacyActionToTeachingMode,
  teachingModeToLegacyAction,
} from '../../lib/ai/tutor/tutorCaptureTypes';
import {
  buildTutorQuestionText,
  getDefaultModeQuestionText,
  isDefaultQuestionText,
} from '../../lib/ai/tutor/tutorPromptBuilder';
import { useStandaloneTutor } from '../../lib/ai/tutor/useStandaloneTutor';
import { readTutorSession, writeTutorPresentation } from '../../lib/ai/tutor/tutorSessionStorage';
import {
  TUTOR_FLOAT_MIN_HEIGHT,
  TUTOR_FLOAT_MIN_WIDTH,
  TUTOR_SIDE_DOCK_DEFAULT,
  TUTOR_SIDE_DOCK_RENDER_MIN,
  TUTOR_SIDE_DOCK_WIDTH_MAX,
  TUTOR_TOP_DOCK_COLLAPSE_PAST_PX,
  TUTOR_TOP_DOCK_EXPANDED_DEFAULT,
  TUTOR_TOP_DOCK_COMPACT_HEIGHT,
  TUTOR_TOP_DOCK_COMPACT_HEIGHT_NARROW,
  TUTOR_TOP_DOCK_EXPANDED_MIN,
  currentTutorViewport,
  legacyFloatingFromPresentation,
  minimizeTutorLayout,
  readTutorLayout,
  resetTutorLayout,
  resolveTopDockExpandedHeight,
  resolveTutorFloatingGeometry,
  restoreTutorLayout,
  sideDockFits,
  sideDockRenderWidth,
  tutorDockVisual,
  writeTutorLayout,
  type TutorLayoutPatch,
  type TutorSurfaceVisual,
} from '../../lib/ai/tutor/tutorLayoutStorage';
import { AskZikukAnswer } from '../ai/AskZikukAnswer';
import { KnowledgeProvenanceBadge } from '../ai/KnowledgeProvenanceBadge';
import { presentAnswerTextForProvenance } from '../../lib/ai/askCourse/presentProvenance';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import { getModeTheme, TeachingModeBadge } from '../ai/TeachingModeUi';

export interface ContextualTutorCardProps {
  tokens: AtmosphereTokens;
  sectionId: string;
  sourceObjectId?: string | null;
  /** Visible page of the open PDF. Omitted from conversation storage. */
  visiblePage?: number | null;
  /** Open PDF file name. This is not a claim that the file is loaded into the model. */
  pdfTitle?: string | null;
  userId?: string | null;
  /** Null opens Tutor with no PDF selection. A stored selection still hydrates from the session. */
  intent: TutorCaptureIntent | null;
  onClose: () => void;
  onNavigateToSource?: (pageNumber: number) => void;
  /** In Academic Composition, one card switches between dock and floating chrome. */
  embedded?: boolean;
  isNarrow?: boolean;
  /** Composition width. Side dock draws only when the study panes still fit. */
  containerWidth?: number;
  /** Increment to expand the dock and focus the composer. Does not send. */
  focusToken?: number;
  onVisualChange?: (visual: TutorSurfaceVisual) => void;
  /** Lets the composition boundary resize the expanded top dock from outside the card. */
  onDockResizeReady?: (api: TutorDockResizeApi | null) => void;
  /** Expanded dock at its minimum, or a drag that has passed the collapse threshold. */
  onDockCollapseCue?: (cue: TutorDockCollapseCue | null) => void;
  /** Temporary moderate reveal after Quick Ask. This does not rewrite the saved dock height. */
  onQuickAskReveal?: (open: boolean) => void;
  /** The composition pane row owns Tutor width. The card does not draw its own separator. */
  columnLayout?: boolean;
  columnWidth?: number | null;
}

export type TutorDockCollapseCue = { atMinimum: boolean; armed: boolean };

export type TutorDockResizeApi = {
  begin: (clientY: number) => void;
  move: (clientY: number) => void;
  end: () => void;
  nudge: (delta: number) => void;
  collapse: () => void;
};

const MIN_WIDTH = TUTOR_FLOAT_MIN_WIDTH;
const MIN_HEIGHT = TUTOR_FLOAT_MIN_HEIGHT;

function TutorPdfContext({
  compact = false,
  pdfTitle,
  visiblePage,
  selection,
}: {
  compact?: boolean;
  pdfTitle?: string | null;
  visiblePage?: number | null;
  selection: 'none' | 'attached' | 'detached';
}) {
  const title = pdfTitle?.trim() ?? '';
  const page = typeof visiblePage === 'number' && visiblePage > 0 ? visiblePage : null;
  let primary = 'No open PDF';
  if (title && page) primary = `${title} · p. ${page}`;
  else if (title) primary = title;
  else if (page) primary = `Open PDF · p. ${page}`;
  const hasPdf = primary !== 'No open PDF';
  const selectionLine =
    selection === 'attached' ? 'Selection attached.' : selection === 'detached' ? 'Selection detached.' : '';
  const detail = [selectionLine, hasPdf ? 'Relevant pages only, not the whole file.' : ''].filter(Boolean).join(' ');
  return (
    <div
      data-testid="tutor-pdf-context"
      data-selection={selection}
      data-page={page ?? ''}
      className={
        compact
          ? 'text-[11px] text-slate-300 truncate min-w-0 flex-1'
          : 'px-4 py-2 border-b text-xs shrink-0 text-slate-300'
      }
      style={compact ? undefined : { borderColor: 'rgba(255, 255, 255, 0.08)' }}
      title={detail ? `${primary}. ${detail}` : primary}
    >
      <span className={compact ? undefined : 'block truncate'}>{primary}</span>
      {!compact && detail ? (
        <span className="block truncate text-[10px] text-slate-500">{detail}</span>
      ) : null}
    </div>
  );
}

function TutorContextRow({
  pdfTitle,
  visiblePage,
  attachment,
  attached,
  onToggleAttached,
}: {
  pdfTitle?: string | null;
  visiblePage?: number | null;
  attachment: { pageNumber: number; extractedText: string } | null;
  attached: boolean;
  onToggleAttached: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [inspectDetached, setInspectDetached] = useState(false);
  const title = pdfTitle?.trim() ?? '';
  const page = typeof visiblePage === 'number' && visiblePage > 0 ? visiblePage : null;
  let primary = 'No open PDF';
  if (title && page) primary = `${title} · Page ${page}`;
  else if (title) primary = title;
  else if (page) primary = `Open PDF · Page ${page}`;
  const hasPdf = primary !== 'No open PDF';
  const selection = !attachment ? 'none' : attached ? 'attached' : 'detached';
  return (
    <div
      data-testid="tutor-pdf-context"
      data-selection={selection}
      data-page={page ?? ''}
      data-context-open={open ? '1' : '0'}
      className="shrink-0 border-b text-xs"
      style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
    >
      <div className="flex items-center gap-2 px-3" style={{ minHeight: 28, maxHeight: 32 }}>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{primary}</span>
        {selection === 'attached' ? (
          <span data-testid="tutor-context-attached" className="shrink-0 text-[10px] font-semibold text-indigo-200">
            Selection attached
          </span>
        ) : null}
        <button
          type="button"
          data-testid="tutor-context-toggle"
          aria-expanded={open}
          aria-label={open ? 'Hide tutor context' : 'Show tutor context'}
          onClick={() => setOpen(value => !value)}
          className="shrink-0 rounded-md px-2 text-[10px] font-semibold text-slate-300 hover:bg-white/10"
          style={{ minHeight: 24 }}
        >
          Context
        </button>
      </div>
      {open ? (
        <div data-testid="tutor-context-details" className="space-y-1 px-3 pb-2 text-[11px] text-slate-300">
          <div>Active PDF: {title || 'No open PDF'}</div>
          <div>Visible page: {page ? `Page ${page}` : 'No visible page'}</div>
          {hasPdf ? <div>Relevant pages only, not the whole file.</div> : null}
          {attachment && attached ? (
            <>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                Attached selection · p. {attachment.pageNumber}
              </div>
              <div
                data-testid="tutor-extracted-text-preview"
                data-attachment-state="attached"
                className="line-clamp-3 border-l-2 border-indigo-400/60 pl-2 italic text-slate-200"
              >
                "{attachment.extractedText}"
              </div>
              <button
                type="button"
                data-testid="tutor-attachment-toggle"
                data-attached="true"
                title="Stop sending this selection with new questions"
                onClick={onToggleAttached}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10"
              >
                <Unlink className="w-3 h-3" />
                <span>Detach</span>
              </button>
            </>
          ) : null}
          {attachment && !attached ? (
            <>
              <span data-testid="tutor-attachment-detached-note" className="text-[10px] text-slate-500">
                Detached. New questions will not use this selection. The conversation stays.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="tutor-attachment-toggle"
                  data-attached="false"
                  title="Send this selection with new questions again"
                  onClick={onToggleAttached}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10"
                >
                  <Link2 className="w-3 h-3" />
                  <span>Re-attach</span>
                </button>
                <button
                  type="button"
                  data-testid="tutor-detached-inspect"
                  aria-expanded={inspectDetached}
                  onClick={() => setInspectDetached(value => !value)}
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-white/10"
                >
                  {inspectDetached ? 'Hide selection' : 'Inspect selection'}
                </button>
              </div>
              {inspectDetached ? (
                <div
                  data-testid="tutor-extracted-text-preview"
                  data-attachment-state="detached"
                  className="line-clamp-3 border-l-2 border-slate-600 pl-2 italic text-slate-500"
                >
                  "{attachment.extractedText}"
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { getModeTheme, TeachingModeBadge };

export function ContextualTutorCard({
  tokens,
  sectionId,
  sourceObjectId = null,
  visiblePage = null,
  pdfTitle = null,
  userId = null,
  intent: initialIntent,
  onClose,
  onNavigateToSource,
  embedded = false,
  isNarrow = false,
  containerWidth = 0,
  focusToken = 0,
  onVisualChange,
  columnLayout = false,
  columnWidth = null,
  onDockResizeReady,
  onDockCollapseCue,
  onQuickAskReveal,
}: ContextualTutorCardProps) {
  const initialMode = initialIntent
    ? initialIntent.mode || legacyActionToTeachingMode(initialIntent.action)
    : undefined;
  const effectiveSourceId = sourceObjectId ?? initialIntent?.attachment.sourceObjectId ?? null;
  const [isMinimized, setIsMinimized] = useState(() => {
    if (!userId || !sectionId) return false;
    return readTutorLayout(userId, sectionId)?.placement === 'minimized';
  });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const layout = useMemo(() => {
    if (!userId || !sectionId) return null;
    return readTutorLayout(userId, sectionId);
  }, [userId, sectionId, layoutRevision]);
  const bumpLayout = useCallback(() => setLayoutRevision(revision => revision + 1), []);
  const [quickAskOpen, setQuickAskOpen] = useState(false);
  const quickAskOpenRef = useRef(false);
  const quickAskSubmitRef = useRef(false);
  const onQuickAskRevealRef = useRef(onQuickAskReveal);
  onQuickAskRevealRef.current = onQuickAskReveal;
  const storedVisual: TutorSurfaceVisual = embedded ? tutorDockVisual(layout, containerWidth) : isMinimized ? 'minimized' : 'floating';
  const visual: TutorSurfaceVisual =
    quickAskOpen && storedVisual === 'compact' && layout?.expandedDockCollapsed ? 'expanded' : storedVisual;
  const rootRef = useRef<HTMLDivElement>(null);
  const [composerFocus, setComposerFocus] = useState(0);
  const [dockHeight, setDockHeight] = useState(() =>
    resolveTopDockExpandedHeight(
      userId && sectionId ? readTutorLayout(userId, sectionId)?.topDockHeight : undefined,
      currentTutorViewport().height,
      isNarrow,
    ),
  );
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const {
    status,
    turns,
    errorMessage,
    errorCode,
    mode,
    setMode,
    sendQuestion,
    retry,
    reset,
    startNewThread,
    restoreArchivedThread,
    archivedThreads,
    setIntent,
    attachmentAttached,
    setAttachmentAttached,
    captureIntent,
  } = useStandaloneTutor({
    sectionId,
    sourceObjectId: effectiveSourceId,
    visiblePage,
    userId,
    initialIntent,
    initialMode,
  });

  const attachment = captureIntent?.attachment ?? null;

  // A live capture owns the selection. Opening without one keeps whatever the session already stored.
  useEffect(() => {
    if (!initialIntent) return;
    const updatedIntent: TutorCaptureIntent = {
      action: teachingModeToLegacyAction(mode),
      mode,
      attachment: initialIntent.attachment,
    };
    setIntent(updatedIntent);
  }, [mode, setIntent, initialIntent]);

  // Initial prompt draft (editable by user before sending)
  const [initialDraft, setInitialDraft] = useState(() =>
    buildTutorQuestionText(
      initialMode ?? 'explain',
      initialIntent?.attachment.extractedText,
      initialIntent?.attachment.pageNumber,
    ),
  );
  const [followUpDraft, setFollowUpDraft] = useState('');
  const draftScopeRef = useRef(`${sectionId}:${effectiveSourceId ?? ''}`);
  useEffect(() => {
    const scope = `${sectionId}:${effectiveSourceId ?? ''}`;
    if (draftScopeRef.current === scope) return;
    draftScopeRef.current = scope;
    setFollowUpDraft('');
    setInitialDraft(
      buildTutorQuestionText(
        initialMode ?? 'explain',
        initialIntent?.attachment.extractedText,
        initialIntent?.attachment.pageNumber,
      ),
    );
  }, [sectionId, effectiveSourceId, initialMode, initialIntent]);

  // Mode change handler with draft preservation
  const handleModeChange = useCallback(
    (newMode: TeachingMode) => {
      setMode(newMode);
      setIsModeDropdownOpen(false);
      if (turns.length === 0) {
        setInitialDraft(prev => {
          if (isDefaultQuestionText(prev)) {
            return getDefaultModeQuestionText(newMode);
          }
          return prev; // Preserve user's typed question!
        });
      }
    },
    [setMode, turns.length],
  );

  // Synchronize draft if a new capture arrives
  useEffect(() => {
    if (!initialIntent) return;
    const targetMode = initialIntent.mode || legacyActionToTeachingMode(initialIntent.action);
    setInitialDraft(prev => {
      if (isDefaultQuestionText(prev)) {
        return getDefaultModeQuestionText(targetMode);
      }
      return prev;
    });
  }, [initialIntent]);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!isModeDropdownOpen && !isHistoryOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModeDropdownOpen(false);
      }
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModeDropdownOpen, isHistoryOpen]);

  const persistedPresentation = useMemo(() => {
    if (userId && sectionId && effectiveSourceId) {
      const sess = readTutorSession(userId, sectionId, effectiveSourceId);
      return sess?.presentation;
    }
    return undefined;
  }, [userId, sectionId, effectiveSourceId]);

  const initialFloating = useMemo(() => {
    const layout = userId && sectionId ? readTutorLayout(userId, sectionId) : null;
    return resolveTutorFloatingGeometry(layout, persistedPresentation, currentTutorViewport());
  }, [userId, sectionId, persistedPresentation]);

  // Position and size. Layout preferences win; otherwise legacy conversation geometry.
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({
    x: initialFloating.positionX,
    y: initialFloating.positionY,
  }));

  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: initialFloating.width,
    height: initialFloating.height,
  }));

  // Keep card within bounds on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 480) {
        setPosition(prev => ({
          x: Math.max(8, Math.min(prev.x, window.innerWidth - 20)),
          y: prev.y,
        }));
        setSize(prev => ({
          ...prev,
          width: Math.min(prev.width, window.innerWidth - 16),
        }));
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const positionRef = useRef(position);
  positionRef.current = position;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Copy legacy floating geometry into the layout store once. Never writes placement onto the conversation.
  useEffect(() => {
    if (!userId || !sectionId || !effectiveSourceId) return;
    if (readTutorLayout(userId, sectionId)) return;
    const legacy = legacyFloatingFromPresentation(
      readTutorSession(userId, sectionId, effectiveSourceId)?.presentation,
    );
    if (!legacy) return;
    writeTutorLayout(userId, sectionId, { floating: legacy });
    bumpLayout();
  }, [userId, sectionId, effectiveSourceId, bumpLayout]);

  const persistFloatingGeometry = useCallback(() => {
    if (!userId || !sectionId) return;
    const next = {
      positionX: positionRef.current.x,
      positionY: positionRef.current.y,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
    };
    writeTutorLayout(userId, sectionId, { floating: next });
    if (effectiveSourceId) {
      writeTutorPresentation(userId, sectionId, effectiveSourceId, next);
    }
  }, [userId, sectionId, effectiveSourceId]);

  const commitLayout = useCallback(
    (patch: TutorLayoutPatch) => {
      if (userId && sectionId) writeTutorLayout(userId, sectionId, patch);
      bumpLayout();
    },
    [userId, sectionId, bumpLayout],
  );

  const handleMinimize = useCallback(() => {
    if (userId && sectionId) minimizeTutorLayout(userId, sectionId);
    setIsMinimized(true);
    bumpLayout();
  }, [userId, sectionId, bumpLayout]);

  const handleRestorePlacement = useCallback(() => {
    if (userId && sectionId) restoreTutorLayout(userId, sectionId);
    setIsMinimized(false);
    bumpLayout();
  }, [userId, sectionId, bumpLayout]);

  const handleResetLayout = useCallback(() => {
    const viewport = currentTutorViewport();
    if (userId && sectionId) resetTutorLayout(userId, sectionId, viewport);
    const geometry = resolveTutorFloatingGeometry(null, null, viewport);
    setPosition({ x: geometry.positionX, y: geometry.positionY });
    setSize({ width: geometry.width, height: geometry.height });
    setIsMinimized(false);
    bumpLayout();
  }, [userId, sectionId, bumpLayout]);

  const expandDock = useCallback(() => {
    const current = userId && sectionId ? readTutorLayout(userId, sectionId) : null;
    if (current?.placement === 'minimized') {
      const restore = current.restorePlacement;
      if (restore === 'floating') commitLayout({ placement: 'floating', expandedDockCollapsed: false });
      else if (restore === 'side-left' || restore === 'side-right') {
        commitLayout({ placement: restore, topDockExpanded: false, expandedDockCollapsed: false });
      } else commitLayout({ placement: restore, topDockExpanded: true, expandedDockCollapsed: false });
    } else if (
      (current?.placement === 'side-left' || current?.placement === 'side-right') &&
      sideDockFits(containerWidth)
    ) {
      commitLayout({ placement: 'top-dock', topDockExpanded: true, expandedDockCollapsed: false });
    } else if (current?.placement !== 'floating') {
      commitLayout({ topDockExpanded: true, expandedDockCollapsed: false });
    }
    setIsMinimized(false);
    setComposerFocus(value => value + 1);
  }, [containerWidth, userId, sectionId, commitLayout]);

  // A new capture or header focus should show the current Tutor. Side and floating
  // placements stay where the student put them. Compact expands so the selection is visible.
  const revealCurrentTutor = useCallback(() => {
    const current = userId && sectionId ? readTutorLayout(userId, sectionId) : null;
    const placement = current?.placement ?? 'top-dock';
    if (
      placement === 'floating' ||
      ((placement === 'side-left' || placement === 'side-right') && sideDockFits(containerWidth))
    ) {
      setComposerFocus(value => value + 1);
      return;
    }
    if (placement === 'minimized') {
      const restore = current?.restorePlacement ?? 'top-dock';
      if (restore === 'floating') commitLayout({ placement: 'floating', expandedDockCollapsed: false });
      else commitLayout({ placement: restore, topDockExpanded: true, expandedDockCollapsed: false });
    } else {
      commitLayout({ topDockExpanded: true, expandedDockCollapsed: false });
    }
    setIsMinimized(false);
    setComposerFocus(value => value + 1);
  }, [containerWidth, userId, sectionId, commitLayout]);

  const collapseDock = useCallback(() => {
    commitLayout({ topDockExpanded: false, expandedDockCollapsed: false });
  }, [commitLayout]);

  const switchToFloating = useCallback(() => {
    commitLayout({ placement: 'floating', expandedDockCollapsed: false });
    setIsMinimized(false);
  }, [commitLayout]);

  const switchToDock = useCallback(() => {
    const current = userId && sectionId ? readTutorLayout(userId, sectionId) : null;
    commitLayout({
      placement: 'top-dock',
      topDockExpanded: current?.topDockExpanded ?? false,
    });
    setIsMinimized(false);
  }, [userId, sectionId, commitLayout]);

  const switchToSide = useCallback((placement: 'side-left' | 'side-right') => {
    if (!sideDockFits(containerWidth)) return;
    const current = userId && sectionId ? readTutorLayout(userId, sectionId) : null;
    commitLayout({
      placement,
      topDockExpanded: false,
      expandedDockCollapsed: false,
      sideDockWidth: current?.sideDockWidth ?? TUTOR_SIDE_DOCK_DEFAULT,
    });
    setIsMinimized(false);
    setComposerFocus(value => value + 1);
  }, [containerWidth, userId, sectionId, commitLayout]);

  useEffect(() => {
    onVisualChange?.(visual);
  }, [onVisualChange, visual, layout?.sideDockWidth, containerWidth]);

  useEffect(() => {
    if (quickAskOpenRef.current) return;
    setDockHeight(
      resolveTopDockExpandedHeight(layout?.topDockHeight, currentTutorViewport().height, isNarrow),
    );
  }, [layout?.topDockHeight, isNarrow, quickAskOpen]);

  useEffect(() => {
    if (layout?.expandedDockCollapsed || !quickAskOpenRef.current) return;
    quickAskOpenRef.current = false;
    setQuickAskOpen(false);
    onQuickAskRevealRef.current?.(false);
  }, [layout?.expandedDockCollapsed]);

  const seenCaptureRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = initialIntent
      ? `${initialIntent.attachment.sourceObjectId}\0${initialIntent.attachment.pageNumber}\0${initialIntent.attachment.extractedText}`
      : '';
    const previous = seenCaptureRef.current;
    seenCaptureRef.current = key;
    if (!embedded || !initialIntent) return;
    if (previous === undefined || previous === key) return;
    revealCurrentTutor();
  }, [embedded, initialIntent, revealCurrentTutor]);

  const lastFocusTokenRef = useRef(0);
  useEffect(() => {
    if (!embedded || !focusToken || focusToken === lastFocusTokenRef.current) return;
    lastFocusTokenRef.current = focusToken;
    revealCurrentTutor();
  }, [embedded, focusToken, revealCurrentTutor]);

  useEffect(() => {
    if (!composerFocus) return;
    const node = rootRef.current?.querySelector('textarea, input');
    if (node instanceof HTMLElement) node.focus();
  }, [composerFocus, visual]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const latestAssistantTurnRef = useRef<HTMLDivElement>(null);
  const prevTurnsCountRef = useRef(turns.length);
  const isInitialMountRef = useRef(true);

  // Restore scroll position on initial mount if available
  useEffect(() => {
    if (scrollRef.current && persistedPresentation?.scrollTop !== undefined) {
      scrollRef.current.scrollTop = persistedPresentation.scrollTop;
    }
  }, [persistedPresentation]);

  // Position reader at beginning of new answers without auto-jumping to the bottom
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevTurnsCountRef.current = turns.length;
      return;
    }

    if (turns.length > prevTurnsCountRef.current) {
      const lastTurn = turns[turns.length - 1];
      prevTurnsCountRef.current = turns.length;

      if (lastTurn?.role === 'assistant' && scrollRef.current && latestAssistantTurnRef.current) {
        const container = scrollRef.current;
        const turnTop = latestAssistantTurnRef.current.getBoundingClientRect().top;
        container.scrollTop += turnTop - container.getBoundingClientRect().top;
      } else if (lastTurn?.role === 'user' && scrollRef.current) {
        // On user submit, reveal user turn and thinking state
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [turns]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && userId && sectionId && effectiveSourceId) {
      writeTutorPresentation(userId, sectionId, effectiveSourceId, {
        scrollTop: scrollRef.current.scrollTop,
      });
    }
  }, [userId, sectionId, effectiveSourceId]);

  // Dragging state
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number; posX: number; posY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    posX: position.x,
    posY: position.y,
  });

  // Resizing state
  const resizeRef = useRef<{ isResizing: boolean; startX: number; startY: number; startW: number; startH: number }>({
    isResizing: false,
    startX: 0,
    startY: 0,
    startW: size.width,
    startH: size.height,
  });

  // Escape closes menus first. Embedded Tutor docks or collapses; it does not unmount.
  useEffect(() => {
    if (visual === 'minimized' || visual === 'compact') return;
    return pushEscapeHandler(() => {
      if (isHistoryOpen) {
        setIsHistoryOpen(false);
        return true;
      }
      if (isModeDropdownOpen) {
        setIsModeDropdownOpen(false);
        return true;
      }
      if (embedded) {
        if (visual === 'expanded') collapseDock();
        else if (visual === 'side-left' || visual === 'side-right') {
          commitLayout({ placement: 'top-dock', topDockExpanded: false });
        } else switchToDock();
        return true;
      }
      onClose();
      return true;
    });
  }, [onClose, visual, embedded, isModeDropdownOpen, isHistoryOpen, collapseDock, switchToDock, commitLayout]);

  // Header drag handlers
  const handleHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDragging) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    const maxW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const maxH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const newX = Math.max(10, Math.min(maxW - 100, dragRef.current.posX + deltaX));
    const newY = Math.max(40, Math.min(maxH - 80, dragRef.current.posY + deltaY));
    positionRef.current = { x: newX, y: newY };
    setPosition(positionRef.current);
  };

  const handleHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current.isDragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    persistFloatingGeometry();
  };

  // Resize handlers (bottom-right handle)
  const handleResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      isResizing: true,
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current.isResizing) return;
    const deltaX = e.clientX - resizeRef.current.startX;
    const deltaY = e.clientY - resizeRef.current.startY;

    const maxW = typeof window !== 'undefined' ? Math.min(800, window.innerWidth - position.x - 20) : 800;
    const maxH = typeof window !== 'undefined' ? Math.min(800, window.innerHeight - position.y - 20) : 800;

    const newW = Math.max(MIN_WIDTH, Math.min(maxW, resizeRef.current.startW + deltaX));
    const newH = Math.max(MIN_HEIGHT, Math.min(maxH, resizeRef.current.startH + deltaY));
    sizeRef.current = { width: newW, height: newH };
    setSize(sizeRef.current);
  };

  const handleResizePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current.isResizing = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    persistFloatingGeometry();
  };

  const dockResizeRef = useRef<{ isResizing: boolean; startY: number; startH: number }>({
    isResizing: false,
    startY: 0,
    startH: dockHeight,
  });
  const dockHeightRef = useRef(dockHeight);
  dockHeightRef.current = dockHeight;

  const clampExpandedHeight = (next: number) => {
    const viewport = currentTutorViewport();
    const max = resolveTopDockExpandedHeight(10_000, viewport.height, isNarrow);
    const min = Math.min(160, max);
    return Math.round(Math.min(max, Math.max(min, next)));
  };

  const persistDockHeight = (height: number) => {
    const next = clampExpandedHeight(height);
    dockHeightRef.current = next;
    setDockHeight(next);
    if (quickAskOpenRef.current) return;
    commitLayout({ topDockHeight: next });
  };

  const collapseArmedRef = useRef(false);
  const pendingRestoreHeightRef = useRef(dockHeight);
  const onDockCollapseCueRef = useRef(onDockCollapseCue);
  onDockCollapseCueRef.current = onDockCollapseCue;

  const expandedFloor = () => {
    const viewport = currentTutorViewport();
    const max = resolveTopDockExpandedHeight(10_000, viewport.height, isNarrow);
    return Math.min(TUTOR_TOP_DOCK_EXPANDED_MIN, max);
  };

  const publishCollapseCue = (cue: TutorDockCollapseCue | null) => {
    onDockCollapseCueRef.current?.(cue);
  };

  const releaseExpandedDock = (restoreHeight: number) => {
    collapseArmedRef.current = false;
    dockResizeRef.current.isResizing = false;
    if (quickAskOpenRef.current) {
      quickAskOpenRef.current = false;
      setQuickAskOpen(false);
      onQuickAskRevealRef.current?.(false);
      publishCollapseCue(null);
      return;
    }
    const next = clampExpandedHeight(restoreHeight);
    dockHeightRef.current = next;
    setDockHeight(next);
    pendingRestoreHeightRef.current = next;
    commitLayout({
      topDockExpanded: true,
      topDockHeight: next,
      expandedDockCollapsed: true,
    });
    publishCollapseCue(null);
  };

  const beginDockDrag = (clientY: number) => {
    const startH = dockHeightRef.current;
    collapseArmedRef.current = false;
    dockResizeRef.current = { isResizing: true, startY: clientY, startH };
    if (startH > expandedFloor()) pendingRestoreHeightRef.current = startH;
  };

  const moveDockDrag = (clientY: number) => {
    if (!dockResizeRef.current.isResizing) return;
    const raw = dockResizeRef.current.startH + (clientY - dockResizeRef.current.startY);
    const next = clampExpandedHeight(raw);
    const armed = next - raw >= TUTOR_TOP_DOCK_COLLAPSE_PAST_PX;
    collapseArmedRef.current = armed;
    dockHeightRef.current = next;
    setDockHeight(next);
    publishCollapseCue({ atMinimum: next <= expandedFloor(), armed });
  };

  const endDockDrag = () => {
    if (!dockResizeRef.current.isResizing) return;
    const armed = collapseArmedRef.current;
    const restoreHeight = pendingRestoreHeightRef.current;
    dockResizeRef.current.isResizing = false;
    collapseArmedRef.current = false;
    if (armed) {
      releaseExpandedDock(restoreHeight);
      return;
    }
    persistDockHeight(dockHeightRef.current);
    publishCollapseCue({ atMinimum: dockHeightRef.current <= expandedFloor(), armed: false });
  };

  const dockGestureRef = useRef({
    beginDockDrag,
    moveDockDrag,
    endDockDrag,
    releaseExpandedDock,
    persistDockHeight,
    expandedFloor,
    clampExpandedHeight,
  });
  dockGestureRef.current = {
    beginDockDrag,
    moveDockDrag,
    endDockDrag,
    releaseExpandedDock,
    persistDockHeight,
    expandedFloor,
    clampExpandedHeight,
  };

  useEffect(() => {
    if (!onDockResizeReady) return;
    onDockResizeReady({
      begin: clientY => dockGestureRef.current.beginDockDrag(clientY),
      move: clientY => dockGestureRef.current.moveDockDrag(clientY),
      end: () => dockGestureRef.current.endDockDrag(),
      nudge(delta) {
        const next = dockHeightRef.current + delta;
        if (next > dockGestureRef.current.expandedFloor()) {
          pendingRestoreHeightRef.current = dockGestureRef.current.clampExpandedHeight(next);
        }
        dockGestureRef.current.persistDockHeight(next);
      },
      collapse() {
        dockGestureRef.current.releaseExpandedDock(pendingRestoreHeightRef.current);
      },
    });
    return () => onDockResizeReady(null);
  }, [onDockResizeReady]);

  useEffect(() => {
    if (visual !== 'expanded') {
      publishCollapseCue(null);
      return;
    }
    if (dockResizeRef.current.isResizing) return;
    publishCollapseCue({ atMinimum: dockHeight <= expandedFloor(), armed: false });
  }, [visual, dockHeight, isNarrow]);

  const handleDockResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') return;
    e.preventDefault();
    e.stopPropagation();
    beginDockDrag(e.clientY);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleDockResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') return;
    moveDockDrag(e.clientY);
  };

  const handleDockResizePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    endDockDrag();
  };

  const handleDockResizeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 24 : -24;
    persistDockHeight(dockHeight + delta);
  };

  const composerDraft = turns.length === 0 ? initialDraft : followUpDraft;
  const setComposerDraft = (value: string) => {
    if (turns.length === 0) setInitialDraft(value);
    else setFollowUpDraft(value);
  };

  const dismissQuickAsk = () => {
    if (!quickAskOpenRef.current) return;
    quickAskOpenRef.current = false;
    setQuickAskOpen(false);
    onQuickAskRevealRef.current?.(false);
  };

  const restoreSavedExpandedHeight = () => {
    quickAskOpenRef.current = false;
    setQuickAskOpen(false);
    onQuickAskRevealRef.current?.(false);
    commitLayout({ expandedDockCollapsed: false, topDockExpanded: true });
  };

  const revealQuickAsk = () => {
    const moderate = resolveTopDockExpandedHeight(
      TUTOR_TOP_DOCK_EXPANDED_DEFAULT,
      currentTutorViewport().height,
      isNarrow,
    );
    quickAskOpenRef.current = true;
    setQuickAskOpen(true);
    dockHeightRef.current = moderate;
    setDockHeight(moderate);
    onQuickAskRevealRef.current?.(true);
    setComposerFocus(value => value + 1);
  };

  const submitQuickAsk = () => {
    if (quickAskSubmitRef.current || status === 'loading') return;
    const isInitial = turns.length === 0;
    const question = (isInitial ? initialDraft : followUpDraft).trim();
    if (!question || !sectionId) return;
    quickAskSubmitRef.current = true;
    if (isInitial) setInitialDraft('');
    else setFollowUpDraft('');
    void sendQuestion(question, isInitial, mode).finally(() => {
      quickAskSubmitRef.current = false;
    });
    revealQuickAsk();
  };

  const onQuickAskKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) {
      event.preventDefault();
      const field = event.currentTarget;
      const start = field.selectionStart ?? composerDraft.length;
      const end = field.selectionEnd ?? start;
      const next = `${composerDraft.slice(0, start)}\n${composerDraft.slice(end)}`;
      setComposerDraft(next);
      requestAnimationFrame(() => {
        field.selectionStart = start + 1;
        field.selectionEnd = start + 1;
      });
      return;
    }
    event.preventDefault();
    submitQuickAsk();
  };

  // Submit initial question
  const handleSendInitial = (e: React.FormEvent) => {
    e.preventDefault();
    const q = initialDraft.trim();
    if (!q || status === 'loading') return;
    void sendQuestion(q, true, mode);
  };

  // Submit follow-up question
  const handleSendFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const q = followUpDraft.trim();
    if (!q || status === 'loading') return;
    setFollowUpDraft('');
    void sendQuestion(q, false, mode);
  };

  const handleCitationActivate = useCallback(
    (source: AskCourseSourceRef) => {
      if (source.sourceKind === 'free_space_pdf') {
        onNavigateToSource?.(source.pageNumber);
      }
    },
    [onNavigateToSource],
  );

  const activeModeOption = TEACHING_MODE_OPTIONS.find(o => o.mode === mode) || TEACHING_MODE_OPTIONS[0];
  const activeModeTheme = getModeTheme(mode);
  const ActiveIcon = activeModeTheme.Icon;
  const showTutorRetry = errorCode !== 'output_budget_exhausted';
  const isFloating = visual === 'floating';
  const isSide = visual === 'side-left' || visual === 'side-right';
  const fittedSideWidth = isSide ? sideDockRenderWidth(layout?.sideDockWidth, containerWidth) : null;
  const sideMax = sideDockRenderWidth(TUTOR_SIDE_DOCK_WIDTH_MAX, containerWidth) ?? TUTOR_SIDE_DOCK_RENDER_MIN;
  const sideWidthRef = useRef(fittedSideWidth);
  sideWidthRef.current = fittedSideWidth;
  const commitSideWidth = (requested: number) => {
    const next = sideDockRenderWidth(requested, containerWidth);
    const drawn = sideWidthRef.current;
    if (next == null || next === drawn) return;
    sideWidthRef.current = next;
    commitLayout({ sideDockWidth: next });
  };
  const handleSideResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = sideWidthRef.current;
    if (!current) return;
    const step = event.shiftKey ? 32 : 16;
    const growLeft = visual === 'side-right';
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commitSideWidth(current + (growLeft ? step : -step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      commitSideWidth(current + (growLeft ? -step : step));
    }
  };
  const handleSideResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!fittedSideWidth) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = fittedSideWidth;
    const growLeft = visual === 'side-right';
    const onMove = (move: PointerEvent) => {
      const delta = growLeft ? startX - move.clientX : move.clientX - startX;
      commitSideWidth(startWidth + delta);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const compactHeight = isNarrow ? TUTOR_TOP_DOCK_COMPACT_HEIGHT_NARROW : TUTOR_TOP_DOCK_COMPACT_HEIGHT;
  const showMinimizedStrip = () => {
    const current = userId && sectionId ? readTutorLayout(userId, sectionId) : null;
    if (current?.placement === 'minimized') {
      const restore = current.restorePlacement;
      if (restore === 'floating') commitLayout({ placement: 'top-dock', topDockExpanded: false });
      else commitLayout({ placement: restore, topDockExpanded: false });
    } else {
      commitLayout({ topDockExpanded: false });
    }
    setIsMinimized(false);
  };

  // Minimized strip. Inside composition it stays in the dock slot, not over the PDF.
  if (visual === 'minimized') {
    return (
      <div
        ref={rootRef}
        data-testid="contextual-tutor-minimized-pill"
        data-tutor-root="tutor"
        data-tutor-visual="minimized"
        data-tutor-expanded="0"
        role="region"
        aria-label="ZIKUK Tutor minimized"
        className={`${embedded ? 'relative' : 'fixed'} z-50 flex items-center gap-2 px-3 border select-none`}
        style={{
          left: embedded ? undefined : `${position.x}px`,
          top: embedded ? undefined : `${position.y}px`,
          height: embedded ? compactHeight : undefined,
          flex: embedded ? `0 0 ${compactHeight}px` : undefined,
          borderRadius: embedded ? 0 : 999,
          backgroundColor: tokens.cardBg || '#0f172a',
          borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.2)',
          color: tokens.textPrimary || '#fff',
        }}
      >
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-semibold tracking-wide">ZIKUK Tutor</span>
        <TeachingModeBadge mode={mode} size="xs" />
        {turns.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200">
            {turns.length}
          </span>
        )}
        <button
          type="button"
          data-testid="contextual-tutor-restore-btn"
          aria-label="Restore Contextual Tutor"
          onClick={handleRestorePlacement}
          className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          data-testid="contextual-tutor-minimized-close-btn"
          aria-label={embedded ? 'Show compact Tutor dock' : 'Close Contextual Tutor'}
          onClick={embedded ? showMinimizedStrip : onClose}
          className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (visual === 'compact') {
    return (
      <div
        ref={rootRef}
        data-testid="tutor-top-dock"
        data-tutor-root="tutor"
        data-tutor-visual="compact"
        data-tutor-expanded="0"
        data-tutor-collapse={layout?.expandedDockCollapsed ? 'released' : 'compact'}
        role="region"
        aria-label="ZIKUK Tutor"
        className="relative z-10 flex items-center gap-2 border-b shrink-0"
        style={{
          height: compactHeight,
          flex: `0 0 ${compactHeight}px`,
          padding: '0 12px',
          backgroundColor: tokens.cardBg || '#0f172a',
          borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.12)',
          color: tokens.textPrimary || '#f8fafc',
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" aria-hidden />
        <span className="text-sm font-semibold tracking-wide shrink-0">Tutor</span>
        {!isNarrow && <TeachingModeBadge mode={mode} size="xs" />}
        <TutorPdfContext
          compact
          pdfTitle={pdfTitle}
          visiblePage={visiblePage}
          selection={attachment ? (attachmentAttached ? 'attached' : 'detached') : 'none'}
        />
        {attachment ? (
          <span data-testid="tutor-dock-attachment" className="text-[11px] text-slate-300 truncate shrink-0 max-w-[34%]">
            {attachmentAttached ? 'Selection attached' : 'Selection detached'} · p. {attachment.pageNumber}
          </span>
        ) : null}
        {layout?.expandedDockCollapsed ? (
          <form
            data-testid="tutor-dock-ask"
            className="flex flex-1 items-center gap-1 min-w-0"
            onSubmit={event => {
              event.preventDefault();
              submitQuickAsk();
            }}
          >
            <textarea
              data-testid="tutor-quick-ask-input"
              aria-label="Ask the tutor a question"
              rows={1}
              value={composerDraft}
              disabled={status === 'loading'}
              placeholder={status === 'loading' ? 'Tutor is answering…' : 'Ask a question'}
              onChange={event => setComposerDraft(event.target.value)}
              onKeyDown={onQuickAskKeyDown}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 disabled:opacity-60"
              style={{
                minHeight: isNarrow ? 44 : 32,
                maxHeight: isNarrow ? 44 : 32,
                resize: 'none',
                overflow: 'auto',
                lineHeight: '16px',
                paddingTop: 8,
                paddingBottom: 8,
              }}
            />
            {status === 'loading' ? (
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                }}
              >
                Tutor is answering…
              </span>
            ) : null}
            <button
              type="submit"
              data-testid="tutor-quick-ask-send"
              aria-label="Send question"
              title="Send question"
              disabled={!composerDraft.trim() || status === 'loading'}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              style={{ minHeight: isNarrow ? 44 : 32 }}
            >
              Send
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-testid="tutor-dock-ask"
            aria-label="Ask the tutor a question"
            onClick={expandDock}
            className="flex-1 min-w-0 text-left text-xs text-slate-300 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
            style={{ minHeight: isNarrow ? 44 : 32 }}
          >
            {status === 'loading' ? 'Tutor is answering…' : 'Ask a question'}
          </button>
        )}
        {!isNarrow && (
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              data-testid="tutor-dock-mode"
              aria-label={`Teaching mode: ${activeModeOption.label}. Click to switch mode.`}
              aria-expanded={isModeDropdownOpen}
              onClick={() => setIsModeDropdownOpen(prev => !prev)}
              className={`inline-flex items-center gap-1 px-2 rounded-full text-[11px] font-semibold border ${activeModeTheme.badgeBg}`}
              style={{ minHeight: 32 }}
            >
              <span>{activeModeOption.shortLabel}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {isModeDropdownOpen && (
              <div
                data-testid="tutor-mode-dropdown"
                className="absolute right-0 top-full mt-1.5 z-50 w-56 p-1.5 rounded-xl border shadow-2xl"
                style={{
                  backgroundColor: tokens.cardBg || '#0f172a',
                  borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.15)',
                }}
              >
                {TEACHING_MODE_OPTIONS.map(opt => (
                  <button
                    key={opt.mode}
                    type="button"
                    data-testid={`tutor-dock-mode-${opt.mode}`}
                    onClick={() => handleModeChange(opt.mode)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-white/10"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {layout?.expandedDockCollapsed ? (
          <button
            type="button"
            data-testid="tutor-dock-restore"
            aria-label="Restore Tutor"
            title="Restore Tutor"
            onClick={restoreSavedExpandedHeight}
            className="shrink-0 rounded-lg border px-3 text-xs font-semibold text-slate-100 hover:bg-white/10"
            style={{ minHeight: isNarrow ? 44 : 32, borderColor: 'rgba(255,255,255,0.16)' }}
          >
            Restore Tutor
          </button>
        ) : null}
        <button
          type="button"
          data-testid="tutor-dock-expand"
          aria-label="Expand Tutor"
          aria-expanded={false}
          onClick={expandDock}
          className="p-2 rounded-lg text-slate-300 hover:bg-white/10"
          style={{ minWidth: isNarrow ? 44 : 32, minHeight: isNarrow ? 44 : 32 }}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        {sideDockFits(containerWidth) && (
          <button
            type="button"
            data-testid="tutor-dock-side"
            aria-label="Open Tutor on the right"
            onClick={() => switchToSide('side-right')}
            className="p-2 rounded-lg text-slate-300 hover:bg-white/10 shrink-0"
            style={{ minWidth: isNarrow ? 44 : 32, minHeight: isNarrow ? 44 : 32 }}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          data-testid="tutor-dock-float"
          aria-label="Float Tutor"
          onClick={switchToFloating}
          className="p-2 rounded-lg text-slate-300 hover:bg-white/10"
          style={{ minWidth: isNarrow ? 44 : 32, minHeight: isNarrow ? 44 : 32 }}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          data-testid="tutor-dock-minimize"
          aria-label="Minimize Tutor"
          onClick={handleMinimize}
          className="p-2 rounded-lg text-slate-300 hover:bg-white/10"
          style={{ minWidth: isNarrow ? 44 : 32, minHeight: isNarrow ? 44 : 32 }}
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid={isFloating ? 'contextual-tutor-card' : isSide ? 'tutor-side-dock' : 'tutor-top-dock'}
      data-tutor-root="tutor"
      data-tutor-visual={visual}
      data-tutor-expanded={visual === 'expanded' ? '1' : '0'}
      data-quick-ask={quickAskOpen ? '1' : '0'}
      data-side-width={columnLayout ? columnWidth ?? undefined : fittedSideWidth ?? undefined}
      className={`${isFloating ? 'fixed rounded-2xl shadow-2xl' : 'relative'} z-50 flex flex-col backdrop-blur-xl`}
      style={
        isFloating
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: `${size.width}px`,
              maxWidth: 'calc(100vw - 16px)',
              height: `${size.height}px`,
              minWidth: typeof window !== 'undefined' && window.innerWidth < 400 ? 'calc(100vw - 16px)' : `${MIN_WIDTH}px`,
              minHeight: `${MIN_HEIGHT}px`,
              backgroundColor: tokens.cardBg || '#0f172a',
              borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.15)',
              borderWidth: '1px',
              borderStyle: 'solid',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              color: tokens.textPrimary || '#f8fafc',
            }
          : isSide
            ? {
                width: '100%',
                height: '100%',
                minHeight: 0,
                flex: '1 1 auto',
                overflow: 'hidden',
                backgroundColor: tokens.cardBg || '#0f172a',
                borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.15)',
                borderLeftWidth: visual === 'side-right' ? '1px' : '0',
                borderRightWidth: visual === 'side-left' ? '1px' : '0',
                borderLeftStyle: 'solid',
                borderRightStyle: 'solid',
                color: tokens.textPrimary || '#f8fafc',
              }
          : {
              width: '100%',
              height: dockHeight,
              flex: `0 0 ${dockHeight}px`,
              maxHeight: '45vh',
              overflow: 'hidden',
              backgroundColor: tokens.cardBg || '#0f172a',
              borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.15)',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
              color: tokens.textPrimary || '#f8fafc',
            }
      }
      onPointerDown={e => e.stopPropagation()}
    >
      {isSide && fittedSideWidth && !columnLayout ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Tutor"
          aria-valuemin={TUTOR_SIDE_DOCK_RENDER_MIN}
          aria-valuemax={sideMax}
          aria-valuenow={fittedSideWidth}
          tabIndex={0}
          data-testid="tutor-side-resize"
          onKeyDown={handleSideResizeKeyDown}
          onPointerDown={handleSideResizePointerDown}
          className="absolute top-0 bottom-0 z-10"
          style={{
            width: 8,
            left: visual === 'side-right' ? 0 : undefined,
            right: visual === 'side-left' ? 0 : undefined,
            cursor: 'col-resize',
            touchAction: 'none',
          }}
        />
      ) : null}
      {/* Draggable only while floating. The dock stays in the composition column. */}
      <div
        data-testid="contextual-tutor-header"
        className={`flex items-center justify-between gap-2 border-b select-none shrink-0 ${isSide ? 'flex-wrap px-3 py-2' : 'px-4 py-3'} ${isFloating ? 'cursor-move rounded-t-2xl' : ''}`}
        style={{
          borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.03)',
        }}
        onPointerDown={isFloating ? handleHeaderPointerDown : undefined}
        onPointerMove={isFloating ? handleHeaderPointerMove : undefined}
        onPointerUp={isFloating ? handleHeaderPointerUp : undefined}
      >
        <div className="flex items-center gap-2 relative min-w-0" ref={dropdownRef}>
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-sm font-semibold tracking-wide shrink-0">ZIKUK Tutor</span>

          {/* Interactive Mode Dropdown Trigger */}
          <button
            type="button"
            data-testid="tutor-header-mode-trigger"
            onClick={() => setIsModeDropdownOpen(prev => !prev)}
            aria-expanded={isModeDropdownOpen}
            aria-label={`Current mode: ${activeModeOption.label}. Click to switch mode.`}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all hover:brightness-110 active:scale-95 ${activeModeTheme.badgeBg}`}
          >
            <ActiveIcon className={`w-3 h-3 ${activeModeTheme.iconColor}`} />
            <span>{activeModeOption.label}</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-70" />
          </button>

          {/* Mode Dropdown Menu */}
          {isModeDropdownOpen && (
            <div
              data-testid="tutor-mode-dropdown"
              className="absolute left-0 top-full mt-1.5 z-50 w-64 p-1.5 rounded-xl border shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
              style={{
                backgroundColor: tokens.cardBg || '#0f172a',
                borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.15)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              }}
            >
              <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Teaching Mode
              </div>
              <div className="space-y-0.5">
                {TEACHING_MODE_OPTIONS.map(opt => {
                  const theme = getModeTheme(opt.mode);
                  const Icon = theme.Icon;
                  const isSelected = opt.mode === mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      data-testid={`tutor-dropdown-mode-${opt.mode}`}
                      onClick={() => handleModeChange(opt.mode)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-white/10 text-white font-medium'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${theme.iconColor}`} />
                        <div className="truncate">
                          <div className="font-medium leading-none mb-0.5">{opt.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{opt.tagline}</div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onNavigateToSource && attachment && (
            <button
              type="button"
              data-testid="tutor-jump-source-btn"
              onClick={() => onNavigateToSource(attachment.pageNumber)}
              title={`Jump to page ${attachment.pageNumber}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <FileText className="w-3 h-3 text-slate-400" />
              <span>p. {attachment.pageNumber}</span>
            </button>
          )}

          {turns.length > 0 && (
            <button
              type="button"
              data-testid="tutor-new-thread-btn"
              title="Start a new conversation"
              onClick={startNewThread}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
          )}

          {archivedThreads.length > 0 && (
            <div className="relative" ref={historyRef}>
              <button
                type="button"
                data-testid="tutor-history-btn"
                title={`View conversation history (${archivedThreads.length} previous)`}
                onClick={() => setIsHistoryOpen(p => !p)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-0.5"
              >
                <History className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold text-indigo-300">{archivedThreads.length}</span>
              </button>

              {isHistoryOpen && (
                <div
                  data-testid="tutor-history-dropdown"
                  className="absolute right-0 top-full mt-1.5 z-50 w-64 p-1.5 rounded-xl border shadow-2xl backdrop-blur-xl animate-in fade-in duration-150"
                  style={{
                    backgroundColor: tokens.cardBg || '#0f172a',
                    borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.15)',
                  }}
                >
                  <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Previous Conversations
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {archivedThreads.map((th, idx) => {
                      const firstUser = th.turns.find(t => t.role === 'user');
                      const preview = firstUser?.content || 'Previous conversation';
                      return (
                        <button
                          key={th.id}
                          type="button"
                          data-testid={`tutor-restore-thread-${idx}`}
                          onClick={() => {
                            restoreArchivedThread(th.id);
                            setIsHistoryOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/10 text-slate-200 transition-colors flex flex-col gap-0.5"
                        >
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-semibold uppercase text-indigo-400">{th.mode}</span>
                                <span>{new Date(th.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div className="truncate text-slate-300 text-[11px]">{preview}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

          {turns.length > 0 && (
            <button
              type="button"
              data-testid="tutor-reset-conv-btn"
              title="Clear conversation history"
              onClick={reset}
              className="p-1.5 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            data-testid="tutor-reset-layout-btn"
            aria-label="Reset Tutor layout"
            title="Reset Tutor layout. The conversation stays."
            onClick={handleResetLayout}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="contextual-tutor-minimize-btn"
            aria-label="Minimize Contextual Tutor"
            onClick={handleMinimize}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>

          {embedded && isSide && !columnLayout && (
            <button
              type="button"
              data-testid="tutor-side-swap"
              aria-label={visual === 'side-right' ? 'Move Tutor to the left' : 'Move Tutor to the right'}
              onClick={() => switchToSide(visual === 'side-right' ? 'side-left' : 'side-right')}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              {visual === 'side-right' ? <PanelLeft className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            </button>
          )}

          {embedded && !isFloating && !isSide && sideDockFits(containerWidth) && (
            <button
              type="button"
              data-testid="tutor-dock-side"
              aria-label="Open Tutor on the right"
              onClick={() => switchToSide('side-right')}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <PanelRight className="w-4 h-4" />
            </button>
          )}

          {embedded && !isFloating && (
            <>
              {isSide && (
                <button
                  type="button"
                  data-testid="tutor-side-expand-top"
                  aria-label="Expand Tutor at the top"
                  onClick={expandDock}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              )}
              {quickAskOpen ? (
                <button
                  type="button"
                  data-testid="tutor-dock-restore"
                  aria-label="Restore Tutor"
                  title="Restore Tutor"
                  onClick={restoreSavedExpandedHeight}
                  className="shrink-0 rounded-lg border px-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
                  style={{ minHeight: 32, borderColor: 'rgba(255,255,255,0.16)' }}
                >
                  Restore Tutor
                </button>
              ) : null}
              <button
                type="button"
                data-testid="tutor-dock-collapse"
                aria-label={isSide ? 'Use compact top dock' : 'Collapse Tutor'}
                aria-expanded
                onClick={() => {
                  if (isSide) commitLayout({ placement: 'top-dock', topDockExpanded: false });
                  else if (quickAskOpen) dismissQuickAsk();
                  else collapseDock();
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="tutor-dock-float"
                aria-label="Float Tutor"
                onClick={switchToFloating}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </>
          )}

          {embedded && isFloating && (
            <button
              type="button"
              data-testid="tutor-float-dock"
              aria-label="Dock Tutor"
              onClick={switchToDock}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            data-testid="contextual-tutor-close-btn"
            aria-label={embedded ? (isFloating ? 'Dock Tutor' : isSide ? 'Use compact top dock' : 'Collapse Tutor') : 'Close Contextual Tutor'}
            onClick={() => {
              if (!embedded) onClose();
              else if (isSide) commitLayout({ placement: 'top-dock', topDockExpanded: false });
              else if (isFloating) switchToDock();
              else if (quickAskOpen) dismissQuickAsk();
              else collapseDock();
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <TutorContextRow
        pdfTitle={pdfTitle}
        visiblePage={visiblePage}
        attachment={attachment}
        attached={attachmentAttached}
        onToggleAttached={() => setAttachmentAttached(!attachmentAttached)}
      />

      {/* Main Conversation Stream or Pre-submission Composer */}
      {turns.length === 0 ? (
        /* Unsubmitted initial state: 4-mode selector, draft editing, and manual Send */
        <div className="flex-1 flex flex-col p-4 space-y-3 overflow-y-auto min-h-0">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              Choose Teaching Mode:
            </label>
            <div className={`grid ${isFloating ? (size.width < 420 ? 'grid-cols-2' : 'grid-cols-4') : isSide || isNarrow ? 'grid-cols-2' : 'grid-cols-4'} gap-1.5`}>
              {TEACHING_MODE_OPTIONS.map(opt => {
                const theme = getModeTheme(opt.mode);
                const Icon = theme.Icon;
                const isSelected = mode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    data-testid={`tutor-mode-${opt.mode}`}
                    onClick={() => handleModeChange(opt.mode)}
                    title={opt.description}
                    className={`py-1.5 px-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? theme.activeBtnBg
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${theme.iconColor}`} />
                    <span className="truncate">{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSendInitial} className="flex-1 flex flex-col space-y-2">
            <label className="text-[11px] font-semibold text-slate-400 block">
              Question for ZIKUK:
            </label>
            <textarea
              data-testid="tutor-initial-question-input"
              value={initialDraft}
              onChange={e => setInitialDraft(e.target.value)}
              disabled={status === 'loading'}
              rows={4}
              className="flex-1 w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors resize-none leading-relaxed disabled:opacity-50"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                data-testid="tutor-submit-initial-btn"
                disabled={!initialDraft.trim() || status === 'loading'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shadow-md active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Ask ZIKUK</span>
              </button>
            </div>
          </form>

          {status === 'loading' && (
            <div data-testid="tutor-loading-state" className="flex items-center gap-2 py-3 text-xs text-slate-400 animate-pulse">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
              <span>Consulting course knowledge...</span>
            </div>
          )}

          {status === 'error' && (
            <div
              data-testid="tutor-error-banner"
              className="flex items-center justify-between p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200"
            >
              <span>{errorMessage || 'Failed to get answer.'}</span>
              {showTutorRetry ? (
                <button
                  type="button"
                  data-testid="tutor-retry-btn"
                  onClick={retry}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 font-medium text-red-100 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        /* Conversation view with turns and follow-up composer */
        <>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            data-testid="tutor-turns-container"
            className={`flex-1 overflow-y-auto px-4 py-3 space-y-4 ${isFloating ? 'min-h-[140px]' : 'min-h-0'}`}
          >
            {turns.map((turn, index) => {
              const latest = index === turns.length - 1;
              if (turn.role === 'user') {
                return (
                  <div key={turn.id} data-latest-turn={latest ? '1' : undefined} className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 rounded-xl text-xs bg-indigo-600/30 border border-indigo-500/30 text-indigo-100">
                      {turn.content}
                    </div>
                  </div>
                );
              }

              const turnMode = turn.mode;
              const isLatestTurn = index === turns.length - 1;
              return (
                <div
                  key={turn.id}
                  ref={isLatestTurn ? latestAssistantTurnRef : null}
                  data-latest-turn={isLatestTurn ? '1' : undefined}
                  data-testid="tutor-assistant-turn"
                  className="space-y-1.5 text-xs leading-relaxed text-slate-100"
                >
                  {turnMode && (
                    <div className="flex items-center gap-1.5 mb-1" data-testid="tutor-turn-mode-badge">
                      <TeachingModeBadge mode={turnMode} size="xs" />
                    </div>
                  )}
                  <AskZikukAnswer
                    text={presentAnswerTextForProvenance(turn.content, turn.knowledgeTier)}
                    sources={
                      turn.knowledgeTier === 'general_academic' || turn.knowledgeTier === 'pdf_selection'
                        ? []
                        : turn.sources || []
                    }
                    textColor={tokens.textPrimary}
                    mutedColor={tokens.textSecondary}
                    accentColor="#818cf8"
                    onCitationActivate={handleCitationActivate}
                    generationIncomplete={turn.generationIncomplete}
                  />
                  {turn.knowledgeTier ? (
                    <KnowledgeProvenanceBadge
                      tier={turn.knowledgeTier}
                      contextAvailable={turn.contextAvailable}
                      color={tokens.textSecondary}
                      borderColor={tokens.cardBorder || 'rgba(255,255,255,0.15)'}
                    />
                  ) : null}
                </div>
              );
            })}

            {status === 'loading' && (
              <div data-testid="tutor-loading-state" className="flex items-center gap-2 py-2 text-xs text-slate-400 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}

            {status === 'error' && (
              <div
                data-testid="tutor-error-banner"
                className="flex items-center justify-between p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200"
              >
                <span>{errorMessage || 'Failed to get answer.'}</span>
                {showTutorRetry ? (
                  <button
                    type="button"
                    data-testid="tutor-retry-btn"
                    onClick={retry}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 font-medium text-red-100 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* Follow-up Composer */}
          <div
            className="p-3 border-t rounded-b-2xl shrink-0 space-y-2"
            style={{
              borderColor: tokens.cardBorder || 'rgba(255, 255, 255, 0.1)',
              background: 'rgba(0, 0, 0, 0.25)',
            }}
          >
            {/* Follow-up Mode Bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span>Mode:</span>
                <button
                  type="button"
                  data-testid="tutor-followup-mode-trigger"
                  onClick={() => setIsModeDropdownOpen(prev => !prev)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all hover:brightness-110 ${activeModeTheme.badgeBg}`}
                >
                  <ActiveIcon className={`w-2.5 h-2.5 ${activeModeTheme.iconColor}`} />
                  <span>{activeModeOption.label}</span>
                  <ChevronDown className="w-2 h-2 opacity-70" />
                </button>
              </span>
              <span className="text-[10px] text-slate-500">
                Switch mode anytime
              </span>
            </div>

            <form
              onSubmit={handleSendFollowUp}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                data-testid="tutor-followup-input"
                placeholder={`Ask follow-up or next question in ${activeModeOption.label} mode...`}
                value={followUpDraft}
                onChange={e => setFollowUpDraft(e.target.value)}
                disabled={status === 'loading'}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                data-testid="tutor-followup-send-btn"
                aria-label="Send follow-up"
                disabled={!followUpDraft.trim() || status === 'loading'}
                className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors active:scale-95"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </>
      )}

      {isFloating ? (
        <div
          data-testid="contextual-tutor-resize-handle"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center select-none"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        >
          <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white/40 mr-1 mb-1" />
        </div>
      ) : isSide ? null : (
        <div
          data-testid="tutor-dock-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Tutor dock"
          aria-valuemin={160}
          aria-valuemax={480}
          aria-valuenow={Math.round(dockHeight)}
          tabIndex={0}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
          onPointerDown={handleDockResizePointerDown}
          onPointerMove={handleDockResizePointerMove}
          onPointerUp={handleDockResizePointerUp}
          onKeyDown={handleDockResizeKeyDown}
        />
      )}
    </div>
  );
}
