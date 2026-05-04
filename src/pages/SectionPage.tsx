import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSectionDetail } from '../hooks/useSections';
import { useSchedule } from '../hooks/useSchedule';
import { useDeadlines } from '../hooks/useDeadlines';
import { Layout } from '../components/Layout';
import { GroupComponent } from '../components/GroupComponent';
import { ContinueButton } from '../components/ContinueButton';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { Loader2, ArrowLeft, CheckCircle2, Circle, ArrowRight, Plus, X, Zap, Calendar, AlertTriangle, Clock, MapPin, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { Item, ItemType, SectionWithProgress, ScheduleBlock, Deadline } from '../types';

// ── Compact course cards ─────────────────────────────────────────────────────

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function CourseRhythmCard({ sectionId }: { sectionId: string }) {
  const { blocks } = useSchedule();
  const courseBlocks = blocks
    .filter(b => b.section_id === sectionId)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  if (courseBlocks.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Weekly classes</span>
        <Link to="/schedule" className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 transition-colors">
          View schedule →
        </Link>
      </div>
      <div className="p-3 space-y-1.5">
        {courseBlocks.map((block: ScheduleBlock) => (
          <div key={block.id} className="flex items-center gap-2.5 text-xs">
            <span className="w-7 text-[10px] font-bold text-slate-400 flex-shrink-0">{DAY_SHORT[block.day_of_week]}</span>
            <span className="flex items-center gap-1 text-slate-600 font-medium">
              <Clock className="w-3 h-3 text-slate-300" />
              {block.start_time}–{block.end_time}
            </span>
            {block.location && (
              <span className="flex items-center gap-1 text-slate-400 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />{block.location}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const DEADLINE_TYPE_SHORT: Record<string, string> = {
  assignment: 'Assign', quiz: 'Quiz', exam: 'Exam', project: 'Project', reading: 'Reading',
};

function deadlineDiff(due: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(due + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

function CourseDeadlinesCard({ sectionId, sectionTitle }: { sectionId: string; sectionTitle: string }) {
  const { deadlines, addDeadline, toggleDeadline, deleteDeadline } = useDeadlines(sectionId);
  const [showAdd, setShowAdd] = useState(false);
  const sectionForModal = [{ id: sectionId, title: sectionTitle } as SectionWithProgress];

  const upcoming = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Upcoming deadlines</span>
          <button
            onClick={() => setShowAdd(true)}
            className="text-[10px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            + Add
          </button>
        </div>
        <div className="p-3">
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">No upcoming deadlines.</p>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map((d: Deadline) => {
                const diff = deadlineDiff(d.due_date);
                const urgCls = diff < 0 ? 'text-rose-600 font-bold' : diff === 0 ? 'text-amber-600 font-bold' : diff <= 3 ? 'text-amber-500' : 'text-slate-400';
                return (
                  <div key={d.id} className="group flex items-center gap-2 text-xs">
                    <button
                      onClick={() => toggleDeadline(d.id, !d.completed).catch(() => toast.error('Failed'))}
                      className="flex-shrink-0"
                    >
                      {d.completed
                        ? <CheckSquare className="w-3.5 h-3.5 text-primary-500" />
                        : <Square className="w-3.5 h-3.5 text-slate-300 hover:text-slate-400" />
                      }
                    </button>
                    <span className="flex-1 text-slate-700 font-medium truncate">{d.title}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{DEADLINE_TYPE_SHORT[d.type]}</span>
                    <span className={`text-[10px] flex-shrink-0 ${urgCls}`}>
                      {diff < 0 ? 'Overdue' : diff === 0 ? 'Today' : `${diff}d`}
                    </span>
                    <button
                      onClick={() => deleteDeadline(d.id).catch(() => toast.error('Failed'))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-slate-300 hover:text-red-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

// ── Effort estimate from item ─────────────────────────────────────────────────

// Effort estimate from item
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

// Detect quick-add type from raw input
function detectQuickType(val: string): { type: ItemType; groupName: string } {
  if (/^https?:\/\//i.test(val.trim())) return { type: 'link',  groupName: 'Links'     };
  if (val.trim().length > 80)           return { type: 'note',  groupName: 'Notes'     };
  return                                       { type: 'task',  groupName: 'Exercises' };
}

// Exam-mode helpers
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

const PLAN_PRIORITY = ['Exercises', 'Exams', 'Slides'] as const;

export function SectionPage() {
  const { id } = useParams<{ id: string }>();
  const { section, loading, fetchSection, addGroup, addItem, setExamDate } = useSectionDetail(id);

  const [showAddLane, setShowAddLane]       = useState(false);
  const [newLaneTitle, setNewLaneTitle]     = useState('');
  const [addingLane, setAddingLane]         = useState(false);
  const [quickAdd, setQuickAdd]             = useState('');
  const [quickAdding, setQuickAdding]       = useState(false);
  const [editingExamDate, setEditingExamDate] = useState(false);

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

  // Exam-mode derived values
  const examDays  = section.exam_date ? daysUntil(section.exam_date) : null;
  const readiness = readinessCfg(progress);
  const isPanic   = !!section.exam_date && progress < 50;

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
    // Fill remaining slots from custom lanes (skip Links / Notes)
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div className="h-px bg-gradient-to-r from-primary-400 via-primary-300 to-transparent" />
        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Title + stats in one compact row */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-slate-900 truncate tracking-tight mb-2">
                {section.title}
              </h1>

              {/* Stats row — compact chips */}
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

                {/* Inline progress fraction */}
                {totalItems > 0 && !allDone && (
                  <span className="text-xs text-slate-400 font-medium ml-1">{progress}%</span>
                )}
              </div>

              {/* Slim progress bar — 3-tier color bands */}
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

              {/* Exam date + readiness row */}
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

      {/* Course rhythm + deadlines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CourseRhythmCard sectionId={section.id} />
        <CourseDeadlinesCard sectionId={section.id} sectionTitle={section.title} />
      </div>

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
            placeholder="Quick add — type a task, paste a URL, or write a long note…"
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
                  {detectQuickType(quickAdd).type === 'link' ? 'Save link' : detectQuickType(quickAdd).type === 'note' ? 'Save note' : 'Add task'}
                </>
              )}
            </button>
          )}
        </div>
      </form>

      {/* Lanes grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {section.groups.map((group) => (
          <GroupComponent
            key={group.id}
            group={group}
            sectionId={section.id}
            onUpdate={fetchSection}
          />
        ))}
      </div>

      {/* Add lane — below grid */}
      <div className="mt-4">
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
