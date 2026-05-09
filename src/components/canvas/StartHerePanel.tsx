/**
 * FocusSurface — the adaptive top-of-canvas presence.
 *
 * One message. One action. Capture always available below.
 *
 * Adapts to context:
 *   • No workspaces → invite to write first
 *   • Urgent deadline → surface the urgency, offer a session
 *   • Last session exists → offer to continue
 *   • Normal, has work → show top priority, start session
 *   • Ahead / calm → quiet encouragement, capture input prominent
 *
 * Design rules:
 *   - No step numbers. No percentages. No "status."
 *   - Every word either helps the user think or helps them act.
 *   - Capture is always secondary to the primary direction.
 */

import { useState } from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { WorkspaceIntelligence } from '../../utils/workspaceIntelligence';
import type { ContinuityRecord } from '../../hooks/useSessionContinuity';

interface Props {
  tokens:               AtmosphereTokens;
  intel:                WorkspaceIntelligence;
  greeting:             string;
  lastSession:          ContinuityRecord | null;
  onCapture:            (text: string) => void;
  onStartSession:       () => void;
  onOpenSection?:       (id: string) => void;
  onDismissContinuity?: () => void;
}

// ── Time-aware continuity copy ─────────────────────────────────────────────

function continuityMessage(session: ContinuityRecord): string {
  const hoursAgo = (Date.now() - new Date(session.savedAt).getTime()) / 3_600_000;
  const title = session.sectionTitle;
  if (hoursAgo < 8)  return `You were working on "${title}". Ready to continue?`;
  if (hoursAgo < 36) return `You left off with "${title}" yesterday. Pick up where you stopped.`;
  return `You were working on "${title}".`;
}

export function StartHerePanel({
  tokens, intel, greeting, lastSession,
  onCapture, onStartSession, onOpenSection, onDismissContinuity,
}: Props) {
  const [captureText, setCaptureText] = useState('');

  const {
    topItem, suggestedSection, statusNarrative, overallStatus,
  } = intel;

  const isEmpty         = !topItem && !suggestedSection;
  const hasPriority     = !!(topItem || suggestedSection);
  const priorityId      = topItem?.sectionId ?? suggestedSection?.id ?? null;

  // ── Message: the one thing the user should know right now ──────────────

  const message: string =
    lastSession
      ? continuityMessage(lastSession)
      : hasPriority
        ? statusNarrative
        : 'Start by writing down what\'s on your mind.';

  // ── Tone: maps overallStatus → text color for the message ──────────────

  const messageColor =
    lastSession             ? tokens.textPrimary   :
    overallStatus === 'critical' ? '#f87171'        :
    overallStatus === 'warning'  ? '#fbbf24'        :
    overallStatus === 'ahead'    ? '#34d399'        :
    tokens.textPrimary;

  // ── Primary CTA ────────────────────────────────────────────────────────

  const ctaLabel =
    lastSession   ? 'Continue session' :
    hasPriority   ? 'Start a session'  :
    'Start a session';

  const handleCTA = () => {
    if (lastSession?.sectionId && onOpenSection) {
      onOpenSection(lastSession.sectionId);
    } else if (priorityId && onOpenSection) {
      onOpenSection(priorityId);
    } else {
      onStartSession();
    }
  };

  // ── Capture ────────────────────────────────────────────────────────────

  const handleCapture = () => {
    if (!captureText.trim()) return;
    onCapture(captureText.trim());
    setCaptureText('');
  };

  return (
    <div
      style={{
        gridColumn:      'span 12',
        borderRadius:    `${tokens.radius}px`,
        backgroundColor: tokens.cardBg,
        border:          `1px solid ${tokens.cardBorder}`,
        padding:         '28px 32px',
        animation:       'slideUp 0.4s var(--fw-ease-smooth) both',
      }}
    >
      {/* ── Context line ────────────────────────────────────────── */}
      <p style={{
        fontFamily:    "'Space Grotesk', sans-serif",
        fontSize:      '12px',
        fontWeight:    500,
        color:         tokens.textGhost,
        margin:        '0 0 12px',
        letterSpacing: '0.01em',
      }}>
        {greeting}
      </p>

      {/* ── Primary message ─────────────────────────────────────── */}
      <p style={{
        fontFamily:    "'Plus Jakarta Sans', sans-serif",
        fontSize:      '20px',
        fontWeight:    700,
        color:         messageColor,
        margin:        '0 0 22px',
        lineHeight:    1.35,
        letterSpacing: '-0.02em',
        maxWidth:      '560px',
      }}>
        {message}
      </p>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

        {/* Primary CTA — always shown except when truly empty */}
        {(hasPriority || lastSession) && (
          <button
            onClick={handleCTA}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             '6px',
              padding:         '10px 18px',
              borderRadius:    '10px',
              border:          'none',
              backgroundColor: tokens.accent,
              color:           '#000',
              fontSize:        '13px',
              fontWeight:      700,
              cursor:          'pointer',
              transition:      'all 0.15s ease',
              fontFamily:      "'Space Grotesk', sans-serif",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentHover;
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${tokens.accentGlow}`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accent;
              (e.currentTarget as HTMLElement).style.transform = 'none';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            <Zap style={{ width: '13px', height: '13px' }} strokeWidth={2.5} />
            {ctaLabel}
          </button>
        )}

        {/* Open the priority workspace (secondary, only when no continuity) */}
        {!lastSession && priorityId && onOpenSection && (
          <button
            onClick={() => onOpenSection(priorityId)}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             '4px',
              padding:         '9px 14px',
              borderRadius:    '10px',
              border:          `1px solid ${tokens.cardBorder}`,
              backgroundColor: 'transparent',
              color:           tokens.textGhost,
              fontSize:        '12px',
              fontWeight:      600,
              cursor:          'pointer',
              transition:      'all 0.15s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorderHover;
              (e.currentTarget as HTMLElement).style.color = tokens.textSecondary;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
              (e.currentTarget as HTMLElement).style.color = tokens.textGhost;
            }}
          >
            Open workspace
            <ArrowRight style={{ width: '11px', height: '11px' }} />
          </button>
        )}

        {/* Dismiss continuity — quiet text link */}
        {lastSession && onDismissContinuity && (
          <button
            onClick={onDismissContinuity}
            style={{
              fontSize:        '12px',
              fontWeight:      500,
              color:           tokens.textGhost,
              background:      'none',
              border:          'none',
              cursor:          'pointer',
              padding:         '4px 2px',
              transition:      'color 0.12s ease',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = tokens.textMuted}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = tokens.textGhost}
          >
            Start fresh
          </button>
        )}
      </div>

      {/* ── Capture row — always secondary, below the divider ───── */}
      <div style={{
        marginTop:   '22px',
        paddingTop:  '18px',
        borderTop:   `1px solid ${tokens.divider}`,
        display:     'flex',
        gap:         '8px',
      }}>
        <input
          value={captureText}
          onChange={e => setCaptureText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCapture(); }}
          placeholder={isEmpty ? 'Write something down…' : 'Capture a thought before you start…'}
          style={{
            flex:            1,
            padding:         '9px 12px',
            borderRadius:    '9px',
            border:          `1px solid ${tokens.cardBorder}`,
            backgroundColor: tokens.wellBg,
            color:           tokens.textPrimary,
            fontSize:        '13px',
            outline:         'none',
            transition:      'border-color 0.15s ease',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = tokens.focusBorder)}
          onBlur={e  => (e.currentTarget.style.borderColor = tokens.cardBorder)}
        />
        <button
          onClick={handleCapture}
          disabled={!captureText.trim()}
          style={{
            padding:         '9px 16px',
            borderRadius:    '9px',
            border:          'none',
            backgroundColor: captureText.trim() ? tokens.accent : `${tokens.accent}18`,
            color:           captureText.trim() ? '#000' : tokens.textGhost,
            fontSize:        '12px',
            fontWeight:      700,
            cursor:          captureText.trim() ? 'pointer' : 'default',
            flexShrink:      0,
            transition:      'all 0.15s ease',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
