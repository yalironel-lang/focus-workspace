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

/** Recover: shows completed workspaces and overall done stat */
export function RecoverPanel({ sections }: Props) {
  const done  = sections.filter(s => s.total_items > 0 && s.progress === 100);
  const total = sections.reduce((a, s) => a + s.completed_items, 0);

  if (done.length === 0 && total === 0) return null;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
    >
      <div className="flex items-center justify-between">
        <span style={{ ...META, color: '#334155' }}>Recover</span>
        <span style={{ ...META, color: '#34d399' }}>{total} items completed</span>
      </div>

      {done.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span style={{ ...META, color: '#1e2d40' }}>Completed spaces</span>
          {done.slice(0, 3).map(s => (
            <div
              key={s.id}
              className="flex items-center gap-2"
            >
              <span style={{ color: '#34d399', fontSize: '12px' }}>✓</span>
              <span className="text-sm truncate" style={{ color: '#475569' }}>{s.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: '#1e2d40' }}>
          Complete a workspace to see it here.
        </p>
      )}
    </div>
  );
}
