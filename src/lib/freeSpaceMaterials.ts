/**
 * Free Space material tiers — visual hierarchy only (no layout / feature changes).
 *
 * primary   — thinking surfaces (notebook, PDF)
 * secondary — utility panels (companion, mistake, note)
 * utility   — light supporting cards (link, checklist, tools)
 * system    — workspace modules (capture, focus, timers)
 */

export type FreeSpaceMaterialTier = 'primary' | 'secondary' | 'utility' | 'system';

export function resolveFreeSpaceMaterialTier(
  kind: 'module' | 'block' | 'tool',
  blockType?: string,
): FreeSpaceMaterialTier {
  if (kind === 'module') return 'system';
  if (kind === 'tool') return 'utility';
  const t = (blockType ?? '').toLowerCase();
  if (t === 'notebook' || t === 'pdf') return 'primary';
  if (t === 'companion' || t === 'mistake' || t === 'note') return 'secondary';
  return 'utility';
}

export interface FreeSpaceMaterialStyle {
  /** Multiply default border presence when idle. */
  borderIdleMul: number;
  /** Multiply shadow stack strength. */
  shadowMul: number;
  /** Extra top highlight on engaged surfaces. */
  surfaceSheen: number;
  /** Idle filter recession (brightness). */
  idleBrightness: number;
}

const MATERIALS: Record<FreeSpaceMaterialTier, FreeSpaceMaterialStyle> = {
  primary: {
    borderIdleMul: 0.88,
    shadowMul: 1,
    surfaceSheen: 0.06,
    idleBrightness: 0.992,
  },
  secondary: {
    borderIdleMul: 0.62,
    shadowMul: 0.9,
    surfaceSheen: 0.04,
    idleBrightness: 0.988,
  },
  utility: {
    borderIdleMul: 0.48,
    shadowMul: 0.78,
    surfaceSheen: 0.025,
    idleBrightness: 0.984,
  },
  system: {
    borderIdleMul: 0.4,
    shadowMul: 0.7,
    surfaceSheen: 0.02,
    idleBrightness: 0.982,
  },
};

export function freeSpaceMaterialStyle(tier: FreeSpaceMaterialTier): FreeSpaceMaterialStyle {
  return MATERIALS[tier];
}
