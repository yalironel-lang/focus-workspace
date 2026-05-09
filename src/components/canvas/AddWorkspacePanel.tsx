/**
 * AddWorkspacePanel — unified "Add to your workspace" experience.
 *
 * Design principles:
 * - No "modules" vs "blocks" distinction in the UI. Everything is just a thing you can add.
 * - User-purpose categories, not implementation categories.
 * - Visual hierarchy: large cards for rich modules, compact rows for utilities.
 * - One consistent action: clicking always ADDS. Never toggles, never surprises.
 * - Already-on-canvas items are shown dimmed — user can still add duplicates.
 * - Search across everything, human-language placeholder.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Search, Check, Plus } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ModuleConfig }      from '../../hooks/useWorkspaceLayout';
import { MODULE_REGISTRY }        from '../../modules/registry';
import { BLOCK_META, BlockType }  from '../../hooks/useCustomBlocks';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:            boolean;
  modules:         ModuleConfig[];
  tokens:          AtmosphereTokens;
  onToggle:        (id: string) => void;   // enable/disable system module
  onAddBlock:      (type: BlockType) => void;
  onOpenCreateTool?: () => void;           // open the Create Tool modal
  onClose:         () => void;
}

// ── Unified catalog item ──────────────────────────────────────────────────────

type CatalogItem =
  | { kind: 'module'; id: string; label: string; tagline: string; description: string; icon: string; category: string; cardSize: string }
  | { kind: 'block';  blockType: BlockType; label: string; tagline: string; description: string; icon: string; category: string; cardSize: string };

const CATALOG: CatalogItem[] = [
  // Focus Tools
  ...MODULE_REGISTRY.map(m => ({
    kind:        'module' as const,
    id:          m.id,
    label:       m.label,
    tagline:     m.tagline,
    description: m.description,
    icon:        m.icon,
    category:    m.category,
    cardSize:    m.cardSize,
  })),
  // Writing & Thinking + Visual + Resources (blocks)
  ...(Object.entries(BLOCK_META) as [BlockType, typeof BLOCK_META[BlockType]][]).map(([type, meta]) => ({
    kind:        'block' as const,
    blockType:   type,
    label:       meta.label,
    tagline:     meta.tagline,
    description: meta.description,
    icon:        meta.icon,
    category:    meta.category,
    cardSize:    meta.category === 'visual' && (type === 'divider' || type === 'emoji') ? 'compact' : 'medium',
  })),
];

// ── Category tab definitions ──────────────────────────────────────────────────

const TABS = [
  { id: 'all',       label: 'All'      },
  { id: 'focus',     label: 'Focus'    },
  { id: 'capture',   label: 'Capture'  },
  { id: 'writing',   label: 'Writing'  },
  { id: 'visual',    label: 'Visual'   },
  { id: 'resources', label: 'Resources'},
] as const;

type TabId = typeof TABS[number]['id'];

// ── Label style ───────────────────────────────────────────────────────────────

const CAP: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  fontWeight:    700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
};

// ── Mini previews — evocative CSS/SVG ─────────────────────────────────────────
// These are purely decorative. They communicate what an item LOOKS LIKE before adding.

function PreviewTimer({ accent }: { accent: string }) {
  return (
    <svg width="52" height="36" viewBox="0 0 52 36" style={{ display: 'block' }}>
      <circle cx="26" cy="18" r="13" fill="none" stroke={accent + '25'} strokeWidth="2.5" />
      <circle cx="26" cy="18" r="13" fill="none" stroke={accent} strokeWidth="2.5"
        strokeDasharray="81.7" strokeDashoffset="28" strokeLinecap="round"
        transform="rotate(-90 26 18)" />
      <text x="26" y="22" textAnchor="middle" fontSize="7" fontWeight="600"
        fontFamily="'Space Grotesk', sans-serif" fill={accent}>25:00</text>
    </svg>
  );
}

function PreviewToday({ accent, muted }: { accent: string; muted: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '52px' }}>
      {[
        { w: '100%', h: '3px', color: accent },
        { w: '80%',  h: '2px', color: muted },
        { w: '90%',  h: '2px', color: muted },
        { w: '60%',  h: '2px', color: muted },
      ].map((r, i) => (
        <div key={i} style={{ width: r.w, height: r.h, borderRadius: '2px', backgroundColor: r.color }} />
      ))}
    </div>
  );
}

function PreviewFocusMode({ accent }: { accent: string }) {
  return (
    <svg width="52" height="36" viewBox="0 0 52 36" style={{ display: 'block' }}>
      <circle cx="26" cy="18" r="14" fill="none" stroke={accent + '15'} strokeWidth="1" />
      <circle cx="26" cy="18" r="9"  fill="none" stroke={accent + '30'} strokeWidth="1" />
      <circle cx="26" cy="18" r="4"  fill={accent} />
    </svg>
  );
}

function PreviewMomentum({ accent, muted }: { accent: string; muted: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '52px' }}>
      {[0.75, 0.45, 0.9].map((p, i) => (
        <div key={i} style={{ position: 'relative', height: '4px', borderRadius: '3px', backgroundColor: muted + '50' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p * 100}%`, borderRadius: '3px', backgroundColor: i === 0 ? accent : accent + '60' }} />
        </div>
      ))}
    </div>
  );
}

function PreviewCapture({ accent, border }: { accent: string; border: string }) {
  return (
    <div style={{ width: '52px', height: '20px', borderRadius: '6px', border: `1px solid ${border}`, display: 'flex', alignItems: 'center', padding: '0 6px', gap: '4px' }}>
      <div style={{ width: '2px', height: '10px', backgroundColor: accent, borderRadius: '1px', animation: 'none' }} />
      <div style={{ flex: 1, height: '2px', borderRadius: '1px', backgroundColor: border }} />
    </div>
  );
}

function PreviewText({ muted }: { muted: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '52px' }}>
      {[1, 0.85, 1, 0.7].map((w, i) => (
        <div key={i} style={{ width: `${w * 100}%`, height: '2.5px', borderRadius: '2px', backgroundColor: muted + '70' }} />
      ))}
    </div>
  );
}

function PreviewQuote({ accent }: { accent: string }) {
  return (
    <div style={{ width: '52px', display: 'flex', gap: '6px' }}>
      <div style={{ width: '2.5px', height: '28px', borderRadius: '2px', backgroundColor: accent, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, paddingTop: '4px' }}>
        {[0.9, 0.8, 0.6].map((w, i) => (
          <div key={i} style={{ width: `${w * 100}%`, height: '2.5px', borderRadius: '2px', backgroundColor: accent + '50' }} />
        ))}
      </div>
    </div>
  );
}

function PreviewChecklist({ accent, muted }: { accent: string; muted: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '52px' }}>
      {[true, true, false].map((checked, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0,
            backgroundColor: checked ? accent : 'transparent',
            border: `1.5px solid ${checked ? accent : muted}`,
          }} />
          <div style={{ flex: 1, height: '2.5px', borderRadius: '2px', backgroundColor: checked ? muted + '50' : muted + '80' }} />
        </div>
      ))}
    </div>
  );
}

function PreviewDivider({ accent }: { accent: string }) {
  return (
    <div style={{ width: '52px', height: '3px', borderRadius: '2px', background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
  );
}

function PreviewGeneric({ icon }: { icon: string }) {
  return <span style={{ fontSize: '20px', lineHeight: 1, display: 'block' }}>{icon}</span>;
}

function ItemPreview({ item, tokens }: { item: CatalogItem; tokens: AtmosphereTokens }) {
  const a = tokens.accent;
  const m = tokens.textGhost;
  const b = tokens.cardBorder;
  const id = item.kind === 'module' ? item.id : item.blockType;

  switch (id) {
    case 'deep-work-timer':  return <PreviewTimer accent={a} />;
    case 'today':            return <PreviewToday accent={a} muted={m} />;
    case 'focus-mode':       return <PreviewFocusMode accent={a} />;
    case 'momentum':         return <PreviewMomentum accent={a} muted={m} />;
    case 'capture':          return <PreviewCapture accent={a} border={b} />;
    case 'text':             return <PreviewText muted={m} />;
    case 'quote':            return <PreviewQuote accent={a} />;
    case 'checklist':        return <PreviewChecklist accent={a} muted={m} />;
    case 'divider':          return <PreviewDivider accent={a} />;
    default:                 return <PreviewGeneric icon={item.icon} />;
  }
}

// ── Main panel ────────────────────────────────────────────────────────────────

// ── Core 4 items (always shown first, no search, all tab) ────────────────────

const CORE_IDS = ['capture', 'deep-work-timer', 'text', 'checklist'] as const;

// Value-first descriptions for core items (override catalog descriptions)
const CORE_COPY: Record<string, { headline: string; body: string }> = {
  'capture':         { headline: 'Capture thoughts',    body: 'Write anything — tasks, worries, ideas. Clear your head first.' },
  'deep-work-timer': { headline: 'Focus timer',         body: 'Block time to work on one thing. No distractions.' },
  'text':            { headline: 'Write a note',        body: 'Freeform writing, journaling, or thinking on paper.' },
  'checklist':       { headline: 'Create a checklist',  body: 'Break a goal into small, checkable steps.' },
};

export function AddWorkspacePanel({ open, modules, tokens, onToggle, onAddBlock, onOpenCreateTool, onClose }: Props) {
  const [search,     setSearch]     = useState('');
  const [activeTab,  setActiveTab]  = useState<TabId>('all');
  const [moreOpen,   setMoreOpen]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setSearch(''); setActiveTab('all'); return; }
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const enabledIds = new Set(modules.filter(m => m.enabled).map(m => m.id));

  // ── Filter + search ────────────────────────────────────────────────────────

  const q = search.toLowerCase().trim();
  const filtered = CATALOG.filter(item => {
    const matchesTab = activeTab === 'all' || item.category === activeTab;
    if (!matchesTab) return false;
    if (!q) return true;
    return (
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tagline.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Separate by card size for visual grouping
  const large   = filtered.filter(i => i.cardSize === 'large');
  const medium  = filtered.filter(i => i.cardSize === 'medium');
  const compact = filtered.filter(i => i.cardSize === 'compact');

  // ── Add handler ───────────────────────────────────────────────────────────

  const handleAdd = (item: CatalogItem) => {
    if (item.kind === 'module') {
      // Always enable (idempotent). No toggle — only adds.
      if (!enabledIds.has(item.id)) onToggle(item.id);
    } else {
      onAddBlock(item.blockType);
    }
    onClose();
  };

  const isOnCanvas = (item: CatalogItem) =>
    item.kind === 'module' && enabledIds.has(item.id);

  // ── Shared styles ─────────────────────────────────────────────────────────

  const panelBg: React.CSSProperties = {
    backgroundColor: tokens.cardBg,
    border:          `1px solid ${tokens.cardBorderHover}`,
    borderRadius:    `${tokens.radius}px`,
    boxShadow:       `0 32px 96px rgba(0,0,0,0.75), 0 0 0 1px ${tokens.accentGlow}`,
  };

  // ── Large card (focus tools) ───────────────────────────────────────────────

  function LargeCard({ item }: { item: CatalogItem }) {
    const active = isOnCanvas(item);
    return (
      <button
        onClick={() => handleAdd(item)}
        style={{
          display:         'flex',
          flexDirection:   'column',
          gap:             '14px',
          padding:         '18px',
          borderRadius:    `${Math.max(tokens.radius - 4, 12)}px`,
          border:          `1px solid ${active ? tokens.accent + '35' : tokens.cardBorder}`,
          backgroundColor: active ? tokens.accentSubtle : tokens.pageBg,
          cursor:          active ? 'default' : 'pointer',
          textAlign:       'left',
          transition:      'all 0.15s ease',
          position:        'relative',
          opacity:         active ? 0.6 : 1,
        }}
        onMouseEnter={e => {
          if (active) return;
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = tokens.accent + '60';
          el.style.backgroundColor = tokens.accentSubtle;
          el.style.transform = 'translateY(-1px)';
          el.style.boxShadow = `0 6px 24px ${tokens.accentGlow}`;
        }}
        onMouseLeave={e => {
          if (active) return;
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = tokens.cardBorder;
          el.style.backgroundColor = tokens.pageBg;
          el.style.transform = 'none';
          el.style.boxShadow = 'none';
        }}
      >
        {/* Top row: preview + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            width: '52px', height: '36px',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          }}>
            <ItemPreview item={item} tokens={tokens} />
          </div>
          {active && (
            <div style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '4px',
              padding:      '3px 8px',
              borderRadius: '20px',
              backgroundColor: tokens.accentSubtle,
              border:       `1px solid ${tokens.accent}30`,
            }}>
              <Check style={{ width: '9px', height: '9px', color: tokens.accent }} />
              <span style={{ ...CAP, fontSize: '8px', color: tokens.accent }}>On canvas</span>
            </div>
          )}
        </div>

        {/* Text */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
            <p style={{
              fontFamily:    "'Plus Jakarta Sans', sans-serif",
              fontSize:      '13px',
              fontWeight:    700,
              color:         tokens.textPrimary,
              letterSpacing: '-0.01em',
              margin:        0,
            }}>
              {item.label}
            </p>
          </div>
          <p style={{ fontSize: '11px', lineHeight: 1.5, color: tokens.textMuted, margin: 0 }}>
            {item.tagline}
          </p>
        </div>

        {/* Add hint */}
        {!active && (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '5px',
            color:        tokens.accent,
            opacity:      0,
            transition:   'opacity 0.12s',
          }}
          className="add-hint"
          >
            <Plus style={{ width: '10px', height: '10px' }} />
            <span style={{ ...CAP, fontSize: '8px' }}>Add to workspace</span>
          </div>
        )}
      </button>
    );
  }

  // ── Medium card ────────────────────────────────────────────────────────────

  function MediumCard({ item }: { item: CatalogItem }) {
    const active = isOnCanvas(item);
    return (
      <button
        onClick={() => handleAdd(item)}
        style={{
          display:         'flex',
          alignItems:      'flex-start',
          gap:             '12px',
          padding:         '13px 14px',
          borderRadius:    `${Math.max(tokens.radius - 4, 12)}px`,
          border:          `1px solid ${active ? tokens.accent + '25' : tokens.cardBorder}`,
          backgroundColor: active ? tokens.accentSubtle : tokens.pageBg,
          cursor:          active ? 'default' : 'pointer',
          textAlign:       'left',
          transition:      'all 0.15s ease',
          opacity:         active ? 0.55 : 1,
        }}
        onMouseEnter={e => {
          if (active) return;
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = tokens.accent + '50';
          el.style.backgroundColor = tokens.accentSubtle;
          el.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          if (active) return;
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = tokens.cardBorder;
          el.style.backgroundColor = tokens.pageBg;
          el.style.transform = 'none';
        }}
      >
        {/* Icon */}
        <div style={{
          width:           '32px',
          height:          '32px',
          borderRadius:    '9px',
          flexShrink:      0,
          backgroundColor: active ? tokens.accentSubtle : `${tokens.accent}12`,
          border:          `1px solid ${tokens.accent}20`,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          fontSize:        '15px',
          lineHeight:      1,
        }}>
          {item.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <p style={{
              fontFamily:    "'Plus Jakarta Sans', sans-serif",
              fontSize:      '12px',
              fontWeight:    700,
              color:         tokens.textPrimary,
              margin:        0,
              letterSpacing: '-0.01em',
            }}>
              {item.label}
            </p>
            {active
              ? <Check style={{ width: '11px', height: '11px', color: tokens.accent, flexShrink: 0 }} />
              : <Plus  style={{ width: '11px', height: '11px', color: tokens.textGhost, flexShrink: 0, opacity: 0 }} className="add-hint-icon" />
            }
          </div>
          <p style={{ fontSize: '10px', lineHeight: 1.45, color: tokens.textMuted, margin: '2px 0 0' }}>
            {item.description}
          </p>
        </div>
      </button>
    );
  }

  // ── Compact row (divider, sticker, etc.) ──────────────────────────────────

  function CompactRow({ item }: { item: CatalogItem }) {
    return (
      <button
        onClick={() => handleAdd(item)}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             '10px',
          padding:         '9px 12px',
          borderRadius:    '9px',
          border:          '1px solid transparent',
          backgroundColor: 'transparent',
          cursor:          'pointer',
          textAlign:       'left',
          transition:      'all 0.12s ease',
          width:           '100%',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = tokens.accentSubtle;
          el.style.borderColor = `${tokens.accent}30`;
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.backgroundColor = 'transparent';
          el.style.borderColor = 'transparent';
        }}
      >
        <span style={{ fontSize: '14px', lineHeight: 1, flexShrink: 0, width: '20px', textAlign: 'center' }}>
          {item.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize:  '12px',
            fontWeight: 600,
            color:     tokens.textSecondary,
          }}>
            {item.label}
          </span>
          <span style={{ fontSize: '11px', color: tokens.textGhost, marginLeft: '8px' }}>
            {item.description}
          </span>
        </div>
        <Plus style={{ width: '12px', height: '12px', color: tokens.textGhost, flexShrink: 0 }} />
      </button>
    );
  }

  // ── Section label ────────────────────────────────────────────────────────

  function SectionLabel({ label, count }: { label: string; count?: number }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', marginTop: '4px' }}>
        <span style={{ ...CAP, color: tokens.textGhost }}>{label}</span>
        {count !== undefined && (
          <span style={{ ...CAP, fontSize: '8px', color: tokens.textGhost, opacity: 0.5 }}>
            {count}
          </span>
        )}
        <div style={{ flex: 1, height: '1px', backgroundColor: tokens.divider }} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasResults = large.length > 0 || medium.length > 0 || compact.length > 0;

  return (
    <>
      {/* Backdrop — intentionally light so the canvas stays visible */}
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed z-50 flex flex-col animate-slide-up"
        style={{
          bottom:    '88px',
          left:      '50%',
          transform: 'translateX(-50%)',
          width:     'min(680px, calc(100vw - 32px))',
          maxHeight: '72vh',
          ...panelBg,
          overflow:  'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            padding:      '16px 18px 14px',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            flexShrink:   0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h3 style={{
                fontFamily:    "'Plus Jakarta Sans', sans-serif",
                fontSize:      '15px',
                fontWeight:    800,
                letterSpacing: '-0.02em',
                color:         tokens.textPrimary,
                margin:        0,
              }}>
                Add to your workspace
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                <p style={{ ...CAP, fontSize: '9px', color: tokens.textGhost, margin: 0 }}>
                  {modules.filter(m => m.enabled).length} items on canvas
                </p>
                <kbd style={{
                  fontFamily:      "'Space Grotesk', monospace",
                  fontSize:        '9px',
                  fontWeight:      600,
                  padding:         '1px 5px',
                  borderRadius:    '5px',
                  border:          `1px solid ${tokens.cardBorderHover}`,
                  backgroundColor: tokens.wellBg,
                  color:           tokens.textGhost,
                  letterSpacing:   '0.03em',
                  lineHeight:      '1.6',
                }}>
                  ⌘K
                </kbd>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width:           '28px',
                height:          '28px',
                borderRadius:    '8px',
                border:          'none',
                backgroundColor: 'transparent',
                cursor:          'pointer',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                color:           tokens.textGhost,
                transition:      'all 0.12s ease',
                flexShrink:      0,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBorder;
                (e.currentTarget as HTMLElement).style.color = tokens.textPrimary;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLElement).style.color = tokens.textGhost;
              }}
            >
              <X style={{ width: '14px', height: '14px' }} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search style={{
              position: 'absolute', left: '11px', top: '50%',
              transform: 'translateY(-50%)',
              width: '13px', height: '13px',
              color: tokens.textGhost, pointerEvents: 'none',
            }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="What do you want to add?"
              style={{
                width:           '100%',
                padding:         '9px 12px 9px 32px',
                borderRadius:    '10px',
                border:          `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.wellBg,
                color:           tokens.textPrimary,
                fontSize:        '13px',
                outline:         'none',
                fontFamily:      'inherit',
                transition:      'border-color 0.15s ease',
                caretColor:      tokens.accent,
                boxSizing:       'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = tokens.focusBorder)}
              onBlur={e  => (e.currentTarget.style.borderColor = tokens.cardBorder)}
            />
          </div>
        </div>

        {/* ── Category tabs ───────────────────────────────────────────────── */}
        {!search && (
          <div
            style={{
              display:        'flex',
              gap:            '2px',
              padding:        '8px 14px',
              borderBottom:   `1px solid ${tokens.cardBorder}`,
              flexShrink:     0,
              overflowX:      'auto',
              scrollbarWidth: 'none',
            }}
          >
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding:         '5px 12px',
                    borderRadius:    '20px',
                    border:          `1px solid ${isActive ? tokens.accent + '40' : 'transparent'}`,
                    backgroundColor: isActive ? tokens.accentSubtle : 'transparent',
                    color:           isActive ? tokens.accent : tokens.textGhost,
                    fontSize:        '11px',
                    fontWeight:      isActive ? 700 : 500,
                    cursor:          'pointer',
                    whiteSpace:      'nowrap',
                    transition:      'all 0.12s ease',
                    fontFamily:      "'Space Grotesk', sans-serif",
                    letterSpacing:   '0.02em',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.color = tokens.textSecondary;
                      (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBorder;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.color = tokens.textGhost;
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div
          className="fw-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px' }}
        >
          {!hasResults ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: tokens.textGhost }}>
              <p style={{ fontSize: '13px', marginBottom: '4px', color: tokens.textMuted }}>
                Nothing matches "{search}"
              </p>
              <p style={{ fontSize: '11px' }}>Try "timer", "notes", "capture", or "checklist"</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* ── Core 4: shown when on All tab with no search ── */}
              {activeTab === 'all' && !search && (() => {
                const coreItems = CORE_IDS.map(cid => CATALOG.find(c =>
                  (c.kind === 'module' && c.id === cid) ||
                  (c.kind === 'block'  && c.blockType === cid)
                )).filter(Boolean) as CatalogItem[];

                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ ...CAP, color: tokens.textGhost }}>Get started</span>
                        <span style={{
                          fontSize: '9px', fontWeight: 700,
                          padding: '1px 5px', borderRadius: '4px',
                          backgroundColor: `${tokens.accent}15`,
                          color: tokens.accent,
                        }}>Recommended</span>
                      </div>
                    </div>
                    <div style={{
                      display:             'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap:                 '6px',
                    }}>
                      {coreItems.map(item => {
                        const cid = item.kind === 'module' ? item.id : item.blockType;
                        const copy = CORE_COPY[cid as string] ?? { headline: item.label, body: item.tagline };
                        const active = isOnCanvas(item);
                        return (
                          <button
                            key={cid}
                            onClick={() => handleAdd(item)}
                            style={{
                              display:         'flex',
                              alignItems:      'flex-start',
                              gap:             '10px',
                              padding:         '12px 14px',
                              borderRadius:    '12px',
                              border:          `1px solid ${active ? tokens.accent + '35' : tokens.cardBorder}`,
                              backgroundColor: active ? tokens.accentSubtle : tokens.pageBg,
                              cursor:          'pointer',
                              textAlign:       'left' as const,
                              transition:      'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              if (active) return;
                              const el = e.currentTarget as HTMLElement;
                              el.style.borderColor = `${tokens.accent}50`;
                              el.style.backgroundColor = tokens.accentSubtle;
                            }}
                            onMouseLeave={e => {
                              if (active) return;
                              const el = e.currentTarget as HTMLElement;
                              el.style.borderColor = tokens.cardBorder;
                              el.style.backgroundColor = tokens.pageBg;
                            }}
                          >
                            <span style={{
                              fontSize:        '20px',
                              lineHeight:      1,
                              flexShrink:      0,
                              marginTop:       '1px',
                            }}>
                              {item.icon}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '12px', fontWeight: 700, color: active ? tokens.accent : tokens.textPrimary, margin: 0 }}>
                                {copy.headline}
                                {active && <span style={{ marginLeft: '6px', fontSize: '9px', opacity: 0.7 }}>✓ on canvas</span>}
                              </p>
                              <p style={{ fontSize: '10px', color: tokens.textMuted, margin: '2px 0 0', lineHeight: 1.4 }}>
                                {copy.body}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* More tools toggle */}
                    <button
                      onClick={() => setMoreOpen(o => !o)}
                      style={{
                        marginTop:       '12px',
                        width:           '100%',
                        display:         'flex',
                        alignItems:      'center',
                        justifyContent:  'center',
                        gap:             '5px',
                        padding:         '7px 0',
                        borderRadius:    '8px',
                        border:          `1px solid ${tokens.cardBorder}`,
                        backgroundColor: 'transparent',
                        cursor:          'pointer',
                        fontSize:        '11px',
                        fontWeight:      600,
                        color:           tokens.textGhost,
                        transition:      'all 0.15s ease',
                        fontFamily:      "'Space Grotesk', sans-serif",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
                        (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
                      }}
                    >
                      {moreOpen ? '↑ Less' : '↓ More tools'}
                    </button>
                  </div>
                );
              })()}

              {/* ── Full catalog (shown when: not all-tab default, or more is open) ── */}
              {(activeTab !== 'all' || search || moreOpen) && (
                <>

              {/* Large cards — Focus tools */}
              {large.length > 0 && (
                <div>
                  <SectionLabel label="Focus Tools" count={large.length} />
                  <div style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap:                 '8px',
                  }}>
                    {large.map(item => (
                      <LargeCard key={item.kind === 'module' ? item.id : item.blockType} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Medium cards — writing, capture, resources */}
              {medium.length > 0 && (
                <div>
                  {/* Show category label only in "All" view */}
                  {activeTab === 'all' && (
                    <SectionLabel
                      label={
                        medium[0].category === 'writing'   ? 'Writing & Thinking' :
                        medium[0].category === 'capture'   ? 'Capture' :
                        medium[0].category === 'resources' ? 'Resources' : 'Other'
                      }
                      count={medium.length}
                    />
                  )}
                  {activeTab !== 'all' && <SectionLabel label={activeTab === 'focus' ? 'More modules' : activeTab} />}
                  <div style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap:                 '6px',
                  }}>
                    {medium.map(item => (
                      <MediumCard key={item.kind === 'module' ? item.id : item.blockType} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Compact rows — visual utilities */}
              {compact.length > 0 && (
                <div>
                  <SectionLabel label="Visual" count={compact.length} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {compact.map(item => (
                      <CompactRow key={item.kind === 'module' ? item.id : item.blockType} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Tools section */}
              {onOpenCreateTool && (activeTab === 'all' || activeTab === 'focus') && (
                <div>
                  <SectionLabel label="Custom Tools" />
                  <button
                    onClick={() => { onOpenCreateTool(); onClose(); }}
                    style={{
                      width:           '100%',
                      display:         'flex',
                      alignItems:      'center',
                      gap:             '12px',
                      padding:         '12px 14px',
                      borderRadius:    '12px',
                      border:          `1.5px dashed ${tokens.accent}40`,
                      backgroundColor: `${tokens.accent}06`,
                      cursor:          'pointer',
                      textAlign:       'left' as const,
                      transition:      'all 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = `${tokens.accent}80`;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${tokens.accent}10`;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = `${tokens.accent}40`;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${tokens.accent}06`;
                    }}
                  >
                    <div style={{
                      width:           '36px',
                      height:          '36px',
                      borderRadius:    '10px',
                      backgroundColor: `${tokens.accent}15`,
                      border:          `1px solid ${tokens.accent}25`,
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      flexShrink:      0,
                      fontSize:        '18px',
                    }}>
                      🧮
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                        Create a calculator or formula tool
                      </p>
                      <p style={{ fontSize: '10px', color: tokens.textMuted, margin: 0, marginTop: '2px', lineHeight: 1.4 }}>
                        Grade averager · budget splitter · study hours tracker — no code needed
                      </p>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: tokens.accent, opacity: 0.8 }}>
                      Build →
                    </span>
                  </button>
                </div>
              )}

                </>
              )}
              {/* end full catalog */}

            </div>
          )}
        </div>

      </div>

      {/* ── Inline style for hover "add hint" child elements ── */}
      <style>{`
        button:hover .add-hint { opacity: 1 !important; }
        button:hover .add-hint-icon { opacity: 1 !important; }
      `}</style>
    </>
  );
}
