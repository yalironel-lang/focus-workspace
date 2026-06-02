import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';

interface Props {
  tokens: AtmosphereTokens;
  sourceTitle: string;
  candidates: ProjectSpaceObject[];
  onPick: (workObjectId: string) => void;
  onCancel: () => void;
}

export function StudySessionPickWork({ tokens, sourceTitle, candidates, onPick, onCancel }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose work notebook"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(14, 10, 6, 0.45)',
        padding: 24,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 12,
          border: `1px solid ${tokens.cardBorder}`,
          background: tokens.cardBg,
          padding: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, marginBottom: 4 }}>
          Study this exam
        </div>
        <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 14 }}>
          Pick a math notebook for {sourceTitle || 'this exam'}.
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${tokens.cardBorder}`,
                  background: tokens.wellBg,
                  color: tokens.textPrimary,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {c.title || 'Math notebook'}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          style={{
            marginTop: 12,
            fontSize: 11,
            color: tokens.textMuted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
