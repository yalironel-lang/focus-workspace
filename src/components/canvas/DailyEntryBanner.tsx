/**
 * DailyEntryBanner — the product's daily intelligence strip.
 *
 * Shows once per day at the top of the canvas.
 * Surfaces the #1 most important thing + streak context.
 * Dismissible — re-appears fresh each new day.
 *
 * Psychology:
 *   This is the main daily-return mechanic.
 *   Users open the app to see what it says about today.
 *   Variable reward: content changes based on actual urgency.
 *   NEVER show generic stats — always show an outcome directive.
 */

import { ArrowRight, X, Flame, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { WorkspaceIntelligence } from '../../utils/workspaceIntelligence';
import type { DailyLoopState } from '../../hooks/useDailyLoop';

interface Props {
  tokens:    AtmosphereTokens;
  intel:     WorkspaceIntelligence;
  loop:      DailyLoopState;
  greeting:  string;
  dayContext: string;
  /** Navigate to a section by ID */
  onOpenSection?: (id: string) => void;
  onStartSession?: () => void;
}

// Status → visual config
const STATUS_CONFIG = {
  critical: {
    border:     '#ef444460',
    bg:         '#ef444408',
    iconColor:  '#f87171',
    Icon:       AlertCircle,
  },
  warning: {
    border:     '#f59e0b55',
    bg:         '#f59e0b06',
    iconColor:  '#fbbf24',
    Icon:       AlertTriangle,
  },
  stable: {
    border:     null,   // uses token
    bg:         null,
    iconColor:  null,
    Icon:       null,
  },
  ahead: {
    border:     '#10b98155',
    bg:         '#10b98106',
    iconColor:  '#34d399',
    Icon:       CheckCircle,
  },
} as const;

export function DailyEntryBanner({
  tokens, intel, loop, greeting, dayContext, onOpenSection, onStartSession,
}: Props) {
  const { overallStatus, topItem, momentumScore, statusNarrative } = intel;
  const { streak, isBannerDismissed, dismissBanner } = loop;

  // Don't show if dismissed today or nothing to show
  if (isBannerDismissed) return null;

  const cfg = STATUS_CONFIG[overallStatus];
  const borderColor = cfg.border ?? `${tokens.accent}25`;
  const bgColor     = cfg.bg     ?? `${tokens.accent}05`;

  const hasAction = !!(topItem?.sectionId && onOpenSection) || !!onStartSession;

  return (
    <div
      style={{
        gridColumn:      'span 12',
        borderRadius:    `${tokens.radius}px`,
        border:          `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        padding:         '14px 18px',
        display:         'flex',
        alignItems:      'center',
        gap:             '14px',
        animation:       'slideUp 0.4s var(--fw-ease-smooth) both',
        position:        'relative',
      }}
    >
      {/* Status icon */}
      {cfg.Icon && (
        <cfg.Icon
          style={{
            width:     '16px',
            height:    '16px',
            color:     cfg.iconColor!,
            flexShrink: 0,
          }}
        />
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Greeting line */}
        <p style={{
          fontFamily:    "'Plus Jakarta Sans', sans-serif",
          fontSize:      '13px',
          fontWeight:    700,
          color:         tokens.textPrimary,
          margin:        0,
          marginBottom:  '2px',
          letterSpacing: '-0.01em',
          display:       'flex',
          alignItems:    'center',
          gap:           '8px',
          flexWrap:      'wrap',
        }}>
          {greeting}
          {dayContext && (
            <span style={{
              fontSize:  '11px',
              fontWeight: 400,
              color:     tokens.textGhost,
            }}>
              {dayContext}
            </span>
          )}
        </p>

        {/* Directive */}
        <p style={{
          fontSize:   '12px',
          lineHeight: 1.55,
          color:      overallStatus === 'critical' ? '#f87171' :
                      overallStatus === 'warning'  ? '#fbbf24' :
                      overallStatus === 'ahead'    ? '#34d399' :
                      tokens.textMuted,
          margin:     0,
        }}>
          {statusNarrative}
        </p>
      </div>

      {/* Right: streak + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>

        {/* Momentum + streak (compact) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
          {/* Streak */}
          {streak >= 2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Flame style={{ width: '11px', height: '11px', color: '#f59e0b' }} />
              <span style={{
                fontFamily:    "'Space Grotesk', sans-serif",
                fontSize:      '10px',
                fontWeight:    700,
                color:         '#f59e0b',
                letterSpacing: '0.04em',
              }}>
                {streak}-day streak
              </span>
            </div>
          )}

          {/* Momentum score */}
          {momentumScore > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width:           '48px',
                height:          '3px',
                borderRadius:    '2px',
                backgroundColor: `${tokens.accent}20`,
                overflow:        'hidden',
              }}>
                <div style={{
                  height:          '100%',
                  borderRadius:    '2px',
                  width:           `${momentumScore}%`,
                  backgroundColor: overallStatus === 'critical' ? '#ef4444' :
                                   overallStatus === 'warning'  ? '#f59e0b' :
                                   momentumScore >= 70          ? '#10b981' :
                                   tokens.accent,
                  transition:      'width 0.6s var(--fw-ease-smooth)',
                }} />
              </div>
              <span style={{
                fontFamily:    "'Space Grotesk', monospace",
                fontSize:      '9px',
                fontWeight:    600,
                color:         tokens.textGhost,
                letterSpacing: '0.04em',
              }}>
                {momentumScore}%
              </span>
            </div>
          )}
        </div>

        {/* CTA — only when there's an action to take */}
        {hasAction && (
          <button
            onClick={() => {
              if (topItem?.sectionId) onOpenSection?.(topItem.sectionId);
              else onStartSession?.();
            }}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             '5px',
              padding:         '7px 12px',
              borderRadius:    '9px',
              border:          `1px solid ${borderColor}`,
              backgroundColor: overallStatus === 'critical' ? '#ef444415' :
                               overallStatus === 'warning'  ? '#f59e0b12' :
                               `${tokens.accent}12`,
              color:           overallStatus === 'critical' ? '#f87171' :
                               overallStatus === 'warning'  ? '#fbbf24' :
                               tokens.accent,
              cursor:          'pointer',
              fontSize:        '11px',
              fontWeight:      700,
              whiteSpace:      'nowrap',
              transition:      'all 0.15s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(1px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              (e.currentTarget as HTMLButtonElement).style.transform = 'none';
            }}
          >
            {topItem?.sectionId ? 'Open workspace' : 'Start session'}
            <ArrowRight style={{ width: '11px', height: '11px' }} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Dismiss × */}
      <button
        onClick={dismissBanner}
        title="Dismiss for today"
        style={{
          position:        'absolute',
          top:             '8px',
          right:           '10px',
          width:           '22px',
          height:          '22px',
          borderRadius:    '6px',
          border:          'none',
          backgroundColor: 'transparent',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          color:           tokens.textGhost,
          transition:      'all 0.12s ease',
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
        <X style={{ width: '11px', height: '11px' }} />
      </button>
    </div>
  );
}
