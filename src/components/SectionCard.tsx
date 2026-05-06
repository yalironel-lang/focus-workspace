import { Link } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../types';
import { ArrowRight, Trash2 } from 'lucide-react';

// Per-workspace accent line colors
const ACCENT_LINES = [
  '#6366f1', '#f59e0b', '#10b981', '#38bdf8', '#a78bfa', '#f43f5e',
];

function accentFor(title: string): string {
  return ACCENT_LINES[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_LINES.length];
}

function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

interface SectionCardProps {
  section: SectionWithProgress;
  onDelete: (id: string) => void;
  deadlines?: Deadline[];
}

export function SectionCard({ section, onDelete }: SectionCardProps) {
  const accent    = accentFor(section.title);
  const remaining = section.total_items - section.completed_items;
  const done      = remaining === 0 && section.total_items > 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this workspace and all its contents?')) onDelete(section.id);
  };

  return (
    <div
      className="group relative rounded-2xl overflow-hidden flex flex-col transition-all duration-150"
      style={{
        backgroundColor: '#0d111a',
        border: '1px solid #263043',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#263043')}
    >
      {/* Accent line */}
      <div style={{ height: '2px', backgroundColor: accent, flexShrink: 0 }} />

      <div className="p-5 flex flex-col flex-1 gap-3.5">

        {/* Title + count + delete */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${accent}22` }}
            >
              <span className="font-bold text-xs" style={{ color: accent }}>
                {initials(section.title)}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-snug truncate" style={{ color: '#f8fafc' }}>
                {section.title}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: done ? '#10b981' : '#4b5563' }}>
                {section.total_items === 0 ? 'No actions yet'
                  : done ? 'All done'
                  : `${remaining} remaining`}
              </p>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all flex-shrink-0"
            style={{ color: '#374151' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = '#374151')}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Next action */}
        <p className="text-sm leading-snug truncate"
           style={{ color: section.next_item_title ? '#f8fafc' : '#374151',
                    fontStyle: section.next_item_title ? 'normal' : 'italic' }}>
          {section.next_item_title ?? 'No actions yet'}
        </p>

        {/* Progress bar */}
        {section.total_items > 0 && (
          <div className="rounded-full overflow-hidden" style={{ height: '2px', backgroundColor: '#111827' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${section.progress}%`,
                backgroundColor: done ? '#10b981' : '#f59e0b',
              }}
            />
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-3" style={{ borderTop: '1px solid #1a2230' }}>
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between text-sm transition-colors group/link"
            style={{ color: '#f59e0b' }}
          >
            Open workspace
            <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>

      </div>
    </div>
  );
}
