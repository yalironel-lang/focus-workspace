import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';

interface Props {
  tokens: AtmosphereTokens;
  sourceTitle: string;
  candidates: ProjectSpaceObject[];
  onPick: (workObjectId: string) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  connectedIds?: string[];
  onCreateNew?: () => void;
  newButtonLabel?: string;
}

export function StudySessionPickWork({
  tokens,
  sourceTitle,
  candidates,
  onPick,
  onCancel,
  title,
  subtitle,
  connectedIds,
  onCreateNew,
  newButtonLabel = '+ New Notebook',
}: Props) {
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
          {title || 'Study this exam'}
        </div>
        <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 14 }}>
          {subtitle || `Pick a math notebook for ${sourceTitle || 'this exam'}.`}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {candidates.map(c => {
            const isConnected = connectedIds ? connectedIds.includes(c.id) : false;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${isConnected ? tokens.accentSubtle || tokens.cardBorder : tokens.cardBorder}`,
                    background: tokens.wellBg,
                    color: tokens.textPrimary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title || 'Untitled Notebook'}
                  </span>
                  {isConnected && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: tokens.accent,
                        flexShrink: 0,
                      }}
                    >
                      Connected
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {onCreateNew ? (
            <button
              type="button"
              onClick={onCreateNew}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: tokens.accent,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
              }}
            >
              {newButtonLabel}
            </button>
          ) : <div />}
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 12,
              color: tokens.textMuted,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 6px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
