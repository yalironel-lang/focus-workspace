import { useEffect, useState, useRef } from 'react';
import { X, Trash2, RotateCcw, Copy, ChevronDown, ChevronUp, Check, Plus } from 'lucide-react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleConfig, ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import {
  GlobalTheme, ModuleTheme, DesignTokens, ThemePreset, UserPreset,
  AccentPreset, SurfaceStyle, RadiusStyle, DensityStyle,
  GlowIntensity, MotionIntensity, TypographyScale, BackgroundStyle, BorderStyle,
  ACCENT_PALETTE, ACCENT_LABELS, SURFACE_LABELS, RADIUS_LABELS, BG_META, GLOW_MULT,
} from '../../hooks/useWorkspaceTheme';
import { getMeta } from '../../modules/registry';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:              boolean;
  selectedId:        string | null;
  modules:           ModuleConfig[];
  tokens:            AtmosphereTokens;
  design:            DesignTokens;
  global:            GlobalTheme;
  moduleThemes:      Record<string, ModuleTheme>;
  presets:           ThemePreset[];
  userPresets:       UserPreset[];
  defaultTab?:       Tab;
  onClose:           () => void;
  onSetSize:         (id: string, size: ModuleSize) => void;
  onMoveUp:          (id: string) => void;
  onMoveDown:        (id: string) => void;
  onRemove:          (id: string) => void;
  onDuplicate:       (id: string) => void;
  updateGlobal:      (patch: Partial<GlobalTheme>) => void;
  applyPreset:       (id: string) => void;
  saveAsPreset:      (name: string, emoji: string) => string;
  deleteUserPreset:  (id: string) => void;
  updateModule:      (id: string, patch: Partial<ModuleTheme>) => void;
  resetModule:       (id: string) => void;
}

type Tab = 'module' | 'theme' | 'presets';

const SIZES: ModuleSize[] = ['third', 'half', 'two-thirds', 'full'];

// ─────────────────────────────────────────────────────────────────────────────
// Shared design constants
// ─────────────────────────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '10px',
  letterSpacing: '0.13em',
  textTransform: 'uppercase' as const,
  fontWeight:    700,
};

// ─────────────────────────────────────────────────────────────────────────────
// Micro primitives
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  label, tokens, children, defaultOpen = true,
}: {
  label:        string;
  tokens:       AtmosphereTokens;
  children:     React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span style={{ ...LABEL, color: tokens.textGhost }}>{label}</span>
        {open
          ? <ChevronUp  className="w-3 h-3" style={{ color: tokens.textGhost }} />
          : <ChevronDown className="w-3 h-3" style={{ color: tokens.textGhost }} />
        }
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function SegControl<T extends string>({
  options, value, onChange, tokens, size = 'md',
}: {
  options: { value: T; label: string }[];
  value:   T;
  onChange:(v: T) => void;
  tokens:  AtmosphereTokens;
  size?:   'sm' | 'md';
}) {
  const py  = size === 'sm' ? '4px' : '6px';
  const fs  = size === 'sm' ? '10px' : '11px';
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex:            1,
            padding:         `${py} 2px`,
            fontSize:        fs,
            fontWeight:      600,
            borderRadius:    '8px',
            cursor:          'pointer',
            transition:      'all 0.12s ease',
            color:           o.value === value ? '#000' : tokens.textMuted,
            backgroundColor: o.value === value ? tokens.accent : tokens.wellBg,
            border:         `1px solid ${o.value === value ? tokens.accent : tokens.cardBorder}`,
            boxShadow:       o.value === value ? `0 0 10px ${tokens.accentGlow}` : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AccentSwatches({
  value, customHex, onChange, onCustom, tokens, small,
}: {
  value:     AccentPreset;
  customHex: string;
  onChange:  (v: AccentPreset) => void;
  onCustom:  (hex: string) => void;
  tokens:    AtmosphereTokens;
  small?:    boolean;
}) {
  const sz = small ? '20px' : '24px';
  const presets: AccentPreset[] = ['amber', 'violet', 'cyan', 'emerald', 'rose', 'blue'];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          title={ACCENT_LABELS[p]}
          style={{
            width:        sz,
            height:       sz,
            borderRadius: '50%',
            border:       p === value
              ? `3px solid ${tokens.textPrimary}`
              : '2px solid transparent',
            backgroundColor: ACCENT_PALETTE[p].color,
            boxShadow:    p === value
              ? `0 0 0 1px ${tokens.cardBorder}, 0 0 10px ${ACCENT_PALETTE[p].glow}`
              : 'none',
            cursor:       'pointer',
            transition:   'all 0.12s ease',
            flexShrink:   0,
          }}
        />
      ))}
      {/* Custom color input */}
      <label title="Custom color" style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <input
          type="color"
          value={customHex}
          onChange={e => onCustom(e.target.value)}
          style={{ position: 'absolute', width: sz, height: sz, opacity: 0, cursor: 'pointer', top: 0, left: 0 }}
        />
        <div
          title="Custom"
          style={{
            width:        sz,
            height:       sz,
            borderRadius: '50%',
            border:       value === 'custom'
              ? `3px solid ${tokens.textPrimary}`
              : `2px dashed ${tokens.cardBorderHover}`,
            background:   value === 'custom'
              ? customHex
              : `conic-gradient(from 0deg, #f59e0b 0%, #10b981 33%, #8b5cf6 66%, #f43f5e 100%)`,
            boxShadow:    value === 'custom' ? `0 0 10px ${customHex}80` : 'none',
            cursor:       'pointer',
          }}
        />
      </label>
    </div>
  );
}

function SurfaceGrid({
  value, onChange, tokens, design,
}: {
  value:   SurfaceStyle;
  onChange:(v: SurfaceStyle) => void;
  tokens:  AtmosphereTokens;
  design:  DesignTokens;
}) {
  const opts: { v: SurfaceStyle; label: string; hint: string }[] = [
    { v: 'glass',      label: SURFACE_LABELS['glass'],      hint: 'Blur' },
    { v: 'solid',      label: SURFACE_LABELS['solid'],      hint: 'Flat' },
    { v: 'soft-card',  label: SURFACE_LABELS['soft-card'],  hint: 'Soft' },
    { v: 'floating',   label: SURFACE_LABELS['floating'],   hint: 'Elevated' },
    { v: 'borderless', label: SURFACE_LABELS['borderless'], hint: 'Clean' },
  ];
  const r = Math.min(design.radius, 10);
  return (
    <div className="grid grid-cols-5 gap-1">
      {opts.map(o => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            title={o.hint}
            style={{
              padding:         '7px 2px',
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              gap:             '4px',
              borderRadius:    `${r}px`,
              cursor:          'pointer',
              transition:      'all 0.12s ease',
              backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
              border:         `1px solid ${active ? tokens.accent + '60' : tokens.cardBorder}`,
            }}
          >
            {/* Visual swatch */}
            <div
              style={{
                width:           '18px',
                height:          '12px',
                borderRadius:    '3px',
                backgroundColor: active ? tokens.accent + '30' : tokens.cardBg,
                border:         o.v === 'borderless'
                  ? '1px dashed ' + tokens.cardBorder
                  : `1px solid ${active ? tokens.accent + '50' : tokens.cardBorderHover}`,
                boxShadow:       o.v === 'floating'
                  ? `0 3px 6px rgba(0,0,0,0.5)`
                  : o.v === 'glass'
                  ? `inset 0 0 0 1px rgba(255,255,255,0.06)`
                  : 'none',
              }}
            />
            <span style={{
              fontSize:      '8px',
              fontWeight:    700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
              color:         active ? tokens.accent : tokens.textMuted,
            }}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BgGrid({
  value, onChange, tokens, design,
}: {
  value:   BackgroundStyle;
  onChange:(v: BackgroundStyle) => void;
  tokens:  AtmosphereTokens;
  design:  DesignTokens;
}) {
  const opts: BackgroundStyle[] = ['deep-night', 'soft-gradient', 'grid-canvas', 'ambient-glow', 'minimal-black', 'warm-study'];

  const bgSwatches: Record<BackgroundStyle, string> = {
    'deep-night':    'linear-gradient(135deg, #070b14, #0d1424)',
    'soft-gradient': `linear-gradient(135deg, ${tokens.pageBg}, ${tokens.accentSubtle})`,
    'grid-canvas':   `repeating-linear-gradient(0deg, ${tokens.cardBorder}30 0, ${tokens.cardBorder}30 1px, transparent 1px, transparent 12px),
                      repeating-linear-gradient(90deg, ${tokens.cardBorder}30 0, ${tokens.cardBorder}30 1px, transparent 1px, transparent 12px)`,
    'ambient-glow':  `radial-gradient(circle at 30% 30%, ${tokens.accentGlow}, ${tokens.pageBg})`,
    'minimal-black': 'linear-gradient(135deg, #050508, #0a0a0f)',
    'warm-study':    'linear-gradient(135deg, #0f0d0a, #1a1208)',
  };

  const r = Math.min(design.radius, 10);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {opts.map(s => {
        const m      = BG_META[s];
        const active = s === value;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              padding:      '0',
              borderRadius: `${r}px`,
              overflow:     'hidden',
              cursor:       'pointer',
              transition:   'all 0.12s ease',
              border:      `2px solid ${active ? tokens.accent : tokens.cardBorder}`,
              boxShadow:    active ? `0 0 10px ${tokens.accentGlow}` : 'none',
            }}
          >
            {/* Color swatch */}
            <div
              style={{
                height:     '32px',
                background: bgSwatches[s],
              }}
            />
            {/* Label row */}
            <div
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             '5px',
                padding:         '5px 7px',
                backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
              }}
            >
              <span style={{ fontSize: '10px', lineHeight: 1 }}>{m.emoji}</span>
              <span style={{
                fontSize:      '9px',
                fontWeight:    700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase' as const,
                color:         active ? tokens.accent : tokens.textSecondary,
              }}>
                {m.name}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function GlowPreviewDots({ value, tokens }: { value: GlowIntensity; tokens: AtmosphereTokens }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      {(Object.entries(GLOW_MULT) as [GlowIntensity, number][]).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              width:           '8px',
              height:          '8px',
              borderRadius:    '50%',
              backgroundColor: tokens.accent,
              boxShadow:       v > 0 ? `0 0 ${Math.round(v * 14)}px ${tokens.accentGlow}` : 'none',
              opacity:         k === value ? 1 : 0.25,
              transition:      'all 0.2s ease',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Toggle({
  value, onChange, tokens,
}: { value: boolean; onChange: (v: boolean) => void; tokens: AtmosphereTokens }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width:           '38px',
        height:          '22px',
        borderRadius:    '11px',
        position:        'relative',
        border:         `1px solid ${value ? tokens.accent : tokens.cardBorder}`,
        backgroundColor: value ? tokens.accentSubtle : tokens.wellBg,
        cursor:          'pointer',
        transition:      'all 0.15s ease',
        flexShrink:      0,
      }}
    >
      <div
        style={{
          position:        'absolute',
          top:             '3px',
          left:            value ? '18px' : '3px',
          width:           '14px',
          height:          '14px',
          borderRadius:    '50%',
          backgroundColor: value ? tokens.accent : tokens.textGhost,
          transition:      'all 0.15s ease',
          boxShadow:       value ? `0 0 6px ${tokens.accentGlow}` : 'none',
        }}
      />
    </button>
  );
}

function AmbientDots({ value, onChange, tokens }: {
  value: number; onChange: (v: number) => void; tokens: AtmosphereTokens;
}) {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-2">
      {steps.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          style={{
            width:        '20px',
            height:       '20px',
            borderRadius: '50%',
            border:       Math.abs(value - s) < 0.01
              ? `2px solid ${tokens.accent}`
              : `2px solid ${tokens.cardBorder}`,
            backgroundColor: s === 0
              ? tokens.wellBg
              : tokens.accent + Math.round(s * 180).toString(16).padStart(2, '0'),
            cursor:     'pointer',
            transition: 'all 0.12s ease',
            boxShadow:  Math.abs(value - s) < 0.01 ? `0 0 6px ${tokens.accentGlow}` : 'none',
          }}
          title={`${Math.round(s * 100)}%`}
        />
      ))}
      <span style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Module tab — with preview card, rename, duplicate
// ─────────────────────────────────────────────────────────────────────────────

function ModulePreviewCard({
  selectedId, moduleTheme, tokens, design,
}: {
  selectedId:  string;
  moduleTheme: ModuleTheme;
  tokens:      AtmosphereTokens;
  design:      DesignTokens;
}) {
  const meta     = getMeta(selectedId);
  const aPreset  = moduleTheme?.accentPreset;
  const aCustom  = moduleTheme?.accentCustom;
  const accent   = aPreset && aPreset !== 'custom'
    ? ACCENT_PALETTE[aPreset].color
    : aCustom ?? tokens.accent;
  const glow     = aPreset && aPreset !== 'custom'
    ? ACCENT_PALETTE[aPreset].glow
    : `${accent}60`;
  const label    = moduleTheme?.customTitle ?? meta?.label ?? selectedId;
  const r        = design.radius;

  return (
    <div
      style={{
        margin:       '16px 16px 0',
        borderRadius: `${r}px`,
        overflow:     'hidden',
        position:     'relative',
        background:   `linear-gradient(135deg, ${accent}1a 0%, ${accent}08 100%)`,
        border:       `1px solid ${accent}35`,
        padding:      '20px 16px 16px',
        display:      'flex',
        alignItems:   'center',
        gap:          '14px',
        boxShadow:    `0 4px 24px ${glow}`,
      }}
    >
      {/* Ambient glow behind icon */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle at 15% 50%, ${accent}18, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Icon */}
      <div
        style={{
          width:           '44px',
          height:          '44px',
          borderRadius:    `${Math.min(r, 14)}px`,
          backgroundColor: `${accent}20`,
          border:         `1px solid ${accent}35`,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
          position:        'relative',
        }}
      >
        <span style={{ fontSize: '20px', lineHeight: 1 }}>{meta?.icon ?? '◻'}</span>
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: accent, marginBottom: '2px' }}>
          {label}
        </p>
        {meta?.description && (
          <p style={{ fontSize: '11px', color: tokens.textGhost, lineHeight: 1.4 }}>
            {meta.description}
          </p>
        )}
      </div>
    </div>
  );
}

function ModuleTab({
  selectedId, modules, tokens, design, moduleThemes,
  onSetSize, onMoveUp, onMoveDown, onRemove, onDuplicate, onClose,
  updateModule, resetModule,
}: {
  selectedId:  string | null;
  modules:     ModuleConfig[];
  tokens:      AtmosphereTokens;
  design:      DesignTokens;
  moduleThemes:Record<string, ModuleTheme>;
  onSetSize:   (id: string, size: ModuleSize) => void;
  onMoveUp:    (id: string) => void;
  onMoveDown:  (id: string) => void;
  onRemove:    (id: string) => void;
  onDuplicate: (id: string) => void;
  onClose:     () => void;
  updateModule:(id: string, patch: Partial<ModuleTheme>) => void;
  resetModule: (id: string) => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  if (!selectedId) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}` }}
        >
          <span style={{ fontSize: '20px' }}>✦</span>
        </div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: tokens.textMuted, marginBottom: '6px' }}>
          No module selected
        </p>
        <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost }}>
          Click a module on the canvas to inspect it
        </p>
      </div>
    );
  }

  const mod  = modules.find(m => m.id === selectedId);
  const mt   = moduleThemes[selectedId] ?? {};
  const meta = getMeta(selectedId);

  const ordered  = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled);
  const idx      = ordered.findIndex(m => m.id === selectedId);
  const canUp    = idx > 0;
  const canDown  = idx < ordered.length - 1;

  return (
    <div className="flex-1 overflow-y-auto">

      {/* Module preview card */}
      <ModulePreviewCard
        selectedId={selectedId}
        moduleTheme={mt}
        tokens={tokens}
        design={design}
      />

      {/* Rename */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
        <span style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, display: 'block', marginBottom: '6px' }}>
          Module name
        </span>
        <input
          ref={titleRef}
          type="text"
          defaultValue={mt.customTitle ?? meta?.label ?? ''}
          placeholder={meta?.label ?? 'Module name'}
          onChange={e => updateModule(selectedId, { customTitle: e.target.value || undefined })}
          style={{
            width:           '100%',
            padding:         '8px 12px',
            borderRadius:    '10px',
            fontSize:        '13px',
            fontWeight:      600,
            color:           tokens.textPrimary,
            backgroundColor: tokens.wellBg,
            border:         `1px solid ${tokens.cardBorder}`,
            outline:         'none',
            transition:      'border-color 0.12s ease',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = tokens.accent)}
          onBlur={e  => (e.currentTarget.style.borderColor = tokens.cardBorder)}
        />
      </div>

      {/* Accent color */}
      <Section label="Accent Color" tokens={tokens}>
        <AccentSwatches
          value={(mt.accentPreset ?? 'custom') as AccentPreset}
          customHex={mt.accentCustom ?? tokens.accent}
          onChange={p => updateModule(selectedId, { accentPreset: p, accentCustom: ACCENT_PALETTE[p].color })}
          onCustom={hex => updateModule(selectedId, { accentPreset: 'custom', accentCustom: hex })}
          tokens={tokens}
        />
      </Section>

      {/* Surface style */}
      <Section label="Surface" tokens={tokens}>
        <SurfaceGrid
          value={mt.surfaceStyle ?? design.surfaceStyle}
          onChange={s => updateModule(selectedId, { surfaceStyle: s })}
          tokens={tokens}
          design={design}
        />
      </Section>

      {/* Effects */}
      <Section label="Effects" tokens={tokens}>
        <div className="flex flex-col gap-3">
          {/* Glow toggle */}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '12px', color: tokens.textSecondary, fontWeight: 500 }}>Glow</span>
            <Toggle
              value={mt.glowEnabled !== false}
              onChange={v => updateModule(selectedId, { glowEnabled: v })}
              tokens={tokens}
            />
          </div>
          {/* Opacity */}
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Opacity</p>
            <SegControl
              options={[
                { value: '1',    label: '100%' },
                { value: '0.75', label: '75%'  },
                { value: '0.5',  label: '50%'  },
              ]}
              value={String(mt.opacity ?? 1)}
              onChange={v => updateModule(selectedId, { opacity: parseFloat(v) })}
              tokens={tokens}
            />
          </div>
          {/* Border */}
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Border</p>
            <SegControl<BorderStyle>
              options={[
                { value: 'default', label: 'Auto'   },
                { value: 'none',    label: 'None'   },
                { value: 'accent',  label: 'Accent' },
                { value: 'glow',    label: 'Glow'   },
              ]}
              value={mt.borderStyle ?? 'default'}
              onChange={v => updateModule(selectedId, { borderStyle: v })}
              tokens={tokens}
              size="sm"
            />
          </div>
        </div>
      </Section>

      {/* Layout */}
      {mod && (
        <Section label="Layout" tokens={tokens}>
          <div className="flex flex-col gap-2.5">
            <div>
              <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Width</p>
              <div className="flex gap-1">
                {SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => onSetSize(selectedId, s)}
                    style={{
                      flex:            1,
                      padding:         '6px 0',
                      fontSize:        '10px',
                      fontWeight:      600,
                      borderRadius:    '8px',
                      cursor:          'pointer',
                      color:           mod.size === s ? '#000' : tokens.textMuted,
                      backgroundColor: mod.size === s ? tokens.accent : tokens.wellBg,
                      border:         `1px solid ${mod.size === s ? tokens.accent : tokens.cardBorder}`,
                    }}
                  >
                    {SIZE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              {([
                { label: 'Move Up',   fn: () => onMoveUp(selectedId),   can: canUp   },
                { label: 'Move Down', fn: () => onMoveDown(selectedId), can: canDown },
              ] as const).map((b, bi) => (
                <button
                  key={bi}
                  onClick={b.fn}
                  disabled={!b.can}
                  style={{
                    flex:            1,
                    padding:         '6px 0',
                    fontSize:        '11px',
                    fontWeight:      600,
                    borderRadius:    '8px',
                    cursor:          b.can ? 'pointer' : 'default',
                    opacity:         b.can ? 1 : 0.28,
                    color:           tokens.textSecondary,
                    backgroundColor: tokens.wellBg,
                    border:         `1px solid ${tokens.cardBorder}`,
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Actions */}
      <div className="px-4 py-4 flex flex-col gap-2">
        {/* Duplicate */}
        <button
          onClick={() => onDuplicate(selectedId)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all"
          style={{
            border:          `1px solid ${tokens.cardBorder}`,
            color:           tokens.textSecondary,
            fontSize:        '12px',
            fontWeight:      600,
            backgroundColor: tokens.wellBg,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorderHover;
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
          }}
        >
          <Copy className="w-3.5 h-3.5" /> Duplicate module
        </button>

        {/* Reset style */}
        <button
          onClick={() => resetModule(selectedId)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all"
          style={{
            border:     `1px solid ${tokens.cardBorder}`,
            color:      tokens.textGhost,
            fontSize:   '12px',
            fontWeight: 600,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorderHover;
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset style
        </button>

        {/* Remove */}
        <button
          onClick={() => { onRemove(selectedId); onClose(); }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
          style={{ border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '12px', fontWeight: 600 }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.08)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.4)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.2)';
          }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove module
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme tab
// ─────────────────────────────────────────────────────────────────────────────

function ThemeTab({
  global, tokens, design, updateGlobal,
}: {
  global:       GlobalTheme;
  tokens:       AtmosphereTokens;
  design:       DesignTokens;
  updateGlobal: (patch: Partial<GlobalTheme>) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">

      <Section label="Accent Color" tokens={tokens}>
        <AccentSwatches
          value={global.accentPreset}
          customHex={global.accentCustom}
          onChange={p => updateGlobal({ accentPreset: p, accentCustom: ACCENT_PALETTE[p].color })}
          onCustom={hex => updateGlobal({ accentPreset: 'custom', accentCustom: hex })}
          tokens={tokens}
        />
      </Section>

      <Section label="Background" tokens={tokens}>
        <BgGrid
          value={global.backgroundStyle}
          onChange={s => updateGlobal({ backgroundStyle: s })}
          tokens={tokens}
          design={design}
        />
      </Section>

      <Section label="Surface Style" tokens={tokens}>
        <SurfaceGrid
          value={global.surfaceStyle}
          onChange={s => updateGlobal({ surfaceStyle: s })}
          tokens={tokens}
          design={design}
        />
      </Section>

      <Section label="Shape & Spacing" tokens={tokens}>
        <div className="flex flex-col gap-3">
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Radius</p>
            <SegControl<RadiusStyle>
              options={[
                { value: 'sharp',       label: RADIUS_LABELS['sharp']       },
                { value: 'soft',        label: RADIUS_LABELS['soft']        },
                { value: 'round',       label: RADIUS_LABELS['round']       },
                { value: 'ultra-round', label: RADIUS_LABELS['ultra-round'] },
              ]}
              value={global.radiusStyle}
              onChange={v => updateGlobal({ radiusStyle: v })}
              tokens={tokens}
              size="sm"
            />
          </div>
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Density</p>
            <SegControl<DensityStyle>
              options={[
                { value: 'compact',     label: 'Compact'  },
                { value: 'comfortable', label: 'Cozy'     },
                { value: 'spacious',    label: 'Spacious' },
              ]}
              value={global.density}
              onChange={v => updateGlobal({ density: v })}
              tokens={tokens}
            />
          </div>
        </div>
      </Section>

      <Section label="Effects" tokens={tokens}>
        <div className="flex flex-col gap-3">
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '4px' }}>Glow intensity</p>
            <SegControl<GlowIntensity>
              options={[
                { value: 'off',    label: 'Off'  },
                { value: 'low',    label: 'Low'  },
                { value: 'medium', label: 'Med'  },
                { value: 'high',   label: 'High' },
              ]}
              value={global.glowIntensity}
              onChange={v => updateGlobal({ glowIntensity: v })}
              tokens={tokens}
              size="sm"
            />
            <GlowPreviewDots value={global.glowIntensity} tokens={tokens} />
          </div>
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Motion</p>
            <SegControl<MotionIntensity>
              options={[
                { value: 'minimal',    label: 'Minimal' },
                { value: 'smooth',     label: 'Smooth'  },
                { value: 'expressive', label: 'Lively'  },
              ]}
              value={global.motionIntensity}
              onChange={v => updateGlobal({ motionIntensity: v })}
              tokens={tokens}
            />
          </div>
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '6px' }}>Typography</p>
            <SegControl<TypographyScale>
              options={[
                { value: 'small',  label: 'Small'  },
                { value: 'normal', label: 'Normal' },
                { value: 'large',  label: 'Large'  },
              ]}
              value={global.typographyScale}
              onChange={v => updateGlobal({ typographyScale: v })}
              tokens={tokens}
            />
          </div>
        </div>
      </Section>

      <Section label="Canvas" tokens={tokens} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '13px', color: tokens.textSecondary, fontWeight: 500 }}>Dot grid</span>
            <Toggle
              value={global.gridVisible}
              onChange={v => updateGlobal({ gridVisible: v })}
              tokens={tokens}
            />
          </div>
          <div>
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '8px' }}>
              Ambient intensity
            </p>
            <AmbientDots
              value={global.ambientIntensity}
              onChange={v => updateGlobal({ ambientIntensity: v })}
              tokens={tokens}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets tab — with save-as-preset
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_EMOJIS = ['🌑', '🌊', '⚡', '🔮', '🌿', '◯', '☀️', '🎯', '✦', '💜', '🔥', '❄️'];

function PresetsTab({
  global, presets, userPresets, tokens, design, applyPreset, saveAsPreset, deleteUserPreset,
}: {
  global:           GlobalTheme;
  presets:          ThemePreset[];
  userPresets:      UserPreset[];
  tokens:           AtmosphereTokens;
  design:           DesignTokens;
  applyPreset:      (id: string) => void;
  saveAsPreset:     (name: string, emoji: string) => string;
  deleteUserPreset: (id: string) => void;
}) {
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName,   setPresetName]   = useState('');
  const [presetEmoji,  setPresetEmoji]  = useState('✦');
  const [saved,        setSaved]        = useState(false);

  const handleSave = () => {
    if (!presetName.trim()) return;
    saveAsPreset(presetName.trim(), presetEmoji);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setShowSaveForm(false);
      setPresetName('');
    }, 1200);
  };

  const r = Math.min(design.radius, 14);

  return (
    <div className="flex-1 overflow-y-auto">

      {/* Save current as preset */}
      <div className="p-4" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
        {!showSaveForm ? (
          <button
            onClick={() => setShowSaveForm(true)}
            style={{
              width:           '100%',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             '8px',
              padding:         '10px',
              borderRadius:    `${r}px`,
              border:         `1px dashed ${tokens.accent}60`,
              backgroundColor: tokens.accentSubtle,
              color:           tokens.accent,
              fontSize:        '12px',
              fontWeight:      600,
              cursor:          'pointer',
              transition:      'all 0.15s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.accent;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.accent + '60';
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Save current theme as preset
          </button>
        ) : (
          <div
            style={{
              padding:         '12px',
              borderRadius:    `${r}px`,
              border:         `1px solid ${tokens.accent}40`,
              backgroundColor: tokens.accentSubtle,
            }}
          >
            <p style={{ ...LABEL, fontSize: '9px', color: tokens.accent, marginBottom: '10px' }}>
              Save as preset
            </p>
            {/* Emoji picker */}
            <div className="flex flex-wrap gap-1 mb-3">
              {PRESET_EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => setPresetEmoji(em)}
                  style={{
                    fontSize:        '14px',
                    padding:         '4px',
                    borderRadius:    '6px',
                    border:         `1px solid ${em === presetEmoji ? tokens.accent : 'transparent'}`,
                    backgroundColor: em === presetEmoji ? tokens.accentSubtle : 'transparent',
                    cursor:          'pointer',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
            {/* Name input */}
            <input
              autoFocus
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveForm(false); }}
              placeholder="Preset name…"
              style={{
                width:           '100%',
                padding:         '7px 10px',
                borderRadius:    '8px',
                fontSize:        '13px',
                fontWeight:      600,
                color:           tokens.textPrimary,
                backgroundColor: tokens.wellBg,
                border:         `1px solid ${tokens.cardBorder}`,
                outline:         'none',
                marginBottom:    '8px',
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!presetName.trim()}
                style={{
                  flex:            1,
                  padding:         '7px',
                  borderRadius:    '8px',
                  fontSize:        '12px',
                  fontWeight:      700,
                  cursor:          presetName.trim() ? 'pointer' : 'default',
                  backgroundColor: presetName.trim() ? tokens.accent : tokens.cardBorder,
                  color:           presetName.trim() ? '#000' : tokens.textGhost,
                  border:          'none',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  gap:             '4px',
                }}
              >
                {saved ? <><Check className="w-3 h-3" /> Saved!</> : 'Save'}
              </button>
              <button
                onClick={() => setShowSaveForm(false)}
                style={{
                  padding:         '7px 12px',
                  borderRadius:    '8px',
                  fontSize:        '12px',
                  fontWeight:      600,
                  cursor:          'pointer',
                  backgroundColor: 'transparent',
                  color:           tokens.textGhost,
                  border:         `1px solid ${tokens.cardBorder}`,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User presets */}
      {userPresets.length > 0 && (
        <div className="p-4" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
          <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '10px' }}>
            Your presets
          </p>
          <div className="flex flex-col gap-1.5">
            {userPresets.map(p => {
              const active = global.activePreset === p.id;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => applyPreset(p.id)}
                    style={{
                      flex:            1,
                      display:         'flex',
                      alignItems:      'center',
                      gap:             '10px',
                      padding:         '9px 10px',
                      borderRadius:    `${r}px`,
                      cursor:          'pointer',
                      transition:      'all 0.12s ease',
                      backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
                      border:         `1px solid ${active ? tokens.accent + '50' : tokens.cardBorder}`,
                    }}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>{p.emoji}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: active ? tokens.accent : tokens.textPrimary }}>
                      {p.name}
                    </span>
                    {active && (
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: tokens.accent, marginLeft: 'auto' }} />
                    )}
                  </button>
                  <button
                    onClick={() => deleteUserPreset(p.id)}
                    style={{
                      padding:         '5px',
                      borderRadius:    '6px',
                      border:          'none',
                      cursor:          'pointer',
                      backgroundColor: 'transparent',
                      color:           tokens.textGhost,
                    }}
                    title="Delete"
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Built-in presets */}
      <div className="p-4">
        <p style={{ ...LABEL, fontSize: '9px', color: tokens.textGhost, marginBottom: '10px' }}>
          Built-in presets
        </p>
        <div className="flex flex-col gap-1.5">
          {presets.map(p => {
            const active = global.activePreset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             '12px',
                  padding:         '10px 12px',
                  borderRadius:    `${r}px`,
                  textAlign:       'left',
                  cursor:          'pointer',
                  transition:      'all 0.15s ease',
                  backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
                  border:         `1px solid ${active ? tokens.accent + '50' : tokens.cardBorder}`,
                  boxShadow:       active ? `0 0 12px ${tokens.accentGlow}` : 'none',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBg;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorderHover;
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.wellBg;
                    (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
                  }
                }}
              >
                <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>{p.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: active ? tokens.accent : tokens.textPrimary }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: '10px', color: tokens.textGhost, marginTop: '1px' }}>
                    {p.description}
                  </p>
                </div>
                {active && (
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    backgroundColor: tokens.accent, boxShadow: `0 0 6px ${tokens.accentGlow}`, flexShrink: 0,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main inspector
// ─────────────────────────────────────────────────────────────────────────────

export function ModuleInspector({
  open, selectedId, modules, tokens, design, global, moduleThemes,
  presets, userPresets, defaultTab,
  onClose, onSetSize, onMoveUp, onMoveDown, onRemove, onDuplicate,
  updateGlobal, applyPreset, saveAsPreset, deleteUserPreset,
  updateModule, resetModule,
}: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'module');

  useEffect(() => { if (defaultTab) setTab(defaultTab); }, [defaultTab]);
  useEffect(() => { if (selectedId) setTab('module');   }, [selectedId]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const meta = selectedId ? getMeta(selectedId) : undefined;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'module',  label: 'Module'  },
    { id: 'theme',   label: 'Theme'   },
    { id: 'presets', label: 'Presets' },
  ];

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
      style={{
        width:           '288px',
        backgroundColor: tokens.pageBg,
        borderLeft:     `1px solid ${tokens.cardBorder}`,
        boxShadow:      `-12px 0 40px rgba(0,0,0,0.55)`,
        transform:       open ? 'translateX(0)' : 'translateX(100%)',
        transition:      'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {tab === 'module' && meta ? (
            <>
              <span style={{ fontSize: '15px', lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>
              <div className="min-w-0">
                <p style={{ fontSize: '13px', fontWeight: 700, color: tokens.textPrimary }}>
                  {(moduleThemes[selectedId ?? '']?.customTitle) ?? meta.label}
                </p>
                <p style={{ ...LABEL, fontSize: '8px', color: tokens.textGhost, marginTop: '1px' }}>
                  Module inspector
                </p>
              </div>
            </>
          ) : tab === 'theme' ? (
            <p style={{ fontSize: '13px', fontWeight: 700, color: tokens.textPrimary }}>Workspace Theme</p>
          ) : (
            <p style={{ fontSize: '13px', fontWeight: 700, color: tokens.textPrimary }}>Theme Presets</p>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ padding: '5px', borderRadius: '8px', color: tokens.textGhost, background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab strip */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}`, backgroundColor: tokens.wellBg }}
      >
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:              1,
              padding:           '9px 0',
              fontSize:          '11px',
              fontWeight:        600,
              cursor:            'pointer',
              transition:        'all 0.12s ease',
              color:             tab === t.id ? tokens.accent : tokens.textMuted,
              backgroundColor:   'transparent',
              border:            'none',
              borderBottom:     `2px solid ${tab === t.id ? tokens.accent : 'transparent'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {tab === 'module' && (
          <ModuleTab
            selectedId={selectedId}
            modules={modules}
            tokens={tokens}
            design={design}
            moduleThemes={moduleThemes}
            onSetSize={onSetSize}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
            onClose={onClose}
            updateModule={updateModule}
            resetModule={resetModule}
          />
        )}
        {tab === 'theme' && (
          <ThemeTab
            global={global}
            tokens={tokens}
            design={design}
            updateGlobal={updateGlobal}
          />
        )}
        {tab === 'presets' && (
          <PresetsTab
            global={global}
            presets={presets}
            userPresets={userPresets}
            tokens={tokens}
            design={design}
            applyPreset={applyPreset}
            saveAsPreset={saveAsPreset}
            deleteUserPreset={deleteUserPreset}
          />
        )}
      </div>
    </div>
  );
}
