import { Download, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { usePwaInstall } from '../../hooks/usePwaInstall';

interface Props {
  tokens: AtmosphereTokens;
  compact?: boolean;
}

export function InstallAppBanner({ tokens, compact = false }: Props) {
  const { showCta, install, dismiss } = usePwaInstall();

  if (!showCta) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        gap: 12,
        padding: compact ? '12px 14px' : '14px 16px',
        borderRadius: 14,
        border: `1px solid ${tokens.cardBorder}`,
        background: `linear-gradient(135deg, ${tokens.cardBg}ee, ${tokens.pageBg}cc)`,
        boxShadow: tokens.shadowSm,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${tokens.accent}22`,
          color: tokens.accent,
          flexShrink: 0,
        }}
      >
        <Download size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: compact ? 13 : 14,
            fontWeight: 700,
            color: tokens.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          Install Focus on your computer
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 12,
            lineHeight: 1.45,
            color: tokens.textSecondary,
          }}
        >
          Your study OS stays on this device — notes, PDFs, and spatial layout open from the dock,
          not a browser tab.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => void install()}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: 'none',
            background: tokens.accent,
            color: '#0a0805',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Install app
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          style={{
            padding: 6,
            borderRadius: 8,
            border: `1px solid ${tokens.cardBorder}`,
            background: 'transparent',
            color: tokens.textGhost,
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
