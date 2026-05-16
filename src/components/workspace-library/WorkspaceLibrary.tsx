import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  Calendar,
  ChevronRight,
  FolderPlus,
  LayoutDashboard,
  Loader2,
  LogOut,
  Play,
  Plus,
  Search,
  Palette,
  Sparkles,
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
import { useSessionContinuity } from '../../hooks/useSessionContinuity';
import { useWorkspaceFolders } from '../../hooks/useWorkspaceFolders';
import { useRecentWorkspaces } from '../../hooks/useRecentWorkspaces';
import { getWorkspaceCustomization } from '../../hooks/useWorkspaceCustomization';
import { UNIVERSE_ROUTE } from '../../lib/workspaceUniverse/types';
import type { WorkspaceNavigationState } from '../../lib/workspaceUniverse/types';
import { isAdvancedLibraryNavUnlocked, isFirstWorkspaceEntryPending } from '../../lib/firstSessionPrefs';
import { runLibraryStartupHealth } from '../../lib/persistenceHealth';
import { loadSession } from '../../utils/sessionPlan';
import type { SectionWithProgress } from '../../types';
import type { Deadline } from '../../types';
import { useCommandPalette } from '../../command/CommandPaletteContext';
import { LIBRARY_OPEN_CREATE_FLAG } from '../../command/constants';

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

function accentForTitle(title: string): string {
  return ACCENT_POOL[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_POOL.length];
}

function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function formatLastOpened(iso: string | null): string {
  if (!iso) return 'Not opened on this device yet';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 90_000) return 'Just now';
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return 'Recently';
    return `${h}h ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function workspaceKind(section: SectionWithProgress): string {
  if (section.exam_date) return 'Course';
  return 'Workspace';
}

function progressTone(progress: number, total: number): string {
  if (total === 0) return 'rgba(148,163,184,0.35)';
  if (progress >= 100) return 'rgba(52,211,153,0.55)';
  if (progress >= 50) return 'rgba(96,165,250,0.55)';
  return 'rgba(251,191,36,0.45)';
}

interface LibraryCardProps {
  section: SectionWithProgress;
  deadlines: Deadline[];
  tokens: ReturnType<typeof mergeAccent>;
  lastOpened: string | null;
  folders: { id: string; name: string }[];
  folderId: string | null;
  onFolderChange: (sectionId: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
  onOpen: () => void;
}

function LibraryCard({
  section,
  deadlines,
  tokens,
  lastOpened,
  folders,
  folderId,
  onFolderChange,
  onDelete,
  onOpen,
}: LibraryCardProps) {
  const custom = getWorkspaceCustomization(section.id);
  const accent = custom.accent || accentForTitle(section.title);
  const kind = workspaceKind(section);
  const warmth = progressTone(section.progress, section.total_items);

  const nearest = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col text-left rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
      style={{
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: `1px solid ${tokens.cardBorder}`,
        boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 40px rgba(0,0,0,0.25)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.backgroundColor = 'rgba(255,255,255,0.045)';
        el.style.borderColor = `${tokens.accent}28`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.backgroundColor = 'rgba(255,255,255,0.03)';
        el.style.borderColor = tokens.cardBorder;
      }}
    >
      <div style={{ height: '2px', background: `linear-gradient(90deg, ${accent}88, transparent)`, opacity: 0.85 }} />

      <div className="p-5 flex flex-col gap-3 flex-1 min-h-[132px]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}22` }}
            >
              {custom.icon ? (
                <span className="text-lg leading-none" role="img" aria-hidden>
                  {custom.icon}
                </span>
              ) : (
                <span className="font-semibold text-xs" style={{ color: accent }}>
                  {initials(section.title)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-[15px] leading-snug truncate" style={{ color: tokens.textPrimary }}>
                {section.title}
              </h3>
              <p className="text-[11px] mt-0.5 font-medium tracking-wide" style={{ color: tokens.textMuted }}>
                {kind}
                <span style={{ color: tokens.textGhost }}> · </span>
                {formatLastOpened(lastOpened)}
              </p>
            </div>
          </div>
          <button
            type="button"
            title="Remove workspace"
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-opacity flex-shrink-0"
            style={{ color: tokens.textGhost }}
            onClick={e => {
              e.stopPropagation();
              if (confirm('Remove this workspace? This cannot be undone.')) onDelete(section.id);
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
            }}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>

        {section.next_item_title && (
          <p className="text-[13px] leading-snug line-clamp-2" style={{ color: tokens.textSecondary }}>
            Next: {section.next_item_title}
          </p>
        )}

        {section.total_items > 0 && (
          <div className="mt-auto">
            <div className="rounded-full overflow-hidden" style={{ height: '3px', backgroundColor: tokens.wellBg }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${section.progress}%`, backgroundColor: warmth }}
              />
            </div>
            <p className="text-[10px] mt-1 font-medium" style={{ color: tokens.textGhost }}>
              {section.completed_items}/{section.total_items} complete
              {nearest ? ` · nearest due ${nearest.due_date}` : ''}
            </p>
          </div>
        )}

        <div
          className="flex items-center justify-between gap-2 pt-2 mt-1"
          style={{ borderTop: `1px solid ${tokens.cardBorder}` }}
        >
          <select
            aria-label="Collection"
            value={folderId ?? ''}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const v = e.target.value;
              onFolderChange(section.id, v === '' ? null : v);
            }}
            className="text-[11px] rounded-lg px-2 py-1 max-w-[140px] cursor-pointer"
            style={{
              backgroundColor: tokens.wellBg,
              border: `1px solid ${tokens.cardBorder}`,
              color: tokens.textMuted,
            }}
          >
            <option value="">Unfiled</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold"
            style={{ color: tokens.accent }}
          >
            Open
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceLibrary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { sections, loading, error, fetchSections, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
  const { tokens: atmTokens, atmosphereId, setAtmosphere } = useAtmosphere();
  const { design, global, updateGlobal } = useWorkspaceTheme();
  const tokens = mergeAccent(atmTokens, design);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const continuity = useSessionContinuity();
  // Destructure the stable callback so it can be used as a dep without
  // the whole object (which is a new reference every render → infinite loop).
  const { reloadFromStorage: reloadContinuityFromStorage } = continuity;
  const { folders, addFolder, removeFolder, setSectionFolder, getFolderForSection } = useWorkspaceFolders();
  const { recentIdsOrdered, openedAt, pruneToValidIds, reloadFromStorage: reloadRecentFromStorage } =
    useRecentWorkspaces();
  const autoOpenedCreateRef = useRef(false);
  const startupHealthRanRef = useRef(false);
  const { openSessionModal, openArrivalExperience } = useCommandPalette();

  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [filterFolder, setFilterFolder] = useState<string | 'all' | 'unfiled'>('all');

  const activeSession = loadSession();
  const sectionIdSet = useMemo(() => new Set(sections.map(s => s.id)), [sections]);
  const hasWorkspaces = sections.length > 0;
  const showAdvancedNav = hasWorkspaces && isAdvancedLibraryNavUnlocked();
  const libraryReady = !loading && !error;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LIBRARY_OPEN_CREATE_FLAG)) {
        sessionStorage.removeItem(LIBRARY_OPEN_CREATE_FLAG);
        setShowNew(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!libraryReady) return;
    const ids = sections.map(s => s.id);
    if (!startupHealthRanRef.current) {
      runLibraryStartupHealth(ids);
      startupHealthRanRef.current = true;
    }
    pruneToValidIds(ids);
    reloadContinuityFromStorage();
    reloadRecentFromStorage();
  }, [libraryReady, sections, pruneToValidIds, reloadContinuityFromStorage, reloadRecentFromStorage]);

  useEffect(() => {
    if (!libraryReady || hasWorkspaces || autoOpenedCreateRef.current) return;
    autoOpenedCreateRef.current = true;
    setShowNew(true);
  }, [hasWorkspaces, libraryReady]);

  const displayName = useMemo(() => {
    if (!user?.email) return '';
    const local = user.email.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1).split(/[._-]/)[0];
  }, [user?.email]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sections;
    if (q) list = list.filter(s => s.title.toLowerCase().includes(q));
    if (filterFolder === 'unfiled') {
      list = list.filter(s => !getFolderForSection(s.id));
    } else if (filterFolder !== 'all') {
      list = list.filter(s => getFolderForSection(s.id) === filterFolder);
    }
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [sections, search, filterFolder, getFolderForSection]);

  const recentSections = useMemo(() => {
    const byId = new Map(sections.map(s => [s.id, s]));
    return recentIdsOrdered.map(id => byId.get(id)).filter(Boolean) as SectionWithProgress[];
  }, [sections, recentIdsOrdered]);

  const continueCards = useMemo(() => {
    const cards: { key: string; title: string; sub: string; onClick: () => void; accent: string }[] = [];
    if (activeSession) {
      cards.push({
        key: 'session',
        title: 'Session in progress',
        sub: 'Return to your active focus session.',
        onClick: () => navigate('/session'),
        accent: tokens.accent,
      });
    }
    const last = continuity.lastSession;
    if (continuity.isRecent && last && sectionIdSet.has(last.sectionId)) {
      cards.push({
        key: 'last',
        title: last.sectionTitle,
        sub: 'Pick up where you left off.',
        onClick: () => navigate(`/section/${last.sectionId}`),
        accent: '#a78bfa',
      });
    }
    return cards;
  }, [activeSession, continuity.isRecent, continuity.lastSession, navigate, sectionIdSet, tokens.accent]);

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
      else {
        const arr = byFolder.get(fid);
        if (arr) arr.push(s);
        else unfiled.push(s);
      }
    }
    for (const arr of byFolder.values()) arr.sort((a, b) => a.title.localeCompare(b.title));
    unfiled.sort((a, b) => a.title.localeCompare(b.title));
    return { byFolder, unfiled };
  }, [sections, search, folders, filterFolder, getFolderForSection]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await createSection(newTitle.trim());
      if (!created) {
        toast.error('Could not create workspace');
        return;
      }
      toast.success('Workspace created — opening…', {
        style: { background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`, color: tokens.textPrimary },
      });
      setNewTitle('');
      setShowNew(false);
      const navState: WorkspaceNavigationState | undefined = isFirstWorkspaceEntryPending()
        ? { firstArrival: true }
        : undefined;
      navigate(`/section/${created.id}`, navState ? { state: navState } : undefined);
    } catch {
      toast.error('Could not create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
      navigate('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const deadlinesFor = useCallback(
    (id: string) => deadlines.filter(d => d.section_id === id),
    [deadlines],
  );

  const openSection = (id: string) => navigate(`/section/${id}`);

  return (
    <div
      className="min-h-screen flex relative overflow-x-hidden"
      style={{
        backgroundColor: tokens.pageBg,
        color: tokens.textPrimary,
      }}
    >
      {/* Atmospheric depth — subdued so library stays readable */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          opacity: 0.45 + (design.clarity.fogMul ?? 0.5) * 0.35,
          background: `
            radial-gradient(ellipse 80% 55% at 50% -10%, ${tokens.accent}0a, transparent 55%),
            radial-gradient(ellipse 60% 40% at 100% 100%, rgba(139,92,246,0.04), transparent 50%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(${tokens.textPrimary}22 1px, transparent 1px), linear-gradient(90deg, ${tokens.textPrimary}22 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Sidebar */}
      <aside
        className="relative z-10 flex flex-col w-[220px] shrink-0 border-r"
        style={{
          borderColor: tokens.cardBorder,
          backgroundColor: `${tokens.navBg}cc`,
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="px-4 py-5 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: tokens.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookOpenCheck className="w-4 h-4 text-black" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide" style={{ color: tokens.textGhost }}>
              Focus Workspace
            </div>
            <div className="text-xs font-medium truncate" style={{ color: tokens.textSecondary }}>
              {displayName || 'Library'}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
          {hasWorkspaces ? (
            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors mb-1"
              style={{ color: tokens.textSecondary, backgroundColor: appearanceOpen ? tokens.accentSubtle : 'transparent' }}
            >
              <Palette className="w-4 h-4" strokeWidth={2} style={{ color: tokens.accent }} />
              Scene
            </button>
          ) : (
            <p className="px-3 py-2 mb-1 text-[10px] leading-relaxed" style={{ color: tokens.textGhost }}>
              Create a workspace first — then customize living backgrounds inside it.
            </p>
          )}
          <LibraryNavLink
            tokens={tokens}
            active={location.pathname === '/dashboard'}
            icon={<BookOpenCheck className="w-4 h-4" strokeWidth={2} />}
            label="Library"
            to="/dashboard"
          />
          {showAdvancedNav && (
            <>
              <LibraryNavLink
                tokens={tokens}
                active={location.pathname === UNIVERSE_ROUTE}
                icon={<Sparkles className="w-4 h-4" strokeWidth={2} />}
                label="Universe"
                to={UNIVERSE_ROUTE}
              />
              <LibraryNavLink
                tokens={tokens}
                active={location.pathname === '/desk'}
                icon={<LayoutDashboard className="w-4 h-4" strokeWidth={2} />}
                label="Personal desk"
                to="/desk"
              />
              <LibraryNavLink
                tokens={tokens}
                active={location.pathname === '/schedule'}
                icon={<Calendar className="w-4 h-4" strokeWidth={2} />}
                label="Schedule"
                to="/schedule"
              />
              <LibraryNavLink
                tokens={tokens}
                active={location.pathname === '/session'}
                icon={<Play className="w-4 h-4" strokeWidth={2} />}
                label="Focus session"
                to="/session"
              />
            </>
          )}
        </nav>

        <div className="p-3 mt-auto" style={{ borderTop: `1px solid ${tokens.cardBorder}` }}>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
            style={{ color: tokens.textMuted }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.wellBg;
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
            }}
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header
          className="px-8 lg:px-12 pt-10 pb-6"
          style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-2" style={{ color: tokens.textGhost }}>
            Workspace library
          </p>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight mb-2" style={{ color: tokens.textPrimary }}>
            {hasWorkspaces ? 'Your spaces' : 'Welcome — let’s set up your first workspace'}
          </h1>
          {!hasWorkspaces && libraryReady && (
            <p className="text-sm mb-6 max-w-xl leading-relaxed" style={{ color: tokens.textMuted }}>
              A workspace is a course or project. You’ll get a work surface and a spatial Free Space for notes, files, and focus.
            </p>
          )}

          {error && (
            <div
              className="mb-6 max-w-xl rounded-2xl px-5 py-4 border flex flex-col sm:flex-row sm:items-center gap-3"
              style={{
                borderColor: 'rgba(239,68,68,0.35)',
                backgroundColor: 'rgba(239,68,68,0.08)',
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: tokens.textPrimary }}>
                  Couldn’t load workspaces
                </p>
                <p className="text-xs mt-1" style={{ color: tokens.textMuted }}>
                  {error}. Check your connection and try again.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchSections()}
                className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold"
                style={{ backgroundColor: tokens.accent, color: '#0a0a0b' }}
              >
                Retry
              </button>
            </div>
          )}

          {hasWorkspaces && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between max-w-4xl mb-6">
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-2.5 flex-1 min-w-0 max-w-xl"
              style={{
                backgroundColor: tokens.wellBg,
                border: `1px solid ${tokens.cardBorder}`,
                boxShadow: `0 0 0 1px ${tokens.accent}08 inset`,
              }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: tokens.textGhost }} strokeWidth={2} />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search workspaces…"
                className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                style={{ color: tokens.textPrimary }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => openArrivalExperience()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium shrink-0 transition-colors"
                style={{
                  borderColor: tokens.cardBorder,
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  color: tokens.textSecondary,
                }}
              >
                <Sparkles className="w-4 h-4" strokeWidth={2} />
                Arrival
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNew(s => !s);
                  setNewTitle('');
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold shrink-0 transition-transform active:scale-[0.99]"
                style={{ backgroundColor: tokens.accent, color: '#0a0a0b' }}
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                New workspace
              </button>
            </div>
          </div>
          )}

          {(showNew || (!hasWorkspaces && libraryReady && !error)) && (
            <form onSubmit={handleCreate} className="mt-2 flex flex-wrap gap-2 items-center max-w-xl animate-fade-in">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Name your workspace…"
                autoFocus
                className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  backgroundColor: tokens.cardBg,
                  border: `1px solid ${tokens.cardBorder}`,
                  color: tokens.textPrimary,
                }}
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ backgroundColor: tokens.accent, color: '#0a0a0b' }}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
              </button>
              {hasWorkspaces && (
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="p-2 rounded-xl"
                  style={{ color: tokens.textGhost }}
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>
          )}

          {!hasWorkspaces && libraryReady && !error && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold"
              style={{ backgroundColor: tokens.accent, color: '#0a0a0b' }}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Create your first workspace
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-8 lg:px-12 py-8 pb-16">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: tokens.textGhost }} />
            </div>
          ) : (
            <>
              {hasWorkspaces && continueCards.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: tokens.textGhost }}>
                    Continue working
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    {continueCards.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={c.onClick}
                        className="text-left rounded-2xl px-5 py-4 min-w-[200px] max-w-sm flex-1 transition-all border"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          borderColor: tokens.cardBorder,
                          borderLeftWidth: 3,
                          borderLeftColor: c.accent,
                        }}
                      >
                        <div className="text-sm font-semibold mb-1" style={{ color: tokens.textPrimary }}>
                          {c.title}
                        </div>
                        <div className="text-xs leading-relaxed" style={{ color: tokens.textMuted }}>
                          {c.sub}
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs font-semibold" style={{ color: c.accent }}>
                          Resume
                          <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </div>
                      </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => openSessionModal()}
                        className="text-left rounded-2xl px-5 py-4 min-w-[180px] border transition-all"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.02)',
                          borderColor: tokens.cardBorder,
                          color: tokens.textMuted,
                        }}
                      >
                        <div className="text-sm font-semibold mb-1" style={{ color: tokens.textSecondary }}>
                          New session
                        </div>
                        <div className="text-xs">Choose a workspace to focus in.</div>
                      </button>
                  </div>
                </section>
              )}

              {hasWorkspaces && recentSections.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: tokens.textGhost }}>
                    Recently opened
                  </h2>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {recentSections.slice(0, 8).map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openSection(s.id)}
                        className="shrink-0 rounded-xl px-4 py-3 text-left min-w-[160px] border transition-all"
                        style={{
                          backgroundColor: tokens.wellBg,
                          borderColor: tokens.cardBorder,
                        }}
                      >
                        <div className="text-sm font-medium truncate" style={{ color: tokens.textPrimary }}>
                          {s.title}
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: tokens.textGhost }}>
                          {formatLastOpened(openedAt(s.id))}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {hasWorkspaces && (
              <div className="flex flex-col lg:flex-row gap-10">
                {/* Collections rail */}
                <section className="lg:w-56 shrink-0">
                  <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: tokens.textGhost }}>
                    Folders
                  </h2>
                  <div className="flex flex-col gap-1">
                    <FolderChip
                      tokens={tokens}
                      label="All workspaces"
                      active={filterFolder === 'all'}
                      onClick={() => setFilterFolder('all')}
                    />
                    <FolderChip
                      tokens={tokens}
                      label="Unfiled"
                      active={filterFolder === 'unfiled'}
                      onClick={() => setFilterFolder('unfiled')}
                    />
                    {folders.map(f => (
                      <div key={f.id} className="flex items-center gap-1 group/f">
                        <FolderChip
                          tokens={tokens}
                          label={f.name}
                          active={filterFolder === f.id}
                          onClick={() => setFilterFolder(f.id)}
                          className="flex-1 min-w-0"
                        />
                        <button
                          type="button"
                          title="Remove folder"
                          className="opacity-0 group-hover/f:opacity-100 p-1 rounded-md text-[10px] transition-opacity"
                          style={{ color: tokens.textGhost }}
                          onClick={() => {
                            if (confirm(`Remove folder "${f.name}"? Workspaces stay — they become unfiled.`)) removeFolder(f.id);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      type="text"
                      value={folderDraft}
                      onChange={e => setFolderDraft(e.target.value)}
                      placeholder="New folder…"
                      className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg outline-none"
                      style={{
                        backgroundColor: tokens.wellBg,
                        border: `1px solid ${tokens.cardBorder}`,
                        color: tokens.textPrimary,
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          addFolder(folderDraft);
                          setFolderDraft('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addFolder(folderDraft);
                        setFolderDraft('');
                      }}
                      className="p-2 rounded-lg shrink-0"
                      style={{ backgroundColor: tokens.accentSubtle, color: tokens.accent }}
                      aria-label="Add folder"
                    >
                      <FolderPlus className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </section>

                {/* Grid */}
                <section className="flex-1 min-w-0">
                  <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: tokens.textGhost }}>
                    {filterFolder === 'all' ? 'All workspaces' : filterFolder === 'unfiled' ? 'Unfiled' : folders.find(f => f.id === filterFolder)?.name ?? 'Workspaces'}
                  </h2>

                  {filterFolder === 'all' && grouped ? (
                    <>
                      {folders.map(folder => {
                        const list = grouped.byFolder.get(folder.id) ?? [];
                        if (list.length === 0) return null;
                        return (
                          <div key={folder.id} className="mb-8">
                            <h3 className="text-sm font-medium mb-3" style={{ color: tokens.textSecondary }}>
                              {folder.name}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                              {list.map(s => (
                                <LibraryCard
                                  key={s.id}
                                  section={s}
                                  deadlines={deadlinesFor(s.id)}
                                  tokens={tokens}
                                  lastOpened={openedAt(s.id)}
                                  folders={folders}
                                  folderId={getFolderForSection(s.id)}
                                  onFolderChange={setSectionFolder}
                                  onDelete={deleteSection}
                                  onOpen={() => openSection(s.id)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {grouped.unfiled.length > 0 && (
                        <div className="mb-8">
                          <h3 className="text-sm font-medium mb-3" style={{ color: tokens.textSecondary }}>
                            Unfiled
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {grouped.unfiled.map(s => (
                              <LibraryCard
                                key={s.id}
                                section={s}
                                deadlines={deadlinesFor(s.id)}
                                tokens={tokens}
                                lastOpened={openedAt(s.id)}
                                folders={folders}
                                folderId={getFolderForSection(s.id)}
                                onFolderChange={setSectionFolder}
                                onDelete={deleteSection}
                                onOpen={() => openSection(s.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredSections.map(s => (
                        <LibraryCard
                          key={s.id}
                          section={s}
                          deadlines={deadlinesFor(s.id)}
                          tokens={tokens}
                          lastOpened={openedAt(s.id)}
                          folders={folders}
                          folderId={getFolderForSection(s.id)}
                          onFolderChange={setSectionFolder}
                          onDelete={deleteSection}
                          onOpen={() => openSection(s.id)}
                        />
                      ))}
                    </div>
                  )}

                  {!loading && filteredSections.length === 0 && sections.length > 0 && (
                    <p className="text-sm mt-6" style={{ color: tokens.textMuted }}>
                      No workspaces match this search or folder.
                    </p>
                  )}
                </section>
              </div>
              )}

              {!hasWorkspaces && libraryReady && !error && (
                <div
                  className="rounded-2xl p-10 text-center border max-w-lg mx-auto"
                  style={{ borderColor: tokens.cardBorder, backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <BookOpenCheck className="w-10 h-10 mx-auto mb-4 opacity-50" style={{ color: tokens.accent }} />
                  <p className="text-base font-semibold mb-2" style={{ color: tokens.textPrimary }}>
                    Name your first workspace above
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: tokens.textMuted }}>
                    Examples: “Organic Chemistry”, “Thesis”, “Side project”. You can open Free Space and customize the living background after you create it.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {hasWorkspaces && (
      <WorkspaceAppearancePanel
        open={appearanceOpen}
        scope="global"
        tokens={tokens}
        atmosphereId={atmosphereId}
        global={global}
        onClose={() => setAppearanceOpen(false)}
        onSetAtmosphere={setAtmosphere}
        onUpdateGlobal={updateGlobal}
      />
      )}
    </div>
  );
}

function FolderChip({
  tokens,
  label,
  active,
  onClick,
  className = '',
}: {
  tokens: ReturnType<typeof mergeAccent>;
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all border ${className}`}
      style={{
        borderColor: active ? `${tokens.accent}40` : 'transparent',
        backgroundColor: active ? tokens.accentSubtle : 'transparent',
        color: active ? tokens.accent : tokens.textMuted,
      }}
    >
      <span className="truncate block">{label}</span>
    </button>
  );
}

interface NavRowBase {
  tokens: ReturnType<typeof mergeAccent>;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}

function LibraryNavLink({
  tokens,
  active,
  icon,
  label,
  to,
}: NavRowBase & { to: string }) {
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'background-color 0.15s ease, color 0.15s ease',
    color: active ? tokens.accent : tokens.textMuted,
    backgroundColor: active ? tokens.accentSubtle : 'transparent',
    border: active ? `1px solid ${tokens.accent}25` : '1px solid transparent',
  };
  return (
    <Link to={to} style={style}>
      {icon}
      {label}
    </Link>
  );
}
