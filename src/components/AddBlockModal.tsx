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

const COLOR_HEX: Record<BlockColor, string> = {
  indigo:  '#6366f1',
  violet:  '#8b5cf6',
  emerald: '#10b981',
  amber:   '#f59e0b',
  sky:     '#38bdf8',
  rose:    '#f43f5e',
  slate:   '#64748b',
};

export function AddBlockModal({ sections, onClose, onAdd }: Props) {
  const today = new Date().getDay();
  const [title,     setTitle]     = useState('');
  const [day,       setDay]       = useState(today === 0 ? 1 : today);
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
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-slide-up"
        style={{ backgroundColor: '#0d1424', border: '1px solid #1a2638' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #1a2638' }}
        >
          <h3 className="font-semibold text-sm" style={{ color: '#f1f5f9' }}>
            Add class to schedule
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#334155' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          <div>
            <label className="label-xs">Class name</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Calculus 101"
              className="input"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="label-xs">Day</label>
            <select value={day} onChange={e => setDay(Number(e.target.value))} className="input">
              {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">
                Location <span className="normal-case font-normal" style={{ color: '#475569' }}>(opt.)</span>
              </label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Room 204" className="input" />
            </div>
            <div>
              <label className="label-xs">
                Link <span className="normal-case font-normal" style={{ color: '#475569' }}>(opt.)</span>
              </label>
              <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" className="input" />
            </div>
          </div>

          <div>
            <label className="label-xs">
              Course <span className="normal-case font-normal" style={{ color: '#475569' }}>(optional)</span>
            </label>
            <select value={sectionId} onChange={e => setSectionId(e.target.value)} className="input">
              <option value="">— none —</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          <div>
            <label className="label-xs">Color</label>
            <div className="flex items-center gap-2 mt-1.5">
              {(Object.entries(COLOR_HEX) as [BlockColor, string][]).map(([val, hex]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setColor(val)}
                  className="w-6 h-6 rounded-full transition-all"
                  style={{
                    backgroundColor: hex,
                    transform: color === val ? 'scale(1.2)' : 'scale(1)',
                    outline: color === val ? `2px solid ${hex}` : 'none',
                    outlineOffset: '2px',
                    opacity: color === val ? 1 : 0.5,
                  }}
                  onMouseEnter={e => { if (color !== val) e.currentTarget.style.opacity = '0.8'; }}
                  onMouseLeave={e => { if (color !== val) e.currentTarget.style.opacity = '0.5'; }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
              onMouseEnter={e => { if (!loading && title.trim()) e.currentTarget.style.backgroundColor = '#fbbf24'; }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add to schedule'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ border: '1px solid #1a2638', color: '#475569' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3a54'; e.currentTarget.style.color = '#94a3b8'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a2638'; e.currentTarget.style.color = '#475569'; }}
            >
              Cancel
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
