import { Link } from 'react-router-dom';
import { SectionWithProgress } from '../types';
import { AlertTriangle, ArrowRight, Trash2, CheckSquare, Calendar } from 'lucide-react';

function cardDaysUntil(d: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}
function cardFormatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function cardReadiness(pct: number): { label: string; cls: string } {
  if (pct >= 70) return { label: 'On track', cls: 'bg-emerald-100 text-emerald-800 font-semibold' };
  if (pct >= 30) return { label: 'Building',  cls: 'bg-amber-100  text-amber-800  font-semibold' };
  return               { label: 'At risk',   cls: 'bg-rose-100   text-rose-800   font-bold'     };
}

interface SectionCardProps {
  section: SectionWithProgress;
  onDelete: (id: string) => void;
}

const ACCENTS = [
  { from: 'from-indigo-500',  to: 'to-violet-600',  },
  { from: 'from-slate-600',   to: 'to-slate-800',   },
  { from: 'from-emerald-500', to: 'to-teal-600',    },
  { from: 'from-amber-500',   to: 'to-orange-500',  },
  { from: 'from-blue-600',    to: 'to-indigo-600',  },
  { from: 'from-violet-500',  to: 'to-purple-700',  },
];

function accentFor(title: string) {
  const idx = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length;
  return ACCENTS[idx];
}

function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function displayGroupName(name: string): string {
  return name === 'Exercises' ? 'To Do' : name;
}

export function SectionCard({ section, onDelete }: SectionCardProps) {
  const accent    = accentFor(section.title);
  const remaining = section.total_items - section.completed_items;
  const readiness = section.total_items > 0 ? cardReadiness(section.progress) : null;
  const examDays  = section.exam_date ? cardDaysUntil(section.exam_date) : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this section and all its contents?')) {
      onDelete(section.id);
    }
  };

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 overflow-hidden flex flex-col">
      {/* Gradient top strip */}
      <div className={`h-1 bg-gradient-to-r ${accent.from} ${accent.to} flex-shrink-0`} />

      <div className="p-5 flex flex-col flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${accent.from} ${accent.to} flex items-center justify-center shadow-sm flex-shrink-0`}>
              <span className="text-white font-bold text-sm tracking-tight">{initials(section.title)}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm leading-snug truncate max-w-[180px]">
                {section.title}
              </h3>
              <p className={`text-xs mt-0.5 font-medium ${
                remaining === 0 && section.total_items > 0
                  ? 'text-emerald-600'
                  : 'text-slate-500'
              }`}>
                {section.total_items === 0
                  ? 'No items yet'
                  : remaining === 0
                    ? 'All done ✓'
                    : `${remaining} item${remaining !== 1 ? 's' : ''} remaining`}
              </p>
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg flex-shrink-0 ml-2"
            title="Delete section"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${accent.from} ${accent.to} rounded-full transition-all duration-500`}
              style={{ width: `${section.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
              <CheckSquare className="w-3 h-3" />
              <span>{section.completed_items}/{section.total_items}</span>
            </div>
            {readiness && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${readiness.cls}`}>
                {readiness.label}
              </span>
            )}
          </div>
        </div>

        {/* Exam countdown */}
        {section.exam_date && examDays !== null && (
          <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 w-fit ${
            examDays <= 7  ? 'bg-rose-100 text-rose-700'
            : examDays <= 14 ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600'
          }`}>
            <Calendar className="w-3 h-3 flex-shrink-0" />
            {cardFormatDate(section.exam_date)} · {examDays > 0 ? `${examDays}d left` : examDays === 0 ? 'Today!' : 'Past'}
          </div>
        )}

        {/* Missing groups warning */}
        {section.missing_groups.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg mb-2 w-fit">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span>Missing: {section.missing_groups.map(displayGroupName).join(', ')}</span>
          </div>
        )}

        {/* Next item preview */}
        {section.next_item_title && (
          <p className="text-[11px] truncate mb-2 leading-snug flex items-center gap-1">
            <span className="text-slate-400 font-semibold flex-shrink-0">→</span>
            <span className="text-slate-600 font-medium">{section.next_item_title}</span>
          </p>
        )}

        {/* CTA */}
        <div className="mt-auto pt-3 border-t border-slate-100">
          <Link
            to={`/section/${section.id}`}
            className="flex items-center justify-between w-full text-sm font-bold text-slate-900 hover:text-primary-600 transition-colors group/link"
          >
            <span>Open section</span>
            <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
