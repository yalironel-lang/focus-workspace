import { useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import { applyColorStudio, hexToHue, hslToRgb, rgbToHsl, toHex } from '../../lib/cosmic/cosmicColorStudio';
import { CONSTELLATION_OPTIONS, ZODIAC_CONSTELLATIONS } from '../../lib/cosmic/constellationCatalog';
import { accentFromCanvas } from '../../lib/cosmic/livingContrast';
import type { ConstellationId, ConstellationStyle } from '../../lib/cosmic/cosmicBackgroundTypes';
import { Star } from 'lucide-react';

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

interface Props {
  tokens: AtmosphereTokens;
  global: GlobalTheme;
  onUpdateGlobal: (patch: Partial<GlobalTheme>) => void;
  mode?: 'all' | 'color' | 'stars' | 'constellations';
}

export function CosmicColorStudio({ tokens, global, onUpdateGlobal, mode = 'all' }: Props) {
  const showColor = mode === 'all' || mode === 'color';
  const showStars = mode === 'all' || mode === 'stars';
  const showConst = mode === 'all' || mode === 'constellations';
  const base = global.canvasCustom ?? '#1a1a1e';
  const hue = global.canvasHue ?? hexToHue(base);
  const sat = global.canvasSaturation ?? 0.55;

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

  const constellationStyles: ConstellationStyle[] = ['minimal', 'scientific', 'mythological', 'ambient'];

  const quickConstellations = CONSTELLATION_OPTIONS.filter(
    o => o.id === 'none' || ZODIAC_CONSTELLATIONS.some(z => z.id === o.id) || ['orion', 'ursa-major', 'cassiopeia'].includes(o.id),
  ).slice(0, 12);

  return (
    <>
      {showColor && (
      <section className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: tokens.textGhost }}>
          Custom color
        </p>
        <div
          className="rounded-xl p-3 flex flex-col gap-3"
          style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}` }}
        >
          <div
            className="h-10 rounded-lg border"
            style={{
              backgroundColor: previewHex,
              borderColor: tokens.cardBorder,
              boxShadow: `inset 0 0 24px rgba(0,0,0,0.25)`,
            }}
          />
          <div>
            <p className="text-[10px] mb-1.5" style={{ color: tokens.textMuted }}>
              Spectrum
            </p>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={hue}
              onChange={e => patchCustom({ canvasHue: parseFloat(e.target.value) })}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{ background: spectrumBg }}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={previewHex}
              onChange={e => {
                const hsl = rgbToHsl(
                  parseInt(e.target.value.slice(1, 3), 16),
                  parseInt(e.target.value.slice(3, 5), 16),
                  parseInt(e.target.value.slice(5, 7), 16),
                );
                patchCustom({
                  canvasCustom: e.target.value,
                  canvasHue: hsl.h,
                  canvasSaturation: hsl.s,
                });
              }}
              className="w-10 h-10 rounded-lg border-0 cursor-pointer shrink-0"
            />
            <input
              type="text"
              value={previewHex}
              onChange={e => {
                const v = e.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  patchCustom({ canvasCustom: v, canvasHue: hexToHue(v) });
                }
              }}
              className="flex-1 rounded-lg px-2.5 py-2 text-[12px] font-mono"
              style={{
                backgroundColor: tokens.cardBg,
                border: `1px solid ${tokens.cardBorder}`,
                color: tokens.textPrimary,
              }}
            />
          </div>
          <SliderRow
            label="Saturation"
            hint={`${Math.round(sat * 100)}%`}
            value={sat}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => patchCustom({ canvasSaturation: v })}
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
          <SliderRow
            label="Warmth"
            hint={
              (global.canvasWarmth ?? 0) < -0.15
                ? 'Cool'
                : (global.canvasWarmth ?? 0) > 0.15
                  ? 'Warm'
                  : 'Neutral'
            }
            value={global.canvasWarmth ?? 0}
            min={-0.5}
            max={0.5}
            step={0.05}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ canvasWarmth: v, activePreset: null })}
          />
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[12px] font-medium" style={{ color: tokens.textPrimary }}>
                Auto contrast
              </p>
              <p className="text-[10px]" style={{ color: tokens.textGhost }}>
                WCAG AA text & cards
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateGlobal({
                  canvasAutoContrast: global.canvasAutoContrast === false,
                  activePreset: null,
                })
              }
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
              style={{
                backgroundColor: global.canvasAutoContrast !== false ? tokens.accentSubtle : tokens.wellBg,
                color: global.canvasAutoContrast !== false ? tokens.accent : tokens.textMuted,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              {global.canvasAutoContrast !== false ? 'On' : 'Off'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const hex = accentFromCanvas(previewHex);
              onUpdateGlobal({ accentPreset: 'custom', accentCustom: hex, activePreset: null });
            }}
            className="w-full py-2 rounded-lg text-[11px] font-semibold"
            style={{
              backgroundColor: tokens.wellBg,
              color: tokens.textPrimary,
              border: `1px solid ${tokens.cardBorder}`,
            }}
          >
            Apply color to accent
          </button>
        </div>
      </section>
      )}

      {showStars && (
      <section className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: tokens.textGhost }}>
          Starfield
        </p>
        <div
          className="rounded-xl p-3 flex flex-col gap-3"
          style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}` }}
        >
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
          <SliderRow
            label="Twinkle"
            hint={`${Math.round((global.starTwinkle ?? 0.15) * 100)}%`}
            value={global.starTwinkle ?? 0.15}
            min={0}
            max={0.6}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ starTwinkle: v, activePreset: null })}
          />
        </div>
      </section>
      )}

      {showConst && (
      <section className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: tokens.textGhost }}>
          Constellations
        </p>
        <div
          className="rounded-xl p-3 flex flex-col gap-3"
          style={{ backgroundColor: tokens.wellBg, border: `1px solid ${tokens.cardBorder}` }}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {quickConstellations.map(opt => (
              <button
                key={opt.id}
                type="button"
                title={opt.description}
                onClick={() =>
                  onUpdateGlobal({
                    constellationId: opt.id as ConstellationId,
                    constellationVisibility: opt.id === 'none' ? 0 : 0.72,
                    activePreset: null,
                  })
                }
                className="text-left text-[10px] py-2 px-2 rounded-lg truncate flex items-center gap-1.5"
                style={{
                  backgroundColor:
                    (global.constellationId ?? 'none') === opt.id ? tokens.accentSubtle : 'transparent',
                  color:
                    (global.constellationId ?? 'none') === opt.id ? tokens.accent : tokens.textMuted,
                  border: `1px solid ${tokens.cardBorder}`,
                }}
              >
                <Star className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
          <select
            value={global.constellationId ?? 'none'}
            onChange={e =>
              onUpdateGlobal({
                constellationId: e.target.value as ConstellationId,
                activePreset: null,
              })
            }
            className="w-full rounded-lg px-2 py-2 text-[11px]"
            style={{
              backgroundColor: tokens.cardBg,
              border: `1px solid ${tokens.cardBorder}`,
              color: tokens.textPrimary,
            }}
          >
            {CONSTELLATION_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label} — {opt.description}
              </option>
            ))}
          </select>
          <SliderRow
            label="Visibility"
            hint={`${Math.round((global.constellationVisibility ?? 0) * 100)}%`}
            value={global.constellationVisibility ?? 0}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ constellationVisibility: v, activePreset: null })}
          />
          <div className="flex gap-1 flex-wrap">
            {constellationStyles.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onUpdateGlobal({ constellationStyle: s, activePreset: null })}
                className="flex-1 min-w-[70px] py-1.5 rounded-lg text-[10px] font-semibold capitalize"
                style={{
                  backgroundColor:
                    (global.constellationStyle ?? 'minimal') === s ? tokens.accentSubtle : 'transparent',
                  color:
                    (global.constellationStyle ?? 'minimal') === s ? tokens.accent : tokens.textMuted,
                  border: `1px solid ${tokens.cardBorder}`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <SliderRow
            label="Nebula"
            hint={`${Math.round((global.nebulaIntensity ?? 0) * 100)}%`}
            value={global.nebulaIntensity ?? 0}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ nebulaIntensity: v, activePreset: null })}
          />
          <SliderRow
            label="Milky way"
            hint={`${Math.round((global.milkyWayIntensity ?? 0) * 100)}%`}
            value={global.milkyWayIntensity ?? 0}
            min={0}
            max={1}
            step={0.02}
            tokens={tokens}
            onChange={v => onUpdateGlobal({ milkyWayIntensity: v, activePreset: null })}
          />
        </div>
      </section>
      )}
    </>
  );
}
