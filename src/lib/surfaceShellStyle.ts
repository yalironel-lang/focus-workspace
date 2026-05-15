import type { CSSProperties } from 'react';

/** Keeps a view tree mounted while hiding it without display:none (preserves iframes). */
export function surfaceShellStyle(visible: boolean): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
    zIndex: visible ? 2 : 0,
    overflow: 'hidden',
    contain: 'layout style',
    isolation: 'isolate',
  };
}
