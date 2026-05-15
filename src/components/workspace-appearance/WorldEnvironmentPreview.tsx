/**
 * Mini cinematic preview for Living Environment tiles — uses scene base assets.
 */
import { useCallback, useState } from 'react';
import type { BackgroundPresetId } from '../../lib/workspaceBackgroundStudio';
import { LIVING_WORLD_VISUALS } from '../../lib/livingEnvironment/livingWorldVisuals';

interface Props {
  presetId: BackgroundPresetId;
  canvasBase: string;
  height: number;
}

export function WorldEnvironmentPreview({ presetId, canvasBase, height }: Props) {
  const visual = LIVING_WORLD_VISUALS[presetId];
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);

  if (visual?.baseImage && !failed) {
    const t = visual.tuning ?? {};
    return (
      <img
        src={visual.baseImage}
        alt=""
        onError={onError}
        decoding="async"
        draggable={false}
        style={{
          width: '100%',
          height,
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block',
          filter: `brightness(${t.brightness ?? 1}) contrast(${t.contrast ?? 1}) saturate(${t.saturation ?? 1})`,
        }}
      />
    );
  }

  if (visual?.fallbackBase) {
    return (
      <div
        aria-hidden
        style={{
          width: '100%',
          height,
          background: visual.fallbackBase,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }

  return (
    <svg width="100%" height={height} viewBox="0 0 200 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="200" height="96" fill={canvasBase} />
    </svg>
  );
}

export const FEATURED_PREVIEW_IDS = new Set([
  'deep-graphite',
  'cosmic-drift',
  'warm-studio',
  'ocean-depths',
  'ancient-forest',
  'dinosaur-realm',
]);
