import { useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

type Props = {
  onAdd: (title: string) => Promise<void>;
};

/** Light-theme task capture for Section setup. */
export function MissionControlWorkCapture({ onAdd }: Props) {
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    setAdding(true);
    try {
      await onAdd(t);
      setValue('');
    } catch {
      toast.error('Failed to add');
    } finally {
      setAdding(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <span style={{ color: 'var(--mc-text-muted)', display: 'flex' }}>
        {adding ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Capture a task…"
        style={{
          flex: 1,
          minHeight: 40,
          fontSize: 13,
          border: '1px solid var(--mc-border)',
          borderRadius: 8,
          padding: '8px 10px',
          outline: 'none',
          background: '#fff',
          color: 'var(--mc-text)',
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setValue('');
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      {value.trim() && (
        <button
          type="submit"
          disabled={adding}
          style={{
            minHeight: 40,
            padding: '0 12px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--mc-accent)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 650,
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      )}
    </form>
  );
}
