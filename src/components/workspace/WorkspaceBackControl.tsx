import { useCallback, useRef, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  onBack: () => void;
  label?: string;
  /** Muted text color for idle state */
  color?: string;
  /** Primary text on hover */
  hoverColor?: string;
  /** Well background on hover */
  wellBg?: string;
}

/**
 * Portaled workspace back control — always above overlays (appearance, capture, canvas).
 * Uses pointerdown for reliable activation during drag / focus layers.
 */
export function WorkspaceBackControl({
  onBack,
  label = 'Back to Library',
  color = '#94a3b8',
  hoverColor = '#f1f5f9',
  wellBg = 'rgba(255,255,255,0.06)',
}: Props) {
  const lockRef = useRef(false);

  const handleBack = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.style.transform = 'scale(0.94)';
      if (lockRef.current) {
        onBack();
        return;
      }
      lockRef.current = true;
      onBack();
      window.setTimeout(() => {
        lockRef.current = false;
      }, 400);
    },
    [onBack],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 60,
        height: 48,
        zIndex: 10000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: 12,
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onPointerDown={handleBack}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
        }}
        aria-label={label}
        title={label}
        style={{
          width: 48,
          height: 48,
          minWidth: 48,
          minHeight: 48,
          margin: 0,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 12,
          cursor: 'pointer',
          color,
          backgroundColor: 'rgba(12,14,18,0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 16px rgba(0,0,0,0.2)',
          pointerEvents: 'auto',
          touchAction: 'manipulation',
          transition: 'color 0.15s ease, background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget;
          el.style.color = hoverColor;
          el.style.backgroundColor = wellBg;
          el.style.boxShadow = '0 1px 0 rgba(255,255,255,0.1) inset, 0 6px 20px rgba(0,0,0,0.28)';
        }}
        onMouseLeave={e => {
          const el = e.currentTarget;
          el.style.color = color;
          el.style.backgroundColor = 'rgba(12,14,18,0.35)';
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 16px rgba(0,0,0,0.2)';
        }}
        onPointerUp={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
        onPointerCancel={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
      >
        <ArrowLeft style={{ width: 22, height: 22 }} strokeWidth={2.25} aria-hidden />
      </button>
    </div>,
    document.body,
  );
}
