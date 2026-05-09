import { SectionWithProgress } from '../../types';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';

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

/** Quick Wins: sections with high completion (≥60%) that still have items remaining */
export function ExecutePanel({ sections }: Props) {
  const navigate = useNavigate();

  const quickWins = sections
    .filter(s => s.total_items > 0 && s.progress >= 60 && s.progress < 100)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  const inProgress = sections
    .filter(s => s.total_items > 0 && s.progress > 0 && s.progress < 60)
    .sort((a, b) => b.completed_items - a.completed_items)
    .slice(0, 2);

  if (quickWins.length === 0 && inProgress.length === 0) return null;

  const renderItem = (s: SectionWithProgress, type: 'win' | 'progress') => (
    <button
      key={s.id}
      onClick={() => navigate(`/section/${s.id}`)}
      className="w-full flex items-center gap-3 py-2.5 group transition-colors text-left"
      style={{ borderBottom: '1px solid #0f1826' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#111d2e')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
    >
      {/* Progress ring indicator */}
      <div className="relative w-7 h-7 flex-shrink-0">
        <svg width={28} height={28} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={14} cy={14} r={10} fill="none" stroke="#1a2638" strokeWidth={2.5} />
          <circle
            cx={14} cy={14} r={10}
            fill="none"
            stroke={type === 'win' ? '#34d399' : '#f59e0b'}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 10}
            strokeDashoffset={2 * Math.PI * 10 * (1 - s.progress / 100)}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={{ fontSize: '8px', fontWeight: 700, color: type === 'win' ? '#34d399' : '#fbbf24' }}
        >
          {s.progress}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-snug" style={{ color: '#c7d2e0' }}>
          {s.title}
        </p>
      </div>
      <span style={{ ...META, color: '#334155', fontSize: '9px' }}>
        {s.total_items - s.completed_items} left
      </span>
      <ArrowRight
        className="w-3 h-3 transition-transform group-hover:translate-x-0.5 flex-shrink-0"
        style={{ color: '#2a3a50' }}
      />
    </button>
  );

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid #1a2638' }}
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>In motion</span>
        </div>
      </div>

      <div className="px-5">
        {quickWins.length > 0 && (
          <>
            <div className="pt-3 pb-1">
              <span style={{ ...META, color: '#334155' }}>Almost there</span>
            </div>
            {quickWins.map(s => renderItem(s, 'win'))}
          </>
        )}
        {inProgress.length > 0 && (
          <>
            <div className="pt-3 pb-1">
              <span style={{ ...META, color: '#334155' }}>In progress</span>
            </div>
            {inProgress.map(s => renderItem(s, 'progress'))}
          </>
        )}
      </div>
    </div>
  );
}
