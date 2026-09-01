import { useEffect, useState, type ReactNode } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';
import {
  NotebookPanelRailToggle,
  NOTEBOOK_PANEL_RAIL_WIDTH_PX,
} from './NotebookPanelRailToggle';

const SIDEBAR_BREAKPOINT_PX = 768;
const SIDEBAR_WIDTH_PX = 240;

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= SIDEBAR_BREAKPOINT_PX : true,
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const mq = window.matchMedia(`(min-width: ${SIDEBAR_BREAKPOINT_PX}px)`);
    const sync = () => setWideLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [enabled]);

  useEffect(() => {
    if (wideLayout) return;
    setDrawerOpen(false);
  }, [breadcrumb, wideLayout]);

  if (!enabled) {
    return <>{children}</>;
  }

  const sidebarPanel = (
    <div
      style={{
        width: SIDEBAR_WIDTH_PX,
        flexShrink: 0,
        borderRight: `1px solid ${tokens.cardBorder}`,
        background: tokens.cardBg,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      }}
    >
      {navigator}
    </div>
  );

  const showTopicsChrome = wideLayout && !topicsSuppressed;

  return (
    <div
      data-nb-workspace-layout="1"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderBottom: `1px solid ${tokens.cardBorder}`,
          background: tokens.wellBg,
        }}
      >
        {!wideLayout ? (
          <button
            type="button"
            aria-label="Pages"
            onClick={() => setDrawerOpen(true)}
            style={{
              minHeight: TOUCH_TARGET_MIN_PX,
              minWidth: TOUCH_TARGET_MIN_PX,
              padding: '0 12px',
              borderRadius: 8,
              border: `1px solid ${tokens.cardBorder}`,
              background: tokens.cardBg,
              color: tokens.textSecondary,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
              flexShrink: 0,
            }}
          >
            Pages
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
        {showTopicsChrome ? (
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              alignItems: 'stretch',
              minHeight: 0,
              position: 'relative',
              zIndex: topicsOpen ? 12 : undefined,
            }}
          >
            <div
              style={{
                width: topicsOpen ? SIDEBAR_WIDTH_PX : 0,
                overflow: 'hidden',
                flexShrink: 0,
                minHeight: 0,
                borderRight: topicsOpen ? `1px solid ${tokens.cardBorder}` : 'none',
                background: tokens.cardBg,
              }}
            >
              <div
                style={{
                  width: SIDEBAR_WIDTH_PX,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                {navigator}
              </div>
            </div>
            <div
              style={{
                width: NOTEBOOK_PANEL_RAIL_WIDTH_PX,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
                position: topicsOpen ? 'absolute' : 'relative',
                left: topicsOpen
                  ? SIDEBAR_WIDTH_PX - Math.floor(NOTEBOOK_PANEL_RAIL_WIDTH_PX / 2)
                  : undefined,
                top: topicsOpen ? '50%' : undefined,
                transform: topicsOpen ? 'translateY(-50%)' : undefined,
                zIndex: 12,
                pointerEvents: 'auto',
              }}
            >
              <NotebookPanelRailToggle
                tokens={tokens}
                edge="left"
                panelOpen={topicsOpen}
                variant={topicsOpen ? 'seam' : 'rail'}
                collapseLabel="Collapse Topics"
                expandLabel="Show Topics"
                onToggle={() => onTopicsOpenChange(!topicsOpen)}
              />
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>

        {!wideLayout && drawerOpen ? (
          <>
            <div
              role="presentation"
              onClick={() => setDrawerOpen(false)}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: Math.min(SIDEBAR_WIDTH_PX + NOTEBOOK_PANEL_RAIL_WIDTH_PX, 280),
                zIndex: 3,
                boxShadow: '8px 0 24px rgba(0,0,0,0.35)',
              }}
            >
              {sidebarPanel}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
