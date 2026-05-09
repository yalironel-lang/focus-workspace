import { useNavigate } from 'react-router-dom';
import { SectionWithProgress, Deadline } from '../../types';
import { ArrowRight, Target } from 'lucide-react';

function daysUntil(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(date + 'T12:00:00').getTime() - today.getTime()) / 86_400_000);
}

interface QueueItem extends SectionWithProgress {
  urgencyScore: number;
  nearestDueDate: string | null;
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

export function FocusQueue({ sections, deadlines }: Props) {
  const navigate = useNavigate();

  const queue: QueueItem[] = sections
    .filter(s => s.total_items - s.completed_items > 0)
    .map(s => {
      const sectionDeadlines = deadlines.filter(d => d.section_id === s.id && !d.completed);
      const nearest = sectionDeadlines.sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      const examScore = s.exam_date ? daysUntil(s.exam_date) : null;
      const dueScore  = nearest ? daysUntil(nearest.due_date) : null;
      const urgencyScore =
        dueScore !== null  ? dueScore
        : examScore !== null ? examScore
        : 999;
      return { ...s, urgencyScore, nearestDueDate: nearest?.due_date ?? null };
    })
    .sort((a, b) => a.urgencyScore - b.urgencyScore)
    .slice(0, 4);

  if (queue.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-5 py-3.5"
        style={{ borderBottom: '1px solid #1a2638' }}
      >
        <Target className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
        <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          What's next
        </span>
      </div>

      {/* Items */}
      {queue.map((item, i) => {
        const isOverdue = item.urgencyScore < 0;
        const isUrgent  = !isOverdue && item.urgencyScore <= 2;
        const isSoon    = !isUrgent  && item.urgencyScore <= 7;

        const barColor =
          isOverdue ? '#ef4444'
          : isUrgent ? '#f87171'
          : isSoon   ? '#f59e0b'
          : '#2a3a50';

        const dueBadgeStyle: React.CSSProperties | null =
          item.nearestDueDate == null ? null
          : isOverdue || isUrgent
            ? { backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }
            : isSoon
              ? { backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }
              : null;

        const dueLabel = item.nearestDueDate
          ? (() => {
              const d = item.urgencyScore;
              if (d < 0)  return `${Math.abs(d)}d overdue`;
              if (d === 0) return 'Today';
              if (d === 1) return 'Tomorrow';
              return `${d}d`;
            })()
          : null;

        return (
          <button
            key={item.id}
            onClick={() => navigate(`/section/${item.id}`)}
            className="w-full flex items-center gap-3.5 px-5 py-3.5 transition-colors group text-left"
            style={{
              borderBottom: i < queue.length - 1 ? '1px solid #0f1826' : undefined,
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#111d2e')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
          >
            {/* Left accent bar */}
            <div
              className="w-0.5 rounded-full flex-shrink-0"
              style={{ height: '36px', backgroundColor: barColor }}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug truncate" style={{ color: '#f1f5f9' }}>
                {item.title}
              </p>
              {item.next_item_title && (
                <p className="text-xs truncate mt-0.5" style={{ color: '#475569' }}>
                  {item.next_item_title}
                </p>
              )}
            </div>

            {/* Right: due badge + arrow */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {dueBadgeStyle && dueLabel && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={dueBadgeStyle}
                >
                  {dueLabel}
                </span>
              )}
              <span style={{ ...META, color: '#1e2d40', fontSize: '9px' }}>
                {item.total_items - item.completed_items} left
              </span>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                style={{ color: '#2a3a50' }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
