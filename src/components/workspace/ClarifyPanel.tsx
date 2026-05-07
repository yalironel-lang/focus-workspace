import { SectionWithProgress, Deadline } from '../../types';
import { Link } from 'react-router-dom';
import { CheckSquare, ArrowRight } from 'lucide-react';

function daysUntil(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(date + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

interface Props {
  sections: SectionWithProgress[];
  deadlines: Deadline[];
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function ClarifyPanel({ sections, deadlines }: Props) {
  const pendingDeadlines = deadlines
    .filter(d => !d.completed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  const pendingWorkspaces = sections
    .filter(s => s.total_items - s.completed_items > 0)
    .slice(0, 3);

  if (pendingDeadlines.length === 0 && pendingWorkspaces.length === 0) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: '#34d399' }}>✓ All clear</p>
        <p className="text-xs" style={{ color: '#2a3a50' }}>Nothing waiting to be clarified.</p>
      </div>
    );
  }

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
          <CheckSquare className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Clarify</span>
        </div>
        <span style={{ ...META, color: '#334155' }}>
          {pendingDeadlines.length + pendingWorkspaces.length} items
        </span>
      </div>

      {pendingDeadlines.length > 0 && (
        <div>
          <div className="px-5 pt-3 pb-1">
            <span style={{ ...META, color: '#334155' }}>Deadlines</span>
          </div>
          {pendingDeadlines.map(d => {
            const days = daysUntil(d.due_date);
            const urgent = days <= 2;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-5 py-2.5"
                style={{ borderBottom: '1px solid #0f1826' }}
              >
                <div
                  className="w-1 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: urgent ? '#f87171' : days <= 7 ? '#f59e0b' : '#2a3a50' }}
                />
                <span className="text-sm flex-1 truncate" style={{ color: '#c7d2e0' }}>{d.title}</span>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '10px',
                    color: urgent ? '#f87171' : '#475569',
                    letterSpacing: '0.05em',
                  }}
                >
                  {days < 0 ? 'overdue' : days === 0 ? 'today' : `${days}d`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pendingWorkspaces.length > 0 && (
        <div>
          <div className="px-5 pt-3 pb-1">
            <span style={{ ...META, color: '#334155' }}>Workspaces</span>
          </div>
          {pendingWorkspaces.map(s => (
            <Link
              key={s.id}
              to={`/section/${s.id}`}
              className="flex items-center gap-3 px-5 py-2.5 group transition-colors"
              style={{ borderBottom: '1px solid #0f1826' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#111d2e')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
            >
              <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: '#2a3a50' }} />
              <span className="text-sm flex-1 truncate" style={{ color: '#c7d2e0' }}>{s.title}</span>
              <span style={{ ...META, color: '#334155', fontSize: '9px' }}>
                {s.total_items - s.completed_items} left
              </span>
              <ArrowRight
                className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
                style={{ color: '#2a3a50' }}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
