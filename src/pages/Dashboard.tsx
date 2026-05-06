import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useSchedule } from '../hooks/useSchedule';
import { SectionCard } from '../components/SectionCard';
import { Layout } from '../components/Layout';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Item, Deadline, ScheduleBlock } from '../types';
import { Plus, Loader2, X, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── helpers ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function daysUntil(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(date + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

function deadlinePressure(d: Deadline): {
  label: string;
  labelColor: string;
  dotColor: string;
  sortWeight: number;
} {
  const days = daysUntil(d.due_date);
  if (days < 0)  return { label: 'Overdue',   labelColor: 'text-rose-400',  dotColor: 'bg-rose-500',  sortWeight: 0 };
  if (days === 0) return { label: 'Today',     labelColor: 'text-amber-400', dotColor: 'bg-amber-500', sortWeight: 1 };
  if (days === 1) return { label: 'Tomorrow',  labelColor: 'text-amber-400', dotColor: 'bg-amber-500', sortWeight: 2 };
  if (days <= 7)  return { label: `${days}d`,  labelColor: 'text-slate-500', dotColor: 'bg-slate-600', sortWeight: days };
  return               { label: `${days}d`,  labelColor: 'text-slate-600', dotColor: 'bg-slate-700', sortWeight: days };
}

// ─── component ───────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate    = useNavigate();
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines, addDeadline, deleteDeadline }          = useDeadlines();
  const { blocks }                                          = useSchedule();

  const [showNewSection,    setShowNewSection]    = useState(false);
  const [showSessionModal,  setShowSessionModal]  = useState(false);
  const [showAddDeadline,   setShowAddDeadline]   = useState(false);
  const [newTitle,  setNewTitle]  = useState('');
  const [creating,  setCreating]  = useState(false);

  // ── active session ──────────────────────────────────────────────────────
  const activeSession = loadSession();
  const { section: activeSection } = useSectionDetail(activeSession?.sectionId);
  const nextItem: Item | null = (activeSession && activeSection)
    ? activeSession.taskIds
        .map(id => activeSection.groups.flatMap(g => g.items).find(i => i.id === id))
        .find((i): i is Item => !!i) ?? null
    : null;

  // ── suggested workspace ─────────────────────────────────────────────────
  const suggestedSection = sortSectionsByUrgency(sections, deadlines)[0] ?? null;

  const hasWork = !loading && (
    sections.some(s => s.total_items - s.completed_items > 0) ||
    deadlines.some(d => !d.completed)
  );

  // ── pressure items ──────────────────────────────────────────────────────
  const todayDow = new Date().getDay();

  const pressureDeadlines = deadlines
    .filter(d => !d.completed && daysUntil(d.due_date) <= 7)
    .sort((a, b) => deadlinePressure(a).sortWeight - deadlinePressure(b).sortWeight)
    .slice(0, 4);

  const nextClass: ScheduleBlock | null = blocks
    .filter(b => b.day_of_week === todayDow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0] ?? null;

  const hasPressure = pressureDeadlines.length > 0 || nextClass;

  // ── form ────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createSection(newTitle.trim());
      toast.success('Workspace created');
      setNewTitle('');
      setShowNewSection(false);
    } catch {
      toast.error('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <Layout>

      {/* ── 1. HEADER ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-12">
        <div>
          <p className="text-xs text-slate-600 mb-2 tabular-nums">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight">{greeting()}</h1>
          {!loading && sections.length > 0 && (
            <p className="text-sm text-slate-600 mt-1.5">
              {sections.length} workspace{sections.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
          className="text-sm text-slate-500 hover:text-slate-200 border border-white/10 hover:border-white/20 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 flex-shrink-0 mt-1"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          New workspace
        </button>
      </div>

      {/* New workspace inline form */}
      {showNewSection && (
        <div className="bg-[#0d1420] border border-white/[0.08] rounded-2xl p-5 mb-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">New workspace</p>
            <button onClick={() => setShowNewSection(false)} className="text-slate-600 hover:text-slate-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex gap-2.5">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g. Calculus 101, Machine Learning, Biology…"
              className="flex-1 px-4 py-2.5 bg-[#080c14] border border-white/[0.08] rounded-xl text-sm text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-amber-500/40 transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-colors disabled:opacity-30 flex items-center gap-2 whitespace-nowrap"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </form>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 animate-spin text-slate-700" />
        </div>
      )}

      {!loading && (
        <>
          {/* ── 2. EXECUTION CARD ─────────────────────────────────────────── */}
          {activeSession ? (

            /* ─ Active session ─ */
            <div className="bg-[#0d1420] border border-white/[0.08] border-l-[3px] border-l-amber-500 rounded-2xl p-7 mb-10">
              <p className="text-xs text-amber-500/80 font-semibold uppercase tracking-widest mb-4">
                Session active
              </p>
              <p className="text-2xl font-bold text-white mb-1 leading-tight">
                {activeSession.sectionTitle}
              </p>
              {nextItem && (
                <p className="text-base text-slate-400 mb-7 leading-snug">
                  {nextItem.title}
                </p>
              )}
              <button
                onClick={() => navigate('/session')}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
              {activeSession.taskIds.length > 1 && (
                <p className="text-xs text-slate-700 text-center mt-3">
                  {activeSession.taskIds.length} actions queued
                </p>
              )}
            </div>

          ) : hasWork ? (

            /* ─ Work exists, no session ─ */
            <div className="bg-[#0d1420] border border-white/[0.08] rounded-2xl p-7 mb-10">
              <p className="text-xs text-slate-600 font-semibold uppercase tracking-widest mb-4">
                Ready
              </p>
              {suggestedSection && (
                <>
                  <p className="text-2xl font-bold text-white mb-1 leading-tight">
                    {suggestedSection.title}
                  </p>
                  {suggestedSection.next_item_title && (
                    <p className="text-base text-slate-400 mb-7 leading-snug">
                      {suggestedSection.next_item_title}
                    </p>
                  )}
                </>
              )}
              <button
                onClick={() => setShowSessionModal(true)}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Start Session
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          ) : (

            /* ─ Nothing ─ */
            <div className="border border-white/[0.05] rounded-2xl px-7 py-8 mb-10">
              <p className="text-base font-semibold text-slate-500 mb-1">Nothing scheduled.</p>
              <p className="text-sm text-slate-700">Create a workspace and add actions to get started.</p>
            </div>

          )}

          {/* ── 3. PRESSURE ───────────────────────────────────────────────── */}
          {hasPressure && (
            <div className="bg-[#0d1420] border border-white/[0.08] rounded-2xl overflow-hidden mb-10">

              {/* Minimal header */}
              <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06]">
                <span className="text-xs text-slate-600 font-medium uppercase tracking-widest">Pressure</span>
                <button
                  onClick={() => setShowAddDeadline(true)}
                  className="text-xs text-slate-600 hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                  Deadline
                </button>
              </div>

              <div className="divide-y divide-white/[0.04]">

                {/* Deadlines */}
                {pressureDeadlines.map(d => {
                  const { label, labelColor, dotColor } = deadlinePressure(d);
                  const course = sections.find(s => s.id === d.section_id)?.title;
                  return (
                    <div
                      key={d.id}
                      className="group flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-200 font-medium truncate block">{d.title}</span>
                        {course && <span className="text-xs text-slate-600">{course}</span>}
                      </div>
                      <span className={`text-xs font-semibold flex-shrink-0 ${labelColor}`}>{label}</span>
                      <button
                        onClick={() => deleteDeadline(d.id).catch(() => toast.error('Failed'))}
                        className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-rose-400 transition-all flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {/* Next class today */}
                {nextClass && (
                  <div className="flex items-center gap-4 px-6 py-3.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="text-sm text-slate-200 font-medium flex-1 truncate">{nextClass.title}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">{nextClass.start_time}</span>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── 4. WORKSPACES ─────────────────────────────────────────────── */}
          {sections.length === 0 && !showNewSection ? (
            <div className="text-center py-20 mb-10">
              <p className="text-sm text-slate-600 mb-5">No workspaces yet.</p>
              <button
                onClick={() => setShowNewSection(true)}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-5 py-2.5 rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Create your first workspace
              </button>
            </div>
          ) : sections.length > 0 && (
            <div className="mb-10">
              <p className="text-xs text-slate-600 uppercase tracking-widest font-medium mb-5">
                Workspaces
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sections.map(section => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    onDelete={deleteSection}
                    deadlines={deadlines.filter(d => d.section_id === section.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── 5. TOOLS ──────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs text-slate-700 uppercase tracking-widest font-medium mb-4">
              Tools
            </p>
            <MyPortals />
          </div>

        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}
      {showAddDeadline && (
        <AddDeadlineModal
          sections={sections}
          onClose={() => setShowAddDeadline(false)}
          onAdd={addDeadline}
        />
      )}

    </Layout>
  );
}
