import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { UniversalObjectSplitSide, UniversalObjectViewMode } from '../../hooks/useSectionFreeSpaceObjects';
import { acquireBodyScrollLock, pushEscapeHandler } from '../../lib/ui/overlayStack';
import {
  Z_UNIVERSAL_VIEW_BACKDROP,
  Z_UNIVERSAL_VIEW_PANEL,
} from '../../lib/ui/zIndexLayers';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';
import { isSheetCellEditing } from '../../sheets/components/sheetEngineLifecycle';

function isDomSheetEditorFocused(): boolean {
  const ae = document.activeElement;
  if (!(ae instanceof HTMLElement)) return false;
  // Only treat dedicated formula/cell editors as "editing" — Univer's grid
  // surface itself is often contenteditable even when not editing a cell.
  if (
    ae.closest('.univer-editor')
    || ae.closest('[class*="formula-editor"]')
    || ae.closest('[class*="cell-editor"]')
    || ae.closest('[class*="FormulaEditor"]')
  ) {
    return true;
  }
  return false;
}

function shouldDeferSheetEscapeClose(): boolean {
  if (isSheetCellEditing()) return true;
  if (import.meta.env.DEV) {
    const eng = (window as unknown as {
      __focusSheetSurfaceEngine?: { isCellEditing?: () => boolean };
    }).__focusSheetSurfaceEngine;
    if (eng?.isCellEditing?.()) return true;
  }
  if (isDomSheetEditorFocused()) return true;
  return false;
}

interface Props {
  title: string;
  tokens: AtmosphereTokens;
  mode: UniversalObjectViewMode;
  splitSide: UniversalObjectSplitSide;
  onSetMode: (mode: UniversalObjectViewMode) => void;
  children: ReactNode;
}

/**
 * Escape policy (Sheet-aware, other types unchanged):
 * If a Sheet cell editor is active when Escape starts (capture),
 * skip closing UOV so Univer can cancel/exit cell editing.
 * A subsequent Escape (editor inactive) returns to floating.
 */
export function UniversalObjectViewPortal({
  title,
  tokens,
  mode,
  splitSide,
  onSetMode,
  children,
}: Props) {
  const deferEscapeCloseRef = useRef(false);

  useEffect(() => {
    const onCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture runs before Univer's shortcut + our bubble handler.
      deferEscapeCloseRef.current = shouldDeferSheetEscapeClose();
    };
    window.addEventListener('keydown', onCapture, true);
    const pop = pushEscapeHandler(() => {
      // Re-check at bubble time — Univer may still be exiting edit on this same keydown.
      if (deferEscapeCloseRef.current || shouldDeferSheetEscapeClose()) {
        deferEscapeCloseRef.current = false;
        return false;
      }
      onSetMode('floating');
    });
    return () => {
      window.removeEventListener('keydown', onCapture, true);
      pop();
    };
  }, [onSetMode]);

  useEffect(() => {
    if (mode !== 'fullscreen') return;
    return acquireBodyScrollLock();
  }, [mode]);

  if (typeof document === 'undefined') return null;
  const isFullscreen = mode === 'fullscreen';
  const splitLeft = mode === 'split' && splitSide === 'left';
  const splitRight = mode === 'split' && splitSide === 'right';

  return createPortal(
    <>
      {isFullscreen ? (
        <div
          aria-hidden
          onClick={() => onSetMode('floating')}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: Z_UNIVERSAL_VIEW_BACKDROP,
            background: 'rgba(8, 10, 14, 0.42)',
            backdropFilter: 'blur(4px)',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: isFullscreen || splitLeft ? 0 : undefined,
          right: isFullscreen || splitRight ? 0 : undefined,
          width: isFullscreen ? '100vw' : '50vw',
          zIndex: Z_UNIVERSAL_VIEW_PANEL,
          display: 'flex',
          flexDirection: 'column',
          background: tokens.pageBg,
          boxSizing: 'border-box',
          borderLeft: splitRight ? `1px solid ${tokens.cardBorder}` : undefined,
          borderRight: splitLeft ? `1px solid ${tokens.cardBorder}` : undefined,
          boxShadow: isFullscreen ? 'none' : '-8px 0 30px rgba(0,0,0,0.2)',
        }}
      >
        <header
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            paddingRight: 'max(12px, env(safe-area-inset-right))',
            paddingBottom: 8,
            paddingLeft: 'max(12px, env(safe-area-inset-left))',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: tokens.textPrimary }}>
            {title || 'Object'}
          </div>
          {isFullscreen ? (
            <button
              type="button"
              title="Done"
              aria-label="Done"
              onClick={() => onSetMode('floating')}
              style={{
                minWidth: TOUCH_TARGET_MIN_PX,
                minHeight: TOUCH_TARGET_MIN_PX,
                padding: '0 14px',
                border: `1px solid ${tokens.cardBorder}`,
                background: `${tokens.accent}18`,
                color: tokens.accent,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.02em',
                touchAction: 'manipulation',
              }}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              title="Return to floating"
              onClick={() => onSetMode('floating')}
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                background: 'transparent',
                color: tokens.textMuted,
                borderRadius: 6,
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Minimize2 size={14} />
            </button>
          )}
        </header>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
