import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { SectionCard } from '../components/SectionCard';
import { PressureRadar } from '../components/PressureRadar';
import { Layout } from '../components/Layout';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Item } from '../types';
import { Plus, Loader2, X, ArrowRight, PlayCircle, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

export function Dashboard() {
  const navigate = useNavigate();
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showTools,        setShowTools]        = useState(false);
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
      <div style={{ minHeight: '100%' }}>

        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#263043' }} />
          </div>
        )}

        {!loading && (
          <>
            {/* ── 1. EXECUTION STRIP ────────────────────────────────────────── */}
            <div
              className="rounded-xl px-5 py-3.5 mb-5 flex items-center justify-between gap-3"
              style={{
                backgroundColor: '#0d111a',
                border: '1px solid #263043',
                borderLeft: activeSession ? '2px solid #f59e0b' : undefined,
              }}
            >
              {activeSession ? (
                <>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0"
                      style={{ color: '#f59e0b' }}
                    >
                      Active
                    </span>
                    <span className="w-px h-3 flex-shrink-0" style={{ backgroundColor: '#263043' }} />
                    <span className="text-sm font-semibold truncate" style={{ color: '#f8fafc' }}>
                      {activeSession.sectionTitle}
                    </span>
                    {nextItem && (
                      <>
                        <span className="text-[10px] flex-shrink-0" style={{ color: '#374151' }}>·</span>
                        <span className="text-sm truncate" style={{ color: '#94a3b8' }}>
                          {nextItem.title}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => navigate('/session')}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg flex-shrink-0 transition-all"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                  >
                    Continue <ArrowRight className="w-3 h-3" />
                  </button>
                </>
              ) : hasWork ? (
                <>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0"
                      style={{ color: '#4b5563' }}
                    >
                      Ready
                    </span>
                    <span className="w-px h-3 flex-shrink-0" style={{ backgroundColor: '#263043' }} />
                    {suggestedSection && (
                      <>
                        <span className="text-sm font-semibold truncate" style={{ color: '#f8fafc' }}>
                          {suggestedSection.title}
                        </span>
                        {suggestedSection.next_item_title && (
                          <>
                            <span className="text-[10px] flex-shrink-0" style={{ color: '#374151' }}>·</span>
                            <span className="text-sm truncate" style={{ color: '#94a3b8' }}>
                              {suggestedSection.next_item_title}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setShowSessionModal(true)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg flex-shrink-0 transition-all"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                  >
                    <PlayCircle className="w-3 h-3" /> Start
                  </button>
                </>
              ) : (
                <span className="text-sm" style={{ color: '#374151' }}>— All clear —</span>
              )}
            </div>

            {/* ── 2. PRESSURE RADAR ─────────────────────────────────────────── */}
            <PressureRadar sections={sections} />

            {/* ── 3. WORKSPACES ─────────────────────────────────────────────── */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em]"
                      style={{ color: '#374151' }}>
                  Workspaces
                </span>
                <button
                  onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
                  className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all uppercase tracking-wider"
                  style={{ border: '1px solid #263043', color: '#4b5563' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#374151';
                    e.currentTarget.style.color = '#94a3b8';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#263043';
                    e.currentTarget.style.color = '#4b5563';
                  }}
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} /> New
                </button>
              </div>

              {/* New workspace form */}
              {showNewSection && (
                <div className="rounded-xl p-4 mb-4"
                     style={{ backgroundColor: '#0d111a', border: '1px solid #263043' }}>
                  <form onSubmit={handleCreate} className="flex gap-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="Workspace name…"
                      className="flex-1 px-3.5 py-2 rounded-xl text-sm transition-all focus:outline-none"
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
                      className="px-4 py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-30 flex items-center gap-1.5 whitespace-nowrap"
                      style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    >
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewSection(false)}
                      className="p-2 rounded-xl transition-colors"
                      style={{ color: '#374151' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {sections.length === 0 && !showNewSection ? (
                <div className="rounded-xl px-5 py-8 text-center"
                     style={{ border: '1px solid #1a2230' }}>
                  <p className="text-sm mb-4" style={{ color: '#374151' }}>No workspaces yet.</p>
                  <button
                    onClick={() => setShowNewSection(true)}
                    className="inline-flex items-center gap-1.5 font-bold text-sm px-4 py-2 rounded-xl transition-all"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Create workspace
                  </button>
                </div>
              ) : sections.length > 0 && (
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
              )}
            </div>

            {/* ── 4. TOOLS (COLLAPSIBLE) ────────────────────────────────────── */}
            <div className="mb-6">
              <button
                onClick={() => setShowTools(v => !v)}
                className="flex items-center gap-2 w-full text-left mb-3 group"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
                      style={{ color: showTools ? '#4b5563' : '#374151' }}>
                  Tools
                </span>
                {showTools
                  ? <ChevronDown className="w-3 h-3" style={{ color: '#374151' }} />
                  : <ChevronRight className="w-3 h-3" style={{ color: '#263043' }} />
                }
              </button>
              {showTools && <MyPortals />}
            </div>

          </>
        )}

      </div>

      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}
    </Layout>
  );
}
