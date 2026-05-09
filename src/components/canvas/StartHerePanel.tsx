/**
 * StartHerePanel — the primary daily guidance panel.
 *
 * Answers the three questions every new session should start with:
 *   1. What's on your mind?  (Capture)
 *   2. What's your #1 priority?  (Choose)
 *   3. Ready to work?  (Focus)
 *
 * This replaces the DailyEntryBanner as the dominant top-of-page element.
 * It is collapsible (state persisted) so returning users can minimize it
 * once they've internalized the workflow.
 *
 * Psychology: task-based, not feature-based. Every affordance here maps to
 * a user outcome, not a product capability.
 */

import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Zap, HelpCircle, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { WorkspaceIntelligence } from '../../utils/workspaceIntelligence';
import type { ContinuityRecord } from '../../hooks/useSessionContinuity';

const COLLAPSED_KEY = 'fw_start_here_collapsed_v1';

interface Props {
  tokens:              AtmosphereTokens;
  intel:               WorkspaceIntelligence;
  greeting:            string;
  lastSession:         ContinuityRecord | null;
  onCapture:           (text: string) => void;
  onStartSession:      () => void;
  onOpenSection?:      (id: string) => void;
  onDismissContinuity?: () => void;
}

// ── Step number bubble ────────────────────────────────────────────────────────

function StepNum({ n, color }: { n: number; color: string }) {
  return (
    <span style={{
      width:           '18px',
      height:          '18px',
      borderRadius:    '50%',
      backgroundColor: `${color}22`,
      border:          `1px solid ${color}40`,
      display:         'inline-flex',
      alignItems:      'center',
      justifyContent:  'center',
      fontSize:        '9px',
      fontWeight:      700,
      color,
      flexShrink:      0,
    }}>
      {n}
    </span>
  );
}

// ── What is this? tooltip ─────────────────────────────────────────────────────

function HelpTooltip({ tokens, onDismiss }: { tokens: AtmosphereTokens; onDismiss: () => void }) {
  return (
    <div
      style={{
        position:        'absolute',
        top:             '100%',
        right:           0,
        marginTop:       '8px',
        zIndex:          60,
        width:           '260px',
        backgroundColor: tokens.cardBg,
        border:          `1px solid ${tokens.cardBorderHover}`,
        borderRadius:    `${Math.min(tokens.radius, 14)}px`,
        boxShadow:       tokens.shadowLg,
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflow:        'hidden',
      }}
    >
      <div style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'space-between',
        padding:         '10px 12px 8px',
        borderBottom:    `1px solid ${tokens.divider}`,
      }}>
        <span style={{
          fontSize:      '11px',
          fontWeight:    700,
          color:         tokens.textPrimary,
          fontFamily:    "'Space Grotesk', sans-serif",
        }}>
          What is Focus Workspace?
        </span>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: tokens.textGhost, display: 'flex', padding: '2px',
          }}
        >
          <X style={{ width: '11px', height: '11px' }} />
        </button>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        {([
          ['Capture', 'Write down everything on your mind.'],
          ['Choose',  'Pick the one thing that matters most today.'],
          ['Focus',   'Start a timed session and build momentum.'],
        ] as const).map(([title, body], i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: i < 2 ? '8px' : 0 }}>
            <span style={{
              width:     '16px',
              height:    '16px',
              borderRadius: '50%',
              backgroundColor: `${tokens.accent}20`,
              display:   'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize:  '8px',
              fontWeight: 700,
              color:     tokens.accent,
              flexShrink: 0,
              marginTop: '1px',
            }}>
              {i + 1}
            </span>
            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                {title}
              </p>
              <p style={{ fontSize: '10px', color: tokens.textSecondary, margin: '1px 0 0', lineHeight: 1.4 }}>
                {body}
              </p>
            </div>
          </div>
        ))}
        <p style={{
          fontSize: '10px', color: tokens.textMuted, margin: '10px 0 0',
          paddingTop: '8px', borderTop: `1px solid ${tokens.divider}`, lineHeight: 1.4,
        }}>
          It remembers what you're working on and shows you what to do next.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StartHerePanel({
  tokens, intel, greeting, lastSession,
  onCapture, onStartSession, onOpenSection, onDismissContinuity,
}: Props) {
  const [collapsed,    setCollapsed]    = useState<boolean>(() => {
    try { return !!localStorage.getItem(COLLAPSED_KEY); } catch { return false; }
  });
  const [helpOpen,     setHelpOpen]     = useState(false);
  const [captureText,  setCaptureText]  = useState('');

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      if (next) localStorage.setItem(COLLAPSED_KEY, '1');
      else      localStorage.removeItem(COLLAPSED_KEY);
    } catch { /* quota */ }
  };

  const handleCapture = () => {
    if (!captureText.trim()) return;
    onCapture(captureText.trim());
    setCaptureText('');
  };

  const {
    topItem, suggestedSection, statusNarrative,
    momentumScore, overallStatus,
  } = intel;

  const statusColor =
    overallStatus === 'critical' ? '#f87171' :
    overallStatus === 'warning'  ? '#fbbf24' :
    overallStatus === 'ahead'    ? '#34d399' :
    tokens.accent;

  const hasPriority = !!(topItem || suggestedSection);
  const prioritySectionId = topItem?.sectionId ?? suggestedSection?.id ?? null;

  return (
    <div
      style={{
        gridColumn:      'span 12',
        borderRadius:    `${tokens.radius}px`,
        backgroundColor: tokens.cardBg,
        border:          `1px solid ${tokens.cardBorder}`,
        overflow:        'visible',
        animation:       'slideUp 0.4s var(--fw-ease-smooth) both',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          padding:         '10px 16px',
          borderBottom:    collapsed ? 'none' : `1px solid ${tokens.divider}`,
          cursor:          'pointer',
          borderRadius:    collapsed ? `${tokens.radius}px` : undefined,
        }}
        onClick={toggleCollapsed}
      >
        {/* Left: label + greeting + status chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      '9px',
            fontWeight:    700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color:         tokens.textGhost,
            userSelect:    'none',
          }}>
            Start here
          </span>

          <span style={{
            fontFamily:    "'Plus Jakarta Sans', sans-serif",
            fontSize:      '13px',
            fontWeight:    700,
            color:         tokens.textPrimary,
            letterSpacing: '-0.01em',
          }}>
            {greeting}
          </span>

          {momentumScore > 0 && (
            <span style={{
              display:         'inline-flex',
              alignItems:      'center',
              padding:         '2px 7px',
              borderRadius:    '20px',
              backgroundColor: `${statusColor}14`,
              border:          `1px solid ${statusColor}28`,
              fontSize:        '10px',
              fontWeight:      600,
              color:           statusColor,
            }}>
              {momentumScore}% momentum
            </span>
          )}
        </div>

        {/* Right: help + collapse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
          {/* Help button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setHelpOpen(o => !o); }}
              title="What is Focus Workspace?"
              style={{
                width:           '26px',
                height:          '26px',
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
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
              }}
            >
              <HelpCircle style={{ width: '13px', height: '13px' }} />
            </button>
            {helpOpen && (
              <>
                <div
                  className="fixed inset-0 z-50"
                  onClick={e => { e.stopPropagation(); setHelpOpen(false); }}
                />
                <HelpTooltip tokens={tokens} onDismiss={() => setHelpOpen(false)} />
              </>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={e => { e.stopPropagation(); toggleCollapsed(); }}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             '3px',
              padding:         '4px 8px',
              borderRadius:    '6px',
              border:          'none',
              backgroundColor: 'transparent',
              cursor:          'pointer',
              fontSize:        '10px',
              fontWeight:      500,
              color:           tokens.textGhost,
              transition:      'all 0.12s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
            }}
          >
            {collapsed ? 'Expand' : 'Collapse'}
            {collapsed
              ? <ChevronDown style={{ width: '11px', height: '11px' }} />
              : <ChevronUp   style={{ width: '11px', height: '11px' }} />
            }
          </button>
        </div>
      </div>

      {/* ── Body: 3 steps ──────────────────────────────────────────── */}
      {!collapsed && (
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
          }}
        >
          {/* ── Step 1: Capture ──────────────────────────────────── */}
          <div style={{ padding: '14px 16px', borderRight: `1px solid ${tokens.divider}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <StepNum n={1} color={tokens.accent} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: tokens.textSecondary }}>
                What's on your mind?
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={captureText}
                onChange={e => setCaptureText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCapture(); }}
                placeholder="Type a thought, task, or worry…"
                onClick={e => e.stopPropagation()}
                style={{
                  flex:            1,
                  padding:         '8px 10px',
                  borderRadius:    '8px',
                  border:          `1px solid ${tokens.cardBorder}`,
                  backgroundColor: tokens.wellBg,
                  color:           tokens.textPrimary,
                  fontSize:        '12px',
                  outline:         'none',
                  transition:      'border-color 0.15s ease',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = tokens.focusBorder)}
                onBlur={e  => (e.currentTarget.style.borderColor = tokens.cardBorder)}
              />
              <button
                onClick={e => { e.stopPropagation(); handleCapture(); }}
                disabled={!captureText.trim()}
                style={{
                  padding:         '8px 12px',
                  borderRadius:    '8px',
                  border:          'none',
                  backgroundColor: captureText.trim() ? tokens.accent : `${tokens.accent}28`,
                  color:           captureText.trim() ? '#000' : tokens.textGhost,
                  fontSize:        '11px',
                  fontWeight:      700,
                  cursor:          captureText.trim() ? 'pointer' : 'default',
                  whiteSpace:      'nowrap',
                  transition:      'all 0.15s ease',
                  flexShrink:      0,
                }}
              >
                Capture
              </button>
            </div>

            <p style={{
              fontSize: '10px',
              color:    tokens.textMuted,
              margin:   '7px 0 0',
              lineHeight: 1.4,
            }}>
              Get it out of your head first. You can organize it later.
            </p>
          </div>

          {/* ── Step 2: Choose priority ───────────────────────────── */}
          <div style={{ padding: '14px 16px', borderRight: `1px solid ${tokens.divider}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <StepNum n={2} color={hasPriority ? statusColor : tokens.accent} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: tokens.textSecondary }}>
                Your one priority
              </span>
            </div>

            {hasPriority ? (
              <div style={{
                padding:         '10px 12px',
                borderRadius:    '8px',
                backgroundColor: `${statusColor}10`,
                border:          `1px solid ${statusColor}28`,
              }}>
                <p style={{
                  fontSize:   '12px',
                  fontWeight: 500,
                  color:      statusColor,
                  margin:     0,
                  lineHeight: 1.45,
                }}>
                  {statusNarrative}
                </p>
                {prioritySectionId && onOpenSection && (
                  <button
                    onClick={e => { e.stopPropagation(); onOpenSection(prioritySectionId); }}
                    style={{
                      display:         'inline-flex',
                      alignItems:      'center',
                      gap:             '3px',
                      marginTop:       '8px',
                      padding:         '4px 8px',
                      borderRadius:    '6px',
                      border:          `1px solid ${statusColor}30`,
                      backgroundColor: `${statusColor}14`,
                      color:           statusColor,
                      fontSize:        '10px',
                      fontWeight:      700,
                      cursor:          'pointer',
                    }}
                  >
                    Open workspace <ArrowRight style={{ width: '9px', height: '9px' }} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{
                padding:         '10px 12px',
                borderRadius:    '8px',
                backgroundColor: `${tokens.accent}08`,
                border:          `1px solid ${tokens.cardBorder}`,
              }}>
                <p style={{ fontSize: '12px', color: tokens.textMuted, margin: 0, lineHeight: 1.4 }}>
                  Add workspaces and deadlines to see your top priority here.
                </p>
              </div>
            )}

            {/* Continue where you left off */}
            {lastSession && (
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '5px',
                marginTop:  '7px',
              }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (lastSession.sectionId && onOpenSection) onOpenSection(lastSession.sectionId);
                  }}
                  style={{
                    fontSize:        '10px',
                    fontWeight:      600,
                    color:           tokens.accent,
                    opacity:         0.8,
                    background:      'none',
                    border:          'none',
                    cursor:          'pointer',
                    padding:         0,
                    display:         'flex',
                    alignItems:      'center',
                    gap:             '3px',
                  }}
                >
                  ↩ Continue: {lastSession.sectionTitle}
                </button>
                {onDismissContinuity && (
                  <button
                    onClick={e => { e.stopPropagation(); onDismissContinuity(); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, fontSize: '11px', color: tokens.textGhost,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Step 3: Focus ─────────────────────────────────────── */}
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <StepNum n={3} color={tokens.accent} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: tokens.textSecondary }}>
                Ready to work?
              </span>
            </div>

            <button
              onClick={e => { e.stopPropagation(); onStartSession(); }}
              style={{
                width:           '100%',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             '7px',
                padding:         '10px 14px',
                borderRadius:    '9px',
                border:          'none',
                backgroundColor: tokens.accent,
                color:           '#000',
                fontSize:        '12px',
                fontWeight:      700,
                cursor:          'pointer',
                transition:      'all 0.15s ease',
                fontFamily:      "'Space Grotesk', sans-serif",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${tokens.accentGlow}`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
                (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              <Zap style={{ width: '13px', height: '13px' }} strokeWidth={2.5} />
              Start a focus session
            </button>

            <p style={{
              fontSize:   '10px',
              color:      tokens.textMuted,
              margin:     '8px 0 0',
              textAlign:  'center',
              lineHeight: 1.4,
            }}>
              Choose a workspace, set a timer,<br />and work without distraction.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
