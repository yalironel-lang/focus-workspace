import { SectionWithProgress, Deadline } from '../types';
import { ActiveSession, sortSectionsByUrgency, daysUntil } from '../utils/sessionPlan';

interface StartSessionHeroProps {
  onStart: () => void;
  sections: SectionWithProgress[];
  deadlines: Deadline[];
  activeSession: ActiveSession | null;
}

export function StartSessionHero({ onStart, sections, deadlines, activeSession }: StartSessionHeroProps) {
  const urgentSection  = sortSectionsByUrgency(sections, deadlines)[0] ?? null;
  const overdueCount   = deadlines.filter(d => !d.completed && daysUntil(d.due_date) <= 0).length;
  const tasksReady     = urgentSection ? urgentSection.total_items - urgentSection.completed_items : 0;
  const estimatedMins  = Math.max(20, tasksReady * 20);
  const isResume       = !!activeSession;

  return (
    <section
      className="min-h-[60vh] rounded-2xl flex flex-col items-center justify-center text-center px-6 gap-3 mb-6"
      style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)' }}
    >
      {/* Urgency pill */}
      {overdueCount > 0 && (
        <span className="bg-rose-500/20 text-rose-300 text-xs font-bold px-3 py-1 rounded-full">
          {overdueCount} task{overdueCount !== 1 ? 's' : ''} overdue
        </span>
      )}

      {/* Title */}
      <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
        Start Study Session
      </h1>

      {/* Subtitle */}
      {urgentSection && (
        <p className="text-slate-400 text-sm">
          Focus on <span className="text-slate-300 font-semibold">{urgentSection.title}</span>
          {' · '}{tasksReady} task{tasksReady !== 1 ? 's' : ''} ready
        </p>
      )}

      {/* Primary button */}
      <button
        onClick={onStart}
        className="mt-6 bg-white text-slate-900 font-bold text-base px-10 py-4 rounded-2xl shadow-xl hover:bg-slate-100 active:scale-[0.97] transition-all"
      >
        {isResume ? 'Resume Session →' : 'Start Now'}
      </button>

      {/* Microcopy */}
      {urgentSection && tasksReady > 0 && (
        <p className="text-slate-600 text-xs">
          ~{estimatedMins} min · {tasksReady} action{tasksReady !== 1 ? 's' : ''} queued
        </p>
      )}
    </section>
  );
}
