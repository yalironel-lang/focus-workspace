import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { useRecentWorkspaces } from '../hooks/useRecentWorkspaces';
import { useFocusMode } from '../hooks/useFocusMode';
import { FOCUS_MODE_BADGE } from '../focusMode/focusModeTypes';
import { useCommandPalette } from '../command/CommandPaletteContext';
import type { AIWorkspaceHandlers } from '../command/aiWorkspaceHandlersRef';
import { isQuickCaptureBlockedTarget } from '../command/isBlockedTarget';
import { buildWorkspaceStarterPack } from '../workspaceStarter/buildWorkspaceStarterPack';
import type { WorkspaceStarterId } from '../workspaceStarter/workspaceStarterTypes';
import { starterDismissStorageKey, WORKSPACE_STARTER_LABEL } from '../workspaceStarter/workspaceStarterTypes';
import { WorkspaceStarterOverlay } from '../components/workspace-starter/WorkspaceStarterOverlay';
import { WorkspaceStarterHints } from '../components/workspace-starter/WorkspaceStarterHints';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { useWorkspaceCustomization, WorkspaceCustomization } from '../hooks/useWorkspaceCustomization';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useSectionCanvasMode } from '../hooks/useSectionCanvasMode';
import { useSectionBlockPositions } from '../hooks/useSectionBlockPositions';
import {
  useSectionFreeSpaceObjects,
  type ProjectObjectType,
  ensureProjectObjectContent,
} from '../hooks/useSectionFreeSpaceObjects';
import { GroupComponent } from '../components/GroupComponent';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { CourseHub } from '../components/CourseHub';
import { CustomizeModal } from '../components/CustomizeModal';
import { DesignModeBar } from '../components/DesignModeBar';
import { FreeformCanvas } from '../components/canvas/FreeformCanvas';
import { FreeSpaceArrangeControl } from '../components/canvas/FreeSpaceArrangeControl';
import {
  computeFreeSpaceTemplateLayout,
  type FreeSpaceTemplateId,
} from '../lib/sectionFreeSpaceLayoutTemplates';
import {
  installFwFreeSpaceDevTools,
  setFwFreeSpaceDevSectionContext,
} from '../lib/freeSpacePersistence';
import { FreeSpaceCanvasErrorBoundary } from '../components/canvas/FreeSpaceCanvasErrorBoundary';
import { ProjectSpaceObjectRenderer } from '../components/project-space/ProjectSpaceObjectRenderer';
import { QuickCaptureOverlay } from '../components/quick-capture/QuickCaptureOverlay';
import { MistakeReviewOverlay } from '../components/project-space/MistakeReviewOverlay';
import { computeMistakeInsights, buildMistakeReviewQueueFiltered } from '../lib/mistakeIntelligence';
import { isAcceptablePdfFile, savePdfBlob } from '../lib/freeSpacePdfIdb';
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
  Loader2, ArrowLeft, CheckCircle2, Circle, ArrowRight, Plus, X, Calendar,
  AlertTriangle, PlayCircle, ChevronDown, ChevronRight,
  Sliders,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Item, ItemType, SectionWithProgress, Deadline } from '../types';
import { loadSession, saveSession, pickTasks, pickPortals } from '../utils/sessionPlan';

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


// ── SpaceNav ──────────────────────────────────────────────────────────────────

function SpaceNav({ title, accent, tokens, isCustomizing, onBack, onCustomize, onExitCustomize, onResetCustomize }: {
  title: string;
  accent: string;
  tokens: ReturnType<typeof useAtmosphere>['tokens'];
  isCustomizing: boolean;
  onBack: () => void;
  onCustomize: () => void;
  onExitCustomize: () => void;
  onResetCustomize: () => void;
}) {
  return (
    <nav style={{
      height: '44px', backgroundColor: tokens.navBg,
      borderBottom: `1px solid ${tokens.divider}`,
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={onBack} style={{ color: tokens.textMuted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', transition: 'color 0.3s cubic-bezier(0.4,0,0.2,1)' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = tokens.textSecondary)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = tokens.textMuted)}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <span style={{ width: '1px', height: '14px', backgroundColor: tokens.divider, flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 500, color: tokens.textSecondary, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
          {title}
        </span>
        <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: accent, flexShrink: 0, opacity: 0.6 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {isCustomizing ? (
          <>
            <button onClick={onResetCustomize} style={{ fontSize: '11px', color: tokens.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = tokens.textSecondary)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = tokens.textMuted)}>
              Reset
            </button>
            <button onClick={onExitCustomize} style={{ fontSize: '11px', fontWeight: 700, color: '#000', backgroundColor: '#f59e0b', border: 'none', cursor: 'pointer', padding: '4px 12px', borderRadius: '8px' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fbbf24')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f59e0b')}>
              Done
            </button>
          </>
        ) : (
          <button onClick={onCustomize} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: tokens.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = tokens.textSecondary; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = tokens.textMuted; }}>
            <Sliders className="w-3 h-3" />
          </button>
        )}
      </div>
    </nav>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#263043' }}>
              Dates
            </span>
            {urgentCount > 0 && (
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                {urgentCount}
              </span>
            )}
          </div>
          <button onClick={() => setShowAdd(true)} style={{ fontSize: '11px', color: '#263043', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#f59e0b')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#263043')}>
            +
          </button>
        </div>

        {pending.length === 0 ? (
          <button onClick={() => setShowAdd(true)} style={{ fontSize: '11px', color: '#1a2230', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#374151')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#1a2230')}>
            + Add a date
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pending.map(d => {
              const lbl = urgencyLabel(d);
              const dot = urgencyDot(d);
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: dot, flexShrink: 0, marginTop: '4px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                      {d.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                      <span style={{ fontSize: '10px', color: '#263043' }}>{formatDueDate(d.due_date)}</span>
                      {lbl.text && <span style={{ fontSize: '10px', color: lbl.color, fontWeight: 600 }}>· {lbl.text}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleDeadline(d.id, !d.completed).catch(() => {})}
                    style={{ flexShrink: 0, color: '#1a2230', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '1px' }}
                    title="Mark done"
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#10b981')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#1a2230')}>
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

  const {
    section, loading, fetchSection,
    addItem, pushItem, updateItem, deleteItem, toggleTask,
    addGroup, updateGroup, deleteGroup, setExamDate,
  } = useSectionDetail(id);
  const { touch: touchRecentWorkspace } = useRecentWorkspaces();

  useEffect(() => {
    if (section?.id) touchRecentWorkspace(section.id);
  }, [section?.id, touchRecentWorkspace]);

  const { links: courseLinks } = usePortalLinks('course', id);
  const { links: globalLinks } = usePortalLinks('global');
  const sectionId = id ?? '';
  const { customization, setCustomization } = useWorkspaceCustomization(sectionId);
  const { tokens } = useAtmosphere();
  const sectionCanvas = useSectionCanvasMode(sectionId);
  const sectionPositions = useSectionBlockPositions(sectionId);
  const sectionObjects = useSectionFreeSpaceObjects(sectionId);
  const sectionObjectsRef = useRef(sectionObjects);
  sectionObjectsRef.current = sectionObjects;
  const { registerFreeSpace, registerAIWorkspace, registerFocusMode, registerWorkspaceStarter, paletteOpen, sessionModalOpen } = useCommandPalette();
  const { focusMode, setFocusMode } = useFocusMode(sectionId);
  const focusModeLiveRef = useRef(focusMode);
  focusModeLiveRef.current = focusMode;

  const pendingFreeSpaceType = useRef<ProjectObjectType | null>(null);
  const pendingQuickCaptureRef = useRef<{ kind: 'note' | 'mistake'; text: string } | null>(null);
  const quickCaptureStackRef = useRef(0);

  const [showAddLane,     setShowAddLane]     = useState(false);
  const [newLaneTitle,    setNewLaneTitle]     = useState('');
  const [addingLane,      setAddingLane]       = useState(false);
  const [editingExamDate, setEditingExamDate]  = useState(false);
  const [showCustomize,   setShowCustomize]    = useState(false);
  const [sectionViewMode, setSectionViewMode] = useState<'work-surface' | 'free-space'>('work-surface');
  const [showSpaceAdd, setShowSpaceAdd] = useState(false);
  const [spaceSelectedId, setSpaceSelectedId] = useState<string | null>(null);
  const [spaceEditingId, setSpaceEditingId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [connectHoverId, setConnectHoverId] = useState<string | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickCaptureVariant, setQuickCaptureVariant] = useState<'note' | 'mistake'>('note');
  const [mistakeReviewOpen, setMistakeReviewOpen] = useState(false);
  const [mistakeReviewQueue, setMistakeReviewQueue] = useState<string[]>([]);
  const [starterDismissed, setStarterDismissed] = useState(false);
  const [starterHints, setStarterHints] = useState<string[] | null>(null);
  const [mistakeReviewIndex, setMistakeReviewIndex] = useState(0);
  const [aiAssistResult, setAiAssistResult] = useState<{ title: string; body: string } | null>(null);
  const aiRunRef = useRef<AbortController | null>(null);

  // ── Design Mode state ─────────────────────────────────────────────────────
  const [designMode,      setDesignMode]      = useState(false);
  const designSnapshot = useRef<WorkspaceCustomization | null>(null);

  // Drag-and-drop for lane reorder (HTML5 drag API)
  const [dragId,     setDragId]     = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

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
  const handleApplySpaceTemplate = useCallback(
    (templateId: FreeSpaceTemplateId) => {
      try {
        const patches = computeFreeSpaceTemplateLayout(
          templateId,
          sectionObjects.objects,
          sectionPositions.positions,
        );
        if (!patches || Object.keys(patches).length === 0) return;
        sectionPositions.applyPositions(patches);
      } catch (e) {
        console.error('[FreeSpace] template apply failed', e);
        toast.error('Could not apply layout. Try again.');
      }
    },
    [sectionObjects.objects, sectionPositions.positions, sectionPositions.applyPositions],
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

  const handleAddToSpace = useCallback((type: ProjectObjectType) => {
    const obj = sectionObjects.addObject(type);
    const base = viewportCenterWorld((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 60);
    const sizeHint =
      type === 'notebook'
        ? { w: 620, h: 520 }
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
    sectionPositions.initPos(obj.id, { x: base.x, y: base.y, ...sizeHint });
    setSpaceSelectedId(obj.id);
    setShowSpaceAdd(false);
  }, [sectionObjects, sectionPositions, viewportCenterWorld]);

  const requestFreeSpaceAdd = useCallback((type: ProjectObjectType) => {
    if (sectionViewMode === 'free-space') {
      handleAddToSpace(type);
      return;
    }
    pendingFreeSpaceType.current = type;
    setSectionViewMode('free-space');
  }, [sectionViewMode, handleAddToSpace]);

  const handlePdfDroppedOnCanvas = useCallback(
    async (file: File, worldX: number, worldY: number) => {
      if (!isAcceptablePdfFile(file)) {
        toast.error('Only PDF files are supported for now.');
        return;
      }
      const obj = sectionObjects.addObject('pdf');
      const x = Math.max(20, Math.round(worldX - 260));
      const y = Math.max(20, Math.round(worldY - 230));
      sectionPositions.initPos(obj.id, { x, y, w: 520, h: 460 });
      setSpaceSelectedId(obj.id);
      try {
        await savePdfBlob(sectionId, obj.id, file);
        sectionObjects.updateObjectFields(obj.id, {
          title: file.name.length > 80 ? `${file.name.slice(0, 78)}…` : file.name,
          content: {
            type: 'pdf',
            fileName: file.name,
            fileType: file.type || 'application/pdf',
            fileSize: file.size,
            lastOpenedAt: Date.now(),
            page: 1,
            zoom: 1,
          },
        });
      } catch {
        toast.error('Could not store this PDF on this device.');
        sectionObjects.removeObject(obj.id);
        sectionPositions.removePos(obj.id);
      }
    },
    [sectionId, sectionObjects, sectionPositions],
  );

  const createQuickCaptureNote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const obj = sectionObjects.addQuickCaptureNote(trimmed);
      const stack = quickCaptureStackRef.current++;
      const staggerX = (stack % 7) * 34 - 102;
      const staggerY = (stack % 5) * 28 - 56;
      const base = viewportCenterWorld(
        staggerX + (Math.random() - 0.5) * 20,
        staggerY + (Math.random() - 0.5) * 16,
      );
      sectionPositions.initPos(obj.id, { x: base.x, y: base.y, w: 360, h: 280 });
      setSpaceSelectedId(obj.id);
    },
    [sectionObjects, sectionPositions, viewportCenterWorld],
  );

  const createQuickCaptureMistake = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const obj = sectionObjects.addQuickCaptureMistake(trimmed);
      const stack = quickCaptureStackRef.current++;
      const staggerX = (stack % 7) * 34 - 102;
      const staggerY = (stack % 5) * 28 - 56;
      const base = viewportCenterWorld(
        staggerX + (Math.random() - 0.5) * 20,
        staggerY + (Math.random() - 0.5) * 16,
      );
      sectionPositions.initPos(obj.id, { x: base.x, y: base.y, w: 380, h: 320 });
      setSpaceSelectedId(obj.id);
    },
    [sectionObjects, sectionPositions, viewportCenterWorld],
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
      if (mistakeReviewOpen) return;
      if (paletteOpen || sessionModalOpen) return;
      if (connectSourceId) return;
      if (isQuickCaptureBlockedTarget(e.target)) return;

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
    mistakeReviewOpen,
    paletteOpen,
    sessionModalOpen,
    connectSourceId,
  ]);

  const cancelConnectMode = useCallback(() => {
    setConnectSourceId(null);
    setConnectHoverId(null);
  }, []);

  const completeFreeSpaceConnect = useCallback(
    (from: string, to: string) => {
      sectionObjects.addConnection(from, to);
      cancelConnectMode();
      toast.success('Connected');
    },
    [sectionObjects, cancelConnectMode],
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
    sectionObjects.clearConnectionsForObject(spaceSelectedId);
    toast.success('Connections cleared');
  }, [sectionViewMode, spaceSelectedId, sectionObjects]);

  const openMistakeReview = useCallback(
    (mode: 'all' | 'neglected' | 'low' = 'all') => {
      if (sectionViewMode !== 'free-space') {
        setSectionViewMode('free-space');
      }
      const q = buildMistakeReviewQueueFiltered(sectionObjects.objects, mode);
      setMistakeReviewQueue(q);
      setMistakeReviewIndex(0);
      setMistakeReviewOpen(true);
    },
    [sectionViewMode, sectionObjects.objects],
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
    const o = sectionObjects.getObject(spaceSelectedId);
    if (!o || o.type !== 'note') {
      toast.error('Select a text note to convert');
      return;
    }
    sectionObjects.convertNoteToMistake(spaceSelectedId);
    toast.success('Captured as mistake');
  }, [sectionViewMode, spaceSelectedId, sectionObjects]);

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

  const markMistakeReviewedInSession = useCallback(
    (mistakeId: string) => {
      const o = sectionObjects.getObject(mistakeId);
      if (!o || o.type !== 'mistake') return;
      const c = ensureProjectObjectContent('mistake', o.content);
      if (c.type !== 'mistake') return;
      sectionObjects.updateObjectContent(mistakeId, {
        ...c,
        timesReviewed: c.timesReviewed + 1,
        lastReviewedAt: Date.now(),
      });
    },
    [sectionObjects],
  );

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
    if (sectionViewMode !== 'free-space') cancelConnectMode();
  }, [sectionViewMode, cancelConnectMode]);

  useEffect(() => {
    cancelConnectMode();
  }, [id, cancelConnectMode]);

  useEffect(() => {
    if (!id) {
      registerFreeSpace(null);
      return;
    }
    registerFreeSpace({
      addNotebook: () => requestFreeSpaceAdd('notebook'),
      addTextCard: () => requestFreeSpaceAdd('note'),
      addMistake: () => requestFreeSpaceAdd('mistake'),
      addCalculator: () => requestFreeSpaceAdd('calculator'),
      addGraph: () => requestFreeSpaceAdd('graph'),
      addPdf: () => requestFreeSpaceAdd('pdf'),
      getFreeSpaceSelectedId: () => spaceSelectedId,
      startConnectFromSelected,
      clearConnectionsForSelected,
      openMistakeReviewAll: () => openMistakeReview('all'),
      openMistakeReviewNeglected: () => openMistakeReview('neglected'),
      openMistakeReviewLowConfidence: () => openMistakeReview('low'),
      convertSelectedNoteToMistake,
    });
    return () => registerFreeSpace(null);
  }, [
    id,
    registerFreeSpace,
    requestFreeSpaceAdd,
    spaceSelectedId,
    startConnectFromSelected,
    clearConnectionsForSelected,
    openMistakeReview,
    convertSelectedNoteToMistake,
  ]);

  const mistakeInsights = useMemo(
    () => computeMistakeInsights(sectionObjects.objects),
    [sectionObjects.objects],
  );

  useEffect(() => {
    if (mistakeReviewQueue.length === 0) {
      if (mistakeReviewIndex !== 0) setMistakeReviewIndex(0);
      return;
    }
    if (mistakeReviewIndex >= mistakeReviewQueue.length) {
      setMistakeReviewIndex(0);
    }
  }, [mistakeReviewQueue, mistakeReviewIndex]);

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
  }, [id, registerFocusMode, setFocusMode, focusMode]);

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

  const clearStarterHints = useCallback(() => setStarterHints(null), []);

  const dismissWorkspaceStarterOverlay = useCallback(() => {
    if (!sectionId) return;
    try {
      localStorage.setItem(starterDismissStorageKey(sectionId), '1');
    } catch {
      /* ignore */
    }
    setStarterDismissed(true);
  }, [sectionId]);

  const applyWorkspaceStarter = useCallback(
    (starterId: WorkspaceStarterId) => {
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
      setFocusMode(pack.focusSuggestion);
      setStarterHints(pack.hints);
      setSectionViewMode('free-space');
      setSpaceSelectedId(pack.objects[0]?.id ?? null);
      toast.success(`${WORKSPACE_STARTER_LABEL[starterId]} desk ready`);
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
    if (spaceSelectedId && !valid.has(spaceSelectedId)) setSpaceSelectedId(null);
    if (spaceEditingId && !valid.has(spaceEditingId)) setSpaceEditingId(null);
    if (connectSourceId && !valid.has(connectSourceId)) setConnectSourceId(null);
  }, [sectionObjects.objects, spaceSelectedId, spaceEditingId, connectSourceId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: tokens.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: tokens.textMuted }} />
      </div>
    );
  }

  if (!section) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: tokens.pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <h2 className="text-lg font-semibold" style={{ color: '#f8fafc' }}>
          Workspace not found
        </h2>
        <Link to="/dashboard" className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const totalItems     = section.groups.reduce((sum, g) => sum + g.items.length, 0);
  const completedItems = section.groups.reduce((sum, g) => sum + g.items.filter(i => i.completed).length, 0);
  const remaining      = totalItems - completedItems;
  const progress       = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allDone        = totalItems > 0 && remaining === 0;

  const examDays = section.exam_date ? daysUntil(section.exam_date) : null;

  const showWorkspaceStarter =
    sectionViewMode === 'free-space' &&
    sectionObjects.objects.length === 0 &&
    !starterDismissed;

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

  const renderSpaceObject = (id: string): React.ReactNode | null => {
    const obj = sectionObjects.getObject(id);
    if (!obj) return null;
    return (
      <ProjectSpaceObjectRenderer
        object={obj}
        allObjects={sectionObjects.objects}
        tokens={tokens}
        freeSpaceSectionId={sectionId}
        onChange={content => sectionObjects.updateObjectContent(id, content)}
        onTitleChange={
          obj.type === 'mistake' || obj.type === 'pdf'
            ? t => sectionObjects.updateObjectFields(id, { title: t })
            : undefined
        }
        onNotebookEditingChange={(objectId, isEditing) => {
          setSpaceEditingId(prev => (isEditing ? objectId : prev === objectId ? null : prev));
        }}
        onRequestSelectObject={setSpaceSelectedId}
      />
    );
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: tokens.pageBg,
        backgroundImage: `
          radial-gradient(circle at 24% 16%, ${tokens.ambientGlow1} 0%, transparent 34%),
          radial-gradient(circle at 78% 14%, ${tokens.ambientGlow2} 0%, transparent 30%),
          linear-gradient(180deg, ${tokens.pageBg} 0%, ${tokens.pageBg} 100%)
        `,
      }}
    >

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

      <MistakeReviewOverlay
        open={mistakeReviewOpen}
        tokens={tokens}
        objects={sectionObjects.objects}
        queueIds={mistakeReviewQueue}
        index={mistakeReviewIndex}
        setIndex={setMistakeReviewIndex}
        insights={mistakeInsights}
        onClose={() => setMistakeReviewOpen(false)}
        onMarkReviewed={markMistakeReviewedInSession}
      />

      <WorkspaceStarterHints hints={starterHints} tokens={tokens} onClear={clearStarterHints} />

      {/* ── SPACE NAV ────────────────────────────────────────────────────── */}
      <SpaceNav
        title={section.title}
        accent={accentColor}
        tokens={tokens}
        isCustomizing={designMode}
        onBack={() => navigate('/dashboard')}
        onCustomize={enterDesignMode}
        onExitCustomize={exitDesignMode}
        onResetCustomize={resetDesign}
      />

      <div
        style={{
          height: '40px',
          borderBottom: `1px solid ${tokens.divider}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          backgroundColor: tokens.navBg,
          position: 'relative',
          opacity: focusMode && sectionViewMode === 'free-space' ? 0.9 : 1,
          transition: 'opacity 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {focusMode ? (
          <div
            title="Cognitive focus is active on this workspace"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: tokens.textSecondary,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Focus · {FOCUS_MODE_BADGE[focusMode]}
          </div>
        ) : null}
        <div
          style={{
            display: 'inline-flex',
            borderRadius: '8px',
            border: `1px solid ${tokens.cardBorder}`,
            padding: '2px',
            gap: '2px',
            backgroundColor: `${tokens.wellBg}f2`,
          }}
        >
          {([
            { id: 'work-surface', label: 'Work Surface' },
            { id: 'free-space', label: 'Free Space' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setSectionViewMode(opt.id)}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.03em',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                backgroundColor: sectionViewMode === opt.id ? tokens.accent : 'transparent',
                color: sectionViewMode === opt.id ? '#000' : tokens.textSecondary,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CUSTOMIZE MODE ───────────────────────────────────────────────── */}
      {sectionViewMode === 'free-space' ? (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <FreeSpaceArrangeControl
            tokens={tokens}
            topOffset={84}
            objectCount={sectionObjects.objects.length}
            onApplyTemplate={handleApplySpaceTemplate}
            chromeQuiet={!!spaceEditingId}
          />
          <FreeSpaceCanvasErrorBoundary tokens={tokens} topOffset={84}>
            <FreeformCanvas
              tokens={tokens}
              modules={[]}
              blocks={sectionObjects.objects}
              tools={[]}
              positions={sectionPositions.positions}
              canvasState={sectionCanvas}
              designMode={true}
              selectedId={spaceSelectedId}
              focusEditingId={spaceEditingId}
              spatialAmbient
              topOffset={84}
              onSetPos={sectionPositions.setPos}
              onSelect={id => setSpaceSelectedId(id)}
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
              spatialMinimapEnabled
              onPdfDroppedOnCanvas={handlePdfDroppedOnCanvas}
              focusMode={sectionViewMode === 'free-space' ? focusMode : null}
            />
          </FreeSpaceCanvasErrorBoundary>

          {showWorkspaceStarter && (
            <WorkspaceStarterOverlay
              tokens={tokens}
              onChoose={sid => {
                applyWorkspaceStarter(sid);
              }}
              onDismiss={dismissWorkspaceStarterOverlay}
            />
          )}

          {showSpaceAdd && (
            <div
              style={{
                position: 'fixed',
                top: '92px',
                right: '20px',
                zIndex: 60,
                width: '220px',
                backgroundColor: `${tokens.cardBg}f5`,
                border: `1px solid ${tokens.cardBorder}`,
                borderRadius: '12px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                backdropFilter: 'blur(16px)',
                opacity: spaceEditingId ? 0.88 : 1,
                transition: 'opacity 0.35s ease',
              }}
            >
              {([
                { type: 'notebook', label: 'Notebook', hint: 'Large writing surface' },
                { type: 'note', label: 'Note', hint: 'Quick capture' },
                { type: 'mistake', label: 'Mistake', hint: 'Learn from slips' },
                { type: 'link', label: 'Link', hint: 'Reference URL' },
                { type: 'checklist', label: 'Checklist', hint: 'Action list' },
                { type: 'image', label: 'Image', hint: 'Visual reference' },
                { type: 'calculator', label: 'Calculator', hint: 'Safe math scratchpad' },
                { type: 'graph', label: 'Graph', hint: 'Plot y = f(x)' },
                { type: 'pdf', label: 'PDF', hint: 'Local file window' },
              ] as const).map(item => (
                <button
                  key={item.type}
                  onClick={() => handleAddToSpace(item.type)}
                  style={{
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    borderRadius: '8px',
                    padding: '7px 8px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.wellBg)}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: tokens.textPrimary }}>{item.label}</div>
                  <div style={{ fontSize: '10px', color: tokens.textGhost }}>{item.hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : designMode ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
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

      ) : (

        /* ── SPATIAL ENVIRONMENT ─────────────────────────────────────────── */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr]" style={{ overflow: 'hidden', minHeight: 0 }}>

          {/* ── LEFT PERIPHERAL ──────────────────────────────────────────── */}
          <aside
            className="hidden lg:flex flex-col overflow-y-auto"
            style={{ borderRight: '1px solid rgba(255,255,255,0.04)', padding: '32px 14px 24px 18px', gap: 0, backgroundColor: '#070b14' }}
          >
            <CourseHub sectionId={section.id} />

            <div style={{ margin: '20px 0 12px', height: '1px', backgroundColor: 'rgba(255,255,255,0.04)' }} />

            <AmbientDates sectionId={section.id} sectionTitle={section.title} />
          </aside>

          {/* ── RIGHT WORK SURFACE ───────────────────────────────────────── */}
          <main style={{ overflowY: 'auto', position: 'relative', backgroundColor: 'rgba(255,255,255,0.012)' }}>

            {/* Session aura */}
            <div style={{
              position: 'absolute', inset: 0,
              background: sessionIsThisCourse
                ? 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.055) 0%, transparent 65%)'
                : 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.016) 0%, transparent 55%)',
              pointerEvents: 'none', zIndex: 0, transition: 'background 1.4s cubic-bezier(0.4,0,0.2,1)',
            }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '42px 46px 88px', maxWidth: '680px' }}>

              {/* ── IDENTITY HEADER ──────────────────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '34px', paddingLeft: '15px', borderLeft: `2px solid ${accentColor}70` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    {customization.icon && (
                      <span style={{ fontSize: '16px', lineHeight: 1 }} role="img">{customization.icon}</span>
                    )}
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.02em', margin: 0 }}>
                      {section.title}
                    </h1>
                    {spaceAge(section.created_at) && (
                      <span style={{ fontSize: '10px', color: '#1a2230', fontWeight: 400, letterSpacing: '0.02em', flexShrink: 0, userSelect: 'none' }}>
                        {spaceAge(section.created_at)}
                      </span>
                    )}
                  </div>

                  {totalItems > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {allDone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#10b981' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> All caught up
                        </span>
                      ) : (
                        <>
                          <span style={{ fontSize: '12px', color: '#4b5563' }}>
                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{remaining}</span> remaining
                          </span>
                          <span style={{ fontSize: '12px', color: '#1a2230' }}>·</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '80px', height: '3px', borderRadius: '2px', backgroundColor: '#111827', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progressColor, borderRadius: '2px', transition: 'width 0.7s ease' }} />
                            </div>
                            <span style={{ fontSize: '11px', color: '#374151', fontWeight: 600 }}>{progress}%</span>
                          </div>
                        </>
                      )}

                      {/* Exam date inline */}
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
                    <p style={{ fontSize: '12px', color: '#263043', margin: 0 }}>Add tasks to start tracking progress</p>
                  )}
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
                    <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(245,158,11,0.5)', fontWeight: 600 }}>now</span>
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

                  <div style={{ padding: '10px 16px 12px' }}>
                    <button
                      onClick={handleStartSession}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '11px', fontWeight: 600, border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer', transition: 'background-color 0.3s cubic-bezier(0.4,0,0.2,1)' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.2)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.12)')}
                    >
                      <PlayCircle className="w-3 h-3" />
                      {sessionIsThisCourse ? 'Resume' : 'Begin session'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── WORK SURFACE ─────────────────────────────────────────── */}
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
      )}

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
