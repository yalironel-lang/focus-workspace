import type { CSSProperties } from 'react';

export type SurfaceShellStyleOptions = {
  /**
   * Solid fill so an overlying surface cannot show underlying canvas pixels.
   * Use on Mission Control (work-surface) — not on Free Space (keeps canvas bg).
   */
  opaqueBackground?: string;
};

/**
 * Keeps a view tree mounted while hiding it without display:none (preserves React/PDF state).
 * When hidden: visibility + content-visibility skip paint; pointer-events none.
 * When visible + opaqueBackground: full-bleed opaque ownership of the surface layer.
 */
export function surfaceShellStyle(
  visible: boolean,
  options?: SurfaceShellStyleOptions,
): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    visibility: visible ? 'visible' : 'hidden',
    // Skip paint/layout work for hidden surfaces while keeping the React tree mounted.
    contentVisibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
    zIndex: visible ? 2 : 0,
    overflow: 'hidden',
    contain: 'layout style',
    isolation: 'isolate',
    ...(options?.opaqueBackground
      ? { backgroundColor: options.opaqueBackground }
      : null),
  };
}
