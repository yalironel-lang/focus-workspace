/**
 * M0.9B — Ask ZIKUK workspace header: product identity + course context + close.
 */

import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

type Props = {
  titleId: string;
  courseLabel: string;
  tokens: AtmosphereTokens;
  onClose: () => void;
};

export function AskZikukWorkspaceHeader({ titleId, courseLabel, tokens, onClose }: Props) {
  const closeBtn: CSSProperties = {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    padding: '0 12px',
    borderRadius: 8,
    border: `1px solid ${tokens.cardBorder}88`,
    background: 'transparent',
    color: tokens.textSecondary,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  };

  return (
    <header
      data-ask-zikuk-header="1"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        paddingBottom: 16,
        borderBottom: `1px solid ${tokens.divider}`,
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          id={titleId}
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: tokens.textPrimary,
            lineHeight: 1.25,
          }}
        >
          Ask ZIKUK
        </div>
        <div
          data-ask-zikuk-course-context="1"
          style={{
            marginTop: 8,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: '6px 10px',
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: tokens.textPrimary,
              lineHeight: 1.3,
            }}
          >
            {courseLabel}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: tokens.textMuted,
              lineHeight: 1.3,
            }}
          >
            Course context active
          </span>
        </div>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12,
            lineHeight: 1.45,
            color: tokens.textMuted,
            maxWidth: 520,
          }}
        >
          ZIKUK uses available course materials when answering.
        </p>
      </div>
      <button
        type="button"
        data-ask-zikuk-close="1"
        aria-label="Close Ask ZIKUK"
        onClick={onClose}
        style={closeBtn}
      >
        Back to course
      </button>
    </header>
  );
}
