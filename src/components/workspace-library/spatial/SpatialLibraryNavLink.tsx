import { Link } from 'react-router-dom';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  to: string;
  accent: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SpatialLibraryNavLink({
  tokens,
  active,
  icon,
  label,
  to,
  accent,
  collapsed,
  onNavigate,
}: Props) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 9,
        padding: collapsed ? '10px 0' : '9px 11px',
        borderRadius: 10,
        fontSize: 12.5,
        fontWeight: 500,
        textDecoration: 'none',
        transition: 'background 0.22s ease, color 0.22s ease, border-color 0.22s ease, padding 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
        color: active ? accent : tokens.textMuted,
        background: active ? `${accent}14` : 'transparent',
        border: active ? `1px solid ${accent}28` : '1px solid transparent',
        cursor: 'pointer',
        minHeight: collapsed ? 40 : undefined,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <span
        style={{
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          maxWidth: collapsed ? 0 : 140,
          opacity: collapsed ? 0 : 1,
          transition: 'opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {label}
      </span>
    </Link>
  );
}
