import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { DeadlineType, SectionWithProgress } from '../types';
import toast from 'react-hot-toast';

interface Props {
  sections: SectionWithProgress[];
  defaultSectionId?: string;
  onClose: () => void;
  onAdd: (d: {
    section_id: string | null;
    title: string;
    type: DeadlineType;
    due_date: string;
    notes: string | null;
  }) => Promise<void>;
}

const TYPES: { value: DeadlineType; label: string }[] = [
  { value: 'exam',       label: 'Exam'       },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project',    label: 'Project'    },
  { value: 'quiz',       label: 'Quiz'       },
  { value: 'reading',    label: 'Reading'    },
  { value: 'custom',     label: 'Custom'     },
];

export function AddDeadlineModal({ sections, defaultSectionId, onClose, onAdd }: Props) {
  const [title,     setTitle]     = useState('');
  const [type,      setType]      = useState<DeadlineType>('assignment');
  const [dueDate,   setDueDate]   = useState('');
  const [notes,     setNotes]     = useState('');
  const [sectionId, setSectionId] = useState(defaultSectionId ?? '');
  const [loading,   setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setLoading(true);
    try {
      await onAdd({
        section_id: sectionId || null,
        title: title.trim(),
        type,
        due_date: dueDate,
        notes: notes.trim() || null,
      });
      toast.success('Date added');
      onClose();
    } catch {
      toast.error('Failed to add deadline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Add important date</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="label-xs">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Problem Set 3"
              className="input"
              autoFocus
              required
            />
          </div>

          {/* Type + Due date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Type</label>
              <select value={type} onChange={e => setType(e.target.value as DeadlineType)} className="input">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-xs">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="input"
                required
              />
            </div>
          </div>

          {/* Course */}
          <div>
            <label className="label-xs">Workspace <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
            <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input">
              <option value="">— none —</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="label-xs">Notes <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any extra context…"
              rows={2}
              className="input resize-none"
            />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading || !title.trim() || !dueDate}
              className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add date'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-medium text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
