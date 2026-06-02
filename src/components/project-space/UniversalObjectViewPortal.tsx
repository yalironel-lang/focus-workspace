import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { UniversalObjectSplitSide, UniversalObjectViewMode } from '../../hooks/useSectionFreeSpaceObjects';
import { acquireBodyScrollLock, pushEscapeHandler } from '../../lib/ui/overlayStack';

interface Props {
  title: string;
  tokens: AtmosphereTokens;
  mode: UniversalObjectViewMode;
  splitSide: UniversalObjectSplitSide;
  onSetMode: (mode: UniversalObjectViewMode) => void;
  children: ReactNode;
}

const Z_UNIVERSAL_VIEW_BACKDROP = 596;
const Z_UNIVERSAL_VIEW_PANEL = 597;

export function UniversalObjectViewPortal({
  title,
  tokens,
  mode,
  splitSide,
  onSetMode,
  children,
}: Props) {
  useEffect(() => pushEscapeHandler(() => onSetMode('floating')), [onSetMode]);
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
            padding: '8px 12px',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: tokens.textPrimary }}>
            {title || 'Object'}
          </div>
          <button
            type="button"
            title="Return to floating"
            onClick={() => onSetMode('floating')}
            style={{ border: `1px solid ${tokens.cardBorder}`, background: 'transparent', color: tokens.textMuted, borderRadius: 6, width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {isFullscreen ? <X size={14} /> : <Minimize2 size={14} />}
          </button>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
