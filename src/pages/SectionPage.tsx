import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { useWorkspaceCustomization, WorkspaceCustomization } from '../hooks/useWorkspaceCustomization';
import { Layout } from '../components/Layout';
import { GroupComponent } from '../components/GroupComponent';
import { ContinueButton } from '../components/ContinueButton';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { CourseHub } from '../components/CourseHub';
import { CustomizeModal } from '../components/CustomizeModal';
import { DesignModeBar } from '../components/DesignModeBar';
import type { GroupWithItems } from '../types';
import {
  Loader2, ArrowLeft, CheckCircle2, Circle, ArrowRight, Plus, X, Zap, Calendar,
  AlertTriangle, CheckSquare, Square, PlayCircle, ChevronDown, ChevronRight,
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

const EFFORT_COLOR: Record<string, string> = {
  Quick:  'bg-emerald-500/20 text-emerald-300',
  Medium: 'bg-amber-500/20   text-amber-300',
  Long:   'bg-rose-500/20    text-rose-300',
};

function detectQuickType(val: string): { type: ItemType; groupName: string } {
  if (/^https?:\/\//i.test(val.trim())) return { type: 'link', groupName: 'Links'     };
  if (val.trim().length > 80)           return { type: 'note', groupName: 'Notes'     };
  return                                       { type: 'task', groupName: 'Exercises' };
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

const DEADLINE_TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment', quiz: 'Quiz', exam: 'Exam',
  project: 'Project', reading: 'Reading', custom: 'Custom',
};
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

// ── DeadlinesBlock ────────────────────────────────────────────────────────────

interface DeadlinesBlockProps {
  sectionId: string;
  sectionTitle: string;
  pendingTaskCount: number;
}

function DeadlinesBlock({ sectionId, sectionTitle, pendingTaskCount }: DeadlinesBlockProps) {
  const { deadlines, addDeadline, toggleDeadline, deleteDeadline } = useDeadlines(sectionId);
  const [showAdd, setShowAdd] = useState(false);
  const [isOpen, setIsOpen]   = useState(true);
  const sectionForModal = [{ id: sectionId, title: sectionTitle } as SectionWithProgress];

  const sorted = [...deadlines].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const au = URGENCY_ORDER[deadlineUrgencyLevel(a)];
    const bu = URGENCY_ORDER[deadlineUrgencyLevel(b)];
    if (au !== bu) return au - bu;
    return a.due_date.localeCompare(b.due_date);
  });

  const pending = deadlines.filter(d => !d.completed);
  const urgentCount = pending.filter(d => {
    const lvl = deadlineUrgencyLevel(d);
    return lvl === 'overdue' || lvl === 'urgent';
  }).length;

  return (
    <>
      <div className="rounded-xl overflow-hidden mb-4"
           style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between cursor-pointer select-none transition-colors"
          style={{ borderBottom: isOpen ? '1px solid #1a2230' : 'none' }}
          onClick={() => setIsOpen(o => !o)}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0" style={{ color: '#374151' }}>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <Calendar className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
            <span className="text-xs font-bold uppercase tracking-[0.12em]"
                  style={{ color: '#f8fafc' }}>
              Important Dates
            </span>
            {urgentCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {urgentCount} urgent
              </span>
            )}
            {urgentCount === 0 && pending.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: '#111827', color: '#4b5563' }}>
                {pending.length}
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors flex-shrink-0"
            style={{ color: '#4b5563' }}
            onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            + Add
          </button>
        </div>

        {/* Body */}
        {isOpen && (
          <div className="p-3 space-y-1.5">
            {sorted.length === 0 ? (
              <div className="text-center py-6">
                <Calendar className="w-5 h-5 mx-auto mb-2" style={{ color: '#263043' }} />
                <p className="text-xs" style={{ color: '#374151' }}>No dates yet.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-2 text-xs font-semibold transition-colors"
                  style={{ color: '#f59e0b' }}
                >
                  + Add a date
                </button>
              </div>
            ) : (
              sorted.map((d: Deadline) => {
                const lbl = urgencyLabel(d);
                const dot = urgencyDot(d);
                return (
                  <div
                    key={d.id}
                    className="group flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all"
                    style={{
                      backgroundColor: '#080b12',
                      border: '1px solid #1a2230',
                      opacity: d.completed ? 0.5 : 1,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#263043')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a2230')}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
                    <button
                      onClick={() => toggleDeadline(d.id, !d.completed).catch(() => toast.error('Failed'))}
                      className="flex-shrink-0"
                    >
                      {d.completed
                        ? <CheckSquare className="w-4 h-4" style={{ color: '#f59e0b' }} />
                        : <Square      className="w-4 h-4" style={{ color: '#263043' }} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate"
                         style={{ color: d.completed ? '#374151' : '#f8fafc',
                                  textDecoration: d.completed ? 'line-through' : 'none' }}>
                        {d.title}
                      </p>
                      <p className="text-[11px] mt-0.5"
                         style={{ color: '#374151' }}>
                        {DEADLINE_TYPE_LABEL[d.type] ?? d.type} · {formatDueDate(d.due_date)}
                      </p>
                      {!d.completed && pendingTaskCount > 0 && (
                        <p className="text-[11px] font-medium mt-0.5" style={{ color: '#4b5563' }}>
                          {pendingTaskCount} action{pendingTaskCount !== 1 ? 's' : ''} to prepare
                        </p>
                      )}
                      {!d.completed && pendingTaskCount === 0 && (
                        <p className="text-[11px] font-medium mt-0.5" style={{ color: '#10b981' }}>
                          Ready ✓
                        </p>
                      )}
                    </div>
                    {!d.completed && lbl.text && (
                      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: lbl.color }}>
                        {lbl.text}
                      </span>
                    )}
                    <button
                      onClick={() => deleteDeadline(d.id).catch(() => toast.error('Failed'))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-0.5 rounded"
                      style={{ color: '#374151' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {!isOpen && sorted.length > 0 && (
          <div className="px-4 py-2 text-xs" style={{ color: '#374151' }}>
            {urgentCount > 0
              ? `${urgentCount} urgent · ${pending.length - urgentCount} upcoming`
              : pending.length > 0
                ? `${pending.length} upcoming`
                : 'All done ✓'
            }
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
  const { links: courseLinks } = usePortalLinks('course', id);
  const { links: globalLinks } = usePortalLinks('global');
  const { customization, setCustomization } = useWorkspaceCustomization(id ?? '');

  const [showAddLane,     setShowAddLane]     = useState(false);
  const [newLaneTitle,    setNewLaneTitle]     = useState('');
  const [addingLane,      setAddingLane]       = useState(false);
  const [quickAdd,        setQuickAdd]         = useState('');
  const [quickAdding,     setQuickAdding]      = useState(false);
  const [editingExamDate, setEditingExamDate]  = useState(false);
  const [showCustomize,   setShowCustomize]    = useState(false);

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

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = quickAdd.trim();
    if (!val || !section) return;
    setQuickAdding(true);
    try {
      const { type, groupName } = detectQuickType(val);
      const target = section.groups.find(g => g.title === groupName);
      if (!target) { toast.error('Target lane not found'); return; }
      const url = type === 'link' ? val : undefined;
      await addItem(target.id, type, val, url);
      setQuickAdd('');
      toast.success(`Added to ${groupName === 'Exercises' ? 'To Do' : groupName}`);
    } catch {
      toast.error('Failed to add item');
    } finally {
      setQuickAdding(false);
    }
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

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#263043' }} />
        </div>
      </Layout>
    );
  }

  if (!section) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold mb-3" style={{ color: '#f8fafc' }}>
            Workspace not found
          </h2>
          <Link to="/dashboard" className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
            ← Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  const totalItems     = section.groups.reduce((sum, g) => sum + g.items.length, 0);
  const completedItems = section.groups.reduce((sum, g) => sum + g.items.filter(i => i.completed).length, 0);
  const remaining      = totalItems - completedItems;
  const progress       = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const allDone        = totalItems > 0 && remaining === 0;

  const examDays = section.exam_date ? daysUntil(section.exam_date) : null;

  const progressColor = allDone || progress >= 70 ? '#10b981'
                      : progress >= 30             ? '#f59e0b'
                      :                              '#ef4444';

  // Customization — accent overrides progress-based color for decorative elements only
  const accentColor = customization.accent || progressColor;

  const isPanic = !!section.exam_date && progress < 50;

  // Split: Exercises (primary) vs everything else (resources)
  const exercisesGroup = section.groups.find(g => g.title === 'Exercises');
  const resourceGroups = section.groups.filter(g => g.title !== 'Exercises');

  const pendingTaskCount = section.groups
    .flatMap(g => g.items)
    .filter(i => i.type === 'task' && !i.completed)
    .length;

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

  // Common props passed to every GroupComponent
  const groupCallbacks = {
    onAddItem:    addItem,
    onPushItem:   pushItem,
    onToggleItem: toggleTask,
    onDeleteItem: deleteItem,
    onUpdateItem: updateItem,
    onRenameGroup: updateGroup,
    onDeleteGroup: deleteGroup,
    onRefresh:     fetchSection,
  };

  return (
    <Layout>
      {/* Back */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm mb-5 transition-colors font-medium"
        style={{ color: '#374151' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
        onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* ── 1. WORKSPACE HEADER ─────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden mb-4"
           style={{
             backgroundColor: '#0d111a',
             border: '1px solid #263043',
             borderTop: `2px solid ${accentColor}`,
             ...(customization.cover === 'focus' ? { borderLeft: `3px solid ${accentColor}` } : {}),
             ...(customization.cover === 'urgent' ? { backgroundColor: 'rgba(239,68,68,0.04)' } : {}),
           }}>
        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                {customization.icon && (
                  <span className="text-xl leading-none flex-shrink-0" role="img">
                    {customization.icon}
                  </span>
                )}
                <h1 className="text-xl font-bold truncate leading-tight"
                    style={{ color: '#f8fafc' }}>
                  {section.title}
                </h1>
                <button
                  onClick={() => setShowCustomize(true)}
                  className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors"
                  style={{ color: '#263043', border: '1px solid #1a2230' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#263043'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#263043'; e.currentTarget.style.borderColor = '#1a2230'; }}
                  title="Customize workspace"
                >
                  ✦
                </button>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-2 flex-wrap">
                {totalItems === 0 ? (
                  <span className="text-sm" style={{ color: '#374151' }}>Add content to the lanes below.</span>
                ) : allDone ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold"
                        style={{ color: '#10b981' }}>
                    <CheckCircle2 className="w-4 h-4" /> All caught up
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />{completedItems} done
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: '#111827', color: '#94a3b8' }}>
                      <Circle className="w-3.5 h-3.5" />{remaining} remaining
                    </span>
                  </>
                )}
                {totalItems > 0 && !allDone && (
                  <span className="text-xs font-medium ml-1" style={{ color: '#374151' }}>
                    {progress}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {totalItems > 0 && (
                <div className="mt-3 max-w-xs">
                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#111827' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${progress}%`, backgroundColor: progressColor }}
                    />
                  </div>
                  {progress >= 70 && !allDone && (
                    <p className="text-[11px] font-semibold mt-1" style={{ color: '#10b981' }}>
                      You&apos;re close — keep going 🎯
                    </p>
                  )}
                </div>
              )}

              {/* Exam date */}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {editingExamDate ? (
                  <input
                    type="date"
                    defaultValue={section.exam_date ?? ''}
                    autoFocus
                    className="text-xs px-2.5 py-1 rounded-lg focus:outline-none"
                    style={{
                      backgroundColor: '#111827', border: '1px solid #f59e0b',
                      color: '#f8fafc',
                    }}
                    onBlur={(e) => {
                      setEditingExamDate(false);
                      setExamDate(e.target.value || null).catch(() => toast.error('Failed to save exam date'));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingExamDate(false);
                      if (e.key === 'Enter')  (e.target as HTMLInputElement).blur();
                    }}
                  />
                ) : section.exam_date ? (
                  <button
                    onClick={() => setEditingExamDate(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                    style={{ backgroundColor: '#111827', color: '#94a3b8' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a2230')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#111827')}
                  >
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    {formatExamDate(section.exam_date)}
                    {examDays !== null && (
                      <span style={{
                        color: examDays <= 0  ? '#4b5563'
                             : examDays <= 7  ? '#ef4444'
                             : examDays <= 14 ? '#f59e0b'
                             : '#4b5563',
                        fontWeight: 600,
                      }}>
                        · {examDays > 0 ? `${examDays}d left` : examDays === 0 ? 'Today!' : 'Past'}
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setEditingExamDate(true)}
                    className="inline-flex items-center gap-1.5 text-xs transition-colors"
                    style={{ color: '#263043' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#263043')}
                  >
                    <Calendar className="w-3 h-3" />
                    Set exam date
                  </button>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 flex flex-col items-end gap-2">
              <ContinueButton section={section} />
              {!designMode && (
                <button
                  onClick={enterDesignMode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                  title="Customize layout"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Design Mode
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Panic mode (hidden in Design Mode) */}
      {isPanic && !designMode && (
        <div className="rounded-xl px-5 py-3.5 mb-4 flex items-start gap-3"
             style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
              Exam approaching — focus on high-impact items
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#4b5563' }}>
              Start with <span style={{ color: '#94a3b8', fontWeight: 600 }}>Exams</span> and{' '}
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>To Do</span> — these move the needle most.
            </p>
          </div>
        </div>
      )}

      {/* ── 1b. DESIGN MODE BAR ─────────────────────────────────────────────── */}
      {designMode && (
        <DesignModeBar
          customization={customization}
          onChange={setCustomization}
          onDone={exitDesignMode}
          onReset={resetDesign}
        />
      )}

      {/* ── 2. COURSE HUB (hidden in Design Mode for focus) ─────────────────── */}
      {!designMode && <CourseHub sectionId={section.id} />}

      {/* ── 3. TODAY'S PLAN (hidden in Design Mode) ──────────────────────────── */}
      {!designMode && todayPlan.length > 0 && (
        <div className="rounded-xl mb-4 overflow-hidden"
             style={{ backgroundColor: '#0d111a', border: '1px solid #263043', borderLeft: '2px solid #f59e0b' }}>
          <div className="flex items-center justify-between px-5 py-2.5"
               style={{ borderBottom: '1px solid #1a2230' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#f59e0b' }}>
              Today&apos;s Plan
            </span>
            <span className="text-[10px] font-semibold" style={{ color: '#374151' }}>
              {todayPlan.length} action{todayPlan.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* First item */}
          <button
            onClick={() => scrollToItem(todayPlan[0].item.id)}
            className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors"
            style={{ borderBottom: '1px solid #1a2230' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse mt-0.5"
                  style={{ backgroundColor: '#f59e0b' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: '#374151' }}>
                  {todayPlan[0].lane} · {todayPlan[0].reason}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${EFFORT_COLOR[todayPlan[0].effort]}`}>
                  {todayPlan[0].effort}
                </span>
              </div>
              <p className="text-sm font-semibold truncate leading-snug"
                 style={{ color: '#f8fafc' }}>
                {todayPlan[0].item.title}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: '#374151' }} />
          </button>

          {/* Items 2-3 */}
          {todayPlan.slice(1).map((rec, i) => (
            <button
              key={rec.item.id}
              onClick={() => scrollToItem(rec.item.id)}
              className="w-full flex items-center gap-4 px-5 py-2.5 text-left transition-colors"
              style={{ borderBottom: '1px solid #1a2230' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span className="text-[10px] font-bold w-4 text-center flex-shrink-0"
                    style={{ color: '#374151' }}>
                {i + 2}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: '#94a3b8' }}>
                  {rec.item.title}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#374151' }}>
                  {rec.lane} · {rec.reason}
                </p>
              </div>
            </button>
          ))}

          {/* Session CTA */}
          <div className="px-5 py-3" style={{ borderTop: '1px solid #1a2230' }}>
            <button
              onClick={handleStartSession}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
            >
              <PlayCircle className="w-4 h-4" />
              {sessionIsThisCourse ? 'Resume Session →' : 'Start Session'}
            </button>
          </div>
        </div>
      )}

      {/* ── 4. QUICK ADD (hidden in Design Mode) ─────────────────────────────── */}
      {!designMode && <form onSubmit={handleQuickAdd} className="mb-4">
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5"
             style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>
          <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#374151' }} />
          <input
            type="text"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            placeholder="Quick add — type an action, paste a URL, or write a note…"
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: '#f8fafc' }}
          />
          {quickAdd.trim() && (
            <button
              type="submit"
              disabled={quickAdding}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
            >
              {quickAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                <>
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                  {detectQuickType(quickAdd).type === 'link' ? 'Save link'
                   : detectQuickType(quickAdd).type === 'note' ? 'Save note'
                   : 'Add action'}
                </>
              )}
            </button>
          )}
        </div>
      </form>}

      {/* ── 5 / 7. GROUPS ────────────────────────────────────────────────────── */}
      {designMode ? (
        /* ─ Design Mode: flat draggable list of ALL groups ─ */
        <div className="space-y-3 mb-4">
          {orderedGroups.map(group => {
            const isDragging  = dragId     === group.id;
            const isDragOver  = dragOverId === group.id && dragId !== group.id;
            return (
              <div
                key={group.id}
                draggable
                onDragStart={e => handleDragStart(e, group.id)}
                onDragOver={e  => handleDragOver(e,  group.id)}
                onDrop={e      => handleDrop(e,      group.id)}
                onDragEnd={handleDragEnd}
                style={{
                  opacity:       isDragging ? 0.35 : 1,
                  outline:       isDragOver ? '2px solid #f59e0b' : 'none',
                  outlineOffset: '3px',
                  borderRadius:  '14px',
                  transition:    'opacity 0.15s',
                  cursor:        'grab',
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
      ) : (
        /* ─ Normal mode: existing two-tier layout ─ */
        <>
          {/* Primary: Exercises (To Do) — full width, visible only if not hidden */}
          {exercisesGroup && !(customization.hiddenLanes ?? []).includes(exercisesGroup.id) && (
            <div className="mb-4">
              <GroupComponent
                group={exercisesGroup}
                sectionId={section.id}
                {...groupCallbacks}
                density={customization.density || ''}
              />
            </div>
          )}

          {/* ── 6. IMPORTANT DATES ─────────────────────────────────────────── */}
          <DeadlinesBlock
            sectionId={section.id}
            sectionTitle={section.title}
            pendingTaskCount={pendingTaskCount}
          />

          {/* Resources: all other groups filtered by hiddenLanes */}
          {resourceGroups.filter(g => !(customization.hiddenLanes ?? []).includes(g.id)).length > 0 && (
            <ResourcesBlock
              groups={resourceGroups.filter(g => !(customization.hiddenLanes ?? []).includes(g.id))}
              sectionId={section.id}
              groupCallbacks={groupCallbacks}
              density={customization.density || ''}
            />
          )}
        </>
      )}

      {/* ── 8. ADD LANE ──────────────────────────────────────────────────────── */}
      {!designMode && <div className="mt-2 mb-6">
        {showAddLane ? (
          <form
            onSubmit={handleAddLane}
            className="flex gap-2.5 rounded-xl p-3"
            style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}
          >
            <input
              type="text"
              value={newLaneTitle}
              onChange={(e) => setNewLaneTitle(e.target.value)}
              placeholder="Lane name (e.g. Flashcards, Lab Reports, Vocabulary…)"
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: '#f8fafc' }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowAddLane(false); setNewLaneTitle(''); } }}
            />
            <button
              type="submit"
              disabled={addingLane || !newLaneTitle.trim()}
              className="px-3.5 py-1.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
            >
              {addingLane ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddLane(false); setNewLaneTitle(''); }}
              className="p-1.5 rounded-lg transition-colors"
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
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ border: '2px dashed #1a2230', color: '#374151' }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#f59e0b';
              e.currentTarget.style.color = '#f59e0b';
              e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.04)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#1a2230';
              e.currentTarget.style.color = '#374151';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Add lane
          </button>
        )}
      </div>}

      {showCustomize && (
        <CustomizeModal
          sectionTitle={section.title}
          value={customization}
          onChange={setCustomization}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </Layout>
  );
}

// ── ResourcesBlock ────────────────────────────────────────────────────────────

function ResourcesBlock({
  groups, sectionId, groupCallbacks, density = '',
}: {
  groups: GroupWithItems[];
  sectionId: string;
  density?: 'compact' | 'comfortable' | 'spacious' | '';
  groupCallbacks: {
    onAddItem: (groupId: string, type: ItemType, title: string, content?: string) => Promise<void>;
    onPushItem: (groupId: string, item: Item) => void;
    onToggleItem: (itemId: string, completed: boolean) => Promise<void>;
    onDeleteItem: (itemId: string) => Promise<void>;
    onUpdateItem: (itemId: string, updates: { title?: string; content?: string | null }) => Promise<void>;
    onRenameGroup: (groupId: string, title: string) => Promise<void>;
    onDeleteGroup: (groupId: string) => Promise<void>;
    onRefresh: () => void;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="rounded-xl overflow-hidden mb-4"
         style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none transition-colors"
        style={{ borderBottom: isOpen ? '1px solid #1a2230' : 'none' }}
        onClick={() => setIsOpen(o => !o)}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0" style={{ color: '#374151' }}>
            {isOpen
              ? <ChevronDown  className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.12em]"
                style={{ color: '#f8fafc' }}>
            Resources
          </span>
          {totalItems > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#111827', color: '#4b5563' }}>
              {totalItems}
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: '#374151' }}>
          {groups.map(g => g.title === 'Exercises' ? 'To Do' : g.title).join(' · ')}
        </span>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((group) => (
              <GroupComponent
                key={group.id}
                group={group}
                sectionId={sectionId}
                {...groupCallbacks}
                density={density}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
