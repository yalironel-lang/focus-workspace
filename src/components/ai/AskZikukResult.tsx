/**
 * M0.9B — single-turn result: question echo + answer + sources (reuse answer/sources).
 */

import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import { AskZikukAnswer } from './AskZikukAnswer';
import { AskZikukSources } from './AskZikukSources';

type Props = {
  question: string;
  text: string;
  sources: AskCourseSourceRef[];
  tokens: AtmosphereTokens;
  accent: string;
  narrow: boolean;
  onOpenSource: (source: AskCourseSourceRef) => void;
};

export function AskZikukResult({
  question,
  text,
  sources,
  tokens,
  accent,
  narrow,
  onOpenSource,
}: Props) {
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: narrow || sources.length === 0 ? '1fr' : 'minmax(0, 1fr) minmax(220px, 280px)',
    gap: narrow ? 20 : 28,
    alignItems: 'start',
    width: '100%',
  };

  return (
    <div data-ask-zikuk-result="1" style={{ width: '100%', maxWidth: 880, margin: '0 auto' }}>
      {question.trim() ? (
        <div
          data-ask-zikuk-question="1"
          style={{
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: `1px solid ${tokens.divider}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              marginBottom: 6,
            }}
          >
            Your question
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.5,
              color: tokens.textSecondary,
              whiteSpace: 'pre-wrap',
            }}
          >
            {question.trim()}
          </p>
        </div>
      ) : null}

      <div style={gridStyle}>
        <div data-ask-zikuk-answer-column="1" style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              marginBottom: 10,
            }}
          >
            Answer
          </div>
          <AskZikukAnswer
            text={text}
            sources={sources}
            textColor={tokens.textPrimary}
            mutedColor={tokens.textMuted}
            accentColor={accent}
            onCitationActivate={onOpenSource}
          />
        </div>
        {sources.length > 0 ? (
          <aside data-ask-zikuk-sources-column="1" style={{ minWidth: 0 }}>
            <AskZikukSources
              sources={sources}
              tokens={tokens}
              accent={accent}
              onSourceActivate={onOpenSource}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
