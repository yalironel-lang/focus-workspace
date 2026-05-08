import { useNavigate } from 'react-router-dom';
import { SectionWithProgress } from '../../types';
import { PlayCircle, Crosshair, RotateCcw } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ContinuityRecord } from '../../hooks/useSessionContinuity';

interface ActiveSession {
  sectionId:    string;
  sectionTitle: string;
  taskIds:      string[];
}

interface Props {
  tokens:           AtmosphereTokens;
  activeSession:    ActiveSession | null;
  suggestedSection: SectionWithProgress | null;
  lastSession?:     ContinuityRecord | null;
  hasSections?:     boolean;
  onStartSession:   () => void;
  onClearContinuity?: () => void;
}

const META = (color: string): React.CSSProperties => ({
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight:    600,
  color,
});

export function FocusMode({
  tokens,
  activeSession,
  suggestedSection,
  lastSession,
  hasSections = false,
  onStartSession,
  onClearContinuity,
}: Props) {
  const navigate = useNavigate();

  const hasSession   = !!activeSession;
  const hasSuggested = !!suggestedSection;

  // Continuity: only show if no live session and there's a recent record
  const showContinuity = !hasSession && !!lastSession;

  const borderColor =
    hasSession      ? tokens.accent
    : showContinuity ? `${tokens.accent}60`
    : hasSuggested  ? tokens.cardBorderHover
    : tokens.cardBorder;

  const borderLeft =
    hasSession      ? `3px solid ${tokens.accent}`
    : showContinuity ? `3px solid ${tokens.accent}80`
    : hasSuggested  ? `3px solid ${tokens.cardBorderHover}`
    : undefined;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        backgroundColor: tokens.cardBg,
        border:          `1px solid ${borderColor}`,
        borderLeft,
        transition:      'border-color 0.3s ease',
      }}
    >
      {/* Phase label */}
      <span style={META(hasSession ? tokens.accent : hasSuggested || showContinuity ? tokens.textMuted : tokens.cardBorderHover)}>
        {hasSession      ? 'Session active'
         : showContinuity ? 'Resume session'
         : hasSuggested  ? 'Ready to focus'
         : 'Focus mode'}
      </span>

      {hasSession ? (
        /* ── Active session ────────────────────────────────────── */
        <>
          <div>
            <p className="text-base font-bold leading-snug" style={{ color: tokens.textPrimary }}>
              {activeSession!.sectionTitle}
            </p>
          </div>
          <button
            onClick={() => navigate('/session')}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all self-start"
            style={{ backgroundColor: tokens.accent, color: '#000' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
          >
            Continue →
          </button>
        </>

      ) : showContinuity ? (
        /* ── Last session continuity ───────────────────────────── */
        <>
          <div>
            <p className="text-base font-bold leading-snug" style={{ color: tokens.textPrimary }}>
              {lastSession!.sectionTitle}
            </p>
            <p className="text-xs mt-1" style={{ color: tokens.textGhost }}>
              Last session — pick up where you left off
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onStartSession}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all self-start"
              style={{ backgroundColor: tokens.accent, color: '#000' }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover)}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
            >
              <PlayCircle className="w-4 h-4" /> Resume
            </button>
            {onClearContinuity && (
              <button
                onClick={onClearContinuity}
                title="Dismiss suggestion"
                style={{
                  width:           '32px',
                  height:          '32px',
                  borderRadius:    '9px',
                  border:          `1px solid ${tokens.cardBorder}`,
                  backgroundColor: 'transparent',
                  cursor:          'pointer',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  color:           tokens.textGhost,
                  transition:      'all 0.12s ease',
                  flexShrink:      0,
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
                <RotateCcw style={{ width: '12px', height: '12px' }} />
              </button>
            )}
          </div>
        </>

      ) : hasSuggested ? (
        /* ── Suggested section ─────────────────────────────────── */
        <>
          <div>
            <p className="text-base font-bold leading-snug" style={{ color: tokens.textPrimary }}>
              {suggestedSection!.title}
            </p>
            {suggestedSection!.next_item_title && (
              <p className="text-sm mt-1 truncate" style={{ color: tokens.textSecondary }}>
                {suggestedSection!.next_item_title}
              </p>
            )}
          </div>
          <button
            onClick={onStartSession}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all self-start"
            style={{ backgroundColor: tokens.accent, color: '#000' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent)}
          >
            <PlayCircle className="w-4 h-4" /> Start session
          </button>
        </>

      ) : (
        /* ── Empty state ───────────────────────────────────────── */
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: tokens.wellBg }}
          >
            <Crosshair className="w-4 h-4" style={{ color: tokens.textMuted }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: tokens.textSecondary }}>
              {hasSections ? 'Choose a workspace to focus on' : 'No focus session yet'}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: tokens.textGhost }}>
              {hasSections
                ? 'Open any workspace below and start a timed session.'
                : 'Add a workspace and tasks — then start a session here.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
