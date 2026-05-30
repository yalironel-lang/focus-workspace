import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { getWorkspaceCustomization } from '../../../hooks/useWorkspaceCustomization';
import type { mergeAccent } from '../../../hooks/useWorkspaceTheme';
import type { Deadline, SectionWithProgress } from '../../../types';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import { useLibrarySpatial } from './LibrarySpatialContext';

const ACCENT_POOL = ['#6366f1', '#8b5cf6', '#f59e0b', '#3b82f6', '#a78bfa', '#06b6d4'];

function accentForTitle(title: string): string {
  return ACCENT_POOL[[...title].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_POOL.length];
}
function initials(title: string) {
  return title.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
function workspaceKind(section: SectionWithProgress): string {
  return section.exam_date ? 'Course' : 'Workspace';
}

function baselineOpenLog(sectionId: string, target: string, label: string) {
  void sectionId;
  void target;
  void label;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins  = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days  = Math.floor(ms / 86_400_000);
  if (mins  < 2)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  === 1) return 'yesterday';
  return `${days}d ago`;
}

interface SceneCapProps {
  accent: string;
  custom: ReturnType<typeof getWorkspaceCustomization>;
  section: SectionWithProgress;
  total: number;
  completed: number;
  hovered: boolean;
  wide?: boolean;
  /** Override cap height explicitly (spatialVariant-driven) */
  capHeight?: number;
  liftY: number;
  presence: 'present' | 'warm' | 'fading';
}

function SceneCap({ accent, custom, section, total, completed, hovered, wide, capHeight, liftY, presence }: SceneCapProps) {
  const h = capHeight ?? (wide ? 88 : 70);
  const glowOuter = h >= 120
    ? (presence === 'present' ? '42' : presence === 'warm' ? '30' : '20')
    : (presence === 'present' ? '2e' : presence === 'warm' ? '1e' : '0e');
  const glowInner = h >= 120
    ? (presence === 'present' ? '1c' : presence === 'warm' ? '14' : '0e')
    : (presence === 'present' ? '10' : presence === 'warm' ? '0a' : '06');
  const dotAlpha  = presence === 'present' ? '45' : presence === 'warm' ? '30' : '1e';
  const dotGlow   = presence === 'present' ? '88' : presence === 'warm' ? '55' : '33';
  const taskDots = useMemo(() => {
    const count = Math.min(10, total);
    return Array.from({ length: count }, (_, i) => ({
      left: `${9 + i * (wide ? 8.5 : 9.2)}%`,
      top: `${36 + Math.sin(i * 1.18 + 0.4) * 14}%`,
      done: i < completed,
    }));
  }, [total, completed, wide]);

  return (
    <div
      style={{
        height: h,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        background: `
        radial-gradient(ellipse 110% 160% at 50% -20%, ${accent}${glowOuter}, transparent 60%),
        linear-gradient(180deg, ${accent}${glowInner} 0%, transparent 100%)
      `,
        transform: `translateY(${liftY}px)`,
        transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: `linear-gradient(${accent}0c 1px, transparent 1px), linear-gradient(90deg, ${accent}08 1px, transparent 1px)`,
          backgroundSize: '18px 18px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
          opacity: hovered ? 0.75 : 0.55,
          transition: 'opacity 280ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}58, transparent)`,
          opacity: hovered ? 0.95 : 0.48,
          transition: 'opacity 200ms ease',
        }}
      />
      {taskDots.map((dot, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: dot.done ? 5 : 3,
            height: dot.done ? 5 : 3,
            borderRadius: '50%',
            background: dot.done ? accent : `${accent}${dotAlpha}`,
            boxShadow: dot.done ? `0 0 6px ${accent}${dotGlow}` : 'none',
            transform: `translateY(${hovered ? -2 : 0}px)`,
            transition: `transform ${180 + i * 12}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 8,
          width: h >= 120 ? 56 : (wide ? 42 : 34),
          height: h >= 120 ? 56 : (wide ? 42 : 34),
          borderRadius: h >= 120 ? 17 : (wide ? 13 : 11),
          background: `radial-gradient(circle at 34% 24%, rgba(255,255,255,0.18), transparent 38%),
                     linear-gradient(135deg, ${accent}50, ${accent}16)`,
          border: `1px solid ${accent}38`,
          boxShadow: `0 4px 16px ${accent}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${hovered ? -2 : 0}px)`,
          transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {custom.icon ? (
          <span style={{ fontSize: h >= 120 ? 22 : (wide ? 17 : 13), lineHeight: 1 }} role="img" aria-hidden>
            {custom.icon}
          </span>
        ) : (
          <span style={{ fontSize: h >= 120 ? 15 : (wide ? 12 : 9.5), fontWeight: 880, color: accent }}>
            {initials(section.title)}
          </span>
        )}
      </div>
    </div>
  );
}

export interface SpatialLibraryCardProps {
  section: SectionWithProgress;
  deadlines: Deadline[];
  tokens: ReturnType<typeof mergeAccent>;
  folders: { id: string; name: string }[];
  folderId: string | null;
  onFolderChange: (sectionId: string, folderId: string | null) => void;
  onDelete: (section: SectionWithProgress) => void;
  wide?: boolean;
  openedAt?: string;
  /** Spatial scene variant — 'primary' enlarges cap + text; 'secondary' compacts */
  spatialVariant?: 'primary' | 'secondary';
  /** Lighter glass on MC entry grid (performance + less visual noise) */
  atmosphericDensity?: 'full' | 'light';
}

export function SpatialLibraryCard({
  section,
  deadlines,
  tokens,
  folders,
  folderId,
  onFolderChange,
  onDelete,
  wide,
  openedAt,
  spatialVariant,
  atmosphericDensity = 'full',
}: SpatialLibraryCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { setFocusRegion } = useLibrarySpatial();
  const cardRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const custom = getWorkspaceCustomization(section.id);
  const accent = custom.accent || accentForTitle(section.title);
  const kind = workspaceKind(section);

  // spatialVariant drives SceneCap height and text sizing
  const isPrimary   = spatialVariant === 'primary';
  const isSecondary = spatialVariant === 'secondary';
  const capWide     = wide || isPrimary;
  const capHeight   = isPrimary ? 160 : isSecondary ? 65 : undefined; // undefined → SceneCap uses its own default
  const titleSize   = isPrimary ? 16 : isSecondary ? 12 : wide ? 15 : 13.5;
  const btnHeight   = isPrimary ? 38 : isSecondary ? 28 : 32;
  const total = section.total_items ?? 0;
  const completed = section.completed_items ?? 0;
  const nearest = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const daysUntil = nearest
    ? Math.ceil((new Date(nearest.due_date).getTime() - Date.now()) / 86_400_000)
    : null;
  const urgentDl = daysUntil !== null && daysUntil <= 3;
  const sectionPath = `/section/${section.id}`;

  // ── Spatial presence — warm/fading based on recency ─────────────────────────
  const presence: 'present' | 'warm' | 'fading' = useMemo(() => {
    if (!openedAt) return 'fading';
    const ms = Date.now() - new Date(openedAt).getTime();
    if (ms < 24 * 3_600_000) return 'present';
    if (ms < 7  * 86_400_000) return 'warm';
    return 'fading';
  }, [openedAt]);

  // ── Premium material by spatialVariant (depends on presence) ─────────────────
  const cardBg = isPrimary
    ? 'linear-gradient(152deg, rgba(16,26,48,0.97) 0%, rgba(8,14,28,0.98) 55%, rgba(4,8,18,0.99) 100%)'
    : 'linear-gradient(152deg, rgba(14,20,34,0.94) 0%, rgba(5,7,14,0.97) 100%)';

  const cardOpacity = isPrimary ? 1 : (presence === 'fading' ? 0.78 : presence === 'warm' ? 0.92 : 1);

  const borderRest = isPrimary
    ? `${accent}${presence === 'present' ? '30' : '1e'}`
    : `${accent}${presence === 'present' ? '1c' : presence === 'warm' ? '14' : '0a'}`;

  const borderHover = isPrimary
    ? `${accent}${presence === 'present' ? '58' : '44'}`
    : `${accent}${presence === 'present' ? '44' : presence === 'warm' ? '34' : '22'}`;

  const cardShadowRest = isPrimary
    ? `0 18px 64px rgba(0,0,0,0.52), 0 6px 32px ${accent}14, inset 0 1px 0 rgba(255,255,255,0.10)`
    : `0 10px 32px rgba(0,0,0,0.30), 0 4px 24px ${accent}0a, inset 0 1px 0 rgba(255,255,255,0.05)`;

  const cardShadowHover = isPrimary
    ? `0 32px 90px rgba(0,0,0,0.62), 0 10px 48px ${accent}1e, inset 0 1px 0 rgba(255,255,255,0.14)`
    : `0 22px 56px rgba(0,0,0,0.50), 0 6px 28px ${accent}16, inset 0 1px 0 rgba(255,255,255,0.08)`;

  const titleColor = isPrimary ? 'rgba(248,244,236,0.96)' : tokens.textPrimary;

  const btnRestBg     = isPrimary ? 'rgba(255,255,255,0.068)' : 'rgba(255,255,255,0.036)';
  const btnRestBorder = isPrimary ? 'rgba(255,255,255,0.15)'  : 'rgba(255,255,255,0.060)';
  const btnRestColor  = isPrimary ? 'rgba(248,244,236,0.72)'  : 'rgba(255,255,255,0.38)';

  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [2, -2]), {
    stiffness: 180,
    damping: 32,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-2.5, 2.5]), {
    stiffness: 180,
    damping: 32,
  });
  const liftY = useSpring(hovered ? -5 : 0, { stiffness: 220, damping: 30 });

  const onPointerMove = (e: React.PointerEvent) => {
    if (reducedMotion || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mx.set(x);
    my.set(y);
  };

  const onPointerLeave = () => {
    mx.set(0);
    my.set(0);
    setHovered(false);
    setMenuOpen(false);
    setFocusRegion(null);
  };

  return (
    <motion.div
      ref={cardRef}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        border: `1px solid ${hovered ? borderHover : borderRest}`,
        opacity: cardOpacity,
        background: cardBg,
        backdropFilter:
          atmosphericDensity === 'light'
            ? 'blur(6px) saturate(1.05)'
            : isPrimary
              ? 'blur(4px) saturate(1.1)'
              : 'blur(18px) saturate(1.35)',
        WebkitBackdropFilter:
          atmosphericDensity === 'light'
            ? 'blur(6px) saturate(1.05)'
            : isPrimary
              ? 'blur(4px) saturate(1.1)'
              : 'blur(18px) saturate(1.35)',
        boxShadow: hovered ? cardShadowHover : cardShadowRest,
        cursor: 'pointer',
        overflow: 'hidden',
        isolation: 'isolate',
        rotateX: reducedMotion ? 0 : rotateX,
        rotateY: reducedMotion ? 0 : rotateY,
        y: reducedMotion ? (hovered ? -4 : 0) : liftY,
        transformPerspective: 1200,
        transformStyle: 'preserve-3d',
      }}
      onPointerMove={onPointerMove}
      onPointerEnter={() => {
        setHovered(true);
        setFocusRegion('field');
      }}
      onPointerLeave={onPointerLeave}
      whileTap={reducedMotion ? undefined : { scale: 0.996 }}
      transition={{ type: 'spring', stiffness: 260, damping: 34 }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          zIndex: 1,
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.22), ${accent}44, rgba(255,255,255,0.10), transparent)`,
          opacity: hovered ? 0.9 : 0.4,
          transition: 'opacity 200ms ease',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: isPrimary ? 3 : 2,
          zIndex: 1,
          background: `linear-gradient(180deg, ${accent}cc, ${accent}44, transparent)`,
          opacity: hovered ? 1 : 0.55,
          transition: 'opacity 200ms ease',
        }}
      />

      <SceneCap
        accent={accent}
        custom={custom}
        section={section}
        total={total}
        completed={completed}
        hovered={hovered}
        wide={capWide}
        capHeight={capHeight}
        liftY={0}
        presence={presence}
      />

      <div
        style={{
          padding: '14px 16px 15px',
          position: 'relative',
          zIndex: 2,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <motion.div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 11,
          }}
          animate={{ y: hovered ? -1 : 0 }}
          transition={{ duration: 0.22 }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: titleSize,
                fontWeight: 800,
                color: titleColor,
                letterSpacing: '-0.028em',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {section.title}
            </p>
            <p
              style={{
                fontSize: 8.5,
                fontWeight: 870,
                color: 'rgba(255,255,255,0.22)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                margin: '3px 0 0',
              }}
            >
              {kind}{openedAt ? ` · ${relativeTime(openedAt)}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              e.preventDefault();
              setMenuOpen(v => !v);
            }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              flexShrink: 0,
              border: `1px solid ${menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
              background: menuOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
              color: 'rgba(255,255,255,0.32)',
              fontSize: 13,
              lineHeight: 1,
              opacity: hovered ? 1 : 0,
              transition: 'opacity 150ms ease',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Workspace options"
          >
            ⋯
          </button>
        </motion.div>

        <motion.div style={{ flex: 1, marginBottom: 12, minHeight: 18 }} animate={{ opacity: hovered ? 1 : 0.88 }}>
          {nearest ? (
            <span style={{ fontSize: 10, color: urgentDl ? '#fb7185' : 'rgba(255,255,255,0.28)', letterSpacing: '0.01em' }}>
              due {nearest.due_date}
            </span>
          ) : section.next_item_title ? (
            <span
              style={{
                fontSize: 10.5,
                fontStyle: 'italic',
                color: presence === 'fading' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.24)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {section.next_item_title}
            </span>
          ) : null}
        </motion.div>

        <motion.a
          href={sectionPath}
          onClick={() => baselineOpenLog(section.id, sectionPath, 'card-open')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: btnHeight,
            padding: '0 12px',
            borderRadius: 10,
            background: hovered
              ? `linear-gradient(135deg, ${accent}ee, ${accent}aa)`
              : btnRestBg,
            border: `1px solid ${hovered ? `${accent}80` : btnRestBorder}`,
            color: hovered ? '#020508' : btnRestColor,
            fontSize: 11.5,
            fontWeight: 800,
            textDecoration: 'none',
          }}
          animate={{ scale: hovered ? 1.01 : 1 }}
          transition={{ duration: 0.18 }}
        >
          <span>Open workspace</span>
          <ArrowRight style={{ width: 12, height: 12 }} strokeWidth={2.5} />
        </motion.a>
      </div>

      {/* Physical base — accent grounding bar */}
      {isPrimary && (
        <div
          style={{
            height: 2,
            margin: '0 16px 12px',
            borderRadius: 1,
            background: `linear-gradient(90deg, transparent, ${accent}55, ${accent}88, ${accent}55, transparent)`,
            opacity: hovered ? 0.85 : 0.45,
            transition: 'opacity 280ms ease',
          }}
        />
      )}

      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 10,
            zIndex: 200,
            minWidth: 186,
            background: 'rgba(6,9,18,0.97)',
            border: '1px solid rgba(255,255,255,0.090)',
            borderRadius: 12,
            padding: 8,
            boxShadow: '0 18px 52px rgba(0,0,0,0.64)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          <p
            style={{
              fontSize: 8.5,
              fontWeight: 860,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.26)',
              padding: '2px 8px 6px',
              margin: 0,
            }}
          >
            Move to folder
          </p>
          <select
            aria-label="Collection"
            value={folderId ?? ''}
            onChange={e => {
              const v = e.target.value;
              onFolderChange(section.id, v === '' ? null : v);
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: tokens.textSecondary,
              marginBottom: 6,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Unfiled</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <motion.div style={{ height: 1, background: 'rgba(255,255,255,0.055)', margin: '4px 0' }} />
          <button
            type="button"
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '7px 8px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              color: '#fb7185',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(244,63,94,0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={() => {
              onDelete(section);
              setMenuOpen(false);
            }}
          >
            Remove workspace…
          </button>
        </div>
      )}
    </motion.div>
  );
}
