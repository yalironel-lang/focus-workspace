import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useAuth } from '../hooks/useAuth';
import { SectionCard } from '../components/SectionCard';
import { PressureRadar } from '../components/PressureRadar';
import { Layout } from '../components/Layout';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Item } from '../types';
import { Plus, Loader2, X, ArrowRight, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function firstName(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1).split(/[._-]/)[0];
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
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

  const displayName = user?.email ? firstName(user.email) : '';

  return (
    <Layout>
      <div style={{ minHeight: '100%' }}>

        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1a2638' }} />
          </div>
        )}

        {!loading && (
          <>

            {/* ── 1. GREETING HEADER ─────────────────────────────────────────── */}
            <div className="flex items-end justify-between mb-8">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-1.5"
                  style={{ color: '#334155' }}
                >
                  {formatDate()}
                </p>
                <h1
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: '#f1f5f9' }}
                >
                  {getGreeting()}{displayName ? `, ${displayName}` : ''}
                </h1>
                {sections.length > 0 && (
                  <p className="text-sm mt-1" style={{ color: '#475569' }}>
                    {sections.length} workspace{sections.length !== 1 ? 's' : ''}
                    {(() => {
                      const total = sections.reduce((a, s) => a + (s.total_items - s.completed_items), 0);
                      return total > 0 ? ` · ${total} item${total !== 1 ? 's' : ''} remaining` : ' · all caught up';
                    })()}
                  </p>
                )}
              </div>
            </div>

            {/* ── 2. EXECUTION CARD ──────────────────────────────────────────── */}
            <div
              className="rounded-2xl p-5 mb-6"
              style={{
                backgroundColor: '#0d1424',
                border: '1px solid #1a2638',
                borderLeft: activeSession ? '3px solid #f59e0b' : hasWork ? '3px solid #2a3a54' : undefined,
              }}
            >
              {activeSession ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: '#f59e0b' }}
                      >
                        Active session
                      </span>
                    </div>
                    <p className="font-bold text-base leading-snug truncate" style={{ color: '#f1f5f9' }}>
                      {activeSession.sectionTitle}
                    </p>
                    {nextItem && (
                      <p className="text-sm mt-0.5 truncate" style={{ color: '#64748b' }}>
                        {nextItem.title}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => navigate('/session')}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl flex-shrink-0 transition-all"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : hasWork ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: '#475569' }}
                      >
                        Ready to focus
                      </span>
                    </div>
                    {suggestedSection ? (
                      <>
                        <p className="font-bold text-base leading-snug truncate" style={{ color: '#f1f5f9' }}>
                          {suggestedSection.title}
                        </p>
                        {suggestedSection.next_item_title && (
                          <p className="text-sm mt-0.5 truncate" style={{ color: '#64748b' }}>
                            {suggestedSection.next_item_title}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm" style={{ color: '#64748b' }}>
                        You have items to work on.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowSessionModal(true)}
                    className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl flex-shrink-0 transition-all"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                  >
                    <PlayCircle className="w-4 h-4" /> Start session
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#111d2e' }}
                  >
                    <span className="text-base">✓</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#64748b' }}>All clear</p>
                    <p className="text-xs mt-0.5" style={{ color: '#2a3a50' }}>
                      No pending items or deadlines.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── 3. TODAY PANEL ─────────────────────────────────────────────── */}
            <PressureRadar sections={sections} />

            {/* ── 4. WORKSPACES ──────────────────────────────────────────────── */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
                    Workspaces
                  </h2>
                  {sections.length > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: '#334155' }}>
                      {sections.length} workspace{sections.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                  style={{ border: '1px solid #1a2638', color: '#475569' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#2a3a54';
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.backgroundColor = '#0f1826';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#1a2638';
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> New workspace
                </button>
              </div>

              {/* New workspace form */}
              {showNewSection && (
                <div
                  className="rounded-2xl p-4 mb-5"
                  style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#334155' }}
                  >
                    New workspace
                  </p>
                  <form onSubmit={handleCreate} className="flex gap-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g. Calculus II"
                      className="flex-1 px-3.5 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                      style={{
                        backgroundColor: '#070b14',
                        border: '1px solid #1a2638',
                        color: '#f1f5f9',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#1a2638')}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={creating || !newTitle.trim()}
                      className="px-4 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-30 flex items-center gap-1.5 whitespace-nowrap"
                      style={{ backgroundColor: '#f59e0b', color: '#000' }}
                      onMouseEnter={e => { if (!creating && newTitle.trim()) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                    >
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewSection(false)}
                      className="p-2.5 rounded-xl transition-colors"
                      style={{ color: '#334155' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {sections.length === 0 && !showNewSection ? (
                <div
                  className="rounded-2xl px-6 py-10 text-center"
                  style={{ border: '1px dashed #1a2638' }}
                >
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: '#0d1424' }}
                  >
                    <Plus className="w-5 h-5" style={{ color: '#334155' }} />
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#64748b' }}>
                    No workspaces yet
                  </p>
                  <p className="text-xs mb-5" style={{ color: '#2a3a50' }}>
                    Create a workspace for each course or project.
                  </p>
                  <button
                    onClick={() => setShowNewSection(true)}
                    className="inline-flex items-center gap-1.5 font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Create workspace
                  </button>
                </div>
              ) : sections.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

            {/* ── 5. TOOLS ───────────────────────────────────────────────────── */}
            <div className="mb-6">
              <div
                className="mb-5"
                style={{ borderTop: '1px solid #111d2e', paddingTop: '24px' }}
              >
                <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
                  Tools
                </h2>
                <p className="text-xs mt-0.5" style={{ color: '#334155' }}>
                  Quick-access links and portals
                </p>
              </div>
              <MyPortals />
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
