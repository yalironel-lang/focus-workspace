import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSections, useSectionDetail } from '../hooks/useSections';
import { useDeadlines } from '../hooks/useDeadlines';
import { useAuth } from '../hooks/useAuth';
import { useWorkspaceLayout, SIZE_SPAN, ModuleSize } from '../hooks/useWorkspaceLayout';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useWorkspaceTheme, mergeAccent, computeCanvasBg } from '../hooks/useWorkspaceTheme';
import type { ModuleTheme } from '../hooks/useWorkspaceTheme';
import { useCustomBlocks } from '../hooks/useCustomBlocks';
import type { BlockType, BlockTheme } from '../hooks/useCustomBlocks';
import { STARTER_TEMPLATES } from '../data/starterTemplates';
import { SessionModal } from '../components/SessionModal';

// ── Canvas primitives ─────────────────────────────────────────────────────────
import { CommandBar }       from '../components/canvas/CommandBar';
import { WorkspaceModule }  from '../components/canvas/WorkspaceModule';
import { DesignToolbar }    from '../components/canvas/DesignToolbar';
import { ModuleInspector }  from '../components/canvas/ModuleInspector';
import { AddWorkspacePanel } from '../components/canvas/AddWorkspacePanel';
import { CanvasEmptyState }    from '../components/canvas/CanvasEmptyState';
import { OnboardingLanding }  from '../components/onboarding/OnboardingLanding';
import type { OnboardingPath } from '../components/onboarding/OnboardingLanding';
import { BlockRenderer }    from '../components/canvas/BlockRenderer';
import { QuickAddFab }      from '../components/canvas/QuickAddFab';

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
import { computeIntelligence, getGreeting, getDayContext } from '../utils/workspaceIntelligence';
import { useDailyLoop }         from '../hooks/useDailyLoop';
import { useContextualHints }   from '../hooks/useContextualHints';
import { DailyEntryBanner }     from '../components/canvas/DailyEntryBanner';
import { ContextualHint }       from '../components/canvas/ContextualHint';
import { Loader2, Plus, X }     from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(email: string): string {
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1).split(/[._-]/)[0];
}

type InspectorTab = 'module' | 'theme' | 'presets';

/** Key used by useWorkspaceLayout to persist layout — if absent → first visit */
const LAYOUT_STORAGE_KEY = 'fw_workspace_layout_v3';
/** Marks that the user has seen the guided onboarding intro */
const ONBOARDING_KEY = 'fw_onboarding_v1';

// ── Canvas zone definitions ───────────────────────────────────────────────────

const CANVAS_ZONES = [
  { id: 'focus',     label: 'Focus Area',    icon: '◎', afterModuleIndex: -1 },
  { id: 'capture',   label: 'Capture',       icon: '⊕', afterModuleIndex: 2  },
  { id: 'personal',  label: 'Personal',      icon: '◇', afterModuleIndex: 5  },
  { id: 'resources', label: 'Resources',     icon: '⊞', afterModuleIndex: 8  },
] as const;

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut }                                       = useAuth();
  const { sections, loading, createSection, deleteSection }     = useSections();
  const { deadlines, addDeadline }                              = useDeadlines();
  const { modules, toggleModule, reorder, setSize,
          applyPreset: applyLayoutPreset, applyModules,
          reset, presets, duplicateModule }                      = useWorkspaceLayout();
  const { tokens: atmTokens, atmosphereId, setAtmosphere }      = useAtmosphere();

  // ── Theme system ─────────────────────────────────────────────────────────────
  const {
    global: globalTheme, design, moduleThemes, userPresets, presets: themePresets,
    updateGlobal, applyPreset: applyThemePreset, saveAsPreset, deleteUserPreset,
    updateModule, resetModule,
  } = useWorkspaceTheme();

  // ── Custom blocks ────────────────────────────────────────────────────────────
  const {
    blocks, addBlock, addBlockWithContent, clearAllBlocks,
    updateContent, updateTheme: updateBlockTheme,
    setBlockSize, deleteBlock, duplicateBlock, reorderBlocks,
  } = useCustomBlocks();

  const tokens = mergeAccent(atmTokens, design);

  // ── Intelligence + daily loop ────────────────────────────────────────────
  const dailyLoop = useDailyLoop();
  // sections/deadlines may not be loaded yet — intelligence degrades gracefully
  const intel = React.useMemo(
    () => computeIntelligence(sections, deadlines),
    [sections, deadlines],
  );

  // ── UI state ─────────────────────────────────────────────────────────────────

  // First visit: no saved layout → open in design mode automatically
  const [designMode, setDesignMode] = useState<boolean>(() =>
    !localStorage.getItem(LAYOUT_STORAGE_KEY)
  );
  const [selectedId,       setSelectedId]       = useState<string | null>(null);
  const [addPanelOpen,     setAddPanelOpen]      = useState(false);
  const [inspectorOpen,    setInspectorOpen]     = useState(false);
  const [inspectorTab,     setInspectorTab]      = useState<InspectorTab>('module');
  const [showNewSection,   setShowNewSection]    = useState(false);
  const [showSessionModal, setShowSessionModal]  = useState(false);
  const [newTitle,         setNewTitle]          = useState('');
  const [creating,         setCreating]          = useState(false);

  // Pulse a newly added block once so user can see where it appeared
  const [pulsingId, setPulsingId] = useState<string | null>(null);

  // Guided onboarding — only shown once, on very first visit
  const [onboardingDone, setOnboardingDone] = useState(() =>
    !!localStorage.getItem(ONBOARDING_KEY)
  );
  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setOnboardingDone(true);
  }, []);

  // ── Drag state ───────────────────────────────────────────────────────────────
  const dragIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver,   setDragOver]   = useState<string | null>(null);

  const activeSession    = loadSession();
  useSectionDetail(activeSession?.sectionId);

  const suggestedSection = sortSectionsByUrgency(sections, deadlines)[0] ?? null;
  const displayName      = user?.email ? firstName(user.email) : '';

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

  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
    setDraggingId(id);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragIdRef.current !== id) setDragOver(id);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (fromId && fromId !== toId) {
      const fromIsBlock = fromId.startsWith('block-');
      const toIsBlock   = toId.startsWith('block-');
      if (fromIsBlock && toIsBlock)        reorderBlocks(fromId, toId);
      else if (!fromIsBlock && !toIsBlock) reorder(fromId, toId);
    }
    dragIdRef.current = null;
    setDraggingId(null);
    setDragOver(null);
  }, [reorder, reorderBlocks]);
  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDragOver(null);
  }, []);

  // ── Inspector move helpers ────────────────────────────────────────────────────

  const handleMoveUp = useCallback((id: string) => {
    if (id.startsWith('block-')) {
      const idx = blocks.findIndex(b => b.id === id);
      if (idx > 0) reorderBlocks(id, blocks[idx - 1].id);
    } else {
      const ordered = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled);
      const idx = ordered.findIndex(m => m.id === id);
      if (idx > 0) reorder(id, ordered[idx - 1].id);
    }
  }, [modules, blocks, reorder, reorderBlocks]);

  const handleMoveDown = useCallback((id: string) => {
    if (id.startsWith('block-')) {
      const idx = blocks.findIndex(b => b.id === id);
      if (idx < blocks.length - 1) reorderBlocks(id, blocks[idx + 1].id);
    } else {
      const ordered = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled);
      const idx = ordered.findIndex(m => m.id === id);
      if (idx < ordered.length - 1) reorder(id, ordered[idx + 1].id);
    }
  }, [modules, blocks, reorder, reorderBlocks]);

  // ── Add block with auto-select + scroll-into-view ─────────────────────────

  const handleAddBlock = useCallback((type: BlockType) => {
    const newId = addBlock(type);
    // Give the DOM a tick to render the new block, then select + scroll to it
    setTimeout(() => {
      setSelectedId(newId);
      setPulsingId(newId);
      const el = document.querySelector(`[data-module-id="${newId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Remove pulse after animation completes
      setTimeout(() => setPulsingId(null), 1200);
    }, 80);
  }, [addBlock]);

  // ── Apply starter template ────────────────────────────────────────────────

  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = STARTER_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    // 1. Apply module layout
    applyModules(template.modules);

    // 2. Clear existing custom blocks and seed template blocks
    clearAllBlocks();

    // Wait a tick so clearAllBlocks state flush lands, then add blocks sequentially
    // (each addBlockWithContent needs the updated prev.length for correct order)
    let delay = 0;
    for (const spec of template.blocks) {
      const d = delay;
      setTimeout(() => {
        addBlockWithContent(spec.type, spec.size, spec.prefill);
      }, d);
      delay += 10; // stagger slightly so state updates don't collide
    }

    toast.success(`"${template.name}" loaded`, {
      icon: template.emoji,
      style: {
        background: tokens.cardBg,
        border:     `1px solid ${tokens.cardBorder}`,
        color:      tokens.textPrimary,
      },
    });
  }, [applyModules, clearAllBlocks, addBlockWithContent, tokens]);

  // ── Onboarding path handler — after handleApplyTemplate to avoid TDZ ────────
  const handleOnboardingEnter = useCallback((path: OnboardingPath) => {
    completeOnboarding();
    if (path === 'blank-canvas') {
      setDesignMode(true);
      setTimeout(() => setAddPanelOpen(true), 500);
    } else {
      handleApplyTemplate(path);
    }
  }, [completeOnboarding, handleApplyTemplate]);

  // ── Capture ────────────────────────────────────────────────────────────────

  const handleCapture = async (text: string) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    await addDeadline({
      section_id: null, title: text, type: 'custom',
      due_date:   d.toISOString().split('T')[0], notes: null,
    });
    toast.success('Captured', {
      icon: '⚡',
      style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
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
    const baseId = id.replace(/-copy$/, '');
    switch (baseId) {
      case 'daily-intention': return <DailyIntention tokens={tokens} />;
      case 'capture':         return <CapturePanel onCapture={handleCapture} />;
      case 'momentum':        return <MomentumMeter sections={sections} />;
      case 'focus-mode':
        return (
          <FocusMode
            activeSession={activeSession}
            suggestedSection={suggestedSection}
            onStartSession={() => setShowSessionModal(true)}
          />
        );
      case 'execute':
        return sections.some(s => s.total_items > 0) ? <ExecutePanel sections={sections} /> : null;
      case 'focus-queue':
        return sections.some(s => s.total_items - s.completed_items > 0)
          ? <FocusQueue sections={sections} deadlines={deadlines} />
          : null;
      case 'today':       return <PressureRadar sections={sections} />;
      case 'workspaces':  return <WorkspacesPanel />;
      case 'deep-work-timer': return <DeepWorkTimer tokens={tokens} />;
      case 'tools':       return <MyPortals />;
      default:            return null;
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
          <span style={{ fontSize: '14px', fontWeight: 600, color: tokens.textPrimary }}>Workspaces</span>
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
                type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="Workspace name…"
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none transition-all"
                style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary }}
                onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
                onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
                autoFocus
              />
              <button
                type="submit" disabled={creating || !newTitle.trim()}
                className="px-4 py-2 rounded-xl font-bold text-xs disabled:opacity-30 flex items-center gap-1 whitespace-nowrap transition-all"
                style={{ backgroundColor: tokens.accent, color: '#000' }}
                onMouseEnter={e => { if (!creating && newTitle.trim()) (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover; }}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
              >
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
              </button>
              <button
                type="button" onClick={() => setShowNewSection(false)}
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
                key={section.id} section={section} onDelete={deleteSection}
                deadlines={deadlines.filter(d => d.section_id === section.id)}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Unified inspector adapters ────────────────────────────────────────────

  const allModuleConfigs = [
    ...modules,
    ...blocks.map(b => ({ id: b.id, enabled: true, size: b.size, order: b.order + 10000 })),
  ];
  const allThemes: Record<string, ModuleTheme> = {
    ...moduleThemes,
    ...Object.fromEntries(blocks.map(b => [b.id, b.theme ?? {}])),
  };

  const handleRemoveFromCanvas = useCallback((id: string) => {
    if (id.startsWith('block-')) { deleteBlock(id); setSelectedId(null); }
    else toggleModule(id);
  }, [deleteBlock, toggleModule]);

  const handleSetSizeCanvas = useCallback((id: string, size: ModuleSize) => {
    if (id.startsWith('block-')) setBlockSize(id, size);
    else setSize(id, size);
  }, [setBlockSize, setSize]);

  const handleDuplicateCanvas = useCallback((id: string) => {
    if (id.startsWith('block-')) duplicateBlock(id);
    else duplicateModule(id);
  }, [duplicateBlock, duplicateModule]);

  const handleUpdateTheme = useCallback((id: string, patch: Partial<ModuleTheme>) => {
    if (id.startsWith('block-')) updateBlockTheme(id, patch as Partial<BlockTheme>);
    else updateModule(id, patch);
  }, [updateBlockTheme, updateModule]);

  const handleResetTheme = useCallback((id: string) => {
    if (id.startsWith('block-')) updateBlockTheme(id, {});
    else resetModule(id);
  }, [updateBlockTheme, resetModule]);

  // ── Canvas ────────────────────────────────────────────────────────────────

  const canvasStyle = computeCanvasBg(design, tokens, designMode);
  const enabledModules = modules.filter(m => m.enabled).sort((a, b) => a.order - b.order);
  const hasContent = enabledModules.length > 0 || blocks.length > 0;

  // ── Contextual hints ──────────────────────────────────────────────────────
  const hintCtx = React.useMemo(() => ({
    hasContent,
    designMode,
    blocksCount:       blocks.length,
    enabledModuleIds:  enabledModules.map(m => m.id),
    sectionsCount:     sections.length,
    sessionCount:      dailyLoop.sessionCount,
  }), [hasContent, designMode, blocks.length, enabledModules, sections.length, dailyLoop.sessionCount]);

  const hints = useContextualHints(
    hintCtx,
    () => setAddPanelOpen(true),                          // onCmdK
    () => { toggleModule('capture'); },                   // onAddCapture
  );

  // ── Canvas zone helper ────────────────────────────────────────────────────

  function ZoneLabel({ label, icon }: { label: string; icon: string }) {
    return (
      <div
        style={{
          gridColumn:   'span 12',
          display:      'flex',
          alignItems:   'center',
          gap:          '8px',
          padding:      '4px 2px',
          pointerEvents: 'none',
          userSelect:   'none',
        }}
      >
        <span style={{ fontSize: '10px', color: tokens.accent, opacity: 0.6 }}>{icon}</span>
        <div
          style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      '9px',
            fontWeight:    700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color:         tokens.textGhost,
            opacity:       0.7,
          }}
        >
          {label}
        </div>
        <div
          style={{
            flex:            1,
            height:          '1px',
            backgroundColor: tokens.divider,
            opacity:         0.4,
          }}
        />
      </div>
    );
  }

  // ── Inline "Add anything" zone ────────────────────────────────────────────

  function InlineAddZone() {
    return (
      <div
        style={{
          gridColumn:      'span 12',
          marginTop:       `${design.gap}px`,
        }}
      >
        <button
          onClick={() => setAddPanelOpen(true)}
          style={{
            width:           '100%',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             '10px',
            padding:         '28px 24px',
            borderRadius:    `${design.radius}px`,
            border:          `1.5px dashed ${tokens.accent}30`,
            backgroundColor: `${tokens.accent}05`,
            cursor:          'pointer',
            transition:      'all 0.2s ease',
            color:           tokens.textGhost,
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor      = `${tokens.accent}70`;
            el.style.backgroundColor  = `${tokens.accent}08`;
            el.style.color            = tokens.textMuted;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor      = `${tokens.accent}30`;
            el.style.backgroundColor  = `${tokens.accent}05`;
            el.style.color            = tokens.textGhost;
          }}
        >
          <div
            style={{
              width:           '28px',
              height:          '28px',
              borderRadius:    '50%',
              backgroundColor: `${tokens.accent}15`,
              border:          `1px solid ${tokens.accent}30`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              flexShrink:      0,
            }}
          >
            <Plus style={{ width: '14px', height: '14px', color: tokens.accent }} strokeWidth={2} />
          </div>
          <span
            style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      '12px',
              fontWeight:    600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Add anything
          </span>
        </button>
      </div>
    );
  }

  // ── Design mode hint banner (first time only) ─────────────────────────────

  const [showDesignHint, setShowDesignHint] = useState(() =>
    !localStorage.getItem(LAYOUT_STORAGE_KEY)
  );

  // Dismiss hint once they interact with the canvas
  useEffect(() => {
    if (hasContent) setShowDesignHint(false);
  }, [hasContent]);

  // ── CMD+K / CTRL+K → open "Add to workspace" panel ───────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setAddPanelOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
      {/* ── First-ever visit: cinematic onboarding landing (full-screen, above nav) ── */}
      {!onboardingDone && (
        <OnboardingLanding
          tokens={tokens}
          onEnter={handleOnboardingEnter}
        />
      )}

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

        ) : !hasContent ? (
          /* ── Empty state (onboarding complete, no content yet) ── */
          <CanvasEmptyState
            tokens={tokens}
            designMode={designMode}
            starterTemplates={STARTER_TEMPLATES}
            presets={presets}
            onOpenAdd={() => setAddPanelOpen(true)}
            onAddBlock={handleAddBlock}
            onApplyPreset={id => applyLayoutPreset(id)}
            onApplyTemplate={handleApplyTemplate}
          />

        ) : (
          <>
            {/* ── Design mode dot-grid overlay ── */}
            {designMode && (
              <div
                className="design-grid-pulse pointer-events-none fixed inset-0 z-0"
                style={{
                  backgroundImage:  `radial-gradient(circle, ${tokens.accent}18 1px, transparent 1px)`,
                  backgroundSize:   '32px 32px',
                  backgroundPosition: '16px 16px',
                }}
              />
            )}

            {/* ── First-time design mode banner ── */}
            {designMode && showDesignHint && (
              <div
                className="animate-slide-up"
                style={{
                  position:        'sticky',
                  top:             '48px',
                  zIndex:          35,
                  margin:          '0',
                  padding:         '10px 20px',
                  backgroundColor: `${tokens.accent}12`,
                  borderBottom:    `1px solid ${tokens.accent}25`,
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'space-between',
                  gap:             '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>✦</span>
                  <span style={{
                    fontFamily:    "'Space Grotesk', sans-serif",
                    fontSize:      '12px',
                    fontWeight:    600,
                    color:         tokens.accent,
                  }}>
                    Editing layout
                  </span>
                  <span style={{ fontSize: '12px', color: tokens.textMuted }}>
                    — drag to reorder, resize cards, or press ⌘K to add anything.
                  </span>
                </div>
                <button
                  onClick={() => setShowDesignHint(false)}
                  style={{ color: tokens.textGhost, background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                >
                  <X style={{ width: '14px', height: '14px' }} />
                </button>
              </div>
            )}

            <div
              className="mx-auto relative z-10"
              style={{
                maxWidth:      '1200px',
                padding:       design.canvasPad,
                paddingBottom: '160px',
              }}
            >
              {/* 12-col bento grid — spacious gap */}
              <div
                className="grid"
                style={{
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  gap:                 `${Math.max(design.gap, 20)}px`,
                  transition:          `gap ${design.transition}`,
                }}
              >
                {/* ── Daily intelligence banner ── */}
                {!designMode && (
                  <DailyEntryBanner
                    tokens={tokens}
                    intel={intel}
                    loop={dailyLoop}
                    greeting={getGreeting(displayName)}
                    dayContext={getDayContext()}
                    onStartSession={() => setShowSessionModal(true)}
                  />
                )}

                {/* ── System modules with zone labels ── */}
                {enabledModules.map((m, idx) => {
                  const content = renderModuleContent(m.id);
                  if (content === null) return null;

                  // Inject zone label before this module if zone threshold matches
                  const zoneHere = designMode
                    ? CANVAS_ZONES.find(z => z.afterModuleIndex === idx - 1)
                    : undefined;

                  return (
                    <React.Fragment key={m.id}>
                      {zoneHere && <ZoneLabel label={zoneHere.label} icon={zoneHere.icon} />}
                      <div
                        className="min-w-0"
                        data-module-id={m.id}
                        style={{ gridColumn: SIZE_SPAN[m.size] }}
                      >
                        <WorkspaceModule
                          id={m.id}
                          size={m.size}
                          designMode={designMode}
                          selected={selectedId === m.id}
                          dragOver={dragOver === m.id}
                          isDragging={draggingId === m.id}
                          tokens={tokens}
                          design={design}
                          moduleTheme={moduleThemes[m.id]}
                          onSelect={id => {
                            setSelectedId(id);
                            if (id) setInspectorOpen(false);
                          }}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onDragEnd={handleDragEnd}
                        >
                          {content}
                        </WorkspaceModule>
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* ── Custom blocks ── */}
                {blocks.map(b => (
                  <div
                    key={b.id}
                    className={`min-w-0 ${pulsingId === b.id ? 'module-selected-pulse' : 'block-appear'}`}
                    data-module-id={b.id}
                    style={{ gridColumn: SIZE_SPAN[b.size] }}
                  >
                    <WorkspaceModule
                      id={b.id}
                      size={b.size}
                      designMode={designMode}
                      selected={selectedId === b.id}
                      dragOver={dragOver === b.id}
                      isDragging={draggingId === b.id}
                      tokens={tokens}
                      design={design}
                      moduleTheme={b.theme}
                      onSelect={id => {
                        setSelectedId(id);
                        if (id) setInspectorOpen(false);
                      }}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    >
                      <BlockRenderer
                        block={b}
                        tokens={tokens}
                        onChange={content => updateContent(b.id, content)}
                      />
                    </WorkspaceModule>
                  </div>
                ))}

                {/* ── Inline "Add anything" zone — always visible in design mode ── */}
                {designMode && <InlineAddZone />}

              </div>
            </div>
          </>
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
        modules={allModuleConfigs}
        tokens={tokens}
        design={design}
        global={globalTheme}
        moduleThemes={allThemes}
        presets={themePresets}
        userPresets={userPresets}
        defaultTab={inspectorTab}
        onClose={closeInspector}
        onSetSize={handleSetSizeCanvas}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onRemove={handleRemoveFromCanvas}
        onDuplicate={handleDuplicateCanvas}
        updateGlobal={updateGlobal}
        applyPreset={applyThemePreset}
        saveAsPreset={saveAsPreset}
        deleteUserPreset={deleteUserPreset}
        updateModule={handleUpdateTheme}
        resetModule={handleResetTheme}
      />

      {/* ── Add to workspace panel (unified) ─────────────────── */}
      <AddWorkspacePanel
        open={addPanelOpen}
        modules={modules}
        tokens={tokens}
        onToggle={toggleModule}
        onAddBlock={handleAddBlock}
        onClose={() => setAddPanelOpen(false)}
      />

      {/* ── Quick-add FAB ─────────────────────────────────────── */}
      <QuickAddFab
        tokens={tokens}
        panelOpen={addPanelOpen}
        onAddBlock={handleAddBlock}
        onOpenModules={() => setAddPanelOpen(o => !o)}
      />

      {/* ── Contextual hint (progressive disclosure) ─────────── */}
      <ContextualHint
        hint={hints.activeHint}
        tokens={tokens}
        onDismiss={hints.dismissHint}
        onAction={hints.triggerAction}
      />

      {/* ── Session modal ─────────────────────────────────────── */}
      {showSessionModal && (
        <SessionModal sections={sections} onClose={() => setShowSessionModal(false)} />
      )}

    </div>
  );
}

