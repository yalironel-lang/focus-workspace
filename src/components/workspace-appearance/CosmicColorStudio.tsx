import { useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import { applyColorStudio, hexToHue, hslToRgb, toHex } from '../../lib/cosmic/cosmicColorStudio';
import { CONSTELLATION_OPTIONS, ZODIAC_CONSTELLATIONS } from '../../lib/cosmic/constellationCatalog';
import { accentFromCanvas } from '../../lib/cosmic/livingContrast';
import type { ConstellationId, ConstellationStyle } from '../../lib/cosmic/cosmicBackgroundTypes';
import { normalizeConstellationStyle } from '../../lib/cosmic/cosmicBackgroundTypes';

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

interface Props {
  tokens: AtmosphereTokens;
  global: GlobalTheme;
  onUpdateGlobal: (patch: Partial<GlobalTheme>) => void;
  mode?: 'all' | 'color' | 'stars' | 'constellations';
}

const CONSTELLATION_STYLES: { id: ConstellationStyle; label: string }[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'scientific', label: 'Scientific' },
  { id: 'mythological', label: 'Mythological' },
  { id: 'hidden', label: 'Hidden' },
];

const FEATURED_CONSTELLATIONS: ConstellationId[] = [
  'none',
  'orion',
  'ursa-major',
  'cassiopeia',
  'cygnus',
  'draco',
  'lyra',
  'pegasus',
  'leo',
  'scorpio',
];

export function CosmicColorStudio({ tokens, global, onUpdateGlobal, mode = 'all' }: Props) {
  const showColor = mode === 'all' || mode === 'color';
  const showStars = mode === 'all' || mode === 'stars';
  const showConst = mode === 'all' || mode === 'constellations';
  const base = global.canvasCustom ?? '#2a2a32';
  const hue = global.canvasHue ?? hexToHue(base);
  const sat = global.canvasSaturation ?? 0.55;
  const activeStyle = normalizeConstellationStyle(global.constellationStyle);

  const previewHex = useMemo(
    () =>
      applyColorStudio(base, {
        hue,
        saturation: sat,
        brightness: global.canvasBrightness ?? 0,
        warmth: global.canvasWarmth ?? 0,
      }),
    [base, hue, sat, global.canvasBrightness, global.canvasWarmth],
  );

  const spectrumBg = useMemo(() => {
    const stops: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const { r, g, b } = hslToRgb((i / 12) * 360, 0.85, 0.45);
      stops.push(toHex(r, g, b));
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, []);

  const patchCustom = (p: Partial<GlobalTheme>) =>
    onUpdateGlobal({ ...p, backgroundPreset: 'custom', activePreset: null });

  const zodiacOptions = CONSTELLATION_OPTIONS.filter(
    o => o.id === 'none' || ZODIAC_CONSTELLATIONS.some(z => z.id === o.id),
  );

  return (
    <>
      {showColor && (
        <section className="flex flex-col gap-5">
          <div
            className="h-14 rounded-2xl"
            style={{
              backgroundColor: previewHex,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -12px 32px rgba(0,0,0,0.2)`,
            }}
          />
          <div>
            <p className="text-[11px] font-medium mb-2" style={{ color: tokens.textMuted }}>
              Hue
            </p>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={hue}
              onChange={e => patchCustom({ canvasHue: parseFloat(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: spectrumBg }}
            />
          </div>
          <SliderRow
            label="Warmth"
            hint={
              (global.canvasWarmth ?? 0) < -0.15 ? 'Cool' : (global.canvasWarmth ?? 0) > 0.15 ? 'Warm' : 'Neutral'
            }
            value={global.canvasWarmth ?? 0}
            min={-0.5}
            max={0.5}
            step={0.05}
            tokens={tokens}
            onChange={v => patchCustom({ canvasWarmth: v })}
          />
          <SliderRow
            label="Brightness"
            hint={
              (global.canvasBrightness ?? 0) < -0.1
                ? 'Darker'
                : (global.canvasBrightness ?? 0) > 0.1
                  ? 'Lighter'
                  : 'Neutral'
            }
            value={global.canvasBrightness ?? 0}
            min={-0.35}
            max={0.35}
            step={0.02}
            tokens={tokens}
            onChange={v => patchCustom({ canvasBrightness: v })}
          />
          <button
            type="button"
            onClick={() => {
              const hex = accentFromCanvas(previewHex);
              onUpdateGlobal({ accentPreset: 'custom', accentCustom: hex, activePreset: null });
            }}
            className="w-full py-2.5 rounded-xl text-[12px] font-semibold"
            style={{ backgroundColor: tokens.wellBg, color: tokens.textPrimary }}
          >
            Sync accent to canvas
          </button>
        </section>
      )}

      {showStars && (
        <section className="flex flex-col gap-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: tokens.textGhost }}>
            Stars
          </p>
          <SliderRow
            label="Density"
            hint={`${Math.round((global.starDensity ?? 0.35) * 100)}%`}
            value={global.starDensity ?? 0.35}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ starDensity: v, activePreset: null })}
          />
          <SliderRow
            label="Brightness"
            hint={`${Math.round((global.starBrightness ?? 0.55) * 100)}%`}
            value={global.starBrightness ?? 0.55}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ starBrightness: v, activePreset: null })}
          />
        </section>
      )}

      {showConst && (
        <section className="flex flex-col gap-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: tokens.textGhost }}>
            Constellations
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {FEATURED_CONSTELLATIONS.map(id => {
              const opt = CONSTELLATION_OPTIONS.find(o => o.id === id);
              if (!opt) return null;
              const active = (global.constellationId ?? 'none') === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    onUpdateGlobal({
                      constellationId: id,
                      constellationVisibility: id === 'none' ? 0 : 0.55,
                      activePreset: null,
                    })
                  }
                  className="py-2 px-1.5 rounded-xl text-[10px] font-medium truncate"
                  style={{
                    backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
                    color: active ? tokens.accent : tokens.textMuted,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] font-medium" style={{ color: tokens.textMuted }}>
            Zodiac
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {zodiacOptions
              .filter(o => o.id !== 'none')
              .map(opt => {
                const active = global.constellationId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateGlobal({
                        constellationId: opt.id as ConstellationId,
                        constellationVisibility: 0.5,
                        activePreset: null,
                      })
                    }
                    className="py-2 rounded-xl text-[10px] font-medium truncate"
                    style={{
                      backgroundColor: active ? tokens.accentSubtle : tokens.wellBg,
                      color: active ? tokens.accent : tokens.textMuted,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
          </div>
          <SliderRow
            label="Intensity"
            hint={`${Math.round((global.constellationVisibility ?? 0) * 100)}%`}
            value={global.constellationVisibility ?? 0}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ constellationVisibility: v, activePreset: null })}
          />
          <div>
            <p className="text-[11px] font-medium mb-2" style={{ color: tokens.textMuted }}>
              Style
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {CONSTELLATION_STYLES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUpdateGlobal({ constellationStyle: s.id, activePreset: null })}
                  className="flex-1 min-w-[72px] py-2 rounded-xl text-[11px] font-semibold"
                  style={{
                    backgroundColor: activeStyle === s.id ? tokens.accentSubtle : tokens.wellBg,
                    color: activeStyle === s.id ? tokens.accent : tokens.textMuted,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
