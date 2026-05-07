import { useState } from 'react';
import { Layout } from '../components/Layout';
import { AddBlockModal } from '../components/AddBlockModal';
import { useSchedule } from '../hooks/useSchedule';
import { useSections } from '../hooks/useSections';
import { BlockColor, ScheduleBlock } from '../types';
import { Plus, Trash2, MapPin, Clock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Grid config: 8 am → 9 pm
const GRID_START   = 8;
const GRID_END     = 21;
const PX_PER_HOUR  = 60;
const HOURS        = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

const DISPLAY_DAYS: Array<{ dow: number; short: string; long: string }> = [
  { dow: 1, short: 'Mon', long: 'Monday'    },
  { dow: 2, short: 'Tue', long: 'Tuesday'   },
  { dow: 3, short: 'Wed', long: 'Wednesday' },
  { dow: 4, short: 'Thu', long: 'Thursday'  },
  { dow: 5, short: 'Fri', long: 'Friday'    },
  { dow: 6, short: 'Sat', long: 'Saturday'  },
  { dow: 0, short: 'Sun', long: 'Sunday'    },
];

// Dark color palette for blocks
const BLOCK_COLORS: Record<BlockColor, { bg: string; accent: string; text: string }> = {
  indigo:  { bg: 'rgba(99,102,241,0.12)',  accent: '#6366f1', text: '#a5b4fc' },
  violet:  { bg: 'rgba(139,92,246,0.12)',  accent: '#8b5cf6', text: '#c4b5fd' },
  emerald: { bg: 'rgba(16,185,129,0.12)',  accent: '#10b981', text: '#6ee7b7' },
  amber:   { bg: 'rgba(245,158,11,0.12)',  accent: '#f59e0b', text: '#fcd34d' },
  sky:     { bg: 'rgba(56,189,248,0.12)',  accent: '#38bdf8', text: '#7dd3fc' },
  rose:    { bg: 'rgba(244,63,94,0.12)',   accent: '#f43f5e', text: '#fda4af' },
  slate:   { bg: 'rgba(100,116,139,0.12)', accent: '#64748b', text: '#94a3b8' },
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

  const todayDow    = new Date().getDay();
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
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#f59e0b' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: '#f1f5f9' }}>
            Weekly Schedule
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#475569' }}>
            Your recurring classes, week over week
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
          style={{ backgroundColor: '#f59e0b', color: '#000' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add class
        </button>
      </div>

      {/* Mobile list view */}
      <div className="block lg:hidden space-y-3 mb-6">
        {DISPLAY_DAYS.map(({ dow, long }) => {
          const dayBlocks = blocks
            .filter(b => b.day_of_week === dow)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          if (dayBlocks.length === 0) return null;
          const isToday = dow === todayDow;
          return (
            <div
              key={dow}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#0d1424', border: `1px solid ${isToday ? '#f59e0b40' : '#1a2638'}` }}
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{
                  borderBottom: '1px solid #1a2638',
                  backgroundColor: isToday ? 'rgba(245,158,11,0.06)' : 'transparent',
                }}
              >
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: isToday ? '#f59e0b' : '#334155' }}
                >
                  {long}
                </span>
                {isToday && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  >
                    today
                  </span>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                {dayBlocks.map(block => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    sections={sections}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {blocks.length === 0 && (
          <div
            className="text-center py-12 rounded-2xl"
            style={{ border: '1px dashed #1a2638' }}
          >
            <p className="text-sm mb-3" style={{ color: '#334155' }}>
              No classes scheduled yet.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm font-semibold transition-colors"
              style={{ color: '#f59e0b' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fbbf24')}
              onMouseLeave={e => (e.currentTarget.style.color = '#f59e0b')}
            >
              + Add your first class
            </button>
          </div>
        )}
      </div>

      {/* Desktop grid view */}
      <div
        className="hidden lg:block rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
      >
        {/* Day headers */}
        <div className="flex" style={{ borderBottom: '1px solid #1a2638' }}>
          <div className="w-14 flex-shrink-0" style={{ borderRight: '1px solid #1a2638' }} />
          {DISPLAY_DAYS.map(({ dow, short }) => {
            const isToday = dow === todayDow;
            return (
              <div
                key={dow}
                className="flex-1 px-2 py-2.5 text-center"
                style={{
                  borderRight: '1px solid #1a2638',
                  backgroundColor: isToday ? 'rgba(245,158,11,0.06)' : 'transparent',
                }}
              >
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: isToday ? '#f59e0b' : '#334155' }}
                >
                  {short}
                </span>
                {isToday && (
                  <div
                    className="w-1.5 h-1.5 rounded-full mx-auto mt-1"
                    style={{ backgroundColor: '#f59e0b' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Grid body */}
        <div className="flex overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {/* Time column */}
          <div
            className="w-14 flex-shrink-0 relative"
            style={{ height: totalHeight, borderRight: '1px solid #1a2638' }}
          >
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full px-1.5"
                style={{ top: (h - GRID_START) * PX_PER_HOUR - 8 }}
              >
                <span className="text-[10px] font-medium" style={{ color: '#1e2d40' }}>
                  {h.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DISPLAY_DAYS.map(({ dow }) => {
            const dayBlocks = blocks.filter(b => b.day_of_week === dow);
            const isToday   = dow === todayDow;
            return (
              <div
                key={dow}
                className="flex-1 relative"
                style={{
                  height: totalHeight,
                  borderRight: '1px solid #1a2638',
                  backgroundColor: isToday ? 'rgba(245,158,11,0.025)' : 'transparent',
                }}
              >
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full"
                    style={{
                      top: (h - GRID_START) * PX_PER_HOUR,
                      borderTop: '1px solid #0f1826',
                    }}
                  />
                ))}
                {/* Blocks */}
                {dayBlocks.map(block => {
                  const c      = BLOCK_COLORS[block.color] ?? BLOCK_COLORS.indigo;
                  const top    = blockTop(block.start_time);
                  const height = blockHeight(block.start_time, block.end_time);
                  return (
                    <div
                      key={block.id}
                      className="absolute inset-x-1 rounded-lg overflow-hidden group cursor-default px-1.5 py-1"
                      style={{
                        top,
                        height,
                        backgroundColor: c.bg,
                        borderLeft: `2px solid ${c.accent}`,
                      }}
                    >
                      <p
                        className="text-[11px] font-bold leading-tight truncate"
                        style={{ color: c.text }}
                      >
                        {block.title}
                      </p>
                      {height >= 36 && (
                        <p className="text-[10px] mt-0.5" style={{ color: c.text, opacity: 0.6 }}>
                          {block.start_time}–{block.end_time}
                        </p>
                      )}
                      {height >= 52 && block.location && (
                        <p
                          className="text-[10px] flex items-center gap-0.5"
                          style={{ color: c.text, opacity: 0.6 }}
                        >
                          <MapPin className="w-2.5 h-2.5" />{block.location}
                        </p>
                      )}
                      <button
                        onClick={() => handleDelete(block.id)}
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                        style={{ color: c.text }}
                      >
                        <Trash2 className="w-3 h-3" />
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

function BlockCard({
  block, sections, onDelete,
}: {
  block: ScheduleBlock;
  sections: ReturnType<typeof useSections>['sections'];
  onDelete: (id: string) => void;
}) {
  const c      = BLOCK_COLORS[block.color] ?? BLOCK_COLORS.indigo;
  const course = sections.find(s => s.id === block.section_id)?.title;
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl"
      style={{
        backgroundColor: c.bg,
        borderLeft: `2px solid ${c.accent}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: c.text }}>
          {block.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap" style={{ color: c.text, opacity: 0.65 }}>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" /> {block.start_time}–{block.end_time}
          </span>
          {block.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />{block.location}
            </span>
          )}
          {course && <span>{course}</span>}
        </div>
      </div>
      <button
        onClick={() => onDelete(block.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
        style={{ color: c.text }}
        onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={e => (e.currentTarget.style.color = c.text)}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
