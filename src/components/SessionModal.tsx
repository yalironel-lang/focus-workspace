import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, ChevronRight, ArrowLeft, PlayCircle, Loader2,
  Clock, ExternalLink, AlertTriangle, Calendar, BookOpen,
} from 'lucide-react';
import { useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { SectionWithProgress, Deadline, CourseLink } from '../types';
import {
  pickTasks, pickPortals, sortSectionsByUrgency, urgencyHint,
  saveSession, TaskRec,
} from '../utils/sessionPlan';
import { TYPE_META } from './MyPortals';

// ── Priority badge ────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-rose-400',
  medium: 'bg-amber-400',
  low:    'bg-sky-300',
};

// ── Step 1: Course picker ─────────────────────────────────────────────────────

interface CoursePickerProps {
  sections: SectionWithProgress[];
  deadlines: Deadline[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  onClose: () => void;
}

function CoursePicker({ sections, deadlines, selectedId, onSelect, onContinue, onClose }: CoursePickerProps) {
  const sorted = sortSectionsByUrgency(sections, deadlines);

  return (
    <>
      {/* Modal header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">Start Study Session</h2>
          <p className="text-xs text-slate-400 mt-0.5">Which course are you working on?</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Course list */}
      <div className="px-4 py-3 space-y-1.5 overflow-y-auto max-h-[50vh]">
        {sorted.length === 0 && (
          <div className="text-center py-10">
            <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No courses yet.</p>
            <p className="text-xs text-slate-300 mt-1">Add a section from the dashboard first.</p>
          </div>
        )}
        {sorted.map(section => {
          const hint    = urgencyHint(section, deadlines);
          const isUrgent = hint && (hint.includes('today') || hint.includes('tomorrow') || hint.includes('Overdue'));
          const isSelected = selectedId === section.id;

          return (
            <button
              key={section.id}
              onClick={() => onSelect(section.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              {/* Selection indicator */}
              <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSelected ? 'border-white' : 'border-slate-300'
              }`}>
                {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>

              <span className={`flex-1 text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                {section.title}
              </span>

              {/* Urgency hint */}
              {hint && (
                <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : isUrgent
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-500'
                }`}>
                  {isUrgent && <AlertTriangle className="w-3 h-3" />}
                  {hint}
                </span>
              )}

              {isSelected && <ChevronRight className="w-4 h-4 text-white/70 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100">
        <button
          onClick={onContinue}
          disabled={!selectedId || sorted.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 active:scale-[0.98]"
        >
          Build my session plan
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

// ── Step 2: Session plan ──────────────────────────────────────────────────────

interface SessionPlanStepProps {
  section: SectionWithProgress;
  onBack: () => void;
  onBegin: (taskIds: string[], portalIds: string[]) => void;
  onClose: () => void;
}

function SessionPlanStep({ section, onBack, onBegin, onClose }: SessionPlanStepProps) {
  const { section: detail, loading } = useSectionDetail(section.id);
  const { links: courseLinks }       = usePortalLinks('course', section.id);
  const { links: globalLinks }       = usePortalLinks('global');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      </div>
    );
  }

  const tasks:   TaskRec[]     = detail ? pickTasks(detail.groups)              : [];
  const portals: CourseLink[]  = pickPortals(courseLinks, globalLinks);
  const estimatedMins          = Math.max(20, tasks.length * 20);

  const handleBegin = () => {
    onBegin(
      tasks.map(t => t.item.id),
      portals.map(p => p.id),
    );
  };

  return (
    <>
      {/* Modal header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-900 truncate max-w-[200px]">{section.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3 h-3" />~{estimatedMins} min
              </span>
              <span className="text-slate-200">·</span>
              <span className="text-xs text-slate-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-5 overflow-y-auto max-h-[55vh]">

        {/* Tasks */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">
            Tasks for this session
          </p>
          {tasks.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-3.5 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No pending tasks found</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Add tasks to the <span className="font-bold">To Do</span> list in this course first.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((rec, i) => (
                <div
                  key={rec.item.id}
                  className="flex items-center gap-3 px-3.5 py-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-slate-800 font-medium truncate">
                    {rec.item.title}
                  </span>
                  {rec.item.content && PRIORITY_DOT[rec.item.content] && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 flex-shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[rec.item.content]}`} />
                      {rec.item.content}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-300 flex-shrink-0">{rec.displayGroup}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Portals */}
        {portals.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">
              Open before you start
            </p>
            <div className="flex flex-wrap gap-2">
              {portals.map(p => {
                const meta = TYPE_META[p.type] ?? TYPE_META.custom;
                const href = p.url.startsWith('mailto:') ? p.url : p.url;
                return (
                  <a
                    key={p.id}
                    href={href}
                    target={p.url.startsWith('mailto:') ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:shadow-sm ${meta.badge}`}
                  >
                    {meta.icon}
                    {p.label}
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {portals.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            No portals saved for this course yet. Add them via Course Hub.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100">
        <button
          onClick={handleBegin}
          disabled={tasks.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-40 active:scale-[0.98] group"
        >
          <PlayCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
          Begin Session
        </button>
        {tasks.length === 0 && (
          <p className="text-center text-xs text-slate-400 mt-2">Add tasks to your To Do list first.</p>
        )}
      </div>
    </>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  sections: SectionWithProgress[];
  onClose: () => void;
}

export function SessionModal({ sections, onClose }: Props) {
  const navigate = useNavigate();
  const { deadlines } = useDeadlines(); // all deadlines, no section filter

  const [step,       setStep]       = useState<'pick' | 'plan'>('pick');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select most urgent course on open
  useEffect(() => {
    if (sections.length > 0 && !selectedId) {
      const sorted = sortSectionsByUrgency(sections, deadlines);
      setSelectedId(sorted[0]?.id ?? null);
    }
  }, [sections, deadlines]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSection = sections.find(s => s.id === selectedId) ?? null;

  const handleBegin = (taskIds: string[], portalIds: string[]) => {
    if (!selectedSection) return;
    saveSession({
      sectionId:    selectedSection.id,
      sectionTitle: selectedSection.title,
      taskIds,
      portalIds,
      startedAt: new Date().toISOString(),
    });
    onClose();
    navigate('/session');
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        {step === 'pick' && (
          <CoursePicker
            sections={sections}
            deadlines={deadlines}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onContinue={() => setStep('plan')}
            onClose={onClose}
          />
        )}
        {step === 'plan' && selectedSection && (
          <SessionPlanStep
            section={selectedSection}
            onBack={() => setStep('pick')}
            onBegin={handleBegin}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
