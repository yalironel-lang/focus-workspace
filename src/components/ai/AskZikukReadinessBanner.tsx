/**
 * M1.1C — compact Ask readiness strip (no dashboard).
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
};

export const AskZikukReadinessBanner = memo(function AskZikukReadinessBanner({
  readiness,
  tokens,
}: Props) {
  const message = courseKnowledgeReadinessMessage(readiness);
  if (!message) return null;

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
      }}
    >
      {message}
    </div>
  );
});
