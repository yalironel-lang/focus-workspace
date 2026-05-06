import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare, Square, Trash2, Plus, CalendarDays, Clock, MapPin, ArrowRight, AlertCircle, BookOpen } from 'lucide-react';
import { useSchedule } from '../hooks/useSchedule';
import { useDeadlines } from '../hooks/useDeadlines';
import { AddBlockModal } from './AddBlockModal';
import { AddDeadlineModal } from './AddDeadlineModal';
import { SectionWithProgress, Deadline, BlockColor } from '../types';
import toast from 'react-hot-toast';

interface Props {
  sections: SectionWithProgress[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BLOCK_COLORS: Record<BlockColor, { pill: string; dot: string }> = {
  indigo:  { pill: 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20',  dot: 'bg-indigo-400'  },
  violet:  { pill: 'bg-violet-500/10 text-violet-300 border border-violet-500/20',  dot: 'bg-violet-400'  },
  emerald: { pill: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20', dot: 'bg-emerald-400' },
  amber:   { pill: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',   dot: 'bg-amber-400'   },
  sky:     { pill: 'bg-sky-500/10 text-sky-300 border border-sky-500/20',         dot: 'bg-sky-400'     },
  rose:    { pill: 'bg-rose-500/10 text-rose-300 border border-rose-500/20',       dot: 'bg-rose-400'    },
  slate:   { pill: 'bg-slate-500/10 text-slate-300 border border-slate-700',       dot: 'bg-slate-500'   },
};

const DEADLINE_TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment',
  quiz:       'Quiz',
  exam:       'Exam',
  project:    'Project',
  reading:    'Reading',
};

function deadlineUrgency(dueDate: string): 'overdue' | 'today' | 'this-week' | 'later' {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDate + 'T12:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7)  return 'this-week';
  return 'later';
}

const URGENCY_STYLE = {
  overdue:     { badge: 'bg-rose-500/15 text-rose-400 font-bold',   label: 'Overdue' },
  today:       { badge: 'bg-amber-500/15 text-amber-400 font-bold', label: 'Today'   },
  'this-week': { badge: 'bg-[#1a2236] text-slate-400',              label: ''        },
  later:       { badge: 'bg-[#0d1424] text-slate-600',              label: ''        },
};

function fmt(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formattedDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function sectionName(sections: SectionWithProgress[], id: string | null) {
  return id ? (sections.find(s => s.id === id)?.title ?? '') : '';
}

export function TodayPanel({ sections }: Props) {
  const { blocks, addBlock, deleteBlock } = useSchedule();
  const { deadlines, addDeadline, toggleDeadline, deleteDeadline } = useDeadlines();

  const [showAddBlock,    setShowAddBlock]    = useState(false);
  const [showAddDeadline, setShowAddDeadline] = useState(false);

  const todayDow    = new Date().getDay();
  const todayBlocks = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, 1);

  const upcoming = deadlines
    .filter(d => !d.completed)
    .filter(d => deadlineUrgency(d.due_date) !== 'later')
    .slice(0, 1);

  const focusSection = sections
    .filter(s => s.next_item_title)
    .sort((a, b) => {
      const aDate = a.exam_date ? new Date(a.exam_date + 'T12:00:00').getTime() : Infinity;
      const bDate = b.exam_date ? new Date(b.exam_date + 'T12:00:00').getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return a.progress - b.progress;
    })[0] ?? null;

  const hasContent = todayBlocks.length > 0 || upcoming.length > 0 || focusSection;

  return (
    <>
      <div className="bg-[#0d1424] rounded-2xl border border-[#1a2236] overflow-hidden mb-6">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2236]">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-400">{formattedDate()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAddDeadline(true)}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-200 px-2.5 py-1 rounded-lg hover:bg-[#1a2236] transition-colors"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Deadline
            </button>
            <Link
              to="/schedule"
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-200 px-2.5 py-1 rounded-lg hover:bg-[#1a2236] transition-colors"
            >
              <CalendarDays className="w-3 h-3" /> Schedule
            </Link>
          </div>
        </div>

        {!hasContent && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-600 mb-1">No classes or deadlines today.</p>
            <button
              onClick={() => setShowAddBlock(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              + Add your first class →
            </button>
          </div>
        )}

        <div className="divide-y divide-[#1a2236]">

          {/* Today's classes */}
          {todayBlocks.length > 0 && (
            <section className="px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 mb-2.5">
                {DAY_FULL[todayDow]}'s classes
              </p>
              <div className="space-y-2">
                {todayBlocks.map(block => {
                  const c = BLOCK_COLORS[block.color] ?? BLOCK_COLORS.indigo;
                  const course = sectionName(sections, block.section_id);
                  return (
                    <div key={block.id} className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl ${c.pill} transition-all`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{block.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-0.5 text-xs text-slate-500">
                            <Clock className="w-3 h-3" /> {block.start_time}–{block.end_time}
                          </span>
                          {block.location && (
                            <span className="flex items-center gap-0.5 text-xs text-slate-500">
                              <MapPin className="w-3 h-3" /> {block.location}
                            </span>
                          )}
                          {course && <span className="text-xs text-slate-600 truncate">{course}</span>}
                        </div>
                      </div>
                      {block.link && (
                        <a
                          href={block.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg text-slate-300 hover:bg-[#1a2236]/60"
                        >
                          Join →
                        </a>
                      )}
                      <button
                        onClick={() => deleteBlock(block.id).catch(() => toast.error('Failed'))}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-400 transition-all rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Upcoming deadlines */}
          {upcoming.length > 0 && (
            <section className="px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 mb-2.5">
                Coming up
              </p>
              <div className="space-y-1.5">
                {upcoming.map(d => (
                  <DeadlineRow
                    key={d.id}
                    deadline={d}
                    sections={sections}
                    onToggle={toggleDeadline}
                    onDelete={deleteDeadline}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Focus now */}
          {focusSection && (
            <section className="px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-500/70 mb-2.5">
                Focus now
              </p>
              <Link
                to={`/section/${focusSection.id}`}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-[#070b14] border border-[#1a2236] hover:border-[#2a3a5c] transition-all group"
              >
                <BookOpen className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-emerald-400/80 mb-0.5 truncate">{focusSection.title}</p>
                  <p className="text-sm font-semibold text-slate-200 truncate">{focusSection.next_item_title}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
              </Link>
            </section>
          )}

        </div>
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

function DeadlineRow({ deadline, sections, onToggle, onDelete }: {
  deadline: Deadline;
  sections: SectionWithProgress[];
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const urgency = deadlineUrgency(deadline.due_date);
  const { badge, label } = URGENCY_STYLE[urgency];
  const course = sectionName(sections, deadline.section_id);

  return (
    <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#1a2236] transition-colors">
      <button
        onClick={() => onToggle(deadline.id, !deadline.completed).catch(() => toast.error('Failed'))}
        className="flex-shrink-0"
      >
        {deadline.completed
          ? <CheckSquare className="w-4 h-4 text-emerald-400" />
          : <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge}`}>
            {label || fmt(deadline.due_date)}
          </span>
          {!label && urgency === 'this-week' && (
            <span className="text-[10px] text-slate-600">{DAY_LABELS[new Date(deadline.due_date + 'T12:00:00').getDay()]}</span>
          )}
          <span className="text-[10px] text-slate-600">{DEADLINE_TYPE_LABEL[deadline.type]}</span>
        </div>
        <p className={`text-sm font-medium truncate mt-0.5 ${deadline.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>
          {deadline.title}
        </p>
        {course && <p className="text-[11px] text-slate-600 truncate">{course}</p>}
      </div>

      {urgency === 'overdue' && !deadline.completed && (
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
      )}

      <button
        onClick={() => onDelete(deadline.id).catch(() => toast.error('Failed'))}
        className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-400 transition-all rounded flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
