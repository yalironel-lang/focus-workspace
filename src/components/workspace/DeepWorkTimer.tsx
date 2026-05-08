import { useState, useEffect, useCallback } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface Props {
  tokens: AtmosphereTokens;
}

type Phase = 'focus' | 'break';

const PRESETS: { label: string; focus: number; brk: number }[] = [
  { label: '25/5',  focus: 25, brk: 5  },
  { label: '50/10', focus: 50, brk: 10 },
  { label: '90/20', focus: 90, brk: 20 },
];

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '10px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function DeepWorkTimer({ tokens }: Props) {
  const [preset,     setPreset]     = useState(0);
  const [phase,      setPhase]      = useState<Phase>('focus');
  const [running,    setRunning]    = useState(false);
  const [secsLeft,   setSecsLeft]   = useState(PRESETS[0].focus * 60);
  const [sessionNum, setSessionNum] = useState(1);

  const currentPreset = PRESETS[preset];
  const totalSecs = phase === 'focus' ? currentPreset.focus * 60 : currentPreset.brk * 60;
  const pct = ((totalSecs - secsLeft) / totalSecs) * 100;

  const mins = Math.floor(secsLeft / 60).toString().padStart(2, '0');
  const secs = (secsLeft % 60).toString().padStart(2, '0');

  const reset = useCallback(() => {
    setRunning(false);
    setSecsLeft(currentPreset.focus * 60);
    setPhase('focus');
  }, [currentPreset.focus]);

  useEffect(() => { reset(); }, [preset, reset]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecsLeft(prev => {
        if (prev <= 1) {
          // Auto-switch phase
          setPhase(p => {
            const next: Phase = p === 'focus' ? 'break' : 'focus';
            if (next === 'focus') setSessionNum(n => n + 1);
            setSecsLeft(next === 'focus' ? currentPreset.focus * 60 : currentPreset.brk * 60);
            return next;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, currentPreset]);

  // SVG ring
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const ringColor = phase === 'focus' ? tokens.accent : tokens.textMuted;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ backgroundColor: tokens.cardBg, border: `1px solid ${tokens.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span style={{ ...META, color: tokens.textGhost }}>Deep Work</span>
        <div className="flex gap-1">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => { if (!running) setPreset(i); }}
              className="transition-all"
              style={{
                ...META,
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '20px',
                color: preset === i ? tokens.accent : tokens.textGhost,
                backgroundColor: preset === i ? tokens.accentSubtle : 'transparent',
                border: `1px solid ${preset === i ? tokens.accent + '40' : 'transparent'}`,
                cursor: running ? 'default' : 'pointer',
                opacity: running && preset !== i ? 0.4 : 1,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ring + time */}
      <div className="flex items-center justify-center py-2">
        <div className="relative" style={{ width: 132, height: 132 }}>
          <svg width={132} height={132} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={66} cy={66} r={radius} fill="none" stroke={tokens.cardBorder} strokeWidth={6} />
            <circle
              cx={66} cy={66} r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke-dashoffset 0.9s ease, stroke 0.4s ease',
                filter: running ? `drop-shadow(0 0 6px ${tokens.accentGlow})` : 'none',
              }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '26px',
                fontWeight: 700,
                color: tokens.textPrimary,
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {mins}:{secs}
            </span>
            <span style={{ ...META, color: phase === 'focus' ? tokens.accent : tokens.textMuted, fontSize: '9px' }}>
              {phase === 'focus' ? 'FOCUS' : 'BREAK'}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <span style={{ ...META, color: tokens.textGhost }}>
          Session {sessionNum}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="p-2 rounded-xl transition-all"
            style={{ color: tokens.textGhost }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setRunning(r => !r)}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-all"
            style={{ backgroundColor: tokens.accent, color: '#000' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
            }}
          >
            {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Pause' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
