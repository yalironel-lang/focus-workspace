import { useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { getAtmospherePreviewPresetId } from '../../lib/atmospherePreview';
import {
  BACKGROUND_STUDIO_PRESETS_ALL,
  type BackgroundPresetDefinition,
} from '../../lib/workspaceBackgroundStudio';
import { PRESET_META } from '../../lib/cosmic/backgroundPresetMeta';
import { COSMIC_PROFILES } from '../../lib/cosmic/cosmicWorldPresets';
import { LIVING_WORLD_COSMIC_PROFILES } from '../../lib/livingEnvironment/livingWorldPresets';
import { getConstellation } from '../../lib/cosmic/constellationCatalog';
import { generateStarfield } from '../../lib/cosmic/cosmicStarfield';
import {
  FEATURED_PREVIEW_IDS,
  WorldEnvironmentPreview,
} from './WorldEnvironmentPreview';

const PREVIEW_H = 72;

interface Props {
  atmosphere: AtmosphereTokens;
  active: boolean;
  onClick: () => void;
}

export function AtmospherePresetCard({ atmosphere, active, onClick }: Props) {
  const presetId = getAtmospherePreviewPresetId(atmosphere.id);
  const preset = useMemo(
    () => BACKGROUND_STUDIO_PRESETS_ALL.find(p => p.id === presetId) as BackgroundPresetDefinition | undefined,
    [presetId],
  );

  const d = preset?.defaults;
  const isLight = preset?.luminance === 'light';
  const meta = PRESET_META[presetId];
  const Icon = meta?.icon;
  const cosmic = COSMIC_PROFILES[presetId] ?? LIVING_WORLD_COSMIC_PROFILES[presetId];
  const useWorldPreview = FEATURED_PREVIEW_IDS.has(presetId);

  const previewStars = useMemo(() => {
    if (useWorldPreview || !cosmic || (cosmic.layers.starDensity ?? 0) < 0.06) return [];
    return generateStarfield(
      cosmic.seed,
      Math.min(0.5, cosmic.layers.starDensity ?? 0.22),
      cosmic.layers.starBrightness ?? 0.55,
      0.9,
    ).slice(0, 32);
  }, [cosmic, useWorldPreview]);

  const constellationLines = useMemo(() => {
    if (useWorldPreview) return null;
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
  }, [cosmic, useWorldPreview]);

  const canvasBase = d?.canvasBase ?? atmosphere.pageBg;
  const gradientBg =
    d && !useWorldPreview
      ? [d.gradientA, d.gradientB, atmosphere.ambientGlow1 ? `radial-gradient(ellipse 70% 50% at 50% 0%, ${atmosphere.ambientGlow1}, transparent 65%)` : null]
          .filter(Boolean)
          .join(', ')
      : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        padding: 0,
        border: active ? `1.5px solid ${atmosphere.accent}` : `1px solid ${atmosphere.cardBorder}`,
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        background: 'transparent',
        boxShadow: active
          ? `0 0 0 1px ${atmosphere.accentGlow}, 0 10px 28px rgba(0,0,0,0.22)`
          : '0 2px 8px rgba(0,0,0,0.12)',
        transform: active ? 'scale(1.02)' : 'scale(1)',
        transition: 'border-color 0.15s, transform 0.1s, box-shadow 0.15s',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: PREVIEW_H,
          overflow: 'hidden',
          backgroundColor: canvasBase,
          backgroundImage: gradientBg,
        }}
      >
        {useWorldPreview && d ? (
          <WorldEnvironmentPreview presetId={presetId} canvasBase={d.canvasBase} height={PREVIEW_H} />
        ) : (
          <>
            {constellationLines && constellationLines.length > 0 && (
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid slice"
                aria-hidden
              >
                <g
                  opacity={isLight ? 0.35 : 0.5}
                  stroke={isLight ? 'rgba(60,70,90,0.35)' : 'rgba(200,215,255,0.28)'}
                  strokeWidth="0.35"
                >
                  {constellationLines.map((ln, i) => (
                    <line key={i} x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} strokeLinecap="round" />
                  ))}
                </g>
              </svg>
            )}
            {previewStars.map((s, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: Math.max(1.2, s.r * 2.4),
                  height: Math.max(1.2, s.r * 2.4),
                  borderRadius: '50%',
                  backgroundColor: isLight
                    ? 'rgba(60,70,90,0.45)'
                    : `rgba(220,230,255,${s.opacity * 0.8})`,
                  boxShadow:
                    s.opacity > 0.5 && !isLight ? `0 0 ${s.r * 3}px rgba(220,230,255,0.3)` : undefined,
                }}
              />
            ))}
          </>
        )}
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            width: '38%',
            height: 22,
            borderRadius: 6,
            backgroundColor: d?.cardBg ?? atmosphere.cardBg,
            border: d
              ? `1px solid rgba(${d.cardBorderRgb.join(',')},${d.cardBorderAlpha})`
              : `1px solid ${atmosphere.cardBorder}`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.08)' : '0 4px 12px rgba(0,0,0,0.28)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 26,
            height: 26,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isLight ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.45)',
            color: d?.textPrimary ?? atmosphere.textPrimary,
          }}
        >
          {Icon ? <Icon size={14} strokeWidth={2} style={{ opacity: 0.85 }} /> : (
            <span style={{ fontSize: 12 }}>{atmosphere.emoji}</span>
          )}
        </div>
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: atmosphere.accent,
            boxShadow: `0 0 8px ${atmosphere.accentGlow}`,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.28) 100%)',
          }}
        />
      </div>
      <div style={{ padding: '10px 12px 10px' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: atmosphere.textPrimary, margin: 0, lineHeight: 1.2 }}>
          {atmosphere.name}
        </p>
        <p style={{ fontSize: 10, color: atmosphere.textMuted, margin: '3px 0 0', lineHeight: 1.4 }}>
          {atmosphere.description}
        </p>
      </div>
    </button>
  );
}
