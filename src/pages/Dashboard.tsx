import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { SectionCard } from '../components/SectionCard';
import { Layout } from '../components/Layout';
import { TodayPanel } from '../components/TodayPanel';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Item } from '../types';
import { Plus, Loader2, Layers, X, ArrowRight, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';

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

  // Resolve next action title for active session
  const { section: activeSection } = useSectionDetail(activeSession?.sectionId);
  const nextItem: Item | null = (activeSession && activeSection)
    ? activeSession.taskIds
        .map(id => activeSection.groups.flatMap(g => g.items).find(i => i.id === id))
        .find((i): i is Item => !!i) ?? null
    : null;

  const hasWork = !loading && (
    sections.some(s => s.total_items - s.completed_items > 0) ||
    deadlines.some(d => !d.completed)
  );

  // Best workspace to suggest when no session is active
  const suggestedSection = sortSectionsByUrgency(sections, deadlines)[0] ?? null;

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
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] text-slate-600 font-medium mb-0.5">{formattedDate()}</p>
          <h1 className="text-xl font-bold text-slate-200 tracking-tight leading-none">
            {greeting()}
          </h1>
        </div>
        <button
          onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
          className="flex items-center gap-1.5 border border-[#2a3a5c] hover:bg-[#1a2236] text-slate-400 hover:text-slate-100 px-3 py-1.5 rounded-xl font-semibold text-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          New workspace
        </button>
      </div>

      {/* ── New workspace form ───────────────────────────────────────────── */}
      {showNewSection && (
        <div className="bg-[#0d1424] rounded-xl border border-[#1a2236] p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em]">
              New workspace
            </p>
            <button
              onClick={() => setShowNewSection(false)}
              className="p-1 text-slate-600 hover:text-slate-300 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Calculus 101, Machine Learning…"
              className="flex-1 px-3.5 py-2.5 border border-[#1a2236] rounded-xl text-sm bg-[#070b14] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl font-bold text-sm transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* ── Execution Card ───────────────────────────────────────────────── */}
      {!loading && (
        <>
          {activeSession ? (
            /* Active session */
            <div className="bg-[#0d1424] border border-[#1a2236] border-l-[3px] border-l-emerald-500 rounded-2xl mb-8 p-5">
              <p className="text-base font-bold text-slate-100 mb-1">
                {activeSession.sectionTitle}
              </p>
              {nextItem && (
                <p className="text-sm text-slate-500 mb-5">
                  Next:{' '}
                  <span className="text-slate-300 font-medium">{nextItem.title}</span>
                </p>
              )}
              <button
                onClick={() => navigate('/session')}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          ) : hasWork ? (
            /* Work exists, no active session */
            <div className="bg-[#0d1424] border border-[#1a2236] rounded-2xl mb-8 p-5">
              {suggestedSection && (
                <p className="text-sm text-slate-500 mb-5">
                  Next:{' '}
                  <span className="text-slate-300 font-medium">{suggestedSection.title}</span>
                  {suggestedSection.next_item_title && (
                    <> · <span className="text-slate-400">{suggestedSection.next_item_title}</span></>
                  )}
                </p>
              )}
              <button
                onClick={() => setShowSessionModal(true)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-4 h-4" />
                Start Session
              </button>
            </div>

          ) : (
            /* Nothing ready */
            <div className="flex items-center gap-4 px-5 py-4 bg-[#0d1424] border border-[#1a2236] rounded-2xl mb-8">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-400">Nothing scheduled</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {sections.length === 0
                    ? 'Create a workspace to get started'
                    : 'Add actions or deadlines to build momentum'}
                </p>
              </div>
              <button
                onClick={() => { setShowNewSection(true); setNewTitle(''); }}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-[#2a3a5c] hover:bg-[#1a2236] text-slate-400 hover:text-slate-200 text-sm font-semibold rounded-xl transition-all flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                New workspace
              </button>
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
        </div>
      )}

      {/* ── Today Panel ──────────────────────────────────────────────────── */}
      {!loading && <TodayPanel sections={sections} />}

      {/* ── Workspaces ───────────────────────────────────────────────────── */}
      {!loading && sections.length === 0 && !showNewSection && (
        <div className="text-center py-20 bg-[#0d1424] rounded-2xl border border-[#1a2236] mb-8">
          <div className="w-12 h-12 bg-[#1a2236] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Layers className="w-6 h-6 text-slate-600" />
          </div>
          <h3 className="text-sm font-bold text-slate-300 mb-2">No workspaces yet</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
            Create one workspace per subject to track progress and actions.
          </p>
          <button
            onClick={() => setShowNewSection(true)}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-5 py-2.5 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Create your first workspace
          </button>
        </div>
      )}

      {!loading && sections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-4">
            Workspaces
          </h2>
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
        <div className="mb-4">
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.15em] mb-4">
            Tools
          </h2>
          <MyPortals />
        </div>
      )}

      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}

    </Layout>
  );
}
