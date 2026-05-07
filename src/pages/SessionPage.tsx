import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  CheckSquare, Square, ExternalLink, PlayCircle,
  Clock, CheckCircle2, ArrowLeft, Plus, Loader2,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useSectionDetail } from '../hooks/useSections';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { useDeadlines } from '../hooks/useDeadlines';
import { Item } from '../types';
import { TYPE_META } from '../components/MyPortals';
import {
  loadSession, clearSession, pickPortals, ActiveSession, elapsedMinutes,
  nearestDeadline, deadlineUrgencyLabel, deadlineLevel, daysUntil,
} from '../utils/sessionPlan';
import toast from 'react-hot-toast';

// ── Priority dot ──────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#f87171',
  medium: '#fbbf24',
  low:    '#38bdf8',
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
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
      >
        {/* Top accent bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #10b981, #f59e0b, #6366f1)' }} />

        <div className="p-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)' }}
          >
            <CheckCircle2 className="w-7 h-7" style={{ color: '#34d399' }} />
          </div>

          <h2 className="text-xl font-bold mb-1" style={{ color: '#f1f5f9' }}>Session complete</h2>
          <p className="text-sm mb-6" style={{ color: '#475569' }}>{sectionTitle}</p>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="rounded-xl p-4" style={{ backgroundColor: '#111d2e' }}>
              <p className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>
                {completed}
                <span className="text-lg" style={{ color: '#2a3a54' }}>/{total}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#475569' }}>actions done</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#111d2e' }}>
              <p className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>
                {minutes}
                <span className="text-xs font-normal ml-0.5" style={{ color: '#475569' }}>min</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#475569' }}>time logged</p>
            </div>
          </div>

          <button
            onClick={onDone}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
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
  const prioColor = item.content ? PRIORITY_COLOR[item.content] : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all"
      style={{
        backgroundColor: item.completed ? 'transparent' : '#111d2e',
        border: `1px solid ${item.completed ? '#0f1826' : '#1a2638'}`,
        opacity: item.completed ? 0.5 : 1,
      }}
    >
      <button
        onClick={onToggle}
        disabled={toggling}
        className="flex-shrink-0 transition-transform hover:scale-110"
        style={{ color: item.completed ? '#f59e0b' : '#2a3a54' }}
        onMouseEnter={e => { if (!item.completed) e.currentTarget.style.color = '#64748b'; }}
        onMouseLeave={e => { if (!item.completed) e.currentTarget.style.color = '#2a3a54'; }}
      >
        {item.completed
          ? <CheckSquare className="w-5 h-5" />
          : <Square className="w-5 h-5" />
        }
      </button>

      <span
        className="flex-1 text-sm font-medium"
        style={{
          color: item.completed ? '#334155' : '#e2e8f0',
          textDecoration: item.completed ? 'line-through' : 'none',
        }}
      >
        {item.title}
      </span>

      {prioColor && !item.completed && (
        <span
          className="flex items-center gap-1 text-[10px] font-bold flex-shrink-0"
          style={{ color: '#334155' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: prioColor }}
          />
          {item.content}
        </span>
      )}
    </div>
  );
}

// ── Inner session content ─────────────────────────────────────────────────────

function SessionContent({ session }: { session: ActiveSession }) {
  const navigate = useNavigate();
  const { section, loading, toggleTask, fetchSection } = useSectionDetail(session.sectionId);
  const { links: courseLinks }       = usePortalLinks('course', session.sectionId);
  const { links: globalLinks }       = usePortalLinks('global');
  const { deadlines: sectionDates }  = useDeadlines(session.sectionId);

  const [togglingId,  setTogglingId]  = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const allItems     = section?.groups.flatMap(g => g.items) ?? [];
  const sessionTasks: Item[] = session.taskIds
    .map(id => allItems.find(i => i.id === id))
    .filter((i): i is Item => !!i);

  const portals    = pickPortals(courseLinks, globalLinks);
  const completedN = sessionTasks.filter(i => i.completed).length;
  const totalN     = sessionTasks.length;
  const remainingN = totalN - completedN;
  const minutes    = elapsedMinutes(session.startedAt);

  const nextDate     = nearestDeadline(session.sectionId, sectionDates);
  const nextDays     = nextDate ? daysUntil(nextDate.due_date) : null;
  const nextLevel    = nextDays != null ? deadlineLevel(nextDays) : null;
  const nextLabel    = nextDays != null ? deadlineUrgencyLabel(nextDays) : null;
  const showDatePressure = nextDate && nextLevel && nextLevel !== 'far';

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

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#f59e0b' }} />
        </div>
      </Layout>
    );
  }

  const isUrgentLevel = nextLevel === 'overdue' || nextLevel === 'urgent';

  return (
    <Layout>
      {/* Session header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#334155' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#111d2e'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#334155'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            title="Back to dashboard (session stays active)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: '#34d399' }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: '#34d399' }}
              >
                Session active
              </span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight" style={{ color: '#f1f5f9' }}>
              {session.sectionTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className="hidden sm:flex items-center gap-1.5 text-sm"
            style={{ color: '#334155' }}
          >
            <Clock className="w-3.5 h-3.5" />{minutes}m
          </span>
          <button
            onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ border: '1px solid #1a2638', color: '#475569' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.color = '#94a3b8'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.color = '#475569'; }}
          >
            End session
          </button>
        </div>
      </div>

      {/* Deadline pressure bar */}
      {showDatePressure && nextDate && nextLabel && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-3"
          style={{
            backgroundColor: isUrgentLevel ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${isUrgentLevel ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
          }}
        >
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-bold truncate"
              style={{ color: isUrgentLevel ? '#fca5a5' : '#fcd34d' }}
            >
              {completedN === totalN && totalN > 0
                ? `You're ready for ${nextDate.title} ✓`
                : `${nextDate.title} — ${nextLabel}`}
            </p>
            {!(completedN === totalN && totalN > 0) && (
              <p
                className="text-xs mt-0.5"
                style={{ color: isUrgentLevel ? 'rgba(252,165,165,0.7)' : 'rgba(253,211,77,0.7)' }}
              >
                {remainingN > 0
                  ? `${remainingN} action${remainingN !== 1 ? 's' : ''} left to prepare`
                  : 'All actions done — you\'re ready'}
              </p>
            )}
          </div>
          {completedN === totalN && totalN > 0 && (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: '#34d399' }} />
          )}
        </div>
      )}

      {/* Progress bar */}
      {totalN > 0 && (
        <div
          className="rounded-2xl p-4 mb-4"
          style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold" style={{ color: '#334155' }}>Session progress</span>
            <span className="text-xs font-bold" style={{ color: '#64748b' }}>{completedN} / {totalN}</span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: '4px', backgroundColor: '#111d2e' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${totalN > 0 ? (completedN / totalN) * 100 : 0}%`,
                backgroundColor: completedN === totalN ? '#34d399' : '#f59e0b',
              }}
            />
          </div>
          {completedN === totalN && totalN > 0 && (
            <p
              className="text-xs font-semibold mt-2 flex items-center gap-1"
              style={{ color: '#34d399' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> All done — great work!
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Tasks column */}
        <div className="lg:col-span-2">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
          >
            <div
              className="px-5 py-3.5 flex items-center justify-between"
              style={{ borderBottom: '1px solid #1a2638' }}
            >
              <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Actions</span>
              {completedN > 0 && (
                <span className="text-xs font-semibold" style={{ color: '#34d399' }}>
                  {completedN} done ✓
                </span>
              )}
            </div>

            <div className="p-3 space-y-1.5">
              {sessionTasks.length === 0 && (
                <div className="text-center py-8">
                  <PlayCircle className="w-8 h-8 mx-auto mb-2" style={{ color: '#1a2638' }} />
                  <p className="text-sm" style={{ color: '#334155' }}>No actions in this session.</p>
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
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-colors"
                style={{ color: '#334155' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f59e0b'; (e.currentTarget as HTMLElement).style.backgroundColor = '#111d2e'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#334155'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                Open workspace to add more actions
              </a>
            </div>
          </div>
        </div>

        {/* Portals column */}
        <div>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
          >
            <div
              className="px-5 py-3.5"
              style={{ borderBottom: '1px solid #1a2638' }}
            >
              <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Portals</span>
            </div>
            <div className="p-3 space-y-1.5">
              {portals.length === 0 && (
                <p className="text-xs px-2 py-3" style={{ color: '#334155' }}>
                  No portals saved for this workspace.
                </p>
              )}
              {portals.map(p => {
                const meta = TYPE_META[p.type] ?? TYPE_META.custom;
                return (
                  <a
                    key={p.id}
                    href={p.url}
                    target={p.url.startsWith('mailto:') ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all group ${meta.badge}`}
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

      {showSummary && (
        <SessionSummary
          completed={completedN}
          total={totalN}
          minutes={minutes}
          sectionTitle={session.sectionTitle}
          onDone={() => { clearSession(); navigate('/dashboard'); }}
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
