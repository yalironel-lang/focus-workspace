import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

type ShelfAddKind = 'note' | 'link' | 'task';

type Props = {
  defaultGroupId: string | null;
  onAddGroup: (title: string) => Promise<string>;
  onAddItem: (
    groupId: string,
    type: ShelfAddKind,
    title: string,
    content?: string,
  ) => Promise<void>;
};

/**
 * Minimal shelf create controls for Section setup (not full Shelf browse).
 */
export function MissionControlShelfAdd({ defaultGroupId, onAddGroup, onAddItem }: Props) {
  const [addingType, setAddingType] = useState<ShelfAddKind | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingType) titleRef.current?.focus();
  }, [addingType]);

  const reset = () => {
    setAddingType(null);
    setTitle('');
    setContent('');
    setUrl('');
    setSaving(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!addingType) return;
    const finalTitle =
      addingType === 'link' ? title.trim() || url.trim() : title.trim();
    const finalContent =
      addingType === 'link' ? url.trim() : content.trim() || undefined;
    if (!finalTitle) return;
    setSaving(true);
    try {
      let gid = defaultGroupId;
      if (!gid) gid = await onAddGroup('Shelf');
      await onAddItem(gid, addingType, finalTitle, finalContent);
      reset();
    } catch {
      toast.error('Failed to add');
      setSaving(false);
    }
  };

  const chips: Array<{ type: ShelfAddKind; label: string }> = [
    { type: 'note', label: 'Note' },
    { type: 'link', label: 'Link' },
    { type: 'task', label: 'Checklist' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chips.map(c => (
          <button
            key={c.type}
            type="button"
            onClick={() => setAddingType(c.type)}
            style={{
              minHeight: 36,
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--mc-border)',
              background:
                addingType === c.type ? 'var(--mc-accent-soft)' : 'var(--mc-bg)',
              color: 'var(--mc-text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Plus className="w-3 h-3" aria-hidden />
            {c.label}
          </button>
        ))}
      </div>

      {addingType && (
        <form
          onSubmit={submit}
          style={{
            marginTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 650, color: 'var(--mc-text-muted)' }}>
              {addingType}
            </span>
            <button
              type="button"
              onClick={reset}
              aria-label="Cancel"
              style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {addingType === 'link' && (
            <input
              ref={titleRef}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
              style={fieldStyle}
            />
          )}
          <input
            ref={addingType !== 'link' ? titleRef : undefined}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={
              addingType === 'note'
                ? 'Title'
                : addingType === 'link'
                  ? 'Label (optional)'
                  : 'Checklist item'
            }
            style={fieldStyle}
          />
          {addingType === 'note' && (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Details (optional)"
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          )}
          <button
            type="submit"
            disabled={saving}
            style={{
              minHeight: 40,
              borderRadius: 8,
              border: 'none',
              background: 'var(--mc-accent)',
              color: '#fff',
              fontWeight: 650,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
        </form>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  width: '100%',
  minHeight: 40,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--mc-border)',
  fontSize: 13,
  boxSizing: 'border-box',
  background: '#fff',
  color: 'var(--mc-text)',
};
