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
  'done':     { label: 'Done',     color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.2)'   },
  'stable':   { label: 'Stable',   color: '#34d399', bg: 'rgba(52,211,153,0.1)',   border: 'rgba(52,211,153,0.2)'   },
  'building': { label: 'Building', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)'   },
  'at-risk':  { label: 'At Risk',  color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)'  },
};

const PROGRESS_COLOR: Record<StatusLevel, string> = {
  'done':     '#34d399',
  'stable':   '#34d399',
  'building': '#fbbf24',
  'at-risk':  '#f87171',
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
      className="group relative rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
      style={{
        backgroundColor: '#0d1424',
        border: '1px solid #1a2638',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#2a3a54';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#1a2638';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Accent line */}
      <div style={{ height: '3px', backgroundColor: accent, flexShrink: 0 }} />

      <div className="p-5 flex flex-col flex-1 gap-4">

        {/* Header row: avatar + title + status + delete */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${accent}18` }}
            >
              {custom.icon ? (
                <span className="text-base leading-none" role="img">{custom.icon}</span>
              ) : (
                <span className="font-bold text-xs" style={{ color: accent }}>
                  {initials(section.title)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm leading-snug truncate" style={{ color: '#f1f5f9' }}>
                {section.title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {section.total_items > 0 && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
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
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all"
              style={{ color: '#2a3a50' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#2a3a50'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="Delete workspace"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Next action */}
        <div className="flex-1 min-h-[2rem]">
          {section.next_item_title ? (
            <div>
              <span
                className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                style={{ color: '#334155' }}
              >
                Next
              </span>
              <p
                className="text-sm leading-snug line-clamp-2"
                style={{ color: '#64748b' }}
              >
                {section.next_item_title}
              </p>
            </div>
          ) : (
            <p
              className="text-sm italic leading-snug"
              style={{ color: '#1e2d40' }}
            >
              No actions yet
            </p>
          )}
        </div>

        {/* Progress */}
        {section.total_items > 0 && (
          <div>
            <div
              className="rounded-full overflow-hidden"
              style={{ height: '3px', backgroundColor: '#111d2e' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${section.progress}%`,
                  backgroundColor: PROGRESS_COLOR[status],
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] font-medium" style={{ color: '#334155' }}>
                {section.completed_items}/{section.total_items}
              </span>
              {examDays !== null ? (
                <span
                  className="text-[11px] font-semibold"
                  style={{
                    color: examDays <= 7 ? '#f87171' : examDays <= 14 ? '#fbbf24' : '#475569',
                  }}
                >
                  Exam {examDays <= 0 ? 'today' : `in ${examDays}d`}
                </span>
              ) : nearestDeadline ? (
                <span
                  className="text-[11px] font-medium"
                  style={{ color: daysUntil(nearestDeadline.due_date) <= 2 ? '#f87171' : '#475569' }}
                >
                  {(() => {
                    const d = daysUntil(nearestDeadline.due_date);
                    if (d < 0)  return `Due ${Math.abs(d)}d ago`;
                    if (d === 0) return 'Due today';
                    if (d === 1) return 'Due tomorrow';
                    return `Due in ${d}d`;
                  })()}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div
          className="pt-3 mt-auto"
          style={{ borderTop: '1px solid #111d2e' }}
        >
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between group/link"
          >
            <span
              className="text-xs font-semibold transition-colors"
              style={{ color: remaining === 0 && section.total_items > 0 ? '#34d399' : '#f59e0b' }}
            >
              {remaining === 0 && section.total_items > 0
                ? 'All done ✓'
                : remaining > 0
                  ? `${remaining} remaining`
                  : 'Open workspace'}
            </span>
            <ArrowRight
              className="w-3.5 h-3.5 transition-all group-hover/link:translate-x-0.5"
              style={{ color: remaining === 0 && section.total_items > 0 ? '#34d399' : '#f59e0b' }}
            />
          </Link>
        </div>

      </div>
    </div>
  );
}
