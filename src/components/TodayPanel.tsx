import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarDays, Clock, ArrowRight, Trash2 } from 'lucide-react';
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

function deadlineSignal(date: string): { label: string; color: string; dot: string } {
  const d = daysUntil(date);
  if (d < 0)  return { label: 'Overdue',  color: '#ef4444', dot: '#ef4444' };
  if (d === 0) return { label: 'Today',    color: '#f59e0b', dot: '#f59e0b' };
  if (d === 1) return { label: 'Tomorrow', color: '#f59e0b', dot: '#f59e0b' };
  return             { label: `${d}d`,    color: '#94a3b8', dot: '#374151' };
}

export function TodayPanel({ sections }: Props) {
  const { blocks, addBlock, deleteBlock } = useSchedule();
  const { deadlines, addDeadline, deleteDeadline } = useDeadlines();

  const [showAddBlock,    setShowAddBlock]    = useState(false);
  const [showAddDeadline, setShowAddDeadline] = useState(false);

  const todayDow = new Date().getDay();

  const nextBlock = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0] ?? null;

  const nextDeadline = deadlines
    .filter(d => !d.completed && daysUntil(d.due_date) <= 7)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

  const focusSection = sections
    .filter(s => s.next_item_title)
    .sort((a, b) => {
      const aDate = a.exam_date ? new Date(a.exam_date + 'T12:00:00').getTime() : Infinity;
      const bDate = b.exam_date ? new Date(b.exam_date + 'T12:00:00').getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return a.progress - b.progress;
    })[0] ?? null;

  const hasContent = nextBlock || nextDeadline || focusSection;

  const rowStyle: React.CSSProperties = {
    borderBottom: '1px solid #1a2230',
  };

  return (
    <>
      <div className="rounded-2xl overflow-hidden mb-8"
           style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3"
             style={{ borderBottom: '1px solid #263043' }}>
          <span className="text-xs font-medium" style={{ color: '#4b5563' }}>Today</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAddDeadline(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#4b5563' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Deadline
            </button>
            <Link
              to="/schedule"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: '#4b5563' }}
            >
              <CalendarDays className="w-3 h-3" /> Schedule
            </Link>
          </div>
        </div>

        {hasContent ? (
          <div>

            {/* Next class */}
            {nextBlock && (
              <div className="group flex items-center gap-4 px-5 py-4" style={rowStyle}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: '#38bdf8' }} />
                <span className="text-sm font-medium flex-1 truncate" style={{ color: '#f8fafc' }}>
                  {nextBlock.title}
                </span>
                <span className="flex items-center gap-1 text-xs flex-shrink-0"
                      style={{ color: '#94a3b8' }}>
                  <Clock className="w-3 h-3" />{nextBlock.start_time}
                </span>
                <button
                  onClick={() => deleteBlock(nextBlock.id).catch(() => toast.error('Failed'))}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0"
                  style={{ color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Next deadline */}
            {nextDeadline && (
              <div className="group flex items-center gap-4 px-5 py-4" style={rowStyle}>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: deadlineSignal(nextDeadline.due_date).dot }}
                />
                <span className="text-sm font-medium flex-1 truncate" style={{ color: '#f8fafc' }}>
                  {nextDeadline.title}
                </span>
                <span className="text-xs font-semibold flex-shrink-0"
                      style={{ color: deadlineSignal(nextDeadline.due_date).color }}>
                  {deadlineSignal(nextDeadline.due_date).label}
                </span>
                <button
                  onClick={() => deleteDeadline(nextDeadline.id).catch(() => toast.error('Failed'))}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0"
                  style={{ color: '#374151' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Focus item */}
            {focusSection && (
              <Link
                to={`/section/${focusSection.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors"
                style={{ display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111827')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: '#10b981' }} />
                <span className="text-sm flex-1 min-w-0 truncate" style={{ color: '#94a3b8' }}>
                  <span style={{ color: '#f8fafc' }}>{focusSection.title}</span>
                  {focusSection.next_item_title && (
                    <span> · {focusSection.next_item_title}</span>
                  )}
                </span>
                <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#374151' }} />
              </Link>
            )}

          </div>
        ) : (
          <div className="px-5 py-6">
            <p className="text-sm" style={{ color: '#374151' }}>Nothing scheduled today.</p>
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
