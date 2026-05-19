/**
 * Direction arrow shown during minimap navigation mode (portaled, no pointer events).
 */

import { useEffect, useRef } from 'react';

const SIZE = 28;

export type FollowPanCursorController = {
  show: (x: number, y: number, angleRad: number) => void;
  hide: () => void;
};

export function createFollowPanCursorController(accent: string): FollowPanCursorController {
  if (typeof document === 'undefined') {
    return { show: () => {}, hide: () => {} };
  }

  const root = document.createElement('div');
  root.setAttribute('data-fw-follow-pan-cursor', 'true');
  Object.assign(root.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    marginLeft: `${-SIZE / 2}px`,
    marginTop: `${-SIZE / 2}px`,
    pointerEvents: 'none',
    zIndex: '100050',
    display: 'none',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
  } as CSSStyleDeclaration);

  root.innerHTML = `
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 28 28" aria-hidden="true">
      <path
        d="M14 4 L22 22 L14 17 L6 22 Z"
        fill="${accent}"
        fill-opacity="0.92"
        stroke="rgba(255,255,255,0.35)"
        stroke-width="1"
        stroke-linejoin="round"
      />
    </svg>
  `;

  document.body.appendChild(root);

  return {
    show(x: number, y: number, angleRad: number) {
      const deg = (angleRad * 180) / Math.PI + 90;
      root.style.display = 'block';
      root.style.transform = `translate(${x}px, ${y}px) rotate(${deg}deg)`;
    },
    hide() {
      root.style.display = 'none';
    },
  };
}

/** React wrapper when accent comes from tokens (optional cleanup on unmount). */
export function FreeSpaceFollowPanCursor({
  active,
  x,
  y,
  angleRad,
  accent,
}: {
  active: boolean;
  x: number;
  y: number;
  angleRad: number | null;
  accent: string;
}) {
  const ctrlRef = useRef<FollowPanCursorController | null>(null);

  useEffect(() => {
    ctrlRef.current = createFollowPanCursorController(accent);
    return () => {
      ctrlRef.current?.hide();
      document.querySelector('[data-fw-follow-pan-cursor]')?.remove();
      ctrlRef.current = null;
    };
  }, [accent]);

  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (active && angleRad != null) c.show(x, y, angleRad);
    else c.hide();
  }, [active, x, y, angleRad]);

  return null;
}
