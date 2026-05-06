import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { SectionCard } from '../components/SectionCard';
import { Layout } from '../components/Layout';
import { TodayPanel } from '../components/TodayPanel';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { loadSession } from '../utils/sessionPlan';
import { Item } from '../types';
import {
  Plus, Loader2, Layers, X, PlayCircle,
  ArrowRight, AlertTriangle, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

function daysUntilDeadline(d: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formattedDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export function Dashboard() {
  const navigate = useNavigate();
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [newTitle,  setNewTitle]  = useState('');
  const [creating,  setCreating]  = useState(false);

  const activeSession = loadSession();

  // Live task data for active session
  const { section: activeSection } = useSectionDetail(activeSession?.sectionId);
  const sessionItems: Item[] = (activeSession && activeSection)
    ? activeSession.taskIds
        .map(id => activeSection.groups.flatMap(g => g.items).find(i => i.id === id))
        .filter((i): i is Item => !!i)
        .slice(0, 3)
    : [];

  // Estimated session time
  const estimatedMins = activeSession
    ? Math.max(15, activeSession.taskIds.length * 15)
    : 0;

  // Urgency signals
  const pendingDeadlines   = deadlines.filter(d => !d.completed);
  const nextUrgentDeadline = [...pendingDeadlines]
    .filter(d => daysUntilDeadline(d.due_date) < 3)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  const urgentSec         = nextUrgentDeadline?.section_id
    ? sections.find(s => s.id === nextUrgentDeadline.section_id) : null;
  const urgentActionsLeft = urgentSec ? (urgentSec.total_items - urgentSec.completed_items) : 0;
  const urgentDays        = nextUrgentDeadline ? daysUntilDeadline(nextUrgentDeadline.due_date) : null;

  const urgencyLabel = nextUrgentDeadline
    ? urgentDays != null && urgentDays < 0 ? `${nextUrgentDeadline.title} is overdue`
    : urgentDays === 0   ? `${nextUrgentDeadline.title} due today`
    : urgentDays === 1   ? `${nextUrgentDeadline.title} due tomorrow`
    :                      `${nextUrgentDeadline.title} in ${urgentDays} days`
    : null;

  const hasWork = !loading && (
    sections.some(s => s.total_items - s.completed_items > 0) ||
    deadlines.some(d => !d.completed && daysUntilDeadline(d.due_date) <= 7)
  );

  const startEstimatedMins = urgentActionsLeft > 0
    ? Math.max(15, urgentActionsLeft * 15)
    : 0;

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

  return (
    <Layout>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-0.5">
            {formattedDate()}
          </p>
          <h1 className="text-xl font-bold text-slate-200 tracking-tight leading-none">
            {greeting()}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!loading && sections.length > 0 && (
            <span className="hidden sm:block text-[11px] text-slate-600 font-medium">
              {sections.length} workspace{sections.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
            className="flex items-center gap-1.5 border border-[#2a3a5c] bg-transparent hover:bg-[#1a2236] text-slate-400 hover:text-slate-100 px-3 py-1.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            New workspace
          </button>
        </div>
      </div>

      {/* ── New workspace form ───────────────────────────────────────────── */}
      {showNewSection && (
        <div className="bg-[#0d1424] rounded-xl border border-[#1a2236] p-4 mb-5 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em]">
              New workspace
            </p>
            <button
              onClick={() => setShowNewSection(false)}
              className="p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Calculus 101, Machine Learning, Biology…"
              className="flex-1 px-3.5 py-2.5 border border-[#1a2236] rounded-xl text-sm bg-[#070b14] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-bold text-sm transition-colors disabled:opacity-40 whitespace-nowrap flex items-center gap-2 active:scale-[0.97]"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* ── Primary Execution Card ───────────────────────────────────────── */}
      {!loading && (
        <>
          {activeSession ? (
            /* ═══════════════════════════════════════════════════════════════
               STATE 1 — Active session: prominent, full-width, full detail
            ═══════════════════════════════════════════════════════════════ */
            <div className="bg-[#0d1424] border border-[#1a2236] border-l-[3px] border-l-emerald-500 rounded-2xl mb-6 overflow-hidden">

              {/* Status + time estimate */}
              <div className="flex items-center justify-between px-5 pt-5 pb-0">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                    Session active
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                  <Clock className="w-3 h-3" />
                  ~{estimatedMins} min
                </div>
              </div>

              {/* Workspace + next action */}
              <div className="px-5 pt-3 pb-4">
                <p className="text-xl font-bold text-slate-100 leading-tight">
                  {activeSession.sectionTitle}
                </p>
                {sessionItems[0] && (
                  <p className="text-sm text-slate-400 mt-1.5 leading-snug">
                    Next up:{' '}
                    <span className="text-slate-200 font-semibold">{sessionItems[0].title}</span>
                  </p>
                )}
              </div>

              {/* Numbered action list */}
              {sessionItems.length > 0 && (
                <div className="px-5 pb-4 space-y-1.5">
                  {sessionItems.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 bg-[#070b14] border border-[#1a2236] rounded-xl px-3.5 py-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#1a2236] text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="text-sm text-slate-300 truncate font-medium">
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Full-width CTA */}
              <div className="px-5 pb-5">
                <button
                  onClick={() => navigate('/session')}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Continue Session
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          ) : hasWork ? (
            /* ═══════════════════════════════════════════════════════════════
               STATE 2 — Work exists: urgency-driven call to action
            ═══════════════════════════════════════════════════════════════ */
            <div className="bg-[#0d1424] border border-[#1a2236] rounded-2xl mb-6 overflow-hidden">

              {/* Urgency banner — only shown when deadline is near */}
              {urgencyLabel && (
                <div className="flex items-center gap-2.5 px-5 py-2.5 bg-rose-500/8 border-b border-rose-500/15">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-rose-300 truncate">
                    {urgencyLabel}
                    {urgentActionsLeft > 0 && (
                      <span className="text-rose-400/70">
                        {' '}· {urgentActionsLeft} action{urgentActionsLeft !== 1 ? 's' : ''} pending
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-[#1a2236] flex items-center justify-center flex-shrink-0">
                    <PlayCircle className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-100 leading-tight">
                      {urgentSec ? urgentSec.title : 'Ready to execute'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {urgentActionsLeft > 0
                        ? `${urgentActionsLeft} action${urgentActionsLeft !== 1 ? 's' : ''} to prepare`
                        : 'Pick a workspace — get your 3 next actions'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowSessionModal(true)}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <PlayCircle className="w-4 h-4" />
                  Start Session
                </button>

                {startEstimatedMins > 0 && (
                  <p className="text-center text-[11px] text-slate-600 mt-2.5">
                    ~{startEstimatedMins} min · {urgentActionsLeft} actions queued
                  </p>
                )}
              </div>
            </div>

          ) : (
            /* ═══════════════════════════════════════════════════════════════
               STATE 3 — Nothing ready: gentle prompt
            ═══════════════════════════════════════════════════════════════ */
            <div className="flex items-center gap-4 px-5 py-4 bg-[#0d1424] border border-[#1a2236] rounded-2xl mb-6">
              <div className="w-9 h-9 rounded-xl bg-[#1a2236] flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-400">Nothing scheduled</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {sections.length === 0
                    ? 'Create your first workspace to get started'
                    : 'Add actions or deadlines to build momentum'}
                </p>
              </div>
              <button
                onClick={() => { setShowNewSection(true); setNewTitle(''); }}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-[#2a3a5c] bg-transparent hover:bg-[#1a2236] text-slate-400 hover:text-slate-200 text-sm font-semibold rounded-xl transition-all active:scale-[0.97] flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                New workspace
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
        </div>
      )}

      {/* ── Today / Intelligence Panel ───────────────────────────────────── */}
      {!loading && <TodayPanel sections={sections} />}

      {/* ── Workspaces ───────────────────────────────────────────────────── */}
      {!loading && sections.length === 0 && !showNewSection && (
        <div className="text-center py-20 bg-[#0d1424] rounded-2xl border border-[#1a2236]">
          <div className="w-14 h-14 bg-[#1a2236] rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Layers className="w-7 h-7 text-slate-600" />
          </div>
          <h3 className="text-base font-bold text-slate-200 mb-2">No workspaces yet</h3>
          <p className="text-slate-500 text-sm mb-7 max-w-xs mx-auto leading-relaxed">
            Create one workspace per subject. Each comes with groups for slides, exercises, exams, notes, and links.
          </p>
          <button
            onClick={() => setShowNewSection(true)}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-5 py-2.5 rounded-xl transition-all active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Create your first workspace
          </button>
        </div>
      )}

      {!loading && sections.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em]">
              Workspaces
            </h2>
            <span className="text-[10px] text-slate-600 font-medium">
              {sections.length} total
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sections.map((section) => (
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

      {/* ── Tools ────────────────────────────────────────────────────────── */}
      {!loading && (
        <div>
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-4">
            Tools
          </h2>
          <MyPortals />
        </div>
      )}

      {/* ── Session modal ─────────────────────────────────────────────────── */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}

    </Layout>
  );
}
