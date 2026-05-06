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

function deadlineLabel(date: string): { text: string; color: string } {
  const d = daysUntil(date);
  if (d < 0)  return { text: 'Overdue',   color: 'text-rose-400' };
  if (d === 0) return { text: 'Today',     color: 'text-amber-400' };
  if (d === 1) return { text: 'Tomorrow',  color: 'text-amber-400' };
  return { text: `${d}d`,               color: 'text-slate-500' };
}

function deadlineDot(date: string): string {
  const d = daysUntil(date);
  if (d < 0)  return 'bg-rose-400';
  if (d <= 1) return 'bg-amber-400';
  return 'bg-slate-600';
}

export function TodayPanel({ sections }: Props) {
  const { blocks, addBlock, deleteBlock } = useSchedule();
  const { deadlines, addDeadline, deleteDeadline } = useDeadlines();

  const [showAddBlock,    setShowAddBlock]    = useState(false);
  const [showAddDeadline, setShowAddDeadline] = useState(false);

  const todayDow = new Date().getDay();

  // Next class today
  const nextBlock = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0] ?? null;

  // Most urgent pending deadline (overdue → today → this week)
  const nextDeadline = deadlines
    .filter(d => !d.completed && daysUntil(d.due_date) <= 7)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

  // Highest-priority focus item
  const focusSection = sections
    .filter(s => s.next_item_title)
    .sort((a, b) => {
      const aDate = a.exam_date ? new Date(a.exam_date + 'T12:00:00').getTime() : Infinity;
      const bDate = b.exam_date ? new Date(b.exam_date + 'T12:00:00').getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return a.progress - b.progress;
    })[0] ?? null;

  const hasContent = nextBlock || nextDeadline || focusSection;

  const rows: React.ReactNode[] = [];

  if (nextBlock) {
    rows.push(
      <div key="class" className="group flex items-center gap-3 px-5 py-3.5">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
        <span className="text-sm text-slate-300 font-medium flex-1 truncate">{nextBlock.title}</span>
        <span className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
          <Clock className="w-3 h-3" />{nextBlock.start_time}
        </span>
        <button
          onClick={() => deleteBlock(nextBlock.id).catch(() => toast.error('Failed'))}
          className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-400 transition-all rounded ml-1 flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (nextDeadline) {
    const { text, color } = deadlineLabel(nextDeadline.due_date);
    rows.push(
      <div key="deadline" className="group flex items-center gap-3 px-5 py-3.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${deadlineDot(nextDeadline.due_date)}`} />
        <span className="text-sm text-slate-300 font-medium flex-1 truncate">{nextDeadline.title}</span>
        <span className={`text-xs font-semibold flex-shrink-0 ${color}`}>{text}</span>
        <button
          onClick={() => deleteDeadline(nextDeadline.id).catch(() => toast.error('Failed'))}
          className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-400 transition-all rounded ml-1 flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (focusSection) {
    rows.push(
      <Link
        key="focus"
        to={`/section/${focusSection.id}`}
        className="group flex items-center gap-3 px-5 py-3.5 hover:bg-[#1a2236] transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-sm text-slate-500 flex-1 min-w-0 truncate">
          <span className="text-slate-400">{focusSection.title}</span>
          {focusSection.next_item_title && (
            <> · <span className="text-slate-300">{focusSection.next_item_title}</span></>
          )}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
      </Link>
    );
  }

  return (
    <>
      <div className="bg-[#0d1424] rounded-2xl border border-[#1a2236] overflow-hidden mb-10">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2236]">
          <span className="text-xs text-slate-600 font-medium">Today</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAddDeadline(true)}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-300 px-2 py-1 rounded-lg hover:bg-[#1a2236] transition-colors"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Deadline
            </button>
            <Link
              to="/schedule"
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-300 px-2 py-1 rounded-lg hover:bg-[#1a2236] transition-colors"
            >
              <CalendarDays className="w-3 h-3" /> Schedule
            </Link>
          </div>
        </div>

        {/* Rows */}
        {hasContent ? (
          <div className="divide-y divide-[#1a2236]">
            {rows}
          </div>
        ) : (
          <div className="px-5 py-6">
            <p className="text-sm text-slate-600">Nothing scheduled today.</p>
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
