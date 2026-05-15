import { useMemo, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import type { FocusStrength } from '../../lib/workspaceClarity';
import {
  BACKGROUND_STUDIO_PRESETS_ALL,
  backgroundPresetThemePatch,
  resolveBackgroundPresetId,
  type BackgroundPresetDefinition,
  type BackgroundPresetId,
} from '../../lib/workspaceBackgroundStudio';
import { PRESET_GROUP_LABELS, PRESET_GROUP_ORDER, PRESET_META, presetsInGroup } from '../../lib/cosmic/backgroundPresetMeta';
import { auditContrast } from '../../lib/cosmic/livingContrast';
import { applyColorStudio, deriveCosmicSurfaceTokens } from '../../lib/cosmic/cosmicColorStudio';
import { BackgroundStudioTile } from './BackgroundStudioTile';
import { CosmicColorStudio } from './CosmicColorStudio';

type StudioTab = 'presets' | 'color' | 'stars' | 'constellations' | 'clarity';

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
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
          {label}
        </span>
        <span className="text-[10px] shrink-0" style={{ color: tokens.textGhost }}>
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
        className="w-full mt-2"
        style={{ accentColor: tokens.accent }}
      />
    </div>
  );
}

function FeaturedPreview({
  preset,
  global,
  tokens,
}: {
  preset: BackgroundPresetDefinition | null;
  global: GlobalTheme;
  tokens: AtmosphereTokens;
}) {
  const d = useMemo(() => {
    if (!preset) return null;
    if (preset.id === 'custom') {
      const base = global.canvasCustom ?? '#222228';
      const applied = applyColorStudio(base, {
        hue: global.canvasHue,
        saturation: global.canvasSaturation ?? 0.55,
        brightness: global.canvasBrightness ?? 0,
        warmth: global.canvasWarmth ?? 0,
      });
      return deriveCosmicSurfaceTokens(applied, global.canvasAutoContrast !== false);
    }
    return preset.defaults;
  }, [preset, global]);

  if (!d || !preset) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{ border: `1px solid ${tokens.cardBorder}` }}
    >
      <div
        className="relative h-28"
        style={{
          backgroundColor: d.canvasBase,
          backgroundImage: [d.gradientA, d.gradientB].filter(Boolean).join(', ') || undefined,
        }}
      >
        <div
          className="absolute left-4 bottom-4 w-[38%] h-10 rounded-lg"
          style={{
            backgroundColor: d.cardBg,
            border: `1px solid rgba(${d.cardBorderRgb.join(',')},${d.cardBorderAlpha})`,
            boxShadow: preset.luminance === 'light' ? '0 2px 10px rgba(0,0,0,0.06)' : '0 6px 18px rgba(0,0,0,0.35)',
          }}
        />
        <div
          className="absolute right-4 bottom-5 w-[22%] h-7 rounded-md opacity-90"
          style={{
            backgroundColor: d.cardBg,
            border: `1px solid rgba(${d.cardBorderRgb.join(',')},${d.cardBorderAlpha * 0.85})`,
          }}
        />
      </div>
      <div className="px-3 py-2.5 flex items-center justify-between" style={{ backgroundColor: tokens.wellBg }}>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            {preset.name}
          </p>
          <p className="text-[10px]" style={{ color: tokens.textMuted }}>
            {PRESET_META[preset.id]?.mood ?? preset.description}
          </p>
        </div>
        {preset.id === 'custom' && (
          <span
            className="text-[9px] font-mono px-2 py-1 rounded-md"
            style={{ backgroundColor: tokens.cardBg, color: tokens.textMuted }}
          >
            {d.canvasBase}
          </span>
        )}
      </div>
    </div>
  );
}

export function LivingBackgroundStudio({ tokens, global, onUpdateGlobal }: Props) {
  const [tab, setTab] = useState<StudioTab>('presets');
  const activeBackgroundId = resolveBackgroundPresetId(global);
  const allIds = useMemo(
    () => BACKGROUND_STUDIO_PRESETS_ALL.map(p => p.id),
    [],
  );

  const activePreset = useMemo(() => {
    if (activeBackgroundId === 'custom') {
      return {
        id: 'custom' as const,
        name: 'Custom',
        description: 'Your color with readable contrast.',
        emoji: '',
        luminance: 'dark' as const,
        accentHint: tokens.accent,
        defaults: deriveCosmicSurfaceTokens(
          global.canvasCustom ?? '#222228',
          global.canvasAutoContrast !== false,
        ),
      };
    }
    return BACKGROUND_STUDIO_PRESETS_ALL.find(p => p.id === activeBackgroundId) ?? null;
  }, [activeBackgroundId, global, tokens.accent]);

  const contrastReport = useMemo(() => {
    if (!activePreset) return null;
    return auditContrast(activePreset.defaults);
  }, [activePreset]);

  const applyBackgroundStyle = (id: BackgroundPresetId) => {
    onUpdateGlobal(backgroundPresetThemePatch(id));
  };

  const tabs: { id: StudioTab; label: string }[] = [
    { id: 'presets', label: 'Presets' },
    { id: 'color', label: 'Custom' },
    { id: 'stars', label: 'Stars' },
    { id: 'constellations', label: 'Sky' },
    { id: 'clarity', label: 'Clarity' },
  ];

  return (
    <>
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: tokens.textGhost }}>
          Living background
        </p>
        <FeaturedPreview preset={activePreset} global={global} tokens={tokens} />
        <div className="flex gap-1 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
              style={{
                backgroundColor: tab === t.id ? tokens.accentSubtle : 'transparent',
                color: tab === t.id ? tokens.accent : tokens.textMuted,
                border: `1px solid ${tab === t.id ? `${tokens.accent}44` : tokens.cardBorder}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'presets' && (
        <div className="mb-6 space-y-5">
          {PRESET_GROUP_ORDER.map(group => {
            const ids = presetsInGroup(allIds, group);
            if (!ids.length) return null;
            return (
              <section key={group}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: tokens.textGhost }}>
                  {PRESET_GROUP_LABELS[group]}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ids.map(id => {
                    const preset = BACKGROUND_STUDIO_PRESETS_ALL.find(p => p.id === id);
                    if (!preset) return null;
                    return (
                      <BackgroundStudioTile
                        key={preset.id}
                        preset={preset}
                        active={activeBackgroundId === preset.id}
                        accentColor={tokens.accent}
                        onClick={() => applyBackgroundStyle(preset.id)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
          <BackgroundStudioTile
            preset={{
              id: 'custom',
              name: 'Custom color',
              description: 'Any hue — contrast-safe surfaces.',
              emoji: '',
              luminance: 'dark',
              accentHint: tokens.accent,
              defaults: deriveCosmicSurfaceTokens(global.canvasCustom ?? '#222228'),
            }}
            active={activeBackgroundId === 'custom'}
            accentColor={tokens.accent}
            onClick={() => {
              setTab('color');
              applyBackgroundStyle('custom');
            }}
          />
        </div>
      )}

      {tab === 'color' && (
        <div className="mb-6">
          <CosmicColorStudio tokens={tokens} global={global} onUpdateGlobal={onUpdateGlobal} mode="color" />
          {contrastReport && (
            <p
              className="text-[10px] mt-2 px-1"
              style={{ color: contrastReport.ok ? tokens.textMuted : tokens.accent }}
            >
              {contrastReport.ok
                ? `Contrast OK — text ${contrastReport.textPrimary.toFixed(1)}:1 on canvas`
                : `Adjusting contrast — text ${contrastReport.textPrimary.toFixed(1)}:1 (target 4.5:1)`}
            </p>
          )}
        </div>
      )}

      {(tab === 'stars' || tab === 'constellations') && (
        <CosmicColorStudio
          tokens={tokens}
          global={global}
          onUpdateGlobal={onUpdateGlobal}
          mode={tab === 'stars' ? 'stars' : 'constellations'}
        />
      )}

      {tab === 'clarity' && (
        <section className="mb-6">
          <div
            className="flex flex-col gap-4 rounded-xl p-3"
            style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}` }}
          >
            <SliderRow
              label="Fog & vignette"
              hint={global.fogLevel < 0.25 ? 'Clear' : global.fogLevel > 0.5 ? 'Cinematic' : 'Balanced'}
              value={global.fogLevel ?? 0.22}
              min={0}
              max={1}
              step={0.02}
              tokens={tokens}
              onChange={v => onUpdateGlobal({ fogLevel: v, activePreset: null })}
            />
            <SliderRow
              label="Ambient presence"
              hint={`${Math.round((global.ambientIntensity ?? 0.28) * 100)}%`}
              value={global.ambientIntensity ?? 0.28}
              min={0}
              max={1}
              step={0.02}
              tokens={tokens}
              onChange={v => onUpdateGlobal({ ambientIntensity: v, activePreset: null })}
            />
            <SliderRow
              label="Card solidity"
              hint={(global.cardSolidity ?? 0.92) >= 0.9 ? 'Solid' : 'Soft'}
              value={global.cardSolidity ?? 0.92}
              min={0.6}
              max={1}
              step={0.02}
              tokens={tokens}
              onChange={v => onUpdateGlobal({ cardSolidity: v, activePreset: null })}
            />
            <SliderRow
              label="Spatial contrast"
              hint={`${Math.round((global.spatialContrast ?? 0.78) * 100)}%`}
              value={global.spatialContrast ?? 0.78}
              min={0.5}
              max={1}
              step={0.02}
              tokens={tokens}
              onChange={v => onUpdateGlobal({ spatialContrast: v, activePreset: null })}
            />
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
                Canvas grid
              </p>
              <button
                type="button"
                onClick={() => onUpdateGlobal({ gridVisible: !global.gridVisible, activePreset: null })}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                style={{
                  backgroundColor: global.gridVisible ? tokens.accentSubtle : tokens.wellBg,
                  color: global.gridVisible ? tokens.accent : tokens.textMuted,
                  border: `1px solid ${tokens.cardBorder}`,
                }}
              >
                {global.gridVisible ? 'On' : 'Off'}
              </button>
            </div>
            <div>
              <p className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
                Focus guidance
              </p>
              <div className="flex gap-1 mt-2">
                {(['soft', 'balanced', 'guided'] as FocusStrength[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onUpdateGlobal({ focusStrength: s, activePreset: null })}
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold capitalize"
                    style={{
                      backgroundColor: global.focusStrength === s ? tokens.accentSubtle : 'transparent',
                      color: global.focusStrength === s ? tokens.accent : tokens.textMuted,
                      border: `1px solid ${global.focusStrength === s ? `${tokens.accent}44` : tokens.cardBorder}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
