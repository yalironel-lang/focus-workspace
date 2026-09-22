/**
 * M0.9B.1 / M0.9C2 — prompt surface + document-like answer + sources below.
 */

import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { AskCourseSourceRef } from '../../lib/ai/gatewayClient';
import { AskZikukAnswer } from './AskZikukAnswer';
import { AskZikukSources } from './AskZikukSources';

type Props = {
  question: string;
  text?: string | null;
  sources?: AskCourseSourceRef[];
  tokens: AtmosphereTokens;
  accent: string;
  onOpenSource?: (source: AskCourseSourceRef) => void;
  /** When true, show loading under the question (active turn). */
  loading?: boolean;
  turnId?: string;
};

export function AskZikukResult({
  question,
  text,
  sources = [],
  tokens,
  accent,
  onOpenSource,
  loading = false,
  turnId,
}: Props) {
  return (
    <div
      data-ask-zikuk-result="1"
      data-ask-zikuk-turn-id={turnId}
      style={{
        width: '100%',
        maxWidth: 680,
        margin: '0 auto',
        paddingTop: 4,
        paddingBottom: 20,
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

      {loading ? (
        <p
          data-ask-zikuk-loading="1"
          style={{
            margin: '0 0 8px',
            fontSize: 14,
            color: tokens.textSecondary,
          }}
        >
          Searching your course materials…
        </p>
      ) : null}

      {!loading && text != null && text !== '' ? (
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
      ) : null}
    </div>
  );
}
