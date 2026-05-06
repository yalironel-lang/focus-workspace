import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { SectionCard } from '../components/SectionCard';
import { TodayPanel } from '../components/TodayPanel';
import { Layout } from '../components/Layout';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { AddDeadlineModal } from '../components/AddDeadlineModal';
import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Item } from '../types';
import { Plus, Loader2, X, ArrowRight, PlayCircle } from 'lucide-react';
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
  }).toUpperCase();
}

export function Dashboard() {
  const navigate = useNavigate();
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines, addDeadline } = useDeadlines();
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showAddDeadline,  setShowAddDeadline]  = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const activeSession = loadSession();
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
      {/* Page gradient wrapper */}
      <div style={{
        background: 'radial-gradient(ellipse at top center, rgba(245,158,11,0.08) 0%, transparent 60%)',
        minHeight: '100%',
      }}>

        {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] mb-2"
               style={{ color: '#f59e0b' }}>
              {formattedDate()}
            </p>
            <h1 className="text-4xl font-bold text-white leading-tight">
              {greeting()}
            </h1>
            {!loading && sections.length > 0 && (
              <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>
                {sections.length} workspace{sections.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition-all flex-shrink-0 mt-1"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New workspace
          </button>
        </div>

        {/* New workspace form */}
        {showNewSection && (
          <div className="rounded-2xl p-5 mb-8"
               style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>
                New workspace
              </p>
              <button onClick={() => setShowNewSection(false)}
                      style={{ color: '#94a3b8' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex gap-2.5">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Calculus 101, Machine Learning…"
                className="flex-1 px-4 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                style={{
                  backgroundColor: '#05070b',
                  border: '1px solid #263043',
                  color: '#f8fafc',
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-30 flex items-center gap-2 whitespace-nowrap"
                style={{ backgroundColor: '#f59e0b', color: '#000' }}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
              </button>
            </form>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#263043' }} />
          </div>
        )}

        {!loading && (
          <>
            {/* ── 2. EXECUTION CARD ─────────────────────────────────────── */}
            {activeSession ? (

              <div className="rounded-2xl p-7 mb-8"
                   style={{
                     backgroundColor: '#0d111a',
                     border: '1px solid #263043',
                     borderLeft: '3px solid #f59e0b',
                     boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                   }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-4"
                   style={{ color: '#f59e0b' }}>
                  Session active
                </p>
                <p className="text-2xl font-bold text-white mb-1 leading-tight">
                  {activeSession.sectionTitle}
                </p>
                {nextItem && (
                  <p className="text-base mb-7" style={{ color: '#94a3b8' }}>
                    {nextItem.title}
                  </p>
                )}
                <button
                  onClick={() => navigate('/session')}
                  className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
                {activeSession.taskIds.length > 1 && (
                  <p className="text-xs text-center mt-3" style={{ color: '#374151' }}>
                    {activeSession.taskIds.length} actions queued
                  </p>
                )}
              </div>

            ) : hasWork ? (

              <div className="rounded-2xl p-7 mb-8"
                   style={{
                     backgroundColor: '#0d111a',
                     border: '1px solid #263043',
                     boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
                   }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-4"
                   style={{ color: '#94a3b8' }}>
                  Ready
                </p>
                {suggestedSection && (
                  <>
                    <p className="text-2xl font-bold text-white mb-1 leading-tight">
                      {suggestedSection.title}
                    </p>
                    {suggestedSection.next_item_title && (
                      <p className="text-base mb-7" style={{ color: '#94a3b8' }}>
                        {suggestedSection.next_item_title}
                      </p>
                    )}
                  </>
                )}
                <button
                  onClick={() => setShowSessionModal(true)}
                  className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                >
                  <PlayCircle className="w-4 h-4" /> Start Session
                </button>
              </div>

            ) : (

              <div className="rounded-2xl px-7 py-6 mb-8"
                   style={{ border: '1px solid #1a2230' }}>
                <p className="font-semibold text-white mb-1">Nothing scheduled.</p>
                <p className="text-sm" style={{ color: '#4b5563' }}>
                  {sections.length === 0
                    ? 'Create a workspace to get started.'
                    : 'Add actions or deadlines to build momentum.'}
                </p>
              </div>

            )}

            {/* ── 3. TODAY / PRESSURE ───────────────────────────────────── */}
            <TodayPanel sections={sections} />

            {/* ── 4. WORKSPACES ─────────────────────────────────────────── */}
            {sections.length === 0 && !showNewSection ? (
              <div className="text-center py-20 mb-10">
                <p className="text-sm mb-5" style={{ color: '#4b5563' }}>No workspaces yet.</p>
                <button
                  onClick={() => setShowNewSection(true)}
                  className="inline-flex items-center gap-2 font-bold text-sm px-5 py-2.5 rounded-xl transition-all"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Create your first workspace
                </button>
              </div>
            ) : sections.length > 0 && (
              <div className="mb-10">
                <p className="text-xs font-bold uppercase tracking-widest mb-5"
                   style={{ color: '#374151' }}>
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

            {/* ── 5. TOOLS ──────────────────────────────────────────────── */}
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-widest mb-5"
                 style={{ color: '#374151' }}>
                Tools
              </p>
              <MyPortals />
            </div>

          </>
        )}

      </div>

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
