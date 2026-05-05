import { Link } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../types';
import { ArrowRight, Calendar, Trash2 } from 'lucide-react';

function cardDaysUntil(d: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}
function cardFormatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface SectionCardProps {
  section: SectionWithProgress;
  onDelete: (id: string) => void;
  deadlines?: Deadline[];
}

// Accent color rotation — used for top strip and avatar gradient
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

export function SectionCard({ section, onDelete, deadlines = [] }: SectionCardProps) {
  const accent    = accentFor(section.title);
  const remaining = section.total_items - section.completed_items;
  const examDays  = section.exam_date ? cardDaysUntil(section.exam_date) : null;

  // Nearest upcoming deadline (≤7 days)
  const nearestDate = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  const nearestDays = nearestDate ? cardDaysUntil(nearestDate.due_date) : null;
  const showNearestDate = nearestDays !== null && nearestDays <= 7;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this workspace and all its contents?')) {
      onDelete(section.id);
    }
  };

  // Status badge — command center style
  const statusBadge = section.total_items > 0
    ? section.progress >= 70
      ? { label: 'STABLE',   cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' }
      : section.progress >= 30
        ? { label: 'BUILDING', cls: 'bg-amber-500/15   text-amber-400   border border-amber-500/25'   }
        : { label: 'AT RISK',  cls: 'bg-rose-500/15    text-rose-400    border border-rose-500/25'    }
    : null;

  // Progress bar color matches status
  const progressColor = section.total_items === 0
    ? 'bg-[#1a2236]'
    : section.progress >= 70
      ? accent.bar
      : section.progress >= 30
        ? 'bg-gradient-to-r from-amber-500 to-orange-500'
        : 'bg-gradient-to-r from-rose-500 to-rose-600';

  return (
    <div className="group relative bg-[#0d1424] rounded-2xl border border-[#1a2236] hover:border-[#2a3a5c] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-150 overflow-hidden flex flex-col">

      {/* Colored top accent line */}
      <div className={`h-0.5 ${accent.bar} flex-shrink-0`} />

      <div className="p-5 flex flex-col flex-1">

        {/* Header row */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accent.from} ${accent.to} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-bold text-[12px] tracking-tight">
                {initials(section.title)}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-100 text-[14px] leading-snug truncate max-w-[160px]">
                {section.title}
              </h3>
              <p className={`text-[11px] mt-0.5 font-medium ${
                remaining === 0 && section.total_items > 0
                  ? 'text-emerald-400'
                  : section.total_items === 0
                    ? 'text-slate-600'
                    : 'text-slate-500'
              }`}>
                {section.total_items === 0
                  ? 'No actions yet'
                  : remaining === 0
                    ? 'All done ✓'
                    : `${remaining} action${remaining !== 1 ? 's' : ''} remaining`}
              </p>
            </div>
          </div>

          {/* Status badge (top-right) + delete on hover */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {statusBadge && (
              <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            )}
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 transition-all rounded-lg"
              title="Delete workspace"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3.5">
          <div className="h-1 bg-[#1a2236] rounded-full overflow-hidden">
            <div
              className={`h-full ${progressColor} rounded-full transition-all duration-500`}
              style={{ width: `${section.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-slate-600 font-medium tabular-nums">
              {section.completed_items}/{section.total_items} done
            </span>
            <span className="text-[10px] text-slate-600 font-medium tabular-nums">
              {section.progress}%
            </span>
          </div>
        </div>

        {/* Nearest Important Date — from deadlines system */}
        {showNearestDate && nearestDate && nearestDays !== null && (
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded mb-2.5 w-fit border uppercase tracking-wide ${
            nearestDays < 0
              ? 'bg-[#1a2236] text-slate-500 border-[#1a2236]'
              : nearestDays < 3
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            <Calendar className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate max-w-[110px] normal-case font-semibold">{nearestDate.title}</span>
            <span className="flex-shrink-0 font-bold">
              {nearestDays < 0   ? '· OD'
              : nearestDays === 0 ? '· TODAY'
              : nearestDays === 1 ? '· TMR'
              :                    `· ${nearestDays}D`}
            </span>
          </div>
        )}

        {/* Exam date fallback */}
        {!showNearestDate && section.exam_date && examDays !== null && (
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded mb-2.5 w-fit border ${
            examDays <= 7
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              : examDays <= 14
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-[#1a2236] text-slate-600 border-[#1a2236]'
          }`}>
            <Calendar className="w-2.5 h-2.5 flex-shrink-0" />
            {cardFormatDate(section.exam_date)} · {examDays > 0 ? `${examDays}d` : examDays === 0 ? 'Today' : 'Past'}
          </div>
        )}

        {/* Next action */}
        {section.next_item_title && (
          <p className="text-[11px] truncate mb-3 leading-snug flex items-center gap-1.5">
            <span className="text-slate-700 flex-shrink-0">→</span>
            <span className="text-slate-500 font-medium">{section.next_item_title}</span>
          </p>
        )}

        {/* CTA */}
        <div className="mt-auto pt-3.5 border-t border-[#1a2236]">
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between w-full text-[13px] font-bold text-slate-400 hover:text-slate-100 transition-colors group/link"
          >
            <span>Open workspace</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover/link:text-slate-300 group-hover/link:translate-x-0.5 transition-all" />
          </Link>
        </div>

      </div>
    </div>
  );
}
