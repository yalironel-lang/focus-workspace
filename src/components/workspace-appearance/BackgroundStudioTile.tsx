import { useMemo } from 'react';
import type { BackgroundPresetDefinition } from '../../lib/workspaceBackgroundStudio';
import { PRESET_META } from '../../lib/cosmic/backgroundPresetMeta';
import { COSMIC_PROFILES } from '../../lib/cosmic/cosmicWorldPresets';
import { getConstellation } from '../../lib/cosmic/constellationCatalog';
import { generateStarfield } from '../../lib/cosmic/cosmicStarfield';

interface Props {
  preset: BackgroundPresetDefinition;
  active: boolean;
  accentColor: string;
  size?: 'default' | 'large';
  onClick: () => void;
}

export function BackgroundStudioTile({ preset, active, accentColor, size = 'default', onClick }: Props) {
  const previewHeight = size === 'large' ? 96 : 72;
  const labelSize = size === 'large' ? 'text-[13px]' : 'text-[12px]';
  const d = preset.defaults;
  const isLight = preset.luminance === 'light';
  const meta = PRESET_META[preset.id];
  const Icon = meta?.icon;
  const cosmic = COSMIC_PROFILES[preset.id];

  const previewStars = useMemo(() => {
    if (!cosmic || (cosmic.layers.starDensity ?? 0) < 0.06) return [];
    return generateStarfield(
      cosmic.seed,
      Math.min(0.45, cosmic.layers.starDensity ?? 0.2),
      cosmic.layers.starBrightness ?? 0.5,
      0.85,
    ).slice(0, 28);
  }, [cosmic]);

  const constellationLines = useMemo(() => {
    const id = cosmic?.layers.constellationId;
    if (!id || id === 'none') return null;
    const c = getConstellation(id);
    if (!c || c.edges.length === 0) return null;
    return c.edges
      .map(([a, b]) => {
        const sa = c.stars[a];
        const sb = c.stars[b];
        if (!sa || !sb) return null;
        return { x1: sa.x, y1: sa.y, x2: sb.x, y2: sb.y };
      })
      .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number }[];
  }, [cosmic]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl overflow-hidden transition-all w-full group"
      style={{
        border: `1px solid ${active ? `${accentColor}88` : 'rgba(255,255,255,0.07)'}`,
        boxShadow: active
          ? `0 0 0 1px ${accentColor}44, 0 12px 32px rgba(0,0,0,0.18)`
          : '0 2px 8px rgba(0,0,0,0.06)',
        transform: active ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          height: previewHeight,
          backgroundColor: d.canvasBase,
          backgroundImage: [d.gradientA, d.gradientB].filter(Boolean).join(', ') || undefined,
        }}
      >
        {constellationLines && constellationLines.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden
          >
            <g opacity={isLight ? 0.35 : 0.5} stroke={isLight ? 'rgba(60,70,90,0.35)' : 'rgba(200,215,255,0.28)'} strokeWidth="0.35">
              {constellationLines.map((ln, i) => (
                <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} strokeLinecap="round" />
              ))}
            </g>
          </svg>
        )}
        {previewStars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: Math.max(1, s.r * 2.2),
              height: Math.max(1, s.r * 2.2),
              backgroundColor: isLight
                ? 'rgba(60,70,90,0.4)'
                : `rgba(220,230,255,${s.opacity * 0.75})`,
              boxShadow: s.opacity > 0.5 && !isLight ? `0 0 ${s.r * 3}px rgba(220,230,255,0.25)` : undefined,
            }}
          />
        ))}
        <div
          className="absolute left-3 bottom-3 w-[42%] h-7 rounded-lg"
          style={{
            backgroundColor: d.cardBg,
            border: `1px solid rgba(${d.cardBorderRgb.join(',')},${d.cardBorderAlpha})`,
            boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.08)' : '0 4px 14px rgba(0,0,0,0.28)',
          }}
        />
        <div
          className="absolute top-2.5 left-2.5 flex items-center justify-center w-7 h-7 rounded-lg"
          style={{
            backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.45)',
            color: d.textPrimary,
          }}
        >
          {Icon && <Icon className="w-4 h-4 opacity-85" strokeWidth={2} />}
        </div>
        <span
          className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
          style={{ backgroundColor: preset.accentHint, boxShadow: `0 0 8px ${preset.accentHint}99` }}
        />
      </div>
      <div className="px-3 py-2.5" style={{ backgroundColor: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(16,18,24,0.96)' }}>
        <p className={`${labelSize} font-semibold truncate`} style={{ color: isLight ? '#1a1814' : '#eceef2' }}>
          {preset.name}
        </p>
        <p className="text-[10px] leading-snug mt-0.5 line-clamp-1" style={{ color: isLight ? '#78716c' : '#8b9298' }}>
          {meta?.mood ?? preset.description}
        </p>
      </div>
    </button>
  );
}
