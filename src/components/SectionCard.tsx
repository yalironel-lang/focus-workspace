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

type StatusLevel = 'stable' | 'building' | 'at-risk' | 'done';

function getStatus(progress: number, totalItems: number): StatusLevel {
  if (totalItems === 0) return 'building';
  if (progress >= 100) return 'done';
  if (progress >= 65)  return 'stable';
  if (progress >= 25)  return 'building';
  return 'at-risk';
}

const STATUS_CONFIG: Record<StatusLevel, { label: string; color: string; bg: string; border: string }> = {
  'done':     { label: 'Done',     color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
  'stable':   { label: 'Stable',   color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
  'building': { label: 'Building', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  'at-risk':  { label: 'At Risk',  color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
};

const PROGRESS_COLOR: Record<StatusLevel, string> = {
  'done':     '#10b981',
  'stable':   '#10b981',
  'building': '#f59e0b',
  'at-risk':  '#ef4444',
};

interface SectionCardProps {
  section: SectionWithProgress;
  onDelete: (id: string) => void;
  deadlines?: Deadline[];
}

export function SectionCard({ section, onDelete, deadlines = [] }: SectionCardProps) {
  const custom  = getWorkspaceCustomization(section.id);
  const accent  = custom.accent || accentFor(section.title);
  const status  = getStatus(section.progress, section.total_items);
  const cfg     = STATUS_CONFIG[status];
  const remaining = section.total_items - section.completed_items;

  // Nearest upcoming deadline for this workspace
  const nearestDeadline = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

  const examDays = section.exam_date ? daysUntil(section.exam_date) : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this workspace and all its contents?')) onDelete(section.id);
  };

  return (
    <div
      className="group relative rounded-xl overflow-hidden flex flex-col transition-all duration-150"
      style={{
        backgroundColor: '#0d111a',
        border: '1px solid #263043',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#374151';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#263043';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Accent line */}
      <div style={{ height: '2px', backgroundColor: accent, flexShrink: 0 }} />

      <div className="p-4 flex flex-col flex-1 gap-3">

        {/* Header: avatar + title + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${accent}18` }}
            >
              {custom.icon ? (
                <span className="text-sm leading-none" role="img">{custom.icon}</span>
              ) : (
                <span className="font-bold text-[11px]" style={{ color: accent }}>
                  {initials(section.title)}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm leading-snug truncate" style={{ color: '#f8fafc' }}>
              {section.title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {section.total_items > 0 && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: cfg.color,
                  backgroundColor: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                }}
              >
                {cfg.label}
              </span>
            )}
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
              style={{ color: '#374151' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Next action */}
        <p
          className="text-sm leading-snug truncate"
          style={{
            color: section.next_item_title ? '#94a3b8' : '#263043',
            fontStyle: section.next_item_title ? 'normal' : 'italic',
          }}
        >
          {section.next_item_title ?? 'No actions yet'}
        </p>

        {/* Progress bar */}
        {section.total_items > 0 && (
          <div>
            <div className="rounded-full overflow-hidden" style={{ height: '2px', backgroundColor: '#111827' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${section.progress}%`,
                  backgroundColor: PROGRESS_COLOR[status],
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px]" style={{ color: '#263043' }}>
                {section.completed_items}/{section.total_items}
              </span>
              {examDays !== null && (
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: examDays <= 7 ? '#ef4444' : examDays <= 14 ? '#f59e0b' : '#374151' }}
                >
                  Exam {examDays <= 0 ? 'today' : `in ${examDays}d`}
                </span>
              )}
              {nearestDeadline && examDays === null && (
                <span
                  className="text-[10px]"
                  style={{ color: daysUntil(nearestDeadline.due_date) <= 2 ? '#ef4444' : '#374151' }}
                >
                  {(() => {
                    const d = daysUntil(nearestDeadline.due_date);
                    if (d < 0)  return `Due ${Math.abs(d)}d ago`;
                    if (d === 0) return 'Due today';
                    if (d === 1) return 'Due tomorrow';
                    return `Due in ${d}d`;
                  })()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-2.5" style={{ borderTop: '1px solid #111827' }}>
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between text-sm transition-colors group/link"
            style={{ color: remaining === 0 && section.total_items > 0 ? '#10b981' : '#f59e0b' }}
          >
            <span className="text-xs font-semibold">
              {remaining === 0 && section.total_items > 0 ? 'All done' : `${remaining > 0 ? remaining : '—'} remaining`}
            </span>
            <ArrowRight className="w-3 h-3 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>

      </div>
    </div>
  );
}
