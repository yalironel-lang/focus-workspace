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
  indigo:  { pill: 'bg-indigo-50  text-indigo-700  border-indigo-200',  dot: 'bg-indigo-500'  },
  violet:  { pill: 'bg-violet-50  text-violet-700  border-violet-200',  dot: 'bg-violet-500'  },
  emerald: { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  amber:   { pill: 'bg-amber-50   text-amber-700   border-amber-200',   dot: 'bg-amber-500'   },
  sky:     { pill: 'bg-sky-50     text-sky-700     border-sky-200',     dot: 'bg-sky-500'     },
  rose:    { pill: 'bg-rose-50    text-rose-700    border-rose-200',    dot: 'bg-rose-500'    },
  slate:   { pill: 'bg-slate-50   text-slate-700   border-slate-200',   dot: 'bg-slate-500'   },
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
  overdue:    { badge: 'bg-rose-100   text-rose-700   font-bold', label: 'Overdue'  },
  today:      { badge: 'bg-amber-100  text-amber-700  font-bold', label: 'Today'    },
  'this-week':{ badge: 'bg-slate-100  text-slate-600',            label: ''         },
  later:      { badge: 'bg-slate-50   text-slate-400',            label: ''         },
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

  const todayDow   = new Date().getDay();
  const todayBlocks = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Upcoming deadlines — not completed, sorted by urgency then date
  const upcoming = deadlines
    .filter(d => !d.completed)
    .filter(d => deadlineUrgency(d.due_date) !== 'later')
    .slice(0, 5);

  // Best focus: section with nearest exam or lowest readiness that has a pending item
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        {/* Rainbow top strip */}
        <div className="h-px bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-semibold text-slate-800">{formattedDate()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAddDeadline(true)}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Deadline
            </button>
            <Link
              to="/schedule"
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <CalendarDays className="w-3 h-3" /> Schedule
            </Link>
          </div>
        </div>

        {!hasContent && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-400 mb-1">No classes or deadlines today.</p>
            <button onClick={() => setShowAddBlock(true)} className="text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors">
              + Add your first class →
            </button>
          </div>
        )}

        <div className="divide-y divide-slate-50">
          {/* Today's classes */}
          {todayBlocks.length > 0 && (
            <section className="px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">
                {DAY_FULL[todayDow]}'s classes
              </p>
              <div className="space-y-2">
                {todayBlocks.map(block => {
                  const c = BLOCK_COLORS[block.color] ?? BLOCK_COLORS.indigo;
                  const course = sectionName(sections, block.section_id);
                  return (
                    <div key={block.id} className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border ${c.pill} transition-all`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{block.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-0.5 text-xs opacity-70">
                            <Clock className="w-3 h-3" /> {block.start_time}–{block.end_time}
                          </span>
                          {block.location && (
                            <span className="flex items-center gap-0.5 text-xs opacity-70">
                              <MapPin className="w-3 h-3" /> {block.location}
                            </span>
                          )}
                          {course && <span className="text-xs opacity-60 truncate">{course}</span>}
                        </div>
                      </div>
                      {block.link && (
                        <a href={block.link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-lg hover:bg-white/60">
                          Join →
                        </a>
                      )}
                      <button
                        onClick={() => deleteBlock(block.id).catch(() => toast.error('Failed'))}
                        className="opacity-0 group-hover:opacity-100 p-1 text-current opacity-40 hover:opacity-100 transition-all rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => setShowAddBlock(true)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" strokeWidth={2} /> Add class
              </button>
            </section>
          )}

          {todayBlocks.length === 0 && hasContent && (
            <section className="px-5 py-3">
              <button onClick={() => setShowAddBlock(true)} className="text-xs text-slate-400 hover:text-primary-600 transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" strokeWidth={2} /> Add today's classes
              </button>
            </section>
          )}

          {/* Upcoming deadlines */}
          {upcoming.length > 0 && (
            <section className="px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Coming up</p>
              <div className="space-y-1.5">
                {upcoming.map(d => <DeadlineRow key={d.id} deadline={d} sections={sections} onToggle={toggleDeadline} onDelete={deleteDeadline} />)}
              </div>
              <button
                onClick={() => setShowAddDeadline(true)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" strokeWidth={2} /> Add deadline
              </button>
            </section>
          )}

          {/* Focus now */}
          {focusSection && (
            <section className="px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">Focus now</p>
              <Link
                to={`/section/${focusSection.id}`}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 transition-colors group"
              >
                <BookOpen className="w-4 h-4 text-primary-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-primary-300 mb-0.5 truncate">{focusSection.title}</p>
                  <p className="text-sm font-semibold text-white truncate">{focusSection.next_item_title}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-primary-400 transition-colors flex-shrink-0" />
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
    <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
      <button
        onClick={() => onToggle(deadline.id, !deadline.completed).catch(() => toast.error('Failed'))}
        className="flex-shrink-0"
      >
        {deadline.completed
          ? <CheckSquare className="w-4 h-4 text-primary-500" />
          : <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge}`}>
            {label || fmt(deadline.due_date)}
          </span>
          {!label && urgency === 'this-week' && (
            <span className="text-[10px] text-slate-400">{DAY_LABELS[new Date(deadline.due_date + 'T12:00:00').getDay()]}</span>
          )}
          <span className="text-[10px] text-slate-400">{DEADLINE_TYPE_LABEL[deadline.type]}</span>
        </div>
        <p className={`text-sm font-medium truncate mt-0.5 ${deadline.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          {deadline.title}
        </p>
        {course && <p className="text-[11px] text-slate-400 truncate">{course}</p>}
      </div>

      {urgency === 'overdue' && !deadline.completed && (
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
      )}

      <button
        onClick={() => onDelete(deadline.id).catch(() => toast.error('Failed'))}
        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all rounded flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
