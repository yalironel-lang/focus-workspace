import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export function Layout({ children, tokens, designMode, onToggleDesignMode }: LayoutProps) {
  const t = tokens ?? (DEFAULT as AtmosphereTokens);

  const { user, signOut } = useAuth();
  const navigate          = useNavigate();

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

                {/* Design mode toggle — only when explicitly wired */}
                {onToggleDesignMode && (
                  <button
                    onClick={onToggleDesignMode}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                    style={{
                      color:           designMode ? t.accent       : t.textGhost,
                      backgroundColor: designMode ? t.accentSubtle ?? t.accent + '15' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (!designMode) (e.currentTarget as HTMLButtonElement).style.color = t.textMuted;
                    }}
                    onMouseLeave={e => {
                      if (!designMode) (e.currentTarget as HTMLButtonElement).style.color = t.textGhost;
                    }}
                    title="Toggle design mode"
                  >
                    <Sliders className="w-3 h-3" />
                  </button>
                )}

                {/* Sign out — ghost, only visible on hover */}
                <button
                  onClick={handleSignOut}
                  className="text-xs px-2 py-1.5 rounded-lg transition-all"
                  style={{ color: t.textGhost, opacity: 0.4 }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                    (e.currentTarget as HTMLButtonElement).style.color = t.textSecondary;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.4';
                    (e.currentTarget as HTMLButtonElement).style.color = t.textGhost;
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
