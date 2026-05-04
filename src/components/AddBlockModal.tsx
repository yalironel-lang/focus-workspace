import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { BlockColor, SectionWithProgress } from '../types';
import toast from 'react-hot-toast';

interface Props {
  sections: SectionWithProgress[];
  onClose: () => void;
  onAdd: (block: {
    section_id: string | null;
    title: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    location: string | null;
    link: string | null;
    color: BlockColor;
  }) => Promise<void>;
}

const DAYS = [
  { value: 1, label: 'Monday'    },
  { value: 2, label: 'Tuesday'   },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday'  },
  { value: 5, label: 'Friday'    },
  { value: 6, label: 'Saturday'  },
  { value: 0, label: 'Sunday'    },
];

const COLORS: { value: BlockColor; bg: string }[] = [
  { value: 'indigo',  bg: 'bg-indigo-500'  },
  { value: 'violet',  bg: 'bg-violet-500'  },
  { value: 'emerald', bg: 'bg-emerald-500' },
  { value: 'amber',   bg: 'bg-amber-500'   },
  { value: 'sky',     bg: 'bg-sky-500'     },
  { value: 'rose',    bg: 'bg-rose-500'    },
  { value: 'slate',   bg: 'bg-slate-500'   },
];

export function AddBlockModal({ sections, onClose, onAdd }: Props) {
  const today = new Date().getDay(); // 0=Sun...6=Sat
  const [title,     setTitle]     = useState('');
  const [day,       setDay]       = useState(today === 0 ? 1 : today); // default to Mon if Sun
  const [startTime, setStartTime] = useState('09:00');
  const [endTime,   setEndTime]   = useState('10:00');
  const [location,  setLocation]  = useState('');
  const [link,      setLink]      = useState('');
  const [color,     setColor]     = useState<BlockColor>('indigo');
  const [sectionId, setSectionId] = useState('');
  const [loading,   setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;
    if (startTime >= endTime) { toast.error('End time must be after start time'); return; }
    setLoading(true);
    try {
      await onAdd({
        section_id: sectionId || null,
        title: title.trim(),
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        location: location.trim() || null,
        link: link.trim() || null,
        color,
      });
      toast.success('Class added to schedule');
      onClose();
    } catch {
      toast.error('Failed to add class');
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
          <h3 className="font-semibold text-slate-900">Add class to schedule</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="label-xs">Class name</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Calculus 101" className="input" autoFocus required />
          </div>

          {/* Day */}
          <div>
            <label className="label-xs">Day</label>
            <select value={day} onChange={e => setDay(Number(e.target.value))} className="input">
              {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Start time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label-xs">End time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input" required />
            </div>
          </div>

          {/* Location + Link */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Location <span className="text-slate-400 font-normal normal-case">(opt.)</span></label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Room 204" className="input" />
            </div>
            <div>
              <label className="label-xs">Link <span className="text-slate-400 font-normal normal-case">(opt.)</span></label>
              <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" className="input" />
            </div>
          </div>

          {/* Course */}
          <div>
            <label className="label-xs">Course <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
            <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input">
              <option value="">— none —</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="label-xs">Color</label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full ${c.bg} transition-all ${color === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100'}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-semibold text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add to schedule'}
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
