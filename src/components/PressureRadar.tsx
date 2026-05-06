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
  return `${d}d`;
}

const URGENCY_DOT: Record<UrgencyLevel, string> = {
  overdue: '#ef4444',
  today:   '#f59e0b',
  soon:    '#f59e0b',
  week:    '#374151',
};

const URGENCY_LABEL: Record<UrgencyLevel, React.CSSProperties> = {
  overdue: { color: '#ef4444' },
  today:   { color: '#f59e0b' },
  soon:    { color: '#f59e0b' },
  week:    { color: '#4b5563' },
};

export function PressureRadar({ sections }: Props) {
  const { blocks, addBlock, deleteBlock } = useSchedule();
  const { deadlines, addDeadline, deleteDeadline } = useDeadlines();

  const [showAddBlock,    setShowAddBlock]    = useState(false);
  const [showAddDeadline, setShowAddDeadline] = useState(false);

  const todayDow = new Date().getDay();

  // Today's class blocks
  const todayBlocks = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Upcoming deadlines (not completed, within 7 days + overdue)
  const upcomingDeadlines = deadlines
    .filter(d => !d.completed && daysUntil(d.due_date) <= 7)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  // Focus section
  const focusSection = sections
    .filter(s => s.next_item_title)
    .sort((a, b) => {
      const aDate = a.exam_date ? new Date(a.exam_date + 'T12:00:00').getTime() : Infinity;
      const bDate = b.exam_date ? new Date(b.exam_date + 'T12:00:00').getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return a.progress - b.progress;
    })[0] ?? null;

  const hasAnything = todayBlocks.length > 0 || upcomingDeadlines.length > 0 || focusSection;

  const rowStyle: React.CSSProperties = {
    borderBottom: '1px solid #0f1520',
  };

  return (
    <>
      <div className="rounded-xl overflow-hidden mb-5"
           style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3"
             style={{ borderBottom: '1px solid #263043' }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: '#374151' }}>
            Pressure
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowAddDeadline(true)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#4b5563' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Deadline
            </button>
            <Link
              to="/schedule"
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#4b5563' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
            >
              <CalendarDays className="w-3 h-3" /> Schedule
            </Link>
          </div>
        </div>

        {hasAnything ? (
          <div>
            {/* Deadlines */}
            {upcomingDeadlines.map(deadline => {
              const urgency = deadlineUrgency(deadline.due_date);
              return (
                <div
                  key={deadline.id}
                  className="group flex items-center gap-3 px-5 py-3"
                  style={rowStyle}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: URGENCY_DOT[urgency] }}
                  />
                  <span className="text-sm flex-1 truncate" style={{ color: '#f8fafc' }}>
                    {deadline.title}
                  </span>
                  <span className="text-xs font-semibold flex-shrink-0" style={URGENCY_LABEL[urgency]}>
                    {deadlineLabel(deadline.due_date)}
                  </span>
                  <button
                    onClick={() => deleteDeadline(deadline.id).catch(() => toast.error('Failed'))}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0"
                    style={{ color: '#374151' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {/* Today's blocks */}
            {todayBlocks.map(block => (
              <div
                key={block.id}
                className="group flex items-center gap-3 px-5 py-3"
                style={rowStyle}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#38bdf8' }}
                />
                <span className="text-sm flex-1 truncate" style={{ color: '#f8fafc' }}>
                  {block.title}
                </span>
                <span className="text-xs flex-shrink-0" style={{ color: '#4b5563' }}>
                  {block.start_time}
                </span>
                <button
                  onClick={() => deleteBlock(block.id).catch(() => toast.error('Failed'))}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0"
                  style={{ color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Focus item */}
            {focusSection && (
              <Link
                to={`/section/${focusSection.id}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors"
                style={{ display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#10b981' }}
                />
                <span className="text-sm flex-1 min-w-0 truncate" style={{ color: '#94a3b8' }}>
                  <span style={{ color: '#f8fafc' }}>{focusSection.title}</span>
                  {focusSection.next_item_title && (
                    <span> · {focusSection.next_item_title}</span>
                  )}
                </span>
                <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: '#263043' }} />
              </Link>
            )}
          </div>
        ) : (
          <div className="px-5 py-5">
            <p className="text-sm" style={{ color: '#263043' }}>Nothing pressing.</p>
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
