import { useState } from 'react';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useAuth } from '../hooks/useAuth';
import { SectionCard } from '../components/SectionCard';
import { PressureRadar } from '../components/PressureRadar';
import { Layout } from '../components/Layout';
import { MyPortals } from '../components/MyPortals';
import { SessionModal } from '../components/SessionModal';
import { MomentumMeter } from '../components/workspace/MomentumMeter';
import { CapturePanel } from '../components/workspace/CapturePanel';
import { FocusQueue } from '../components/workspace/FocusQueue';
import { FocusMode } from '../components/workspace/FocusMode';
import { ExecutePanel } from '../components/workspace/ExecutePanel';
import { PhaseIndicator, inferPhase } from '../components/workspace/AdaptiveWorkspace';
import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Plus, Loader2, X } from 'lucide-react';
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

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function Dashboard() {
  const { user } = useAuth();
  const { sections, loading, createSection, deleteSection } = useSections();
  const { deadlines, addDeadline } = useDeadlines();
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [newTitle,         setNewTitle]         = useState('');
  const [creating,         setCreating]         = useState(false);

  const activeSession = loadSession();
  // useSectionDetail called for side-effects (preloads section data for SessionModal)
  useSectionDetail(activeSession?.sectionId);

  const hasWork = !loading && (
    sections.some(s => s.total_items - s.completed_items > 0) ||
    deadlines.some(d => !d.completed)
  );

  const suggestedSection = sortSectionsByUrgency(sections, deadlines)[0] ?? null;

  const displayName = user?.email ? firstName(user.email) : '';

  const activePhase = inferPhase({
    hasSession: !!activeSession,
    hasWork,
    hasCaptured: deadlines.length > 0 || sections.length > 0,
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCapture = async (text: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const due_date = tomorrow.toISOString().split('T')[0];
    try {
      await addDeadline({
        section_id: null,
        title: text,
        type: 'custom',
        due_date,
        notes: null,
      });
      toast.success('Captured!', {
        icon: '⚡',
        style: { background: '#0d1424', border: '1px solid #1a2638', color: '#e2e8f0' },
      });
    } catch {
      toast.error('Failed to capture');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createSection(newTitle.trim());
      toast.success('Workspace created', {
        style: { background: '#0d1424', border: '1px solid #1a2638', color: '#e2e8f0' },
      });
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
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#1a2638' }} />
        </div>
      ) : (
        <div style={{ minHeight: '100%' }}>

          {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
          <div className="mb-7">
            <p style={{ ...META, fontSize: '10px', color: '#1e2d40', marginBottom: '4px' }}>
              {formatDate()}
            </p>
            <div className="flex items-end justify-between gap-4 mb-4">
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{ color: '#f1f5f9' }}
              >
                {getGreeting()}{displayName ? `, ${displayName}` : ''}
              </h1>
              {sections.length > 0 && (
                <p className="text-xs pb-0.5 flex-shrink-0" style={{ color: '#2a3a50' }}>
                  {sections.reduce((a, s) => a + (s.total_items - s.completed_items), 0)} items remaining
                </p>
              )}
            </div>

            {/* Phase indicator */}
            <PhaseIndicator activePhase={activePhase} />
          </div>

          {/* ── 2. BENTO ROW: Capture + Momentum ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
            {/* Left: Capture panel (wider) */}
            <div className="lg:col-span-7">
              <CapturePanel onCapture={handleCapture} />
            </div>
            {/* Right: Momentum meter */}
            <div className="lg:col-span-5">
              <MomentumMeter sections={sections} />
            </div>
          </div>

          {/* ── 3. FOCUS MODE + EXECUTE (side by side on xl) ────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <FocusMode
              activeSession={activeSession}
              suggestedSection={suggestedSection}
              onStartSession={() => setShowSessionModal(true)}
            />
            <ExecutePanel sections={sections} />
          </div>

          {/* ── 4. FOCUS QUEUE ──────────────────────────────────────────────── */}
          {sections.some(s => s.total_items - s.completed_items > 0) && (
            <div className="mb-4">
              <FocusQueue sections={sections} deadlines={deadlines} />
            </div>
          )}

          {/* ── 5. TODAY PANEL ──────────────────────────────────────────────── */}
          <PressureRadar sections={sections} />

          {/* ── 6. WORKSPACES ───────────────────────────────────────────────── */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
                  Workspaces
                </h2>
                {sections.length > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: '#1e2d40' }}>
                    {sections.length} space{sections.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                style={{ border: '1px solid #1a2638', color: '#334155' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#2a3a54';
                  (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#0f1826';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#1a2638';
                  (e.currentTarget as HTMLElement).style.color = '#334155';
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> New workspace
              </button>
            </div>

            {/* New workspace form */}
            {showNewSection && (
              <div
                className="rounded-2xl p-4 mb-5 animate-fade-in"
                style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
              >
                <p style={{ ...META, fontSize: '10px', color: '#334155', marginBottom: '12px' }}>
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
                    onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = '#f59e0b')}
                    onBlur={e => ((e.currentTarget as HTMLInputElement).style.borderColor = '#1a2638')}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={creating || !newTitle.trim()}
                    className="px-4 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-30 flex items-center gap-1.5 whitespace-nowrap"
                    style={{ backgroundColor: '#f59e0b', color: '#000' }}
                    onMouseEnter={e => { if (!creating && newTitle.trim()) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fbbf24'; }}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f59e0b')}
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewSection(false)}
                    className="p-2.5 rounded-xl transition-colors"
                    style={{ color: '#334155' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#94a3b8')}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#334155')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Section grid / empty state */}
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
                <p className="text-xs mb-5" style={{ color: '#1e2d40' }}>
                  Create a workspace for each course or project.
                </p>
                <button
                  onClick={() => setShowNewSection(true)}
                  className="inline-flex items-center gap-1.5 font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
                  style={{ backgroundColor: '#f59e0b', color: '#000' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fbbf24')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f59e0b')}
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

          {/* ── 7. TOOLS ────────────────────────────────────────────────────── */}
          <div className="mb-6">
            <div
              className="mb-5"
              style={{ borderTop: '1px solid #0d1424', paddingTop: '24px' }}
            >
              <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Tools</h2>
              <p className="text-xs mt-0.5" style={{ color: '#1e2d40' }}>
                Quick-access links and portals
              </p>
            </div>
            <MyPortals />
          </div>

        </div>
      )}

      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}
    </Layout>
  );
}
