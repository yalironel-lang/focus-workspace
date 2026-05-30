import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FolderPlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { useSections } from '../../hooks/useSections';
import { useDeadlines } from '../../hooks/useDeadlines';
import { useAtmosphere } from '../../hooks/useAtmosphere';
import { useCommandPalette } from '../../command/CommandPaletteContext';
import { useWorkspaceTheme, mergeAccent } from '../../hooks/useWorkspaceTheme';
import { WorkspaceAppearancePanel } from '../workspace-appearance/WorkspaceAppearancePanel';
import { useWorkspaceFolders } from '../../hooks/useWorkspaceFolders';
import { useRecentWorkspaces } from '../../hooks/useRecentWorkspaces';
import { getWorkspaceCustomization } from '../../hooks/useWorkspaceCustomization';
import type { WorkspaceNavigationState } from '../../lib/workspaceUniverse/types';
import { isAdvancedLibraryNavUnlocked, isFirstWorkspaceEntryPending } from '../../lib/firstSessionPrefs';
import { resolveLibraryHomeTone } from '../../lib/libraryHomeAtmosphere';
import type { SectionWithProgress } from '../../types';
import { useLibrarySidebar } from '../../hooks/useLibrarySidebar';
import { LibrarySidebar, LibraryMobileMenuButton } from './LibrarySidebar';
import { LibrarySpatialProvider, spatialParallaxOffset, useLibrarySpatial } from './spatial/LibrarySpatialContext';
import { LibrarySpatialAtmosphere } from './spatial/LibrarySpatialAtmosphere';
import { SPATIAL_LIBRARY_KEYFRAMES } from './spatial/librarySpatialKeyframes';
import { SpatialLibraryCard } from './spatial/SpatialLibraryCard';
import './libraryLayout.css';
import { HomeGuideCompanion, HomeGuideTrigger } from './HomeGuideCompanion';
import { InstallAppBanner } from '../install/InstallAppBanner';
import { LIBRARY_OPEN_CREATE_FLAG } from '../../command/constants';
import { EXPLORE_FOCUS_SECTION_TITLE, exploreFocusNavState } from '../../lib/exploreFocus';
import { ExploreFocusCTA } from './ExploreFocusCTA';
import { MissionControlEnvironment } from '../mission-control/MissionControlEnvironment';
import { ContinuationSurface } from '../mission-control/ContinuationSurface';
import { NearbyWorldOrb } from '../mission-control/NearbyWorldOrb';
import { DashboardRecentlyDeletedModal } from '../recovery/DashboardRecentlyDeletedModal';
import '../mission-control/missionControl.css';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function accentForTitle(title: string): string {
  return ACCENT_POOL[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_POOL.length];
}
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function DeleteWorkspaceDialog({
  section,
  tokens,
  deleting,
  onCancel,
  onConfirm,
}: {
  section: SectionWithProgress | null;
  tokens: ReturnType<typeof mergeAccent>;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    setConfirmation('');
  }, [section?.id]);

  if (!section) return null;
  const canDelete = confirmation === 'DELETE' && !deleting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-delete-workspace-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.58)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <div style={{
        width: 'min(460px, 100%)',
        borderRadius: 22,
        border: '1px solid rgba(251,113,133,0.28)',
        background: 'linear-gradient(180deg, rgba(10,15,27,0.98), rgba(4,6,12,0.98))',
        boxShadow: '0 30px 100px rgba(0,0,0,0.66), inset 0 1px 0 rgba(255,255,255,0.08)',
        padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 14, background: 'rgba(251,113,133,0.12)', color: '#fb7185', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trash2 style={{ width: 16, height: 16 }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 id="library-delete-workspace-title" style={{ margin: 0, color: tokens.textPrimary, fontSize: 18, fontWeight: 850, letterSpacing: '-0.03em' }}>
              Delete {section.title}?
            </h2>
            <p style={{ margin: '8px 0 0', color: tokens.textSecondary, fontSize: 13, lineHeight: 1.55 }}>
              This permanently removes this workspace and its related local workspace data.
            </p>
          </div>
        </div>
        <label style={{ display: 'block', marginTop: 18 }}>
          <span style={{ display: 'block', color: tokens.textMuted, fontSize: 11, fontWeight: 750, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>
            Type DELETE to confirm
          </span>
          <input
            autoFocus
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onCancel();
              if (e.key === 'Enter' && canDelete) onConfirm();
            }}
            style={{
              width: '100%',
              height: 42,
              borderRadius: 12,
              border: `1px solid ${confirmation ? 'rgba(251,113,133,0.34)' : 'rgba(255,255,255,0.10)'}`,
              background: 'rgba(255,255,255,0.04)',
              color: tokens.textPrimary,
              outline: 'none',
              padding: '0 12px',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onCancel} disabled={deleting} style={{ minHeight: 42, padding: '0 15px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: tokens.textSecondary, fontSize: 13, fontWeight: 750, cursor: deleting ? 'default' : 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!canDelete} style={{ minHeight: 42, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(251,113,133,0.58)', background: canDelete ? '#e11d48' : 'rgba(127,29,29,0.32)', color: canDelete ? '#fff' : 'rgba(255,255,255,0.34)', fontSize: 13, fontWeight: 850, cursor: canDelete ? 'pointer' : 'not-allowed' }}>
            {deleting ? 'Deleting…' : 'Delete workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

function WorkspaceLibraryView() {
  const spatial = useLibrarySpatial();
  const sidebar = useLibrarySidebar();
  const navigate  = useNavigate();
  const { user, signOut } = useAuth();
  const { sections, loading, error, fetchSections, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
  const { recentIdsOrdered, openedAt } = useRecentWorkspaces();
  const { tokens: atmTokens, atmosphereId, setAtmosphere } = useAtmosphere();
  const { openPalette } = useCommandPalette();
  const { design, global, updateGlobal } = useWorkspaceTheme();
  const tokens = useMemo(() => mergeAccent(atmTokens, design), [atmTokens, design]);
  const homeTone = useMemo(() => resolveLibraryHomeTone(global, atmTokens), [global, atmTokens]);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const { folders, addFolder, removeFolder, setSectionFolder, getFolderForSection } = useWorkspaceFolders();
  const creatingRef = useRef(false);
  const allWorkspacesRef = useRef<HTMLDivElement>(null);

  const scrollToAllWorkspaces = useCallback(() => {
    const el = allWorkspacesRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const [search,          setSearch]          = useState('');
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [showNew,         setShowNew]         = useState(false);
  const [newTitle,        setNewTitle]        = useState('');
  const [creating,        setCreating]        = useState(false);
  const [filterFolder,    setFilterFolder]    = useState<string | 'all' | 'unfiled'>('all');
  const [folderDraft,     setFolderDraft]     = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [mounted,         setMounted]         = useState(false);
  const [deleteTarget,    setDeleteTarget]    = useState<SectionWithProgress | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [guideOpen,       setGuideOpen]       = useState(false);
  const [recentlyDeletedOpen, setRecentlyDeletedOpen] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const hasWorkspaces   = sections.length > 0;
  const showAdvancedNav = hasWorkspaces && isAdvancedLibraryNavUnlocked();
  const libraryReady    = !loading && !error;
  const sectionTitles = useMemo(
    () => Object.fromEntries(sections.map(s => [s.id, s.title])),
    [sections],
  );

  const displayName = useMemo(() => {
    if (!user?.email) return '';
    const local = user.email.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1).split(/[._-]/)[0];
  }, [user?.email]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sections;
    if (q) list = list.filter(s => s.title.toLowerCase().includes(q));
    if (filterFolder === 'unfiled')   list = list.filter(s => !getFolderForSection(s.id));
    else if (filterFolder !== 'all') list = list.filter(s => getFolderForSection(s.id) === filterFolder);
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [sections, search, filterFolder, getFolderForSection]);

  const grouped = useMemo(() => {
    if (filterFolder !== 'all') return null;
    const q = search.trim().toLowerCase();
    let base = sections;
    if (q) base = base.filter(s => s.title.toLowerCase().includes(q));
    const unfiled: SectionWithProgress[] = [];
    const byFolder = new Map<string, SectionWithProgress[]>();
    for (const f of folders) byFolder.set(f.id, []);
    for (const s of base) {
      const fid = getFolderForSection(s.id);
      if (!fid) unfiled.push(s);
      else { const arr = byFolder.get(fid); if (arr) arr.push(s); else unfiled.push(s); }
    }
    for (const arr of byFolder.values()) arr.sort((a, b) => a.title.localeCompare(b.title));
    unfiled.sort((a, b) => a.title.localeCompare(b.title));
    return { byFolder, unfiled };
  }, [sections, search, folders, filterFolder, getFolderForSection]);

  const continueWorkspace = useMemo(() => {
    if (!recentIdsOrdered.length) return null;
    return sections.find(s => s.id === recentIdsOrdered[0]) ?? null;
  }, [recentIdsOrdered, sections]);

  // Spatial scene ordering — recency first, then alphabetical
  const spatialOrder = useMemo(() => {
    const byRecency = recentIdsOrdered
      .map(id => sections.find(s => s.id === id))
      .filter((s): s is SectionWithProgress => s !== undefined);
    const rest = sections
      .filter(s => !recentIdsOrdered.includes(s.id))
      .sort((a, b) => a.title.localeCompare(b.title));
    return [...byRecency, ...rest];
  }, [sections, recentIdsOrdered]);

  // Mission Control entry stage — disabled until layout is stable in production.
  const showMcStage = false;
  // Restore 3-screen spatial carousel (regression fix: d4cfc20 disabled this).
  const showSpatialScene = hasWorkspaces && filterFolder === 'all' && !search && !loading;

  // ── Spatial navigation — which workspace occupies the primary slot ───────────
  const [primaryIdx, setPrimaryIdx] = useState(0);

  // Keep index valid when workspace list changes
  useEffect(() => {
    if (spatialOrder.length === 0) return;
    setPrimaryIdx(prev => Math.min(prev, spatialOrder.length - 1));
  }, [spatialOrder.length]);

  const spatialSlots = useMemo(() => {
    const len = spatialOrder.length;
    if (len === 0) return { s0: null, s1: null, s2: null, rail: [] as SectionWithProgress[] };
    const s0 = spatialOrder[primaryIdx] ?? null;
    const s1 = len > 1 ? spatialOrder[(primaryIdx - 1 + len) % len] : null;
    const s2 = len > 2 ? spatialOrder[(primaryIdx + 1) % len] : null;
    const staged = new Set([s0?.id, s1?.id, s2?.id].filter((id): id is string => Boolean(id)));
    return { s0, s1, s2, rail: spatialOrder.filter(s => !staged.has(s.id)) };
  }, [spatialOrder, primaryIdx]);

  const flankSections = useMemo(() => {
    if (!continueWorkspace) return spatialOrder.slice(0, 2);
    return spatialOrder.filter(s => s.id !== continueWorkspace.id).slice(0, 2);
  }, [spatialOrder, continueWorkspace]);

  const filterChips = useMemo(() => [
    { id: 'all' as const, label: 'All' },
    { id: 'unfiled' as const, label: 'Unfiled' },
    ...folders.map(f => ({ id: f.id, label: f.name })),
  ], [folders]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LIBRARY_OPEN_CREATE_FLAG) !== '1') return;
      sessionStorage.removeItem(LIBRARY_OPEN_CREATE_FLAG);
      setShowNew(true);
    } catch {
      /* ignore */
    }
  }, []);

  const handleExploreFocus = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const created = await createSection(EXPLORE_FOCUS_SECTION_TITLE);
      if (!created) {
        toast.error('Could not open Explore Focus');
        return;
      }
      toast.success('Entering Explore Focus…', {
        style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
      });
      const navState = exploreFocusNavState(isFirstWorkspaceEntryPending());
      navigate(`/section/${created.id}`, { state: navState });
    } catch {
      toast.error('Could not open Explore Focus');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || creatingRef.current) return;
    creatingRef.current = true; setCreating(true);
    try {
      const created = await createSection(newTitle.trim());
      if (!created) { toast.error('Could not create workspace'); return; }
      toast.success('Workspace created — opening…', {
        style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
      });
      setNewTitle(''); setShowNew(false);
      const navState: WorkspaceNavigationState | undefined = isFirstWorkspaceEntryPending()
        ? { firstArrival: true }
        : undefined;
      navigate(`/section/${created.id}`, navState ? { state: navState } : undefined);
    } catch { toast.error('Could not create workspace'); }
    finally { creatingRef.current = false; setCreating(false); }
  };

  const handleSignOut = async () => {
    try { await signOut(); toast.success('Signed out'); navigate('/'); }
    catch { toast.error('Failed to sign out'); }
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!deleteTarget) return;
    setDeletingWorkspace(true);
    try {
      await deleteSection(deleteTarget.id);
      toast.success('Workspace deleted');
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete workspace');
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const deadlinesFor = useCallback((id: string) => deadlines.filter(d => d.section_id === id), [deadlines]);

  // Asymmetric grid: first card wide (2fr), remainder fills normally
  const gridAtmospheric = showMcStage && filterFolder === 'all' && !search;

  const renderGrid = (list: SectionWithProgress[], baseDelay = 0) => {
    if (!list.length) return null;
    const [first, ...rest] = list;
    const asymmetric = !sidebar.isMobile && rest.length > 0;
    const minCard = sidebar.isMobile ? 'min(100%, 1fr)' : 'minmax(255px, 1fr)';
    const density = gridAtmospheric ? 'light' as const : 'full' as const;
    const cardProps = (s: SectionWithProgress, wide?: boolean) => ({
      section: s,
      deadlines: deadlinesFor(s.id),
      tokens,
      folders,
      folderId: getFolderForSection(s.id),
      onFolderChange: setSectionFolder,
      onDelete: setDeleteTarget,
      openedAt: openedAt(s.id) ?? undefined,
      atmosphericDensity: density,
      wide,
    });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: asymmetric ? '2fr 1fr' : '1fr', gap: 14 }}>
          <div style={{ animation: `libFadeUp 0.38s ${baseDelay}s ease both` }}>
            <SpatialLibraryCard {...cardProps(first, true)} />
          </div>
          {rest[0] && (
            <div style={{ animation: `libFadeUp 0.38s ${baseDelay + 0.05}s ease both` }}>
              <SpatialLibraryCard {...cardProps(rest[0])} />
            </div>
          )}
        </div>
        {rest.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, ${minCard})`, gap: 14 }}>
            {rest.slice(1).map((s, i) => (
              <div key={s.id} style={{ animation: `libFadeUp 0.36s ${baseDelay + 0.10 + i * 0.04}s ease both` }}>
                <SpatialLibraryCard {...cardProps(s)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Environment accent — follows active primary workspace ──────────────────
  const activePrimary = showSpatialScene && spatialSlots.s0 ? spatialSlots.s0 : continueWorkspace;
  const sA = activePrimary
    ? (getWorkspaceCustomization(activePrimary.id).accent || accentForTitle(activePrimary.title))
    : tokens.accent;
  const sidebarParallax = spatialParallaxOffset(spatial, 0.12);

  return (
    <>
      <div
        className={`library-shell${showMcStage ? ' library-shell--mc-entry' : ''}`}
        data-sidebar-collapsed={sidebar.railCollapsed ? 'true' : 'false'}
        style={{
        minHeight: '100vh', display: 'flex',
        position: 'relative', overflow: 'hidden',
        backgroundColor: homeTone.shellBg,
        color: tokens.textPrimary,
        opacity: mounted ? 1 : 0,
        transition: 'opacity 300ms ease, background-color 1.6s cubic-bezier(0.22, 1, 0.36, 1)',
        ['--lib-sidebar-slot-w' as string]: `${sidebar.slotWidthPx}px`,
      }}>


        <LibrarySpatialAtmosphere accent={sA} featured={showMcStage && !!continueWorkspace} mcEntry={showMcStage} homeTone={homeTone} />
        <LibrarySidebar
          tokens={tokens}
          accent={sA}
          displayName={displayName}
          showAdvancedNav={showAdvancedNav}
          hasWorkspaces={hasWorkspaces}
          appearanceOpen={appearanceOpen}
          onOpenAppearance={() => setAppearanceOpen(true)}
          onOpenNotebookSearch={openPalette}
          onOpenRecentlyDeleted={() => setRecentlyDeletedOpen(true)}
          onSignOut={() => void handleSignOut()}
          spatial={spatial}
          sidebarParallax={sidebarParallax}
          railCollapsed={sidebar.railCollapsed}
          isMobile={sidebar.isMobile}
          isTablet={sidebar.isTablet}
          mobileOpen={sidebar.mobileOpen}
          onToggleCollapsed={sidebar.toggleCollapsed}
          onOpenMobile={sidebar.openMobile}
          onCloseMobile={sidebar.closeMobile}
        />

        {/* ═══════════════════════════════════════════════════════════════
            MAIN
        ═══════════════════════════════════════════════════════════════ */}
        <main className="library-main" style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ENVIRONMENT ENTRY */}
          <div
            className="library-page-pad"
            style={{
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 0,
          }}>

            {/* TOP BAR */}
            <div
              className="library-top-bar"
              style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: showMcStage ? 12 : 28, position: 'relative', zIndex: 2,
              animation: 'libFadeIn 0.5s 0.05s ease both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {sidebar.isMobile && (
                  <LibraryMobileMenuButton accent={sA} onOpen={sidebar.openMobile} />
                )}
                <span data-guide-home="greeting" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.24)' }}>
                  {getGreeting()}{displayName ? `, ${displayName}` : ''}
                </span>
                <HomeGuideTrigger onClick={() => setGuideOpen(true)} accent={sA} />
              </div>

              {/* Search */}
              <div
                className={`library-search-wrap${showMcStage ? ' library-search-wrap--ghost' : ''}`}
                style={showMcStage ? {
                  display: 'flex', alignItems: 'center', gap: 8,
                  height: 36, padding: '0 4px 0 0',
                  width: sidebar.isMobile ? '100%' : searchFocused ? 280 : 140,
                } : {
                display: 'flex', alignItems: 'center', gap: 8,
                height: 40, padding: '0 12px',
                borderRadius: 12,
                border: `1px solid ${searchFocused ? `${sA}55` : 'rgba(255,255,255,0.090)'}`,
                background: searchFocused ? 'rgba(12,16,28,0.92)' : 'rgba(8,12,22,0.78)',
                boxShadow: searchFocused
                  ? `0 0 0 3px ${sA}12, 0 8px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.10)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                width: sidebar.isMobile ? '100%' : searchFocused ? 310 : 152,
                transition: 'width 300ms cubic-bezier(0.22,1,0.36,1), border-color 180ms ease, box-shadow 180ms ease, background 180ms ease',
              }}>
                <Search style={{ width: 13, height: 13, flexShrink: 0, color: searchFocused ? sA : 'rgba(255,255,255,0.28)', transition: 'color 180ms ease' }} strokeWidth={2} />
                <input
                  type="search" value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={searchFocused ? 'Jump to a workspace…' : 'Search'}
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 12.5, color: tokens.textPrimary }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.28)', padding: 0, display: 'flex', alignItems: 'center' }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>
            </div>

            {/* EMPTY STATE HERO */}
            {!hasWorkspaces && libraryReady && !error && (
              <div style={{ position: 'relative', zIndex: 2, animation: 'libFadeUp 0.52s 0.12s ease both' }}>
                <p style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', margin: '0 0 14px' }}>
                  installable study OS · local-first
                </p>
                <h2
                  className="library-hero-title-empty"
                  style={{
                  fontWeight: 920, letterSpacing: '-0.072em',
                  color: tokens.textPrimary, margin: '0 0 16px', maxWidth: 560,
                }}>
                  Your study room<br />
                  <span style={{ background: `linear-gradient(100deg, ${sA}, rgba(255,255,255,0.82))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    on your computer
                  </span>
                </h2>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.36)', maxWidth: 480, lineHeight: 1.78, margin: '0 0 20px' }}>
                  Notes, sources, and recall live in one spatial room on this device. Start with
                  Explore Focus — the space teaches the system in about a minute.
                </p>
                <div style={{ marginBottom: 16, maxWidth: 560 }}>
                  <ExploreFocusCTA
                    tokens={tokens}
                    accent={sA}
                    disabled={creating}
                    dominant
                    onExplore={() => void handleExploreFocus()}
                  />
                </div>
                <button type="button" onClick={() => setShowNew(true)}
                  style={{
                    height: 44, padding: '0 22px', display: 'inline-flex', alignItems: 'center', gap: 7,
                    borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    marginBottom: 20,
                    transition: 'border-color 150ms ease, background 150ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${sA}44`; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                >
                  <Plus style={{ width: 15, height: 15 }} strokeWidth={2.5} />
                  Create your own workspace
                </button>
                <div style={{ maxWidth: 520, marginBottom: 18 }}>
                  <InstallAppBanner tokens={tokens} compact />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                position: 'relative', zIndex: 2,
                maxWidth: 480, borderRadius: 14, padding: '14px 18px', marginTop: 12,
                border: '1px solid rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                animation: 'libFadeIn 0.3s ease both',
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary, margin: 0 }}>Couldn't load workspaces</p>
                  <p style={{ fontSize: 11, color: tokens.textMuted, margin: '3px 0 0' }}>{error}</p>
                </div>
                <button type="button" onClick={() => void fetchSections()}
                  style={{ padding: '7px 14px', borderRadius: 9, background: sA, color: '#020508', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                  Retry
                </button>
              </div>
            )}

          </div>

          {/* ═══════════════════════════════════════════════════════════════
              MISSION CONTROL ENTRY — continuation monument + living worlds
          ═══════════════════════════════════════════════════════════════ */}
          {showMcStage && continueWorkspace && (
            <MissionControlEnvironment accent={sA} className="mc-environment--entry" interactive>
              <div className="library-page-pad" style={{ paddingTop: 4 }}>
                <div className="mc-stage">
                  <div className="mc-stage__hero">
                    <ContinuationSurface
                      title={continueWorkspace.title}
                      icon={getWorkspaceCustomization(continueWorkspace.id).icon}
                      openedAt={openedAt(continueWorkspace.id) ?? null}
                      accent={sA}
                      onResume={() => navigate(`/section/${continueWorkspace.id}`)}
                    />
                  </div>
                  {flankSections.length > 0 && (
                    <div className="mc-stage__flank">
                      <div className="mc-nearby-plinth">
                        <span className="mc-flank-label">Other workspaces</span>
                        {flankSections.map((s, i) => (
                          <NearbyWorldOrb
                            key={s.id}
                            section={s}
                            staggerIndex={i}
                            openedAt={openedAt(s.id) ?? undefined}
                            onOpen={() => navigate(`/section/${s.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {sections.length > 1 + flankSections.length && (
                    <button
                      type="button"
                      className="mc-view-all"
                      onClick={scrollToAllWorkspaces}
                    >
                      View all workspaces
                      <ArrowRight style={{ width: 14, height: 14, opacity: 0.7 }} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            </MissionControlEnvironment>
          )}

          {showMcStage && !continueWorkspace && hasWorkspaces && (
            <MissionControlEnvironment accent={sA} className="mc-environment--entry" interactive>
              <div className="library-page-pad" style={{ paddingTop: 8, paddingBottom: 48 }}>
                <div className="mc-stage">
                  <div className="mc-nearby-plinth">
                    {spatialOrder.slice(0, 3).map(s => (
                      <NearbyWorldOrb
                        key={s.id}
                        section={s}
                        openedAt={openedAt(s.id) ?? undefined}
                        onOpen={() => navigate(`/section/${s.id}`)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </MissionControlEnvironment>
          )}

          {hasWorkspaces && !showMcStage && (
            <div className="library-page-pad" style={{ paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
              <InstallAppBanner tokens={tokens} compact />
            </div>
          )}

          {/* COMMAND STRIP — filters always available when workspaces exist */}
          {hasWorkspaces && (
            <div
              className="library-command-strip library-page-pad"
              style={{
              paddingTop: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              flexShrink: 0,
              animation: 'libFadeIn 0.4s 0.20s ease both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                {filterChips.map(chip => {
                  const active   = filterFolder === chip.id;
                  const isFolder = chip.id !== 'all' && chip.id !== 'unfiled';
                  return (
                    <div key={chip.id} style={{ display: 'flex', alignItems: 'center' }}>
                      <button type="button" onClick={() => setFilterFolder(chip.id)}
                        style={{
                          height: 26, padding: '0 10px',
                          borderRadius: isFolder ? '7px 0 0 7px' : 7,
                          borderTop: `1px solid ${active ? `${sA}42` : 'rgba(255,255,255,0.065)'}`,
                          borderBottom: `1px solid ${active ? `${sA}42` : 'rgba(255,255,255,0.065)'}`,
                          borderLeft: `1px solid ${active ? `${sA}42` : 'rgba(255,255,255,0.065)'}`,
                          borderRight: isFolder ? 'none' : `1px solid ${active ? `${sA}42` : 'rgba(255,255,255,0.065)'}`,
                          background: active ? `${sA}16` : 'rgba(255,255,255,0.020)',
                          color: active ? sA : 'rgba(255,255,255,0.38)',
                          fontSize: 10.5, fontWeight: active ? 750 : 500,
                          cursor: 'pointer', transition: 'all 150ms ease',
                        }}
                      >{chip.label}</button>
                      {isFolder && (
                        <button type="button" title={`Remove "${chip.label}"`}
                          onClick={() => { if (confirm(`Remove folder "${chip.label}"?`)) removeFolder(chip.id as string); }}
                          style={{
                            height: 26, width: 20, borderRadius: '0 7px 7px 0',
                            border: `1px solid ${active ? `${sA}42` : 'rgba(255,255,255,0.065)'}`,
                            background: 'rgba(255,255,255,0.020)',
                            color: 'rgba(255,255,255,0.18)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 150ms ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#fb7185'; e.currentTarget.style.background = 'rgba(251,113,133,0.10)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.18)'; e.currentTarget.style.background = 'rgba(255,255,255,0.020)'; }}
                        >
                          <X style={{ width: 8, height: 8 }} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {showFolderInput ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="text" value={folderDraft} onChange={e => setFolderDraft(e.target.value)} placeholder="Folder name…" autoFocus
                      style={{ height: 26, padding: '0 9px', borderRadius: 7, fontSize: 10.5, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.036)', color: tokens.textPrimary, outline: 'none', width: 118 }}
                      onKeyDown={e => { if (e.key === 'Enter') { addFolder(folderDraft); setFolderDraft(''); setShowFolderInput(false); } if (e.key === 'Escape') { setShowFolderInput(false); setFolderDraft(''); } }}
                      onFocus={e => { e.currentTarget.style.borderColor = `${sA}42`; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; }}
                    />
                    <button type="button" onClick={() => { addFolder(folderDraft); setFolderDraft(''); setShowFolderInput(false); }}
                      style={{ height: 26, padding: '0 9px', borderRadius: 7, border: 'none', background: sA, color: '#020508', fontSize: 10.5, fontWeight: 750, cursor: 'pointer' }}>Add</button>
                    <button type="button" onClick={() => { setShowFolderInput(false); setFolderDraft(''); }}
                      style={{ height: 26, width: 26, borderRadius: 7, border: '1px solid rgba(255,255,255,0.065)', background: 'transparent', color: 'rgba(255,255,255,0.26)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X style={{ width: 10, height: 10 }} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowFolderInput(true)}
                    style={{ height: 26, padding: '0 9px', borderRadius: 7, border: '1px dashed rgba(255,255,255,0.09)', background: 'transparent', color: 'rgba(255,255,255,0.20)', fontSize: 10.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 150ms ease' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${sA}38`; e.currentTarget.style.color = sA; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(255,255,255,0.20)'; }}
                  >
                    <FolderPlus style={{ width: 10, height: 10 }} strokeWidth={2} />
                    New folder
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.16)' }}>{filteredSections.length} / {sections.length}</span>
                <button
                  type="button"
                  onClick={() => void handleExploreFocus()}
                  disabled={creating}
                  style={{
                    height: 28, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5,
                    borderRadius: 8, border: `1px solid ${sA}38`, background: `${sA}12`,
                    color: tokens.textPrimary, fontSize: 11, fontWeight: 700, cursor: creating ? 'wait' : 'pointer',
                  }}
                >
                  <ArrowRight style={{ width: 12, height: 12 }} strokeWidth={2} />
                  Explore Focus
                </button>
                <button type="button" onClick={() => { setShowNew(s => !s); setNewTitle(''); }}
                  style={{
                    height: 28, padding: '0 13px', display: 'flex', alignItems: 'center', gap: 5,
                    borderRadius: 8, border: `1px solid ${sA}42`, background: `${sA}14`, color: sA,
                    fontSize: 11.5, fontWeight: 760, cursor: 'pointer', transition: 'all 150ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${sA}26`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${sA}14`; }}
                >
                  <Plus style={{ width: 12, height: 12 }} strokeWidth={2.5} />
                  New workspace
                </button>
              </div>
            </div>
          )}

          {/* Create form */}
          {showNew && (
            <div className="library-page-pad" style={{ paddingTop: 10, flexShrink: 0 }}>
              <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 520, animation: 'libFadeUp 0.22s ease both' }}>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Name your workspace…" autoFocus
                  style={{ flex: 1, minWidth: 200, height: 38, padding: '0 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.038)', color: tokens.textPrimary, fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms ease' }}
                  onFocus={e => { e.currentTarget.style.borderColor = `${sA}48`; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; }}
                />
                <button type="submit" disabled={creating || !newTitle.trim()}
                  style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: sA, color: '#020508', fontSize: 12.5, fontWeight: 820, cursor: newTitle.trim() ? 'pointer' : 'default', opacity: !newTitle.trim() ? 0.44 : 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 150ms ease' }}>
                  {creating ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : 'Create'}
                </button>
                <button type="button" onClick={() => setShowNew(false)}
                  style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.26)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </form>
            </div>
          )}

          {/* Legacy spatial carousel — disabled; grid fallback when filtering/searching */}
          {showSpatialScene && (() => {
            const { s0, s1, s2, rail } = spatialSlots;
            const spatialLen = spatialOrder.length;
            return (
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  maskImage: 'linear-gradient(180deg, black 0%, black 88%, transparent 100%)',
                }}
              >
                {/* 3-screen perspective stage */}
                <div
                  className="library-spatial-scene library-page-pad"
                  style={{ animation: 'libFadeIn 0.5s 0.15s ease both' }}
                >
                  {/* Ghost camera-shift nav — left */}
                  {spatialLen > 1 && (
                    <button
                      type="button"
                      className="library-spatial-nav-btn library-spatial-nav-btn--left"
                      onClick={() => setPrimaryIdx(i => (i - 1 + spatialLen) % spatialLen)}
                      aria-label="Previous workspace"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}

                  {/* Secondary left */}
                  <div key={s1?.id ?? 'left'} className="library-screen-secondary-left" style={{ animation: 'libFadeIn 0.28s ease both' }}>
                    {s1 ? (
                      <SpatialLibraryCard
                        section={s1}
                        deadlines={deadlinesFor(s1.id)}
                        tokens={tokens}
                        folders={folders}
                        folderId={getFolderForSection(s1.id)}
                        onFolderChange={setSectionFolder}
                        onDelete={setDeleteTarget}
                        openedAt={openedAt(s1.id) ?? undefined}
                        spatialVariant="secondary"
                      />
                    ) : (
                      <button
                        type="button"
                        className="library-screen-slot-empty"
                        onClick={() => setShowNew(true)}
                        aria-label="Add workspace"
                      >
                        <Plus style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.18)' }} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>

                  {/* Primary — centre */}
                  <div key={s0?.id ?? 'primary'} className="library-screen-primary">
                    <div style={{ width: '100%', height: '100%', animation: 'libFadeUp 0.42s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
                      {s0 ? (
                        <SpatialLibraryCard
                          section={s0}
                          deadlines={deadlinesFor(s0.id)}
                          tokens={tokens}
                          folders={folders}
                          folderId={getFolderForSection(s0.id)}
                          onFolderChange={setSectionFolder}
                          onDelete={setDeleteTarget}
                          openedAt={openedAt(s0.id) ?? undefined}
                          spatialVariant="primary"
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Secondary right */}
                  <div key={s2?.id ?? 'right'} className="library-screen-secondary-right" style={{ animation: 'libFadeIn 0.28s ease both' }}>
                    {s2 ? (
                      <SpatialLibraryCard
                        section={s2}
                        deadlines={deadlinesFor(s2.id)}
                        tokens={tokens}
                        folders={folders}
                        folderId={getFolderForSection(s2.id)}
                        onFolderChange={setSectionFolder}
                        onDelete={setDeleteTarget}
                        openedAt={openedAt(s2.id) ?? undefined}
                        spatialVariant="secondary"
                      />
                    ) : (
                      <button
                        type="button"
                        className="library-screen-slot-empty"
                        onClick={() => setShowNew(true)}
                        aria-label="Add workspace"
                      >
                        <Plus style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.18)' }} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>

                  {/* Ghost camera-shift nav — right */}
                  {spatialLen > 1 && (
                    <button
                      type="button"
                      className="library-spatial-nav-btn library-spatial-nav-btn--right"
                      onClick={() => setPrimaryIdx(i => (i + 1) % spatialLen)}
                      aria-label="Next workspace"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Workspace rail — sections beyond the 3-screen stage */}
                {rail.length > 0 && (
                  <div className="library-workspace-rail library-page-pad" style={{ paddingTop: 18, paddingBottom: 80 }}>
                    <div className="library-workspace-rail-divider">
                      <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)', whiteSpace: 'nowrap' }}>
                        More workspaces
                      </span>
                    </div>
                    {renderGrid(rail)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* WORKSPACE GRID — full library (always below MC entry preview) */}
          {hasWorkspaces && !showSpatialScene && (
            <div
              ref={allWorkspacesRef}
              id="library-all-workspaces"
              className={`library-page-pad${showMcStage ? ' library-grid--mc-entry' : ''}`}
              style={{
              flex: 1, overflowY: 'auto', overflowX: 'hidden',
              paddingTop: showMcStage ? 28 : 18,
              paddingBottom: 80,
              position: 'relative',
              maskImage: showMcStage ? 'none' : 'linear-gradient(180deg, black 0%, black 90%, transparent 100%)',
            }}>
              {hasWorkspaces && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: -24, height: 200,
                  pointerEvents: 'none', zIndex: 0,
                  background: `linear-gradient(180deg, ${sA}14 0%, ${sA}06 42%, transparent 100%)`,
                  opacity: 0.85,
                }} />
              )}
              <div data-guide-home="workspace-grid" style={{ position: 'relative', zIndex: 1 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
                  <Loader2 style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.16)', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <>
                  {hasWorkspaces && (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <h2 style={{ fontSize: 9, fontWeight: 920, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', margin: 0 }}>
                          {showMcStage && filterFolder === 'all' && !search
                            ? 'All workspaces'
                            : filterFolder === 'all'
                              ? 'Your workspaces'
                              : filterFolder === 'unfiled'
                                ? 'Unfiled'
                                : (folders.find(f => f.id === filterFolder)?.name ?? 'Workspaces')}
                        </h2>
                      </div>

                      {filterFolder === 'all' && grouped ? (
                        <>
                          {folders.map(folder => {
                            const list = grouped.byFolder.get(folder.id) ?? [];
                            if (!list.length) return null;
                            return (
                              <div key={folder.id} style={{ marginBottom: 34 }}>
                                <h3 style={{ fontSize: 10, fontWeight: 680, color: 'rgba(255,255,255,0.24)', marginBottom: 13, marginTop: 0, letterSpacing: '0.04em' }}>{folder.name}</h3>
                                {renderGrid(list)}
                              </div>
                            );
                          })}
                          {grouped.unfiled.length > 0 && (
                            <div style={{ marginBottom: 34 }}>
                              {folders.length > 0 && <h3 style={{ fontSize: 10, fontWeight: 680, color: 'rgba(255,255,255,0.24)', marginBottom: 13, marginTop: 0, letterSpacing: '0.04em' }}>Unfiled</h3>}
                              {renderGrid(grouped.unfiled)}
                            </div>
                          )}
                        </>
                      ) : (
                        renderGrid(filteredSections)
                      )}

                      {!loading && !filteredSections.length && sections.length > 0 && (
                        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.20)', marginTop: 20 }}>No workspaces match this filter.</p>
                      )}
                    </>
                  )}
                </>
              )}
              </div>
            </div>
          )}
        </main>

        {hasWorkspaces && (
          <WorkspaceAppearancePanel open={appearanceOpen} scope="global" tokens={tokens} atmosphereId={atmosphereId} global={global} onClose={() => setAppearanceOpen(false)} onSetAtmosphere={setAtmosphere} onUpdateGlobal={updateGlobal} />
        )}
        <DeleteWorkspaceDialog
          section={deleteTarget}
          tokens={tokens}
          deleting={deletingWorkspace}
          onCancel={() => {
            if (!deletingWorkspace) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDeleteWorkspace}
        />

        {/* Home guide companion — amber figure + narrator bubble */}
        <HomeGuideCompanion
          isOpen={guideOpen}
          onClose={() => setGuideOpen(false)}
          accent={sA}
        />

        <DashboardRecentlyDeletedModal
          open={recentlyDeletedOpen}
          onClose={() => setRecentlyDeletedOpen(false)}
          tokens={tokens}
          sectionTitles={sectionTitles}
        />
      </div>
    </>
  );
}

export function WorkspaceLibrary() {
  return (
    <>
      <style>{SPATIAL_LIBRARY_KEYFRAMES}</style>
      <LibrarySpatialProvider>
        <WorkspaceLibraryView />
      </LibrarySpatialProvider>
    </>
  );
}
