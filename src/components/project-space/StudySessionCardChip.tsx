import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
  title: string;
  subtitle: string;
  onOpen: () => void;
}

/** Canvas placeholder while object is shown in the study session shell. */
export function StudySessionCardChip({ tokens, title, subtitle, onOpen }: Props) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        boxSizing: 'border-box',
        background: tokens.wellBg,
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: tokens.textGhost }}>
        STUDYING
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: tokens.textPrimary,
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {title || 'Untitled'}
      </div>
      <div style={{ fontSize: 11, color: tokens.textMuted, textAlign: 'center' }}>{subtitle}</div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          marginTop: 4,
          fontSize: 11,
          fontWeight: 600,
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid ${tokens.cardBorder}`,
          background: tokens.cardBg,
          color: tokens.accent,
          cursor: 'pointer',
        }}
      >
        Continue studying
      </button>
    </div>
  );
}
