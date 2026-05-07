import { SectionWithProgress } from '../../types';

interface Props {
  sections: SectionWithProgress[];
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function MomentumMeter({ sections }: Props) {
  const total     = sections.reduce((a, s) => a + s.total_items, 0);
  const completed = sections.reduce((a, s) => a + s.completed_items, 0);
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

  const radius       = 62;
  const circumference = 2 * Math.PI * radius;
  const offset        = circumference - (pct / 100) * circumference;

  const color =
    pct >= 70 ? '#34d399'
    : pct >= 40 ? '#f59e0b'
    : '#f87171';

  const trend =
    pct >= 70 ? '↑ Strong'
    : pct >= 40 ? '→ Building'
    : total === 0 ? '— No data'
    : '↓ Get going';

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
    >
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span style={{ ...META, color: '#334155' }}>Momentum</span>
        <span style={{ ...META, color, fontSize: '10px' }}>{trend}</span>
      </div>

      {/* SVG Ring */}
      <div className="flex items-center justify-center py-1">
        <div className="relative" style={{ width: 152, height: 152 }}>
          <svg
            width={152}
            height={152}
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Track */}
            <circle
              cx={76} cy={76} r={radius}
              fill="none"
              stroke="#1a2638"
              strokeWidth={9}
            />
            {/* Progress arc */}
            <circle
              cx={76} cy={76} r={radius}
              fill="none"
              stroke={color}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke-dashoffset 0.9s ease, stroke 0.4s ease',
                filter: `drop-shadow(0 0 8px ${color}66)`,
              }}
            />
          </svg>

          {/* Center value */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ pointerEvents: 'none' }}
          >
            <span
              style={{
                fontSize: '36px',
                fontWeight: 700,
                color: '#f1f5f9',
                lineHeight: 1,
              }}
            >
              {pct}
            </span>
            <span style={{ ...META, color: '#334155', marginTop: '3px' }}>
              % done
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div
        className="flex justify-between pt-3"
        style={{ borderTop: '1px solid #111d2e' }}
      >
        {[
          { label: 'Done',   value: completed },
          { label: 'Left',   value: total - completed },
          { label: 'Spaces', value: sections.length },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <p style={{ ...META, color: '#334155' }}>{label}</p>
            <p style={{ fontSize: '17px', fontWeight: 700, color: '#f1f5f9', marginTop: '2px' }}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
