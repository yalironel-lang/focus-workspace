/**
 * M0.9B.1 / M0.9C2 / TQ1.2.3 — prompt surface + document-like answer + sources below.
 * Renders turn-level teaching mode badge when available.
 */

import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { AskCourseSourceRef, ContextAvailable, KnowledgeTier, TeachingMode } from '../../lib/ai/gatewayClient';
import { presentAnswerTextForProvenance } from '../../lib/ai/askCourse/presentProvenance';
import { AskZikukAnswer } from './AskZikukAnswer';
import { AskZikukSources } from './AskZikukSources';
import { KnowledgeProvenanceBadge } from './KnowledgeProvenanceBadge';
import { TeachingModeBadge } from './TeachingModeUi';

type Props = {
  question: string;
  text?: string | null;
  sources?: AskCourseSourceRef[];
  knowledgeTier?: KnowledgeTier;
  contextAvailable?: ContextAvailable;
  tokens: AtmosphereTokens;
  accent: string;
  onOpenSource?: (source: AskCourseSourceRef) => void;
  /** When true, show loading under the question (active turn). */
  loading?: boolean;
  turnId?: string;
  mode?: TeachingMode;
  generationIncomplete?: boolean;
};

export function AskZikukResult({
  question,
  text,
  sources = [],
  knowledgeTier,
  contextAvailable,
  tokens,
  accent,
  onOpenSource,
  loading = false,
  turnId,
  mode,
  generationIncomplete = false,
}: Props) {
  return (
    <div
      data-ask-zikuk-result="1"
      data-ask-zikuk-turn-id={turnId}
      style={{
        width: '100%',
        maxWidth: 720,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
          {mode ? <TeachingModeBadge mode={mode} size="xs" /> : null}
          <p
            data-ask-zikuk-loading="1"
            style={{
              margin: 0,
              fontSize: 14,
              color: tokens.textSecondary,
            }}
          >
            Searching your course materials…
          </p>
        </div>
      ) : null}

      {!loading && text != null && text !== '' ? (
        <div data-ask-zikuk-answer-column="1" style={{ minWidth: 0 }}>
          {mode ? (
            <div
              data-ask-zikuk-turn-mode-badge="1"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <TeachingModeBadge mode={mode} size="xs" />
            </div>
          ) : null}
          <AskZikukAnswer
            text={presentAnswerTextForProvenance(text, knowledgeTier)}
            sources={
              knowledgeTier === 'general_academic' || knowledgeTier === 'pdf_selection' ? [] : sources
            }
            textColor={tokens.textPrimary}
            mutedColor={tokens.textMuted}
            accentColor={accent}
            onCitationActivate={onOpenSource}
            generationIncomplete={generationIncomplete}
          />
          {sources.length > 0 &&
          knowledgeTier !== 'general_academic' &&
          knowledgeTier !== 'pdf_selection' ? (
            <div data-ask-zikuk-sources-column="1">
              <AskZikukSources
                sources={sources}
                tokens={tokens}
                accent={accent}
                onSourceActivate={onOpenSource}
              />
            </div>
          ) : null}
          {knowledgeTier ? (
            <KnowledgeProvenanceBadge
              tier={knowledgeTier}
              contextAvailable={contextAvailable}
              color={tokens.textMuted}
              borderColor={tokens.cardBorder}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
