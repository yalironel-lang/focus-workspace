import { useNavigate } from 'react-router-dom';
import { SectionWithProgress } from '../../types';
import { PlayCircle, Crosshair } from 'lucide-react';

interface ActiveSession {
  sectionId: string;
  sectionTitle: string;
  taskIds: string[];
}

interface Props {
  activeSession: ActiveSession | null;
  suggestedSection: SectionWithProgress | null;
  onStartSession: () => void;
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function FocusMode({ activeSession, suggestedSection, onStartSession }: Props) {
  const navigate = useNavigate();

  const hasSession   = !!activeSession;
  const hasSuggested = !!suggestedSection;

  const borderColor =
    hasSession   ? '#f59e0b'
    : hasSuggested ? '#1a2638'
    : undefined;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        backgroundColor: '#0d1424',
        border: `1px solid ${borderColor ?? '#1a2638'}`,
        borderLeft: hasSession ? '3px solid #f59e0b' : hasSuggested ? '3px solid #334155' : undefined,
      }}
    >
      {/* Phase label */}
      <span style={{ ...META, color: hasSession ? '#f59e0b' : '#334155' }}>
        {hasSession ? 'Session active' : hasSuggested ? 'Ready to focus' : 'Focus mode'}
      </span>

      {hasSession ? (
        <>
          <div>
            <p className="text-base font-bold leading-snug" style={{ color: '#f1f5f9' }}>
              {activeSession!.sectionTitle}
            </p>
          </div>
          <button
            onClick={() => navigate('/session')}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all self-start"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fbbf24')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f59e0b')}
          >
            Continue →
          </button>
        </>
      ) : hasSuggested ? (
        <>
          <div>
            <p className="text-base font-bold leading-snug" style={{ color: '#f1f5f9' }}>
              {suggestedSection!.title}
            </p>
            {suggestedSection!.next_item_title && (
              <p className="text-sm mt-1 truncate" style={{ color: '#64748b' }}>
                {suggestedSection!.next_item_title}
              </p>
            )}
          </div>
          <button
            onClick={onStartSession}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all self-start"
            style={{ backgroundColor: '#f59e0b', color: '#000' }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fbbf24')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f59e0b')}
          >
            <PlayCircle className="w-4 h-4" /> Start session
          </button>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#111d2e' }}
          >
            <Crosshair className="w-4 h-4" style={{ color: '#334155' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#334155' }}>Nothing queued</p>
            <p className="text-xs mt-0.5" style={{ color: '#1e2d40' }}>Add tasks to a workspace to begin.</p>
          </div>
        </div>
      )}
    </div>
  );
}
