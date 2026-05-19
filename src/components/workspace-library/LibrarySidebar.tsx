import { BookOpenCheck, Calendar, LayoutDashboard, LogOut, Menu, Palette, Play, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { LIBRARY_SIDEBAR_EXPANDED_PX } from '../../hooks/useLibraryBreakpoint';
import { UNIVERSE_ROUTE } from '../../lib/workspaceUniverse/types';
import type { LibrarySpatialState } from './spatial/LibrarySpatialContext';
import { SpatialLibraryNavLink } from './spatial/SpatialLibraryNavLink';
import { LibrarySidebarRailToggle } from './LibrarySidebarRailToggle';

interface Props {
  tokens: AtmosphereTokens;
  accent: string;
  displayName: string;
  showAdvancedNav: boolean;
  hasWorkspaces: boolean;
  appearanceOpen: boolean;
  onOpenAppearance: () => void;
  onSignOut: () => void;
  spatial: LibrarySpatialState;
  sidebarParallax: { x: number; y: number };
  railCollapsed: boolean;
  isMobile: boolean;
  isTablet: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
}

export function LibrarySidebar({
  tokens,
  accent,
  displayName,
  showAdvancedNav,
  hasWorkspaces,
  appearanceOpen,
  onOpenAppearance,
  onSignOut,
  spatial,
  sidebarParallax,
  railCollapsed,
  isMobile,
  isTablet,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
}: Props) {
  const location = useLocation();
  const showLabels = isMobile || !railCollapsed;
  const panelEase = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const transformTransition = spatial.reducedMotion
    ? undefined
    : `transform 0.38s ${panelEase}`;

  const navLinks = (
    <>
      <SpatialLibraryNavLink
        tokens={tokens}
        active={location.pathname === '/dashboard'}
        icon={<BookOpenCheck style={{ width: 13, height: 13 }} strokeWidth={2} />}
        label="Library"
        to="/dashboard"
        accent={accent}
        collapsed={!showLabels}
        onNavigate={isMobile ? onCloseMobile : undefined}
      />
      {showAdvancedNav && (
        <>
          <SpatialLibraryNavLink
            tokens={tokens}
            active={location.pathname === UNIVERSE_ROUTE}
            icon={<Sparkles style={{ width: 13, height: 13 }} strokeWidth={2} />}
            label="Universe"
            to={UNIVERSE_ROUTE}
            accent={accent}
            collapsed={!showLabels}
            onNavigate={isMobile ? onCloseMobile : undefined}
          />
          <SpatialLibraryNavLink
            tokens={tokens}
            active={location.pathname === '/desk'}
            icon={<LayoutDashboard style={{ width: 13, height: 13 }} strokeWidth={2} />}
            label="Personal desk"
            to="/desk"
            accent={accent}
            collapsed={!showLabels}
            onNavigate={isMobile ? onCloseMobile : undefined}
          />
          <SpatialLibraryNavLink
            tokens={tokens}
            active={location.pathname === '/schedule'}
            icon={<Calendar style={{ width: 13, height: 13 }} strokeWidth={2} />}
            label="Schedule"
            to="/schedule"
            accent={accent}
            collapsed={!showLabels}
            onNavigate={isMobile ? onCloseMobile : undefined}
          />
          <SpatialLibraryNavLink
            tokens={tokens}
            active={location.pathname === '/session'}
            icon={<Play style={{ width: 13, height: 13 }} strokeWidth={2} />}
            label="Focus session"
            to="/session"
            accent={accent}
            collapsed={!showLabels}
            onNavigate={isMobile ? onCloseMobile : undefined}
          />
        </>
      )}
      {hasWorkspaces && (
        <button
          type="button"
          title={!showLabels ? 'Scene' : undefined}
          onClick={() => {
            onOpenAppearance();
            if (isMobile) onCloseMobile();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: showLabels ? 'flex-start' : 'center',
            gap: showLabels ? 9 : 0,
            padding: showLabels ? '9px 11px' : '10px 0',
            borderRadius: 10,
            border: '1px solid transparent',
            background: appearanceOpen ? `${accent}18` : 'transparent',
            color: appearanceOpen ? accent : tokens.textMuted,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            width: '100%',
            minHeight: showLabels ? undefined : 40,
            transition: 'background 0.22s ease, color 0.22s ease, padding 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={e => {
            if (!appearanceOpen) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.040)';
              e.currentTarget.style.color = tokens.textSecondary;
            }
          }}
          onMouseLeave={e => {
            if (!appearanceOpen) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = tokens.textMuted;
            }
          }}
        >
          <Palette style={{ width: 13, height: 13, color: accent, flexShrink: 0 }} strokeWidth={2} />
          <span
            className="library-nav-label"
            style={{
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              maxWidth: showLabels ? 120 : 0,
              opacity: showLabels ? 1 : 0,
              transition: 'opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            Scene
          </span>
        </button>
      )}
    </>
  );

  const sidebarPanel = (
    <aside
      className="library-sidebar"
      data-collapsed={railCollapsed ? 'true' : 'false'}
      onMouseEnter={() => spatial.setFocusRegion('chrome')}
      onMouseLeave={() => spatial.setFocusRegion(null)}
      style={{
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 120 : 20,
        width: isMobile ? LIBRARY_SIDEBAR_EXPANDED_PX : '100%',
        maxWidth: '100%',
        flexShrink: 0,
        display: 'flex',
        visibility: isMobile && !mobileOpen ? 'hidden' : 'visible',
        pointerEvents: isMobile && !mobileOpen ? 'none' : 'auto',
        flexDirection: 'column',
        margin: isMobile ? 0 : undefined,
        border: `1px solid ${accent}18`,
        borderRadius: isMobile ? '0 20px 20px 0' : 20,
        background: 'linear-gradient(180deg, rgba(12,18,32,0.82) 0%, rgba(5,8,16,0.76) 100%)',
        backdropFilter: 'blur(32px) saturate(2.0) brightness(1.10)',
        WebkitBackdropFilter: 'blur(32px) saturate(2.0) brightness(1.10)',
        boxShadow: isMobile
          ? '0 0 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)'
          : `0 22px 68px rgba(0,0,0,0.40), 0 0 32px ${accent}06, inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.08)`,
        overflow: 'hidden',
        transform: spatial.reducedMotion
          ? undefined
          : isMobile
            ? mobileOpen
              ? 'translate3d(0, 0, 0)'
              : 'translate3d(-105%, 0, 0)'
            : `translate3d(${sidebarParallax.x}px, ${sidebarParallax.y}px, 0)`,
        transition: isMobile
          ? spatial.reducedMotion
            ? undefined
            : `transform 0.36s ${panelEase}`
          : transformTransition,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.042) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          padding: showLabels ? '16px 14px 14px' : '16px 8px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.068)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: showLabels ? 'flex-start' : 'center',
          gap: showLabels ? 9 : 0,
          position: 'relative',
          overflow: 'hidden',
          transition: 'padding 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(circle at 16% 0%, ${accent}1e, transparent 52%)`,
            transition: 'background 1.2s ease',
          }}
        />
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            flexShrink: 0,
            position: 'relative',
            background: `radial-gradient(circle at 34% 24%, rgba(255,255,255,0.48), transparent 30%), linear-gradient(135deg, ${accent}, ${accent}cc)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 8px 22px ${accent}42, inset 0 1px 0 rgba(255,255,255,0.22)`,
            transition: 'background 1.2s ease, box-shadow 1.2s ease',
          }}
        >
          <BookOpenCheck style={{ width: 13, height: 13, color: '#000' }} strokeWidth={2.5} />
        </div>
        <div className="library-sidebar-brand-text" style={{ position: 'relative' }}>
          <div style={{ fontSize: 9.5, fontWeight: 750, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.32)' }}>
            Focus Workspace
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 650,
              color: tokens.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName || 'Library'}
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onCloseMobile}
            style={{
              position: 'absolute',
              right: 10,
              top: 14,
              width: 32,
              height: 32,
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: tokens.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      <nav
        className="library-sidebar-nav"
        style={{
          flex: 1,
          padding: showLabels ? '9px 7px' : '9px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          transition: 'padding 0.38s cubic-bezier(0.22, 1, 0.36, 1), transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
          transform: railCollapsed && !isMobile ? 'translate3d(-1px, 0, 0)' : 'none',
        }}
      >
        {navLinks}
      </nav>

      <div style={{ padding: showLabels ? '9px 11px' : '9px 6px', borderTop: '1px solid rgba(255,255,255,0.052)' }}>
        <button
          type="button"
          title={!showLabels ? 'Sign out' : undefined}
          onClick={onSignOut}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: showLabels ? 'flex-start' : 'center',
            gap: showLabels ? 8 : 0,
            padding: showLabels ? '8px 11px' : '10px 0',
            borderRadius: 9,
            border: 'none',
            background: 'transparent',
            color: tokens.textMuted,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            minHeight: showLabels ? undefined : 40,
            transition: 'all 0.22s ease, padding 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.038)';
            e.currentTarget.style.color = tokens.textPrimary;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = tokens.textMuted;
          }}
        >
          <LogOut style={{ width: 12, height: 12, flexShrink: 0 }} strokeWidth={2} />
          <span
            className="library-nav-label"
            style={{
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              maxWidth: showLabels ? 100 : 0,
              opacity: showLabels ? 1 : 0,
              transition: 'opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            Sign out
          </span>
        </button>
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={onCloseMobile}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 110,
              border: 'none',
              padding: 0,
              margin: 0,
              background: 'rgba(0,0,0,0.48)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              cursor: 'pointer',
              animation: spatial.reducedMotion ? 'none' : 'libFadeIn 0.28s ease both',
            }}
          />
        )}
        {sidebarPanel}
      </>
    );
  }

  return (
    <div
      className="library-sidebar-slot"
      data-collapsed={railCollapsed ? 'true' : 'false'}
      data-tablet={isTablet ? 'true' : 'false'}
    >
      {sidebarPanel}
      <LibrarySidebarRailToggle
        collapsed={railCollapsed}
        accent={accent}
        reducedMotion={spatial.reducedMotion}
        onToggle={onToggleCollapsed}
      />
    </div>
  );
}

/** Mobile menu trigger — rendered in hero top bar */
export function LibraryMobileMenuButton({
  onOpen,
  accent,
}: {
  onOpen: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={onOpen}
      className="library-mobile-menu-btn"
      style={{
        width: 40,
        height: 40,
        borderRadius: 11,
        border: `1px solid ${accent}28`,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: 'rgba(255,255,255,0.72)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginRight: 10,
      }}
    >
      <Menu style={{ width: 18, height: 18 }} strokeWidth={2} />
    </button>
  );
}
