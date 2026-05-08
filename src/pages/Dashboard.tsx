import { useState, useRef } from 'react';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useAuth } from '../hooks/useAuth';
import { useWorkspaceLayout, SIZE_SPAN } from '../hooks/useWorkspaceLayout';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { Layout } from '../components/Layout';
import { SessionModal } from '../components/SessionModal';

// ── Workspace modules ─────────────────────────────────────────────────────────
import { DailyIntention }    from '../components/workspace/DailyIntention';
import { CapturePanel }      from '../components/workspace/CapturePanel';
import { MomentumMeter }     from '../components/workspace/MomentumMeter';
import { FocusMode }         from '../components/workspace/FocusMode';
import { ExecutePanel }      from '../components/workspace/ExecutePanel';
import { FocusQueue }        from '../components/workspace/FocusQueue';
import { DeepWorkTimer }     from '../components/workspace/DeepWorkTimer';
import { ModuleShell }       from '../components/workspace/ModuleShell';
import { WorkspaceDesigner } from '../components/workspace/WorkspaceDesigner';

// ── Existing components ───────────────────────────────────────────────────────
import { SectionCard }   from '../components/SectionCard';
import { PressureRadar } from '../components/PressureRadar';
import { MyPortals }     from '../components/MyPortals';

import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Loader2, Plus, X, Sliders } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user }                                                = useAuth();
  const { sections, loading, createSection, deleteSection }     = useSections();
  const { deadlines, addDeadline }                              = useDeadlines();
  const { modules, toggleModule, reorder, setSize,
          applyPreset, reset, presets }                          = useWorkspaceLayout();
  const { tokens, atmosphereId, setAtmosphere }                 = useAtmosphere();

  const [designMode,       setDesignMode]       = useState(false);
  const [designerOpen,     setDesignerOpen]     = useState(false);
  const [showNewSection,   setShowNewSection]   = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [newTitle,         setNewTitle]         = useState('');
  const [creating,         setCreating]         = useState(false);

  // Drag state for design mode
  const dragIdRef  = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const activeSession    = loadSession();
  useSectionDetail(activeSession?.sectionId); // pre-warm

  const suggestedSection = sortSectionsByUrgency(sections, deadlines)[0] ?? null;
  const displayName      = user?.email ? firstName(user.email) : '';

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDragStart = (id: string) => { dragIdRef.current = id; };
  const handleDragOver  = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragIdRef.current !== id) setDragOver(id);
  };
  const handleDrop      = (e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (fromId && fromId !== toId) reorder(fromId, toId);
    dragIdRef.current = null;
    setDragOver(null);
  };
  const handleDragEnd   = () => { dragIdRef.current = null; setDragOver(null); };

  // ── Data handlers ───────────────────────────────────────────────────────────

  const handleCapture = async (text: string) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    await addDeadline({
      section_id: null,
      title:      text,
      type:       'custom',
      due_date:   d.toISOString().split('T')[0],
      notes:      null,
    });
    toast.success('Captured', {
      icon: '⚡',
      style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createSection(newTitle.trim());
      toast.success('Workspace created', {
        style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
      });
      setNewTitle('');
      setShowNewSection(false);
    } catch {
      toast.error('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  // ── Module renderer ─────────────────────────────────────────────────────────

  const renderModule = (id: string) => {
    switch (id) {
      case 'daily-intention':
        return <DailyIntention tokens={tokens} />;

      case 'capture':
        return <CapturePanel onCapture={handleCapture} />;

      case 'momentum':
        return <MomentumMeter sections={sections} />;

      case 'focus-mode':
        return (
          <FocusMode
            activeSession={activeSession}
            suggestedSection={suggestedSection}
            onStartSession={() => setShowSessionModal(true)}
          />
        );

      case 'execute':
        return sections.some(s => s.total_items > 0)
          ? <ExecutePanel sections={sections} />
          : null;

      case 'focus-queue':
        return sections.some(s => s.total_items - s.completed_items > 0)
          ? <FocusQueue sections={sections} deadlines={deadlines} />
          : null;

      case 'today':
        return <PressureRadar sections={sections} />;

      case 'workspaces':
        return <WorkspacesModule />;

      case 'deep-work-timer':
        return <DeepWorkTimer tokens={tokens} />;

      case 'tools':
        return <MyPortals />;

      default:
        return null;
    }
  };

  // ── Workspaces module (inline) ──────────────────────────────────────────────

  function WorkspacesModule() {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold" style={{ color: tokens.textPrimary }}>
              Workspaces
            </h2>
            {sections.length > 0 && (
              <p className="text-xs mt-0.5" style={{ color: tokens.textGhost }}>
                {sections.length} space{sections.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
            style={{ border: `1px solid ${tokens.cardBorder}`, color: tokens.textMuted }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorderHover;
              (e.currentTarget as HTMLElement).style.color = tokens.textSecondary;
              (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBg;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
              (e.currentTarget as HTMLElement).style.color = tokens.textMuted;
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> New workspace
          </button>
        </div>

        {showNewSection && (
          <div
            className="rounded-2xl p-4 mb-5 animate-fade-in"
            style={{ backgroundColor: tokens.cardBg, border: `1px solid ${tokens.cardBorder}` }}
          >
            <p style={{ ...META, fontSize: '10px', color: tokens.textGhost, marginBottom: '12px' }}>
              New workspace
            </p>
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Calculus II"
                className="flex-1 px-3.5 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary }}
                onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
                onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
                autoFocus
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-30 flex items-center gap-1.5 whitespace-nowrap transition-all"
                style={{ backgroundColor: tokens.accent, color: '#000' }}
                onMouseEnter={e => { if (!creating && newTitle.trim()) (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover; }}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewSection(false)}
                className="p-2.5 rounded-xl transition-colors"
                style={{ color: tokens.textGhost }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary)}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost)}
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {sections.length === 0 && !showNewSection ? (
          <div
            className="rounded-2xl px-6 py-10 text-center"
            style={{ border: `1px dashed ${tokens.cardBorder}` }}
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: tokens.cardBg }}
            >
              <Plus className="w-5 h-5" style={{ color: tokens.textGhost }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: tokens.textMuted }}>
              No workspaces yet
            </p>
            <p className="text-xs mb-5" style={{ color: tokens.textGhost }}>
              Create a workspace for each course or project.
            </p>
            <button
              onClick={() => setShowNewSection(true)}
              className="inline-flex items-center gap-1.5 font-bold text-sm px-4 py-2.5 rounded-xl transition-all"
              style={{ backgroundColor: tokens.accent, color: '#000' }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover)}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Create workspace
            </button>
          </div>
        ) : sections.length > 0 ? (
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
        ) : null}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const enabledModules = modules.filter(m => m.enabled);

  return (
    <Layout tokens={tokens} onOpenDesigner={() => setDesignerOpen(true)} designMode={designMode} onToggleDesignMode={() => setDesignMode(d => !d)}>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: tokens.cardBorder }} />
        </div>
      ) : (
        <div
          style={{
            minHeight: '100%',
            transition: 'all 0.3s ease',
            // Ambient background glow
            backgroundImage:
              tokens.glowIntensity > 0
                ? `radial-gradient(ellipse 80% 50% at 20% 0%, ${tokens.ambientGlow1}, transparent),
                   radial-gradient(ellipse 60% 40% at 80% 100%, ${tokens.ambientGlow2}, transparent)`
                : 'none',
          }}
        >

          {/* ── Greeting ────────────────────────────────────────────── */}
          <div className="mb-7">
            <p style={{ ...META, fontSize: '10px', color: tokens.textGhost, marginBottom: '5px' }}>
              {formatDate()}
            </p>
            <div className="flex items-end justify-between gap-4 mb-3">
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{ color: tokens.textPrimary }}
              >
                {getGreeting()}{displayName ? `, ${displayName}` : ''}
              </h1>
              {sections.length > 0 && (
                <p className="text-xs pb-0.5 flex-shrink-0" style={{ color: tokens.textGhost }}>
                  {sections.reduce((a, s) => a + (s.total_items - s.completed_items), 0)} remaining
                </p>
              )}
            </div>

            {/* Design mode hint */}
            {designMode && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4 animate-fade-in"
                style={{
                  backgroundColor: tokens.accentSubtle,
                  border: `1px solid ${tokens.accent}40`,
                }}
              >
                <Sliders className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tokens.accent }} />
                <p style={{ ...META, fontSize: '9px', color: tokens.accent }}>
                  Design mode — drag modules to reorder · click tiles to resize
                </p>
              </div>
            )}
          </div>

          {/* ── Module grid ─────────────────────────────────────────── */}
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: 'repeat(12, 1fr)',
              // Design mode: dim grid lines for visual guidance
              backgroundImage: designMode
                ? `linear-gradient(${tokens.cardBorder}20 1px, transparent 1px),
                   linear-gradient(90deg, ${tokens.cardBorder}20 1px, transparent 1px)`
                : 'none',
              backgroundSize: designMode ? '8.33% 40px' : undefined,
            }}
          >
            {enabledModules.map(m => {
              const content = renderModule(m.id);
              if (content === null) return null;

              // Responsive: on small screens everything is full width
              const spanStyle: React.CSSProperties = {
                gridColumn: SIZE_SPAN[m.size],
              };
              // Fallback: treat "third" as full on narrow layouts via min-width
              const wrapperStyle: React.CSSProperties = {
                ...spanStyle,
                minWidth: 0,
                transition: 'grid-column 0.3s ease, opacity 0.2s ease',
              };

              return (
                <div key={m.id} style={wrapperStyle} className="min-w-0">
                  <ModuleShell
                    id={m.id}
                    size={m.size}
                    enabled={m.enabled}
                    designMode={designMode}
                    dragOver={dragOver === m.id}
                    tokens={tokens}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onToggle={toggleModule}
                    onSetSize={setSize}
                  >
                    {content}
                  </ModuleShell>
                </div>
              );
            })}
          </div>

          {/* Bottom spacer */}
          <div className="h-16" />

        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}

      <WorkspaceDesigner
        open={designerOpen}
        tokens={tokens}
        atmosphereId={atmosphereId}
        modules={modules}
        presets={presets}
        onSetAtmosphere={setAtmosphere}
        onApplyPreset={id => { applyPreset(id); }}
        onToggleModule={toggleModule}
        onReset={reset}
        onClose={() => setDesignerOpen(false)}
      />

    </Layout>
  );
}
