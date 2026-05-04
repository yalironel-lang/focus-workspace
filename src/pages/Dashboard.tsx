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
  const [showNewSection,  setShowNewSection]  = useState(false);
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
      {/* Resume session banner */}
      {activeSession && (
        <button
          onClick={() => navigate('/session')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl mb-5 hover:bg-emerald-100 transition-colors group"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-sm font-semibold text-emerald-800 flex-1 text-left">
            Session in progress — {activeSession.sectionTitle}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 group-hover:text-emerald-700">
            Resume <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </button>
      )}

      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-xs font-semibold px-3 py-1 rounded-full mb-3">
            <span>{formattedDate()}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{greeting()} 👋</h1>
          <p className="text-slate-500 text-sm mt-1.5">
            {loading
              ? 'Loading your workspace…'
              : sections.length === 0
                ? 'Add your first subject to get started.'
                : `${sections.length} subject${sections.length !== 1 ? 's' : ''} in your workspace`}
          </p>
        </div>

        <button
          onClick={() => { setShowNewSection(true); setNewTitle(''); }}
          className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.98] self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          New section
        </button>
      </div>

      {/* ── START STUDY SESSION CTA ────────────────────────────────────── */}
      {!loading && sections.length > 0 && (
        <button
          onClick={() => setShowSessionModal(true)}
          className="w-full group relative flex items-center gap-4 px-6 py-5 mb-6 rounded-2xl overflow-hidden transition-all active:scale-[0.99] hover:shadow-lg"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%)' }}
        >
          {/* Subtle grid texture */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

          <div className="relative flex-shrink-0 w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
            <PlayCircle className="w-6 h-6 text-white" />
          </div>

          <div className="relative flex-1 text-left">
            <p className="text-base font-bold text-white leading-tight">Start Study Session</p>
            <p className="text-xs text-slate-400 mt-0.5">Pick a course → get your 3 next actions</p>
          </div>

          <ArrowRight className="relative w-5 h-5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </button>
      )}

      {/* New section form */}
      {showNewSection && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-5 mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New section</p>
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
              className="px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold text-sm transition-colors disabled:opacity-40 whitespace-nowrap flex items-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* Global portal hub */}
      <MyPortals />

      {/* Today panel */}
      {!loading && <TodayPanel sections={sections} />}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      )}

      {/* Empty state */}
      {!loading && sections.length === 0 && (
        <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Layers className="w-8 h-8 text-primary-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-2">No sections yet</h3>
          <p className="text-slate-400 text-sm mb-7 max-w-sm mx-auto leading-relaxed">
            Create one section per subject. Each section comes with groups for slides, exercises, exams, notes, and useful links.
          </p>
          <button
            onClick={() => setShowNewSection(true)}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Create your first section
          </button>
        </div>
      )}

      {/* Sections grid */}
      {!loading && sections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map((section) => (
            <SectionCard key={section.id} section={section} onDelete={deleteSection} />
          ))}
        </div>
      )}

      {/* Session modal */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}
    </Layout>
  );
}
