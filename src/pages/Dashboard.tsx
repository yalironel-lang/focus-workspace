import { useState } from 'react';
import { useSections } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { SectionCard } from '../components/SectionCard';
import { Layout } from '../components/Layout';
import { TodayPanel } from '../components/TodayPanel';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { StartSessionHero } from '../components/StartSessionHero';
import { loadSession } from '../utils/sessionPlan';
import { Plus, Loader2, Layers, X } from 'lucide-react';
import toast from 'react-hot-toast';

export function Dashboard() {
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
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
      {/* Hero — full visual focus */}
      <StartSessionHero
        onStart={() => setShowSessionModal(true)}
        sections={sections}
        deadlines={deadlines}
        activeSession={activeSession}
      />

      {/* Rest of dashboard — visually suppressed */}
      <div className="opacity-60 space-y-5">

        {/* New section button */}
        <div className="flex justify-end">
          <button
            onClick={() => { setShowNewSection(true); setNewTitle(''); }}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.98] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New section
          </button>
        </div>

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

      </div>{/* end opacity wrapper */}

      {/* Session modal — outside opacity wrapper */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}
    </Layout>
  );
}
