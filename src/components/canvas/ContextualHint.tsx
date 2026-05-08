/**
 * ContextualHint — floating progressive disclosure pill.
 *
 * Appears one at a time, above the QuickAddFab, bottom-right.
 * Teaches through context — never blocks the user.
 *
 * Psychology:
 *   One question at a time prevents decision fatigue.
 *   Shows only after the user has already taken some action (condition-gated).
 *   Dismisses permanently — no re-nagging.
 */

import { X, Lightbulb } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { Hint, HintId } from '../../hooks/useContextualHints';

interface Props {
  hint:     (Hint & { id: HintId }) | null;
  tokens:   AtmosphereTokens;
  onDismiss: (id: HintId) => void;
  onAction:  (id: HintId) => void;
}

export function ContextualHint({ hint, tokens, onDismiss, onAction }: Props) {
  if (!hint) return null;

  return (
    <div
      style={{
        position:        'fixed',
        bottom:          '84px',   // above the FAB (48px) + gap
        right:           '24px',
        zIndex:          44,       // below FAB (z=45) but above canvas
        display:         'flex',
        alignItems:      'center',
        gap:             '8px',
        padding:         '9px 12px 9px 10px',
        borderRadius:    '12px',
        border:          `1px solid ${tokens.cardBorderHover}`,
        backgroundColor: tokens.cardBg,
        boxShadow:       `0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px ${tokens.accent}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
        maxWidth:        '300px',
        animation:       'slideUp 0.3s 0.2s var(--fw-ease-spring) both',
      }}
    >
      {/* Icon */}
      <Lightbulb
        style={{
          width:     '13px',
          height:    '13px',
          color:     tokens.accent,
          flexShrink: 0,
          opacity:   0.8,
        }}
      />

      {/* Message */}
      <p style={{
        fontSize:   '11px',
        lineHeight: 1.5,
        color:      tokens.textMuted,
        margin:     0,
        flex:       1,
        minWidth:   0,
      }}>
        {hint.message}
      </p>

      {/* Action button */}
      {hint.action && (
        <button
          onClick={() => onAction(hint.id)}
          style={{
            fontSize:        '10px',
            fontWeight:      700,
            color:           tokens.accent,
            background:      'none',
            border:          'none',
            cursor:          'pointer',
            padding:         '2px 4px',
            borderRadius:    '5px',
            whiteSpace:      'nowrap',
            flexShrink:      0,
            transition:      'opacity 0.12s ease',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
        >
          {hint.action}
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(hint.id)}
        style={{
          width:           '18px',
          height:          '18px',
          borderRadius:    '5px',
          border:          'none',
          backgroundColor: 'transparent',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          color:           tokens.textGhost,
          flexShrink:      0,
          transition:      'all 0.12s ease',
          padding:         0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
        }}
      >
        <X style={{ width: '9px', height: '9px' }} />
      </button>
    </div>
  );
}
