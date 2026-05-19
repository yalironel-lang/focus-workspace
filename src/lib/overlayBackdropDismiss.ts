import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

/**
 * Reliable “click outside” for full-screen modal scrims: pointerdown + click
 * with a direct-target guard (works better than click-only on touch / Safari).
 */
export function overlayBackdropDismissProps(
  onClose: () => void,
): Pick<HTMLAttributes<HTMLDivElement>, 'onPointerDown' | 'onClick'> {
  return {
    onPointerDown: e => {
      if (e.target === e.currentTarget) onClose();
    },
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}

export function overlayBackdropButtonDismissProps(
  onClose: () => void,
): Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onPointerDown' | 'onClick'> {
  return {
    type: 'button',
    onPointerDown: e => {
      if (e.target === e.currentTarget) onClose();
    },
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
