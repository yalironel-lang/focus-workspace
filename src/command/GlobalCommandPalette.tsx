import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen,
  BookOpenCheck,
  Calendar,
  ChevronRight,
  FileText,
  Hash,
  LayoutDashboard,
  Play,
  Plus,
  Search,
  StickyNote,
  Calculator,
  LineChart,
  Link2,
  Unlink,
  X,
  Zap,
  Brain,
  Sparkles,
  History,
  ClipboardList,
  RefreshCw,
  GitBranch,
  File,
  HardDrive,
  ScanLine,
  BookMarked,
  LayoutGrid,
} from 'lucide-react';
import { SessionModal } from '../components/SessionModal';
import { IntelligenceModal } from '../components/ai/IntelligenceModal';
import { WorkspaceRecoveryModal } from '../components/recovery/WorkspaceRecoveryModal';
import { isCommandPaletteBlockedTarget } from './isBlockedTarget';
import { filterAndSortCommands } from './matchCommands';
import {
  useCommandPalette,
  getFreeSpaceHandlersSnapshot,
  getAIWorkspaceHandlersSnapshot,
  getFocusModeHandlersSnapshot,
  getWorkspaceStarterHandlersSnapshot,
} from './CommandPaletteContext';
import { useAIAvailability } from '../hooks/useAIAvailability';
import { LIBRARY_OPEN_CREATE_FLAG } from './constants';
import type { CommandItem } from './types';

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="tabular-nums px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.45)',
      }}
    >
      {children}
    </kbd>
  );
}

export function GlobalCommandPalette() {
  const ctx = useCommandPalette();
  const {
    paletteOpen,
    closePalette,
    togglePalette,
    freeSpaceVersion,
    sections,
    recentIdsOrdered,
    lastSession,
    isRecentSession,
    tokens,
    sectionIdFromRoute,
    navigate,
    openSessionModal,
    sessionModalOpen,
    setSessionModalOpen,
    intelligenceModalOpen,
    setIntelligenceModalOpen,
    openIntelligenceModal,
    aiWorkspaceVersion,
    focusModeVersion,
    workspaceStarterVersion,
  } = ctx;

  const aiAvail = useAIAvailability();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [workspaceRecoveryOpen, setWorkspaceRecoveryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo((): CommandItem[] => {
    const list: CommandItem[] = [];
    const fs = getFreeSpaceHandlersSnapshot();
    const ai = getAIWorkspaceHandlersSnapshot();
    const inSection = !!sectionIdFromRoute;
    const cloudConfigured = aiAvail.configured;
    const sk = ai?.getSelectionKind() ?? 'none';

    list.push(
      {
        id: 'nav-dashboard',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Go to Dashboard',
        subtitle: 'Workspace library',
        keywords: ['home', 'library', 'spaces'],
        icon: BookOpenCheck,
        priority: 2,
        run: () => {
          closePalette();
          navigate('/dashboard');
        },
      },
      {
        id: 'nav-desk',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Open Personal Desk',
        subtitle: 'Canvas & modules',
        keywords: ['desk', 'canvas', 'space'],
        icon: LayoutDashboard,
        priority: 3,
        run: () => {
          closePalette();
          navigate('/desk');
        },
      },
      {
        id: 'nav-schedule',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Open Schedule',
        keywords: ['calendar', 'week'],
        icon: Calendar,
        priority: 4,
        run: () => {
          closePalette();
          navigate('/schedule');
        },
      },
      {
        id: 'nav-session',
        group: 'navigation',
        groupLabel: 'Navigation',
        label: 'Start Focus Session',
        subtitle: 'Full-screen focus run',
        keywords: ['focus', 'timer'],
        icon: Play,
        priority: 5,
        run: () => {
          closePalette();
          navigate('/session');
        },
      },
    );

    list.push({
      id: 'workspace-recovery',
      group: 'recovery',
      groupLabel: 'Recovery',
      label: 'Workspace recovery…',
      subtitle: sectionIdFromRoute
        ? 'Export, import, repair — this workspace'
        : 'Open a workspace to use recovery tools',
      keywords: ['backup', 'import', 'export', 'repair', 'reset', 'corrupt', 'json', 'free space'],
      icon: HardDrive,
      priority: 5.35,
      disabled: !sectionIdFromRoute,
      disabledHint: 'Open a workspace from the library first',
      run: () => {
        closePalette();
        setWorkspaceRecoveryOpen(true);
      },
    });

    const fmSnap = getFocusModeHandlersSnapshot();
    const fmActive = fmSnap?.getMode() ?? null;

    if (inSection) {
      list.push(
        {
          id: 'focus-review',
          group: 'focus-modes',
          groupLabel: 'Focus Modes',
          label: 'Review Focus',
          subtitle: 'Mistakes and linked notes come forward',
          keywords: ['review', 'reflect', 'mistake', 'focus mode', 'cognitive', 'slips'],
          icon: ScanLine,
          priority: 5.4,
          run: () => {
            getFocusModeHandlersSnapshot()?.setMode('review');
            closePalette();
          },
        },
        {
          id: 'focus-reading',
          group: 'focus-modes',
          groupLabel: 'Focus Modes',
          label: 'Reading Focus',
          subtitle: 'PDFs and notebooks settle into view',
          keywords: ['read', 'pdf', 'document', 'focus mode'],
          icon: BookMarked,
          priority: 5.41,
          run: () => {
            getFocusModeHandlersSnapshot()?.setMode('reading');
            closePalette();
          },
        },
        {
          id: 'focus-solving',
          group: 'focus-modes',
          groupLabel: 'Focus Modes',
          label: 'Solving Focus',
          subtitle: 'Calculator, graph, and notes feel active',
          keywords: ['solve', 'math', 'graph', 'problem', 'focus mode'],
          icon: Calculator,
          priority: 5.42,
          run: () => {
            getFocusModeHandlersSnapshot()?.setMode('solving');
            closePalette();
          },
        },
        {
          id: 'focus-thinking',
          group: 'focus-modes',
          groupLabel: 'Focus Modes',
          label: 'Thinking Focus',
          subtitle: 'Connections and space widen slightly',
          keywords: ['think', 'spatial', 'links', 'explore', 'focus mode'],
          icon: GitBranch,
          priority: 5.43,
          run: () => {
            getFocusModeHandlersSnapshot()?.setMode('thinking');
            closePalette();
          },
        },
        {
          id: 'focus-exit',
          group: 'focus-modes',
          groupLabel: 'Focus Modes',
          label: 'Exit Focus',
          subtitle: 'Return to neutral presentation',
          keywords: ['exit', 'clear', 'off', 'normal', 'focus mode'],
          icon: X,
          priority: 5.44,
          disabled: !fmActive,
          disabledHint: 'No focus mode is active',
          run: () => {
            getFocusModeHandlersSnapshot()?.setMode(null);
            closePalette();
          },
        },
      );

      const ws = getWorkspaceStarterHandlersSnapshot();
      list.push(
        {
          id: 'starter-exam-prep',
          group: 'workspace-starters',
          groupLabel: 'Workspace starters',
          label: 'Apply Exam Prep starter',
          subtitle: 'Notebook, mistakes, review note, PDF, tools',
          keywords: ['starter', 'exam', 'prep', 'layout', 'template', 'desk'],
          icon: LayoutGrid,
          priority: 5.45,
          disabled: !ws,
          disabledHint: 'Open a workspace to apply starters',
          run: () => {
            getWorkspaceStarterHandlersSnapshot()?.applyStarter('exam-prep');
            closePalette();
          },
        },
        {
          id: 'starter-deep-reading',
          group: 'workspace-starters',
          groupLabel: 'Workspace starters',
          label: 'Apply Reading starter',
          subtitle: 'Large PDF, margin notebook, quotes card',
          keywords: ['starter', 'reading', 'pdf', 'deep', 'layout', 'template'],
          icon: LayoutGrid,
          priority: 5.46,
          disabled: !ws,
          disabledHint: 'Open a workspace to apply starters',
          run: () => {
            getWorkspaceStarterHandlersSnapshot()?.applyStarter('deep-reading');
            closePalette();
          },
        },
        {
          id: 'starter-problem-solving',
          group: 'workspace-starters',
          groupLabel: 'Workspace starters',
          label: 'Apply Solving starter',
          subtitle: 'Notebook, calculator, graph, scratch, slips',
          keywords: ['starter', 'solve', 'math', 'problem', 'layout', 'template'],
          icon: LayoutGrid,
          priority: 5.47,
          disabled: !ws,
          disabledHint: 'Open a workspace to apply starters',
          run: () => {
            getWorkspaceStarterHandlersSnapshot()?.applyStarter('problem-solving');
            closePalette();
          },
        },
        {
          id: 'starter-research-thinking',
          group: 'workspace-starters',
          groupLabel: 'Workspace starters',
          label: 'Apply Thinking starter',
          subtitle: 'Connected notes in a wide map',
          keywords: ['starter', 'research', 'thinking', 'ideas', 'layout', 'template'],
          icon: LayoutGrid,
          priority: 5.48,
          disabled: !ws,
          disabledHint: 'Open a workspace to apply starters',
          run: () => {
            getWorkspaceStarterHandlersSnapshot()?.applyStarter('research-thinking');
            closePalette();
          },
        },
      );
    }

    list.push({
      id: 'intelligence-settings',
      group: 'intelligence',
      groupLabel: 'Intelligence',
      label: 'Intelligence…',
      subtitle: 'Local tools first; optional cloud model',
      keywords: ['intelligence', 'local', 'mistakes', 'canvas', 'review', 'optional', 'cloud', 'openai', 'openrouter'],
      icon: Sparkles,
      priority: 6.5,
      run: () => {
        closePalette();
        openIntelligenceModal();
      },
    });

    list.push(
      {
        id: 'quick-new-session',
        group: 'quick',
        groupLabel: 'Quick actions',
        label: 'New session',
        subtitle: 'Pick a workspace to enter focus',
        keywords: ['session', 'modal'],
        icon: Zap,
        priority: 6,
        run: () => {
          if (sections.length === 0) {
            toast.error('Create a workspace first');
            return;
          }
          openSessionModal();
        },
      },
      {
        id: 'quick-last-ws',
        group: 'quick',
        groupLabel: 'Quick actions',
        label: 'Return to last workspace',
        subtitle: isRecentSession && lastSession ? lastSession.sectionTitle : 'Open your most recent space',
        keywords: ['recent', 'continue', 'back'],
        icon: BookOpen,
        priority: 7,
        disabled: !isRecentSession || !lastSession,
        disabledHint: 'No recent workspace on this device',
        run: () => {
          if (!lastSession) return;
          closePalette();
          navigate(`/section/${lastSession.sectionId}`);
        },
      },
    );

    list.push({
      id: 'ws-create',
      group: 'workspace',
      groupLabel: 'Workspaces',
      label: 'Create workspace',
      subtitle: 'Opens library with name field',
      keywords: ['new', 'add', 'course', 'project'],
      icon: Plus,
      priority: 8,
      run: () => {
        try {
          sessionStorage.setItem(LIBRARY_OPEN_CREATE_FLAG, '1');
        } catch {
          /* ignore */
        }
        closePalette();
        navigate('/dashboard');
      },
    });

    const byId = new Map(sections.map(s => [s.id, s]));
    for (const rid of recentIdsOrdered) {
      const s = byId.get(rid);
      if (!s) continue;
      list.push({
        id: `ws-open-${s.id}`,
        group: 'search',
        groupLabel: 'Recent',
        label: s.title,
        subtitle: 'Recently opened',
        keywords: [s.title],
        icon: Hash,
        priority: 10,
        run: () => {
          closePalette();
          navigate(`/section/${s.id}`);
        },
      });
    }

    for (const s of [...sections].sort((a, b) => a.title.localeCompare(b.title))) {
      if (recentIdsOrdered.includes(s.id)) continue;
      list.push({
        id: `ws-all-${s.id}`,
        group: 'workspace',
        groupLabel: 'Workspaces',
        label: s.title,
        subtitle: 'Open workspace',
        keywords: [s.title],
        icon: BookOpen,
        priority: 20,
        run: () => {
          closePalette();
          navigate(`/section/${s.id}`);
        },
      });
    }

    if (inSection) {
      const hasFs = !!fs;
      list.push(
        {
          id: 'intel-review-mistakes',
          group: 'intelligence',
          groupLabel: 'Intelligence',
          label: 'Review mistakes',
          subtitle: 'Local · on your canvas',
          keywords: ['review', 'mistake', 'reflect', 'local'],
          icon: Sparkles,
          priority: 11.5,
          disabled: !hasFs || !fs?.openMistakeReviewAll,
          disabledHint: 'Open Free Space in this workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.openMistakeReviewAll) return;
            closePalette();
            h.openMistakeReviewAll();
          },
        },
        {
          id: 'intel-neglected-mistakes',
          group: 'intelligence',
          groupLabel: 'Intelligence',
          label: 'Show neglected mistakes',
          subtitle: 'Local · quiet for a while',
          keywords: ['stale', 'old', 'forgot', 'local'],
          icon: History,
          priority: 11.55,
          disabled: !hasFs || !fs?.openMistakeReviewNeglected,
          disabledHint: 'Open Free Space in this workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.openMistakeReviewNeglected) return;
            closePalette();
            h.openMistakeReviewNeglected();
          },
        },
        {
          id: 'intel-low-confidence-mistakes',
          group: 'intelligence',
          groupLabel: 'Intelligence',
          label: 'Show low-confidence mistakes',
          subtitle: 'Local · still fragile',
          keywords: ['uncertain', 'weak', 'local'],
          icon: Hash,
          priority: 11.58,
          disabled: !hasFs || !fs?.openMistakeReviewLowConfidence,
          disabledHint: 'Open Free Space in this workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.openMistakeReviewLowConfidence) return;
            closePalette();
            h.openMistakeReviewLowConfidence();
          },
        },
        {
          id: 'fs-notebook',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add notebook',
          subtitle: hasFs ? 'Place on canvas' : 'Switching to Free Space…',
          keywords: ['note', 'write'],
          icon: FileText,
          priority: 12,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addNotebook) return;
            closePalette();
            h.addNotebook();
          },
        },
        {
          id: 'fs-text',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add text card',
          subtitle: 'Quick note object',
          keywords: ['note', 'card'],
          icon: StickyNote,
          priority: 13,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addTextCard) return;
            closePalette();
            h.addTextCard();
          },
        },
        {
          id: 'fs-calc',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add calculator',
          subtitle: 'Native math scratchpad',
          keywords: ['math'],
          icon: Calculator,
          priority: 14,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addCalculator) return;
            closePalette();
            h.addCalculator();
          },
        },
        {
          id: 'fs-graph',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add graph',
          subtitle: 'Plot y = f(x)',
          keywords: ['chart', 'plot'],
          icon: LineChart,
          priority: 15,
          disabled: !hasFs,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addGraph) return;
            closePalette();
            h.addGraph();
          },
        },
        {
          id: 'fs-pdf',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add PDF window',
          subtitle: 'Local file on your canvas',
          keywords: ['pdf', 'file', 'document', 'read', 'study'],
          icon: File,
          priority: 15.25,
          disabled: !hasFs || !fs?.addPdf,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addPdf) return;
            closePalette();
            h.addPdf();
          },
        },
        {
          id: 'fs-mistake',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Add mistake',
          subtitle: 'Capture what went wrong',
          keywords: ['error', 'wrong', 'learn', 'slip'],
          icon: Brain,
          priority: 15.5,
          disabled: !hasFs || !fs?.addMistake,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.addMistake) return;
            closePalette();
            h.addMistake();
          },
        },
        {
          id: 'fs-mistake-review',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Review mistakes',
          subtitle: 'Calm pass through your slips',
          keywords: ['review', 'mistake', 'reflect'],
          icon: Sparkles,
          priority: 15.6,
          disabled: !hasFs || !fs?.openMistakeReviewAll,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.openMistakeReviewAll) return;
            closePalette();
            h.openMistakeReviewAll();
          },
        },
        {
          id: 'fs-mistake-neglected',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Show neglected mistakes',
          subtitle: 'Quiet for a while',
          keywords: ['stale', 'old', 'forgot'],
          icon: History,
          priority: 15.65,
          disabled: !hasFs || !fs?.openMistakeReviewNeglected,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.openMistakeReviewNeglected) return;
            closePalette();
            h.openMistakeReviewNeglected();
          },
        },
        {
          id: 'fs-mistake-low',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Show low-confidence mistakes',
          subtitle: 'Still fragile',
          keywords: ['uncertain', 'weak'],
          icon: Hash,
          priority: 15.7,
          disabled: !hasFs || !fs?.openMistakeReviewLowConfidence,
          disabledHint: 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.openMistakeReviewLowConfidence) return;
            closePalette();
            h.openMistakeReviewLowConfidence();
          },
        },
        {
          id: 'fs-note-to-mistake',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Convert note to mistake',
          subtitle: 'Uses selected text card',
          keywords: ['transform', 'capture'],
          icon: StickyNote,
          priority: 15.75,
          disabled: !hasFs || !fs?.convertSelectedNoteToMistake || !fs.getFreeSpaceSelectedId?.(),
          disabledHint: !fs?.getFreeSpaceSelectedId?.()
            ? 'Select a note on Free Space first'
            : 'Open Free Space in a workspace',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.convertSelectedNoteToMistake) return;
            closePalette();
            h.convertSelectedNoteToMistake();
          },
        },
        {
          id: 'fs-connect-selected',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Connect selected object…',
          subtitle: 'Pick another object to link',
          keywords: ['link', 'relate', 'edge', 'join'],
          icon: Link2,
          priority: 16,
          disabled: !hasFs || !fs?.getFreeSpaceSelectedId?.() || !fs.getFreeSpaceSelectedId(),
          disabledHint: !fs?.getFreeSpaceSelectedId?.()
            ? 'Select an object on Free Space first'
            : 'Switch to Free Space and select an object',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.startConnectFromSelected) return;
            closePalette();
            h.startConnectFromSelected();
          },
        },
        {
          id: 'fs-clear-connections',
          group: 'free-space',
          groupLabel: 'Free Space',
          label: 'Clear connections',
          subtitle: 'Remove links for selected object',
          keywords: ['unlink', 'disconnect', 'remove links'],
          icon: Unlink,
          priority: 17,
          disabled: !hasFs || !fs?.getFreeSpaceSelectedId?.() || !fs.getFreeSpaceSelectedId(),
          disabledHint: !fs?.getFreeSpaceSelectedId?.()
            ? 'Select an object on Free Space first'
            : 'Switch to Free Space and select an object',
          run: () => {
            const h = getFreeSpaceHandlersSnapshot();
            if (!h?.clearConnectionsForSelected) return;
            closePalette();
            h.clearConnectionsForSelected();
          },
        },
        ...(cloudConfigured
          ? ([
              {
                id: 'cloud-summarize-note',
                group: 'advanced-cloud-ai',
                groupLabel: 'Advanced cloud model',
                label: 'Summarize note (cloud)',
                subtitle: 'Uses your connected provider',
                keywords: ['summary', 'tl dr', 'compress', 'cloud'],
                icon: FileText,
                priority: 44,
                disabled: !hasFs || !ai || (sk !== 'note' && sk !== 'notebook'),
                disabledHint: !hasFs
                  ? 'Open Free Space in a workspace'
                  : !ai
                    ? 'Open this workspace on the canvas'
                    : 'Select a note or notebook on the canvas',
                run: () => {
                  const h = getAIWorkspaceHandlersSnapshot();
                  if (!h?.summarizeSelection) return;
                  closePalette();
                  void h.summarizeSelection();
                },
              },
              {
                id: 'cloud-explain-mistake',
                group: 'advanced-cloud-ai',
                groupLabel: 'Advanced cloud model',
                label: 'Explain mistake simply (cloud)',
                subtitle: 'Uses your connected provider',
                keywords: ['why', 'wrong', 'learn', 'cloud'],
                icon: Brain,
                priority: 45,
                disabled: !hasFs || !ai || sk !== 'mistake',
                disabledHint: !hasFs
                  ? 'Open Free Space in a workspace'
                  : !ai
                    ? 'Open this workspace on the canvas'
                    : 'Select a mistake card on the canvas',
                run: () => {
                  const h = getAIWorkspaceHandlersSnapshot();
                  if (!h?.explainMistakeSelection) return;
                  closePalette();
                  void h.explainMistakeSelection();
                },
              },
              {
                id: 'cloud-practice',
                group: 'advanced-cloud-ai',
                groupLabel: 'Advanced cloud model',
                label: 'Generate practice questions (cloud)',
                subtitle: 'Uses your connected provider',
                keywords: ['quiz', 'drill', 'study', 'cloud'],
                icon: ClipboardList,
                priority: 46,
                disabled: !hasFs || !ai || (sk !== 'note' && sk !== 'notebook' && sk !== 'mistake'),
                disabledHint: !hasFs
                  ? 'Open Free Space in a workspace'
                  : !ai
                    ? 'Open this workspace on the canvas'
                    : 'Select a note, notebook, or mistake',
                run: () => {
                  const h = getAIWorkspaceHandlersSnapshot();
                  if (!h?.practiceQuestionsSelection) return;
                  closePalette();
                  void h.practiceQuestionsSelection();
                },
              },
              {
                id: 'cloud-rephrase',
                group: 'advanced-cloud-ai',
                groupLabel: 'Advanced cloud model',
                label: 'Rephrase concept (cloud)',
                subtitle: 'Uses your connected provider',
                keywords: ['rewrite', 'clarify', 'cloud'],
                icon: RefreshCw,
                priority: 47,
                disabled: !hasFs || !ai || (sk !== 'note' && sk !== 'notebook' && sk !== 'mistake'),
                disabledHint: !hasFs
                  ? 'Open Free Space in a workspace'
                  : !ai
                    ? 'Open this workspace on the canvas'
                    : 'Select a note, notebook, or mistake',
                run: () => {
                  const h = getAIWorkspaceHandlersSnapshot();
                  if (!h?.rephraseSelection) return;
                  closePalette();
                  void h.rephraseSelection();
                },
              },
              {
                id: 'cloud-related-mistakes',
                group: 'advanced-cloud-ai',
                groupLabel: 'Advanced cloud model',
                label: 'Suggest related mistakes (cloud)',
                subtitle: 'Uses your connected provider',
                keywords: ['links', 'patterns', 'review', 'cloud'],
                icon: GitBranch,
                priority: 48,
                disabled: !hasFs || !ai || sk !== 'mistake',
                disabledHint: !hasFs
                  ? 'Open Free Space in a workspace'
                  : !ai
                    ? 'Open this workspace on the canvas'
                    : 'Select a mistake card on the canvas',
                run: () => {
                  const h = getAIWorkspaceHandlersSnapshot();
                  if (!h?.suggestRelatedMistakesSelection) return;
                  closePalette();
                  void h.suggestRelatedMistakesSelection();
                },
              },
            ] as CommandItem[])
          : []),
      );
    }

    return list;
  }, [
    sections,
    recentIdsOrdered,
    lastSession,
    isRecentSession,
    sectionIdFromRoute,
    closePalette,
    navigate,
    openSessionModal,
    freeSpaceVersion,
    aiAvail,
    aiWorkspaceVersion,
    focusModeVersion,
    workspaceStarterVersion,
    openIntelligenceModal,
  ]);

  const filtered = useMemo(() => filterAndSortCommands(query, commands), [commands, query]);

  useEffect(() => {
    if (!paletteOpen) return;
    setActiveIndex(0);
    setQuery('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [paletteOpen]);

  useEffect(() => {
    setActiveIndex(i => {
      if (filtered.length === 0) return 0;
      return Math.min(i, filtered.length - 1);
    });
  }, [filtered.length, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'k') return;
      if (isCommandPaletteBlockedTarget(e.target)) return;
      e.preventDefault();
      togglePalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePalette]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i =>
          filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
        );
      }
      if (e.key === 'Enter') {
        const item = filtered[activeIndex];
        if (!item || item.disabled) return;
        e.preventDefault();
        item.run();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [paletteOpen, filtered, activeIndex, closePalette]);

  useEffect(() => {
    if (!paletteOpen || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, paletteOpen]);

  const runIndex = useCallback(
    (idx: number) => {
      const item = filtered[idx];
      if (!item || item.disabled) return;
      item.run();
    },
    [filtered],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: { item: CommandItem; index: number }[] }>();
    filtered.forEach((item, index) => {
      const key = item.group;
      if (!map.has(key)) map.set(key, { label: item.groupLabel, items: [] });
      map.get(key)!.items.push({ item, index });
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      {paletteOpen && (
        <div
          className="fixed inset-0 z-[300] flex justify-center pt-[10vh] px-4 pb-8"
          style={{ pointerEvents: 'auto' }}
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closePalette();
          }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2,6,14,0.55)', backdropFilter: 'blur(6px)' }}
            aria-hidden
          />
          <div
            className="relative w-full max-w-[520px] rounded-2xl overflow-hidden flex flex-col max-h-[min(72vh,560px)]"
            data-fw-command-palette-root="1"
            style={{
              backgroundColor: 'rgba(12,16,28,0.92)',
              border: `1px solid ${tokens.cardBorder}`,
              boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset`,
              backdropFilter: 'blur(20px) saturate(1.2)',
              animation: 'fwCmdPaletteIn 0.16s ease-out',
            }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: tokens.textGhost }} strokeWidth={2} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search commands and workspaces…"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                style={{ color: tokens.textPrimary }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => closePalette()}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: tokens.textGhost }}
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: tokens.textGhost }}>
                Command
              </span>
              <div className="flex items-center gap-2">
                <Kbd>↑↓</Kbd>
                <Kbd>↵</Kbd>
                <Kbd>esc</Kbd>
              </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-3 min-h-[200px]">
              {filtered.length === 0 ? (
                <p className="text-sm px-3 py-8 text-center" style={{ color: tokens.textMuted }}>
                  No matches
                </p>
              ) : (
                grouped.map(([groupKey, { label, items }]) => (
                  <div key={groupKey} className="mb-2">
                    <p
                      className="text-[10px] font-bold tracking-[0.16em] uppercase px-2 py-1.5"
                      style={{ color: tokens.textGhost }}
                    >
                      {label}
                    </p>
                    {items.map(({ item, index }) => {
                      const active = index === activeIndex;
                      const Icon = item.icon ?? ChevronRight;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-cmd-index={index}
                          disabled={item.disabled}
                          onClick={() => runIndex(index)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className="w-full flex items-start gap-3 px-2.5 py-2 rounded-xl text-left transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: active ? `${tokens.accent}12` : 'transparent',
                            border: active ? `1px solid ${tokens.accent}22` : '1px solid transparent',
                          }}
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              backgroundColor: active ? `${tokens.accent}18` : tokens.wellBg,
                              border: `1px solid ${active ? `${tokens.accent}30` : tokens.cardBorder}`,
                            }}
                          >
                            <Icon
                              className="w-3.5 h-3.5"
                              strokeWidth={2}
                              style={{ color: active ? tokens.accent : tokens.textMuted }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div
                              className="text-[13px] font-medium leading-tight truncate"
                              style={{ color: item.disabled ? tokens.textGhost : tokens.textPrimary }}
                            >
                              {item.label}
                            </div>
                            <div className="text-[11px] leading-snug mt-0.5" style={{ color: tokens.textMuted }}>
                              {item.disabled ? item.disabledHint ?? item.subtitle : item.subtitle}
                            </div>
                          </div>
                          {active && !item.disabled && (
                            <ChevronRight className="w-4 h-4 shrink-0 mt-1.5" style={{ color: tokens.textGhost }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {sessionModalOpen && (
        <SessionModal sections={sections} onClose={() => setSessionModalOpen(false)} />
      )}

      {intelligenceModalOpen && (
        <IntelligenceModal tokens={tokens} onClose={() => setIntelligenceModalOpen(false)} />
      )}

      {workspaceRecoveryOpen && sectionIdFromRoute && (
        <WorkspaceRecoveryModal
          open={workspaceRecoveryOpen}
          onClose={() => setWorkspaceRecoveryOpen(false)}
          tokens={tokens}
          sectionId={sectionIdFromRoute}
          sectionTitle={sections.find(s => s.id === sectionIdFromRoute)?.title}
        />
      )}
    </>
  );
}
