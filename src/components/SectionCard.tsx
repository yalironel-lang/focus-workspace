import { Link } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../types';
import { ArrowRight, Trash2 } from 'lucide-react';
import { getWorkspaceCustomization } from '../hooks/useWorkspaceCustomization';

const ACCENT_LINES = [
  '#6366f1', '#f59e0b', '#10b981', '#38bdf8', '#a78bfa', '#f43f5e',
];

function accentFor(title: string): string {
  return ACCENT_LINES[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_LINES.length];
}

function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function daysUntil(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(date + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

type Warmth = 'warm' | 'cool' | 'neutral' | 'done';

function getWarmth(progress: number, totalItems: number): Warmth {
  if (totalItems === 0) return 'neutral';
  if (progress >= 100) return 'done';
  if (progress >= 65)  return 'warm';
  if (progress >= 25)  return 'cool';
  return 'cool';
}

const WARMTH_COLOR: Record<Warmth, string> = {
  done:    '#34d399',
  warm:    '#34d399',
  cool:    '#fbbf24',
  neutral: '#2a3a54',
};

interface SectionCardProps {
  section: SectionWithProgress;
  onDelete: (id: string) => void;
  deadlines?: Deadline[];
}

export function SectionCard({ section, onDelete, deadlines = [] }: SectionCardProps) {
  const custom  = getWorkspaceCustomization(section.id);
  const accent  = custom.accent || accentFor(section.title);
  const warmth  = getWarmth(section.progress, section.total_items);
  const warmthColor = WARMTH_COLOR[warmth];

  const nearestDeadline = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

  const examDays = section.exam_date ? daysUntil(section.exam_date) : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Remove this space?')) onDelete(section.id);
  };

  return (
    <Link
      to={`/section/${section.id}`}
      className="group relative flex flex-col transition-all duration-300"
      style={{
        backgroundColor: 'rgba(255,255,255,0.025)',
        borderRadius: '16px',
        overflow: 'hidden',
        textDecoration: 'none',
        display: 'flex',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.048)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.025)';
      }}
    >
      {/* Accent line — spatial identity, not status */}
      <div style={{ height: '2px', backgroundColor: accent, flexShrink: 0, opacity: 0.7 }} />

      <div className="p-5 flex flex-col flex-1 gap-4">

        {/* Identity row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${accent}14` }}
            >
              {custom.icon ? (
                <span className="text-base leading-none" role="img">{custom.icon}</span>
              ) : (
                <span className="font-bold text-xs" style={{ color: accent }}>
                  {initials(section.title)}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm leading-snug truncate" style={{ color: '#e2e8f0' }}>
              {section.title}
            </h3>
          </div>

          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all flex-shrink-0"
            style={{ color: '#1e2d40' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#1e2d40'; }}
            title="Remove"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* What's next — no label, just context */}
        <div className="flex-1 min-h-[1.75rem]">
          {section.next_item_title ? (
            <p className="text-sm leading-snug line-clamp-2" style={{ color: '#334155' }}>
              {section.next_item_title}
            </p>
          ) : (
            <p className="text-sm" style={{ color: '#1a2638' }}>
              {section.total_items === 0 ? 'Empty' : 'All clear'}
            </p>
          )}
        </div>

        {/* Progress — bar only, no counters */}
        {section.total_items > 0 && (
          <div>
            <div className="rounded-full overflow-hidden" style={{ height: '2px', backgroundColor: '#0f1826' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${section.progress}%`, backgroundColor: warmthColor, opacity: 0.7 }}
              />
            </div>

            {/* Contextual time cue — only show if near */}
            {examDays !== null && examDays >= 0 && examDays <= 14 ? (
              <p className="text-[10px] mt-1.5 font-medium" style={{ color: examDays <= 3 ? '#f87171' : examDays <= 7 ? '#fbbf24' : '#334155' }}>
                Exam {examDays === 0 ? 'today' : examDays === 1 ? 'tomorrow' : `in ${examDays}d`}
              </p>
            ) : nearestDeadline && daysUntil(nearestDeadline.due_date) <= 3 ? (
              <p className="text-[10px] mt-1.5 font-medium" style={{ color: '#f87171' }}>
                {(() => {
                  const d = daysUntil(nearestDeadline.due_date);
                  if (d < 0)  return `${Math.abs(d)}d overdue`;
                  if (d === 0) return 'Due today';
                  return `Due tomorrow`;
                })()}
              </p>
            ) : null}
          </div>
        )}

        {/* Enter — arrow hint */}
        <div className="pt-2.5 mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center justify-end">
            <ArrowRight
              className="w-3.5 h-3.5 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
              style={{ color: '#2a3a54', opacity: 0.6 }}
            />
          </div>
        </div>

      </div>
    </Link>
  );
}
