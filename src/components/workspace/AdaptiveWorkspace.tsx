import { ReactNode } from 'react';

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** A single bento cell */
export function BentoCard({ children, className = '', style }: BentoCardProps) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

interface PhaseStep {
  key: string;
  label: string;
}

const PHASES: PhaseStep[] = [
  { key: 'capture',  label: 'Capture'  },
  { key: 'clarify',  label: 'Clarify'  },
  { key: 'focus',    label: 'Focus'    },
  { key: 'execute',  label: 'In motion' },
  { key: 'recover',  label: 'Recover'  },
];

interface PhaseIndicatorProps {
  /** Which phase is currently most relevant */
  activePhase: string;
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '10px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

/** Horizontal pill-strip showing the 5 daily phases */
export function PhaseIndicator({ activePhase }: PhaseIndicatorProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PHASES.map((phase, idx) => {
        const isActive = phase.key === activePhase;
        const isPast   = PHASES.findIndex(p => p.key === activePhase) > idx;
        return (
          <div key={phase.key} className="flex items-center gap-1">
            <span
              style={{
                ...META,
                color:           isActive ? '#f59e0b' : isPast ? '#34d399' : '#1e2d40',
                backgroundColor: isActive ? 'rgba(245,158,11,0.1)' : isPast ? 'rgba(52,211,153,0.08)' : 'transparent',
                border:          isActive ? '1px solid rgba(245,158,11,0.25)' : isPast ? '1px solid rgba(52,211,153,0.15)' : '1px solid transparent',
                borderRadius:    '20px',
                padding:         '2px 8px',
                transition:      'all 0.2s ease',
              }}
            >
              {isActive ? '▸ ' : isPast ? '✓ ' : ''}{phase.label}
            </span>
            {idx < PHASES.length - 1 && (
              <span style={{ color: '#1a2638', fontSize: '8px' }}>—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Infer which phase is most relevant from app state */
export function inferPhase(opts: {
  hasSession: boolean;
  hasWork: boolean;
  hasCaptured: boolean;
}): string {
  if (opts.hasSession) return 'execute';
  if (opts.hasWork)    return 'focus';
  if (opts.hasCaptured) return 'clarify';
  return 'capture';
}
