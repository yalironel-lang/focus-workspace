import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import {
  ACCENT_LABELS,
  ACCENT_PALETTE,
  SURFACE_LABELS,
  type AccentPreset,
  type FocusStrength,
  type SurfaceStyle,
} from '../../hooks/useWorkspaceTheme';
import {
  BACKGROUND_STUDIO_PRESETS_ALL,
  backgroundPresetThemePatch,
  resolveBackgroundPresetId,
  type BackgroundPresetId,
} from '../../lib/workspaceBackgroundStudio';
import { PRESET_GROUP_LABELS, PRESET_GROUP_ORDER, presetsInGroup } from '../../lib/cosmic/backgroundPresetMeta';
import { BackgroundStudioTile } from './BackgroundStudioTile';
import { CosmicColorStudio } from './CosmicColorStudio';

const ALL_PRESET_IDS = BACKGROUND_STUDIO_PRESETS_ALL.map(p => p.id).filter(
  (id): id is BackgroundPresetId => id !== 'custom',
);

type StudioSection = 'looks' | 'colors' | 'sky' | 'clarity';

interface Props {
  tokens: AtmosphereTokens;
  global: GlobalTheme;
  onUpdateGlobal: (patch: Partial<GlobalTheme>) => void;
}

function SliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  tokens,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tokens: AtmosphereTokens;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[13px] font-medium" style={{ color: tokens.textPrimary }}>
          {label}
        </span>
        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: tokens.textGhost }}>
          {hint}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: tokens.accent }}
      />
    </div>
  );
}

export function LivingBackgroundStudio({ tokens, global, onUpdateGlobal }: Props) {
  const [section, setSection] = useState<StudioSection>('looks');
  const activeBackgroundId = resolveBackgroundPresetId(global);

  const accentOptions = useMemo(
    () => (Object.keys(ACCENT_PALETTE) as AccentPreset[]).filter(k => k !== 'custom'),
    [],
  );

  const applyBackgroundStyle = (id: BackgroundPresetId) => {
    onUpdateGlobal(backgroundPresetThemePatch(id));
  };

  const resetToDefault = () => {
    onUpdateGlobal(backgroundPresetThemePatch('deep-graphite'));
    setSection('looks');
  };

  const sections: { id: StudioSection; label: string }[] = [
    { id: 'looks', label: 'Looks' },
    { id: 'colors', label: 'Colors' },
    { id: 'sky', label: 'Sky' },
    { id: 'clarity', label: 'Clarity' },
  ];

  const surfaces: SurfaceStyle[] = ['solid', 'soft-card', 'glass'];

  return (
    <>
      <div className="flex gap-1.5 p-1 rounded-2xl mb-6" style={{ backgroundColor: tokens.wellBg }}>
        {sections.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-semibold tracking-tight transition-all"
            style={{
              backgroundColor: section === s.id ? tokens.cardBg : 'transparent',
              color: section === s.id ? tokens.textPrimary : tokens.textMuted,
              boxShadow: section === s.id ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'looks' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[13px] font-medium" style={{ color: tokens.textSecondary }}>
              Curated worlds
            </p>
            <button
              type="button"
              onClick={resetToDefault}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: tokens.textMuted }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>

          {PRESET_GROUP_ORDER.map(group => {
            const ids = presetsInGroup(ALL_PRESET_IDS, group);
            if (ids.length === 0) return null;
            return (
              <section key={group} className="mb-6 last:mb-0">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3"
                  style={{ color: tokens.textGhost }}
                >
                  {PRESET_GROUP_LABELS[group]}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {ids.map(id => {
                    const preset = BACKGROUND_STUDIO_PRESETS_ALL.find(p => p.id === id);
                    if (!preset) return null;
                    return (
                      <BackgroundStudioTile
                        key={preset.id}
                        preset={preset}
                        active={activeBackgroundId === preset.id}
                        accentColor={tokens.accent}
                        size="large"
                        onClick={() => applyBackgroundStyle(preset.id)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {section === 'colors' && (
        <div className="flex flex-col gap-5 mb-4">
          <CosmicColorStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} mode="color" />
          <div>
            <p className="text-[13px] font-medium mb-3" style={{ color: tokens.textPrimary }}>
              Accent sync
            </p>
            <div className="flex flex-wrap gap-2">
              {accentOptions.map(key => {
                const active = global.accentPreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={ACCENT_LABELS[key]}
                    onClick={() =>
                      onUpdateGlobal({
                        accentPreset: key,
                        accentCustom: ACCENT_PALETTE[key].color,
                        activePreset: null,
                      })
                    }
                    className="w-9 h-9 rounded-full transition-transform"
                    style={{
                      backgroundColor: ACCENT_PALETTE[key].color,
                      border: active ? `2px solid ${tokens.textPrimary}` : '2px solid transparent',
                      transform: active ? 'scale(1.1)' : 'scale(1)',
                      boxShadow: active ? `0 0 0 2px ${tokens.cardBg}` : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {section === 'sky' && (
        <div className="flex flex-col gap-6 mb-4">
          <CosmicColorStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} mode="stars" />
          <CosmicColorStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} mode="constellations" />
        </div>
      )}

      {section === 'clarity' && (
        <section className="flex flex-col gap-6 mb-4">
          <SliderRow
            label="Fog"
            hint={global.fogLevel < 0.2 ? 'Clear' : global.fogLevel > 0.45 ? 'Heavy' : 'Balanced'}
            value={global.fogLevel ?? 0.18}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ fogLevel: v, activePreset: null })}
          />
          <SliderRow
            label="Object contrast"
            hint={`${Math.round((global.spatialContrast ?? 0.82) * 100)}%`}
            value={global.spatialContrast ?? 0.82}
            min={0.5}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ spatialContrast: v, activePreset: null })}
          />
          <SliderRow
            label="Card depth"
            hint={(global.cardSolidity ?? 0.94) >= 0.92 ? 'Solid' : 'Soft'}
            value={global.cardSolidity ?? 0.94}
            min={0.6}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ cardSolidity: v, activePreset: null })}
          />
          <div>
            <p className="text-[13px] font-medium mb-2.5" style={{ color: tokens.textPrimary }}>
              Focus strength
            </p>
            <div className="flex gap-1.5">
              {(['soft', 'balanced', 'guided'] as FocusStrength[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateGlobal({ focusStrength: s, activePreset: null })}
                  className="flex-1 py-2 rounded-xl text-[12px] font-semibold capitalize"
                  style={{
                    backgroundColor: global.focusStrength === s ? tokens.accentSubtle : tokens.wellBg,
                    color: global.focusStrength === s ? tokens.accent : tokens.textMuted,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium" style={{ color: tokens.textPrimary }}>
              Grid
            </p>
            <button
              type="button"
              onClick={() => onUpdateGlobal({ gridVisible: !global.gridVisible, activePreset: null })}
              className="px-3 py-1.5 rounded-xl text-[12px] font-semibold"
              style={{
                backgroundColor: global.gridVisible ? tokens.accentSubtle : tokens.wellBg,
                color: global.gridVisible ? tokens.accent : tokens.textMuted,
              }}
            >
              {global.gridVisible ? 'Visible' : 'Hidden'}
            </button>
          </div>
          <div>
            <p className="text-[13px] font-medium mb-2.5" style={{ color: tokens.textPrimary }}>
              Surface
            </p>
            <div className="flex gap-1.5">
              {surfaces.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateGlobal({ surfaceStyle: s, activePreset: null })}
                  className="flex-1 py-2 rounded-xl text-[11px] font-semibold"
                  style={{
                    backgroundColor: global.surfaceStyle === s ? tokens.accentSubtle : tokens.wellBg,
                    color: global.surfaceStyle === s ? tokens.accent : tokens.textMuted,
                  }}
                >
                  {SURFACE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
