import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { Layout } from '../components/Layout';
import { GroupComponent } from '../components/GroupComponent';
import { ContinueButton } from '../components/ContinueButton';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { CourseHub } from '../components/CourseHub';
import {
  Loader2, ArrowLeft, CheckCircle2, Circle, ArrowRight, Plus, X, Zap, Calendar,
  AlertTriangle, CheckSquare, Square, PlayCircle, ChevronDown, ChevronRight,
  BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Item, ItemType, SectionWithProgress, Deadline, GroupWithItems } from '../types';
import {
  loadSession, saveSession, pickTasks, pickPortals,
} from '../utils/sessionPlan';

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
  if (/^https?:\/\//i.test(val.trim())) return { type: 'link',  groupName: 'Links'     };
  if (val.trim().length > 80)           return { type: 'note',  groupName: 'Notes'     };
  return                                       { type: 'task',  groupName: 'Exercises' };
}

function formatExamDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysUntil(d: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}
function readinessCfg(pct: number): { label: string; cls: string } {
  if (pct >= 70) return { label: 'On track', cls: 'bg-emerald-100 text-emerald-700' };
  if (pct >= 30) return { label: 'Building',  cls: 'bg-amber-100  text-amber-700'   };
  return               { label: 'At risk',   cls: 'bg-rose-100   text-rose-700'    };
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

function deadlineUrgencyStyle(d: Deadline): { badge: string; dot: string; row: string; label: string } {
  if (d.completed) return { badge: '', dot: 'bg-slate-200', row: 'border-slate-100', label: '' };
  const diff = deadlineDiff(d.due_date);
  if (diff < 0)   return { badge: 'bg-slate-100 text-slate-500',      dot: 'bg-slate-300',   row: 'border-slate-200', label: 'Overdue'          };
  if (diff === 0) return { badge: 'bg-rose-100 text-rose-700',         dot: 'bg-rose-500',    row: 'border-rose-200',  label: 'Due today'        };
  if (diff === 1) return { badge: 'bg-rose-100 text-rose-700',         dot: 'bg-rose-400',    row: 'border-rose-200',  label: 'Tomorrow'         };
  if (diff < 3)   return { badge: 'bg-rose-100 text-rose-700',         dot: 'bg-rose-400',    row: 'border-rose-100',  label: `${diff} days left` };
  if (diff <= 7)  return { badge: 'bg-amber-100 text-amber-700',       dot: 'bg-amber-400',   row: 'border-amber-100', label: `${diff} days left` };
  return                { badge: 'bg-emerald-100 text-emerald-700',   dot: 'bg-emerald-400', row: 'border-slate-100', label: `${diff} days left` };
}

function formatDueDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  // Sort by urgency (overdue → urgent → soon → far), completed last
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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
        {/* Header */}
        <div
          className="px-4 py-3 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50 transition-colors"
          onClick={() => setIsOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 opacity-40">
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <Calendar className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Important Dates</span>
            {urgentCount > 0 && (
              <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-full">
                {urgentCount} urgent
              </span>
            )}
            {urgentCount === 0 && pending.length > 0 && (
              <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
            className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 transition-colors px-2 py-1 rounded-lg hover:bg-primary-50"
          >
            + Add
          </button>
        </div>

        {/* Body */}
        {isOpen && (
          <div className="p-3 space-y-1.5">
            {sorted.length === 0 ? (
              <div className="text-center py-7">
                <Calendar className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No dates yet.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                >
                  + Add a date
                </button>
              </div>
            ) : (
              sorted.map((d: Deadline) => {
                const urg = deadlineUrgencyStyle(d);
                return (
                  <div
                    key={d.id}
                    className={`group flex items-center gap-3 px-3.5 py-3 rounded-xl border bg-white transition-all hover:shadow-sm ${
                      d.completed ? 'opacity-50 border-slate-100' : urg.row
                    }`}
                  >
                    {/* Urgency dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${urg.dot}`} />

                    {/* Toggle */}
                    <button
                      onClick={() => toggleDeadline(d.id, !d.completed).catch(() => toast.error('Failed'))}
                      className="flex-shrink-0"
                    >
                      {d.completed
                        ? <CheckSquare className="w-4 h-4 text-primary-500" />
                        : <Square      className="w-4 h-4 text-slate-300 hover:text-slate-400" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${d.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {d.title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {DEADLINE_TYPE_LABEL[d.type] ?? d.type} · {formatDueDate(d.due_date)}
                      </p>
                      {!d.completed && (
                        <p className={`text-[11px] font-semibold mt-1 ${
                          pendingTaskCount === 0
                            ? 'text-emerald-600'
                            : deadlineUrgencyLevel(d) === 'urgent' || deadlineUrgencyLevel(d) === 'overdue'
                              ? 'text-rose-500'
                              : 'text-slate-500'
                        }`}>
                          {pendingTaskCount === 0
                            ? "You're ready ✓"
                            : `${pendingTaskCount} action${pendingTaskCount !== 1 ? 's' : ''} to prepare`}
                        </p>
                      )}
                    </div>

                    {/* Urgency badge */}
                    {!d.completed && urg.label && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${urg.badge}`}>
                        {urg.label}
                      </span>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => deleteDeadline(d.id).catch(() => toast.error('Failed'))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-0.5"
                    >
                      <X className="w-3.5 h-3.5 text-slate-300 hover:text-red-400 transition-colors" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {!isOpen && sorted.length > 0 && (
          <div className="px-4 py-2 text-xs text-slate-400">
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

// ── ResourcesBlock ────────────────────────────────────────────────────────────

interface ResourcesBlockProps {
  groups: GroupWithItems[];
  sectionId: string;
  onUpdate: () => void;
}

function ResourcesBlock({ groups, sectionId, onUpdate }: ResourcesBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50 transition-colors"
        onClick={() => setIsOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 opacity-40">
            {isOpen
              ? <ChevronDown  className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            }
          </span>
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Resources</span>
          {totalItems > 0 && (
            <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">
              {totalItems}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 font-medium">
          {groups.map(g => g.title === 'Exercises' ? 'To Do' : g.title).join(' · ')}
        </span>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="p-3 border-t border-slate-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((group) => (
              <GroupComponent
                key={group.id}
                group={group}
                sectionId={sectionId}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SectionPage ───────────────────────────────────────────────────────────────

export function SectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { section, loading, fetchSection, addGroup, addItem, setExamDate } = useSectionDetail(id);
  const { links: courseLinks } = usePortalLinks('course', id);
  const { links: globalLinks } = usePortalLinks('global');

  const [showAddLane, setShowAddLane]         = useState(false);
  const [newLaneTitle, setNewLaneTitle]       = useState('');
  const [addingLane, setAddingLane]           = useState(false);
  const [quickAdd, setQuickAdd]               = useState('');
  const [quickAdding, setQuickAdding]         = useState(false);
  const [editingExamDate, setEditingExamDate] = useState(false);

  const activeSession = loadSession();
  const sessionIsThisCourse = activeSession?.sectionId === id;

  const handleStartSession = () => {
    if (!section) return;
    if (sessionIsThisCourse) {
      navigate('/session');
      return;
    }
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
      const displayName = groupName === 'Exercises' ? 'To Do' : groupName;
      toast.success(`Added to ${displayName}`);
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
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      </Layout>
    );
  }

  if (!section) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Section not found</h2>
          <Link to="/dashboard" className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors">
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

  const examDays  = section.exam_date ? daysUntil(section.exam_date) : null;
  const readiness = readinessCfg(progress);
  const isPanic   = !!section.exam_date && progress < 50;

  // Split groups: Exercises (primary, full-width) vs everything else (resources)
  const exercisesGroup  = section.groups.find(g => g.title === 'Exercises');
  const resourceGroups  = section.groups.filter(g => g.title !== 'Exercises');

  // Count incomplete tasks across all groups — used by DeadlinesBlock for prep feedback
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
          if (!item.completed && result.length < 3) {
            result.push({ item, lane: g.title, reason: 'Next best action', effort: getEffort(item) });
          }
        }
      }
    }
    return result;
  })();

  const scrollToItem = (itemId: string) =>
    document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <Layout>
      {/* Back */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-5 transition-colors font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Dashboard
      </Link>

      {/* Mission-control header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="h-px bg-gradient-to-r from-primary-400 via-primary-300 to-transparent" />
        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-slate-900 truncate tracking-tight leading-tight mb-2">
                {section.title}
              </h1>

              {/* Stats row */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {totalItems === 0 ? (
                  <span className="text-sm text-slate-400">Add content to the lanes below.</span>
                ) : allDone ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" /> All caught up
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {completedItems} done
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                      <Circle className="w-3.5 h-3.5" />
                      {remaining} remaining
                    </span>
                  </>
                )}
                {totalItems > 0 && !allDone && (
                  <span className="text-xs text-slate-400 font-medium ml-1">{progress}%</span>
                )}
              </div>

              {/* Progress bar */}
              {totalItems > 0 && (
                <div className="mt-3 space-y-1 max-w-sm">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        allDone || progress >= 70 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                        : progress >= 30          ? 'bg-gradient-to-r from-amber-400  to-amber-500'
                        :                           'bg-gradient-to-r from-primary-500 to-primary-400'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {progress >= 70 && !allDone && (
                    <p className="text-[11px] font-semibold text-emerald-600">You&apos;re close — keep going 🎯</p>
                  )}
                </div>
              )}

              {/* Exam date + readiness */}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {editingExamDate ? (
                  <input
                    type="date"
                    defaultValue={section.exam_date ?? ''}
                    autoFocus
                    className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full hover:bg-slate-200 transition-colors"
                  >
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    {formatExamDate(section.exam_date)}
                    {examDays !== null && (
                      <span className={
                        examDays <= 0  ? 'text-slate-400'
                        : examDays <= 7  ? 'text-rose-600 font-bold'
                        : examDays <= 14 ? 'text-amber-600'
                        : 'text-slate-500'
                      }>
                        · {examDays > 0 ? `${examDays}d left` : examDays === 0 ? 'Today!' : 'Past'}
                      </span>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setEditingExamDate(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-500 transition-colors"
                  >
                    <Calendar className="w-3 h-3" />
                    Set exam date
                  </button>
                )}
                {totalItems > 0 && (
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${readiness.cls}`}>
                    Readiness: {readiness.label}
                  </span>
                )}
              </div>
            </div>

            {/* Continue button */}
            <div className="flex-shrink-0">
              <ContinueButton section={section} />
            </div>
          </div>
        </div>
      </div>

      {/* Panic Mode banner */}
      {isPanic && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 mb-4 flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Panic mode — focus on high-impact items</p>
            <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
              Start with <span className="font-semibold">Exams</span> and <span className="font-semibold">To Do</span> — these move the needle most before your exam.
            </p>
          </div>
        </div>
      )}

      {/* Course Hub */}
      <CourseHub sectionId={section.id} />

      {/* Today's Plan */}
      {todayPlan.length > 0 && (
        <div
          className="rounded-2xl mb-4 overflow-hidden animate-fade-in"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #3730a3 100%)' }}
        >
          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-300">Today&apos;s Plan</span>
            <span className="text-[10px] font-semibold text-primary-400">{todayPlan.length} action{todayPlan.length !== 1 ? 's' : ''}</span>
          </div>

          {/* First item — highlighted */}
          <button
            onClick={() => scrollToItem(todayPlan[0].item.id)}
            className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/5 transition-colors border-b border-white/10"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary-300">
                  {todayPlan[0].lane} · {todayPlan[0].reason}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${EFFORT_COLOR[todayPlan[0].effort]}`}>
                  {todayPlan[0].effort}
                </span>
              </div>
              <p className="text-sm font-semibold text-white truncate leading-snug">{todayPlan[0].item.title}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary-300 flex-shrink-0" />
          </button>

          {/* Items 2–3 */}
          {todayPlan.slice(1).map((rec, i) => (
            <button
              key={rec.item.id}
              onClick={() => scrollToItem(rec.item.id)}
              className="w-full flex items-center gap-4 px-5 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/10 last:border-0"
            >
              <span className="text-[10px] font-bold text-primary-500 w-4 text-center flex-shrink-0">{i + 2}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/80 truncate">{rec.item.title}</p>
                <p className="text-[10px] text-primary-400 mt-0.5">{rec.lane} · {rec.reason}</p>
              </div>
            </button>
          ))}

          {/* Session CTA */}
          <div className="px-5 py-3 border-t border-white/10">
            <button
              onClick={handleStartSession}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] group"
            >
              <PlayCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
              {sessionIsThisCourse ? 'Resume Session →' : 'Start Session'}
            </button>
          </div>
        </div>
      )}

      {/* Quick Add bar */}
      <form onSubmit={handleQuickAdd} className="mb-4">
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-2.5">
          <Zap className="w-4 h-4 text-slate-300 flex-shrink-0" />
          <input
            type="text"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            placeholder="Quick add — type an action, paste a URL, or write a note…"
            className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-300"
          />
          {quickAdd.trim() && (
            <button
              type="submit"
              disabled={quickAdding}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              {quickAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                <>
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                  {detectQuickType(quickAdd).type === 'link' ? 'Save link' : detectQuickType(quickAdd).type === 'note' ? 'Save note' : 'Add action'}
                </>
              )}
            </button>
          )}
        </div>
      </form>

      {/* Tasks — Exercises group full-width */}
      {exercisesGroup && (
        <div className="mb-4">
          <GroupComponent
            group={exercisesGroup}
            sectionId={section.id}
            onUpdate={fetchSection}
          />
        </div>
      )}

      {/* Deadlines */}
      <DeadlinesBlock sectionId={section.id} sectionTitle={section.title} pendingTaskCount={pendingTaskCount} />

      {/* Resources — all other groups, collapsed by default */}
      {resourceGroups.length > 0 && (
        <ResourcesBlock
          groups={resourceGroups}
          sectionId={section.id}
          onUpdate={fetchSection}
        />
      )}

      {/* Add lane */}
      <div className="mt-2">
        {showAddLane ? (
          <form
            onSubmit={handleAddLane}
            className="flex gap-2.5 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 animate-slide-up"
          >
            <input
              type="text"
              value={newLaneTitle}
              onChange={(e) => setNewLaneTitle(e.target.value)}
              placeholder="Lane name (e.g. Flashcards, Vocabulary, Lab Reports…)"
              className="flex-1 px-3.5 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowAddLane(false); setNewLaneTitle(''); } }}
            />
            <button
              type="submit"
              disabled={addingLane || !newLaneTitle.trim()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold text-sm transition-colors disabled:opacity-40 flex items-center gap-2 whitespace-nowrap"
            >
              {addingLane ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create lane'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddLane(false); setNewLaneTitle(''); }}
              className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-xl hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowAddLane(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/20 rounded-2xl text-sm font-semibold text-slate-400 hover:text-primary-600 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Add lane
          </button>
        )}
      </div>
    </Layout>
  );
}
