import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  Calendar,
  FolderPlus,
  LayoutDashboard,
  Loader2,
  LogOut,
  Palette,
  Play,
  Plus,
  Search,
  Sparkles,
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
import { UNIVERSE_ROUTE } from '../../lib/workspaceUniverse/types';
import type { WorkspaceNavigationState } from '../../lib/workspaceUniverse/types';
import { isAdvancedLibraryNavUnlocked, isFirstWorkspaceEntryPending } from '../../lib/firstSessionPrefs';
import type { SectionWithProgress } from '../../types';
import type { Deadline } from '../../types';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

const LIBRARY_KEYFRAMES = `
  /* ─── entrance / fade ─── */
  @keyframes libFadeUp {
    from { opacity: 0; transform: translateY(14px); filter: blur(3px); }
    to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
  }
  @keyframes libFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ─── atmospheric drift (for bg layers) ─── */
  @keyframes libDrift {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    50%      { transform: translate3d(26px,-20px,0) scale(1.07); }
  }
  @keyframes libDriftSlow {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    50%      { transform: translate3d(-20px,14px,0) scale(1.05); }
  }
  @keyframes libDriftCW {
    0%,100% { transform: translate3d(0,0,0) scale(1); }
    25%      { transform: translate3d(14px,8px,0) scale(1.02); }
    75%      { transform: translate3d(-10px,-6px,0) scale(0.98); }
  }

  /* ─── card scan shimmer ─── */
  @keyframes libScan {
    from    { transform: translateX(-100%); opacity: 0; }
    20%,80% { opacity: 0.38; }
    to      { transform: translateX(200%);  opacity: 0; }
  }

  /* ─── hero nebula breath ─── */
  @keyframes libBreath {
    0%,100% { opacity: 0.34; transform: scale(1); }
    50%      { opacity: 0.72; transform: scale(1.06); }
  }
  @keyframes libBreath2 {
    0%,100% { opacity: 0.22; transform: scale(1); }
    50%      { opacity: 0.50; transform: scale(1.04); }
  }

  /* ─── orbit rings ─── */
  @keyframes libOrbit {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes libOrbitRev {
    from { transform: rotate(360deg); }
    to   { transform: rotate(0deg); }
  }

  /* ─── floating context bubbles (3 independent paths) ─── */
  @keyframes libFloat1 {
    0%,100% { transform: translateY(0px) translateX(0px); }
    40%      { transform: translateY(-7px) translateX(2px); }
    70%      { transform: translateY(-4px) translateX(-1px); }
  }
  @keyframes libFloat2 {
    0%,100% { transform: translateY(0px) translateX(0px); }
    35%      { transform: translateY(-9px) translateX(-3px); }
    65%      { transform: translateY(-5px) translateX(2px); }
  }
  @keyframes libFloat3 {
    0%,100% { transform: translateY(0px) translateX(0px); }
    45%      { transform: translateY(-6px) translateX(4px); }
    75%      { transform: translateY(-3px) translateX(-2px); }
  }

  /* ─── avatar float ─── */
  @keyframes libAvatarFloat {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-5px); }
  }

  /* ─── live dot pulse ─── */
  @keyframes libPulse {
    0%,100% { opacity: 1; box-shadow: 0 0 8px var(--sa, #6366f1); }
    50%      { opacity: 0.5; box-shadow: 0 0 4px var(--sa, #6366f1); }
  }

  /* ─── glass shimmer ─── */
  @keyframes libGlassShimmer {
    0%,100% { opacity: 0.55; transform: translateX(-32px) skewX(-18deg); }
    50%      { opacity: 0.80; }
    100%     { opacity: 0.55; transform: translateX(calc(100% + 32px)) skewX(-18deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
`;

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

// ─── SCENE CAP ────────────────────────────────────────────────────────────────
// The unique "world view" header of each workspace card.

interface SceneCapProps {
  accent: string;
  custom: ReturnType<typeof getWorkspaceCustomization>;
  section: SectionWithProgress;
  total: number;
  completed: number;
  hovered: boolean;
  wide?: boolean;
}

function SceneCap({ accent, custom, section, total, completed, hovered, wide }: SceneCapProps) {
  const h = wide ? 88 : 70;
  const taskDots = useMemo(() => {
    const count = Math.min(10, total);
    return Array.from({ length: count }, (_, i) => ({
      left: `${9 + i * (wide ? 8.5 : 9.2)}%`,
      top:  `${36 + Math.sin(i * 1.18 + 0.4) * 14}%`,
      done: i < completed,
    }));
  }, [total, completed, wide]);

  return (
    <div style={{
      height: h, position: 'relative', overflow: 'hidden', flexShrink: 0,
      background: `
        radial-gradient(ellipse 110% 160% at 50% -20%, ${accent}2e, transparent 60%),
        linear-gradient(180deg, ${accent}10 0%, transparent 100%)
      `,
    }}>
      {/* Fine grid texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(${accent}0e 1px, transparent 1px), linear-gradient(90deg, ${accent}0b 1px, transparent 1px)`,
        backgroundSize: '18px 18px',
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
      }} />
      {/* Horizon */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accent}58, transparent)`,
        opacity: hovered ? 0.95 : 0.48,
        transition: 'opacity 200ms ease',
      }} />
      {/* Task dots */}
      {taskDots.map((dot, i) => (
        <div key={i} style={{
          position: 'absolute', left: dot.left, top: dot.top,
          width: dot.done ? 5 : 3, height: dot.done ? 5 : 3,
          borderRadius: '50%',
          background: dot.done ? accent : `${accent}45`,
          boxShadow: dot.done ? `0 0 8px ${accent}` : 'none',
          transform: `translateY(${hovered ? -3 : 0}px)`,
          transition: `transform ${140 + i * 16}ms ease`,
        }} />
      ))}
      {/* Workspace avatar */}
      <div style={{
        position: 'absolute', right: 12, bottom: 8,
        width: wide ? 42 : 34, height: wide ? 42 : 34,
        borderRadius: wide ? 13 : 11,
        background: `radial-gradient(circle at 34% 24%, rgba(255,255,255,0.18), transparent 38%),
                     linear-gradient(135deg, ${accent}50, ${accent}16)`,
        border: `1px solid ${accent}38`,
        boxShadow: `0 4px 16px ${accent}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `translateY(${hovered ? -3 : 0}px)`,
        transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
        flexShrink: 0,
      }}>
        {custom.icon
          ? <span style={{ fontSize: wide ? 17 : 13, lineHeight: 1 }} role="img" aria-hidden>{custom.icon}</span>
          : <span style={{ fontSize: wide ? 12 : 9.5, fontWeight: 880, color: accent }}>{initials(section.title)}</span>
        }
      </div>
    </div>
  );
}

// ─── LIBRARY CARD ─────────────────────────────────────────────────────────────

interface LibraryCardProps {
  section: SectionWithProgress;
  deadlines: Deadline[];
  tokens: ReturnType<typeof mergeAccent>;
  folders: { id: string; name: string }[];
  folderId: string | null;
  onFolderChange: (sectionId: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
  wide?: boolean;
}

function LibraryCard({ section, deadlines, tokens, folders, folderId, onFolderChange, onDelete, wide }: LibraryCardProps) {
  const [hovered, setHovered]   = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const custom    = getWorkspaceCustomization(section.id);
  const accent    = custom.accent || accentForTitle(section.title);
  const kind      = workspaceKind(section);
  const progress  = section.progress ?? 0;
  const total     = section.total_items ?? 0;
  const completed = section.completed_items ?? 0;
  const nearest   = deadlines.filter(d => !d.completed).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const daysUntil = nearest ? Math.ceil((new Date(nearest.due_date).getTime() - Date.now()) / 86_400_000) : null;
  const urgentDl  = daysUntil !== null && daysUntil <= 3;
  const sectionPath = `/section/${section.id}`;

  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        borderRadius: 20,
        border: `1px solid ${hovered ? `${accent}42` : 'rgba(255,255,255,0.068)'}`,
        background: `linear-gradient(145deg, rgba(10,15,27,0.90) 0%, rgba(4,6,12,0.95) 100%)`,
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        boxShadow: hovered
          ? `0 22px 64px rgba(0,0,0,0.52), 0 6px 24px ${accent}16, inset 0 1px 0 rgba(255,255,255,0.07)`
          : `0 6px 24px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.042)`,
        transition: 'transform 230ms cubic-bezier(0.22,1,0.36,1), border-color 180ms ease, box-shadow 250ms ease',
        transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
        cursor: 'pointer',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      {/* Hover scan shimmer */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `linear-gradient(90deg, transparent, ${accent}0a, transparent)`,
        animation: hovered ? 'libScan 1.9s ease both' : 'none',
      }} />
      {/* Top specular highlight */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 1,
        background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.22), ${accent}44, rgba(255,255,255,0.10), transparent)`,
        opacity: hovered ? 0.90 : 0.40,
        transition: 'opacity 200ms ease',
      }} />
      {/* Left accent border */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, zIndex: 1,
        background: `linear-gradient(180deg, ${accent}cc, ${accent}44, transparent)`,
        opacity: hovered ? 1 : 0.55,
        transition: 'opacity 200ms ease',
      }} />

      <SceneCap accent={accent} custom={custom} section={section} total={total} completed={completed} hovered={hovered} wide={wide} />

      <div style={{ padding: '14px 16px 15px', position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 11 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontSize: wide ? 15 : 13.5, fontWeight: 800, color: tokens.textPrimary,
              letterSpacing: '-0.028em', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {section.title}
            </p>
            <p style={{ fontSize: 8.5, fontWeight: 870, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.16em', textTransform: 'uppercase', margin: '3px 0 0' }}>
              {kind} · {Math.round(progress)}%
            </p>
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); e.preventDefault(); setMenuOpen(v => !v); }}
            style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              border: `1px solid ${menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
              background: menuOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
              color: 'rgba(255,255,255,0.32)', fontSize: 13, lineHeight: 1,
              opacity: hovered ? 1 : 0, transition: 'opacity 150ms ease',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Workspace options"
          >⋯</button>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.052)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              width: total > 0 ? `${progress}%` : '0%',
              background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 0 10px ${accent}55`,
              transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)',
            }} />
          </div>
        </div>

        <div style={{ flex: 1, marginBottom: 12, minHeight: 18 }}>
          {nearest ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: urgentDl ? 'rgba(251,113,133,0.11)' : 'rgba(255,255,255,0.042)',
              color: urgentDl ? '#fb7185' : 'rgba(255,255,255,0.34)',
              border: `1px solid ${urgentDl ? 'rgba(251,113,133,0.22)' : 'rgba(255,255,255,0.062)'}`,
            }}>
              <Calendar style={{ width: 8, height: 8 }} strokeWidth={2} />
              {nearest.due_date}
            </span>
          ) : section.next_item_title ? (
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              → {section.next_item_title}
            </span>
          ) : (
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.12)' }}>
              {total === 0 ? 'Ready for tasks' : 'No upcoming deadlines'}
            </span>
          )}
        </div>

        <a
          href={sectionPath}
          onClick={() => baselineOpenLog(section.id, sectionPath, 'card-open')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: 32, padding: '0 12px', borderRadius: 10,
            background: hovered ? `linear-gradient(135deg, ${accent}ee, ${accent}aa)` : 'rgba(255,255,255,0.036)',
            border: `1px solid ${hovered ? `${accent}80` : 'rgba(255,255,255,0.060)'}`,
            color: hovered ? '#020508' : 'rgba(255,255,255,0.38)',
            fontSize: 11.5, fontWeight: 800, textDecoration: 'none',
            transition: 'background 180ms ease, color 180ms ease, border-color 180ms ease',
          }}
        >
          <span>Open workspace</span>
          <ArrowRight style={{ width: 12, height: 12 }} strokeWidth={2.5} />
        </a>
      </div>

      {menuOpen && (
        <div
          style={{
            position: 'absolute', top: 44, right: 10, zIndex: 200, minWidth: 186,
            background: 'rgba(6,9,18,0.97)',
            border: '1px solid rgba(255,255,255,0.090)',
            borderRadius: 12, padding: 8,
            boxShadow: '0 18px 52px rgba(0,0,0,0.64)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <p style={{ fontSize: 8.5, fontWeight: 860, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.26)', padding: '2px 8px 6px', margin: 0 }}>Move to folder</p>
          <select
            aria-label="Collection"
            value={folderId ?? ''}
            onChange={e => { const v = e.target.value; onFolderChange(section.id, v === '' ? null : v); }}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: tokens.textSecondary, marginBottom: 6, outline: 'none', boxSizing: 'border-box' }}
          >
            <option value="">Unfiled</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.055)', margin: '4px 0' }} />
          <button
            type="button"
            style={{ width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 8, background: 'transparent', border: 'none', color: '#fb7185', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => { if (confirm('Remove this workspace? This cannot be undone.')) onDelete(section.id); setMenuOpen(false); }}
          >
            Remove workspace…
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function WorkspaceLibrary() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, signOut } = useAuth();
  const { sections, loading, error, fetchSections, createSection, deleteSection } = useSections();
  const { deadlines } = useDeadlines();
  const { tokens: atmTokens, atmosphereId, setAtmosphere } = useAtmosphere();
  const { design, global, updateGlobal } = useWorkspaceTheme();
  const tokens = useMemo(() => mergeAccent(atmTokens, design), [atmTokens, design]);
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

  const deadlinesFor = useCallback((id: string) => deadlines.filter(d => d.section_id === id), [deadlines]);

  // Asymmetric grid: first card wide (2fr), remainder fills normally
  const renderGrid = (list: SectionWithProgress[], baseDelay = 0) => {
    if (!list.length) return null;
    const [first, ...rest] = list;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: rest.length > 0 ? '2fr 1fr' : '1fr', gap: 14 }}>
          <div style={{ animation: `libFadeUp 0.38s ${baseDelay}s ease both` }}>
            <LibraryCard section={first} deadlines={deadlinesFor(first.id)} tokens={tokens} folders={folders} folderId={getFolderForSection(first.id)} onFolderChange={setSectionFolder} onDelete={deleteSection} wide />
          </div>
          {rest[0] && (
            <div style={{ animation: `libFadeUp 0.38s ${baseDelay + 0.05}s ease both` }}>
              <LibraryCard section={rest[0]} deadlines={deadlinesFor(rest[0].id)} tokens={tokens} folders={folders} folderId={getFolderForSection(rest[0].id)} onFolderChange={setSectionFolder} onDelete={deleteSection} />
            </div>
          )}
        </div>
        {rest.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 14 }}>
            {rest.slice(1).map((s, i) => (
              <div key={s.id} style={{ animation: `libFadeUp 0.36s ${baseDelay + 0.10 + i * 0.04}s ease both` }}>
                <LibraryCard section={s} deadlines={deadlinesFor(s.id)} tokens={tokens} folders={folders} folderId={getFolderForSection(s.id)} onFolderChange={setSectionFolder} onDelete={deleteSection} />
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

  return (
    <>
      <style>{LIBRARY_KEYFRAMES}</style>

      <div style={{
        minHeight: '100vh', display: 'flex',
        position: 'relative', overflow: 'hidden',
        backgroundColor: '#020407',
        color: tokens.textPrimary,
        opacity: mounted ? 1 : 0,
        transition: 'opacity 300ms ease',
      }}>

        {/* ═══════════════════════════════════════════════════════════════
            ATMOSPHERE — 6 composited GPU layers, no repaints
        ═══════════════════════════════════════════════════════════════ */}

        {/* L1: Deep space base */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 90% 60% at 12% 4%,  ${sA}22, transparent 48%),
            radial-gradient(ellipse 60% 52% at 86% 2%,  rgba(99,102,241,0.15), transparent 50%),
            radial-gradient(ellipse 58% 64% at 88% 88%, rgba(6,182,212,0.08), transparent 46%),
            linear-gradient(155deg, #040810 0%, #020407 44%, #050912 100%)
          `,
          transition: 'background 1.2s ease',
        }} />

        {/* L2: Large workspace nebula */}
        <div style={{
          position: 'fixed', zIndex: 0, pointerEvents: 'none',
          width: '72vw', height: '72vw',
          borderRadius: '50%',
          left: '14%', top: '-18%',
          background: `radial-gradient(circle, ${sA}1a, transparent 58%)`,
          animation: 'libBreath 18s ease-in-out infinite',
          transition: 'background 1.2s ease',
        }} />

        {/* L3: Drifting top halo */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 68% 38% at 50% 0%, rgba(255,255,255,0.062), transparent 60%)`,
          animation: 'libDrift 28s ease-in-out infinite',
          opacity: 0.68,
        }} />

        {/* L4: Counter-drift right accent */}
        <div style={{
          position: 'fixed', right: 0, top: 0, width: '46vw', height: '70vh',
          zIndex: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at 100% 0%, ${sA}0e, transparent 62%)`,
          animation: 'libDriftSlow 34s ease-in-out infinite',
          opacity: 0.52,
          transition: 'background 1.2s ease',
        }} />

        {/* L5: Bottom depth shadow */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: '38vh',
          zIndex: 0, pointerEvents: 'none',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%)',
        }} />

        {/* L6: Grid texture */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)
          `,
          backgroundSize: '86px 86px',
          maskImage: 'radial-gradient(circle at 50% 8%, rgba(0,0,0,0.60), transparent 60%)',
          opacity: 0.45,
        }} />

        {/* ═══════════════════════════════════════════════════════════════
            GLASS SIDEBAR
        ═══════════════════════════════════════════════════════════════ */}
        <aside style={{
          position: 'relative', zIndex: 20,
          width: 210, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          margin: '12px 0 12px 12px',
          border: '1px solid rgba(255,255,255,0.090)',
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(12,18,32,0.78) 0%, rgba(5,8,16,0.72) 100%)',
          backdropFilter: 'blur(32px) saturate(2.0) brightness(1.10)',
          WebkitBackdropFilter: 'blur(32px) saturate(2.0) brightness(1.10)',
          boxShadow: '0 22px 68px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.042) 0%, transparent 100%)',
            pointerEvents: 'none',
          }} />

          {/* Brand */}
          <div style={{
            padding: '16px 14px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.068)',
            display: 'flex', alignItems: 'center', gap: 9,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `radial-gradient(circle at 16% 0%, ${sA}1e, transparent 52%)`,
              transition: 'background 1.2s ease',
            }} />
            <div style={{
              width: 30, height: 30, borderRadius: 10, flexShrink: 0, position: 'relative',
              background: `radial-gradient(circle at 34% 24%, rgba(255,255,255,0.48), transparent 30%), linear-gradient(135deg, ${sA}, ${sA}cc)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 8px 22px ${sA}42, inset 0 1px 0 rgba(255,255,255,0.22)`,
              transition: 'background 1.2s ease, box-shadow 1.2s ease',
            }}>
              <BookOpenCheck style={{ width: 13, height: 13, color: '#000' }} strokeWidth={2.5} />
            </div>
            <div style={{ minWidth: 0, position: 'relative' }}>
              <div style={{ fontSize: 9.5, fontWeight: 750, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.32)' }}>Focus Workspace</div>
              <div style={{ fontSize: 12, fontWeight: 650, color: tokens.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName || 'Library'}
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '9px 7px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <LibraryNavLink tokens={tokens} active={location.pathname === '/dashboard'} icon={<BookOpenCheck style={{ width: 13, height: 13 }} strokeWidth={2} />} label="Library" to="/dashboard" accent={sA} />
            {showAdvancedNav && <>
              <LibraryNavLink tokens={tokens} active={location.pathname === UNIVERSE_ROUTE} icon={<Sparkles style={{ width: 13, height: 13 }} strokeWidth={2} />} label="Universe" to={UNIVERSE_ROUTE} accent={sA} />
              <LibraryNavLink tokens={tokens} active={location.pathname === '/desk'} icon={<LayoutDashboard style={{ width: 13, height: 13 }} strokeWidth={2} />} label="Personal desk" to="/desk" accent={sA} />
              <LibraryNavLink tokens={tokens} active={location.pathname === '/schedule'} icon={<Calendar style={{ width: 13, height: 13 }} strokeWidth={2} />} label="Schedule" to="/schedule" accent={sA} />
              <LibraryNavLink tokens={tokens} active={location.pathname === '/session'} icon={<Play style={{ width: 13, height: 13 }} strokeWidth={2} />} label="Focus session" to="/session" accent={sA} />
            </>}
            {hasWorkspaces && (
              <button type="button" onClick={() => setAppearanceOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10,
                  border: '1px solid transparent', background: appearanceOpen ? `${sA}18` : 'transparent',
                  color: appearanceOpen ? sA : tokens.textMuted, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  width: '100%', transition: 'all 150ms ease',
                }}
                onMouseEnter={e => { if (!appearanceOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.040)'; e.currentTarget.style.color = tokens.textSecondary; } }}
                onMouseLeave={e => { if (!appearanceOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = tokens.textMuted; } }}
              >
                <Palette style={{ width: 13, height: 13, color: sA }} strokeWidth={2} />
                Scene
              </button>
            )}
          </nav>

          <div style={{ padding: '9px 11px', borderTop: '1px solid rgba(255,255,255,0.052)' }}>
            <button type="button" onClick={handleSignOut}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, border: 'none', background: 'transparent', color: tokens.textMuted, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 150ms ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.038)'; e.currentTarget.style.color = tokens.textPrimary; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = tokens.textMuted; }}
            >
              <LogOut style={{ width: 12, height: 12 }} strokeWidth={2} />
              Sign out
            </button>
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════════════════
            MAIN
        ═══════════════════════════════════════════════════════════════ */}
        <main style={{ position: 'relative', zIndex: 10, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* CINEMATIC HERO STAGE — min-height 58vh */}
          <div style={{
            minHeight: '58vh',
            padding: '26px 52px 0',
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>

            {/* Stage-local nebula */}
            {resumeWorkspace && (
              <div style={{
                position: 'absolute', left: '-5%', top: '-20%',
                width: '70%', height: '140%',
                borderRadius: '50%',
                background: `radial-gradient(ellipse, ${sA}18, transparent 60%)`,
                animation: 'libBreath2 20s ease-in-out infinite',
                pointerEvents: 'none', zIndex: 0,
                transition: 'background 1.2s ease',
              }} />
            )}

            {/* TOP BAR */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 42, position: 'relative', zIndex: 2,
              animation: 'libFadeIn 0.5s 0.05s ease both',
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.20)' }}>
                {getGreeting()}{displayName ? `, ${displayName}` : ''} ·{' '}
                <span style={{ color: sA, transition: 'color 1.2s ease' }}>
                  {sections.length > 0 ? `${sections.length} workspace${sections.length > 1 ? 's' : ''} active` : 'workspace OS'}
                </span>
              </span>

              {/* Search */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 36, padding: '0 12px',
                borderRadius: 12,
                border: `1px solid ${searchFocused ? `${sA}55` : 'rgba(255,255,255,0.090)'}`,
                background: searchFocused
                  ? 'rgba(255,255,255,0.07)'
                  : 'linear-gradient(145deg, rgba(255,255,255,0.048), rgba(255,255,255,0.022))',
                backdropFilter: 'blur(20px) saturate(1.5)', WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                boxShadow: searchFocused
                  ? `0 0 0 3px ${sA}12, 0 8px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.10)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                width: searchFocused ? 310 : 152,
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
              <div style={{ position: 'relative', zIndex: 2, animation: 'libFadeUp 0.52s 0.10s ease both' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 32 }}>

                  {/* Orbit system */}
                  <div style={{ position: 'relative', flexShrink: 0, marginBottom: 6 }}>
                    <div style={{
                      position: 'absolute', inset: -32,
                      borderRadius: '50%',
                      border: `1px solid ${sA}20`,
                      animation: 'libOrbit 22s linear infinite',
                      transition: 'border-color 1.2s ease',
                    }}>
                      <div style={{ position: 'absolute', width: 7, height: 7, background: sA, borderRadius: '50%', top: -3.5, left: '50%', transform: 'translateX(-50%)', boxShadow: `0 0 14px ${sA}ee`, transition: 'background 1.2s ease, box-shadow 1.2s ease' }} />
                    </div>
                    <div style={{
                      position: 'absolute', inset: -20,
                      borderRadius: '50%',
                      border: `1px solid ${sA}12`,
                      animation: 'libOrbitRev 32s linear infinite',
                    }}>
                      <div style={{ position: 'absolute', width: 4, height: 4, background: `${sA}bb`, borderRadius: '50%', bottom: -2, right: '26%', transition: 'background 1.2s ease' }} />
                    </div>
                    {/* Avatar */}
                    <div style={{
                      width: 80, height: 80, borderRadius: 24,
                      background: `radial-gradient(circle at 32% 24%, rgba(255,255,255,0.24), transparent 38%),
                                   linear-gradient(135deg, ${sA}54, ${sA}1c)`,
                      border: `1px solid ${sA}48`,
                      boxShadow: `0 20px 56px ${sA}30, inset 0 1px 0 rgba(255,255,255,0.16)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      animation: 'libAvatarFloat 7s ease-in-out infinite',
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
                        resume your world
                      </span>
                    </div>

                    <h2 style={{
                      fontSize: 64, fontWeight: 920,
                      letterSpacing: '-0.074em',
                      color: tokens.textPrimary,
                      margin: '0 0 20px', lineHeight: 0.92,
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
                  </div>
                </div>

                {/* FLOATING CONTEXT BUBBLES */}
                {resumeWorkspace.next_item_title && (
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
                {sTotal > 0 && (
                  <FloatingGlassBubble
                    label="Progress"
                    value={`${sCompleted} / ${sTotal} complete`}
                    accent={sA}
                    top={resumeWorkspace.next_item_title ? '38%' : '14%'} right="8%"
                    animName="libFloat2" animDuration={10} animDelay={1.2}
                  />
                )}
                {sNearest && (
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
                <h2 style={{
                  fontSize: 62, fontWeight: 920, letterSpacing: '-0.072em',
                  color: tokens.textPrimary, margin: '0 0 16px', lineHeight: 0.94, maxWidth: 560,
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
                  background: `linear-gradient(90deg, transparent, ${sA}30 22%, rgba(255,255,255,0.06) 50%, ${sA}20 78%, transparent)`,
                  transition: 'background 1.2s ease',
                }} />
              </div>
            )}
          </div>

          {/* COMMAND STRIP */}
          {hasWorkspaces && (
            <div style={{
              padding: '12px 52px 0',
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
            <div style={{ padding: '10px 52px 0', flexShrink: 0 }}>
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

          {/* WORKSPACE GRID */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 52px 80px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
                <Loader2 style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.16)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <>
                {hasWorkspaces && (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <h2 style={{ fontSize: 9, fontWeight: 920, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)', margin: 0 }}>
                        {filterFolder === 'all' ? 'Workspace field' : filterFolder === 'unfiled' ? 'Unfiled' : (folders.find(f => f.id === filterFolder)?.name ?? 'Workspaces')}
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
        </main>

        {hasWorkspaces && (
          <WorkspaceAppearancePanel open={appearanceOpen} scope="global" tokens={tokens} atmosphereId={atmosphereId} global={global} onClose={() => setAppearanceOpen(false)} onSetAtmosphere={setAtmosphere} onUpdateGlobal={updateGlobal} />
        )}
      </div>
    </>
  );
}

// ─── NAV LINK ─────────────────────────────────────────────────────────────────

interface NavRowBase {
  tokens: ReturnType<typeof mergeAccent>;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  accent: string;
}
function LibraryNavLink({ tokens, active, icon, label, to, accent }: NavRowBase & { to: string }) {
  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10,
      fontSize: 12.5, fontWeight: 500, textDecoration: 'none',
      transition: 'background 0.14s ease, color 0.14s ease, border-color 0.14s ease',
      color: active ? accent : tokens.textMuted,
      background: active ? `${accent}18` : 'transparent',
      border: active ? `1px solid ${accent}30` : '1px solid transparent',
      cursor: 'pointer',
    }}>
      {icon}{label}
    </Link>
  );
}
