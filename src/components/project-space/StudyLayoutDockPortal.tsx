import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  getStudyLayoutPanelPlacement,
  type StudyLayoutMode,
} from '../../lib/mathDesk/studyLayout';
import { acquireBodyScrollLock, pushEscapeHandler } from '../../lib/ui/overlayStack';
import { MathDeskStudyLayoutMenu } from './MathDeskStudyLayoutMenu';
import { X } from 'lucide-react';
import './studyLayout.css';

interface Props {
  layout: StudyLayoutMode;
  objectTitle: string;
  tokens: AtmosphereTokens;
  onClose: () => void;
  onLayoutChange: (mode: StudyLayoutMode) => void;
  children: ReactNode;
}

export function StudyLayoutDockPortal({
  layout,
  objectTitle,
  tokens,
  onClose,
  onLayoutChange,
  children,
}: Props) {
  const placement = getStudyLayoutPanelPlacement(layout);

  useEffect(() => {
    if (layout !== 'fullscreen') return;
    return pushEscapeHandler(onClose);
  }, [layout, onClose]);

  useEffect(() => {
    if (layout !== 'fullscreen') return;
    return acquireBodyScrollLock();
  }, [layout]);

  if (!placement || typeof document === 'undefined') return null;

  const isFullscreen = layout === 'fullscreen';

  return createPortal(
    <>
      {isFullscreen ? (
        <div
          className="study-layout-backdrop"
          aria-hidden
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: placement.zIndex - 1,
            background: 'rgba(14, 10, 6, 0.55)',
            backdropFilter: 'blur(6px)',
          }}
        />
      ) : null}
      <div
        className={`study-layout-panel${isFullscreen ? ' study-layout-panel--fullscreen' : ''}`}
        style={{
          position: placement.position,
          top: placement.top,
          bottom: placement.bottom,
          left: placement.left,
          right: placement.right,
          width: placement.width,
          zIndex: placement.zIndex,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          background: tokens.pageBg,
          borderLeft: placement.left === undefined && !isFullscreen
            ? `1px solid ${tokens.cardBorder}`
            : undefined,
          borderRight: placement.right === undefined && placement.left !== undefined
            ? `1px solid ${tokens.cardBorder}`
            : undefined,
          boxShadow: isFullscreen ? 'none' : '-8px 0 32px rgba(0,0,0,0.2)',
        }}
      >
        <header
          className="study-layout-panel__header"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: tokens.textGhost,
              }}
            >
              Math Desk
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: tokens.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {objectTitle || 'Notebook'}
            </div>
          </div>
          <MathDeskStudyLayoutMenu
            tokens={tokens}
            layout={layout}
            onLayoutChange={onLayoutChange}
            compact
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Return to canvas"
            title="Return to canvas (Esc in fullscreen)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${tokens.cardBorder}`,
              background: 'transparent',
              color: tokens.textMuted,
              cursor: 'pointer',
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="study-layout-panel__body" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
