import { useState } from 'react';
import { Layout } from '../components/Layout';
import { AddBlockModal } from '../components/AddBlockModal';
import { useSchedule } from '../hooks/useSchedule';
import { useSections } from '../hooks/useSections';
import { BlockColor, ScheduleBlock } from '../types';
import { Plus, Trash2, MapPin, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

// Grid config: 8 am → 9 pm
const GRID_START = 8;
const GRID_END   = 21;
const PX_PER_HOUR = 60;
const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

// Display order: Mon → Sun
const DISPLAY_DAYS: Array<{ dow: number; short: string; long: string }> = [
  { dow: 1, short: 'Mon', long: 'Monday'    },
  { dow: 2, short: 'Tue', long: 'Tuesday'   },
  { dow: 3, short: 'Wed', long: 'Wednesday' },
  { dow: 4, short: 'Thu', long: 'Thursday'  },
  { dow: 5, short: 'Fri', long: 'Friday'    },
  { dow: 6, short: 'Sat', long: 'Saturday'  },
  { dow: 0, short: 'Sun', long: 'Sunday'    },
];

const BLOCK_COLORS: Record<BlockColor, { bg: string; text: string; border: string }> = {
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-800',  border: 'border-l-indigo-500'  },
  violet:  { bg: 'bg-violet-100',  text: 'text-violet-800',  border: 'border-l-violet-500'  },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-l-emerald-500' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-800',   border: 'border-l-amber-500'   },
  sky:     { bg: 'bg-sky-100',     text: 'text-sky-800',     border: 'border-l-sky-500'     },
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-800',    border: 'border-l-rose-500'    },
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-800',   border: 'border-l-slate-500'   },
};

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function blockTop(start: string): number {
  return Math.max(0, (timeToMins(start) - GRID_START * 60) * PX_PER_HOUR / 60);
}
function blockHeight(start: string, end: string): number {
  return Math.max(24, (timeToMins(end) - timeToMins(start)) * PX_PER_HOUR / 60);
}

export function SchedulePage() {
  const { blocks, loading, addBlock, deleteBlock } = useSchedule();
  const { sections } = useSections();
  const [showModal, setShowModal] = useState(false);

  const todayDow = new Date().getDay();
  const totalHeight = (GRID_END - GRID_START) * PX_PER_HOUR;

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this class from your schedule?')) return;
    try { await deleteBlock(id); }
    catch { toast.error('Failed to remove class'); }
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Weekly Schedule</h1>
          <p className="text-sm text-slate-400 mt-0.5">Your recurring classes, week over week</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add class
        </button>
      </div>

      {/* List view — mobile friendly */}
      <div className="block lg:hidden space-y-3 mb-6">
        {DISPLAY_DAYS.map(({ dow, long }) => {
          const dayBlocks = blocks
            .filter(b => b.day_of_week === dow)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          if (dayBlocks.length === 0) return null;
          const isToday = dow === todayDow;
          return (
            <div key={dow} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`px-4 py-2 border-b border-slate-100 ${isToday ? 'bg-primary-50' : 'bg-slate-50'}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-primary-700' : 'text-slate-500'}`}>{long}</span>
                {isToday && <span className="ml-2 text-[10px] font-bold bg-primary-600 text-white px-1.5 py-0.5 rounded-full">today</span>}
              </div>
              <div className="p-2 space-y-1.5">
                {dayBlocks.map(block => <BlockCard key={block.id} block={block} sections={sections} onDelete={handleDelete} />)}
              </div>
            </div>
          );
        })}
        {blocks.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
            <p className="text-slate-400 text-sm mb-3">No classes scheduled yet.</p>
            <button onClick={() => setShowModal(true)} className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
              + Add your first class
            </button>
          </div>
        )}
      </div>

      {/* Grid view — desktop */}
      <div className="hidden lg:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b border-slate-100">
          <div className="w-14 flex-shrink-0 border-r border-slate-100" />
          {DISPLAY_DAYS.map(({ dow, short }) => {
            const isToday = dow === todayDow;
            return (
              <div key={dow} className={`flex-1 px-2 py-2.5 text-center border-r last:border-r-0 border-slate-100 ${isToday ? 'bg-primary-50' : ''}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-primary-700' : 'text-slate-400'}`}>{short}</span>
                {isToday && <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mx-auto mt-1" />}
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div className="flex overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {/* Time column */}
          <div className="w-14 flex-shrink-0 border-r border-slate-100 relative" style={{ height: totalHeight }}>
            {HOURS.map(h => (
              <div key={h} className="absolute w-full px-1.5" style={{ top: (h - GRID_START) * PX_PER_HOUR - 8 }}>
                <span className="text-[10px] text-slate-400 font-medium">{h.toString().padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DISPLAY_DAYS.map(({ dow }) => {
            const dayBlocks = blocks.filter(b => b.day_of_week === dow);
            const isToday = dow === todayDow;
            return (
              <div key={dow} className={`flex-1 relative border-r last:border-r-0 border-slate-100 ${isToday ? 'bg-primary-50/30' : ''}`} style={{ height: totalHeight }}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full border-t border-slate-50" style={{ top: (h - GRID_START) * PX_PER_HOUR }} />
                ))}
                {/* Blocks */}
                {dayBlocks.map(block => {
                  const c = BLOCK_COLORS[block.color] ?? BLOCK_COLORS.indigo;
                  const top    = blockTop(block.start_time);
                  const height = blockHeight(block.start_time, block.end_time);
                  return (
                    <div
                      key={block.id}
                      className={`absolute inset-x-1 rounded-lg border-l-2 px-1.5 py-1 overflow-hidden group cursor-default ${c.bg} ${c.text} ${c.border}`}
                      style={{ top, height }}
                    >
                      <p className="text-[11px] font-bold leading-tight truncate">{block.title}</p>
                      {height >= 36 && (
                        <p className="text-[10px] opacity-70 mt-0.5">{block.start_time}–{block.end_time}</p>
                      )}
                      {height >= 52 && block.location && (
                        <p className="text-[10px] opacity-70 flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" />{block.location}
                        </p>
                      )}
                      <button
                        onClick={() => handleDelete(block.id)}
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                      >
                        <Trash2 className="w-3 h-3 opacity-60 hover:opacity-100" />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <AddBlockModal sections={sections} onClose={() => setShowModal(false)} onAdd={addBlock} />
      )}
    </Layout>
  );
}

function BlockCard({ block, sections, onDelete }: { block: ScheduleBlock; sections: ReturnType<typeof useSections>['sections']; onDelete: (id: string) => void }) {
  const c = BLOCK_COLORS[block.color] ?? BLOCK_COLORS.indigo;
  const course = sections.find(s => s.id === block.section_id)?.title;
  return (
    <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border-l-2 ${c.bg} ${c.text} ${c.border}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{block.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs opacity-70 flex-wrap">
          <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {block.start_time}–{block.end_time}</span>
          {block.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{block.location}</span>}
          {course && <span>{course}</span>}
        </div>
      </div>
      <button onClick={() => onDelete(block.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all rounded">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
