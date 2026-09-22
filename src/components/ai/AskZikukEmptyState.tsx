/**
 * M0.9B.1 — empty Ask workspace: compact intro + subtle suggestion chips.
 */

import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export type AskZikukSuggestion = {
  label: string;
  prompt: string;
};

export const ASK_ZIKUK_SUGGESTIONS: readonly AskZikukSuggestion[] = [
  {
    label: 'Explain a concept',
    prompt: 'Explain a concept from my course materials',
  },
  {
    label: 'Summarize my notes',
    prompt: 'Summarize a topic from my notes',
  },
  {
    label: 'Help with a PDF',
    prompt: 'Help me understand something in my PDFs',
  },
  {
    label: 'Explain step by step',
    prompt: 'Explain this topic step by step',
  },
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
        justifyContent: 'flex-start',
        maxWidth: 560,
        width: '100%',
        margin: '0 auto',
        padding: '20px 0 8px',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 20,
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
          margin: '8px 0 0',
          fontSize: 13,
          lineHeight: 1.5,
          color: tokens.textSecondary,
          maxWidth: 440,
        }}
      >
        Answers use indexed Notebook pages and PDFs available for this course.
      </p>
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {ASK_ZIKUK_SUGGESTIONS.map(item => (
          <button
            key={item.label}
            type="button"
            data-ask-zikuk-suggestion="1"
            data-ask-zikuk-suggestion-prompt={item.prompt}
            disabled={disabled}
            onClick={() => onSuggestionSelect(item.prompt)}
            style={{
              textAlign: 'left',
              padding: '9px 12px',
              borderRadius: 10,
              border: `1px solid ${tokens.cardBorder}77`,
              background: `${tokens.cardBg}cc`,
              color: tokens.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.35,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              flex: '1 1 140px',
              maxWidth: '100%',
            }}
            onMouseEnter={e => {
              if (disabled) return;
              e.currentTarget.style.borderColor = `${accent}55`;
              e.currentTarget.style.color = tokens.textPrimary;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = `${tokens.cardBorder}77`;
              e.currentTarget.style.color = tokens.textSecondary;
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
