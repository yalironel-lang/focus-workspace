import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  CheckSquare, Square, ExternalLink, PlayCircle,
  Clock, CheckCircle2, ArrowLeft, Plus,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useSectionDetail } from '../hooks/useSections';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { Item } from '../types';
import { TYPE_META } from '../components/MyPortals';
import {
  loadSession, clearSession, pickPortals, ActiveSession, elapsedMinutes,
} from '../utils/sessionPlan';
import toast from 'react-hot-toast';

// ── Priority dot ──────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, { dot: string; label: string }> = {
  high:   { dot: 'bg-rose-400',  label: 'high'   },
  medium: { dot: 'bg-amber-400', label: 'medium' },
  low:    { dot: 'bg-sky-300',   label: 'low'    },
};

// ── Session summary overlay ───────────────────────────────────────────────────

interface SummaryProps {
  completed: number;
  total: number;
  minutes: number;
  sectionTitle: string;
  onDone: () => void;
}

function SessionSummary({ completed, total, minutes, sectionTitle, onDone }: SummaryProps) {
  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
        {/* Top accent */}
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-primary-400 to-violet-400" />

        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-1">Session complete</h2>
          <p className="text-sm text-slate-400 mb-6">{sectionTitle}</p>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-slate-900">{completed}<span className="text-slate-300 text-lg">/{total}</span></p>
              <p className="text-xs text-slate-400 mt-0.5">tasks done</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-slate-900">{minutes}<span className="text-xs font-normal text-slate-400 ml-0.5">min</span></p>
              <p className="text-xs text-slate-400 mt-0.5">study time</p>
            </div>
          </div>

          <button
            onClick={onDone}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  item: Item;
  onToggle: () => void;
  toggling: boolean;
}

function TaskRow({ item, onToggle, toggling }: TaskRowProps) {
  const prio = item.content ? PRIORITY_DOT[item.content] : null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
        item.completed
          ? 'bg-slate-50 border-slate-100 opacity-60'
          : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'
      }`}
    >
      <button
        onClick={onToggle}
        disabled={toggling}
        className="flex-shrink-0 transition-transform hover:scale-110"
      >
        {item.completed
          ? <CheckSquare className="w-5 h-5 text-primary-500" />
          : <Square      className="w-5 h-5 text-slate-300 hover:text-slate-400" />
        }
      </button>

      <span className={`flex-1 text-sm font-medium ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {item.title}
      </span>

      {prio && !item.completed && (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${prio.dot}`} />
          {prio.label}
        </span>
      )}
    </div>
  );
}

// ── Inner session content (has its own hooks) ─────────────────────────────────

function SessionContent({ session }: { session: ActiveSession }) {
  const navigate = useNavigate();
  const { section, loading, toggleTask, fetchSection } = useSectionDetail(session.sectionId);
  const { links: courseLinks } = usePortalLinks('course', session.sectionId);
  const { links: globalLinks }  = usePortalLinks('global');

  const [togglingId,  setTogglingId]  = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Resolve live item state for task IDs in this session
  const allItems = section?.groups.flatMap(g => g.items) ?? [];
  const sessionTasks: Item[] = session.taskIds
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is Item => !!i);

  const portals     = pickPortals(courseLinks, globalLinks);
  const completedN  = sessionTasks.filter(i => i.completed).length;
  const totalN      = sessionTasks.length;
  const minutes     = elapsedMinutes(session.startedAt);

  const handleToggle = async (item: Item) => {
    setTogglingId(item.id);
    try {
      await toggleTask(item.id, !item.completed);
      await fetchSection();
    } catch {
      toast.error('Failed to update task');
    } finally {
      setTogglingId(null);
    }
  };

  const handleEnd = () => setShowSummary(true);

  const handleDone = () => {
    clearSession();
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Session header bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Back to dashboard (session stays active)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Session active</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{session.sectionTitle}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400">
            <Clock className="w-3.5 h-3.5" />{minutes}m
          </span>
          <button
            onClick={handleEnd}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalN > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Session progress</span>
            <span className="text-xs font-bold text-slate-700">{completedN} / {totalN}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completedN === totalN
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                  : 'bg-gradient-to-r from-primary-500 to-primary-400'
              }`}
              style={{ width: `${totalN > 0 ? (completedN / totalN) * 100 : 0}%` }}
            />
          </div>
          {completedN === totalN && totalN > 0 && (
            <p className="text-xs font-semibold text-emerald-600 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> All done — great session!
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks column */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Tasks</span>
              {completedN > 0 && (
                <span className="text-xs font-semibold text-emerald-600">
                  {completedN} done ✓
                </span>
              )}
            </div>

            <div className="p-3 space-y-1.5">
              {sessionTasks.length === 0 && (
                <div className="text-center py-8">
                  <PlayCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No tasks in this session.</p>
                </div>
              )}
              {sessionTasks.map(task => (
                <TaskRow
                  key={task.id}
                  item={task}
                  onToggle={() => handleToggle(task)}
                  toggling={togglingId === task.id}
                />
              ))}
              <a
                href={`/section/${session.sectionId}`}
                className="flex items-center gap-2 px-4 py-2 text-xs text-slate-400 hover:text-primary-600 transition-colors rounded-xl hover:bg-primary-50/30"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                Open course to add more tasks
              </a>
            </div>
          </div>
        </div>

        {/* Portals column */}
        <div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-50">
              <span className="text-sm font-semibold text-slate-800">Portals</span>
            </div>
            <div className="p-3 space-y-1.5">
              {portals.length === 0 && (
                <p className="text-xs text-slate-400 px-2 py-3">No portals saved for this course.</p>
              )}
              {portals.map(p => {
                const meta = TYPE_META[p.type] ?? TYPE_META.custom;
                const href = p.url.startsWith('mailto:') ? p.url : p.url;
                return (
                  <a
                    key={p.id}
                    href={href}
                    target={p.url.startsWith('mailto:') ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm group ${meta.badge}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}>
                      {meta.icon}
                    </span>
                    <span className="flex-1 text-sm font-semibold truncate">{p.label}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Summary overlay */}
      {showSummary && (
        <SessionSummary
          completed={completedN}
          total={totalN}
          minutes={minutes}
          sectionTitle={session.sectionTitle}
          onDone={handleDone}
        />
      )}
    </Layout>
  );
}

// ── Page entry ────────────────────────────────────────────────────────────────

export function SessionPage() {
  const session = loadSession();
  if (!session) return <Navigate to="/dashboard" replace />;
  return <SessionContent session={session} />;
}
