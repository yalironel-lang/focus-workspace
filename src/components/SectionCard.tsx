import { Link } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../types';
import { ArrowRight, Trash2 } from 'lucide-react';

// Per-workspace accent color (top line only)
const BARS = [
  'bg-gradient-to-r from-indigo-500 to-violet-600',
  'bg-gradient-to-r from-amber-500 to-orange-500',
  'bg-gradient-to-r from-emerald-500 to-teal-500',
  'bg-gradient-to-r from-sky-500 to-blue-600',
  'bg-gradient-to-r from-violet-500 to-purple-600',
  'bg-gradient-to-r from-rose-500 to-pink-600',
];

function barFor(title: string) {
  return BARS[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % BARS.length];
}

interface SectionCardProps {
  section: SectionWithProgress;
  onDelete: (id: string) => void;
  deadlines?: Deadline[];
}

export function SectionCard({ section, onDelete }: SectionCardProps) {
  const bar       = barFor(section.title);
  const remaining = section.total_items - section.completed_items;
  const done      = remaining === 0 && section.total_items > 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this workspace and all its contents?')) onDelete(section.id);
  };

  return (
    <div className="group relative bg-[#0d1420] border border-white/[0.07] hover:border-white/[0.14] rounded-2xl overflow-hidden flex flex-col transition-colors duration-150">

      {/* Accent line */}
      <div className={`h-[2px] ${bar} flex-shrink-0`} />

      <div className="p-5 flex flex-col flex-1 gap-3">

        {/* Title + count */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-100 text-sm leading-snug truncate">{section.title}</h3>
            <p className={`text-xs mt-0.5 ${done ? 'text-emerald-400' : section.total_items === 0 ? 'text-slate-700' : 'text-slate-600'}`}>
              {section.total_items === 0 ? 'No actions yet' : done ? 'All done' : `${remaining} remaining`}
            </p>
          </div>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-400 transition-all rounded flex-shrink-0 -mt-0.5"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Next action — the focal text */}
        <p className={`text-sm leading-snug truncate ${section.next_item_title ? 'text-slate-300' : 'text-slate-700 italic'}`}>
          {section.next_item_title ?? 'No actions yet'}
        </p>

        {/* Progress bar */}
        {section.total_items > 0 && (
          <div className="h-px bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : bar}`}
              style={{ width: `${section.progress}%` }}
            />
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-3 border-t border-white/[0.06]">
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between text-sm text-slate-600 hover:text-slate-200 transition-colors group/link"
          >
            Open workspace
            <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>

      </div>
    </div>
  );
}
