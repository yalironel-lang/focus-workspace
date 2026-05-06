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

const inp = 'w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#080c14] border border-[#1e2a3a] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/40 transition-all';
const lbl = 'block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5';

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
      toast.success('Deadline added');
      onClose();
    } catch {
      toast.error('Failed to add deadline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0f1520] border border-[#1e2a3a] rounded-2xl w-full max-w-md overflow-hidden animate-slide-up">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2a3a]">
          <h3 className="font-semibold text-slate-100 text-sm">Add deadline</h3>
          <button onClick={onClose} className="p-1.5 text-slate-600 hover:text-slate-300 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          <div>
            <label className={lbl}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Problem Set 3" className={inp} autoFocus required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Type</label>
              <select value={type} onChange={e => setType(e.target.value as DeadlineType)} className={inp}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} required />
            </div>
          </div>

          <div>
            <label className={lbl}>Workspace <span className="normal-case font-normal text-slate-600">(optional)</span></label>
            <select value={sectionId} onChange={e => setSectionId(e.target.value)} className={inp}>
              <option value="">— none —</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          <div>
            <label className={lbl}>Notes <span className="normal-case font-normal text-slate-600">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any extra context…" rows={2} className={`${inp} resize-none`} />
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading || !title.trim() || !dueDate}
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition-all disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add deadline'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-[#1e2a3a] text-slate-500 hover:text-slate-300 rounded-xl text-sm transition-colors">
              Cancel
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
