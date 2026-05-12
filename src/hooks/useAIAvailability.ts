import { useEffect, useMemo, useState } from 'react';
import { computeAIAvailability } from '../lib/ai/availability';
import { loadAIUserSettings } from '../lib/ai/storage';
import type { AIAvailability } from '../lib/ai/types';

/**
 * Subscribes to Intelligence settings (optional cloud provider). Returns `enabled`, `configured`, `provider`, `model`,
 * `baseUrlResolved`, and `unavailableReason` (for optional cloud model; local Intelligence does not require this).
 */
export function useAIAvailability(): AIAvailability {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('fw-intelligence-changed', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('fw-intelligence-changed', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);
  return useMemo(() => computeAIAvailability(loadAIUserSettings()), [tick]);
}
