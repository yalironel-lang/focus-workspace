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
import { useWorkspaceTheme, mergeAccent } from '../../hooks/useWorkspaceTheme';
import { WorkspaceAppearancePanel } from '../workspace-appearance/WorkspaceAppearancePanel';
import { useWorkspaceFolders } from '../../hooks/useWorkspaceFolders';
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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function baselineOpenLog(sectionId: string, target: string, label: string) {
  void sectionId; void target; void label;
}
function accentForTitle(title: string): string {
  return ACCENT_POOL[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_POOL.length];
}
function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
function workspaceKind(section: SectionWithProgress): string {
  return section.exam_date ? 'Course' : 'Workspace';
}
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── FLOATING GLASS BUBBLE ────────────────────────────────────────────────────
// Absolute-positioned context element that floats around the hero portal.
// These are NOT cards — they're ambient data surfacing from the workspace world.

interface FloatingGlassBubbleProps {
  label: string;
  value: string;
  accent: string;
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  left?: string | number;
  animName: 'libFloat1' | 'libFloat2' | 'libFloat3';
  animDuration: number;
  animDelay: number;
}

function FloatingGlassBubble({
  label, value, accent,
  top, right, bottom, left,
  animName, animDuration, animDelay,
}: FloatingGlassBubbleProps) {
  return (
    <div style={{
      position: 'absolute',
      top, right, bottom, left,
      padding: '10px 15px',
      borderRadius: 16,
      background: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.032))',
      border: '1px solid rgba(255,255,255,0.135)',
      backdropFilter: 'blur(22px) saturate(1.7) brightness(1.07)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.7) brightness(1.07)',
      boxShadow: '0 12px 36px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.10)',
      pointerEvents: 'none',
      zIndex: 4,
      animation: `${animName} ${animDuration}s ${animDelay}s ease-in-out infinite`,
      overflow: 'hidden',
    }}>
      {/* Glass shimmer strip */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.12) 50%, transparent 62%)',
        animation: 'libGlassShimmer 6s ease-in-out infinite',
        animationDelay: `${animDelay + 1}s`,
      }} />
      <p style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: `${accent}bb`, margin: '0 0 3px' }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 780, color: 'rgba(255,255,255,0.88)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        {value}
      </p>
    </div>
  );
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
  const { tokens: atmTokens, atmosphereId, setAtmosphere } = useAtmosphere();
  const { design, global, updateGlobal } = useWorkspaceTheme();
  const tokens = useMemo(() => mergeAccent(atmTokens, design), [atmTokens, design]);
  const homeTone = useMemo(() => resolveLibraryHomeTone(global, atmTokens), [global, atmTokens]);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const { folders, addFolder, removeFolder, setSectionFolder, getFolderForSection } = useWorkspaceFolders();
  const creatingRef = useRef(false);

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

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t); }, []);

  const hasWorkspaces   = sections.length > 0;
  const showAdvancedNav = hasWorkspaces && isAdvancedLibraryNavUnlocked();
  const libraryReady    = !loading && !error;

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

  const resumeWorkspace = useMemo(() => {
    if (!sections.length) return null;
    return [...sections].sort((a, b) => (b.progress || 0) - (a.progress || 0))[0];
  }, [sections]);

  const filterChips = useMemo(() => [
    { id: 'all' as const, label: 'All' },
    { id: 'unfiled' as const, label: 'Unfiled' },
    ...folders.map(f => ({ id: f.id, label: f.name })),
  ], [folders]);

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
      const navState: WorkspaceNavigationState | undefined = isFirstWorkspaceEntryPending() ? { firstArrival: true } : undefined;
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
  const renderGrid = (list: SectionWithProgress[], baseDelay = 0) => {
    if (!list.length) return null;
    const [first, ...rest] = list;
    const asymmetric = !sidebar.isMobile && rest.length > 0;
    const minCard = sidebar.isMobile ? 'min(100%, 1fr)' : 'minmax(255px, 1fr)';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: asymmetric ? '2fr 1fr' : '1fr', gap: 14 }}>
          <div style={{ animation: `libFadeUp 0.38s ${baseDelay}s ease both` }}>
            <SpatialLibraryCard section={first} deadlines={deadlinesFor(first.id)} tokens={tokens} folders={folders} folderId={getFolderForSection(first.id)} onFolderChange={setSectionFolder} onDelete={setDeleteTarget} wide />
          </div>
          {rest[0] && (
            <div style={{ animation: `libFadeUp 0.38s ${baseDelay + 0.05}s ease both` }}>
              <SpatialLibraryCard section={rest[0]} deadlines={deadlinesFor(rest[0].id)} tokens={tokens} folders={folders} folderId={getFolderForSection(rest[0].id)} onFolderChange={setSectionFolder} onDelete={setDeleteTarget} />
            </div>
          )}
        </div>
        {rest.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, ${minCard})`, gap: 14 }}>
            {rest.slice(1).map((s, i) => (
              <div key={s.id} style={{ animation: `libFadeUp 0.36s ${baseDelay + 0.10 + i * 0.04}s ease both` }}>
                <SpatialLibraryCard section={s} deadlines={deadlinesFor(s.id)} tokens={tokens} folders={folders} folderId={getFolderForSection(s.id)} onFolderChange={setSectionFolder} onDelete={setDeleteTarget} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Stage accent (responds to featured workspace identity) ────────────────
  const sA = resumeWorkspace
    ? (getWorkspaceCustomization(resumeWorkspace.id).accent || accentForTitle(resumeWorkspace.title))
    : tokens.accent;
  const sCustom    = resumeWorkspace ? getWorkspaceCustomization(resumeWorkspace.id) : null;
  const sProgress  = resumeWorkspace?.progress ?? 0;
  const sTotal     = resumeWorkspace?.total_items ?? 0;
  const sCompleted = resumeWorkspace?.completed_items ?? 0;
  const sNearest   = resumeWorkspace ? deadlinesFor(resumeWorkspace.id).filter(d => !d.completed).sort((a, b) => a.due_date.localeCompare(b.due_date))[0] : undefined;
  const stagePath  = resumeWorkspace ? `/section/${resumeWorkspace.id}` : '#';
  const showLibraryContextBubbles = false;
  const coreWorkflow = ['Upload source/PDF', 'Write notes', 'Ask tutor', 'Start focus timer'];
  const heroParallax = spatialParallaxOffset(spatial, 0.55);
  const sidebarParallax = spatialParallaxOffset(spatial, 0.12);
  const spatialEase = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <>
      <div
        className="library-shell"
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


        <LibrarySpatialAtmosphere accent={sA} featured={!!resumeWorkspace && !search} homeTone={homeTone} />
        <LibrarySidebar
          tokens={tokens}
          accent={sA}
          displayName={displayName}
          showAdvancedNav={showAdvancedNav}
          hasWorkspaces={hasWorkspaces}
          appearanceOpen={appearanceOpen}
          onOpenAppearance={() => setAppearanceOpen(true)}
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

          {/* CINEMATIC HERO STAGE — min-height 58vh */}
          <div
            className="library-hero-stage library-page-pad"
            style={{
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            paddingBottom: 0,
          }}>

            {/* Stage-local nebula */}
            {/* Hero depth stack — featured workspace pedestal */}
            {resumeWorkspace && !search && (
              <>
                <div style={{
                  position: 'absolute', left: '-8%', top: '-18%',
                  width: '72%', height: '130%',
                  borderRadius: '50%',
                  background: `radial-gradient(ellipse 55% 50% at 38% 48%, ${sA}1e, transparent 66%)`,
                  pointerEvents: 'none', zIndex: 0,
                  animation: spatial.reducedMotion ? 'none' : `libBreath2 ${spatial.idle ? 26 : 20}s ease-in-out infinite`,
                  transition: 'background 1.6s cubic-bezier(0.22, 1, 0.36, 1)',
                }} />
                <div style={{
                  position: 'absolute', left: '8%', top: '18%',
                  width: 'min(52vw, 560px)', height: 'min(42vh, 380px)',
                  borderRadius: '50%',
                  background: `radial-gradient(ellipse at 42% 50%, ${sA}24, ${sA}08 45%, transparent 72%)`,
                  pointerEvents: 'none', zIndex: 0,
                  opacity: 0.85 + spatial.engagement * 0.15,
                  transition: 'opacity 1s ease, background 1.6s ease',
                }} />
              </>
            )}
            {/* Center-right void anchor */}
            {resumeWorkspace && !search && (
              <div style={{
                position: 'absolute', right: '-4%', top: '6%',
                width: 'min(48vw, 540px)', height: 'min(50vh, 440px)',
                pointerEvents: 'none', zIndex: 0,
                background: `
                  radial-gradient(ellipse 65% 58% at 55% 45%, rgba(99,102,241,0.11), transparent 70%),
                  radial-gradient(ellipse 45% 40% at 35% 60%, ${sA}0a, transparent 68%)
                `,
                opacity: 0.7 + spatial.engagement * 0.2,
              }} />
            )}

            {/* TOP BAR */}
            <div
              className="library-top-bar"
              style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 42, position: 'relative', zIndex: 2,
              animation: 'libFadeIn 0.5s 0.05s ease both',
            }}>
              {sidebar.isMobile && (
                <LibraryMobileMenuButton accent={sA} onOpen={sidebar.openMobile} />
              )}
              <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.20)' }}>
                {getGreeting()}{displayName ? `, ${displayName}` : ''} ·{' '}
                <span style={{ color: sA, transition: 'color 1.2s ease' }}>
                  {sections.length > 0 ? `${sections.length} study space${sections.length > 1 ? 's' : ''}` : 'calm study space'}
                </span>
              </span>

              {/* Search */}
              <div
                className="library-search-wrap"
                style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 40, padding: '0 12px',
                borderRadius: 12,
                border: `1px solid ${searchFocused ? `${sA}55` : 'rgba(255,255,255,0.090)'}`,
                background: searchFocused
                  ? 'rgba(255,255,255,0.07)'
                  : 'linear-gradient(145deg, rgba(255,255,255,0.048), rgba(255,255,255,0.022))',
                backdropFilter: 'blur(20px) saturate(1.5)', WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
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
                {search ? (
                  <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.28)', padding: 0, display: 'flex', alignItems: 'center' }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                ) : (
                  <span style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '2px 5px', color: 'rgba(255,255,255,0.18)', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', flexShrink: 0 }}>⌘K</span>
                )}
              </div>
            </div>

            {/* FEATURED WORKSPACE PORTAL */}
            {resumeWorkspace && !search && (
              <div
                onMouseEnter={() => spatial.setFocusRegion('hero')}
                onMouseLeave={() => spatial.setFocusRegion(null)}
                style={{
                position: 'relative', zIndex: 2, animation: 'libFadeUp 0.52s 0.10s ease both',
                transform: spatial.reducedMotion
                  ? undefined
                  : `translate3d(${heroParallax.x * 0.2}px, ${heroParallax.y * 0.14}px, 0)`,
                transition: spatial.reducedMotion ? undefined : spatialEase,
              }}>
                <div style={{
                  position: 'absolute', left: '-4%', top: '-8%', right: '12%', bottom: '-12%',
                  pointerEvents: 'none', zIndex: 0,
                  background: `radial-gradient(ellipse 70% 55% at 36% 52%, ${sA}18, transparent 68%)`,
                  opacity: 0.9,
                }} />
                <div className="library-hero-portal" style={{ display: 'flex', alignItems: 'flex-end', gap: 32, position: 'relative', zIndex: 1 }}>

                  {/* Orbit system */}
                  <div style={{ position: 'relative', flexShrink: 0, marginBottom: 6 }}>
                    <div style={{
                      position: 'absolute', inset: -28,
                      borderRadius: '50%',
                      border: `1px solid ${sA}0c`,
                      animation: spatial.reducedMotion ? 'none' : `libOrbit ${spatial.idle ? 48 : 36}s linear infinite`,
                      transition: 'border-color 1.6s ease',
                    }} />
                    <div style={{
                      position: 'absolute', inset: -16,
                      borderRadius: '50%',
                      border: `1px solid ${sA}06`,
                      animation: spatial.reducedMotion ? 'none' : `libOrbitRev ${spatial.idle ? 64 : 52}s linear infinite`,
                      transition: 'border-color 1.6s ease',
                    }} />
                    {/* Avatar */}
                    <div style={{
                      width: 80, height: 80, borderRadius: 24,
                      background: `radial-gradient(circle at 32% 24%, rgba(255,255,255,0.24), transparent 38%),
                                   linear-gradient(135deg, ${sA}54, ${sA}1c)`,
                      border: `1px solid ${sA}48`,
                      boxShadow: `0 0 0 1px ${sA}28, 0 20px 56px ${sA}32, inset 0 1px 0 rgba(255,255,255,0.16)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: spatial.reducedMotion ? 'none' : `libAvatarFloat ${spatial.idle ? 9 : 7}s ease-in-out infinite`,
                      transition: 'background 1.2s ease, border-color 1.2s ease, box-shadow 1.2s ease',
                    }}>
                      {sCustom?.icon
                        ? <span style={{ fontSize: 28, lineHeight: 1 }} role="img" aria-hidden>{sCustom.icon}</span>
                        : <span style={{ fontSize: 18, fontWeight: 900, color: sA, transition: 'color 1.2s ease' }}>{initials(resumeWorkspace.title)}</span>
                      }
                    </div>
                  </div>

                  {/* Title + context + CTA */}
                  <div style={{ paddingBottom: 4, maxWidth: 580 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                        background: sA, animation: 'libPulse 3s ease-in-out infinite',
                        boxShadow: `0 0 8px ${sA}cc`,
                        transition: 'background 1.2s ease, box-shadow 1.2s ease',
                      }} />
                      <span style={{ fontSize: 9, fontWeight: 920, letterSpacing: '0.28em', textTransform: 'uppercase', color: sA, transition: 'color 1.2s ease' }}>
                        continue studying
                      </span>
                    </div>

                    <h2
                      className="library-hero-title"
                      style={{
                      fontWeight: 920,
                      letterSpacing: '-0.074em',
                      color: tokens.textPrimary,
                      margin: '0 0 20px',
                      textShadow: `0 0 48px ${sA}30, 0 2px 24px rgba(0,0,0,0.45)`,
                      transition: 'text-shadow 1.6s ease',
                    }}>
                      {resumeWorkspace.title}
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
                        {workspaceKind(resumeWorkspace)}
                      </span>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: sA, transition: 'color 1.2s ease' }}>
                        {Math.round(sProgress)}% complete
                      </span>
                      {sTotal > 0 && <>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.40)' }}>
                          {sTotal - sCompleted} task{sTotal - sCompleted !== 1 ? 's' : ''} remaining
                        </span>
                      </>}
                      {sNearest && <>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fb7185' }}>Due {sNearest.due_date}</span>
                      </>}
                    </div>

                    <a
                      href={stagePath}
                      onClick={() => baselineOpenLog(resumeWorkspace.id, stagePath, 'stage-enter')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 9,
                        height: 48, padding: '0 24px', borderRadius: 15,
                        background: sA, color: '#020508',
                        fontSize: 14, fontWeight: 860, letterSpacing: '-0.01em',
                        textDecoration: 'none',
                        boxShadow: `0 8px 32px ${sA}4c, inset 0 1px 0 rgba(255,255,255,0.22)`,
                        transition: 'transform 150ms ease, filter 150ms ease, background 1.2s ease, box-shadow 1.2s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.filter = 'brightness(1.09)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.filter = 'none'; }}
                    >
                      Enter workspace
                      <ArrowRight style={{ width: 17, height: 17 }} strokeWidth={2.5} />
                    </a>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                      {coreWorkflow.map(action => (
                        <span key={action} style={{
                          border: '1px solid rgba(255,255,255,0.085)',
                          background: 'rgba(255,255,255,0.034)',
                          borderRadius: 999,
                          padding: '7px 10px',
                          color: 'rgba(255,255,255,0.58)',
                          fontSize: 11,
                          fontWeight: 700,
                        }}>
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Secondary context stays hidden by default; users can discover details inside a workspace. */}
                {showLibraryContextBubbles && resumeWorkspace.next_item_title && (
                  <FloatingGlassBubble
                    label="Next task"
                    value={resumeWorkspace.next_item_title.length > 28
                      ? resumeWorkspace.next_item_title.slice(0, 28) + '…'
                      : resumeWorkspace.next_item_title}
                    accent={sA}
                    top="6%" right="4%"
                    animName="libFloat1" animDuration={8} animDelay={0.3}
                  />
                )}
                {showLibraryContextBubbles && sTotal > 0 && (
                  <FloatingGlassBubble
                    label="Progress"
                    value={`${sCompleted} / ${sTotal} complete`}
                    accent={sA}
                    top={resumeWorkspace.next_item_title ? '38%' : '14%'} right="8%"
                    animName="libFloat2" animDuration={10} animDelay={1.2}
                  />
                )}
                {showLibraryContextBubbles && sNearest && (
                  <FloatingGlassBubble
                    label="Due"
                    value={sNearest.due_date}
                    accent="#fb7185"
                    top="64%" right="3%"
                    animName="libFloat3" animDuration={7} animDelay={0.6}
                  />
                )}
              </div>
            )}

            {/* EMPTY STATE HERO */}
            {!hasWorkspaces && libraryReady && !error && (
              <div style={{ position: 'relative', zIndex: 2, animation: 'libFadeUp 0.52s 0.12s ease both' }}>
                <p style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', margin: '0 0 14px' }}>
                  workspace OS · ready
                </p>
                <h2
                  className="library-hero-title-empty"
                  style={{
                  fontWeight: 920, letterSpacing: '-0.072em',
                  color: tokens.textPrimary, margin: '0 0 16px', maxWidth: 560,
                }}>
                  Your thinking<br />
                  <span style={{ background: `linear-gradient(100deg, ${sA}, rgba(255,255,255,0.82))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    universe
                  </span>
                </h2>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.36)', maxWidth: 440, lineHeight: 1.78, margin: '0 0 28px' }}>
                  Create a workspace for any course, project, or focus area.
                  Each gets a structured work surface and a spatial Free Space.
                </p>
                <button type="button" onClick={() => setShowNew(true)}
                  style={{
                    height: 48, padding: '0 26px', display: 'inline-flex', alignItems: 'center', gap: 7,
                    borderRadius: 15, border: 'none', background: sA, color: '#020508',
                    fontSize: 14, fontWeight: 860, cursor: 'pointer',
                    boxShadow: `0 8px 32px ${sA}48, inset 0 1px 0 rgba(255,255,255,0.20)`,
                    transition: 'transform 150ms ease, filter 150ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.filter = 'brightness(1.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.filter = 'none'; }}
                >
                  <Plus style={{ width: 16, height: 16 }} strokeWidth={2.5} />
                  Create your first workspace
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 22, maxWidth: 440 }}>
                  {coreWorkflow.map(action => (
                    <div key={action} style={{
                      border: '1px solid rgba(255,255,255,0.085)',
                      background: 'rgba(255,255,255,0.035)',
                      borderRadius: 12,
                      padding: '10px 12px',
                      color: 'rgba(255,255,255,0.72)',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                    }}>
                      {action}
                    </div>
                  ))}
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

            {/* Horizon separator */}
            {hasWorkspaces && (
              <div style={{
                position: 'relative', zIndex: 2,
                marginTop: 'auto', paddingTop: 36, paddingBottom: 1,
              }}>
                <div style={{
                  height: 1,
                  background: `linear-gradient(90deg, transparent, ${sA}38 16%, rgba(255,255,255,0.08) 50%, ${sA}28 84%, transparent)`,
                  boxShadow: `0 0 32px ${sA}18`,
                  transition: 'background 1.6s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 1.6s ease',
                }} />
              </div>
            )}
          </div>

          {/* COMMAND STRIP */}
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
                          border: `1px solid ${active ? `${sA}42` : 'rgba(255,255,255,0.065)'}`,
                          borderRight: isFolder ? 'none' : undefined,
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

          {/* WORKSPACE GRID — spatial object field */}
          <div
            className="library-page-pad"
            style={{
            flex: 1, overflowY: 'auto', paddingTop: 18, paddingBottom: 80, position: 'relative',
            maskImage: 'linear-gradient(180deg, black 0%, black 90%, transparent 100%)',
          }}>
            {hasWorkspaces && (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: -24, height: 200,
                pointerEvents: 'none', zIndex: 0,
                background: `linear-gradient(180deg, ${sA}14 0%, ${sA}06 42%, transparent 100%)`,
                opacity: 0.85,
              }} />
            )}
            <div style={{ position: 'relative', zIndex: 1 }}>
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
                        {filterFolder === 'all' ? 'Your workspaces' : filterFolder === 'unfiled' ? 'Unfiled' : (folders.find(f => f.id === filterFolder)?.name ?? 'Workspaces')}
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
