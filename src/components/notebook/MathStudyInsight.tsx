import { memo, useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { inferMathTopicsFromNotebook } from '../../lib/mathTopicHeuristics';

interface Props {
  body: string;
  tokens: AtmosphereTokens;
}

export const MathStudyInsight = memo(function MathStudyInsight({ body, tokens }: Props) {
  const insight = useMemo(() => inferMathTopicsFromNotebook(body), [body]);

  if (insight.tags.length === 0) return null;

  return (
    <div
      className="math-nb-insight"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      {insight.tags.map(tag => (
        <span
          key={tag}
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.03em',
            color: tokens.textMuted,
            padding: '2px 8px',
            borderRadius: 999,
            border: `1px solid ${tokens.cardBorder}`,
            background: 'rgba(0,0,0,0.12)',
          }}
        >
          {tag}
        </span>
      ))}
      {insight.recallHint ? (
        <span style={{ fontSize: 10, color: tokens.textMuted, opacity: 0.75, fontStyle: 'italic' }}>
          {insight.recallHint}
        </span>
      ) : null}
    </div>
  );
});
