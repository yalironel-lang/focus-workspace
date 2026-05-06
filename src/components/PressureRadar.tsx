import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, ArrowRight, Trash2 } from 'lucide-react';
import { useSchedule } from '../hooks/useSchedule';
import { useDeadlines } from '../hooks/useDeadlines';
import { AddBlockModal } from './AddBlockModal';
import { AddDeadlineModal } from './AddDeadlineModal';
import { SectionWithProgress } from '../types';
import toast from 'react-hot-toast';

interface Props {
  sections: SectionWithProgress[];
}

function daysUntil(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(date + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

type UrgencyLevel = 'overdue' | 'today' | 'soon' | 'week';

function deadlineUrgency(date: string): UrgencyLevel {
  const d = daysUntil(date);
  if (d < 0)  return 'overdue';
  if (d === 0) return 'today';
  if (d <= 2)  return 'soon';
  return 'week';
}

function deadlineLabel(date: string): string {
  const d = daysUntil(date);
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return `in ${d}d`;
}

const URGENCY_CONFIG: Record<UrgencyLevel, { bar: string; badge: React.CSSProperties; label: string }> = {
  overdue: {
    bar: '#ef4444',
    badge: { backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' },
    label: 'Overdue',
  },
  today: {
    bar: '#f59e0b',
    badge: { backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' },
    label: 'Today',
  },
  soon: {
    bar: '#f59e0b',
    badge: { backgroundColor: 'rgba(245,158,11,0.08)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.15)' },
    label: '',
  },
  week: {
    bar: '#2a3a50',
    badge: { backgroundColor: 'transparent', color: '#475569', border: 'none' },
    label: '',
  },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-4 pb-2">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: '#334155' }}
      >
        {children}
      </span>
    </div>
  );
}

export function PressureRadar({ sections }: Props) {
  const { blocks, addBlock, deleteBlock } = useSchedule();
  const { deadlines, addDeadline, deleteDeadline } = useDeadlines();

  const [showAddBlock,    setShowAddBlock]    = useState(false);
  const [showAddDeadline, setShowAddDeadline] = useState(false);

  const todayDow = new Date().getDay();

  const todayBlocks = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const upcomingDeadlines = deadlines
    .filter(d => !d.completed && daysUntil(d.due_date) <= 7)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const focusSection = sections
    .filter(s => s.next_item_title)
    .sort((a, b) => {
      const aDate = a.exam_date ? new Date(a.exam_date + 'T12:00:00').getTime() : Infinity;
      const bDate = b.exam_date ? new Date(b.exam_date + 'T12:00:00').getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return a.progress - b.progress;
    })[0] ?? null;

  const hasAnything = todayBlocks.length > 0 || upcomingDeadlines.length > 0 || focusSection;

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid #1a2638' }}
        >
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
            Today
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAddDeadline(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
              style={{ color: '#475569' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#1a2638'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Deadline
            </button>
            <Link
              to="/schedule"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
              style={{ color: '#475569' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.backgroundColor = '#1a2638'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#475569'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <CalendarDays className="w-3 h-3" /> Schedule
            </Link>
          </div>
        </div>

        {hasAnything ? (
          <div>

            {/* ── Deadlines ── */}
            {upcomingDeadlines.length > 0 && (
              <>
                <SectionLabel>Deadlines</SectionLabel>
                {upcomingDeadlines.map(deadline => {
                  const urgency = deadlineUrgency(deadline.due_date);
                  const cfg = URGENCY_CONFIG[urgency];
                  const label = cfg.label || deadlineLabel(deadline.due_date);
                  return (
                    <div
                      key={deadline.id}
                      className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors"
                      style={{ borderBottom: '1px solid #0f1826' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111d2e')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Left accent bar */}
                      <div
                        className="w-0.5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cfg.bar }}
                      />
                      <span className="text-sm flex-1 truncate font-medium" style={{ color: '#e2e8f0' }}>
                        {deadline.title}
                      </span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={cfg.badge}
                      >
                        {label || deadlineLabel(deadline.due_date)}
                      </span>
                      <button
                        onClick={() => deleteDeadline(deadline.id).catch(() => toast.error('Failed'))}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all flex-shrink-0"
                        style={{ color: '#334155' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Today's classes ── */}
            {todayBlocks.length > 0 && (
              <>
                <SectionLabel>Classes</SectionLabel>
                {todayBlocks.map(block => (
                  <div
                    key={block.id}
                    className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors"
                    style={{ borderBottom: '1px solid #0f1826' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111d2e')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div
                      className="w-0.5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: '#38bdf8' }}
                    />
                    <span className="text-sm flex-1 truncate font-medium" style={{ color: '#e2e8f0' }}>
                      {block.title}
                    </span>
                    <span
                      className="text-[11px] flex-shrink-0 font-medium"
                      style={{ color: '#475569' }}
                    >
                      {block.start_time}
                    </span>
                    <button
                      onClick={() => deleteBlock(block.id).catch(() => toast.error('Failed'))}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all flex-shrink-0"
                      style={{ color: '#334155' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* ── Focus now ── */}
            {focusSection && (
              <>
                <SectionLabel>Focus now</SectionLabel>
                <Link
                  to={`/section/${focusSection.id}`}
                  className="flex items-center gap-3.5 px-5 py-3.5 pb-4 transition-colors group"
                  style={{ display: 'flex' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111d2e')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div
                    className="w-0.5 h-5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#10b981' }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
                      {focusSection.title}
                    </span>
                    {focusSection.next_item_title && (
                      <span className="text-sm" style={{ color: '#475569' }}>
                        {' '}· {focusSection.next_item_title}
                      </span>
                    )}
                  </div>
                  <ArrowRight
                    className="w-3.5 h-3.5 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                    style={{ color: '#2a3a50' }}
                  />
                </Link>
              </>
            )}

          </div>
        ) : (
          <div className="px-5 py-6">
            <p className="text-sm" style={{ color: '#2a3a50' }}>Nothing scheduled for today.</p>
          </div>
        )}
      </div>

      {showAddBlock && (
        <AddBlockModal sections={sections} onClose={() => setShowAddBlock(false)} onAdd={addBlock} />
      )}
      {showAddDeadline && (
        <AddDeadlineModal sections={sections} onClose={() => setShowAddDeadline(false)} onAdd={addDeadline} />
      )}
    </>
  );
}
