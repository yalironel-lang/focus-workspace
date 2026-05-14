import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, ChevronRight, ArrowLeft, PlayCircle, Loader2,
  Clock, ExternalLink, AlertTriangle, Calendar, BookOpen,
} from 'lucide-react';
import { useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { usePortalLinks } from '../hooks/usePortalLinks';
import { nearestDeadline, deadlineUrgencyLabel, deadlineLevel, daysUntil } from '../utils/sessionPlan';
import { SectionWithProgress, Deadline, CourseLink } from '../types';
import {
  pickTasks, pickPortals, sortSectionsByUrgency, urgencyHint,
  saveSession, TaskRec,
} from '../utils/sessionPlan';
import { TYPE_META } from './MyPortals';

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-rose-400',
  medium: 'bg-amber-400',
  low:    'bg-sky-400',
};

// ── Course picker ─────────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2a3a]">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Start Session</h2>
          <p className="text-xs text-slate-500 mt-0.5">Which workspace are you working on?</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-600 hover:text-slate-300 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-1.5 overflow-y-auto max-h-[50vh]">
        {sorted.length === 0 && (
          <div className="text-center py-10">
            <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No workspaces yet.</p>
          </div>
        )}
        {sorted.map(section => {
          const hint     = urgencyHint(section, deadlines);
          const isUrgent = hint && (hint.includes('today') || hint.includes('tomorrow') || hint.includes('Overdue'));
          const isSelected = selectedId === section.id;

          return (
            <button
              key={section.id}
              onClick={() => onSelect(section.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-[#080c14] border-[#1e2a3a] hover:border-[#2a3a4e]'
              }`}
            >
              <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSelected ? 'border-amber-400' : 'border-slate-600'
              }`}>
                {isSelected && <span className="w-2 h-2 rounded-full bg-amber-400" />}
              </span>

              <span className={`flex-1 text-sm font-medium truncate ${isSelected ? 'text-amber-100' : 'text-slate-300'}`}>
                {section.title}
              </span>

              {hint && (
                <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-300'
                    : isUrgent
                      ? 'bg-rose-500/15 text-rose-400'
                      : 'bg-[#1e2a3a] text-slate-500'
                }`}>
                  {isUrgent && <AlertTriangle className="w-3 h-3" />}
                  {hint}
                </span>
              )}

              {isSelected && <ChevronRight className="w-4 h-4 text-amber-400/70 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-[#1e2a3a]">
        <button
          onClick={onContinue}
          disabled={!selectedId || sorted.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all disabled:opacity-30"
        >
          Build session plan
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

// ── Session plan step ─────────────────────────────────────────────────────────

interface SessionPlanStepProps {
  section: SectionWithProgress;
  onBack: () => void;
  onBegin: (taskIds: string[], portalIds: string[]) => void;
  onClose: () => void;
}

function SessionPlanStep({ section, onBack, onBegin, onClose }: SessionPlanStepProps) {
  const { section: detail, loading } = useSectionDetail(section.id);
  const { deadlines: sectionDates }  = useDeadlines(section.id);
  const { links: courseLinks }       = usePortalLinks('course', section.id);
  const { links: globalLinks }       = usePortalLinks('global');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
      </div>
    );
  }

  const tasks:   TaskRec[]    = detail ? pickTasks(detail.groups, 3, sectionDates, section.id) : [];
  const portals: CourseLink[] = pickPortals(courseLinks, globalLinks);
  const estimatedMins         = Math.max(20, tasks.length * 20);

  const urgentDate  = nearestDeadline(section.id, sectionDates);
  const urgentDays  = urgentDate ? daysUntil(urgentDate.due_date) : null;
  const urgentLevel = urgentDays != null ? deadlineLevel(urgentDays) : null;
  const urgentLabel = urgentDays != null ? deadlineUrgencyLabel(urgentDays) : null;
  const showBadge   = urgentDate && urgentLevel && urgentLevel !== 'far';

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2a3a]">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="p-1.5 text-slate-600 hover:text-slate-300 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-slate-100 truncate max-w-[200px]">{section.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3 h-3" />~{estimatedMins} min
              </span>
              <span className="text-slate-700">·</span>
              <span className="text-xs text-slate-500">{tasks.length} action{tasks.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-600 hover:text-slate-300 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-5 overflow-y-auto max-h-[55vh]">

        {showBadge && urgentDate && urgentLabel && (
          <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border ${
            urgentLevel === 'overdue' || urgentLevel === 'urgent'
              ? 'bg-rose-500/10 border-rose-500/20'
              : 'bg-amber-500/10 border-amber-500/20'
          }`}>
            <Calendar className={`w-3.5 h-3.5 flex-shrink-0 ${
              urgentLevel === 'overdue' || urgentLevel === 'urgent' ? 'text-rose-400' : 'text-amber-400'
            }`} />
            <div className="min-w-0">
              <p className={`text-xs font-bold truncate ${
                urgentLevel === 'overdue' || urgentLevel === 'urgent' ? 'text-rose-300' : 'text-amber-300'
              }`}>
                Preparing for: {urgentDate.title}
              </p>
              <p className={`text-[11px] mt-0.5 ${
                urgentLevel === 'overdue' || urgentLevel === 'urgent' ? 'text-rose-400/70' : 'text-amber-400/70'
              }`}>
                {urgentLabel} · {tasks.length} action{tasks.length !== 1 ? 's' : ''} queued
              </p>
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2.5">
            Actions
          </p>
          {tasks.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">No pending actions</p>
                <p className="text-xs text-amber-400/70 mt-0.5">Add actions to the To Do list in this workspace first.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((rec, i) => (
                <div key={rec.item.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-[#080c14] border border-[#1e2a3a] rounded-xl">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1e2a3a] text-slate-500 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-slate-200 font-medium truncate">{rec.item.title}</span>
                  {rec.item.content && PRIORITY_DOT[rec.item.content] && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 flex-shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[rec.item.content]}`} />
                      {rec.item.content}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {portals.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2.5">
              Open before you start
            </p>
            <div className="flex flex-wrap gap-2">
              {portals.map(p => {
                const meta = TYPE_META[p.type] ?? TYPE_META.custom;
                return (
                  <a
                    key={p.id}
                    href={p.url}
                    target={p.url.startsWith('mailto:') ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${meta.badge}`}
                  >
                    {meta.icon}
                    {p.label}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

      </div>

      <div className="px-6 py-4 border-t border-[#1e2a3a]">
        <button
          onClick={() => onBegin(tasks.map(t => t.item.id), portals.map(p => p.id))}
          disabled={tasks.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all disabled:opacity-30"
        >
          <PlayCircle className="w-4 h-4" />
          Begin Session
        </button>
        {tasks.length === 0 && (
          <p className="text-center text-xs text-slate-600 mt-2">Add actions to your To Do list first.</p>
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
  const { deadlines } = useDeadlines();

  const [step,       setStep]       = useState<'pick' | 'plan'>('pick');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length > 0 && !selectedId) {
      const sorted = sortSectionsByUrgency(sections, deadlines);
      setSelectedId(sorted[0]?.id ?? null);
    }
  }, [sections, deadlines]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

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
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0f1520] border border-[#1e2a3a] rounded-2xl w-full max-w-md overflow-hidden animate-slide-up">
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
