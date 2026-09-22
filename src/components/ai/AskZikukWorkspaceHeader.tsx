/**
 * M0.9B / M0.9B.1 / M0.9C2 — Ask ZIKUK workspace header.
 */

import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

type Props = {
  titleId: string;
  courseLabel: string;
  tokens: AtmosphereTokens;
  onClose: () => void;
  /** Shown when the session has completed turns. */
  showNewConversation?: boolean;
  onNewConversation?: () => void;
};

export function AskZikukWorkspaceHeader({
  titleId,
  courseLabel,
  tokens,
  onClose,
  showNewConversation = false,
  onNewConversation,
}: Props) {
  const actionBtn: CSSProperties = {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 30,
    padding: '0 11px',
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
        gap: 14,
        paddingBottom: 12,
        borderBottom: `1px solid ${tokens.divider}`,
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          id={titleId}
          style={{
            fontSize: 16,
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
            marginTop: 4,
            fontSize: 13,
            lineHeight: 1.35,
            color: tokens.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontWeight: 600, color: tokens.textPrimary }}>{courseLabel}</span>
          <span style={{ color: tokens.textMuted }} aria-hidden="true">
            {' '}
            ·{' '}
          </span>
          <span style={{ color: tokens.textMuted }}>Course context active</span>
        </div>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 11,
            lineHeight: 1.4,
            color: tokens.textGhost,
            maxWidth: 480,
          }}
        >
          Grounded in available course materials
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}
      >
        {showNewConversation && onNewConversation ? (
          <button
            type="button"
            data-ask-zikuk-new-conversation="1"
            aria-label="New conversation"
            onClick={onNewConversation}
            style={actionBtn}
          >
            New conversation
          </button>
        ) : null}
        <button
          type="button"
          data-ask-zikuk-close="1"
          aria-label="Close Ask ZIKUK"
          onClick={onClose}
          style={actionBtn}
        >
          Back to course
        </button>
      </div>
    </header>
  );
}
