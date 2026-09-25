/**
 * M1.1C / V1-H2 — compact Ask readiness strip (no dashboard).
 */

import { memo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  courseKnowledgeReadinessMessage,
  type CourseKnowledgeReadiness,
} from '../../lib/ai/askCourse/courseKnowledgeReadiness';

type Props = {
  readiness: CourseKnowledgeReadiness;
  tokens: AtmosphereTokens;
  /** Shown for unknown/fetch-failed readiness only. */
  onRetry?: () => void;
};

export const AskZikukReadinessBanner = memo(function AskZikukReadinessBanner({
  readiness,
  tokens,
  onRetry,
}: Props) {
  const message = courseKnowledgeReadinessMessage(readiness);
  if (!message) return null;

  const showRetry = readiness.kind === 'unknown' && typeof onRetry === 'function';

  return (
    <div
      data-ask-zikuk-readiness="1"
      data-ask-zikuk-readiness-kind={readiness.kind}
      data-ask-zikuk-readiness-usable={readiness.askUsable ? '1' : '0'}
      role="status"
      style={{
        margin: '0 0 10px',
        padding: '8px 11px',
        borderRadius: 10,
        border: `1px solid ${tokens.cardBorder}66`,
        background: `${tokens.wellBg}99`,
        color: tokens.textSecondary,
        fontSize: 12,
        lineHeight: 1.45,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      {showRetry ? (
        <button
          type="button"
          data-ask-zikuk-readiness-retry="1"
          onClick={onRetry}
          style={{
            flexShrink: 0,
            padding: '4px 10px',
            borderRadius: 8,
            border: `1px solid ${tokens.cardBorder}`,
            background: 'transparent',
            color: tokens.textPrimary,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
});
