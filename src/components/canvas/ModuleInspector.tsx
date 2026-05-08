import { useEffect, useState } from 'react';
import { X, ArrowUp, ArrowDown, Trash2, RotateCcw } from 'lucide-react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleConfig, ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import {
  GlobalTheme, ModuleTheme, DesignTokens, ThemePreset,
  AccentPreset, SurfaceStyle, RadiusStyle, DensityStyle,
  GlowIntensity, MotionIntensity, TypographyScale, BackgroundStyle, BorderStyle,
  ACCENT_PALETTE, ACCENT_LABELS, SURFACE_LABELS, RADIUS_LABELS, BG_META, GLOW_MULT,
} from '../../hooks/useWorkspaceTheme';
import { getMeta } from '../../modules/registry';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  selectedId:    string | null;
  modules:       ModuleConfig[];
  tokens:        AtmosphereTokens;
  design:        DesignTokens;
  global:        GlobalTheme;
  moduleThemes:  Record<string, ModuleTheme>;
  presets:       ThemePreset[];
  defaultTab?:   Tab;
  onClose:       () => void;
  onSetSize:     (id: string, size: ModuleSize) => void;
  onMoveUp:      (id: string) => void;
  onMoveDown:    (id: string) => void;
  onRemove:      (id: string) => void;
  updateGlobal:  (patch: Partial<GlobalTheme>) => void;
  applyPreset:   (id: string) => void;
  updateModule:  (id: string, patch: Partial<ModuleTheme>) => void;
  resetModule:   (id: string) => void;
}

type Tab = 'module' | 'theme' | 'presets';

const SIZES: ModuleSize[] = ['third', 'half', 'two-thirds', 'full'];

// ─────────────────────────────────────────────────────────────────────────────
// Micro control components
// ─────────────────────────────────────────────────────────────────────────────

const META_STYLE: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight:    600,
};

function SectionLabel({ text, tokens }: { text: string; tokens: AtmosphereTokens }) {
  return (
    <p style={{ ...META_STYLE, color: tokens.textGhost, marginBottom: '8px' }}>
      {text}
    </p>
  );
}

function Row({
  label, tokens, children,
}: { label: string; tokens: AtmosphereTokens; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
      <SectionLabel text={label} tokens={tokens} />
      {children}
    </div>
  );
}

function SegControl<T extends string>({
  options, value, onChange, tokens,
}: {
  options: { value: T; label: string }[];
  value:   T;
  onChange:(v: T) => void;
  tokens:  AtmosphereTokens;
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex:            1,
            padding:         '5px 2px',
            fontSize:        '10px',
            fontWeight:      600,
            borderRadius:    '7px',
            cursor:          'pointer',
            transition:      'all 0.12s ease',
            color:           o.value === value ? '#000' : tokens.textMuted,
            backgroundColor: o.value === value ? tokens.accent : tokens.cardBg,
            border:         `1px solid ${o.value === value ? tokens.accent : tokens.cardBorder}`,
            boxShadow:       o.value === value ? `0 0 8px ${tokens.accentGlow}` : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AccentSwatches({
  value, customHex, onChange, onCustom, tokens,
}: {
  value:     AccentPreset;
  customHex: string;
  onChange:  (v: AccentPreset) => void;
  onCustom:  (hex: string) => void;
  tokens:    AtmosphereTokens;
}) {
  const presets: AccentPreset[] = ['amber', 'violet', 'cyan', 'emerald', 'rose', 'blue'];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          title={ACCENT_LABELS[p]}
          style={{
            width:        '22px',
            height:       '22px',
            borderRadius: '50%',
            border:       p === value
              ? `3px solid ${tokens.textPrimary}`
              : `2px solid ${tokens.cardBorder}`,
            backgroundColor: ACCENT_PALETTE[p].color,
            boxShadow:    p === value ? `0 0 8px ${ACCENT_PALETTE[p].glow}` : 'none',
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
          onChange={e => { onCustom(e.target.value); }}
          style={{
            position: 'absolute',
            width:    '22px',
            height:   '22px',
            opacity:  0,
            cursor:   'pointer',
            top:      0,
            left:     0,
          }}
        />
        <div
          style={{
            width:        '22px',
            height:       '22px',
            borderRadius: '50%',
            border:       value === 'custom'
              ? `3px solid ${tokens.textPrimary}`
              : `2px dashed ${tokens.cardBorder}`,
            background:   value === 'custom'
              ? customHex
              : `conic-gradient(from 0deg, #f59e0b 0%, #10b981 33%, #8b5cf6 66%, #f43f5e 100%)`,
            boxShadow:    value === 'custom' ? `0 0 8px ${customHex}80` : 'none',
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
  const opts: SurfaceStyle[] = ['glass', 'solid', 'soft-card', 'floating', 'borderless'];
  return (
    <div className="grid grid-cols-5 gap-1">
      {opts.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          style={{
            padding:         '6px 2px',
            fontSize:        '9px',
            fontWeight:      600,
            borderRadius:    `${Math.min(design.radius, 8)}px`,
            textTransform:   'uppercase' as const,
            letterSpacing:   '0.06em',
            cursor:          'pointer',
            transition:      'all 0.12s ease',
            color:           s === value ? '#000' : tokens.textMuted,
            backgroundColor: s === value ? tokens.accent : tokens.cardBg,
            border:         `1px solid ${s === value ? tokens.accent : tokens.cardBorder}`,
          }}
        >
          {SURFACE_LABELS[s]}
        </button>
      ))}
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
  const opts: BackgroundStyle[] = [
    'deep-night', 'soft-gradient', 'grid-canvas', 'ambient-glow', 'minimal-black', 'warm-study',
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {opts.map(s => {
        const m = BG_META[s];
        const active = s === value;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              padding:         '7px 10px',
              fontSize:        '10px',
              fontWeight:      600,
              borderRadius:    `${Math.min(design.radius, 10)}px`,
              textAlign:       'left',
              display:         'flex',
              alignItems:      'center',
              gap:             '6px',
              cursor:          'pointer',
              transition:      'all 0.12s ease',
              color:           active ? '#000' : tokens.textSecondary,
              backgroundColor: active ? tokens.accent : tokens.cardBg,
              border:         `1px solid ${active ? tokens.accent : tokens.cardBorder}`,
            }}
          >
            <span style={{ fontSize: '12px', lineHeight: 1 }}>{m.emoji}</span>
            <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {m.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AmbientDots({
  value, onChange, tokens,
}: {
  value:   number;
  onChange:(v: number) => void;
  tokens:  AtmosphereTokens;
}) {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex items-center gap-2">
      {steps.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          style={{
            width:        '18px',
            height:       '18px',
            borderRadius: '50%',
            border:       Math.abs(value - s) < 0.01
              ? `2px solid ${tokens.accent}`
              : `2px solid ${tokens.cardBorder}`,
            backgroundColor: s === 0
              ? tokens.cardBg
              : tokens.accent + Math.round(s * 180).toString(16).padStart(2, '0'),
            cursor: 'pointer',
            transition: 'all 0.12s ease',
          }}
          title={`${Math.round(s * 100)}%`}
        />
      ))}
      <span style={{ ...META_STYLE, fontSize: '9px', color: tokens.textGhost, marginLeft: '4px' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Module tab
// ─────────────────────────────────────────────────────────────────────────────

function ModuleTab({
  selectedId, modules, tokens, design, moduleThemes,
  onSetSize, onMoveUp, onMoveDown, onRemove, onClose, updateModule, resetModule,
}: {
  selectedId:   string | null;
  modules:      ModuleConfig[];
  tokens:       AtmosphereTokens;
  design:       DesignTokens;
  moduleThemes: Record<string, ModuleTheme>;
  onSetSize:    (id: string, size: ModuleSize) => void;
  onMoveUp:     (id: string) => void;
  onMoveDown:   (id: string) => void;
  onRemove:     (id: string) => void;
  onClose:      () => void;
  updateModule: (id: string, patch: Partial<ModuleTheme>) => void;
  resetModule:  (id: string) => void;
}) {
  if (!selectedId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
          style={{ backgroundColor: tokens.cardBg, border: `1px solid ${tokens.cardBorder}` }}
        >
          <span style={{ fontSize: '18px' }}>✦</span>
        </div>
        <p style={{ ...META_STYLE, color: tokens.textGhost }}>
          Select a module on the canvas to inspect it
        </p>
      </div>
    );
  }

  const mod  = modules.find(m => m.id === selectedId);
  const meta = getMeta(selectedId);
  const mt   = moduleThemes[selectedId] ?? {};

  const ordered = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled);
  const idx      = ordered.findIndex(m => m.id === selectedId);
  const canUp    = idx > 0;
  const canDown  = idx < ordered.length - 1;

  const moduleAccent = mt.accentPreset ?? 'custom';
  const moduleCustomHex = mt.accentCustom ?? tokens.accent;

  return (
    <div className="flex-1 overflow-y-auto">

      {/* Module accent */}
      <Row label="Accent Color" tokens={tokens}>
        <AccentSwatches
          value={moduleAccent as AccentPreset}
          customHex={moduleCustomHex}
          onChange={p => updateModule(selectedId, { accentPreset: p, accentCustom: ACCENT_PALETTE[p].color })}
          onCustom={hex => updateModule(selectedId, { accentPreset: 'custom', accentCustom: hex })}
          tokens={tokens}
        />
      </Row>

      {/* Surface */}
      <Row label="Surface Style" tokens={tokens}>
        <SurfaceGrid
          value={mt.surfaceStyle ?? design.surfaceStyle}
          onChange={s => updateModule(selectedId, { surfaceStyle: s })}
          tokens={tokens}
          design={design}
        />
      </Row>

      {/* Effects */}
      <Row label="Effects" tokens={tokens}>
        <div className="flex flex-col gap-2.5">
          <div>
            <p style={{ ...META_STYLE, fontSize: '8px', color: tokens.textGhost, marginBottom: '5px' }}>Glow</p>
            <SegControl
              options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
              value={mt.glowEnabled === false ? 'off' : 'on'}
              onChange={v => updateModule(selectedId, { glowEnabled: v === 'on' })}
              tokens={tokens}
            />
          </div>
          <div>
            <p style={{ ...META_STYLE, fontSize: '8px', color: tokens.textGhost, marginBottom: '5px' }}>Opacity</p>
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
          <div>
            <p style={{ ...META_STYLE, fontSize: '8px', color: tokens.textGhost, marginBottom: '5px' }}>Border</p>
            <SegControl<BorderStyle>
              options={[
                { value: 'default', label: 'Default' },
                { value: 'none',    label: 'None'    },
                { value: 'accent',  label: 'Accent'  },
                { value: 'glow',    label: 'Glow'    },
              ]}
              value={mt.borderStyle ?? 'default'}
              onChange={v => updateModule(selectedId, { borderStyle: v })}
              tokens={tokens}
            />
          </div>
        </div>
      </Row>

      {/* Width */}
      {mod && (
        <Row label="Width" tokens={tokens}>
          <div className="flex gap-1">
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => onSetSize(selectedId, s)}
                style={{
                  flex:            1,
                  padding:         '6px 0',
                  fontSize:        '9px',
                  fontWeight:      600,
                  borderRadius:    '7px',
                  cursor:          'pointer',
                  color:           mod.size === s ? '#000' : tokens.textMuted,
                  backgroundColor: mod.size === s ? tokens.accent : tokens.cardBg,
                  border:         `1px solid ${mod.size === s ? tokens.accent : tokens.cardBorder}`,
                }}
              >
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
        </Row>
      )}

      {/* Position */}
      <Row label="Position" tokens={tokens}>
        <div className="flex gap-2">
          {[
            { label: '↑ Up', fn: () => onMoveUp(selectedId), can: canUp },
            { label: '↓ Down', fn: () => onMoveDown(selectedId), can: canDown },
          ].map(b => (
            <button
              key={b.label}
              onClick={b.fn}
              disabled={!b.can}
              style={{
                flex:            1,
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             '4px',
                padding:         '6px 0',
                fontSize:        '11px',
                fontWeight:      600,
                borderRadius:    '8px',
                cursor:          b.can ? 'pointer' : 'default',
                opacity:         b.can ? 1 : 0.3,
                color:           tokens.textSecondary,
                backgroundColor: tokens.cardBg,
                border:         `1px solid ${tokens.cardBorder}`,
              }}
            >
              {b.label === '↑ Up' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {b.label.split(' ')[1]}
            </button>
          ))}
        </div>
      </Row>

      {/* Module description */}
      {meta?.description && (
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
          <p style={{ fontSize: '11px', color: tokens.textGhost, lineHeight: 1.5 }}>
            {meta.description}
          </p>
        </div>
      )}

      {/* Reset + Remove */}
      <div className="px-4 py-4 flex flex-col gap-2">
        <button
          onClick={() => resetModule(selectedId)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all"
          style={{
            border:    `1px solid ${tokens.cardBorder}`,
            color:     tokens.textGhost,
            fontSize:  '11px',
            fontWeight:600,
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
          <RotateCcw className="w-3 h-3" /> Reset module style
        </button>
        <button
          onClick={() => { onRemove(selectedId); onClose(); }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
          style={{
            border:    '1px solid rgba(239,68,68,0.2)',
            color:     '#f87171',
            fontSize:  '11px',
            fontWeight:600,
          }}
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

      {/* Accent color */}
      <Row label="Accent Color" tokens={tokens}>
        <AccentSwatches
          value={global.accentPreset}
          customHex={global.accentCustom}
          onChange={p => updateGlobal({ accentPreset: p, accentCustom: ACCENT_PALETTE[p].color })}
          onCustom={hex => updateGlobal({ accentPreset: 'custom', accentCustom: hex })}
          tokens={tokens}
        />
      </Row>

      {/* Background style */}
      <Row label="Background" tokens={tokens}>
        <BgGrid
          value={global.backgroundStyle}
          onChange={s => updateGlobal({ backgroundStyle: s })}
          tokens={tokens}
          design={design}
        />
      </Row>

      {/* Surface style */}
      <Row label="Surface Style" tokens={tokens}>
        <SurfaceGrid
          value={global.surfaceStyle}
          onChange={s => updateGlobal({ surfaceStyle: s })}
          tokens={tokens}
          design={design}
        />
      </Row>

      {/* Shape */}
      <Row label="Border Radius" tokens={tokens}>
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
        />
      </Row>

      {/* Density */}
      <Row label="Density" tokens={tokens}>
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
      </Row>

      {/* Glow */}
      <Row label="Glow Intensity" tokens={tokens}>
        <div className="flex flex-col gap-1.5">
          <SegControl<GlowIntensity>
            options={[
              { value: 'off',    label: 'Off'    },
              { value: 'low',    label: 'Low'    },
              { value: 'medium', label: 'Med'    },
              { value: 'high',   label: 'High'   },
            ]}
            value={global.glowIntensity}
            onChange={v => updateGlobal({ glowIntensity: v })}
            tokens={tokens}
          />
          {/* Glow preview dots */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {Object.entries(GLOW_MULT).map(([k, v]) => (
              <div
                key={k}
                style={{
                  width:        '8px',
                  height:       '8px',
                  borderRadius: '50%',
                  backgroundColor: tokens.accent,
                  boxShadow:    v > 0 ? `0 0 ${Math.round(v * 12)}px ${tokens.accentGlow}` : 'none',
                  opacity:      k === global.glowIntensity ? 1 : 0.3,
                  transition:   'all 0.15s ease',
                }}
              />
            ))}
            <span style={{ ...META_STYLE, fontSize: '8px', color: tokens.textGhost, marginLeft: '4px' }}>
              preview
            </span>
          </div>
        </div>
      </Row>

      {/* Motion */}
      <Row label="Motion" tokens={tokens}>
        <SegControl<MotionIntensity>
          options={[
            { value: 'minimal',    label: 'Minimal'    },
            { value: 'smooth',     label: 'Smooth'     },
            { value: 'expressive', label: 'Expressive' },
          ]}
          value={global.motionIntensity}
          onChange={v => updateGlobal({ motionIntensity: v })}
          tokens={tokens}
        />
      </Row>

      {/* Typography */}
      <Row label="Typography Scale" tokens={tokens}>
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
      </Row>

      {/* Canvas */}
      <Row label="Canvas" tokens={tokens}>
        <div className="flex flex-col gap-3">
          {/* Grid toggle */}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '11px', color: tokens.textSecondary, fontWeight: 500 }}>
              Dot grid
            </span>
            <button
              onClick={() => updateGlobal({ gridVisible: !global.gridVisible })}
              style={{
                width:           '36px',
                height:          '20px',
                borderRadius:    '10px',
                position:        'relative',
                border:          `1px solid ${global.gridVisible ? tokens.accent : tokens.cardBorder}`,
                backgroundColor: global.gridVisible ? tokens.accentSubtle : tokens.cardBg,
                cursor:          'pointer',
                transition:      'all 0.15s ease',
              }}
            >
              <div
                style={{
                  position:        'absolute',
                  top:             '2px',
                  left:            global.gridVisible ? '16px' : '2px',
                  width:           '14px',
                  height:          '14px',
                  borderRadius:    '50%',
                  backgroundColor: global.gridVisible ? tokens.accent : tokens.textGhost,
                  transition:      'all 0.15s ease',
                  boxShadow:       global.gridVisible ? `0 0 6px ${tokens.accentGlow}` : 'none',
                }}
              />
            </button>
          </div>

          {/* Ambient intensity */}
          <div>
            <p style={{ ...META_STYLE, fontSize: '8px', color: tokens.textGhost, marginBottom: '6px' }}>
              Ambient intensity
            </p>
            <AmbientDots
              value={global.ambientIntensity}
              onChange={v => updateGlobal({ ambientIntensity: v })}
              tokens={tokens}
            />
          </div>
        </div>
      </Row>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets tab
// ─────────────────────────────────────────────────────────────────────────────

function PresetsTab({
  global, presets, tokens, design, applyPreset,
}: {
  global:      GlobalTheme;
  presets:     ThemePreset[];
  tokens:      AtmosphereTokens;
  design:      DesignTokens;
  applyPreset: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p style={{ ...META_STYLE, fontSize: '8px', color: tokens.textGhost, marginBottom: '12px' }}>
        Instantly apply a curated workspace look
      </p>
      <div className="flex flex-col gap-2">
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
                borderRadius:    `${Math.min(design.radius, 14)}px`,
                textAlign:       'left',
                cursor:          'pointer',
                transition:      'all 0.15s ease',
                backgroundColor: active ? tokens.accentSubtle : tokens.cardBg,
                border:         `1px solid ${active ? tokens.accent + '50' : tokens.cardBorder}`,
                boxShadow:       active ? `0 0 12px ${tokens.accentGlow}` : 'none',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorderHover + '40';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorderHover;
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBg;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
                }
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <p style={{
                  fontSize:   '12px',
                  fontWeight: 700,
                  color:      active ? tokens.accent : tokens.textPrimary,
                }}>
                  {p.name}
                </p>
                <p style={{ fontSize: '10px', color: tokens.textGhost, marginTop: '1px' }}>
                  {p.description}
                </p>
              </div>
              {active && (
                <div
                  style={{
                    width:           '6px',
                    height:          '6px',
                    borderRadius:    '50%',
                    backgroundColor: tokens.accent,
                    boxShadow:       `0 0 6px ${tokens.accentGlow}`,
                    flexShrink:      0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ModuleInspector({
  open, selectedId, modules, tokens, design, global, moduleThemes, presets, defaultTab,
  onClose, onSetSize, onMoveUp, onMoveDown, onRemove,
  updateGlobal, applyPreset, updateModule, resetModule,
}: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'module');

  // Sync to defaultTab when it changes from outside (e.g. Theme button in toolbar)
  useEffect(() => {
    if (defaultTab) setTab(defaultTab);
  }, [defaultTab]);

  // Auto-switch to module tab when a module is newly selected
  useEffect(() => {
    if (selectedId) setTab('module');
  }, [selectedId]);

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
        width:          '296px',
        backgroundColor: tokens.pageBg,
        borderLeft:     `1px solid ${tokens.cardBorder}`,
        boxShadow:      `-8px 0 32px rgba(0,0,0,0.5)`,
        transform:       open ? 'translateX(0)' : 'translateX(100%)',
        transition:     'transform 0.25s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {tab === 'module' && meta ? (
            <>
              <span style={{ fontSize: '14px', lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>
              <div className="min-w-0">
                <p style={{ fontSize: '12px', fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {meta.label}
                </p>
                <p style={{ ...META_STYLE, color: tokens.textGhost, marginTop: '1px', fontSize: '8px' }}>
                  Module inspector
                </p>
              </div>
            </>
          ) : tab === 'theme' ? (
            <p style={{ fontSize: '12px', fontWeight: 700, color: tokens.textPrimary }}>
              Workspace Theme
            </p>
          ) : (
            <p style={{ fontSize: '12px', fontWeight: 700, color: tokens.textPrimary }}>
              Theme Presets
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            padding:         '5px',
            borderRadius:    '8px',
            color:           tokens.textGhost,
            backgroundColor: 'transparent',
            border:          'none',
            cursor:          'pointer',
            flexShrink:      0,
            transition:      'all 0.1s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab strip */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
      >
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:          1,
              padding:       '8px 0',
              fontSize:      '11px',
              fontWeight:    600,
              cursor:        'pointer',
              transition:    'all 0.12s ease',
              borderBottom: `2px solid ${tab === t.id ? tokens.accent : 'transparent'}`,
              color:         tab === t.id ? tokens.accent : tokens.textMuted,
              backgroundColor: 'transparent',
              border:        'none',
              borderBottomWidth: '2px',
              borderBottomStyle: 'solid',
              borderBottomColor: tab === t.id ? tokens.accent : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
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
            tokens={tokens}
            design={design}
            applyPreset={applyPreset}
          />
        )}
      </div>
    </div>
  );
}
