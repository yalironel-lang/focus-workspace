import { Link } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../types';
import { ArrowRight, Trash2 } from 'lucide-react';

// Accent color rotation
const ACCENTS = [
  { from: 'from-indigo-500',  to: 'to-violet-600',  bar: 'bg-gradient-to-r from-indigo-500 to-violet-600'  },
  { from: 'from-emerald-500', to: 'to-teal-600',    bar: 'bg-gradient-to-r from-emerald-500 to-teal-600'   },
  { from: 'from-amber-500',   to: 'to-orange-500',  bar: 'bg-gradient-to-r from-amber-500 to-orange-500'   },
  { from: 'from-blue-500',    to: 'to-indigo-600',  bar: 'bg-gradient-to-r from-blue-500 to-indigo-600'    },
  { from: 'from-violet-500',  to: 'to-purple-700',  bar: 'bg-gradient-to-r from-violet-500 to-purple-700'  },
  { from: 'from-rose-500',    to: 'to-pink-600',    bar: 'bg-gradient-to-r from-rose-500 to-pink-600'      },
];

function accentFor(title: string) {
  const idx = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length;
  return ACCENTS[idx];
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

  const progressColor = section.total_items === 0
    ? 'bg-[#1a2236]'
    : accent.bar;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this workspace and all its contents?')) {
      onDelete(section.id);
    }
  };

  return (
    <div className="group relative bg-[#0d1424] rounded-2xl border border-[#1a2236] hover:border-[#2a3a5c] transition-all duration-150 overflow-hidden flex flex-col">

      {/* Top accent line */}
      <div className={`h-0.5 ${accent.bar} flex-shrink-0`} />

      <div className="p-5 flex flex-col flex-1 gap-4">

        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${accent.from} ${accent.to} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-bold text-xs tracking-tight">
                {initials(section.title)}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-100 text-sm leading-snug truncate">
                {section.title}
              </h3>
              <p className={`text-xs mt-0.5 ${
                remaining === 0 && section.total_items > 0
                  ? 'text-emerald-400'
                  : 'text-slate-600'
              }`}>
                {section.total_items === 0
                  ? 'No actions yet'
                  : remaining === 0
                    ? 'All done'
                    : `${remaining} remaining`}
              </p>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-400 transition-all rounded flex-shrink-0"
            title="Delete workspace"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Next action */}
        {section.next_item_title && (
          <p className="text-sm text-slate-400 truncate leading-snug -mt-1">
            {section.next_item_title}
          </p>
        )}

        {/* Progress bar */}
        <div>
          <div className="h-0.5 bg-[#1a2236] rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} rounded-full transition-all duration-500`}
              style={{ width: `${section.progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-700 mt-1.5 tabular-nums">{section.progress}%</p>
        </div>

        {/* CTA */}
        <div className="mt-auto pt-1 border-t border-[#1a2236]">
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between w-full py-1.5 text-sm font-medium text-slate-500 hover:text-slate-200 transition-colors group/link"
          >
            Open workspace
            <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>

      </div>
    </div>
  );
}
