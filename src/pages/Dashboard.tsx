import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections } from '../hooks/useSections';
import { SectionCard } from '../components/SectionCard';
import { Layout } from '../components/Layout';
import { TodayPanel } from '../components/TodayPanel';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { loadSession } from '../utils/sessionPlan';
import { Plus, Loader2, Layers, X, PlayCircle, ArrowRight } from 'lucide-react';
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
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [newTitle,  setNewTitle]  = useState('');
  const [creating,  setCreating]  = useState(false);

  const activeSession = loadSession();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createSection(newTitle.trim());
      toast.success('Section created');
      setNewTitle('');
      setShowNewSection(false);
    } catch {
      toast.error('Failed to create section');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
            {formattedDate()}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {greeting()}
          </h1>
          {!loading && sections.length > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">
              {sections.length} course{sections.length !== 1 ? 's' : ''} in workspace
            </p>
          )}
        </div>

        <button
          onClick={() => { setShowNewSection(true); setNewTitle(''); }}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.97] flex-shrink-0 mt-1"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          New section
        </button>
      </div>

      {/* ── Resume session banner ────────────────────────────────────────── */}
      {activeSession && (
        <button
          onClick={() => navigate('/session')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-4 hover:bg-emerald-100 transition-colors group text-left"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <span className="text-sm font-semibold text-emerald-900 flex-1">
            Session in progress — {activeSession.sectionTitle}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 group-hover:text-emerald-800">
            Resume <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </button>
      )}

      {/* ── Compact Start Session card ───────────────────────────────────── */}
      {!loading && sections.length > 0 && (
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 mb-6 hover:shadow-md hover:-translate-y-px transition-all duration-150">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0">
            <PlayCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">Start Study Session</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Pick a course — get your 3 next actions
            </p>
          </div>
          <button
            onClick={() => setShowSessionModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0 active:scale-[0.97]"
          >
            {activeSession
              ? <><span>Resume</span><ArrowRight className="w-3.5 h-3.5" /></>
              : 'Start Now'}
          </button>
        </div>
      )}

      {/* ── New section inline form ──────────────────────────────────────── */}
      {showNewSection && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">New section</p>
            <button
              onClick={() => setShowNewSection(false)}
              className="p-1 text-slate-300 hover:text-slate-600 transition-colors rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex gap-2.5">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Calculus 101, Machine Learning, Biology…"
              className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-700 font-semibold text-sm transition-colors disabled:opacity-40 whitespace-nowrap flex items-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* ── Global portal hub ────────────────────────────────────────────── */}
      <MyPortals />

      {/* ── Today panel ──────────────────────────────────────────────────── */}
      {!loading && <TodayPanel sections={sections} />}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && sections.length === 0 && (
        <div className="text-center py-24 bg-white rounded-2xl border border-slate-200">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Layers className="w-8 h-8 text-primary-500" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">No sections yet</h3>
          <p className="text-slate-500 text-sm mb-7 max-w-sm mx-auto leading-relaxed">
            Create one section per subject. Each section comes with groups for slides, exercises, exams, notes, and useful links.
          </p>
          <button
            onClick={() => setShowNewSection(true)}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Create your first section
          </button>
        </div>
      )}

      {/* ── Sections grid ────────────────────────────────────────────────── */}
      {!loading && sections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map((section) => (
            <SectionCard key={section.id} section={section} onDelete={deleteSection} />
          ))}
        </div>
      )}

      {/* ── Session modal ────────────────────────────────────────────────── */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}

    </Layout>
  );
}
