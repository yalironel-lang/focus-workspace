/**
 * M0.9B.1 — single-turn result: prompt surface + document-like answer + sources below.
 */

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
  onOpenSource: (source: AskCourseSourceRef) => void;
};

export function AskZikukResult({
  question,
  text,
  sources,
  tokens,
  accent,
  onOpenSource,
}: Props) {
  return (
    <div
      data-ask-zikuk-result="1"
      style={{
        width: '100%',
        maxWidth: 680,
        margin: '0 auto',
        paddingTop: 4,
      }}
    >
      {question.trim() ? (
        <div
          data-ask-zikuk-question="1"
          aria-label="Your question"
          style={{
            marginBottom: 18,
            padding: '11px 14px',
            borderRadius: 12,
            border: `1px solid ${tokens.cardBorder}77`,
            background: `${tokens.wellBg}aa`,
            boxSizing: 'border-box',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
              color: tokens.textSecondary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {question.trim()}
          </p>
        </div>
      ) : null}

      <div data-ask-zikuk-answer-column="1" style={{ minWidth: 0 }}>
        <AskZikukAnswer
          text={text}
          sources={sources}
          textColor={tokens.textPrimary}
          mutedColor={tokens.textMuted}
          accentColor={accent}
          onCitationActivate={onOpenSource}
        />
        {sources.length > 0 ? (
          <div data-ask-zikuk-sources-column="1">
            <AskZikukSources
              sources={sources}
              tokens={tokens}
              accent={accent}
              onSourceActivate={onOpenSource}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
