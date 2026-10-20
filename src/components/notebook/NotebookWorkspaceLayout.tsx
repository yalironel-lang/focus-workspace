import type { ReactNode } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

const SIDEBAR_WIDTH_PX = 260;

interface Props {
  enabled: boolean;
  tokens: AtmosphereTokens;
  breadcrumb: string;
  navigator: ReactNode;
  children: ReactNode;
  topicsOpen: boolean;
  onTopicsOpenChange: (open: boolean) => void;
  /** Focus mode — hide Topics panel and expand rails entirely. */
  topicsSuppressed?: boolean;
}

export function NotebookWorkspaceLayout({
  enabled,
  tokens,
  breadcrumb,
  navigator,
  children,
  topicsOpen,
  onTopicsOpenChange,
  topicsSuppressed = false,
}: Props) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      data-nb-workspace-layout="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        position: 'relative',
      }}
    >
      <div
        data-nb-workspace-breadcrumb="1"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          borderBottom: `1px solid ${tokens.cardBorder}`,
          background: tokens.wellBg,
          minHeight: 34,
        }}
      >
        {!topicsSuppressed && navigator ? (
          <button
            type="button"
            aria-label={topicsOpen ? 'Close Pages' : 'Open Pages'}
            aria-expanded={topicsOpen}
            data-testid="notebook-pages-toggle-btn"
            onClick={() => onTopicsOpenChange(!topicsOpen)}
            style={{
              minHeight: TOUCH_TARGET_MIN_PX,
              minWidth: TOUCH_TARGET_MIN_PX,
              padding: '0 10px',
              borderRadius: 6,
              border: `1px solid ${topicsOpen ? tokens.accent : tokens.cardBorder}`,
              background: topicsOpen ? `${tokens.accent}18` : tokens.cardBg,
              color: topicsOpen ? tokens.accent : 'rgba(255, 248, 235, 0.92)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span>Pages</span>
          </button>
        ) : null}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            fontWeight: 600,
            color: tokens.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {breadcrumb}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        {/* Notebook writing surface: Always in-flow, takes full available width */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>

        {/* Overlay Pages / Topics Navigator: zero width in flow, overlays on open */}
        {!topicsSuppressed && navigator && topicsOpen ? (
          <>
            <div
              role="presentation"
              aria-hidden="true"
              onClick={() => onTopicsOpenChange(false)}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.35)',
                zIndex: 20,
              }}
            />
            <div
              data-nb-pages-drawer="1"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: Math.min(SIDEBAR_WIDTH_PX, 280),
                zIndex: 21,
                display: 'flex',
                flexDirection: 'column',
                background: tokens.cardBg,
                borderRight: `1px solid ${tokens.cardBorder}`,
                boxShadow: '8px 0 24px rgba(0, 0, 0, 0.35)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderBottom: `1px solid ${tokens.cardBorder}`,
                  background: tokens.wellBg,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: tokens.textSecondary }}>
                  Pages &amp; Topics
                </span>
                <button
                  type="button"
                  aria-label="Close Pages"
                  onClick={() => onTopicsOpenChange(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: tokens.textMuted,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontSize: 14,
                    borderRadius: 4,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {navigator}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
