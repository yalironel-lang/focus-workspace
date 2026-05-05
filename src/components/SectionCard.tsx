import { Link } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../types';
import { ArrowRight, Calendar, CheckSquare, Trash2 } from 'lucide-react';

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

const ACCENTS = [
  { from: 'from-indigo-500',  to: 'to-violet-600'  },
  { from: 'from-slate-600',   to: 'to-slate-800'   },
  { from: 'from-emerald-500', to: 'to-teal-600'    },
  { from: 'from-amber-500',   to: 'to-orange-500'  },
  { from: 'from-blue-600',    to: 'to-indigo-600'  },
  { from: 'from-violet-500',  to: 'to-purple-700'  },
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

  // Nearest upcoming Important Date from the deadlines system
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

  // Readiness badge — only show when meaningful
  const readinessBadge = section.total_items > 0
    ? section.progress >= 70
      ? { label: 'On track', cls: 'text-emerald-700 bg-emerald-50' }
      : section.progress >= 30
        ? { label: 'Building',  cls: 'text-amber-700  bg-amber-50'  }
        : { label: 'At risk',   cls: 'text-rose-700   bg-rose-50'   }
    : null;

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 overflow-hidden flex flex-col">
      {/* Gradient top accent line */}
      <div className={`h-0.5 bg-gradient-to-r ${accent.from} ${accent.to} flex-shrink-0`} />

      <div className="p-5 flex flex-col flex-1">

        {/* Header row */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accent.from} ${accent.to} flex items-center justify-center shadow-sm flex-shrink-0`}>
              <span className="text-white font-bold text-[12px] tracking-tight">
                {initials(section.title)}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-[14px] leading-snug truncate max-w-[180px]">
                {section.title}
              </h3>
              <p className={`text-[12px] mt-0.5 font-medium ${
                remaining === 0 && section.total_items > 0
                  ? 'text-emerald-600'
                  : 'text-slate-400'
              }`}>
                {section.total_items === 0
                  ? 'No actions yet'
                  : remaining === 0
                    ? 'All done ✓'
                    : `${remaining} action${remaining !== 1 ? 's' : ''} remaining`}
              </p>
            </div>
          </div>

          {/* Delete (appears on hover) */}
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg flex-shrink-0"
            title="Delete workspace"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-3.5">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${accent.from} ${accent.to} rounded-full transition-all duration-500`}
              style={{ width: `${section.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
              <CheckSquare className="w-3 h-3" />
              <span>{section.completed_items}/{section.total_items}</span>
            </div>
            {readinessBadge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${readinessBadge.cls}`}>
                {readinessBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Nearest Important Date — dates system takes priority over exam_date */}
        {showNearestDate && nearestDate && nearestDays !== null && (
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2.5 w-fit border ${
            nearestDays < 0
              ? 'bg-slate-50  text-slate-500 border-slate-200'
              : nearestDays < 3
                ? 'bg-rose-50   text-rose-600  border-rose-200'
                : 'bg-amber-50  text-amber-700 border-amber-200'
          }`}>
            <Calendar className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate max-w-[110px]">{nearestDate.title}</span>
            <span className="flex-shrink-0">
              {nearestDays < 0   ? ' · Overdue'
              : nearestDays === 0 ? ' · Today'
              : nearestDays === 1 ? ' · Tomorrow'
              :                    ` · ${nearestDays}d`}
            </span>
          </div>
        )}

        {/* Exam date fallback — only when no nearer deadline */}
        {!showNearestDate && section.exam_date && examDays !== null && (
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2.5 w-fit border ${
            examDays <= 7
              ? 'bg-rose-50  text-rose-600  border-rose-200'
              : examDays <= 14
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            <Calendar className="w-2.5 h-2.5 flex-shrink-0" />
            {cardFormatDate(section.exam_date)} · {examDays > 0 ? `${examDays}d` : examDays === 0 ? 'Today' : 'Past'}
          </div>
        )}

        {/* Next action preview */}
        {section.next_item_title && (
          <p className="text-[11px] truncate mb-3 leading-snug flex items-center gap-1.5">
            <span className="text-slate-300 flex-shrink-0">→</span>
            <span className="text-slate-600 font-medium">{section.next_item_title}</span>
          </p>
        )}

        {/* CTA */}
        <div className="mt-auto pt-3.5 border-t border-gray-100">
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between w-full text-[13px] font-bold text-slate-800 hover:text-slate-900 transition-colors group/link"
          >
            <span>Open workspace</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>

      </div>
    </div>
  );
}
