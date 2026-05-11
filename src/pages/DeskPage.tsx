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
import { useCommandPalette } from '../command/CommandPaletteContext';

// ── Canvas primitives ─────────────────────────────────────────────────────────
import { CommandBar }        from '../components/canvas/CommandBar';
import { WorkspaceModule }   from '../components/canvas/WorkspaceModule';
import { DesignToolbar }     from '../components/canvas/DesignToolbar';
import { ModuleInspector }   from '../components/canvas/ModuleInspector';
import { AddWorkspacePanel } from '../components/canvas/AddWorkspacePanel';
import { CanvasEmptyState }  from '../components/canvas/CanvasEmptyState';
import { OnboardingLanding } from '../components/onboarding/OnboardingLanding';
import type { OnboardingPath } from '../components/onboarding/OnboardingLanding';
import { BlockRenderer }     from '../components/canvas/BlockRenderer';
import { QuickAddFab }       from '../components/canvas/QuickAddFab';
import { FreeformCanvas }    from '../components/canvas/FreeformCanvas';
import { CreateToolModal }   from '../components/canvas/CreateToolModal';

// ── Freeform canvas hooks ─────────────────────────────────────────────────────
import { useCanvasMode }      from '../hooks/useCanvasMode';
import { useBlockPositions }  from '../hooks/useBlockPositions';
import { useCustomTools }     from '../hooks/useCustomTools';
import { MODULE_REGISTRY }    from '../modules/registry';
import { BLOCK_META }         from '../hooks/useCustomBlocks';

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
import { computeIntelligence, getGreeting } from '../utils/workspaceIntelligence';
import { useSessionContinuity }     from '../hooks/useSessionContinuity';
import { StartHerePanel }       from '../components/canvas/StartHerePanel';
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

// ── Desk (personal canvas / modules) ────────────────────────────────────────

export function DeskPage() {
  const navigate = useNavigate();
  const { openSessionModal } = useCommandPalette();
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

  // ── Freeform canvas ──────────────────────────────────────────────────────
  const canvasMode   = useCanvasMode();
  const blockPos     = useBlockPositions();
  const customTools  = useCustomTools();
  const [createToolOpen, setCreateToolOpen] = useState(false);

  // ── Session continuity ───────────────────────────────────────────────────
  const continuity   = useSessionContinuity();

  // On every mount: if there's a live sessionStorage session, mirror it to localStorage
  // so the next app open can surface "continue where you left off".
  React.useEffect(() => {
    const live = loadSession();
    if (live) continuity.recordSession(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Viewport-center placement helper ─────────────────────────────────────
  // Returns world coordinates for the center of the current canvas viewport.
  // Used to place newly added items where the user is looking, not off-screen.

  const viewportCenterWorld = useCallback((offsetX = 0, offsetY = 0) => {
    const vpW  = window.innerWidth;
    const vpH  = window.innerHeight - 48;
    const snap = canvasMode.snapToGrid ? canvasMode.gridSize : 1;
    const raw  = {
      x: (-canvasMode.panX + vpW  / 2) / canvasMode.zoom - 170 + offsetX,
      y: (-canvasMode.panY + vpH  / 2) / canvasMode.zoom - 100 + offsetY,
    };
    return {
      x: Math.max(20, Math.round(raw.x / snap) * snap),
      y: Math.max(20, Math.round(raw.y / snap) * snap),
    };
  }, [canvasMode.panX, canvasMode.panY, canvasMode.zoom, canvasMode.snapToGrid, canvasMode.gridSize]);

  // ── Add block with spatial placement ─────────────────────────────────────

  const handleAddBlock = useCallback((type: BlockType) => {
    const newId = addBlock(type);

    if (canvasMode.mode === 'freeform') {
      // Place at viewport center — item appears where the user is looking
      const { x, y } = viewportCenterWorld();
      blockPos.initPos(newId, { x, y, w: 340 });
    }

    // Slight delay so the block is rendered before we try to scroll/select
    setTimeout(() => {
      setSelectedId(newId);
      setPulsingId(newId);
      if (canvasMode.mode !== 'freeform') {
        const el = document.querySelector(`[data-module-id="${newId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      setTimeout(() => setPulsingId(null), 1200);
    }, 80);
  }, [addBlock, canvasMode.mode, viewportCenterWorld, blockPos]);

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
    // Always enter Space — the canvas is the product
    canvasMode.setMode('freeform');
    if (path === 'blank-canvas') {
      setDesignMode(true);
      setTimeout(() => setAddPanelOpen(true), 500);
    } else {
      handleApplyTemplate(path);
    }
  }, [completeOnboarding, handleApplyTemplate, canvasMode]);

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
            tokens={tokens}
            activeSession={activeSession}
            suggestedSection={suggestedSection}
            lastSession={continuity.isRecent ? continuity.lastSession : null}
            hasSections={sections.length > 0}
            onStartSession={() => openSessionModal()}
            onClearContinuity={continuity.clearLastSession}
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

  // ── Freeform content renderer (modules + blocks by ID) ───────────────────
  //    FreeformCanvas calls this for both system modules and custom blocks.

  const renderFreeformContent = useCallback((id: string): React.ReactNode | null => {
    // Custom block?
    const block = blocks.find(b => b.id === id);
    if (block) {
      return (
        <BlockRenderer
          block={block}
          tokens={tokens}
          onChange={content => updateContent(block.id, content)}
        />
      );
    }
    // System module — reuse same renderer
    return renderModuleContent(id);
  }, [blocks, tokens, updateContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Label for a freeform block (shown in drag handle) ────────────────────

  const getFreeformLabel = useCallback((id: string): string => {
    if (id.startsWith('block-')) {
      const block = blocks.find(b => b.id === id);
      if (!block) return 'Block';
      return block.theme?.customTitle ?? BLOCK_META[block.type]?.label ?? 'Block';
    }
    if (id.startsWith('tool-')) {
      const tool = customTools.tools.find(t => t.id === id);
      return tool?.name ?? 'Tool';
    }
    const meta = MODULE_REGISTRY.find(m => m.id === id || id.startsWith(m.id));
    return meta?.label ?? id;
  }, [blocks, customTools.tools]);

  // ── Init positions when entering freeform mode ────────────────────────────
  //    Any item without a saved position gets placed automatically.
  //    New items added while already in freeform mode go to viewport center.

  const isInFreeform = canvasMode.mode === 'freeform';

  React.useEffect(() => {
    if (!isInFreeform) return;
    const enabledNow = modules.filter(m => m.enabled);
    const allIds = [
      ...enabledNow.map(m => m.id),
      ...blocks.map(b => b.id),
      ...customTools.tools.map(t => t.id),
    ];
    allIds.forEach(id => {
      if (!blockPos.positions[id]) {
        // New items appear at viewport center so they land where the user is looking.
        const pos = viewportCenterWorld(
          (Math.random() - 0.5) * 80,
          (Math.random() - 0.5) * 60,
        );
        blockPos.initPos(id, { x: pos.x, y: pos.y, w: 340 });
      }
    });
  // Re-run whenever mode changes or item list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInFreeform, blocks.length, customTools.tools.length, modules.filter(m => m.enabled).length]);

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
          <span style={{ fontSize: '14px', fontWeight: 600, color: tokens.textPrimary }}>Spaces</span>
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
              <Plus className="w-3 h-3" /> New space
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

  // ── Focus state ───────────────────────────────────────────────────────────
  // When a session is live, the environment shifts: peripheral UI recedes,
  // focus-related modules stay bright, everything else dims back.
  // This is environmental, not modal — you can still see and touch everything.

  const isFocused = !!activeSession && !designMode;

  // Modules that stay at full presence during a session
  const FOCUS_MODULES = new Set(['focus-mode', 'capture', 'deep-work-timer']);

  // ── Canvas ────────────────────────────────────────────────────────────────

  const canvasStyle = computeCanvasBg(design, tokens, designMode);
  const enabledModules = modules.filter(m => m.enabled).sort((a, b) => a.order - b.order);
  const hasContent = enabledModules.length > 0 || blocks.length > 0 || customTools.tools.length > 0;

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

  // ── Scroll position memory — the space remembers where you were ──────────
  // Save on scroll (sessionStorage: survives page refresh, not new tab opens)
  useEffect(() => {
    const save = () => {
      try { sessionStorage.setItem('fw_scroll_v1', String(Math.round(window.scrollY))); } catch {}
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  // Restore on mount — only in grid mode and only when not loading
  useEffect(() => {
    if (loading || canvasMode.mode === 'freeform') return;
    try {
      const saved = sessionStorage.getItem('fw_scroll_v1');
      if (saved) {
        const top = parseInt(saved, 10);
        // Use a small delay so the grid has rendered before we scroll
        const id = setTimeout(() => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), 80);
        return () => clearTimeout(id);
      }
    } catch {}
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Recedes during active session — restore on hover so it's always reachable */}
      <div
        style={{
          opacity:    isFocused ? 0.35 : 1,
          transition: 'opacity 0.7s ease',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = isFocused ? '0.35' : '1'; }}
      >
        <CommandBar
          tokens={tokens}
          atmosphereId={atmosphereId}
          designMode={designMode}
          canvasMode={canvasMode.mode}
          userName={displayName}
          onToggleDesign={() => {
            setDesignMode(d => {
              const next = !d;
              if (!next) { setSelectedId(null); setInspectorOpen(false); }
              return next;
            });
          }}
          onToggleCanvas={canvasMode.toggleMode}
          onOpenAdd={() => setAddPanelOpen(true)}
          onSetAtmosphere={setAtmosphere}
          onSignOut={handleSignOut}
        />
      </div>

      {/* ── Space canvas ─────────────────────────────────────── */}
      {canvasMode.mode === 'freeform' && !loading && (
        <FreeformCanvas
          tokens={tokens}
          modules={modules}
          blocks={blocks}
          tools={customTools.tools}
          positions={blockPos.positions}
          canvasState={canvasMode}
          designMode={designMode}
          selectedId={selectedId}
          activeSession={!!activeSession}
          onSetPos={blockPos.setPos}
          onSelect={id => setSelectedId(id)}
          onRemoveModule={id => toggleModule(id)}
          onRemoveBlock={deleteBlock}
          onRemoveTool={customTools.deleteTool}
          onDuplicateBlock={duplicateBlock}
          onOpenAdd={() => setAddPanelOpen(true)}
          renderModuleContent={renderFreeformContent}
          getLabel={getFreeformLabel}
        />
      )}

      {/* ── Organize view (secondary structured layout) ──────── */}
      <main
        className="relative"
        style={{
          // Fade out gracefully when freeform takes over
          // visibility:hidden prevents scroll/interaction when invisible
          visibility:    canvasMode.mode === 'freeform' ? 'hidden' : 'visible',
          opacity:       canvasMode.mode === 'freeform' ? 0 : 1,
          pointerEvents: canvasMode.mode === 'freeform' ? 'none' : 'auto',
          minHeight:     'calc(100vh - 48px)',
          ...canvasStyle,
          transition:  `opacity 0.25s ease, ${design.transition}`,
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
                  gap:                 `${Math.max(design.gap, 24)}px`,
                  transition:          `gap ${design.transition}`,
                }}
              >
                {/* ── Start Here: daily guidance panel (primary entry point) ── */}
                {!designMode && (
                  <StartHerePanel
                    tokens={tokens}
                    intel={intel}
                    greeting={getGreeting(displayName)}
                    lastSession={continuity.isRecent ? continuity.lastSession : null}
                    onCapture={handleCapture}
                    onStartSession={() => openSessionModal()}
                    onOpenSection={id => navigate(`/section/${id}`)}
                    onDismissContinuity={continuity.clearLastSession}
                  />
                )}

                {/* ── System modules ── */}
                {enabledModules.map((m, idx) => {
                  const content = renderModuleContent(m.id);
                  if (content === null) return null;

                  // During an active session, non-focus modules step back
                  const isFocusModule  = FOCUS_MODULES.has(m.id.replace(/-copy$/, ''));
                  const moduleDimmed   = isFocused && !isFocusModule;

                  return (
                    <React.Fragment key={m.id}>
                      <div
                        className="min-w-0"
                        data-module-id={m.id}
                        style={{
                          gridColumn:     SIZE_SPAN[m.size],
                          animation:      'slideUp 0.4s cubic-bezier(0.32,0.72,0,1) both',
                          animationDelay: `${50 + idx * 40}ms`,
                          opacity:        moduleDimmed ? 0.6 : 1,
                          transition:     'opacity 0.7s ease, box-shadow 1s ease',
                          // Spatial warmth: the focus module glows softly when you
                          // recently worked here — the space remembers through light
                          ...(m.id === 'focus-mode' && continuity.isRecent && !designMode ? {
                            borderRadius: `${design.radius}px`,
                            boxShadow:    `0 0 0 1px ${tokens.accent}14, 0 0 48px 2px ${tokens.accent}08`,
                          } : {}),
                        }}
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

      {/* ── Floating toolbar — only in design mode ───────────── */}
      {designMode && (
        <DesignToolbar
          tokens={tokens}
          designMode={designMode}
          presets={presets}
          onOpenAdd={() => setAddPanelOpen(true)}
          onApplyPreset={applyLayoutPreset}
          onReset={reset}
          onOpenTheme={() => openInspectorAtTab('theme')}
        />
      )}

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
        onOpenCreateTool={() => { setAddPanelOpen(false); setCreateToolOpen(true); }}
        onClose={() => setAddPanelOpen(false)}
      />

      {/* ── Create Tool modal ─────────────────────────────────── */}
      {createToolOpen && (
        <CreateToolModal
          tokens={tokens}
          onCreate={spec => {
            const id = customTools.addTool(spec);
            setCreateToolOpen(false);
            // Place new tool on canvas with a free position
            const { x, y } = blockPos.nextFreePos(blockPos.positions);
            blockPos.initPos(id, { x, y, w: 340 });
            // Auto-switch to freeform mode so user sees it placed
            if (canvasMode.mode !== 'freeform') canvasMode.setMode('freeform');
            setSelectedId(id);
            toast.success(`Tool "${spec.name}" created`, {
              icon: spec.emoji,
              style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
            });
          }}
          onClose={() => setCreateToolOpen(false)}
        />
      )}

      {/* ── Quick-add FAB ─────────────────────────────────────── */}
      <QuickAddFab
        tokens={tokens}
        panelOpen={addPanelOpen}
        onAddBlock={handleAddBlock}
        onOpenModules={() => setAddPanelOpen(o => !o)}
      />

    </div>
  );
}

