import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { useRecentWorkspaces } from '../hooks/useRecentWorkspaces';
import { useFocusMode } from '../hooks/useFocusMode';
import { useWorkspaceContinuity } from '../hooks/useWorkspaceContinuity';
import { useCommandPalette } from '../command/CommandPaletteContext';
import type { AIWorkspaceHandlers } from '../command/aiWorkspaceHandlersRef';
import { isQuickCaptureBlockedTarget } from '../command/isBlockedTarget';
import { buildWorkspaceStarterPack } from '../workspaceStarter/buildWorkspaceStarterPack';
import { buildExploreFocusPack } from '../workspaceStarter/buildExploreFocusPack';
import { MissionControlView } from '../components/mission-control/MissionControlView';
import {
  EXPLORE_FOCUS_SCENE_CENTER,
  isExploreFocusWorkspace,
} from '../lib/exploreFocus';
import { FloatingWorkspaceShell } from '../components/workspace-shell/FloatingWorkspaceShell';
import { MathZone } from '../components/math-zone/MathZone';
import { WORKSPACE_SHELL_TOP_INSET } from '../components/workspace-shell/shellGlass';
import { ExploreFocusGuide } from '../components/explore-focus/ExploreFocusGuide';
import { isStabilityFeatureDisabled } from '../lib/stabilityBaseline';
import { clearPwaCachesAndReload } from '../lib/pwaRecovery';
import type { WorkspaceStarterId } from '../workspaceStarter/workspaceStarterTypes';
import { starterDismissStorageKey, WORKSPACE_STARTER_LABEL } from '../workspaceStarter/workspaceStarterTypes';
import { WorkspaceStarterOverlay } from '../components/workspace-starter/WorkspaceStarterOverlay';
import { WorkspaceStarterDock } from '../components/workspace-starter/WorkspaceStarterDock';
import {
  markFirstWorkspaceEntryDone,
  unlockAdvancedLibraryNav,
} from '../lib/firstSessionPrefs';
import { pickStudyLinkTargets } from '../lib/studyConnections';
import { WorkspaceAppearancePanel } from '../components/workspace-appearance/WorkspaceAppearancePanel';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSectionDetail } from '../hooks/useSections';
import { resolveSectionViewModeOnOpen } from '../lib/mathSurfaceRouter';
import {
  loadWorkspaceContinuityMemory,
  type WorkspaceContinuitySuggestion,
} from '../lib/workspaceContinuity';
import { shouldRestoreFocusLens } from '../lib/reEntryPolicy';
import { WorkspaceResumeLayer } from '../components/workspace-guidance/WorkspaceResumeLayer';
import { surfaceShellStyle } from '../lib/surfaceShellStyle';
import { flickerDebugCount, flickerDebugLog } from '../lib/flickerDebug';
import {
  LIBRARY_ROUTE,
  UNIVERSE_ROUTE,
  type WorkspaceNavigationState,
} from '../lib/workspaceUniverse/types';
import { pruneStaleSectionReferences } from '../lib/persistenceHealth';
import {
  consumePendingNotebookFocus,
  type PendingNotebookFocus,
} from '../lib/notebookSearchIndex';
import { panViewportToBlock } from '../lib/notebookCanvasFocus';
import { flushAllHandwritingForObject } from '../lib/handwritingFlushRegistry';
import { pulsePerformancePressure, usePerformanceCalm } from '../lib/performanceSafeMode';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { useWorkspaceCustomization, WorkspaceCustomization } from '../hooks/useWorkspaceCustomization';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { mergeAccent, useWorkspaceTheme } from '../hooks/useWorkspaceTheme';
import { useLivingEnvironment } from '../hooks/useLivingEnvironment';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useSectionCanvasMode } from '../hooks/useSectionCanvasMode';
import { useSectionBlockPositions } from '../hooks/useSectionBlockPositions';
import {
  useSectionFreeSpaceObjects,
  type ProjectObjectType,
  type ProjectObjectContent,
  type UniversalObjectSplitSide,
  type UniversalObjectViewMode,
  ensureProjectObjectContent,
  coerceFreeSpaceConnectionIds,
} from '../hooks/useSectionFreeSpaceObjects';
import { useSectionFreeSpaceBoards } from '../hooks/useSectionFreeSpaceBoards';
import { GroupComponent } from '../components/GroupComponent';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { CourseHub } from '../components/CourseHub';
import { CustomizeModal } from '../components/CustomizeModal';
import { DesignModeBar } from '../components/DesignModeBar';
import { FreeformCanvas } from '../components/canvas/FreeformCanvas';
import {
  computeFreeSpaceTemplateLayout,
  type FreeSpaceTemplateId,
} from '../lib/sectionFreeSpaceLayoutTemplates';
import {
  computeArrangeByGoalLayout,
  computeAutoArrangeLayout,
  computeAutoArrangeSelectedLayout,
  type ArrangeGoalId,
} from '../lib/freeSpaceAutoArrange';
import {
  installFwFreeSpaceDevTools,
  setFwFreeSpaceDevSectionContext,
} from '../lib/freeSpacePersistence';
import { FreeSpaceCanvasErrorBoundary } from '../components/canvas/FreeSpaceCanvasErrorBoundary';
import { ProjectSpaceObjectRenderer } from '../components/project-space/ProjectSpaceObjectRenderer';
import { StudyLayoutDockPortal } from '../components/project-space/StudyLayoutDockPortal';
import { StudySessionShell } from '../components/project-space/StudySessionShell';
import { StudySessionPickWork } from '../components/project-space/StudySessionPickWork';
import { UniversalObjectViewPortal } from '../components/project-space/UniversalObjectViewPortal';
import { StudyContinueBanner } from '../components/workspace-guidance/StudyContinueBanner';
import { CourseEntryStrip } from '../components/course-entry/CourseEntryStrip';
import { isCourseEntryBehaviorV1Enabled } from '../lib/courseEntry/featureFlag';
import { resolveCourseEntry } from '../lib/courseEntry/resolveCourseEntry';
import {
  isStudyLayoutDocked,
  sanitizeStudyLayout,
  type StudyLayoutMode,
} from '../lib/mathDesk/studyLayout';
import { useStudySessionPrimary } from '../lib/studySession/featureFlags';
import {
  getMostRecentSession,
  loadStudySession,
  saveStudySession,
  touchStudySession,
} from '../lib/studySession/persistence';
import { resolveStudyPair } from '../lib/studySession/resolveStudyPair';
import {
  applyPdfPageRestore,
  buildRestorePayload,
} from '../lib/studySession/sessionRestore';
import type { StudySessionRecord } from '../lib/studySession/types';
import type { StudyPaneFocus } from '../lib/studySession/computeSessionChrome';
import {
  formatLastStudied,
  formatPageLabel,
} from '../lib/studySession/formatStudySessionStatus';
import { STUDY_SESSION_PDF_FIT_WIDTH_ZOOM } from '../components/project-space/FreeSpacePdfCard';
import type { StudyExamPdfControls } from '../lib/studySession/examPdfControls';
import type { PdfStudyMarksChrome } from '../lib/pdfStudyMarks/usePdfStudyMarks';
import {
  EXAM_QUESTION_SEED_BODY,
  parseExamQuestionsFromBody,
} from '../lib/studySession/parseExamQuestions';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';
import { CompanionComposerModal } from '../components/project-space/CompanionComposerModal';
import { QuickCaptureOverlay } from '../components/quick-capture/QuickCaptureOverlay';
import { LearningAttemptOverlay } from '../components/project-space/LearningAttemptOverlay';
import { CourseTrapPrototypeOverlay } from '../components/course-trap/CourseTrapPrototypeOverlay';
import {
  isCourseTrapAutoSurfaceEnabled,
  isCourseTrapPrototypeEnabled,
} from '../lib/courseTrap/courseTrapPrototypeConfig';
import { isMathZoneDestinationEnabled } from '../lib/mathZoneDestinationConfig';
import { normalizeSectionViewMode, saveSectionViewMode } from '../lib/sectionViewMode';
import {
  detectCourseTrapSubject,
  type CourseTrapSubject,
} from '../lib/courseTrap/detectCourseTrapSubject';
import { buildMistakeReviewQueueFiltered } from '../lib/mistakeIntelligence';
import {
  applyAttemptFail,
  applyRepairSaved,
  buildLearningLoopQueue,
  learningTargetFromObject,
  resolveAttemptPrompt,
  type LearningAttemptTarget,
  type MistakeLearningBody,
} from '../lib/learningLoop';
import { isAcceptablePdfFile, savePdfBlob } from '../lib/freeSpacePdfIdb';
import {
  fitImageFrame,
  isAcceptableImageFile,
  readImageDimensions,
  saveImageBlob,
} from '../lib/freeSpaceImageIdb';
import {
  dropPlacementDebugEnabled,
  logDropSpawn,
  scheduleDropRenderCheck,
} from '../lib/dropPlacementDebug';
import { extractPdfSpatialData } from '../lib/pdfIngestion';
import { aiComplete } from '../lib/ai/client';
import type { ChatMessage } from '../lib/ai/types';
import {
  promptSummarizeNote,
  promptExplainMistakeSimple,
  promptPracticeQuestions,
  promptRephraseConcept,
  promptSuggestRelatedMistakes,
} from '../lib/ai/prompts';
import { AIAssistanceResultModal } from '../components/ai/AIAssistanceResultModal';
import type { GroupWithItems } from '../types';
import {
  Loader2, CheckCircle2, Circle, ArrowRight, Plus, X, Calendar,
  AlertTriangle, PlayCircle, ChevronDown, ChevronRight,
  FileText,
  BookOpen,
  FileUp,
  ListChecks,
  Brain,
  RotateCcw,
  MessageCircle,
  Calculator,
  LineChart,
  Link2,
  Image,
} from 'lucide-react';
import { MATH_ZONE_SEED_BODY, MATH_ZONE_SOLUTION_SEED } from '../lib/mathNotebookSeed';
import toast from 'react-hot-toast';
import { Item, ItemType, SectionWithProgress, Deadline } from '../types';
import { loadSession, saveSession, pickTasks, pickPortals } from '../utils/sessionPlan';
import type { CompanionPanelContentFields } from '../lib/companionPanels';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEffort(item: Item): string {
  if (item.type === 'file') return 'Long';
  if (item.type === 'link') return 'Quick';
  if (item.type === 'note') return 'Medium';
  const words = item.title.trim().split(/\s+/).length;
  return words >= 8 ? 'Long' : words >= 4 ? 'Medium' : 'Quick';
}



function formatExamDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysUntil(d: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

function deadlineDiff(due: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(due + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

// ── Space age ────────────────────────────────────────────────────────────────
// A quiet ambient signal: how long has this space existed?
// Not a KPI — just a sense of the space having history.
function spaceAge(createdAt: string): string {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 1)   return '';           // too new, say nothing
  if (days < 7)   return `${Math.floor(days)}d`;
  if (days < 60)  return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

const URGENCY_ORDER = { overdue: 0, urgent: 1, soon: 2, far: 3 } as const;
type UrgencyLevel = keyof typeof URGENCY_ORDER;

function deadlineUrgencyLevel(d: Deadline): UrgencyLevel {
  if (d.completed) return 'far';
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)  return 'overdue';
  if (diff < 3)  return 'urgent';
  if (diff <= 7) return 'soon';
  return 'far';
}

function formatDueDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function urgencyDot(d: Deadline): string {
  if (d.completed) return '#263043';
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)   return '#4b5563';
  if (diff <= 1)  return '#ef4444';
  if (diff < 3)   return '#ef4444';
  if (diff <= 7)  return '#f59e0b';
  return '#374151';
}
function urgencyLabel(d: Deadline): { text: string; color: string } {
  if (d.completed) return { text: '', color: '' };
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)   return { text: `${Math.abs(diff)}d overdue`, color: '#4b5563' };
  if (diff === 0) return { text: 'Today',                       color: '#ef4444' };
  if (diff === 1) return { text: 'Tomorrow',                    color: '#f59e0b' };
  if (diff < 3)   return { text: `${diff} days`,                color: '#ef4444' };
  if (diff <= 7)  return { text: `${diff} days`,                color: '#f59e0b' };
  return               { text: `${diff}d`,                  color: '#374151' };
}

const PLAN_PRIORITY = ['Exercises', 'Exams', 'Slides'] as const;



type FreeSpacePaletteItemId =
  | ProjectObjectType
  | 'recall'
  | 'tutor'
  | 'quick-review'
  | 'math-notebook'
  | 'math-setup';

type FreeSpacePaletteGroup = {
  label: string;
  items: Array<{
    id: FreeSpacePaletteItemId;
    title: string;
    description: string;
    icon: React.ReactNode;
  }>;
};


function FreeSpaceToolPalette({
  tokens,
  onClose,
  onPick,
}: {
  tokens: ReturnType<typeof useAtmosphere>['tokens'];
  onClose: () => void;
  onPick: (id: FreeSpacePaletteItemId) => void;
}) {
  const groups: FreeSpacePaletteGroup[] = [
    {
      label: 'Core',
      items: [
        { id: 'note', title: 'Note', description: 'Capture a quick idea or summary.', icon: <FileText className="w-4 h-4" /> },
        { id: 'notebook', title: 'Notebook', description: 'A larger writing surface for study.', icon: <BookOpen className="w-4 h-4" /> },
        { id: 'math-notebook', title: 'Math notebook', description: 'Formulas, steps, and derivations — math lives in notebooks.', icon: <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: 'inherit' }}>∑</span> },
        { id: 'pdf', title: 'PDF / Source', description: 'Add source material to read beside notes.', icon: <FileUp className="w-4 h-4" /> },
        { id: 'checklist', title: 'Checklist', description: 'Break work into small steps.', icon: <ListChecks className="w-4 h-4" /> },
      ],
    },
    {
      label: 'Study',
      items: [
        { id: 'mistake', title: 'Mistake', description: 'Track slips and corrections.', icon: <AlertTriangle className="w-4 h-4" /> },
        { id: 'recall', title: 'Flashcard / Recall', description: 'Create a prompt to review later.', icon: <Brain className="w-4 h-4" /> },
        { id: 'tutor', title: 'Tutor', description: 'Open a companion tutor panel.', icon: <MessageCircle className="w-4 h-4" /> },
        { id: 'quick-review', title: 'Quick Review', description: 'Review mistakes and recall cards.', icon: <RotateCcw className="w-4 h-4" /> },
        { id: 'math-setup', title: 'Problem layout', description: 'Problem card + derivation + scratch notebooks on the canvas.', icon: <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: 'inherit' }}>⊞</span> },
      ],
    },
    {
      label: 'Tools',
      items: [
        { id: 'calculator', title: 'Calculator', description: 'Use a math scratchpad.', icon: <Calculator className="w-4 h-4" /> },
        { id: 'graph', title: 'Graph', description: 'Plot and inspect an equation.', icon: <LineChart className="w-4 h-4" /> },
        { id: 'link', title: 'Link', description: 'Save a reference URL.', icon: <Link2 className="w-4 h-4" /> },
        { id: 'image', title: 'Image', description: 'Place a visual reference.', icon: <Image className="w-4 h-4" /> },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-label="Add Free Space object"
      style={{
        position: 'fixed',
        top: 88,
        right: 20,
        zIndex: 70,
        width: 'min(760px, calc(100vw - 40px))',
        maxHeight: 'calc(100dvh - 124px)',
        overflowY: 'auto',
        borderRadius: 24,
        border: `1px solid ${tokens.cardBorderHover}`,
        background: `linear-gradient(145deg, ${tokens.cardBg}fb, ${tokens.pageBg}f2)`,
        backdropFilter: 'blur(28px) saturate(1.55)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.55)',
        boxShadow: `0 34px 110px rgba(0,0,0,0.64), 0 0 0 1px ${tokens.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <p style={{ margin: '0 0 5px', color: tokens.accent, fontSize: 10, fontWeight: 850, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Add to Free Space
          </p>
          <h2 style={{ margin: 0, color: tokens.textPrimary, fontSize: 22, fontWeight: 850, letterSpacing: '-0.035em', lineHeight: 1.12 }}>
            Choose a study object or tool.
          </h2>
          <p style={{ margin: '7px 0 0', color: tokens.textSecondary, fontSize: 13, lineHeight: 1.48, maxWidth: 520 }}>
            PDF → notebook → mistakes → review. Everything connects on one spatial desk.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add menu"
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            border: `1px solid ${tokens.cardBorder}`,
            background: 'rgba(255,255,255,0.035)',
            color: tokens.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {groups.map(group => (
          <section key={group.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
              <span style={{ color: tokens.textGhost, fontSize: 10, fontWeight: 850, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                {group.label}
              </span>
              <span style={{ height: 1, flex: 1, background: tokens.cardBorder }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(156px, 1fr))', gap: 8 }}>
              {group.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item.id)}
                  style={{
                    minHeight: 92,
                    padding: 12,
                    borderRadius: 16,
                    border: `1px solid ${tokens.cardBorder}`,
                    background: `linear-gradient(180deg, ${tokens.wellBg}f2, rgba(255,255,255,0.018))`,
                    color: tokens.textPrimary,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    transition: 'transform 150ms ease, border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.borderColor = `${tokens.accent}66`;
                    e.currentTarget.style.boxShadow = `0 10px 34px ${tokens.accentGlow}`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = tokens.cardBorder;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: 12, background: tokens.accentSubtle, color: tokens.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.icon}
                  </span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, letterSpacing: '-0.012em' }}>{item.title}</span>
                  <span style={{ display: 'block', color: tokens.textMuted, fontSize: 11.5, lineHeight: 1.35 }}>{item.description}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p style={{ margin: '14px 2px 0', color: tokens.textGhost, fontSize: 11, lineHeight: 1.4 }}>
        Press <kbd style={{ border: `1px solid ${tokens.cardBorder}`, borderRadius: 6, padding: '1px 6px', color: tokens.textMuted, background: tokens.wellBg }}>A</kbd> to add tools.
      </p>
    </div>
  );
}


function FreeSpaceEmptyGuidance({
  tokens,
  onAddPdf,
  onAddNote,
  onAskTutor,
}: {
  tokens: ReturnType<typeof useAtmosphere>['tokens'];
  onAddPdf: () => void;
  onAddNote: () => void;
  onAskTutor: () => void;
}) {
  const actions = [
    { label: 'Upload PDF', onClick: onAddPdf, icon: <FileUp className="w-3.5 h-3.5" /> },
    { label: 'Create Note', onClick: onAddNote, icon: <FileText className="w-3.5 h-3.5" /> },
    { label: 'Ask Tutor', onClick: onAskTutor, icon: <MessageCircle className="w-3.5 h-3.5" /> },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 'calc(50% - 120px)',
        transform: 'translate(-50%, -50%)',
        zIndex: 34,
        width: 'min(520px, calc(100vw - 48px))',
        borderRadius: 24,
        border: `1px solid ${tokens.cardBorder}`,
        background: `linear-gradient(145deg, ${tokens.cardBg}e8, ${tokens.pageBg}d8)`,
        backdropFilter: 'blur(22px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
        boxShadow: '0 24px 82px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.07)',
        padding: 18,
        pointerEvents: 'auto',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 5px', color: tokens.accent, fontSize: 10, fontWeight: 850, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        Workspace
      </p>
      <h2 style={{ margin: 0, color: tokens.textPrimary, fontSize: 20, fontWeight: 850, letterSpacing: '-0.03em' }}>
        Add a source, write in a notebook, capture mistakes.
      </h2>
      <p style={{ margin: '8px auto 15px', color: tokens.textSecondary, fontSize: 13, lineHeight: 1.5, maxWidth: 400 }}>
        Your main study flow: read the PDF, take notes beside it, link tools, review what you missed.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              minHeight: 40,
              padding: '0 12px',
              borderRadius: 12,
              border: `1px solid ${tokens.cardBorder}`,
              background: tokens.wellBg,
              color: tokens.textPrimary,
              fontSize: 12.5,
              fontWeight: 760,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: tokens.accent }}>{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
      <p style={{ margin: '13px 0 0', color: tokens.textGhost, fontSize: 11 }}>
        Press <kbd style={{ border: `1px solid ${tokens.cardBorder}`, borderRadius: 6, padding: '1px 6px', color: tokens.textMuted, background: tokens.wellBg }}>A</kbd> to add tools.
      </p>
    </div>
  );
}

// ── WorkItem ──────────────────────────────────────────────────────────────────

// Items accumulate temporal presence. Something sitting unfinished for weeks
// feels different from something you added this morning — not labeled, just subtly
// more tired. The space has memory.
function itemAge(createdAt: string): 'fresh' | 'settled' | 'lingering' | 'old' {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  if (days < 2)   return 'fresh';
  if (days < 7)   return 'settled';
  if (days < 21)  return 'lingering';
  return 'old';
}

function WorkItem({ item, onToggle, onDelete }: {
  item: Item;
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const age = item.completed ? 'fresh' : itemAge(item.created_at);

  // Temporal presence — older unfinished items recede slightly, like they've been
  // sitting in the same place for a while.
  const itemOpacity = item.completed ? 0.4
    : age === 'fresh'     ? 1.0
    : age === 'settled'   ? 0.92
    : age === 'lingering' ? 0.82
    : 0.70;

  // The toggle button takes on a faint amber warmth for lingering/old items —
  // a quiet signal that this has been waiting, without announcing it.
  const toggleColor = item.completed ? '#10b981'
    : age === 'lingering' ? '#6b5c3e'
    : age === 'old'       ? '#7c5e3a'
    : '#263043';

  const toggleHoverColor = item.completed ? '#10b981'
    : (age === 'lingering' || age === 'old') ? '#f59e0b'
    : '#374151';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '11px 0 9px', borderBottom: '1px solid rgba(255,255,255,0.022)', opacity: itemOpacity, transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1)' }}
    >
      <button
        onClick={() => onToggle(item.id, !item.completed).catch(() => toast.error('Failed'))}
        style={{ flexShrink: 0, color: toggleColor, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px', transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = toggleHoverColor; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = toggleColor; }}
      >
        {item.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
      </button>
      <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: item.completed ? '#374151' : '#e2e8f0', textDecoration: item.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.title}
      </span>
      {hovered && (
        <button
          onClick={() => onDelete(item.id).catch(() => toast.error('Failed'))}
          style={{ flexShrink: 0, color: '#263043', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── WorkCapture ───────────────────────────────────────────────────────────────

function WorkCapture({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setAdding(true);
    try { await onAdd(t); setValue(''); }
    catch { toast.error('Failed to add'); }
    finally { setAdding(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '13px 0 6px', marginTop: '2px' }}>
      <span style={{ flexShrink: 0, color: '#1e2a38', display: 'flex', padding: '2px', transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="capture a task…"
        style={{ flex: 1, fontSize: '13px', color: '#2a3a50', backgroundColor: 'transparent', border: 'none', outline: 'none', fontStyle: 'italic' }}
        onFocus={e => { (e.currentTarget as HTMLInputElement).style.color = '#64748b'; (e.currentTarget as HTMLInputElement).style.fontStyle = 'normal'; }}
        onBlur={e => { (e.currentTarget as HTMLInputElement).style.color = '#2a3a50'; (e.currentTarget as HTMLInputElement).style.fontStyle = 'italic'; }}
        onKeyDown={e => { if (e.key === 'Escape') { setValue(''); (e.currentTarget as HTMLInputElement).blur(); } }}
      />
      {value.trim() && (
        <button type="submit" disabled={adding} style={{ flexShrink: 0, fontSize: '11px', color: '#2a3a50', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', transition: 'color 0.25s cubic-bezier(0.4,0,0.2,1)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#2a3a50')}>
          ↵
        </button>
      )}
    </form>
  );
}

// ── AmbientDates ──────────────────────────────────────────────────────────────

function AmbientDates({ sectionId, sectionTitle }: { sectionId: string; sectionTitle: string }) {
  const { deadlines, addDeadline, toggleDeadline } = useDeadlines(sectionId);
  const [showAdd, setShowAdd] = useState(false);
  const sectionForModal = [{ id: sectionId, title: sectionTitle } as SectionWithProgress];

  const pending = [...deadlines]
    .filter(d => !d.completed)
    .sort((a, b) => {
      const au = URGENCY_ORDER[deadlineUrgencyLevel(a)];
      const bu = URGENCY_ORDER[deadlineUrgencyLevel(b)];
      return au !== bu ? au - bu : a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 6);

  const urgentCount = pending.filter(d => {
    const lvl = deadlineUrgencyLevel(d);
    return lvl === 'overdue' || lvl === 'urgent';
  }).length;

  return (
    <>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3d5068' }}>
              Dates
            </span>
            {urgentCount > 0 && (
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                {urgentCount}
              </span>
            )}
          </div>
          <button onClick={() => setShowAdd(true)} style={{ fontSize: '13px', lineHeight: 1, color: '#3d5068', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f59e0b'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#3d5068'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
            +
          </button>
        </div>

        {pending.length === 0 ? (
          <button onClick={() => setShowAdd(true)} style={{ fontSize: '12px', color: '#3d5068', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#3d5068')}>
            + Add a date
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {pending.map(d => {
              const lbl = urgencyLabel(d);
              const dot = urgencyDot(d);
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: dot, flexShrink: 0, marginTop: '5px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      {d.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#263043' }}>{formatDueDate(d.due_date)}</span>
                      {lbl.text && <span style={{ fontSize: '11px', color: lbl.color, fontWeight: 600 }}>· {lbl.text}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleDeadline(d.id, !d.completed).catch(() => {})}
                    style={{ flexShrink: 0, color: '#3d5068', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '6px' }}
                    title="Mark done"
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#10b981')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#3d5068')}>
                    <CheckCircle2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <AddDeadlineModal
          sections={sectionForModal}
          defaultSectionId={sectionId}
          onClose={() => setShowAdd(false)}
          onAdd={addDeadline}
        />
      )}
    </>
  );
}

// ── SectionPage ───────────────────────────────────────────────────────────────

export function SectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? null) as WorkspaceNavigationState | null;
  const workspaceBackLabel = navState?.returnTo === 'universe' ? 'Universe' : 'Library';

  const {
    section, loading, notFound, fetchError, fetchSection,
    addItem, pushItem, updateItem, deleteItem, toggleTask,
    addGroup, updateGroup, deleteGroup, setExamDate,
  } = useSectionDetail(id);
  const { touch: touchRecentWorkspace } = useRecentWorkspaces();

  useEffect(() => {
    if (section?.id) touchRecentWorkspace(section.id);
  }, [section?.id, touchRecentWorkspace]);

  const sectionId = id ?? '';

  useEffect(() => {
    if (!sectionId || loading || !notFound) return;
    pruneStaleSectionReferences(sectionId);
    toast.error('That workspace was not found or is no longer available.');
    navigate(LIBRARY_ROUTE, { replace: true });
  }, [loading, navigate, notFound, sectionId]);

  const { links: courseLinks } = usePortalLinks('course', id);
  const { links: globalLinks } = usePortalLinks('global');
  const { customization, setCustomization } = useWorkspaceCustomization(sectionId);
  const { tokens: atmTokens, atmosphereId, setAtmosphere } = useAtmosphere();
  const { design, global, updateGlobal } = useWorkspaceTheme();
  const tokens = useMemo(() => mergeAccent(atmTokens, design), [atmTokens, design]);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const sectionBoards = useSectionFreeSpaceBoards(sectionId);
  const sectionCanvas = useSectionCanvasMode(sectionId, sectionBoards.activeBoardId);
  const sectionCanvasRef = useRef(sectionCanvas);
  sectionCanvasRef.current = sectionCanvas;
  const sectionPositions = useSectionBlockPositions(sectionId, sectionBoards.activeBoardId);
  const sectionObjects = useSectionFreeSpaceObjects(sectionId, sectionBoards.activeBoardId);
  const sectionObjectsRef = useRef(sectionObjects);
  sectionObjectsRef.current = sectionObjects;
  const {
    registerFreeSpace,
    registerAIWorkspace,
    registerFocusMode,
    registerWorkspaceStarter,
    paletteOpen,
    sessionModalOpen,
    openPalette,
  } = useCommandPalette();
  const { focusMode, setFocusMode } = useFocusMode(sectionId);
  const focusModeLiveRef = useRef(focusMode);
  focusModeLiveRef.current = focusMode;

  const pendingFreeSpaceType = useRef<ProjectObjectType | null>(null);
  const pendingCompanionComposerRef = useRef(false);
  const pendingQuickCaptureRef = useRef<{ kind: 'note' | 'mistake'; text: string } | null>(null);
  const quickCaptureStackRef = useRef(0);

  const [showAddLane,     setShowAddLane]     = useState(false);
  const [newLaneTitle,    setNewLaneTitle]     = useState('');
  const [addingLane,      setAddingLane]       = useState(false);
  const [editingExamDate, setEditingExamDate]  = useState(false);
  const [showCustomize,   setShowCustomize]    = useState(false);
  const [sectionViewMode, setSectionViewModeState] = useState<'work-surface' | 'free-space' | 'math-zone'>(() => {
    if (navState?.firstArrival) return 'free-space';
    return sectionId
      ? resolveSectionViewModeOnOpen(sectionId, { forceFreeSpace: isCourseEntryBehaviorV1Enabled() })
      : 'free-space';
  });
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const studySessionPrimary = useStudySessionPrimary();
  const [activeStudySession, setActiveStudySession] = useState<StudySessionRecord | null>(null);
  const [studyPickWork, setStudyPickWork] = useState<{
    sourceId: string;
    candidates: ProjectSpaceObject[];
  } | null>(null);
  const [studyContinueDismissed, setStudyContinueDismissed] = useState(false);
  const [courseEntryDismissed, setCourseEntryDismissed] = useState(false);
  const [courseEntryWarmFallback, setCourseEntryWarmFallback] = useState(false);
  const [studyRestoreBlockId, setStudyRestoreBlockId] = useState<string | null>(null);
  const [activeQuestionNumber, setActiveQuestionNumber] = useState<number | null>(null);
  const [studyFocusQuestionNumber, setStudyFocusQuestionNumber] = useState<number | null>(null);
  const [studyFocusQuestionToken, setStudyFocusQuestionToken] = useState(0);
  const [studyPaneFocus, setStudyPaneFocus] = useState<StudyPaneFocus>('exam');
  const [studyPdfMarksChrome, setStudyPdfMarksChrome] = useState<PdfStudyMarksChrome | null>(null);
  const [studySplitRatio, setStudySplitRatio] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.75;
    const raw = window.localStorage.getItem('focus.studySession.splitRatio.v1');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.max(0.12, Math.min(0.88, n)) : 0.75;
  });
  const studySessionWorkPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studySessionPagePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reEntryRestoreAppliedRef = useRef<string | null>(null);
  const courseEntryWarmAppliedRef = useRef<string | null>(null);
  const courseEntryWarmWasPickRef = useRef(false);
  const courseEntryEnabled = isCourseEntryBehaviorV1Enabled();
  const setSectionViewMode = useCallback(
    (mode: 'work-surface' | 'free-space' | 'math-zone') => {
      const effective = normalizeSectionViewMode(mode);
      pulsePerformancePressure('view-switch');
      flickerDebugLog('view-mode', effective);
      setSectionViewModeState(effective);
      if (sectionId) saveSectionViewMode(sectionId, effective);
    },
    [sectionId],
  );
  const [showSpaceAdd, setShowSpaceAdd] = useState(false);
  const [companionComposerOpen, setCompanionComposerOpen] = useState(false);
  const [spaceSelectedId, setSpaceSelectedId] = useState<string | null>(null);
  const [spaceSelectedIds, setSpaceSelectedIds] = useState<string[]>([]);
  const spaceSelectedIdRef = useRef<string | null>(null);
  spaceSelectedIdRef.current = spaceSelectedId;
  const [notebookSearchPulseId, setNotebookSearchPulseId] = useState<string | null>(null);
  const pendingNotebookFocusRef = useRef<PendingNotebookFocus | null>(null);
  const [spaceEditingId, setSpaceEditingId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [connectHoverId, setConnectHoverId] = useState<string | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickCaptureVariant, setQuickCaptureVariant] = useState<'note' | 'mistake'>('note');
  const [learningAttemptOpen, setLearningAttemptOpen] = useState(false);
  const [learningAttemptTarget, setLearningAttemptTarget] = useState<LearningAttemptTarget | null>(null);
  const [learningAttemptQueue, setLearningAttemptQueue] = useState<string[]>([]);
  const [learningAttemptIndex, setLearningAttemptIndex] = useState(0);

  const closeLearningAttempt = useCallback(() => {
    setLearningAttemptOpen(false);
    setLearningAttemptTarget(null);
    setLearningAttemptQueue([]);
    setLearningAttemptIndex(0);
  }, []);
  const [courseTrapOpen, setCourseTrapOpen] = useState(false);
  const [courseTrapPdfId, setCourseTrapPdfId] = useState<string | null>(null);
  const [courseTrapSubject, setCourseTrapSubject] = useState<CourseTrapSubject | null>(null);
  const courseTrapAutoSurfacedRef = useRef<Set<string>>(new Set());
  const [starterDismissed, setStarterDismissed] = useState(false);
  const [starterExpanded, setStarterExpanded] = useState(false);
  const [starterDockVisible, setStarterDockVisible] = useState(false);
  const [starterRevealReady, setStarterRevealReady] = useState(false);
  const firstArrivalHandledRef = useRef(false);
  const studyOsDemoHandledRef = useRef(false);
  // Refs for reading navState / location inside effects without making them deps.
  // Both update every render so the effect body always sees the freshest values
  // without re-triggering the effect on every router state flush.
  const navStateRef = useRef(navState);
  navStateRef.current = navState;
  const locationRef = useRef(location);
  locationRef.current = location;
  const [starterHints, setStarterHints] = useState<string[] | null>(null);
  const [aiAssistResult, setAiAssistResult] = useState<{ title: string; body: string } | null>(null);
  const aiRunRef = useRef<AbortController | null>(null);
  // ── Design Mode state ─────────────────────────────────────────────────────
  const [designMode,      setDesignMode]      = useState(false);
  const [notebookControlsOpen, setNotebookControlsOpen] = useState(false);
  const designSnapshot = useRef<WorkspaceCustomization | null>(null);

  useEffect(() => {
    if (sectionViewMode !== 'math-zone') setNotebookControlsOpen(false);
  }, [sectionViewMode]);

  useEffect(() => {
    if (!sectionId) return;
    if (sectionViewMode === 'math-zone' && !isMathZoneDestinationEnabled()) {
      setSectionViewModeState('free-space');
      saveSectionViewMode(sectionId, 'free-space');
    }
  }, [sectionId, sectionViewMode]);

  const performanceCalm = usePerformanceCalm();
  const environmentFocusGlow = useMemo(() => {
    if (sectionViewMode !== 'free-space' || !spaceSelectedId) {
      return { focusGlowX: 50, focusGlowY: 48 };
    }
    const pos = sectionPositions.positions[spaceSelectedId];
    if (!pos) return { focusGlowX: 50, focusGlowY: 48 };
    const vpW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vpH = typeof window !== 'undefined' ? window.innerHeight - 44 : 800;
    const w = pos.w ?? 300;
    const h = pos.h ?? 220;
    const cx = (pos.x ?? 0) + w / 2;
    const cy = (pos.y ?? 0) + h / 2;
    const screenX = cx * sectionCanvas.zoom + sectionCanvas.panX;
    const screenY = cy * sectionCanvas.zoom + sectionCanvas.panY;
    const clampPct = (n: number) => Math.min(95, Math.max(5, n));
    return {
      focusGlowX: clampPct((screenX / vpW) * 100),
      focusGlowY: clampPct((screenY / vpH) * 100),
    };
  }, [
    sectionViewMode,
    spaceSelectedId,
    sectionPositions.positions,
    sectionCanvas.zoom,
    sectionCanvas.panX,
    sectionCanvas.panY,
  ]);
  const livingEnvironment = useLivingEnvironment(
    global,
    mergeAccent(atmTokens, design),
    {
      panX: sectionCanvas.panX,
      panY: sectionCanvas.panY,
      zoom: sectionCanvas.zoom,
      selectedId: spaceSelectedId,
      focusEditingId: spaceEditingId,
      focusMode: sectionViewMode === 'free-space' ? focusMode : null,
      calmEffects: performanceCalm,
      reduceMotion: prefersReducedMotion,
      surfaceActive: sectionViewMode === 'free-space',
      ...environmentFocusGlow,
    },
  );
  const freeSpaceTokens = useMemo(
    () => mergeAccent(livingEnvironment.studio.tokens, design),
    [livingEnvironment.studio.tokens, design],
  );
  const canvasBackgroundStyle = livingEnvironment.studio.canvasStyle;
  const freeSpaceClarity = livingEnvironment.clarity;
  const freeSpaceSurfaceVisible  = sectionViewMode === 'free-space';
  const mathZoneSurfaceVisible =
    sectionViewMode === 'math-zone' && isMathZoneDestinationEnabled();
  const workSurfaceVisible       = sectionViewMode === 'work-surface' && !designMode;
  const designSurfaceVisible     = sectionViewMode === 'work-surface' && designMode;


  useEffect(() => {
    flickerDebugCount('SectionPage');
  }, [id]);

  // Drag-and-drop for lane reorder (HTML5 drag API)
  const [dragId,     setDragId]     = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const {
    continuity,
    reEntryPolicy,
    resumeCopy,
    suggestions: continuitySuggestions,
    continuityObjectIds,
    continuityClusterIds,
    continuityEdgeKeys,
    restoreSelectionId,
    restoreViewport,
  } = useWorkspaceContinuity({
    sectionId,
    objects: sectionObjects.objects,
    positions: sectionPositions.positions,
    selectedId: spaceSelectedId,
    editingId: spaceEditingId,
    focusMode,
    zoom: sectionCanvas.zoom,
    panX: sectionCanvas.panX,
    panY: sectionCanvas.panY,
  });

  useEffect(() => {
    reEntryRestoreAppliedRef.current = null;
    setResumeDismissed(false);
    if (!sectionId || navStateRef.current?.firstArrival) return;
    const memory = loadWorkspaceContinuityMemory(sectionId);
    if (!shouldRestoreFocusLens(memory, focusMode)) {
      setFocusMode(null);
    } else if (memory?.activeFocusMode) {
      setFocusMode(memory.activeFocusMode);
    }
  }, [sectionId, setFocusMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    aiRunRef.current?.abort();
    aiRunRef.current = null;
    pendingFreeSpaceType.current = null;
    pendingCompanionComposerRef.current = false;
    pendingQuickCaptureRef.current = null;
    quickCaptureStackRef.current = 0;
    designSnapshot.current = null;
    dragIdRef.current = null;

    setShowAddLane(false);
    setNewLaneTitle('');
    setAddingLane(false);
    setEditingExamDate(false);
    setShowCustomize(false);
    setSectionViewModeState(
      sectionId
        ? resolveSectionViewModeOnOpen(sectionId, { forceFreeSpace: courseEntryEnabled })
        : 'work-surface',
    );
    setCourseEntryDismissed(false);
    setCourseEntryWarmFallback(false);
    courseEntryWarmAppliedRef.current = null;
    courseEntryWarmWasPickRef.current = false;
    setActiveStudySession(null);
    setStudyPickWork(null);
    setStudyRestoreBlockId(null);
    setShowSpaceAdd(false);
    setCompanionComposerOpen(false);
    setSpaceSelectedId(null);
    setSpaceEditingId(null);
    setConnectSourceId(null);
    setConnectHoverId(null);
    setQuickCaptureOpen(false);
    setQuickCaptureVariant('note');
    setLearningAttemptOpen(false);
    setLearningAttemptTarget(null);
    setLearningAttemptQueue([]);
    setLearningAttemptIndex(0);
    setStarterHints(null);
    setAiAssistResult(null);
    setDesignMode(false);
    setNotebookControlsOpen(false);
    setDragId(null);
    setDragOverId(null);
  }, [id]);

  useEffect(() => {
    if (!sectionId || !sectionObjects.objects.length) return;
    if (navStateRef.current?.firstArrival) return;
    if (reEntryRestoreAppliedRef.current === sectionId) return;
    reEntryRestoreAppliedRef.current = sectionId;

    const anchorId = restoreSelectionId;
    if (!anchorId) return;

    if (reEntryPolicy.restoreSelection) {
      setSpaceSelectedId(anchorId);
    }

    const canvas = sectionCanvasRef.current;
    const pos = sectionPositions.positions[anchorId];
    const vpW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vpH = typeof window !== 'undefined' ? Math.max(360, window.innerHeight - 112) : 720;

    if (reEntryPolicy.softViewport && pos) {
      const view = panViewportToBlock(pos, vpW, vpH, canvas.zoom);
      canvas.setViewport(view.zoom, view.panX, view.panY);
    } else if (reEntryPolicy.restoreViewport && restoreViewport) {
      canvas.setViewport(restoreViewport.zoom, restoreViewport.panX, restoreViewport.panY);
    }
  }, [
    sectionId,
    sectionObjects.objects.length,
    restoreSelectionId,
    restoreViewport,
    reEntryPolicy.restoreSelection,
    reEntryPolicy.restoreViewport,
    reEntryPolicy.softViewport,
    sectionPositions.positions,
  ]);

  const enterDesignMode = () => {
    designSnapshot.current = { ...customization };
    setDesignMode(true);
  };

  const exitDesignMode = () => setDesignMode(false);

  const resetDesign = () => {
    if (designSnapshot.current) setCustomization(designSnapshot.current);
    setDesignMode(false);
  };

  const toggleHideLane = (groupId: string) => {
    const hidden = customization.hiddenLanes ?? [];
    const next = hidden.includes(groupId)
      ? hidden.filter(id => id !== groupId)
      : [...hidden, groupId];
    setCustomization({ ...customization, hiddenLanes: next });
  };

  // Groups in user-defined order (Design Mode drag reorder)
  const orderedGroups: GroupWithItems[] = (() => {
    if (!section) return [];
    const all = section.groups;
    const order = customization.laneOrder ?? [];
    if (!order.length) return all;
    const known = order
      .map(gid => all.find(g => g.id === gid))
      .filter((g): g is GroupWithItems => !!g);
    const rest = all.filter(g => !order.includes(g.id));
    return [...known, ...rest];
  })();

  const handleDragStart = (_e: React.DragEvent, groupId: string) => {
    dragIdRef.current = groupId;
    setDragId(groupId);
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (groupId !== dragIdRef.current) setDragOverId(groupId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    if (!sourceId || sourceId === targetId) { handleDragEnd(); return; }
    const allIds = orderedGroups.map(g => g.id);
    const fromIdx = allIds.indexOf(sourceId);
    const toIdx   = allIds.indexOf(targetId);
    const newOrder = [...allIds];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceId);
    setCustomization({ ...customization, laneOrder: newOrder });
    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
    dragIdRef.current = null;
  };

  const activeSession        = loadSession();
  const sessionIsThisCourse  = activeSession?.sectionId === id;

  const handleStartSession = () => {
    if (!section) return;
    if (sessionIsThisCourse) { navigate('/session'); return; }
    const tasks   = pickTasks(section.groups);
    const portals = pickPortals(courseLinks, globalLinks);
    if (tasks.length === 0) {
      toast('No tasks found — add items to your To Do list first.');
      return;
    }
    saveSession({
      sectionId:    section.id,
      sectionTitle: section.title,
      taskIds:      tasks.map(t => t.item.id),
      portalIds:    portals.map(p => p.id),
      startedAt:    new Date().toISOString(),
    });
    navigate('/session');
  };

  const handleWorkCapture = async (title: string) => {
    if (!section) return;
    const exercisesGrp = section.groups.find(g => g.title === 'Exercises');
    let gid = exercisesGrp?.id;
    if (!gid) {
      gid = await addGroup('Exercises');
    }
    await addItem(gid, 'task', title);
  };

  const handleAddLane = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLaneTitle.trim()) return;
    setAddingLane(true);
    try {
      await addGroup(newLaneTitle.trim());
      toast.success('Lane created');
      setNewLaneTitle('');
      setShowAddLane(false);
    } catch {
      toast.error('Failed to create lane');
    } finally {
      setAddingLane(false);
    }
  };

  /** Must run before any early return — hooks order must be identical every render (React #310). */
  const applyArrangeResult = useCallback(
    (
      patches: Record<string, { x: number; y: number; w: number; h: number }> | null | undefined,
      stats?: { clusterCount: number; overlapsResolved: number; isolatedCount: number },
      withSummaryToast = false,
    ) => {
      if (!patches || Object.keys(patches).length === 0) return;
      sectionPositions.applyPositions(patches);
      if (withSummaryToast && stats) {
        toast.dismiss('fw-auto-arrange-summary');
        toast(
          `Workspace reorganized\n\n• ${stats.clusterCount} clusters identified\n• ${stats.overlapsResolved} overlaps resolved\n• ${stats.isolatedCount} isolated items detected`,
          {
            id: 'fw-auto-arrange-summary',
            duration: 4500,
            style: {
              whiteSpace: 'pre-line',
              fontSize: 12.5,
              lineHeight: 1.45,
              border: `1px solid ${tokens.cardBorder}`,
              background: tokens.cardBg,
              color: tokens.textPrimary,
            },
          },
        );
      }
    },
    [sectionPositions, tokens.cardBorder, tokens.cardBg, tokens.textPrimary],
  );

  /** Must run before any early return — hooks order must be identical every render (React #310). */
  const handleApplySpaceTemplate = useCallback(
    (templateId: FreeSpaceTemplateId) => {
      try {
        const patches = computeFreeSpaceTemplateLayout(
          templateId,
          sectionObjects.objects,
          sectionPositions.positions,
        );
        applyArrangeResult(patches);
      } catch (e) {
        console.error('[FreeSpace] template apply failed', e);
        toast.error('Could not apply layout. Try again.');
      }
    },
    [applyArrangeResult, sectionObjects.objects, sectionPositions.positions],
  );

  const handleAutoArrange = useCallback(() => {
    try {
      const result = computeAutoArrangeLayout(
        sectionObjects.objects,
        sectionPositions.positions,
      );
      applyArrangeResult(result.patches, result.stats, true);
    } catch (e) {
      console.error('[FreeSpace] auto arrange failed', e);
      toast.error('Could not auto arrange. Try again.');
    }
  }, [applyArrangeResult, sectionObjects.objects, sectionPositions.positions]);

  const handleArrangeSelected = useCallback(() => {
    try {
      if (spaceSelectedIds.length < 2) return;
      const result = computeAutoArrangeSelectedLayout(
        sectionObjects.objects,
        sectionPositions.positions,
        spaceSelectedIds,
      );
      applyArrangeResult(result.patches, result.stats, false);
    } catch (e) {
      console.error('[FreeSpace] selected arrange failed', e);
      toast.error('Could not arrange selection. Try again.');
    }
  }, [applyArrangeResult, sectionObjects.objects, sectionPositions.positions, spaceSelectedIds]);

  const handleArrangeByGoal = useCallback((goal: ArrangeGoalId) => {
    try {
      const result = computeArrangeByGoalLayout(
        goal,
        sectionObjects.objects,
        sectionPositions.positions,
      );
      applyArrangeResult(result.patches, result.stats, false);
    } catch (e) {
      console.error('[FreeSpace] goal arrange failed', e);
      toast.error('Could not apply goal layout. Try again.');
    }
  }, [applyArrangeResult, sectionObjects.objects, sectionPositions.positions]);

  const handleSpaceSelection = useCallback(
    (id: string | null, opts?: { toggle?: boolean }) => {
      if (!id) {
        setSpaceSelectedId(null);
        setSpaceSelectedIds([]);
        return;
      }
      if (opts?.toggle) {
        setSpaceSelectedIds((prev) => {
          const has = prev.includes(id);
          const next = has ? prev.filter((v) => v !== id) : [...prev, id];
          const primary = has ? (spaceSelectedId === id ? (next[next.length - 1] ?? null) : spaceSelectedId) : id;
          setSpaceSelectedId(primary);
          return next;
        });
        return;
      }
      setSpaceSelectedId(id);
      setSpaceSelectedIds([id]);
    },
    [spaceSelectedId],
  );

  const viewportCenterWorld = useCallback((offsetX = 0, offsetY = 0) => {
    const vpW  = window.innerWidth;
    const vpH  = window.innerHeight - 44;
    const snap = sectionCanvas.snapToGrid ? sectionCanvas.gridSize : 1;
    const raw  = {
      x: (-sectionCanvas.panX + vpW / 2) / sectionCanvas.zoom - 170 + offsetX,
      y: (-sectionCanvas.panY + vpH / 2) / sectionCanvas.zoom - 110 + offsetY,
    };
    return {
      x: Math.max(20, Math.round(raw.x / snap) * snap),
      y: Math.max(20, Math.round(raw.y / snap) * snap),
    };
  }, [sectionCanvas.panX, sectionCanvas.panY, sectionCanvas.zoom, sectionCanvas.snapToGrid, sectionCanvas.gridSize]);

  // Destructure ALL stable callbacks from the hook return objects so that
  // useCallback dep arrays never hold the unstable plain-object reference.
  const { addObject: addSpaceObject, addConnection: addSpaceConnection,
          addRecallItem, addQuickCaptureNote, addQuickCaptureMistake,
          updateObjectFields: updateSpaceObjectFields,
          updateObjectContent: updateSpaceObjectContent,
          getObject: getSpaceObject,
          convertNoteToMistake,
          clearConnectionsForObject,
          removeObject: removeSpaceObject } = sectionObjects;
  const { initPos, setPos: setSpacePos, positions: spacePositions, removePos, seedMissingPositions } = sectionPositions;
  const spacePositionsRef = useRef(spacePositions);
  spacePositionsRef.current = spacePositions;

  const focusNotebookOnCanvas = useCallback(
    (objectId: string) => {
      setSectionViewMode('free-space');
      seedMissingPositions([objectId]);
      const positions = spacePositionsRef.current;
      const canvas = sectionCanvasRef.current;
      let pos = positions[objectId];
      if (!pos) {
        initPos(objectId, { x: 120, y: 120, w: 520, h: 460 });
        pos = positions[objectId] ?? { x: 120, y: 120, w: 520, h: 460 };
      }
      const vpW = window.innerWidth;
      const vpH = Math.max(360, window.innerHeight - 112);
      const view = panViewportToBlock(pos, vpW, vpH, canvas.zoom);
      canvas.setViewport(view.zoom, view.panX, view.panY);
      setSpaceSelectedId(objectId);
      setNotebookSearchPulseId(objectId);
    },
    [setSectionViewMode, seedMissingPositions, initPos],
  );

  const handleResumeSuggestion = useCallback(
    (suggestion: WorkspaceContinuitySuggestion) => {
      setResumeDismissed(true);
      if (suggestion.learningAttempt && suggestion.objectId) {
        if (sectionViewMode !== 'free-space') setSectionViewMode('free-space');
        const obj = sectionObjectsRef.current.getObject(suggestion.objectId);
        const target = obj ? learningTargetFromObject(obj) : { kind: 'mistake' as const, objectId: suggestion.objectId };
        if (target) {
          setLearningAttemptTarget(target);
          setLearningAttemptQueue([]);
          setLearningAttemptIndex(0);
          setLearningAttemptOpen(true);
        }
        return;
      }
      if (suggestion.focusMode) setFocusMode(suggestion.focusMode);
      if (suggestion.objectId) {
        focusNotebookOnCanvas(suggestion.objectId);
        return;
      }
      if (suggestion.focusMode && !suggestion.objectId) {
        setSectionViewMode('free-space');
      }
    },
    [focusNotebookOnCanvas, setFocusMode, setSectionViewMode, sectionViewMode],
  );

  const openLearningAttemptForObject = useCallback(
    (objectId: string) => {
      if (activeStudySession && sectionId) {
        touchStudySession(sectionId, sectionBoards.activeBoardId, {
          sourceObjectId: activeStudySession.sourceObjectId,
          lastExitedAt: Date.now(),
        });
        setActiveStudySession(null);
        setStudyRestoreBlockId(null);
      }
      const obj = sectionObjectsRef.current.getObject(objectId);
      if (!obj) return;
      const target = learningTargetFromObject(obj);
      if (!target) return;
      if (sectionViewMode !== 'free-space') setSectionViewMode('free-space');
      closeLearningAttempt();
      setLearningAttemptTarget(target);
      setLearningAttemptOpen(true);
    },
    [
      activeStudySession,
      sectionId,
      sectionBoards.activeBoardId,
      sectionViewMode,
      setSectionViewMode,
      closeLearningAttempt,
    ],
  );

  const applyStudyLinksForObject = useCallback(
    (newObjectId: string, type: ProjectObjectType) => {
      const anchorId = spaceSelectedIdRef.current;
      const { connectTo, sourceObjectId } = pickStudyLinkTargets(
        anchorId,
        sectionObjectsRef.current.objects,
      );
      for (const tid of connectTo) {
        if (tid !== newObjectId) addSpaceConnection(newObjectId, tid);
      }
      if (type === 'mistake' && sourceObjectId) {
        const o = getSpaceObject(newObjectId);
        if (o?.type === 'mistake') {
          const c = ensureProjectObjectContent('mistake', o.content);
          if (c.type === 'mistake') {
            updateSpaceObjectContent(newObjectId, { ...c, sourceObjectId });
          }
        }
      }
    },
    [addSpaceConnection, getSpaceObject, updateSpaceObjectContent],
  );

  const handleAddToSpace = useCallback((type: ProjectObjectType) => {
    const obj = addSpaceObject(type);
    const base = viewportCenterWorld((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 60);
    const sizeHint =
      type === 'notebook'
        ? { w: 620, h: 520 }
        : type === 'companion'
          ? { w: 460, h: 320 }
        : type === 'image'
          ? { w: 460, h: 360 }
          : type === 'graph'
            ? { w: 400, h: 360 }
            : type === 'calculator'
              ? { w: 300, h: 420 }
              : type === 'mistake'
                ? { w: 380, h: 320 }
                : type === 'pdf'
                  ? { w: 520, h: 460 }
                  : { w: 360, h: 280 };
    initPos(obj.id, { x: base.x, y: base.y, ...sizeHint });
    applyStudyLinksForObject(obj.id, type);
    setSpaceSelectedId(obj.id);
    setShowSpaceAdd(false);
  }, [addSpaceObject, initPos, viewportCenterWorld, applyStudyLinksForObject]);

  /**
   * Create a Math Zone: three spatial zones forming a mathematical thinking surface.
   *
   * Layout (top → bottom on left column, scratch spans right):
   *
   *   ┌──────────────────────────────────────┐  ┌─────────────────────────┐
   *   │  # Problem  (compact, blank paper)   │  │                         │
   *   │  Write the question here.            │  │  scratch  (blank, right)│
   *   └──────────────────────────────────────┘  │                         │
   *                                              │  margin paper — for     │
   *   ┌──────────────────────────────────────┐  │  exploration, attempts, │
   *   │  ∑ Zone  (math-workspace, grid)      │  │  side calculations      │
   *   │  ① step  ② step  ③ step  ...        │  │                         │
   *   │                                      │  │                         │
   *   └──────────────────────────────────────┘  └─────────────────────────┘
   *
   * Zone roles:
   *   problem  — anchors the question; compact, read-only feel
   *   solution — primary derivation surface; step blocks, KaTeX, ∑ badge
   *   scratch  — exploration zone; blank, no chrome, no structure expected
   */
  const handleCreateMathZone = useCallback(() => {
    const base = viewportCenterWorld(0, 0);

    // Zone 1 — Problem anchor card
    // Small, compact, blank paper. Defines what is being solved.
    // Positioned at the top of the left column.
    const problem = addSpaceObject('notebook');
    initPos(problem.id, { x: base.x, y: base.y, w: 680, h: 180 });
    updateSpaceObjectContent(problem.id, {
      type: 'notebook',
      body: MATH_ZONE_SEED_BODY,
      paperStyle: 'blank',
      notebookSurface: 'spatial',
      notebookMode: 'normal',
    });

    // Zone 2 — Solution / derivation space
    // Primary working surface. Step blocks, KaTeX, ∑ Zone badge.
    // Positioned below the problem card with a 36px gap (180 + 36 = 216).
    // 36px reads as deliberate separation — two cognitive layers, not document sections.
    const solution = addSpaceObject('notebook');
    initPos(solution.id, { x: base.x, y: base.y + 216, w: 680, h: 520 });
    updateSpaceObjectContent(solution.id, {
      type: 'notebook',
      body: MATH_ZONE_SOLUTION_SEED,
      paperStyle: 'grid',
      notebookSurface: 'spatial',
      notebookMode: 'math-workspace',
      icon: '∑',
    });

    // Zone 3 — Scratch surface
    // Exploration zone: margin paper for attempts, side calculations, dead ends.
    // Starts at y+240: 24px below the derivation zone top (y+216).
    // Scratch belongs to the solving phase, not the problem-definition phase —
    // it must not span the problem card's vertical territory.
    // Height 480px < derivation 520px: subordinate in both width AND height.
    const scratch = addSpaceObject('notebook');
    initPos(scratch.id, { x: base.x + 720, y: base.y + 240, w: 360, h: 480 });
    updateSpaceObjectContent(scratch.id, {
      type: 'notebook',
      body: '',
      paperStyle: 'blank',
      notebookSurface: 'spatial',
      notebookMode: 'scratch',
    });

    setSpaceSelectedId(solution.id); // focus the derivation zone, not the problem card
    setShowSpaceAdd(false);
    toast.success('Problem layout — math lives in these notebooks');
  }, [addSpaceObject, initPos, viewportCenterWorld, updateSpaceObjectContent]);

  const handleCreateMathNotebook = useCallback(() => {
    const obj = addSpaceObject('notebook');
    const base = viewportCenterWorld(0, 0);
    initPos(obj.id, { x: base.x, y: base.y, w: 1040, h: 680 });
    updateSpaceObjectContent(obj.id, {
      type: 'notebook',
      body: '# Math\n\n',
      paperStyle: 'grid',
      notebookSurface: 'spatial',
      notebookMode: 'math',
      icon: '∑',
    });
    setSpaceSelectedId(obj.id);
    setShowSpaceAdd(false);
    toast.success('Math notebook — type / for formulas, => for steps');
  }, [addSpaceObject, initPos, viewportCenterWorld, updateSpaceObjectContent]);

  const handleAddRecallToSpace = useCallback(() => {
    const obj = addRecallItem('Recall prompt');
    const base = viewportCenterWorld((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 60);
    initPos(obj.id, { x: base.x, y: base.y, w: 380, h: 320 });
    setSpaceSelectedId(obj.id);
    setShowSpaceAdd(false);
  }, [addRecallItem, initPos, viewportCenterWorld]);

  const requestCompanionComposer = useCallback(() => {
    setShowSpaceAdd(false);
    if (sectionViewMode === 'free-space') {
      setCompanionComposerOpen(true);
      return;
    }
    pendingCompanionComposerRef.current = true;
    setSectionViewMode('free-space');
  }, [sectionViewMode]);

  const requestFreeSpaceAdd = useCallback((type: ProjectObjectType) => {
    if (sectionViewMode === 'free-space') {
      handleAddToSpace(type);
      return;
    }
    pendingFreeSpaceType.current = type;
    setSectionViewMode('free-space');
  }, [sectionViewMode, handleAddToSpace]);

  const createCompanionPanel = useCallback(
    (content: CompanionPanelContentFields) => {
      const obj = addSpaceObject('companion');
      const base = viewportCenterWorld((Math.random() - 0.5) * 72, (Math.random() - 0.5) * 56);
      const preferred = content.preferredSize ?? { w: 460, h: 320 };
      updateSpaceObjectFields(obj.id, {
        title: content.title,
        content: { type: 'companion', ...content },
      });
      initPos(obj.id, {
        x: base.x,
        y: base.y,
        w: preferred.w,
        h: preferred.h,
      });
      setSpaceSelectedId(obj.id);
      setCompanionComposerOpen(false);
      setShowSpaceAdd(false);
      toast.success('Companion added');
    },
    [addSpaceObject, updateSpaceObjectFields, initPos, viewportCenterWorld],
  );

  const createNotebookRecallItem = useCallback(
    (notebookId: string, rawPrompt: string) => {
      const prompt = rawPrompt.trim();
      if (!prompt) {
        toast.error('Focus a notebook block with text first.');
        return;
      }
      const obj = addRecallItem(prompt);
      const anchor = spacePositionsRef.current[notebookId];
      const fallback = viewportCenterWorld(120, 32);
      const x = anchor ? anchor.x + Math.max(48, Math.min(anchor.w + 28, 420)) : fallback.x;
      const y = anchor ? anchor.y + 24 : fallback.y;
      initPos(obj.id, { x, y, w: 380, h: 320 });
      addSpaceConnection(notebookId, obj.id);
      setSpaceSelectedId(obj.id);
      toast.success('Recall item created');
    },
    [addRecallItem, initPos, addSpaceConnection, viewportCenterWorld],
  );

  const openCourseTrapSession = useCallback((pdfId: string, fileName: string, title: string) => {
    if (!isCourseTrapPrototypeEnabled()) return;
    setCourseTrapSubject(detectCourseTrapSubject(fileName, title));
    setCourseTrapPdfId(pdfId);
    setCourseTrapOpen(true);
  }, []);

  const handlePdfViewerReady = useCallback(
    (payload: { objectId: string; fileName: string; title: string }) => {
      if (!isCourseTrapPrototypeEnabled() || !isCourseTrapAutoSurfaceEnabled()) return;
      if (courseTrapAutoSurfacedRef.current.has(payload.objectId)) return;
      if (learningAttemptOpen || quickCaptureOpen) return;
      courseTrapAutoSurfacedRef.current.add(payload.objectId);
      openCourseTrapSession(payload.objectId, payload.fileName, payload.title);
    },
    [openCourseTrapSession, learningAttemptOpen, quickCaptureOpen],
  );

  const handleCourseTrapSubjectPick = useCallback((subject: CourseTrapSubject) => {
    setCourseTrapSubject(subject);
  }, []);

  const handlePdfDroppedOnCanvas = useCallback(
    async (file: File, worldX: number, worldY: number) => {
      if (!isAcceptablePdfFile(file)) {
        toast.error('Only PDF files are supported for now.');
        return;
      }

      const obj = addSpaceObject('pdf');
      const w = 520;
      const h = 460;
      const x = Math.max(20, Math.round(worldX - w / 2));
      const y = Math.max(20, Math.round(worldY - h / 2));
      const stored = { x, y, w, h };
      setSpacePos(obj.id, stored);
      if (dropPlacementDebugEnabled()) {
        logDropSpawn({
          objectId: obj.id,
          kind: 'pdf',
          stored,
          expectedCenterWorld: { x: worldX, y: worldY },
        });
        scheduleDropRenderCheck(obj.id, 'pdf', stored);
      }
      setSpaceSelectedId(obj.id);

      // Materialise immediately with filename — workspace makes room, object arrives.
      // ingestionPhase:'materializing' signals the card to show a shimmer.
      const safeTitle = file.name.length > 80 ? `${file.name.slice(0, 78)}…` : file.name;
      updateSpaceObjectFields(obj.id, {
        title: safeTitle,
        content: {
          type: 'pdf',
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          lastOpenedAt: Date.now(),
          page: 1,
          zoom: 1,
          ingestionPhase: 'materializing',
        },
      });

      // Run storage and client-side extraction in parallel.
      // Neither blocks the other — object is already visible.
      let storageFailed = false;
      const [, spatialData] = await Promise.allSettled([
        savePdfBlob(sectionId, obj.id, file).catch(() => {
          storageFailed = true;
          toast.error('Could not store this PDF on this device.');
          removeSpaceObject(obj.id);
          removePos(obj.id);
        }),
        extractPdfSpatialData(file),
      ]);

      // If storage failed, the object was already removed — nothing more to do.
      if (storageFailed) return;

      // Apply spatial data quietly — no toast, no signal, just the object knowing more.
      // If extraction failed or timed out, spatialData.value holds zeros/nulls; still 'ready'.
      const spatial = spatialData.status === 'fulfilled' ? spatialData.value : null;
      updateSpaceObjectFields(obj.id, {
        // Only override the title if the PDF has a richer document title than the filename
        ...(spatial?.documentTitle && spatial.documentTitle !== file.name
          ? { title: spatial.documentTitle.length > 80 ? `${spatial.documentTitle.slice(0, 78)}…` : spatial.documentTitle }
          : {}),
        content: {
          type: 'pdf',
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          lastOpenedAt: Date.now(),
          page: 1,
          zoom: 1,
          ingestionPhase: 'ready',
          ...(spatial?.pageCount        ? { pageCount:       spatial.pageCount }        : {}),
          ...(spatial?.documentTitle    ? { documentTitle:   spatial.documentTitle }    : {}),
          ...(spatial?.thumbnailDataUrl ? { thumbnailDataUrl: spatial.thumbnailDataUrl } : {}),
        },
      });

      applyStudyLinksForObject(obj.id, 'pdf');
    },
    [sectionId, addSpaceObject, setSpacePos, updateSpaceObjectFields, removeSpaceObject, removePos, applyStudyLinksForObject],
  );

  const handleImageDroppedOnCanvas = useCallback(
    async (file: File, worldX: number, worldY: number) => {
      if (!isAcceptableImageFile(file)) {
        toast.error('Only PNG, JPEG, WebP, or GIF images are supported.');
        return;
      }

      const dims = await readImageDimensions(file);
      const frame = fitImageFrame(dims.w, dims.h);
      const x = Math.max(20, Math.round(worldX - frame.w / 2));
      const y = Math.max(20, Math.round(worldY - frame.h / 2));

      const obj = addSpaceObject('image');
      const stored = { x, y, w: frame.w, h: frame.h };
      setSpacePos(obj.id, stored);
      if (dropPlacementDebugEnabled()) {
        logDropSpawn({
          objectId: obj.id,
          kind: 'image',
          stored,
          expectedCenterWorld: { x: worldX, y: worldY },
        });
        scheduleDropRenderCheck(obj.id, 'image', stored);
      }
      setSpaceSelectedId(obj.id);

      const safeTitle = file.name.length > 64 ? `${file.name.slice(0, 62)}…` : file.name;
      updateSpaceObjectFields(obj.id, {
        title: safeTitle,
        content: {
          type: 'image',
          url: '',
          fileName: file.name,
          fileSize: file.size,
          naturalWidth: dims.w,
          naturalHeight: dims.h,
        },
      });

      try {
        await saveImageBlob(sectionId, obj.id, file);
        applyStudyLinksForObject(obj.id, 'image');
      } catch {
        toast.error('Could not store this image on this device.');
        removeSpaceObject(obj.id);
        removePos(obj.id);
      }
    },
    [
      sectionId,
      addSpaceObject,
      setSpacePos,
      updateSpaceObjectFields,
      removeSpaceObject,
      removePos,
      applyStudyLinksForObject,
    ],
  );

  const createQuickCaptureNote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const obj = addQuickCaptureNote(trimmed);
      const stack = quickCaptureStackRef.current++;
      const staggerX = (stack % 7) * 34 - 102;
      const staggerY = (stack % 5) * 28 - 56;
      const base = viewportCenterWorld(
        staggerX + (Math.random() - 0.5) * 20,
        staggerY + (Math.random() - 0.5) * 16,
      );
      initPos(obj.id, { x: base.x, y: base.y, w: 360, h: 280 });
      applyStudyLinksForObject(obj.id, 'note');
      setSpaceSelectedId(obj.id);
    },
    [addQuickCaptureNote, initPos, viewportCenterWorld, applyStudyLinksForObject],
  );

  const createQuickCaptureMistake = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const obj = addQuickCaptureMistake(trimmed);
      const stack = quickCaptureStackRef.current++;
      const staggerX = (stack % 7) * 34 - 102;
      const staggerY = (stack % 5) * 28 - 56;
      const base = viewportCenterWorld(
        staggerX + (Math.random() - 0.5) * 20,
        staggerY + (Math.random() - 0.5) * 16,
      );
      initPos(obj.id, { x: base.x, y: base.y, w: 380, h: 320 });
      applyStudyLinksForObject(obj.id, 'mistake');
      setSpaceSelectedId(obj.id);
    },
    [addQuickCaptureMistake, initPos, viewportCenterWorld, applyStudyLinksForObject],
  );

  const handleQuickCaptureCommit = useCallback(
    (raw: string) => {
      const t = raw.trim();
      const kind = quickCaptureVariant;
      setQuickCaptureOpen(false);
      setQuickCaptureVariant('note');
      if (!t) return;
      if (sectionViewMode === 'free-space') {
        if (kind === 'mistake') createQuickCaptureMistake(t);
        else createQuickCaptureNote(t);
        return;
      }
      pendingQuickCaptureRef.current = { kind, text: t };
      setSectionViewMode('free-space');
    },
    [sectionViewMode, createQuickCaptureNote, createQuickCaptureMistake, quickCaptureVariant],
  );

  useLayoutEffect(() => {
    if (sectionViewMode !== 'free-space') return;
    const qc = pendingQuickCaptureRef.current;
    if (qc) {
      pendingQuickCaptureRef.current = null;
      if (qc.kind === 'mistake') createQuickCaptureMistake(qc.text);
      else createQuickCaptureNote(qc.text);
      return;
    }
    if (pendingCompanionComposerRef.current) {
      pendingCompanionComposerRef.current = false;
      setCompanionComposerOpen(true);
      return;
    }
    const pending = pendingFreeSpaceType.current;
    if (!pending) return;
    pendingFreeSpaceType.current = null;
    handleAddToSpace(pending);
  }, [sectionViewMode, createQuickCaptureNote, createQuickCaptureMistake, handleAddToSpace]);

  useEffect(() => {
    if (!id || !section) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (quickCaptureOpen) return;
      if (learningAttemptOpen) return;
      if (paletteOpen || sessionModalOpen) return;
      if (connectSourceId) return;
      if (isQuickCaptureBlockedTarget(e.target)) return;

      const letterA =
        (e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (letterA && sectionViewMode === 'free-space') {
        if (e.repeat) return;
        e.preventDefault();
        setShowSpaceAdd(v => !v);
        return;
      }

      const altMistake =
        (e.key === 'c' || e.key === 'C') && e.altKey && !e.metaKey && !e.ctrlKey;
      if (altMistake) {
        if (e.repeat) return;
        e.preventDefault();
        setQuickCaptureVariant('mistake');
        setQuickCaptureOpen(true);
        return;
      }

      const letterC =
        (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey;
      const shiftSpace = e.key === ' ' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!letterC && !shiftSpace) return;
      if (e.repeat) return;

      e.preventDefault();
      setQuickCaptureVariant('note');
      setQuickCaptureOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    id,
    section,
    quickCaptureOpen,
    learningAttemptOpen,
    paletteOpen,
    sessionModalOpen,
    connectSourceId,
    sectionViewMode,
  ]);

  const cancelConnectMode = useCallback(() => {
    setConnectSourceId(null);
    setConnectHoverId(null);
  }, []);

  const handleWorkspaceBack = useCallback(() => {
    navigate(navState?.returnTo === 'universe' ? UNIVERSE_ROUTE : LIBRARY_ROUTE);
  }, [navigate, navState?.returnTo]);

  const completeFreeSpaceConnect = useCallback(
    (from: string, to: string) => {
      addSpaceConnection(from, to);
      cancelConnectMode();
      toast.success('Connected');
    },
    [addSpaceConnection, cancelConnectMode],
  );

  const startConnectFromSelected = useCallback(() => {
    if (sectionViewMode !== 'free-space') {
      toast('Open the Free Space tab first');
      return;
    }
    if (!spaceSelectedId) {
      toast.error('Select a Free Space object first');
      return;
    }
    setConnectSourceId(spaceSelectedId);
  }, [sectionViewMode, spaceSelectedId]);

  const clearConnectionsForSelected = useCallback(() => {
    if (sectionViewMode !== 'free-space') {
      toast('Open the Free Space tab first');
      return;
    }
    if (!spaceSelectedId) return;
    clearConnectionsForObject(spaceSelectedId);
    toast.success('Connections cleared');
  }, [sectionViewMode, spaceSelectedId, clearConnectionsForObject]);

  const openMistakeReview = useCallback(
    (mode: 'all' | 'neglected' | 'low' = 'all') => {
      if (sectionViewMode !== 'free-space') {
        setSectionViewMode('free-space');
      }
      const objects = sectionObjectsRef.current.objects;
      const q =
        mode === 'all'
          ? (() => {
              const loopQ = buildLearningLoopQueue(objects);
              return loopQ.length > 0 ? loopQ : buildMistakeReviewQueueFiltered(objects, 'all');
            })()
          : buildMistakeReviewQueueFiltered(objects, mode);
      if (q.length === 0) {
        toast('No learning loops need attention right now.');
        return;
      }
      const first = sectionObjectsRef.current.getObject(q[0]);
      const target = first ? learningTargetFromObject(first) : null;
      if (!target) return;
      setLearningAttemptQueue(q);
      setLearningAttemptIndex(0);
      setLearningAttemptTarget(target);
      setLearningAttemptOpen(true);
    },
    [sectionViewMode, setSectionViewMode],
  );

  const handleLearningAttemptUpdate = useCallback(
    (mistakeId: string, content: Extract<ProjectObjectContent, { type: 'mistake' }>) => {
      updateSpaceObjectContent(mistakeId, content);
    },
    [updateSpaceObjectContent],
  );

  const handlePersistSourceAttempt = useCallback(
    (target: LearningAttemptTarget, patch: Partial<Extract<ProjectObjectContent, { type: 'mistake' }>>) => {
      const objects = sectionObjectsRef.current.objects;
      const src = sectionObjectsRef.current.getObject(target.objectId);
      if (!src) return;
      const prompt = resolveAttemptPrompt(target, objects);
      const obj = addSpaceObject('mistake');
      const base = viewportCenterWorld(0, 40);
      initPos(obj.id, { x: base.x, y: base.y, w: 380, h: 320 });
      addSpaceConnection(obj.id, target.objectId);
      const c = ensureProjectObjectContent('mistake', obj.content);
      if (c.type !== 'mistake') return;
      const belief = patch.confusionBelief?.trim() || patch.whyConfused?.trim() || '';
      let next: MistakeLearningBody = {
        ...c,
        variant: 'recall',
        whatWrong: patch.whatWrong || prompt?.prompt || obj.title,
        correction: patch.correction || prompt?.hiddenAnswer || '',
        whyConfused: patch.whyConfused || belief,
        confusionBelief: belief,
        sourceObjectId: target.kind === 'notebook' ? null : target.objectId,
        anchorObjectId: target.kind === 'notebook' ? target.objectId : null,
        loopOpen: true,
        pendingReAttempt: true,
        repairedAt: Date.now(),
        lastAttemptOutcome: 'fail',
        lastAttemptAt: Date.now(),
      };
      if (belief) next = applyAttemptFail(next, belief);
      next = applyRepairSaved(next);
      updateSpaceObjectContent(obj.id, next);
      applyStudyLinksForObject(obj.id, 'mistake');
      setLearningAttemptTarget({ kind: 'mistake', objectId: obj.id });
      toast.success('Saved recall card — re-attempt when ready');
    },
    [
      addSpaceObject,
      initPos,
      viewportCenterWorld,
      addSpaceConnection,
      updateSpaceObjectContent,
      applyStudyLinksForObject,
    ],
  );

  const convertSelectedNoteToMistake = useCallback(() => {
    if (sectionViewMode !== 'free-space') {
      toast('Open the Free Space tab first');
      return;
    }
    if (!spaceSelectedId) {
      toast.error('Select a note first');
      return;
    }
    const o = getSpaceObject(spaceSelectedId);
    if (!o || o.type !== 'note') {
      toast.error('Select a text note to convert');
      return;
    }
    convertNoteToMistake(spaceSelectedId);
    applyStudyLinksForObject(spaceSelectedId, 'mistake');
    toast.success('Captured as mistake');
  }, [sectionViewMode, spaceSelectedId, getSpaceObject, convertNoteToMistake, applyStudyLinksForObject]);

  const runAiAsync = useCallback(async (resultTitle: string, messages: ChatMessage[]) => {
    aiRunRef.current?.abort();
    const ac = new AbortController();
    aiRunRef.current = ac;
    const tid = toast.loading('Asking your model…', { id: 'fw-ai-toast' });
    try {
      const r = await aiComplete({ messages, signal: ac.signal });
      toast.dismiss(tid);
      if (!r.ok) {
        if (r.code !== 'abort') toast.error(r.error, { duration: 4500 });
        return;
      }
      setAiAssistResult({ title: resultTitle, body: r.text });
    } catch {
      toast.dismiss(tid);
      toast.error('Could not reach the model.', { duration: 4500 });
    }
  }, []);

  useEffect(() => {
    if (!connectSourceId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelConnectMode();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [connectSourceId, cancelConnectMode]);

  useEffect(() => {
    if (!id || sectionViewMode !== 'free-space') return;

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      let file: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item?.kind === 'file' && item.type.startsWith('image/')) {
          file = item.getAsFile();
          break;
        }
      }
      if (!file || !isAcceptableImageFile(file)) return;

      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        if (active.closest('[contenteditable="true"]')) return;
        if (active.closest('[data-nb-editor-root]')) return;
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      }

      e.preventDefault();
      const center = viewportCenterWorld(0, 0);
      void handleImageDroppedOnCanvas(file, center.x, center.y);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [id, sectionViewMode, handleImageDroppedOnCanvas, viewportCenterWorld]);

  useEffect(() => {
    if (sectionViewMode !== 'free-space') cancelConnectMode();
  }, [sectionViewMode, cancelConnectMode]);

  useEffect(() => {
    cancelConnectMode();
  }, [id, cancelConnectMode]);

  useEffect(() => {
    const pending = consumePendingNotebookFocus();
    if (pending?.sectionId === sectionId) {
      pendingNotebookFocusRef.current = pending;
    }
  }, [sectionId]);

  useEffect(() => {
    const pending = pendingNotebookFocusRef.current;
    if (!pending || pending.sectionId !== sectionId) return;
    if (pending.boardId !== sectionBoards.activeBoardId) {
      sectionBoards.setActiveBoardId(pending.boardId);
      return;
    }
    if (!sectionObjects.getObject(pending.objectId)) return;
    pendingNotebookFocusRef.current = null;
    const t = window.setTimeout(() => focusNotebookOnCanvas(pending.objectId), 80);
    return () => window.clearTimeout(t);
  }, [
    sectionId,
    sectionBoards.activeBoardId,
    sectionObjects.objects,
    sectionObjects,
    focusNotebookOnCanvas,
    sectionBoards.setActiveBoardId,
  ]);

  useEffect(() => {
    if (!id) {
      registerFreeSpace(null);
      return;
    }
    registerFreeSpace({
      addNotebook: () => requestFreeSpaceAdd('notebook'),
      addTextCard: () => requestFreeSpaceAdd('note'),
      addCompanion: requestCompanionComposer,
      addMistake: () => requestFreeSpaceAdd('mistake'),
      addCalculator: () => requestFreeSpaceAdd('calculator'),
      addGraph: () => requestFreeSpaceAdd('graph'),
      addPdf: () => requestFreeSpaceAdd('pdf'),
      getFreeSpaceSelectedId: () => spaceSelectedIdRef.current,
      startConnectFromSelected,
      clearConnectionsForSelected,
      openMistakeReviewAll: () => openMistakeReview('all'),
      openMistakeReviewNeglected: () => openMistakeReview('neglected'),
      openMistakeReviewLowConfidence: () => openMistakeReview('low'),
      convertSelectedNoteToMistake,
      focusNotebook: (objectId: string, boardId?: string) => {
        if (boardId && boardId !== sectionBoards.activeBoardId) {
          pendingNotebookFocusRef.current = { sectionId, boardId, objectId };
          sectionBoards.setActiveBoardId(boardId);
          return;
        }
        focusNotebookOnCanvas(objectId);
      },
    });
    return () => registerFreeSpace(null);
  }, [
    id,
    sectionId,
    registerFreeSpace,
    requestFreeSpaceAdd,
    requestCompanionComposer,
    startConnectFromSelected,
    clearConnectionsForSelected,
    openMistakeReview,
    convertSelectedNoteToMistake,
    focusNotebookOnCanvas,
    sectionBoards.activeBoardId,
    sectionBoards.setActiveBoardId,
  ]);

  useEffect(() => {
    if (learningAttemptQueue.length === 0) {
      if (learningAttemptIndex !== 0) setLearningAttemptIndex(0);
      return;
    }
    if (learningAttemptIndex >= learningAttemptQueue.length) {
      setLearningAttemptIndex(0);
    }
  }, [learningAttemptQueue, learningAttemptIndex]);

  useEffect(() => {
    if (!learningAttemptOpen || learningAttemptQueue.length === 0) return;
    const id = learningAttemptQueue[learningAttemptIndex];
    const obj = sectionObjects.objects.find(o => o.id === id);
    if (!obj) {
      const liveIds = new Set(sectionObjects.objects.map(o => o.id));
      const nextQ = learningAttemptQueue.filter(qid => liveIds.has(qid));
      if (nextQ.length === 0) {
        setLearningAttemptOpen(false);
        setLearningAttemptTarget(null);
        setLearningAttemptQueue([]);
        setLearningAttemptIndex(0);
      } else {
        setLearningAttemptQueue(nextQ);
        setLearningAttemptIndex(i => Math.min(i, nextQ.length - 1));
      }
      return;
    }
    const target = learningTargetFromObject(obj);
    if (target) setLearningAttemptTarget(target);
  }, [learningAttemptOpen, learningAttemptQueue, learningAttemptIndex, sectionObjects.objects]);

  const advanceLearningAttemptQueue = useCallback(() => {
    setLearningAttemptIndex(i => {
      const next = i + 1;
      if (next >= learningAttemptQueue.length) return i;
      return next;
    });
  }, [learningAttemptQueue.length]);

  useEffect(() => {
    installFwFreeSpaceDevTools();
  }, []);

  useEffect(() => {
    if (!id) {
      registerFocusMode(null);
      return;
    }
    registerFocusMode({
      getMode: () => focusModeLiveRef.current,
      setMode: setFocusMode,
    });
    return () => registerFocusMode(null);
  // focusMode intentionally omitted: getMode reads focusModeLiveRef.current
  // (always fresh) so handlers never go stale. Including focusMode here
  // would cause registerFocusMode → setFocusModeVersion(v+1) on every
  // mode change, adding unnecessary context churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, registerFocusMode, setFocusMode]);

  useEffect(() => {
    if (!sectionId) {
      setStarterDismissed(false);
      return;
    }
    try {
      setStarterDismissed(localStorage.getItem(starterDismissStorageKey(sectionId)) === '1');
    } catch {
      setStarterDismissed(false);
    }
  }, [sectionId]);

  const dismissWorkspaceStarterOverlay = useCallback(() => {
    if (!sectionId) return;
    try {
      localStorage.setItem(starterDismissStorageKey(sectionId), '1');
    } catch {
      /* ignore */
    }
    setStarterDismissed(true);
  }, [sectionId]);

  const isExploreFocus = isExploreFocusWorkspace(section?.title, navState);

  const applyExploreFocus = useCallback(
    async (opts?: { silent?: boolean; skipToast?: boolean }) => {
      const pack = buildExploreFocusPack();
      let positions = { ...pack.positions };
      if (sectionObjects.objects.length > 0) {
        const ids = pack.objects.map(o => o.id);
        const refId = ids[0];
        const refPos = refId ? positions[refId] : undefined;
        if (refPos) {
          const nf = sectionPositions.nextFreePos(sectionPositions.positions);
          const dx = nf.x - refPos.x;
          const dy = nf.y - refPos.y;
          for (const oid of ids) {
            const p = positions[oid];
            if (p) positions[oid] = { ...p, x: Math.max(24, p.x + dx), y: Math.max(24, p.y + dy) };
          }
        }
      }
      sectionObjects.appendObjects(pack.objects);
      sectionPositions.applyPositions(positions);
      setStarterHints(pack.hints);
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh =
        typeof window !== 'undefined'
          ? Math.max(480, window.innerHeight - WORKSPACE_SHELL_TOP_INSET)
          : 720;
      sectionCanvas.centerView(EXPLORE_FOCUS_SCENE_CENTER.x, EXPLORE_FOCUS_SCENE_CENTER.y, vw, vh);
      if (!opts?.silent) {
        setFocusMode(pack.focusSuggestion);
      }
      setSectionViewMode('free-space');
      setSpaceSelectedId(pack.objects[0]?.id ?? null);
      setStarterExpanded(false);
      setStarterDockVisible(false);
      if (!opts?.skipToast) {
        toast.success('Explore Focus is ready');
      }
    },
    [
      sectionId,
      sectionObjects.appendObjects,
      sectionObjects.objects.length,
      sectionPositions.applyPositions,
      sectionPositions.nextFreePos,
      sectionPositions.positions,
      setFocusMode,
    ],
  );

  const applyWorkspaceStarter = useCallback(
    (starterId: WorkspaceStarterId, opts?: { silent?: boolean; skipToast?: boolean }) => {
      const pack = buildWorkspaceStarterPack(starterId);
      let positions = { ...pack.positions };
      if (sectionObjects.objects.length > 0) {
        const ids = pack.objects.map(o => o.id);
        const refId = ids[0];
        const refPos = refId ? positions[refId] : undefined;
        if (refPos) {
          const nf = sectionPositions.nextFreePos(sectionPositions.positions);
          const dx = nf.x - refPos.x;
          const dy = nf.y - refPos.y;
          for (const oid of ids) {
            const p = positions[oid];
            if (p) positions[oid] = { ...p, x: Math.max(24, p.x + dx), y: Math.max(24, p.y + dy) };
          }
        }
      }
      sectionObjects.appendObjects(pack.objects);
      sectionPositions.applyPositions(positions);
      if (!opts?.silent) {
        setFocusMode(pack.focusSuggestion);
        setStarterHints(pack.hints);
      }
      setSectionViewMode('free-space');
      setSpaceSelectedId(pack.objects[0]?.id ?? null);
      setStarterExpanded(false);
      setStarterDockVisible(false);
      if (!opts?.skipToast) {
        toast.success(`${WORKSPACE_STARTER_LABEL[starterId]} desk ready`);
      }
    },
    [
      sectionObjects.appendObjects,
      sectionObjects.objects.length,
      sectionPositions.applyPositions,
      sectionPositions.nextFreePos,
      sectionPositions.positions,
      setFocusMode,
    ],
  );

  // centerView is a stable useCallback with [] deps inside useSectionCanvasMode.
  // Destructuring it here prevents frameArrivalScene from changing on every
  // render just because sectionCanvas (a plain object) gets a new reference.
  const { centerView: sectionCenterView } = sectionCanvas;
  const frameArrivalScene = useCallback(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh =
      typeof window !== 'undefined'
        ? Math.max(480, window.innerHeight - WORKSPACE_SHELL_TOP_INSET)
        : 720;
    sectionCenterView(EXPLORE_FOCUS_SCENE_CENTER.x, EXPLORE_FOCUS_SCENE_CENTER.y, vw, vh);
  }, [sectionCenterView]);

  useEffect(() => {
    firstArrivalHandledRef.current = false;
    setStarterExpanded(false);
    setStarterDockVisible(false);
    setStarterRevealReady(false);
  }, [sectionId]);

  useEffect(() => {
    // Read via refs so the navigate call below doesn't trigger a re-run.
    const ns = navStateRef.current;
    if (!ns?.firstArrival || !section || !sectionId || firstArrivalHandledRef.current) return;
    if (loading) return;
    firstArrivalHandledRef.current = true;

    setSectionViewMode('free-space');
    saveSectionViewMode(sectionId, 'free-space');

    if (sectionObjects.objects.length === 0) {
      void applyExploreFocus({ silent: true, skipToast: true });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => frameArrivalScene());
      });
    }

    markFirstWorkspaceEntryDone();
    unlockAdvancedLibraryNav();
    navigate(locationRef.current.pathname, {
      replace: true,
      state: { ...ns, firstArrival: false },
    });
  }, [
    applyExploreFocus,
    frameArrivalScene,
    loading,
    // navState?.firstArrival — primitive trigger only; full navState object
    // is read via navStateRef so navigate() doesn't cause re-runs.
    // location.pathname — read via locationRef; excluded so navigating *away*
    // doesn't fire this effect a final time.
    navState?.firstArrival,
    navigate,
    section,
    sectionId,
    sectionObjects.objects.length,
  ]);

  useEffect(() => {
    // Read via refs so the navigate call below doesn't trigger a re-run.
    const ns = navStateRef.current;
    if (
      (!ns?.exploreFocus && !ns?.studyOsDemo) ||
      !sectionId ||
      loading ||
      studyOsDemoHandledRef.current
    ) {
      return;
    }
    if (sectionObjects.objects.length > 0) {
      studyOsDemoHandledRef.current = true;
      return;
    }
    studyOsDemoHandledRef.current = true;
    void applyExploreFocus({ silent: true, skipToast: true }).then(() => {
      requestAnimationFrame(() => frameArrivalScene());
    });
    navigate(locationRef.current.pathname, {
      replace: true,
      state: { ...ns, exploreFocus: false, studyOsDemo: false },
    });
  }, [
    applyExploreFocus,
    frameArrivalScene,
    loading,
    // Primitive triggers only; full navState object read via navStateRef.
    // location.pathname excluded — read via locationRef so navigating away
    // doesn't fire a final spurious run of this effect.
    navState?.exploreFocus,
    navState?.studyOsDemo,
    navigate,
    sectionId,
    sectionObjects.objects.length,
  ]);

  useEffect(() => {
    studyOsDemoHandledRef.current = false;
  }, [sectionId]);

  useEffect(() => {
    if (sectionViewMode !== 'free-space' || sectionObjects.objects.length > 0 || starterDismissed) {
      return;
    }
    if (navState?.firstArrival) return;

    const revealTimer = window.setTimeout(() => setStarterRevealReady(true), 14_000);
    return () => window.clearTimeout(revealTimer);
  }, [navState?.firstArrival, sectionObjects.objects.length, sectionViewMode, starterDismissed]);

  useEffect(() => {
    if (!starterRevealReady || starterDismissed || sectionObjects.objects.length > 0) return;
    setStarterDockVisible(true);
  }, [starterRevealReady, starterDismissed, sectionObjects.objects.length]);

  useEffect(() => {
    if (sectionObjects.objects.length > 0 || starterDismissed || navState?.firstArrival) return;
    const moved =
      Math.abs(sectionCanvas.panX - 40) > 28 ||
      Math.abs(sectionCanvas.panY - 40) > 28 ||
      Math.abs(sectionCanvas.zoom - 1) > 0.04;
    if (moved) {
      setStarterRevealReady(true);
      setStarterDockVisible(true);
    }
  }, [
    navState?.firstArrival,
    sectionCanvas.panX,
    sectionCanvas.panY,
    sectionCanvas.zoom,
    sectionObjects.objects.length,
    starterDismissed,
  ]);

  useEffect(() => {
    if (!id) {
      registerWorkspaceStarter(null);
      return;
    }
    registerWorkspaceStarter({ applyStarter: applyWorkspaceStarter });
    return () => registerWorkspaceStarter(null);
  }, [id, registerWorkspaceStarter, applyWorkspaceStarter]);

  useEffect(() => {
    setFwFreeSpaceDevSectionContext(id ?? null);
    return () => setFwFreeSpaceDevSectionContext(null);
  }, [id]);

  const freeSpaceObjectIdsKey = sectionObjects.objects.map(o => o.id).join('|');
  const freeSpaceObjectsRef = useRef(sectionObjects.objects);
  freeSpaceObjectsRef.current = sectionObjects.objects;

  useEffect(() => {
    if (!id) {
      registerAIWorkspace(null);
      return;
    }
    const handlers: AIWorkspaceHandlers = {
      getSelectionKind: () => {
        if (!spaceSelectedId) return 'none';
        const o = sectionObjectsRef.current.getObject(spaceSelectedId);
        if (!o) return 'none';
        if (o.type === 'note') return 'note';
        if (o.type === 'notebook') return 'notebook';
        if (o.type === 'mistake') return 'mistake';
        return 'other';
      },
      summarizeSelection: async () => {
        if (sectionViewMode !== 'free-space') {
          toast('Open the Free Space tab first');
          return;
        }
        const sid = spaceSelectedId;
        if (!sid) return;
        const o = sectionObjectsRef.current.getObject(sid);
        if (!o || (o.type !== 'note' && o.type !== 'notebook')) return;
        const c = ensureProjectObjectContent(o.type, o.content);
        const body = c.type === 'note' || c.type === 'notebook' ? c.body : '';
        if (!body.trim()) {
          toast.error('Nothing to summarize yet.');
          return;
        }
        await runAiAsync('Summary (cloud)', promptSummarizeNote(o.title, body));
      },
      explainMistakeSelection: async () => {
        if (sectionViewMode !== 'free-space') {
          toast('Open the Free Space tab first');
          return;
        }
        const sid = spaceSelectedId;
        if (!sid) return;
        const o = sectionObjectsRef.current.getObject(sid);
        if (!o || o.type !== 'mistake') return;
        const c = ensureProjectObjectContent('mistake', o.content);
        if (c.type !== 'mistake') return;
        const mistakeText = [c.whatWrong, c.correction].filter(Boolean).join('\n') || o.title;
        const context = c.whyConfused.trim() ? `Learner note: ${c.whyConfused}` : undefined;
        if (!mistakeText.trim()) {
          toast.error('Add what went wrong on the card first.');
          return;
        }
        await runAiAsync('Plain explanation (cloud)', promptExplainMistakeSimple(mistakeText, context));
      },
      practiceQuestionsSelection: async () => {
        if (sectionViewMode !== 'free-space') {
          toast('Open the Free Space tab first');
          return;
        }
        const sid = spaceSelectedId;
        if (!sid) return;
        const o = sectionObjectsRef.current.getObject(sid);
        if (!o) return;
        let source = '';
        if (o.type === 'note' || o.type === 'notebook') {
          const c = ensureProjectObjectContent(o.type, o.content);
          source = c.type === 'note' || c.type === 'notebook' ? c.body : '';
        } else if (o.type === 'mistake') {
          const c = ensureProjectObjectContent('mistake', o.content);
          if (c.type === 'mistake') {
            source = [c.whatWrong, c.correction, c.whyConfused].filter(Boolean).join('\n');
          }
        }
        if (!source.trim()) {
          toast.error('Add some text to this object first.');
          return;
        }
        await runAiAsync('Practice questions (cloud)', promptPracticeQuestions(o.title, source));
      },
      rephraseSelection: async () => {
        if (sectionViewMode !== 'free-space') {
          toast('Open the Free Space tab first');
          return;
        }
        const sid = spaceSelectedId;
        if (!sid) return;
        const o = sectionObjectsRef.current.getObject(sid);
        if (!o) return;
        let concept = '';
        if (o.type === 'note' || o.type === 'notebook') {
          const c = ensureProjectObjectContent(o.type, o.content);
          concept = c.type === 'note' || c.type === 'notebook' ? c.body : '';
        } else if (o.type === 'mistake') {
          const c = ensureProjectObjectContent('mistake', o.content);
          if (c.type === 'mistake') {
            concept = [c.whatWrong, c.correction, c.whyConfused].filter(Boolean).join('\n');
          }
        }
        if (!concept.trim()) {
          toast.error('Nothing to rephrase yet.');
          return;
        }
        await runAiAsync('Rephrased concept (cloud)', promptRephraseConcept(concept));
      },
      suggestRelatedMistakesSelection: async () => {
        if (sectionViewMode !== 'free-space') {
          toast('Open the Free Space tab first');
          return;
        }
        const sid = spaceSelectedId;
        if (!sid) return;
        const o = sectionObjectsRef.current.getObject(sid);
        if (!o || o.type !== 'mistake') return;
        const c = ensureProjectObjectContent('mistake', o.content);
        if (c.type !== 'mistake') return;
        const mistakeText = [c.whatWrong, c.correction].filter(Boolean).join('\n') || o.title;
        if (!mistakeText.trim()) {
          toast.error('Add what went wrong on the card first.');
          return;
        }
        const others = sectionObjectsRef.current.objects
          .filter(x => x.type === 'mistake' && x.id !== sid)
          .map(x => {
            const m = ensureProjectObjectContent('mistake', x.content);
            return m.type === 'mistake' ? (m.whatWrong.trim() || x.title) : x.title;
          })
          .filter(Boolean);
        await runAiAsync('Related slips (cloud)', promptSuggestRelatedMistakes(mistakeText, others));
      },
    };
    registerAIWorkspace(handlers);
    return () => registerAIWorkspace(null);
  }, [
    id,
    registerAIWorkspace,
    spaceSelectedId,
    sectionViewMode,
    freeSpaceObjectIdsKey,
    runAiAsync,
  ]);

  useEffect(() => {
    if (!id) return;
    sectionPositions.seedMissingPositions(freeSpaceObjectsRef.current.map(o => o.id));
  }, [id, freeSpaceObjectIdsKey, sectionPositions.seedMissingPositions]);

  useEffect(() => {
    const valid = new Set(sectionObjects.objects.map(o => o.id));
    setSpaceSelectedIds((prev) => prev.filter((id) => valid.has(id)));
    if (spaceSelectedId && !valid.has(spaceSelectedId)) setSpaceSelectedId(null);
    if (spaceEditingId && !valid.has(spaceEditingId)) setSpaceEditingId(null);
    if (connectSourceId && !valid.has(connectSourceId)) setConnectSourceId(null);
  }, [sectionObjects.objects, spaceSelectedId, spaceEditingId, connectSourceId]);

  useEffect(() => {
    if (!spaceSelectedId) {
      setSpaceSelectedIds((prev) => (prev.length ? [] : prev));
      return;
    }
    setSpaceSelectedIds((prev) => {
      if (prev.length && prev.includes(spaceSelectedId)) return prev;
      return [spaceSelectedId];
    });
  }, [spaceSelectedId]);

  const createWorkNotebookForStudy = useCallback(
    (sourceId: string) => {
      const obj = addSpaceObject('notebook');
      const base = viewportCenterWorld(40, 0);
      initPos(obj.id, { x: base.x, y: base.y, w: 1040, h: 680 });
      updateSpaceObjectContent(obj.id, {
        type: 'notebook',
        body: '# Work\n\n',
        paperStyle: 'grid',
        notebookSurface: 'spatial',
        notebookMode: 'math',
        icon: '∑',
      });
      addSpaceConnection(sourceId, obj.id);
      return obj.id;
    },
    [addSpaceObject, initPos, viewportCenterWorld, updateSpaceObjectContent, addSpaceConnection],
  );

  const commitStudySession = useCallback(
    (sourceId: string, workId: string, restoreFromRecord: StudySessionRecord | null) => {
      if (!sectionId) return;
      closeLearningAttempt();
      const boardId = sectionBoards.activeBoardId;
      const source = getSpaceObject(sourceId);
      const work = getSpaceObject(workId);
      if (!source || source.type !== 'pdf' || !work) return;

      const restore = buildRestorePayload(restoreFromRecord);
      const workContent = ensureProjectObjectContent('notebook', work.content);
      if (workContent.type === 'notebook') {
        let workBody = workContent.body ?? '';
        const trimmed = workBody.trim();
        const canSeedStudyQuestions =
          trimmed.length === 0 ||
          /^#\s*(Work|Math)?\s*$/i.test(trimmed) ||
          /^#\s*(Work|Math)?\s*\n\s*$/i.test(trimmed);
        if (canSeedStudyQuestions && parseExamQuestionsFromBody(workBody).length === 0) {
          workBody = EXAM_QUESTION_SEED_BODY;
        }
        sectionObjectsRef.current.updateObjectContent(workId, {
          ...workContent,
          body: workBody,
          deskLayout: {
            collapsed: { formula: true, graph: true, compute: true, scratch: true },
          },
        });
      }
      const pdfContent = ensureProjectObjectContent('pdf', source.content);
      const page =
        restore.pdfPage ??
        (pdfContent.type === 'pdf' ? pdfContent.page : 1);

      let pagePatch = applyPdfPageRestore(source, page);
      if (pagePatch) {
        const pc = ensureProjectObjectContent('pdf', pagePatch);
        if (pc.type === 'pdf' && pc.zoom <= 1) {
          pagePatch = { ...pc, zoom: STUDY_SESSION_PDF_FIT_WIDTH_ZOOM };
        }
        sectionObjectsRef.current.updateObjectContent(sourceId, pagePatch);
      } else if (pdfContent.type === 'pdf' && pdfContent.zoom <= 1) {
        sectionObjectsRef.current.updateObjectContent(sourceId, {
          ...pdfContent,
          zoom: STUDY_SESSION_PDF_FIT_WIDTH_ZOOM,
        });
      }

      const now = Date.now();
      const record: StudySessionRecord = {
        sourceObjectId: sourceId,
        workObjectId: workId,
        source: { page },
        work: {
          lastBlockId: restore.workBlockId,
          lastCaretOffset: restoreFromRecord?.work.lastCaretOffset ?? null,
        },
        enteredAt: restoreFromRecord?.enteredAt ?? now,
        lastActiveAt: now,
        lastExitedAt: null,
      };
      saveStudySession(sectionId, boardId, record);
      setActiveStudySession(record);
      setStudyRestoreBlockId(restore.workBlockId);
      if (restore.workBlockId) {
        setActiveQuestionNumber(null);
        setStudyFocusQuestionNumber(null);
      } else {
        setActiveQuestionNumber(1);
        setStudyFocusQuestionNumber(1);
        setStudyFocusQuestionToken(t => t + 1);
      }
      setStudyPaneFocus('exam');
      setStudyContinueDismissed(true);
      setSectionViewMode('free-space');
      setSpaceSelectedId(workId);
    },
    [
      sectionId,
      sectionBoards.activeBoardId,
      getSpaceObject,
      setSectionViewMode,
      closeLearningAttempt,
    ],
  );

  const enterStudySession = useCallback(
    (sourceId: string, opts?: { restore?: boolean }): 'entered' | 'pick' | 'failed' => {
      if (!studySessionPrimary || !sectionId) return 'failed';
      closeLearningAttempt();
      const objects = sectionObjectsRef.current.objects;
      const source = objects.find(o => o.id === sourceId);
      if (!source || source.type !== 'pdf') return 'failed';

      const boardId = sectionBoards.activeBoardId;
      const saved = opts?.restore ? loadStudySession(sectionId, boardId, sourceId) : null;
      const resolution = resolveStudyPair(source, objects, sectionId, boardId);

      if (resolution.kind === 'pick') {
        setStudyPickWork({ sourceId, candidates: resolution.candidates });
        return 'pick';
      }

      let workId = resolution.kind === 'ready' ? resolution.workObjectId : '';
      if (resolution.kind === 'create') {
        workId = createWorkNotebookForStudy(sourceId);
      }
      if (!workId) return 'failed';

      if (resolution.kind === 'ready' && !saved) {
        const linked = objects.find(o => o.id === workId);
        const hasLink = coerceFreeSpaceConnectionIds(source.connections).includes(workId)
          || (linked && coerceFreeSpaceConnectionIds(linked.connections).includes(sourceId));
        if (!hasLink) addSpaceConnection(sourceId, workId);
      }

      commitStudySession(sourceId, workId, saved);
      return 'entered';
    },
    [
      studySessionPrimary,
      sectionId,
      sectionBoards.activeBoardId,
      createWorkNotebookForStudy,
      commitStudySession,
      addSpaceConnection,
      closeLearningAttempt,
    ],
  );

  const exitStudySession = useCallback(() => {
    if (!activeStudySession || !sectionId) return;
    const boardId = sectionBoards.activeBoardId;
    touchStudySession(sectionId, boardId, {
      sourceObjectId: activeStudySession.sourceObjectId,
      lastExitedAt: Date.now(),
    });
    setActiveStudySession(null);
    setStudyRestoreBlockId(null);
    setActiveQuestionNumber(null);
    setStudyFocusQuestionNumber(null);
    setStudyPaneFocus('exam');
    setStudyPdfMarksChrome(null);
    if (studySessionWorkPersistTimerRef.current) {
      clearTimeout(studySessionWorkPersistTimerRef.current);
      studySessionWorkPersistTimerRef.current = null;
    }
    if (studySessionPagePersistTimerRef.current) {
      clearTimeout(studySessionPagePersistTimerRef.current);
      studySessionPagePersistTimerRef.current = null;
    }
    toast.success('Study session saved — you can continue anytime.');
  }, [activeStudySession, sectionId, sectionBoards.activeBoardId]);

  const handleSelectStudyQuestion = useCallback((questionNumber: number) => {
    setActiveQuestionNumber(questionNumber);
    setStudyFocusQuestionNumber(questionNumber);
    setStudyFocusQuestionToken(t => t + 1);
  }, []);

  const handleStudyPaneFocusChange = useCallback((focus: StudyPaneFocus) => {
    setStudyPaneFocus(focus);
    const preset = focus === 'exam' ? 0.75 : focus === 'work' ? 0.28 : 0.5;
    setStudySplitRatio(preset);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('focus.studySession.splitRatio.v1', String(preset));
    }
  }, []);

  const handleStudySplitRatioChange = useCallback((ratio: number) => {
    setStudySplitRatio(Math.max(0.12, Math.min(0.88, ratio)));
  }, []);

  const handleStudySplitRatioCommit = useCallback((ratio: number) => {
    const next = Math.max(0.12, Math.min(0.88, ratio));
    setStudySplitRatio(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('focus.studySession.splitRatio.v1', String(next));
    }
  }, []);

  const studyExamQuestions = useMemo(() => {
    if (!activeStudySession) return [];
    const work = sectionObjects.objects.find(o => o.id === activeStudySession.workObjectId);
    if (!work || work.type !== 'notebook') return [];
    const c = ensureProjectObjectContent('notebook', work.content);
    if (c.type !== 'notebook') return [];
    return parseExamQuestionsFromBody(c.body ?? '');
  }, [activeStudySession, sectionObjects.objects]);

  const studyExamPdfControls = useMemo((): StudyExamPdfControls | null => {
    if (!activeStudySession) return null;
    const src = sectionObjects.objects.find(o => o.id === activeStudySession.sourceObjectId);
    if (!src || src.type !== 'pdf') return null;
    const c = ensureProjectObjectContent('pdf', src.content);
    if (c.type !== 'pdf' || !c.fileName) return null;
    const sourceId = activeStudySession.sourceObjectId;
    return {
      page: c.page,
      pageCount: c.pageCount,
      zoom: c.zoom,
      ready: true,
      marks: studyPdfMarksChrome,
      onPageDelta: (delta: number) => {
        const store = sectionObjectsRef.current;
        const o = store.getObject(sourceId);
        if (!o || o.type !== 'pdf') return;
        const pc = ensureProjectObjectContent('pdf', o.content);
        if (pc.type !== 'pdf') return;
        store.updateObjectContent(sourceId, {
          ...pc,
          page: Math.max(1, pc.page + delta),
        });
      },
      onZoomDelta: (delta: number) => {
        const store = sectionObjectsRef.current;
        const o = store.getObject(sourceId);
        if (!o || o.type !== 'pdf') return;
        const pc = ensureProjectObjectContent('pdf', o.content);
        if (pc.type !== 'pdf') return;
        const z = Math.min(2.5, Math.max(0.55, Math.round((pc.zoom + delta) * 100) / 100));
        store.updateObjectContent(sourceId, { ...pc, zoom: z });
      },
      onFitWidth: () => {
        const store = sectionObjectsRef.current;
        const o = store.getObject(sourceId);
        if (!o || o.type !== 'pdf') return;
        const pc = ensureProjectObjectContent('pdf', o.content);
        if (pc.type !== 'pdf') return;
        store.updateObjectContent(sourceId, { ...pc, zoom: STUDY_SESSION_PDF_FIT_WIDTH_ZOOM });
      },
    };
  }, [activeStudySession, sectionObjects.objects, studyPdfMarksChrome]);

  const handleStudySessionWorkFocus = useCallback(
    (blockId: string | null) => {
      if (!activeStudySession || !sectionId || !blockId) return;
      if (studySessionWorkPersistTimerRef.current) {
        clearTimeout(studySessionWorkPersistTimerRef.current);
      }
      studySessionWorkPersistTimerRef.current = setTimeout(() => {
        const next = touchStudySession(sectionId, sectionBoards.activeBoardId, {
          sourceObjectId: activeStudySession.sourceObjectId,
          work: { lastBlockId: blockId, lastCaretOffset: null },
        });
        if (next) setActiveStudySession(next);
        studySessionWorkPersistTimerRef.current = null;
      }, 400);
    },
    [activeStudySession, sectionId, sectionBoards.activeBoardId],
  );

  useEffect(() => {
    if (!activeStudySession || !sectionId || !studySessionPrimary) return;
    const source = sectionObjects.objects.find(o => o.id === activeStudySession.sourceObjectId);
    if (!source || source.type !== 'pdf') return;
    const c = ensureProjectObjectContent('pdf', source.content);
    if (c.type !== 'pdf' || c.page === activeStudySession.source.page) return;
    if (studySessionPagePersistTimerRef.current) clearTimeout(studySessionPagePersistTimerRef.current);
    studySessionPagePersistTimerRef.current = setTimeout(() => {
      const next = touchStudySession(sectionId, sectionBoards.activeBoardId, {
        sourceObjectId: activeStudySession.sourceObjectId,
        source: { page: c.page },
      });
      if (next) setActiveStudySession(next);
      studySessionPagePersistTimerRef.current = null;
    }, 400);
    return () => {
      if (studySessionPagePersistTimerRef.current) {
        clearTimeout(studySessionPagePersistTimerRef.current);
        studySessionPagePersistTimerRef.current = null;
      }
    };
  }, [activeStudySession, sectionId, sectionBoards.activeBoardId, sectionObjects.objects, studySessionPrimary]);

  const studyContinueCandidate = useMemo(() => {
    if (!studySessionPrimary || !sectionId || activeStudySession || studyContinueDismissed) {
      return null;
    }
    return getMostRecentSession(sectionId, sectionBoards.activeBoardId);
  }, [
    studySessionPrimary,
    sectionId,
    sectionBoards.activeBoardId,
    activeStudySession,
    studyContinueDismissed,
  ]);

  const workspaceResumeSuggestions = useMemo(() => {
    if (!studySessionPrimary || !studyContinueCandidate) return continuitySuggestions;
    return continuitySuggestions.filter(s => !s.learningAttempt);
  }, [continuitySuggestions, studySessionPrimary, studyContinueCandidate]);

  const courseEntryExamDays = useMemo(
    () => (section?.exam_date ? daysUntil(section.exam_date) : null),
    [section?.exam_date],
  );

  const courseEntryMostRecentSession = useMemo(() => {
    if (!studySessionPrimary || !sectionId) return null;
    return getMostRecentSession(sectionId, sectionBoards.activeBoardId);
  }, [studySessionPrimary, sectionId, sectionBoards.activeBoardId]);

  const courseEntryRestorableSourceId = courseEntryMostRecentSession?.sourceObjectId ?? null;

  const courseEntryDecision = useMemo(() => {
    if (!courseEntryEnabled || !sectionId) return { kind: 'none' as const };
    return resolveCourseEntry({
      now: Date.now(),
      firstArrival: navState?.firstArrival ?? false,
      objects: sectionObjects.objects,
      studySessionPrimary,
      mostRecentSession: courseEntryMostRecentSession,
      hasActiveStudySession: !!activeStudySession,
      examDays: courseEntryExamDays,
      restorableNextSourceId: courseEntryRestorableSourceId,
    });
  }, [
    courseEntryEnabled,
    sectionId,
    navState?.firstArrival,
    sectionObjects.objects,
    studySessionPrimary,
    courseEntryMostRecentSession,
    activeStudySession,
    courseEntryExamDays,
    courseEntryRestorableSourceId,
  ]);

  const courseEntryWarmFallbackStripVisible =
    courseEntryEnabled &&
    courseEntryDecision.kind === 'warm_restore' &&
    courseEntryWarmFallback &&
    !courseEntryDismissed &&
    !activeStudySession &&
    !studyPickWork;

  const courseEntryActive =
    courseEntryEnabled &&
    ((courseEntryDecision.kind === 'strip' && !courseEntryDismissed) ||
      courseEntryWarmFallbackStripVisible ||
      (courseEntryDecision.kind === 'warm_restore' && !!activeStudySession));

  const courseEntryStripVisible =
    courseEntryEnabled &&
    courseEntryDecision.kind === 'strip' &&
    !courseEntryDismissed &&
    !activeStudySession;

  const courseEntryWarmFallbackCopy = useMemo(() => {
    if (courseEntryDecision.kind !== 'warm_restore') return null;
    const session = courseEntryMostRecentSession;
    const src = sectionObjects.objects.find(o => o.id === courseEntryDecision.sourceId);
    let examLabel = src?.title ?? 'Your exam';
    let pageLabel: string | undefined;
    if (src?.type === 'pdf') {
      const c = ensureProjectObjectContent('pdf', src.content);
      if (c.type === 'pdf') {
        examLabel = c.fileName || src.title;
        if (session) {
          pageLabel = formatPageLabel(session.source.page, c.pageCount);
        }
      }
    } else if (session) {
      pageLabel = formatPageLabel(session.source.page);
    }
    const subtitle = [examLabel, pageLabel].filter(Boolean).join(' · ');
    return { subtitle };
  }, [
    courseEntryDecision,
    courseEntryMostRecentSession,
    sectionObjects.objects,
  ]);

  useEffect(() => {
    if (!courseEntryEnabled || !sectionId) return;
    if (courseEntryDecision.kind !== 'warm_restore') {
      setCourseEntryWarmFallback(false);
      courseEntryWarmWasPickRef.current = false;
      return;
    }
    if (activeStudySession) {
      setCourseEntryWarmFallback(false);
      courseEntryWarmWasPickRef.current = false;
      return;
    }
    if (courseEntryWarmAppliedRef.current === sectionId) return;
    courseEntryWarmAppliedRef.current = sectionId;
    const result = enterStudySession(courseEntryDecision.sourceId, { restore: true });
    if (result === 'failed') {
      setCourseEntryWarmFallback(true);
    } else if (result === 'pick') {
      courseEntryWarmWasPickRef.current = true;
    }
  }, [
    courseEntryEnabled,
    sectionId,
    courseEntryDecision,
    activeStudySession,
    enterStudySession,
  ]);

  useEffect(() => {
    if (!courseEntryEnabled || !sectionId) return;
    if (!courseEntryWarmWasPickRef.current) return;
    if (courseEntryDecision.kind !== 'warm_restore') return;
    if (activeStudySession || studyPickWork || courseEntryDismissed) return;
    if (courseEntryWarmAppliedRef.current !== sectionId) return;
    setCourseEntryWarmFallback(true);
  }, [
    courseEntryEnabled,
    sectionId,
    courseEntryDecision,
    activeStudySession,
    studyPickWork,
    courseEntryDismissed,
  ]);

  const handleCourseEntryPrimary = useCallback(() => {
    if (courseEntryDecision.kind !== 'strip') return;
    setCourseEntryDismissed(true);
    switch (courseEntryDecision.action) {
      case 'restore_session':
        if (courseEntryDecision.sessionSourceId) {
          enterStudySession(courseEntryDecision.sessionSourceId, { restore: true });
        }
        break;
      case 'focus':
        if (courseEntryDecision.focusObjectId) {
          focusNotebookOnCanvas(courseEntryDecision.focusObjectId);
        }
        break;
      case 'begin':
        handleAddToSpace('pdf');
        break;
      case 'enter':
        break;
    }
  }, [courseEntryDecision, enterStudySession, focusNotebookOnCanvas, handleAddToSpace]);

  const handleCourseEntryWarmFallback = useCallback(() => {
    if (courseEntryDecision.kind !== 'warm_restore') return;
    setCourseEntryDismissed(true);
    setCourseEntryWarmFallback(false);
    enterStudySession(courseEntryDecision.sourceId, { restore: true });
  }, [courseEntryDecision, enterStudySession]);

  const supportsUniversalPresentation = useCallback((o: ProjectSpaceObject): boolean => (
    o.type === 'notebook'
    || o.type === 'pdf'
    || o.type === 'image'
    || o.type === 'note'
    || o.type === 'checklist'
  ), []);

  const isStudySessionObject = useCallback(
    (objectId: string): boolean =>
      Boolean(
        activeStudySession &&
        (objectId === activeStudySession.sourceObjectId || objectId === activeStudySession.workObjectId),
      ),
    [activeStudySession],
  );

  const getObjectPresentation = useCallback((objectId: string): {
    mode: UniversalObjectViewMode;
    splitSide: UniversalObjectSplitSide;
  } => {
    const obj = sectionObjectsRef.current.getObject(objectId);
    if (!obj || !supportsUniversalPresentation(obj) || isStudySessionObject(objectId)) {
      return { mode: 'floating', splitSide: 'right' };
    }
    return {
      mode: obj.viewMode ?? 'floating',
      splitSide: obj.splitSide ?? 'right',
    };
  }, [supportsUniversalPresentation, isStudySessionObject]);

  const setObjectPresentationMode = useCallback((
    objectId: string,
    mode: UniversalObjectViewMode,
    splitSide?: UniversalObjectSplitSide,
  ) => {
    void (async () => {
    const store = sectionObjectsRef.current;
    const target = store.getObject(objectId);
    if (!target || !supportsUniversalPresentation(target) || isStudySessionObject(objectId)) return;

    if (target.type === 'notebook') {
      await flushAllHandwritingForObject(objectId);
    }

    if (mode === 'split') {
      const side = splitSide ?? target.splitSide ?? 'right';
      for (const o of store.objects) {
        if (o.id === objectId || !supportsUniversalPresentation(o)) continue;
        if (isStudySessionObject(o.id)) continue;
        if ((o.viewMode ?? 'floating') === 'split' && (o.splitSide ?? 'right') === side) {
          store.updateObjectFields(o.id, { viewMode: 'floating' });
        }
      }
      store.updateObjectFields(objectId, { viewMode: 'split', splitSide: side });
    } else if (mode === 'fullscreen') {
      for (const o of store.objects) {
        if (o.id === objectId || !supportsUniversalPresentation(o)) continue;
        if ((o.viewMode ?? 'floating') === 'fullscreen') {
          store.updateObjectFields(o.id, { viewMode: 'floating' });
        }
      }
      store.updateObjectFields(objectId, { viewMode: 'fullscreen' });
    } else {
      store.updateObjectFields(objectId, { viewMode: 'floating' });
    }
    setSpaceSelectedId(objectId);
    })();
  }, [supportsUniversalPresentation, isStudySessionObject]);

  const handleStudyLayoutChange = useCallback((objectId: string, mode: StudyLayoutMode) => {
    const store = sectionObjectsRef.current;
    for (const o of store.objects) {
      if (o.type !== 'notebook') continue;
      const c = ensureProjectObjectContent('notebook', o.content);
      if (c.type !== 'notebook') continue;

      const current = sanitizeStudyLayout(c.studyLayout);
      let target: StudyLayoutMode = current;
      if (o.id === objectId) {
        target = mode;
      } else if (mode !== 'canvas' && isStudyLayoutDocked(current)) {
        target = 'canvas';
      } else {
        continue;
      }

      if (target === current) continue;

      const { studyLayout: _removed, ...base } = c;
      const next =
        target === 'canvas'
          ? (base as ProjectObjectContent)
          : ({ ...base, studyLayout: target } as ProjectObjectContent);
      store.updateObjectContent(o.id, next);
    }
    if (mode !== 'canvas') {
      setSpaceSelectedId(objectId);
    }
  }, []);

  const renderSpaceObject = useCallback(
    (
      objectId: string,
      contentHost: 'canvas' | 'study-dock' | 'study-session' = 'canvas',
    ): React.ReactNode | null => {
      const store = sectionObjectsRef.current;
      const obj = store.getObject(objectId);
      if (!obj) return null;

      const inStudySession =
        studySessionPrimary &&
        activeStudySession &&
        (activeStudySession.sourceObjectId === objectId ||
          activeStudySession.workObjectId === objectId);

      const studySessionChip =
        inStudySession && contentHost === 'canvas'
          ? {
              subtitle:
                activeStudySession!.sourceObjectId === objectId
                  ? 'Exam is open in your study session'
                  : 'Work is open in your study session',
              onOpen: () => enterStudySession(activeStudySession!.sourceObjectId, { restore: true }),
            }
          : null;

      const isStudyWorkNotebook =
        inStudySession && activeStudySession?.workObjectId === objectId;

      const studyExamReaderChrome = Boolean(
        contentHost === 'study-session' &&
          studyPaneFocus === 'exam' &&
          activeStudySession?.sourceObjectId === objectId,
      );

      const studyDeskQuiet = Boolean(
        contentHost === 'study-session' &&
          studyPaneFocus === 'exam' &&
          isStudyWorkNotebook,
      );

      const restoreBlockId =
        contentHost === 'study-session' && isStudyWorkNotebook ? studyRestoreBlockId : null;

      return (
        <ProjectSpaceObjectRenderer
          object={obj}
          allObjects={store.objects}
          tokens={tokens}
          freeSpaceSectionId={sectionId}
          freeSpaceBoardId={sectionBoards.activeBoardId}
          contentHost={contentHost}
          onChange={content => store.updateObjectContent(objectId, content)}
          onTitleChange={
            obj.type === 'mistake' || obj.type === 'pdf' || obj.type === 'companion'
              ? t => store.updateObjectFields(objectId, { title: t })
              : undefined
          }
          onNotebookEditingChange={(oid, isEditing) => {
            setSpaceEditingId(prev => (isEditing ? oid : prev === oid ? null : prev));
          }}
          onRequestSelectObject={setSpaceSelectedId}
          onCreateNotebookRecall={createNotebookRecallItem}
          onStartLearningAttempt={openLearningAttemptForObject}
          onPdfViewerReady={handlePdfViewerReady}
          onStudyLayoutChange={
            studySessionPrimary || obj.type !== 'notebook'
              ? undefined
              : mode => handleStudyLayoutChange(objectId, mode)
          }
          onStartStudySession={
            studySessionPrimary && obj.type === 'pdf' && contentHost === 'canvas'
              ? () => enterStudySession(objectId)
              : undefined
          }
          studySessionChip={studySessionChip}
          sessionRestoreBlockId={restoreBlockId}
          onStudySessionWorkFocus={
            isStudyWorkNotebook ? handleStudySessionWorkFocus : undefined
          }
          studyFocusQuestionNumber={isStudyWorkNotebook ? studyFocusQuestionNumber : undefined}
          studyFocusQuestionToken={isStudyWorkNotebook ? studyFocusQuestionToken : undefined}
          onStudySessionActiveQuestionNumber={
            isStudyWorkNotebook ? setActiveQuestionNumber : undefined
          }
          suppressStudyToolbar={studyExamReaderChrome}
          studyDeskQuiet={studyDeskQuiet}
          onStudyMarksChromeChange={
            contentHost === 'study-session' && obj.type === 'pdf'
              ? setStudyPdfMarksChrome
              : undefined
          }
          suppressLearningAttemptChip={
            studySessionPrimary &&
            (contentHost === 'study-session' || obj.type === 'pdf')
          }
        />
      );
    },
    [
      sectionId,
      sectionBoards.activeBoardId,
      tokens,
      createNotebookRecallItem,
      openLearningAttemptForObject,
      handlePdfViewerReady,
      handleStudyLayoutChange,
      studySessionPrimary,
      activeStudySession,
      studyRestoreBlockId,
      studyFocusQuestionNumber,
      studyFocusQuestionToken,
      studyPaneFocus,
      enterStudySession,
      handleStudySessionWorkFocus,
    ],
  );

  const studyDockedNotebooks = useMemo(() => {
    return sectionObjects.objects.filter(o => {
      if (o.type !== 'notebook') return false;
      const c = ensureProjectObjectContent('notebook', o.content);
      return c.type === 'notebook' && isStudyLayoutDocked(sanitizeStudyLayout(c.studyLayout));
    });
  }, [sectionObjects.objects]);

  if (!section && loading) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: tokens.pageBg,
        }}
      >
        <FloatingWorkspaceShell
          title="Workspace"
          accent={tokens.accent}
          tokens={tokens}
          isCustomizing={false}
          backLabel={workspaceBackLabel}
          onBack={handleWorkspaceBack}
          onOpenSearch={openPalette}
          onOpenAppearance={() => setAppearanceOpen(true)}
          onCustomize={() => {}}
          onOpenNotebookControls={() => {}}
          notebookControlsOpen={false}
          onExitCustomize={() => {}}
          onResetCustomize={() => {}}
          sectionViewMode="free-space"
          onViewModeChange={() => {}}
          focusMode={null}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: tokens.textMuted }} />
        </div>
      </div>
    );
  }

  if (!section && !loading) {
    if (notFound) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            backgroundColor: tokens.pageBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: tokens.textMuted }} />
        </div>
      );
    }
    return (
      <div
        style={{
          minHeight: '100dvh',
          backgroundColor: tokens.pageBg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h2 className="text-lg font-semibold" style={{ color: tokens.textPrimary }}>
          Couldn’t load this workspace
        </h2>
        <p className="text-sm max-w-sm" style={{ color: tokens.textMuted }}>
          {fetchError ?? 'Something went wrong. Check your connection and try again.'}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => void fetchSection()}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: tokens.accent, color: '#0a0a0b' }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => void clearPwaCachesAndReload()}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ color: tokens.textMuted, border: '1px solid rgba(255,255,255,0.12)' }}
          >
            Reset app cache
          </button>
          <Link to={LIBRARY_ROUTE} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ color: tokens.accent }}>
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  if (!section) return null;

  const totalItems     = section.groups.reduce((sum, g) => sum + g.items.length, 0);
  const completedItems = section.groups.reduce((sum, g) => sum + g.items.filter(i => i.completed).length, 0);
  const remaining      = totalItems - completedItems;
  const progress       = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allDone        = totalItems > 0 && remaining === 0;

  const examDays = section.exam_date ? daysUntil(section.exam_date) : null;

  const starterChromeOff = isStabilityFeatureDisabled('disableWorkspaceStarterChrome');

  const showWorkspaceStarter =
    !starterChromeOff &&
    sectionViewMode === 'free-space' &&
    sectionObjects.objects.length === 0 &&
    !starterDismissed &&
    starterExpanded;

  const showStarterDock =
    !starterChromeOff &&
    sectionViewMode === 'free-space' &&
    sectionObjects.objects.length === 0 &&
    !starterDismissed &&
    !starterExpanded &&
    starterDockVisible;

  const progressColor = allDone || progress >= 70 ? '#10b981'
                      : progress >= 30             ? '#f59e0b'
                      :                              '#ef4444';

  // Customization — accent overrides progress-based color for decorative elements only
  const accentColor = customization.accent || progressColor;

  const isPanic = !!section.exam_date && progress < 50;

  // Split: Exercises (primary) vs everything else (resources)
  const exercisesGroup = section.groups.find(g => g.title === 'Exercises');
  const resourceGroups = section.groups.filter(g => g.title !== 'Exercises');

  // Today's Plan — up to 3 recommended actions
  const todayPlan = (() => {
    const result: Array<{ item: Item; lane: string; reason: string; effort: string }> = [];
    for (const gName of PLAN_PRIORITY) {
      if (result.length >= 3) break;
      const g = section.groups.find(x => x.title === gName);
      if (!g) continue;
      const lane   = gName === 'Exercises' ? 'To Do' : gName;
      const reason = gName === 'Exercises' ? 'Next incomplete task'
                   : gName === 'Exams'     ? 'Focus here first'
                   : 'Review lecture material';
      for (const item of g.items) {
        if (!item.completed && result.length < 3) result.push({ item, lane, reason, effort: getEffort(item) });
      }
    }
    if (result.length < 3) {
      for (const g of section.groups) {
        if (result.length >= 3) break;
        if ([...PLAN_PRIORITY, 'Links', 'Notes'].includes(g.title)) continue;
        for (const item of g.items) {
          if (!item.completed && result.length < 3)
            result.push({ item, lane: g.title, reason: 'Next best action', effort: getEffort(item) });
        }
      }
    }
    return result;
  })();

  const scrollToItem = (itemId: string) =>
    document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Common props passed to every GroupComponent and ResourcesBlock
  const groupCallbacks = {
    onAddItem:    addItem,
    onPushItem:   pushItem,
    onToggleItem: toggleTask,
    onDeleteItem: deleteItem,
    onUpdateItem: updateItem,
    onRenameGroup: updateGroup,
    onDeleteGroup: deleteGroup,
    onAddGroup:   addGroup,
    onRefresh:     fetchSection,
  };

  const getSpaceLabel = (id: string): string => {
    const obj = sectionObjects.getObject(id);
    return obj?.title ?? 'Object';
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: tokens.pageBg,
        backgroundImage: `
          radial-gradient(circle at 24% 16%, ${tokens.ambientGlow1} 0%, transparent 34%),
          radial-gradient(circle at 78% 14%, ${tokens.ambientGlow2} 0%, transparent 30%),
          linear-gradient(180deg, ${tokens.pageBg} 0%, ${tokens.pageBg} 100%)
        `,
      }}
    >

      <FloatingWorkspaceShell
        title={section.title}
        accent={accentColor}
        tokens={tokens}
        isCustomizing={designMode}
        isExploreFocus={isExploreFocus}
        dimmed={studySessionPrimary && !!activeStudySession}
        backLabel={workspaceBackLabel}
        onBack={handleWorkspaceBack}
        onOpenSearch={openPalette}
        onOpenAppearance={() => setAppearanceOpen(true)}
        onCustomize={enterDesignMode}
        onOpenNotebookControls={() => setNotebookControlsOpen(v => !v)}
        notebookControlsOpen={notebookControlsOpen}
        onExitCustomize={exitDesignMode}
        onResetCustomize={resetDesign}
        sectionViewMode={sectionViewMode}
        onViewModeChange={setSectionViewMode}
        focusMode={focusMode}
        boards={sectionBoards.boards}
        activeBoardId={sectionBoards.activeBoardId}
        onSelectBoard={sectionBoards.setActiveBoardId}
        onCreateBoard={sectionBoards.createBoard}
        organize={
          sectionViewMode === 'free-space'
            ? {
                objectCount: sectionObjects.objects.length,
                selectedCount: spaceSelectedIds.length,
                onApplyTemplate: handleApplySpaceTemplate,
                onAutoArrange: handleAutoArrange,
                onArrangeSelected: handleArrangeSelected,
                onArrangeByGoal: handleArrangeByGoal,
              }
            : undefined
        }
      />

      {isExploreFocus && (
        <ExploreFocusGuide tokens={tokens} hints={starterHints ?? []} accent={accentColor} />
      )}

      <QuickCaptureOverlay
        open={quickCaptureOpen}
        tokens={tokens}
        variant={quickCaptureVariant}
        onClose={() => {
          setQuickCaptureOpen(false);
          setQuickCaptureVariant('note');
        }}
        onCommit={handleQuickCaptureCommit}
      />

      <LearningAttemptOverlay
        open={learningAttemptOpen}
        tokens={tokens}
        objects={sectionObjects.objects}
        target={learningAttemptTarget}
        queueIds={learningAttemptQueue}
        queueIndex={learningAttemptIndex}
        hasQueueNext={
          learningAttemptQueue.length > 0 &&
          learningAttemptIndex < learningAttemptQueue.length - 1
        }
        onAdvanceQueue={advanceLearningAttemptQueue}
        onClose={closeLearningAttempt}
        onUpdateMistake={handleLearningAttemptUpdate}
        onPersistSourceAttempt={handlePersistSourceAttempt}
      />

      <CourseTrapPrototypeOverlay
        open={courseTrapOpen}
        tokens={tokens}
        subject={courseTrapSubject}
        pdfObjectId={courseTrapPdfId}
        onClose={() => setCourseTrapOpen(false)}
        onSubjectPick={handleCourseTrapSubjectPick}
      />

      <CompanionComposerModal
        open={companionComposerOpen}
        tokens={tokens}
        onClose={() => {
          pendingCompanionComposerRef.current = false;
          setCompanionComposerOpen(false);
        }}
        onCreate={createCompanionPanel}
      />

      <WorkspaceAppearancePanel
        open={appearanceOpen}
        scope="workspace"
        workspaceTitle={section.title}
        tokens={tokens}
        atmosphereId={atmosphereId}
        global={global}
        onClose={() => setAppearanceOpen(false)}
        onSetAtmosphere={setAtmosphere}
        onUpdateGlobal={updateGlobal}
      />


      {/* ── VIEW SURFACES (mounted; visibility switch — preserves iframes/PDF) ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, isolation: 'isolate', overflow: 'hidden' }}>
      <div style={surfaceShellStyle(freeSpaceSurfaceVisible)}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            paddingTop: WORKSPACE_SHELL_TOP_INSET,
          }}
        >
          <FreeSpaceCanvasErrorBoundary tokens={freeSpaceTokens} fillParent>
            <FreeformCanvas
              tokens={freeSpaceTokens}
              fillParent
              canvasBackgroundStyle={canvasBackgroundStyle}
              livingEnvironment={livingEnvironment}
              modules={[]}
              blocks={sectionObjects.objects.filter(o => {
                if (activeStudySession) return true;
                if (!supportsUniversalPresentation(o)) return true;
                return (o.viewMode ?? 'floating') === 'floating';
              })}
              tools={[]}
              positions={sectionPositions.positions}
              canvasState={sectionCanvas}
              designMode={true}
              selectedId={spaceSelectedId}
              selectedIds={spaceSelectedIds}
              focusEditingId={spaceEditingId}
              spatialAmbient={!isStabilityFeatureDisabled('disableFreeSpaceSpatialAmbient')}
              onSetPos={sectionPositions.setPos}
              onSelect={handleSpaceSelection}
              onRemoveModule={() => {}}
              onRemoveBlock={id => { sectionObjects.removeObject(id); sectionPositions.removePos(id); }}
              onRemoveTool={() => {}}
              onDuplicateBlock={id => {
                const duplicated = sectionObjects.duplicateObject(id);
                if (!duplicated) return;
                const p = sectionPositions.positions[id];
                sectionPositions.initPos(
                  duplicated.id,
                  p ? { x: p.x + 48, y: p.y + 40, w: p.w, h: p.h } : { x: 100, y: 100, w: 360 },
                );
                setSpaceSelectedId(duplicated.id);
              }}
              onOpenAdd={() => setShowSpaceAdd(v => !v)}
              renderModuleContent={renderSpaceObject}
              getLabel={getSpaceLabel}
              freeSpaceConnectionsEnabled
              connectModeSourceId={connectSourceId}
              connectHoverTargetId={connectHoverId}
              onConnectHoverTargetChange={setConnectHoverId}
              onBeginConnectFromBlock={sid => setConnectSourceId(sid)}
              onConnectPairComplete={completeFreeSpaceConnect}
              onCancelConnectMode={cancelConnectMode}
              spatialMinimapEnabled={!isStabilityFeatureDisabled('disableFreeSpaceMiniMap')}
              onPdfDroppedOnCanvas={handlePdfDroppedOnCanvas}
              onImageDroppedOnCanvas={handleImageDroppedOnCanvas}
              focusMode={freeSpaceSurfaceVisible ? focusMode : null}
              pulseObjectId={notebookSearchPulseId}
              surfaceActive={freeSpaceSurfaceVisible}
              calmEffects={performanceCalm}
              workspaceClarity={freeSpaceClarity}
              focusStrength={global.focusStrength ?? 'soft'}
              continuityObjectIds={continuityObjectIds}
              continuityClusterIds={continuityClusterIds}
              continuityEdgeKeys={continuityEdgeKeys}
              getObjectPresentation={getObjectPresentation}
              onSetObjectPresentationMode={setObjectPresentationMode}
            />
          </FreeSpaceCanvasErrorBoundary>

          {freeSpaceSurfaceVisible && !activeStudySession && (() => {
            const eligible = sectionObjects.objects.filter(o => supportsUniversalPresentation(o));
            const fullscreen = eligible
              .filter(o => (o.viewMode ?? 'floating') === 'fullscreen')
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (fullscreen) {
              return (
                <UniversalObjectViewPortal
                  key={`object-view-fullscreen-${fullscreen.id}`}
                  title={fullscreen.title}
                  tokens={freeSpaceTokens}
                  mode="fullscreen"
                  splitSide={fullscreen.splitSide ?? 'right'}
                  onSetMode={mode => setObjectPresentationMode(fullscreen.id, mode)}
                >
                  {renderSpaceObject(fullscreen.id, 'canvas')}
                </UniversalObjectViewPortal>
              );
            }
            const splitLeft = eligible
              .filter(o => (o.viewMode ?? 'floating') === 'split' && (o.splitSide ?? 'right') === 'left')
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            const splitRight = eligible
              .filter(o => (o.viewMode ?? 'floating') === 'split' && (o.splitSide ?? 'right') === 'right')
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            return (
              <>
                {splitLeft ? (
                  <UniversalObjectViewPortal
                    key={`object-view-split-left-${splitLeft.id}`}
                    title={splitLeft.title}
                    tokens={freeSpaceTokens}
                    mode="split"
                    splitSide="left"
                    onSetMode={mode => setObjectPresentationMode(splitLeft.id, mode)}
                  >
                    {renderSpaceObject(splitLeft.id, 'canvas')}
                  </UniversalObjectViewPortal>
                ) : null}
                {splitRight ? (
                  <UniversalObjectViewPortal
                    key={`object-view-split-right-${splitRight.id}`}
                    title={splitRight.title}
                    tokens={freeSpaceTokens}
                    mode="split"
                    splitSide="right"
                    onSetMode={mode => setObjectPresentationMode(splitRight.id, mode)}
                  >
                    {renderSpaceObject(splitRight.id, 'canvas')}
                  </UniversalObjectViewPortal>
                ) : null}
              </>
            );
          })()}

          {freeSpaceSurfaceVisible &&
            !studySessionPrimary &&
            studyDockedNotebooks.map(o => {
              const c = ensureProjectObjectContent('notebook', o.content);
              if (c.type !== 'notebook') return null;
              const layout = sanitizeStudyLayout(c.studyLayout);
              return (
                <StudyLayoutDockPortal
                  key={`study-dock-${o.id}`}
                  layout={layout}
                  objectTitle={o.title}
                  tokens={freeSpaceTokens}
                  onClose={() => handleStudyLayoutChange(o.id, 'canvas')}
                  onLayoutChange={mode => handleStudyLayoutChange(o.id, mode)}
                >
                  {renderSpaceObject(o.id, 'study-dock')}
                </StudyLayoutDockPortal>
              );
            })}

          {freeSpaceSurfaceVisible &&
            studySessionPrimary &&
            activeStudySession &&
            (() => {
              const source = sectionObjects.objects.find(
                o => o.id === activeStudySession.sourceObjectId,
              );
              let sourceTitle = source?.title ?? 'Exam';
              if (source?.type === 'pdf') {
                const sc = ensureProjectObjectContent('pdf', source.content);
                if (sc.type === 'pdf' && sc.fileName) sourceTitle = sc.fileName;
              }
              const srcContent =
                source?.type === 'pdf'
                  ? ensureProjectObjectContent('pdf', source.content)
                  : null;
              const pageCount =
                srcContent?.type === 'pdf' ? srcContent.pageCount : undefined;
              const statusLine = [
                formatPageLabel(activeStudySession.source.page, pageCount),
                formatLastStudied(activeStudySession.lastActiveAt),
              ].join(' · ');

              return (
                <StudySessionShell
                  tokens={freeSpaceTokens}
                  examTitle={sourceTitle || 'Exam'}
                  statusLine={statusLine}
                  shellTopInset={0}
                  paneFocus={studyPaneFocus}
                  onPaneFocusChange={handleStudyPaneFocusChange}
                  splitRatio={studySplitRatio}
                  onSplitRatioChange={handleStudySplitRatioChange}
                  onSplitRatioCommit={handleStudySplitRatioCommit}
                  onDoneStudying={exitStudySession}
                  questions={studyExamQuestions}
                  activeQuestionNumber={activeQuestionNumber}
                  onSelectQuestion={handleSelectStudyQuestion}
                  examPdfControls={studyExamPdfControls}
                  sourcePanel={renderSpaceObject(activeStudySession.sourceObjectId, 'study-session')}
                  workPanel={renderSpaceObject(activeStudySession.workObjectId, 'study-session')}
                />
              );
            })()}

          {freeSpaceSurfaceVisible &&
            studySessionPrimary &&
            studyContinueCandidate &&
            !activeStudySession &&
            !courseEntryEnabled && (
              <StudyContinueBanner
                tokens={freeSpaceTokens}
                examLabel={(() => {
                  const src = sectionObjects.objects.find(
                    o => o.id === studyContinueCandidate.sourceObjectId,
                  );
                  if (src?.type === 'pdf') {
                    const c = ensureProjectObjectContent('pdf', src.content);
                    if (c.type === 'pdf') return c.fileName || src.title;
                  }
                  return src?.title ?? 'Your exam';
                })()}
                pageLabel={(() => {
                  const src = sectionObjects.objects.find(
                    o => o.id === studyContinueCandidate.sourceObjectId,
                  );
                  if (src?.type === 'pdf') {
                    const c = ensureProjectObjectContent('pdf', src.content);
                    if (c.type === 'pdf') {
                      return formatPageLabel(
                        studyContinueCandidate.source.page,
                        c.pageCount,
                      );
                    }
                  }
                  return formatPageLabel(studyContinueCandidate.source.page);
                })()}
                onContinue={() =>
                  enterStudySession(studyContinueCandidate.sourceObjectId, { restore: true })
                }
                onDismiss={() => setStudyContinueDismissed(true)}
              />
            )}

          {freeSpaceSurfaceVisible && courseEntryStripVisible && (
            <CourseEntryStrip
              tokens={freeSpaceTokens}
              title={courseEntryDecision.primaryLabel}
              subtitle={courseEntryDecision.secondaryLabel}
              buttonLabel={courseEntryDecision.buttonLabel}
              onPrimary={handleCourseEntryPrimary}
              onDismiss={() => setCourseEntryDismissed(true)}
            />
          )}

          {freeSpaceSurfaceVisible && courseEntryWarmFallbackStripVisible && courseEntryWarmFallbackCopy && (
            <CourseEntryStrip
              tokens={freeSpaceTokens}
              title="Continue studying"
              subtitle={courseEntryWarmFallbackCopy.subtitle}
              buttonLabel="Continue studying"
              onPrimary={handleCourseEntryWarmFallback}
              onDismiss={() => {
                setCourseEntryDismissed(true);
                setCourseEntryWarmFallback(false);
              }}
            />
          )}

          {freeSpaceSurfaceVisible &&
            continuity &&
            resumeCopy &&
            !resumeDismissed &&
            !studyContinueCandidate &&
            !activeStudySession &&
            !courseEntryActive &&
            !isStabilityFeatureDisabled('disableWorkspaceResumeLayer') && (
            <WorkspaceResumeLayer
              tokens={freeSpaceTokens}
              inShell
              continuity={continuity}
              resumeCopy={resumeCopy}
              suggestions={workspaceResumeSuggestions}
              onDismiss={() => setResumeDismissed(true)}
              onSuggestionClick={handleResumeSuggestion}
            />
          )}

          {freeSpaceSurfaceVisible && sectionObjects.objects.length === 0 && !showWorkspaceStarter && !showStarterDock && !spaceEditingId && (
            <FreeSpaceEmptyGuidance
              tokens={freeSpaceTokens}
              onAddPdf={() => handleAddToSpace('pdf')}
              onAddNote={() => handleAddToSpace('note')}
              onAskTutor={requestCompanionComposer}
            />
          )}

          {showStarterDock && (
            <WorkspaceStarterDock
              tokens={tokens}
              onExpand={() => setStarterExpanded(true)}
              onDismiss={dismissWorkspaceStarterOverlay}
            />
          )}

          {showWorkspaceStarter && (
            <WorkspaceStarterOverlay
              tokens={tokens}
              onChoose={sid => {
                applyWorkspaceStarter(sid);
              }}
              onDismiss={() => {
                setStarterExpanded(false);
                dismissWorkspaceStarterOverlay();
              }}
            />
          )}

          {studyPickWork && studySessionPrimary && (
            <StudySessionPickWork
              tokens={freeSpaceTokens}
              sourceTitle={(() => {
                const src = sectionObjects.objects.find(o => o.id === studyPickWork.sourceId);
                if (src?.type === 'pdf') {
                  const c = ensureProjectObjectContent('pdf', src.content);
                  if (c.type === 'pdf') return c.fileName || src.title;
                }
                return src?.title ?? 'this exam';
              })()}
              candidates={studyPickWork.candidates}
              onPick={workId => {
                const sourceId = studyPickWork.sourceId;
                addSpaceConnection(sourceId, workId);
                const saved = sectionId
                  ? loadStudySession(sectionId, sectionBoards.activeBoardId, sourceId)
                  : null;
                commitStudySession(sourceId, workId, saved);
                setStudyPickWork(null);
              }}
              onCancel={() => setStudyPickWork(null)}
            />
          )}

          {showSpaceAdd && (
            <FreeSpaceToolPalette
              tokens={freeSpaceTokens}
              onClose={() => setShowSpaceAdd(false)}
              onPick={itemId => {
                if (itemId === 'math-notebook') {
                  handleCreateMathNotebook();
                  return;
                }
                if (itemId === 'math-setup') {
                  handleCreateMathZone();
                  return;
                }
                if (itemId === 'tutor') {
                  requestCompanionComposer();
                  return;
                }
                if (itemId === 'recall') {
                  handleAddRecallToSpace();
                  return;
                }
                if (itemId === 'quick-review') {
                  const hasReviewCards = sectionObjects.objects.some(o => o.type === 'mistake');
                  if (!hasReviewCards) {
                    toast('Add a Mistake or Recall card first.');
                    return;
                  }
                  setShowSpaceAdd(false);
                  openMistakeReview('all');
                  return;
                }
                handleAddToSpace(itemId);
              }}
            />
          )}
        </div>
      </div>
      <div style={surfaceShellStyle(designSurfaceVisible)}>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: WORKSPACE_SHELL_TOP_INSET }}>
          <div style={{ maxWidth: '896px', margin: '0 auto', padding: '24px 24px 64px' }}>

            <DesignModeBar
              customization={customization}
              onChange={setCustomization}
              onDone={exitDesignMode}
              onReset={resetDesign}
            />

            <div className="space-y-3 mb-4">
              {orderedGroups.map(group => {
                const isDragging = dragId     === group.id;
                const isDragOver = dragOverId === group.id && dragId !== group.id;
                return (
                  <div
                    key={group.id}
                    draggable
                    onDragStart={e => handleDragStart(e, group.id)}
                    onDragOver={e  => handleDragOver(e,  group.id)}
                    onDrop={e      => handleDrop(e,      group.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      opacity: isDragging ? 0.35 : 1,
                      outline: isDragOver ? '2px solid #f59e0b' : 'none',
                      outlineOffset: '3px',
                      borderRadius: '14px',
                      transition: 'opacity 0.15s',
                      cursor: 'grab',
                    }}
                  >
                    <GroupComponent
                      group={group}
                      sectionId={section.id}
                      {...groupCallbacks}
                      designMode
                      isHidden={(customization.hiddenLanes ?? []).includes(group.id)}
                      onToggleHide={() => toggleHideLane(group.id)}
                      density={customization.density || 'comfortable'}
                    />
                  </div>
                );
              })}
            </div>

            {/* Add Lane */}
            <div className="mt-2 mb-6">
              {showAddLane ? (
                <form
                  onSubmit={handleAddLane}
                  className="flex gap-2.5 rounded-xl p-3"
                  style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}
                >
                  <input
                    type="text"
                    value={newLaneTitle}
                    onChange={e => setNewLaneTitle(e.target.value)}
                    placeholder="Lane name (e.g. Flashcards, Lab Reports, Vocabulary…)"
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: '#f8fafc' }}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Escape') { setShowAddLane(false); setNewLaneTitle(''); } }}
                  />
                  <button
                    type="submit"
                    disabled={addingLane || !newLaneTitle.trim()}
                    className="px-3.5 py-1.5 rounded-lg font-semibold text-sm disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  >
                    {addingLane ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddLane(false); setNewLaneTitle(''); }}
                    className="p-1.5 rounded-lg"
                    style={{ color: '#374151' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddLane(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                  style={{ border: '2px dashed #1a2230', color: '#374151' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2230'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <Plus className="w-4 h-4" strokeWidth={2} />
                  Add lane
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div style={surfaceShellStyle(workSurfaceVisible)}>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[248px_1fr]" style={{ overflow: 'hidden', minHeight: 0, height: '100%', paddingTop: WORKSPACE_SHELL_TOP_INSET }}>

          {/* ── LEFT PERIPHERAL ──────────────────────────────────────────── */}
          <aside
            className="hidden lg:flex flex-col overflow-y-auto"
            style={{ borderRight: '1px solid rgba(255,255,255,0.04)', padding: '32px 14px 24px 18px', gap: 0, backgroundColor: '#070b14' }}
          >
            <CourseHub sectionId={section.id} />

            <div style={{ margin: '24px 0 16px', height: '1px', backgroundColor: 'rgba(255,255,255,0.04)' }} />

            <AmbientDates sectionId={section.id} sectionTitle={section.title} />
          </aside>

          {/* ── RIGHT WORK SURFACE ───────────────────────────────────────── */}
          <main style={{ overflowY: 'auto', position: 'relative', backgroundColor: 'rgba(255,255,255,0.012)' }}>

            {/* Subtle session hint — secondary to workspace */}
            <div style={{
              position: 'absolute', inset: 0,
              background: sessionIsThisCourse
                ? 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.035) 0%, transparent 65%)'
                : 'none',
              pointerEvents: 'none', zIndex: 0, transition: 'background 1.4s cubic-bezier(0.4,0,0.2,1)',
            }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '36px 40px 88px', maxWidth: '720px' }}>

              {/* Workspace context — quiet */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {customization.icon && (
                      <span style={{ fontSize: '15px', lineHeight: 1 }} role="img">{customization.icon}</span>
                    )}
                    <h1 style={{ fontSize: '17px', fontWeight: 650, color: 'rgba(226,232,240,0.88)', letterSpacing: '-0.02em', margin: 0 }}>
                      {section.title}
                    </h1>
                    {spaceAge(section.created_at) && (
                      <span style={{ fontSize: '10px', color: '#374151', fontWeight: 500, flexShrink: 0, userSelect: 'none' }}>
                        {spaceAge(section.created_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowCustomize(true)}
                  style={{ flexShrink: 0, fontSize: '10px', padding: '4px 6px', borderRadius: '4px', color: '#1e2a38', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', marginTop: '2px', transition: 'color 0.3s cubic-bezier(0.4,0,0.2,1)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#1e2a38'; }}
                  title="Customize workspace"
                >
                  ✦
                </button>
              </div>

              <MissionControlView
                objects={sectionObjects.objects}
                accent={accentColor}
                onOpenObject={focusNotebookOnCanvas}
              />

              {/* Recessed lane progress — not the visual center */}
              <div style={{ marginBottom: 24, opacity: 0.72 }}>
                {totalItems > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {allDone ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500, color: '#10b981' }}>
                        <CheckCircle2 className="w-3 h-3" /> All caught up
                      </span>
                    ) : (
                      <>
                        <span style={{ fontSize: '11px', color: '#4b5563' }}>
                          <span style={{ color: '#64748b', fontWeight: 500 }}>{remaining}</span> remaining
                        </span>
                        <span style={{ fontSize: '11px', color: '#1a2230' }}>·</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '56px', height: '2px', borderRadius: '2px', backgroundColor: '#111827', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progressColor, borderRadius: '2px', transition: 'width 0.7s ease' }} />
                          </div>
                          <span style={{ fontSize: '10px', color: '#374151', fontWeight: 500 }}>{progress}%</span>
                        </div>
                      </>
                    )}
                    {editingExamDate ? (
                      <input
                        type="date"
                        defaultValue={section.exam_date ?? ''}
                        autoFocus
                        style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#111827', border: '1px solid #f59e0b', color: '#f8fafc', outline: 'none' }}
                        onBlur={e => { setEditingExamDate(false); setExamDate(e.target.value || null).catch(() => toast.error('Failed to save exam date')); }}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingExamDate(false); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : section.exam_date ? (
                      <button
                        onClick={() => setEditingExamDate(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#4b5563')}
                      >
                        <Calendar className="w-3 h-3" />
                        {formatExamDate(section.exam_date)}
                        {examDays !== null && (
                          <span style={{ color: examDays <= 0 ? '#4b5563' : examDays <= 7 ? '#ef4444' : examDays <= 14 ? '#f59e0b' : '#4b5563', fontWeight: 600 }}>
                            · {examDays > 0 ? `${examDays}d` : examDays === 0 ? 'Today!' : 'Past'}
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditingExamDate(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#263043', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#4b5563')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}
                      >
                        <Calendar className="w-3 h-3" /> Set exam date
                      </button>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: '11px', color: '#263043', margin: 0 }}>Add tasks to track progress</p>
                )}
              </div>

              {/* ── PANIC BANNER ─────────────────────────────────────────── */}
              {isPanic && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', marginBottom: '20px' }}>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '12px', color: '#f59e0b', margin: 0 }}>
                    Exam approaching — focus on high-impact items
                  </p>
                </div>
              )}

              {/* ── FOCUS NOW STRIP ──────────────────────────────────────── */}
              {todayPlan.length > 0 && (
                <div style={{ borderLeft: '1.5px solid rgba(245,158,11,0.45)', backgroundColor: 'rgba(245,158,11,0.014)', borderRadius: '0 3px 3px 0', marginBottom: '36px' }}>
                  <div style={{ padding: '6px 16px 0', marginBottom: '6px' }}>
                    <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(245,158,11,0.5)', fontWeight: 600 }}>Do next</span>
                  </div>

                  <button
                    onClick={() => scrollToItem(todayPlan[0].item.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 16px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.025)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                  >
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#f59e0b', flexShrink: 0, opacity: 0.7 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {todayPlan[0].item.title}
                      </p>
                      <p style={{ fontSize: '10px', color: '#374151', margin: '2px 0 0' }}>
                        {todayPlan[0].lane}
                      </p>
                    </div>
                    <ArrowRight className="w-3 h-3" style={{ color: '#2a3040', flexShrink: 0 }} />
                  </button>

                  {todayPlan.slice(1).map((rec) => (
                    <button
                      key={rec.item.id}
                      onClick={() => scrollToItem(rec.item.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '6px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.015)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                    >
                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#374151', flexShrink: 0, opacity: 0.5 }} />
                      <p style={{ flex: 1, fontSize: '12px', color: '#4b5563', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rec.item.title}
                      </p>
                    </button>
                  ))}

                  <div style={{ padding: '10px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setSectionViewMode('free-space')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', backgroundColor: accentColor, color: '#000', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                    >
                      Open workspace
                      <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handleStartSession}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', backgroundColor: 'transparent', color: '#6b7280', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                      <PlayCircle className="w-3 h-3" />
                      {sessionIsThisCourse ? 'Resume focus session' : 'Focus session'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── TASKS & CAPTURE ────────────────────────────────────── */}
              <div style={{ marginBottom: '40px' }}>

                {exercisesGroup ? (
                  <>
                    {exercisesGroup.items.map(item => (
                      <div key={item.id} id={`item-${item.id}`}>
                        <WorkItem item={item} onToggle={toggleTask} onDelete={deleteItem} />
                      </div>
                    ))}
                    {exercisesGroup.items.length === 0 && (
                      <p style={{ fontSize: '13px', color: '#263043', padding: '10px 0', fontStyle: 'italic', margin: 0 }}>
                        Nothing here yet — add a task below.
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '13px', color: '#263043', padding: '10px 0', margin: 0 }}>
                    No work items yet.
                  </p>
                )}

                <WorkCapture onAdd={handleWorkCapture} />
              </div>

              {/* ── SHELF ────────────────────────────────────────────────── */}
              <div style={{ paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.035)' }}>
                <ResourcesBlock
                  groups={resourceGroups.filter(g => !(customization.hiddenLanes ?? []).includes(g.id))}
                  sectionId={section.id}
                  groupCallbacks={groupCallbacks}
                  density={customization.density || ''}
                />
              </div>

              {/* Mobile: ambient dates below shelf */}
              <div className="lg:hidden" style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <AmbientDates sectionId={section.id} sectionTitle={section.title} />
              </div>

            </div>
          </main>
        </div>
      </div>

      {/* ── MATH ZONE SURFACE ─────────────────────────────────────────────── */}
      <div style={surfaceShellStyle(mathZoneSurfaceVisible)}>
        <MathZone
          tokens={tokens}
          sectionId={sectionId}
          sectionTitle={section.title}
          paddingTop={WORKSPACE_SHELL_TOP_INSET}
          controlsOpen={notebookControlsOpen}
          onControlsOpenChange={setNotebookControlsOpen}
        />
      </div>

      </div>

      {aiAssistResult && (
        <AIAssistanceResultModal
          title={aiAssistResult.title}
          body={aiAssistResult.body}
          onClose={() => setAiAssistResult(null)}
          tokens={tokens}
        />
      )}

      {showCustomize && (
        <CustomizeModal
          sectionTitle={section.title}
          value={customization}
          onChange={setCustomization}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </div>
  );
}


// ── ResourcesBlock ────────────────────────────────────────────────────────────

// ── ShelfAddForm — inline creation for a single item ─────────────────────────
// Appears in-place when the user picks a type. Auto-creates "Shelf" group if
// none exists so users never have to think about group structure.

type ShelfItemType = 'note' | 'link' | 'task';

interface ShelfFormProps {
  type:        ShelfItemType;
  groupId:     string | null;   // null → auto-create "Shelf" group
  onAddGroup:  (title: string) => Promise<string>;
  onAddItem:   (groupId: string, type: ItemType, title: string, content?: string) => Promise<void>;
  onDone:      () => void;
}

function ShelfAddForm({ type, groupId, onAddGroup, onAddItem, onDone }: ShelfFormProps) {
  const [title,   setTitle]   = useState('');
  const [content, setContent] = useState('');
  const [url,     setUrl]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // For links, url is the key field; title is optional (falls back to url)
    const finalTitle   = type === 'link'
      ? (title.trim() || url.trim())
      : title.trim();
    const finalContent = type === 'link'
      ? url.trim()
      : content.trim() || undefined;
    if (!finalTitle) return;

    setSaving(true);
    try {
      let targetId = groupId;
      if (!targetId) {
        // Auto-create a default shelf — groups are an implementation detail
        targetId = await onAddGroup('Shelf');
      }
      await onAddItem(targetId, type, finalTitle, finalContent);
      onDone();
    } catch {
      setSaving(false);
    }
  };

  const cancel = () => { if (!saving) onDone(); };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg p-3 flex flex-col gap-2.5"
      style={{ backgroundColor: 'rgba(7,11,20,0.6)', border: '1px solid rgba(255,255,255,0.055)' }}
    >
      {/* Type badge */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
          style={{ backgroundColor: '#1a2236', color: '#4b5563' }}
        >
          {type === 'task' ? 'Checklist item' : type}
        </span>
        <button
          type="button"
          onClick={cancel}
          style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Link URL — shown first for links since it's the primary field */}
      {type === 'link' && (
        <input
          ref={titleRef as React.RefObject<HTMLInputElement>}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full text-sm bg-transparent outline-none"
          style={{ color: '#f1f5f9' }}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        />
      )}

      {/* Title / label */}
      <input
        ref={type !== 'link' ? titleRef : undefined}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={
          type === 'note' ? 'Title (e.g. "Chapter 3 notes")' :
          type === 'link' ? 'Label (optional)' :
          'What needs doing?'
        }
        className="w-full text-sm bg-transparent outline-none"
        style={{ color: '#f1f5f9' }}
        onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
      />

      {/* Content body — only for notes */}
      {type === 'note' && (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Add details (optional)"
          rows={3}
          className="w-full text-xs bg-transparent outline-none resize-none"
          style={{ color: '#94a3b8' }}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        />
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={cancel}
          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: '#4b5563' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || (type === 'link' ? !url.trim() : !title.trim())}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ backgroundColor: '#1a2236', color: '#94a3b8', border: '1px solid #263043' }}
          onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.backgroundColor = '#263043'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1a2236'; }}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Save
        </button>
      </div>
    </form>
  );
}

// ── ResourcesBlock ────────────────────────────────────────────────────────────
// A lightweight shelf for keeping useful things close to the work.
// Groups (now "sections") are an optional organising layer — never required.

function ResourcesBlock({
  groups, sectionId, groupCallbacks, density = '',
}: {
  groups: GroupWithItems[];
  sectionId: string;
  density?: 'compact' | 'comfortable' | 'spacious' | '';
  groupCallbacks: {
    onAddItem:    (groupId: string, type: ItemType, title: string, content?: string) => Promise<void>;
    onPushItem:   (groupId: string, item: Item) => void;
    onToggleItem: (itemId: string, completed: boolean) => Promise<void>;
    onDeleteItem: (itemId: string) => Promise<void>;
    onUpdateItem: (itemId: string, updates: { title?: string; content?: string | null }) => Promise<void>;
    onRenameGroup: (groupId: string, title: string) => Promise<void>;
    onDeleteGroup: (groupId: string) => Promise<void>;
    onAddGroup:   (title: string) => Promise<string>;
    onRefresh:    () => void;
  };
}) {
  // Open by default — this shelf is part of the space, not a collapsed extra.
  const [isOpen,      setIsOpen]      = useState(true);
  const [addingType,  setAddingType]  = useState<ShelfItemType | null>(null);
  const [showSection, setShowSection] = useState(false);
  const [sectionName, setSectionName] = useState('');

  const totalItems  = groups.reduce((s, g) => s + g.items.length, 0);
  // The default landing group — first available, or null (auto-create "Shelf")
  const defaultGroupId = groups[0]?.id ?? null;

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = sectionName.trim();
    if (!t) return;
    try { await groupCallbacks.onAddGroup(t); } catch { /* handled upstream */ }
    setSectionName('');
    setShowSection(false);
  };

  // Quick-add chips shown in header and inside the body
  const TYPE_CHIPS: Array<{ type: ShelfItemType; label: string }> = [
    { type: 'note', label: 'Note'      },
    { type: 'link', label: 'Link'      },
    { type: 'task', label: 'Checklist' },
  ];

  const QuickChips = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {TYPE_CHIPS.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => { setAddingType(type); setIsOpen(true); }}
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
          style={{
            backgroundColor: addingType === type ? '#1a2236' : 'transparent',
            color:           addingType === type ? '#94a3b8' : '#4b5563',
            border:          `1px solid ${addingType === type ? '#263043' : 'transparent'}`,
          }}
          onMouseEnter={e => {
            if (addingType !== type) {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#111827';
              (e.currentTarget as HTMLElement).style.color = '#94a3b8';
            }
          }}
          onMouseLeave={e => {
            if (addingType !== type) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#4b5563';
            }
          }}
        >
          <Plus className="w-2.5 h-2.5" />
          {compact ? null : label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mb-4">

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between mb-3 cursor-pointer select-none"
        onClick={() => setIsOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0" style={{ color: '#263043', transition: 'color 0.25s cubic-bezier(0.4,0,0.2,1)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#4b5563')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}>
            {isOpen
              ? <ChevronDown  className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />}
          </span>
          <span className="text-[10px] font-semibold"
                style={{ color: '#374151', letterSpacing: '0.04em' }}>
            shelf
          </span>
          {totalItems > 0 && (
            <span className="text-[9px]"
                  style={{ color: '#263043' }}>
              {totalItems}
            </span>
          )}
        </div>
        {/* Quick-add chips — stop propagation so they don't toggle collapse */}
        <QuickChips />
      </div>

      {/* ── Body ── */}
      {isOpen && (
        <div className="flex flex-col gap-2">

          {/* Inline add form — appears when a type chip is selected */}
          {addingType && (
            <ShelfAddForm
              type={addingType}
              groupId={defaultGroupId}
              onAddGroup={groupCallbacks.onAddGroup}
              onAddItem={groupCallbacks.onAddItem}
              onDone={() => setAddingType(null)}
            />
          )}

          {/* Groups / items */}
          {groups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {groups.map(group => (
                <GroupComponent
                  key={group.id}
                  group={group}
                  sectionId={sectionId}
                  onAddItem={groupCallbacks.onAddItem}
                  onPushItem={groupCallbacks.onPushItem}
                  onToggleItem={groupCallbacks.onToggleItem}
                  onDeleteItem={groupCallbacks.onDeleteItem}
                  onUpdateItem={groupCallbacks.onUpdateItem}
                  onRenameGroup={groupCallbacks.onRenameGroup}
                  onDeleteGroup={groupCallbacks.onDeleteGroup}
                  onRefresh={groupCallbacks.onRefresh}
                  density={density}
                />
              ))}
            </div>
          ) : !addingType ? (
            /* ── Empty state ── */
            <div className="flex flex-col py-6 gap-3" style={{ paddingLeft: '2px' }}>
              <p className="text-xs" style={{ color: '#263043', fontStyle: 'italic' }}>
                A place for notes, links, and references.
              </p>
              {/* Primary CTAs — one per type */}
              <div className="flex items-center gap-2">
                {TYPE_CHIPS.map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => setAddingType(type)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ backgroundColor: '#1a2236', color: '#94a3b8', border: '1px solid #263043' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#263043'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1a2236'; }}
                  >
                    <Plus className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Add section (power-user feature — sits quietly at the bottom) ── */}
          {groups.length > 0 && (
            showSection ? (
              <form
                onSubmit={handleAddSection}
                className="flex items-center gap-2 px-2 py-2 rounded-lg"
                style={{ backgroundColor: '#070b14', border: '1px solid #1a2236' }}
              >
                <input
                  autoFocus
                  value={sectionName}
                  onChange={e => setSectionName(e.target.value)}
                  placeholder="Section name (e.g. Notes, Links, References)"
                  className="flex-1 text-xs bg-transparent outline-none"
                  style={{ color: '#f1f5f9' }}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowSection(false); setSectionName(''); } }}
                />
                <button
                  type="submit"
                  disabled={!sectionName.trim()}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg disabled:opacity-40 transition-colors"
                  style={{ backgroundColor: '#1a2236', color: '#94a3b8' }}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSection(false); setSectionName(''); }}
                  style={{ color: '#374151', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowSection(true)}
                className="self-start text-[10px] transition-colors"
                style={{ color: '#263043', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#4b5563'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#263043'; }}
              >
                + Add section
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
