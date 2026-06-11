import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';

type Props = {
  tokens: AtmosphereTokens;
  visible: boolean;
  onDismiss: () => void;
};

export function CompositionCoach({ tokens, visible, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <div
      data-composition-coach="1"
      style={{
        margin: '0 0 14px',
        padding: '10px 14px',
        borderRadius: 10,
        border: `1px solid ${tokens.cardBorder}`,
        background: 'rgba(255,255,255,0.03)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <p
        style={{
          margin: 0,
          flex: 1,
          fontSize: 12,
          lineHeight: 1.5,
          color: tokens.textMuted,
        }}
      >
        Tap a line for math · + between blocks for steps · <strong style={{ fontWeight: 600 }}>Math</strong> for more
      </p>
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={onDismiss}
        aria-label="Dismiss hint"
        style={{
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          color: tokens.textGhost,
          fontSize: 11,
          cursor: 'pointer',
          padding: '2px 6px',
        }}
      >
        Skip
      </button>
    </div>
  );
}
