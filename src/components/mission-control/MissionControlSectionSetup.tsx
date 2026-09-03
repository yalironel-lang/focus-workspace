import { useState, type ReactNode } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';

type Props = {
  examDate: string | null;
  examDateLabel: string | null;
  editingExamDate: boolean;
  onStartEditExamDate: () => void;
  onCommitExamDate: (value: string | null) => void;
  onCancelEditExamDate: () => void;
  workCapture: ReactNode;
  shelfAdd: ReactNode;
  courseHub: ReactNode;
};

/**
 * Recessed secondary access for capabilities that are otherwise MC-only.
 * Collapsed by default — not part of the primary browsing hierarchy.
 */
export function MissionControlSectionSetup({
  examDate,
  examDateLabel,
  editingExamDate,
  onStartEditExamDate,
  onCommitExamDate,
  onCancelEditExamDate,
  workCapture,
  shelfAdd,
  courseHub,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="mc-setup"
      data-testid="mc-section-setup"
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
          }}
          aria-hidden
        />
        Section setup
      </summary>
      <div className="mc-setup-body">
        <div className="mc-setup-panel">
          <p className="mc-setup-label">Exam date</p>
          {editingExamDate ? (
            <input
              type="date"
              defaultValue={examDate ?? ''}
              autoFocus
              style={{
                fontSize: 13,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--mc-border)',
                width: '100%',
                maxWidth: 240,
                boxSizing: 'border-box',
              }}
              onBlur={e => onCommitExamDate(e.target.value || null)}
              onKeyDown={e => {
                if (e.key === 'Escape') onCancelEditExamDate();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={onStartEditExamDate}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                padding: '0 4px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: 'var(--mc-text-secondary)',
                fontSize: 13,
              }}
            >
              <Calendar className="w-3.5 h-3.5" aria-hidden />
              {examDateLabel ?? 'Set exam date'}
            </button>
          )}
        </div>

        <div className="mc-setup-panel">
          <p className="mc-setup-label">Add a task</p>
          {workCapture}
        </div>

        <div className="mc-setup-panel">
          <p className="mc-setup-label">Add to shelf</p>
          {shelfAdd}
        </div>

        <div className="mc-setup-panel">
          <p className="mc-setup-label">Course links</p>
          {courseHub}
        </div>
      </div>
    </details>
  );
}
