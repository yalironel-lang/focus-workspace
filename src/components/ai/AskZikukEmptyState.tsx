/**
 * M0.9B — empty Ask workspace for a selected course (honest capability copy).
 */

import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export const ASK_ZIKUK_SUGGESTIONS = [
  'Explain a concept from my course materials',
  'Summarize a topic from my notes',
  'Help me understand something in my PDFs',
  'Explain this topic step by step',
] as const;

type Props = {
  courseLabel: string;
  tokens: AtmosphereTokens;
  accent: string;
  onSuggestionSelect: (text: string) => void;
  disabled?: boolean;
};

export function AskZikukEmptyState({
  courseLabel,
  tokens,
  accent,
  onSuggestionSelect,
  disabled = false,
}: Props) {
  return (
    <div
      data-ask-zikuk-empty="1"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        maxWidth: 560,
        width: '100%',
        margin: '0 auto',
        padding: '24px 0',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: tokens.textPrimary,
          lineHeight: 1.25,
        }}
      >
        Ask about {courseLabel}
      </h2>
      <p
        style={{
          margin: '12px 0 0',
          fontSize: 14,
          lineHeight: 1.55,
          color: tokens.textSecondary,
        }}
      >
        ZIKUK can answer using course materials currently available to it, including indexed
        Notebook pages and PDFs.
      </p>
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: tokens.textGhost,
            marginBottom: 4,
          }}
        >
          Try asking
        </div>
        {ASK_ZIKUK_SUGGESTIONS.map(text => (
          <button
            key={text}
            type="button"
            data-ask-zikuk-suggestion="1"
            disabled={disabled}
            onClick={() => onSuggestionSelect(text)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${tokens.cardBorder}88`,
              background: `${tokens.wellBg}aa`,
              color: tokens.textSecondary,
              fontSize: 13,
              lineHeight: 1.4,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}
            onMouseEnter={e => {
              if (disabled) return;
              e.currentTarget.style.borderColor = `${accent}66`;
              e.currentTarget.style.color = tokens.textPrimary;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = `${tokens.cardBorder}88`;
              e.currentTarget.style.color = tokens.textSecondary;
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
