import { ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AtmosphereTokens } from '../hooks/useAtmosphere';
import { BookOpenCheck, Sliders } from 'lucide-react';
import toast from 'react-hot-toast';

interface LayoutProps {
  children: ReactNode;
  tokens?: AtmosphereTokens;
  onOpenDesigner?: () => void;
  designMode?: boolean;
  onToggleDesignMode?: () => void;
}

// Fallback tokens for non-Dashboard pages
const DEFAULT: Partial<AtmosphereTokens> = {
  pageBg:          '#070b14',
  navBg:           'rgba(7,11,20,0.94)',
  cardBorder:      '#1a2638',
  cardBorderHover: '#2a3a54',
  textPrimary:     '#f1f5f9',
  textSecondary:   '#94a3b8',
  textMuted:       '#475569',
  textGhost:       '#1e2d40',
  accent:          '#f59e0b',
  accentHover:     '#fbbf24',
  divider:         '#0f1826',
  blur:            14,
};

export function Layout({ children, tokens, onOpenDesigner, designMode, onToggleDesignMode }: LayoutProps) {
  const t = tokens ?? (DEFAULT as AtmosphereTokens);

  const { user, signOut } = useAuth();
  const navigate          = useNavigate();
  const { pathname }      = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
      navigate('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: t.pageBg,
        color: t.textPrimary,
        transition: 'background-color 0.4s ease, color 0.3s ease',
      }}
    >

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50"
        style={{
          backgroundColor: t.navBg,
          borderBottom: `1px solid ${t.divider}`,
          backdropFilter: `blur(${t.blur}px)`,
          WebkitBackdropFilter: `blur(${t.blur}px)`,
          transition: 'background-color 0.4s ease',
        }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between h-12">

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2.5 group">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  backgroundColor: t.accent,
                  boxShadow: `0 0 12px ${t.accentGlow ?? t.accent + '50'}`,
                }}
              >
                <BookOpenCheck className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
              </div>
              <span
                className="font-bold text-sm tracking-tight transition-colors"
                style={{ color: t.textPrimary }}
              >
                Focus
              </span>
            </Link>

            {user && (
              <div className="flex items-center gap-1">

                {/* Route links */}
                {([
                  { to: '/dashboard', label: 'Dashboard' },
                  { to: '/schedule',  label: 'Schedule'  },
                ] as const).map(({ to, label }) => {
                  const active = pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                      style={
                        active
                          ? { color: t.textPrimary, backgroundColor: t.cardBorder }
                          : { color: t.textGhost }
                      }
                      onMouseEnter={e => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.color = t.textSecondary;
                          (e.currentTarget as HTMLElement).style.backgroundColor = t.cardBorder;
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.color = t.textGhost;
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {label}
                    </Link>
                  );
                })}

                <span className="w-px h-3.5 mx-1.5" style={{ backgroundColor: t.divider }} />

                {/* Design mode toggle (dashboard only) */}
                {onToggleDesignMode && (
                  <button
                    onClick={onToggleDesignMode}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                    style={{
                      color:           designMode ? t.accent       : t.textGhost,
                      backgroundColor: designMode ? t.accentSubtle ?? t.accent + '15' : 'transparent',
                      border: designMode ? `1px solid ${t.accent}40` : '1px solid transparent',
                    }}
                    onMouseEnter={e => {
                      if (!designMode) {
                        (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = t.cardBorder;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!designMode) {
                        (e.currentTarget as HTMLButtonElement).style.color = t.textGhost;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      }
                    }}
                    title="Toggle design mode"
                  >
                    <Sliders className="w-3 h-3" />
                    <span className="hidden sm:inline">Design</span>
                  </button>
                )}

                {/* Customize / workspace designer */}
                {onOpenDesigner && (
                  <button
                    onClick={onOpenDesigner}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                    style={{ color: t.textGhost }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = t.accent;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = t.cardBorder;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.color = t.textGhost;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                    }}
                    title="Customize workspace"
                  >
                    Customize
                  </button>
                )}

                <span className="w-px h-3.5 mx-1" style={{ backgroundColor: t.divider }} />

                <button
                  onClick={handleSignOut}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                  style={{ color: t.textGhost }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = t.cardBorder;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = t.textGhost;
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>

    </div>
  );
}
