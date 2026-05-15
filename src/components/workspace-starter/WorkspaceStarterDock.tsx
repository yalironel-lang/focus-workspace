import { LayoutTemplate } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
  onExpand: () => void;
  onDismiss: () => void;
}

/** Minimized starter entry — does not block the canvas. */
export function WorkspaceStarterDock({ tokens, onExpand, onDismiss }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: 'translateX(-50%)',
        zIndex: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 6px 6px 12px',
        borderRadius: 999,
        border: `1px solid ${tokens.cardBorder}`,
        background: `${tokens.cardBg}e8`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex items-center gap-2 rounded-full pr-3 py-1.5 text-[12px] font-semibold transition-colors"
        style={{ color: tokens.textSecondary, background: 'transparent', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
        }}
      >
        <LayoutTemplate className="w-3.5 h-3.5" strokeWidth={2} style={{ color: tokens.accent }} />
        Starter layouts
      </button>
      <span style={{ width: 1, height: 16, backgroundColor: tokens.divider, opacity: 0.7 }} aria-hidden />
      <button
        type="button"
        onClick={onDismiss}
        className="px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors"
        style={{ color: tokens.textGhost, background: 'transparent', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
        }}
      >
        Not now
      </button>
    </div>
  );
}

