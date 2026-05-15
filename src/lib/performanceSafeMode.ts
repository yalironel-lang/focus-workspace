/**
 * Coordinates “calm rendering” when the compositor is under pressure:
 * drag/zoom, view switches, navigation, hidden tab, low device memory.
 */

import { useEffect, useSyncExternalStore } from 'react';

const pressureReasons = new Set<string>();
let calmSnapshot = false;
const listeners = new Set<() => void>();

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function lowDeviceMemory(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && mem > 0 && mem < 4;
}

function recomputeCalm(): void {
  const next =
    pressureReasons.size > 0 ||
    (typeof document !== 'undefined' && document.hidden) ||
    prefersReducedMotion() ||
    lowDeviceMemory();
  if (next === calmSnapshot) return;
  calmSnapshot = next;
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return calmSnapshot;
}

export function setPerformancePressure(reason: string, active: boolean): void {
  if (active) pressureReasons.add(reason);
  else pressureReasons.delete(reason);
  recomputeCalm();
}

/** Brief calm window for view-mode / route transitions (avoids compositor flash). */
export function pulsePerformancePressure(reason: string, ms = 420): void {
  setPerformancePressure(reason, true);
  window.setTimeout(() => setPerformancePressure(reason, false), ms);
}

export function usePerformanceCalm(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function usePerformancePressureBinding(reason: string, active: boolean): void {
  useEffect(() => {
    setPerformancePressure(reason, active);
    return () => setPerformancePressure(reason, false);
  }, [reason, active]);
}

export function initPerformanceSafeModeListeners(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', recomputeCalm);
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', recomputeCalm);
  recomputeCalm();
}
