/**
 * Shared workspace presentation profile — phone vs tablet vs desktop.
 * Capability / form-factor based; user-agent is not the primary signal.
 */

import { isNativePlatform } from './nativeOAuthDeepLink';

export type WorkspacePresentationProfile = 'phone' | 'tablet' | 'desktop';

export type PresentationProfileInput = {
  viewportWidth: number;
  viewportHeight: number;
  /** `(pointer: coarse)` — primary touch / stylus signal. */
  coarsePointer: boolean;
  /** Capacitor (or equivalent) native shell. */
  nativePlatform: boolean;
};

/**
 * Short-edge threshold: iPhone logical short edges are typically ≤430;
 * iPad short edges are typically ≥744. 600 keeps landscape phones as phone
 * and avoids classifying iPad as phone solely because it is touch/native.
 */
export const PHONE_FORM_FACTOR_MAX_SHORT_EDGE_PX = 600;

export function resolveWorkspacePresentationProfile(
  input: PresentationProfileInput,
): WorkspacePresentationProfile {
  const width = Number.isFinite(input.viewportWidth) ? input.viewportWidth : 0;
  const height = Number.isFinite(input.viewportHeight) ? input.viewportHeight : 0;
  const shortEdge = Math.min(width, height);
  const phoneSized = shortEdge > 0 && shortEdge < PHONE_FORM_FACTOR_MAX_SHORT_EDGE_PX;
  const touchLike = input.coarsePointer || input.nativePlatform;

  if (phoneSized && touchLike) return 'phone';
  if (touchLike && !phoneSized) return 'tablet';
  return 'desktop';
}

export function isPhonePresentationProfile(
  profile: WorkspacePresentationProfile,
): boolean {
  return profile === 'phone';
}

/** Snapshot from a Window (tests / initial state). */
export function readPresentationProfileFromWindow(
  win: Pick<Window, 'innerWidth' | 'innerHeight' | 'matchMedia'> = window,
  nativePlatform: boolean = typeof window !== 'undefined' ? isNativePlatform() : false,
): WorkspacePresentationProfile {
  let coarsePointer = false;
  try {
    coarsePointer = win.matchMedia('(pointer: coarse)').matches;
  } catch {
    coarsePointer = false;
  }
  return resolveWorkspacePresentationProfile({
    viewportWidth: win.innerWidth,
    viewportHeight: win.innerHeight,
    coarsePointer,
    nativePlatform,
  });
}
