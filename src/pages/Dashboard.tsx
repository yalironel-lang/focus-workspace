import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useAuth } from '../hooks/useAuth';
import { useWorkspaceLayout, SIZE_SPAN, ModuleSize } from '../hooks/useWorkspaceLayout';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useWorkspaceTheme, mergeAccent, computeCanvasBg } from '../hooks/useWorkspaceTheme';
import { SessionModal } from '../components/SessionModal';

// ── Canvas primitives ─────────────────────────────────────────────────────────
import { CommandBar }       from '../components/canvas/CommandBar';
import { WorkspaceModule }  from '../components/canvas/WorkspaceModule';
import { DesignToolbar }    from '../components/canvas/DesignToolbar';
import { ModuleInspector }  from '../components/canvas/ModuleInspector';
import { AddModulePanel }   from '../components/canvas/AddModulePanel';
import { CanvasEmptyState } from '../components/canvas/CanvasEmptyState';

// ── Workspace module content ──────────────────────────────────────────────────
import { DailyIntention } from '../components/workspace/DailyIntention';
import { CapturePanel }   from '../components/workspace/CapturePanel';
import { MomentumMeter }  from '../components/workspace/MomentumMeter';
import { FocusMode }      from '../components/workspace/FocusMode';
import { ExecutePanel }   from '../components/workspace/ExecutePanel';
import { FocusQueue }     from '../components/workspace/FocusQueue';
import { DeepWorkTimer }  from '../components/workspace/DeepWorkTimer';
import { SectionCard }    from '../components/SectionCard';
import { PressureRadar }  from '../components/PressureRadar';
import { MyPortals }      from '../components/MyPortals';

import { loadSession, sortSectionsByUrgency } from '../utils/sessionPlan';
import { Loader2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1).split(/[._-]/)[0];
}

type InspectorTab = 'module' | 'theme' | 'presets';

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut }                                       = useAuth();
  const { sections, loading, createSection, deleteSection }     = useSections();
  const { deadlines, addDeadline }                              = useDeadlines();
  const { modules, toggleModule, reorder, setSize,
          applyPreset: applyLayoutPreset, reset, presets }       = useWorkspaceLayout();
  const { tokens: atmTokens, atmosphereId, setAtmosphere }      = useAtmosphere();

  // ── Theme system ─────────────────────────────────────────────────────────────
  const {
    global: globalTheme,
    design,
    moduleThemes,
    presets: themePresets,
    updateGlobal,
    applyPreset: applyThemePreset,
    updateModule,
    resetModule,
  } = useWorkspaceTheme();

  // Merge accent overrides from theme into atmosphere tokens
  const tokens = mergeAccent(atmTokens, design);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [designMode,        setDesignMode]        = useState(false);
  const [selectedId,        setSelectedId]        = useState<string | null>(null);
  const [addPanelOpen,      setAddPanelOpen]      = useState(false);
  const [inspectorOpen,     setInspectorOpen]     = useState(false);
  const [inspectorTab,      setInspectorTab]      = useState<InspectorTab>('module');
  const [showNewSection,    setShowNewSection]    = useState(false);
  const [showSessionModal,  setShowSessionModal]  = useState(false);
  const [newTitle,          setNewTitle]          = useState('');
  const [creating,          setCreating]          = useState(false);

  // ── Drag state ───────────────────────────────────────────────────────────────
  const dragIdRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Pre-warm section data for SessionModal
  const activeSession    = loadSession();
  useSectionDetail(activeSession?.sectionId);

  const suggestedSection = sortSectionsByUrgency(sections, deadlines)[0] ?? null;
  const displayName      = user?.email ? firstName(user.email) : '';

  // Inspector is open when a module is selected OR we force-opened it (Theme button)
  const isInspectorOpen = inspectorOpen || !!selectedId;

  const openInspectorAtTab = useCallback((tab: InspectorTab) => {
    setInspectorTab(tab);
    setInspectorOpen(true);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setSelectedId(null);
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((id: string) => { dragIdRef.current = id; }, []);
  const handleDragOver  = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragIdRef.current !== id) setDragOver(id);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (fromId && fromId !== toId) reorder(fromId, toId);
    dragIdRef.current = null;
    setDragOver(null);
  }, [reorder]);
  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDragOver(null);
  }, []);

  // ── Inspector move helpers ────────────────────────────────────────────────────

  const handleMoveUp = useCallback((id: string) => {
    const ordered = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled);
    const idx = ordered.findIndex(m => m.id === id);
    if (idx > 0) reorder(id, ordered[idx - 1].id);
  }, [modules, reorder]);

  const handleMoveDown = useCallback((id: string) => {
    const ordered = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled);
    const idx = ordered.findIndex(m => m.id === id);
    if (idx < ordered.length - 1) reorder(id, ordered[idx + 1].id);
  }, [modules, reorder]);

  // ── Capture ────────────────────────────────────────────────────────────────

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
      style: {
        background: tokens.cardBg,
        border:     `1px solid ${tokens.cardBorder}`,
        color:      tokens.textPrimary,
      },
    });
  };

  // ── Sign out ──────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
      navigate('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  // ── Workspace create ──────────────────────────────────────────────────────

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

  // ── Module renderer ───────────────────────────────────────────────────────

  const renderModuleContent = (id: string): React.ReactNode | null => {
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
        return <WorkspacesPanel />;
      case 'deep-work-timer':
        return <DeepWorkTimer tokens={tokens} />;
      case 'tools':
        return <MyPortals />;
      default:
        return null;
    }
  };

  // ── Workspaces inline panel ───────────────────────────────────────────────

  function WorkspacesPanel() {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: tokens.cardBg, border: `1px solid ${tokens.cardBorder}` }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: tokens.textPrimary }}>
            Workspaces
          </span>
          <button
            onClick={() => { setShowNewSection(s => !s); setNewTitle(''); }}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
            style={{ color: tokens.textGhost }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = tokens.accent;
              (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = tokens.textGhost;
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} /> New
          </button>
        </div>

        {showNewSection && (
          <div className="px-4 py-3 animate-fade-in" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Workspace name…"
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none transition-all"
                style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary }}
                onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
                onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
                autoFocus
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-4 py-2 rounded-xl font-bold text-xs disabled:opacity-30 flex items-center gap-1 whitespace-nowrap transition-all"
                style={{ backgroundColor: tokens.accent, color: '#000' }}
                onMouseEnter={e => { if (!creating && newTitle.trim()) (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover; }}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
              >
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewSection(false)}
                className="p-2 rounded-xl transition-colors"
                style={{ color: tokens.textGhost }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary)}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {sections.length === 0 && !showNewSection ? (
          <div className="px-5 py-8 text-center">
            <p style={{ fontSize: '14px', color: tokens.textMuted, marginBottom: '4px' }}>No workspaces yet</p>
            <p style={{ fontSize: '12px', color: tokens.textGhost, marginBottom: '16px' }}>
              Create a workspace for each course or project.
            </p>
            <button
              onClick={() => setShowNewSection(true)}
              className="inline-flex items-center gap-1.5 font-bold text-xs px-4 py-2 rounded-xl transition-all"
              style={{ backgroundColor: tokens.accent, color: '#000' }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover)}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
            >
              <Plus className="w-3 h-3" /> Create workspace
            </button>
          </div>
        ) : sections.length > 0 ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

  // ── Canvas background ────────────────────────────────────────────────────

  const canvasStyle = computeCanvasBg(design, tokens, designMode);

  // ── Module list ─────────────────────────────────────────────────────────

  const enabledModules = modules
    .filter(m => m.enabled)
    .sort((a, b) => a.order - b.order);
  const hasModules = enabledModules.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight:       '100vh',
        backgroundColor: tokens.pageBg,
        color:           tokens.textPrimary,
        transition:      `background-color ${design.transition}`,
      }}
    >

      {/* ── Command Bar ───────────────────────────────────────── */}
      <CommandBar
        tokens={tokens}
        atmosphereId={atmosphereId}
        designMode={designMode}
        userName={displayName}
        onToggleDesign={() => {
          setDesignMode(d => {
            const next = !d;
            if (!next) { setSelectedId(null); setInspectorOpen(false); }
            return next;
          });
        }}
        onOpenAdd={() => setAddPanelOpen(true)}
        onSetAtmosphere={setAtmosphere}
        onSignOut={handleSignOut}
      />

      {/* ── Canvas ────────────────────────────────────────────── */}
      <main
        className="relative"
        style={{
          minHeight:  'calc(100vh - 48px)',
          ...canvasStyle,
          transition: `all ${design.transition}`,
        }}
        onClick={() => {
          if (designMode && selectedId) setSelectedId(null);
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 48px)' }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: tokens.cardBorder }} />
          </div>
        ) : !hasModules ? (
          <CanvasEmptyState
            tokens={tokens}
            presets={presets}
            onOpenAdd={() => setAddPanelOpen(true)}
            onApplyPreset={id => { applyLayoutPreset(id); }}
          />
        ) : (
          <div
            className="mx-auto pb-32"
            style={{
              maxWidth: '1200px',
              padding:  design.canvasPad,
              paddingBottom: '128px',
            }}
          >
            {/* 12-column bento grid */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: 'repeat(12, 1fr)',
                gap:                 `${design.gap}px`,
                transition:          `gap ${design.transition}`,
              }}
            >
              {enabledModules.map(m => {
                const content = renderModuleContent(m.id);
                if (content === null) return null;

                return (
                  <div
                    key={m.id}
                    className="min-w-0"
                    style={{ gridColumn: SIZE_SPAN[m.size] }}
                  >
                    <WorkspaceModule
                      id={m.id}
                      size={m.size}
                      designMode={designMode}
                      selected={selectedId === m.id}
                      dragOver={dragOver === m.id}
                      tokens={tokens}
                      design={design}
                      moduleTheme={moduleThemes[m.id]}
                      onSelect={id => {
                        setSelectedId(id);
                        if (id) setInspectorOpen(false); // let selectedId drive open
                      }}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    >
                      {content}
                    </WorkspaceModule>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── Floating toolbar ──────────────────────────────────── */}
      <DesignToolbar
        tokens={tokens}
        designMode={designMode}
        presets={presets}
        onOpenAdd={() => setAddPanelOpen(true)}
        onApplyPreset={applyLayoutPreset}
        onReset={reset}
        onOpenTheme={() => openInspectorAtTab('theme')}
      />

      {/* ── Module inspector ──────────────────────────────────── */}
      <ModuleInspector
        open={isInspectorOpen}
        selectedId={selectedId}
        modules={modules}
        tokens={tokens}
        design={design}
        global={globalTheme}
        moduleThemes={moduleThemes}
        presets={themePresets}
        defaultTab={inspectorTab}
        onClose={closeInspector}
        onSetSize={(id, size: ModuleSize) => setSize(id, size)}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onRemove={toggleModule}
        updateGlobal={updateGlobal}
        applyPreset={applyThemePreset}
        updateModule={updateModule}
        resetModule={resetModule}
      />

      {/* ── Add module panel ──────────────────────────────────── */}
      <AddModulePanel
        open={addPanelOpen}
        modules={modules}
        tokens={tokens}
        onToggle={toggleModule}
        onClose={() => setAddPanelOpen(false)}
      />

      {/* ── Session modal ─────────────────────────────────────── */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}

    </div>
  );
}
