import type { BackgroundPresetDefinition } from '../../lib/workspaceBackgroundStudio';
import { PRESET_META } from '../../lib/cosmic/backgroundPresetMeta';
import { COSMIC_PROFILES } from '../../lib/cosmic/cosmicWorldPresets';
import { generateStarfield } from '../../lib/cosmic/cosmicStarfield';

interface Props {
  preset: BackgroundPresetDefinition;
  active: boolean;
  accentColor: string;
  onClick: () => void;
}

export function BackgroundStudioTile({ preset, active, accentColor, onClick }: Props) {
  const d = preset.defaults;
  const isLight = preset.luminance === 'light';
  const meta = PRESET_META[preset.id];
  const Icon = meta?.icon;
  const cosmic = COSMIC_PROFILES[preset.id];
  const previewStars =
    cosmic && cosmic.layers.starDensity && cosmic.layers.starDensity > 0.08
      ? generateStarfield(
          cosmic.seed,
          cosmic.layers.starDensity ?? 0.2,
          cosmic.layers.starBrightness ?? 0.5,
          0.8,
        ).slice(0, 20)
      : [];

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl overflow-hidden transition-all w-full group"
      style={{
        border: `1px solid ${active ? `${accentColor}77` : 'rgba(255,255,255,0.08)'}`,
        boxShadow: active ? `0 0 0 1px ${accentColor}33, 0 8px 24px rgba(0,0,0,0.12)` : 'none',
      }}
    >
      <div
        className="relative h-[68px] overflow-hidden"
        style={{
          backgroundColor: d.canvasBase,
          backgroundImage: [d.gradientA, d.gradientB].filter(Boolean).join(', ') || undefined,
        }}
      >
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(${d.gridRgb.join(',')},${d.gridOpacity}) 1px, transparent 1px)`,
            backgroundSize: '12px 12px',
          }}
        />
        {previewStars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: Math.max(1, s.r * 2),
              height: Math.max(1, s.r * 2),
              backgroundColor: isLight ? 'rgba(60,70,90,0.45)' : `rgba(220,230,255,${s.opacity * 0.85})`,
            }}
          />
        ))}
        <div
          className="absolute left-2 bottom-2 w-[40%] h-6 rounded-md"
          style={{
            backgroundColor: d.cardBg,
            border: `1px solid rgba(${d.cardBorderRgb.join(',')},${d.cardBorderAlpha})`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.06)' : '0 3px 10px rgba(0,0,0,0.3)',
          }}
        />
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md"
          style={{
            backgroundColor: isLight ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.4)',
            color: d.textPrimary,
          }}
        >
          {Icon && <Icon className="w-3 h-3 shrink-0 opacity-80" strokeWidth={2} />}
        </div>
        <div
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: preset.accentHint, boxShadow: `0 0 6px ${preset.accentHint}99` }}
        />
      </div>
      <div
        className="px-2.5 py-2"
        style={{ backgroundColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(14,16,22,0.95)' }}
      >
        <p className="text-[11px] font-semibold truncate" style={{ color: isLight ? '#1a1814' : '#eceef2' }}>
          {preset.name}
        </p>
        <p className="text-[9px] leading-snug mt-0.5 line-clamp-1" style={{ color: isLight ? '#78716c' : '#8b9298' }}>
          {meta?.mood ?? preset.description}
        </p>
      </div>
    </button>
  );
}
