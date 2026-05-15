import { useEffect, useMemo, useState } from 'react';
import type { AtmosphereTokens } from './useAtmosphere';
import type { GlobalTheme } from './useWorkspaceTheme';
import type { FocusMode } from '../focusMode/focusModeTypes';
import {
  resolveLivingEnvironment,
  type LivingEnvironmentSnapshot,
} from '../lib/livingEnvironment';

export interface LivingEnvironmentSignals {
  panX: number;
  panY: number;
  zoom: number;
  selectedId: string | null;
  focusEditingId: string | null;
  focusMode: FocusMode | null;
  calmEffects: boolean;
  reduceMotion: boolean;
  surfaceActive: boolean;
  /** Viewport % (0–100) — environmental light pull toward selection. */
  focusGlowX?: number;
  focusGlowY?: number;
}

export function useLivingEnvironment(
  global: GlobalTheme,
  atmTokens: AtmosphereTokens,
  signals: LivingEnvironmentSignals,
): LivingEnvironmentSnapshot {
  const [timePhase, setTimePhase] = useState(() => performance.now());

  const motionWanted =
    global.environmentMotion !== false &&
    !signals.reduceMotion &&
    signals.surfaceActive;

  useEffect(() => {
    if (!motionWanted || signals.calmEffects) return;
    const id = window.setInterval(() => setTimePhase(performance.now()), 140);
    return () => window.clearInterval(id);
  }, [motionWanted, signals.calmEffects]);

  return useMemo(
    () =>
      resolveLivingEnvironment(global, atmTokens, {
        ...signals,
        timePhase,
        environmentIntensity: global.environmentIntensity ?? 0.72,
        motionEnabled: global.environmentMotion !== false,
      }),
    [global, atmTokens, signals, timePhase],
  );
}
