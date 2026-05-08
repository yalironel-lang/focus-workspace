import { useState, useRef } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent, ChecklistItem } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'checklist' }>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

function uid() {
  return `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ChecklistBlock({ content, tokens, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => {
    const items = content.items.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    onChange({ ...content, items });
  };

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    const item: ChecklistItem = { id: uid(), text, checked: false };
    onChange({ ...content, items: [...content.items, item] });
    setDraft('');
    inputRef.current?.focus();
  };

  const deleteItem = (id: string) => {
    onChange({ ...content, items: content.items.filter(i => i.id !== id) });
  };

  const editText = (id: string, text: string) => {
    onChange({ ...content, items: content.items.map(i => i.id === id ? { ...i, text } : i) });
  };

  const done  = content.items.filter(i => i.checked).length;
  const total = content.items.length;

  return (
    <div style={{ padding: '14px 16px' }}>
      {/* Progress header */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: tokens.textGhost }}>
            {done}/{total} done
          </span>
          {/* Progress bar */}
          <div style={{ width: '80px', height: '3px', borderRadius: '99px', background: tokens.cardBorder }}>
            <div style={{
              height: '100%',
              width: `${total > 0 ? (done / total) * 100 : 0}%`,
              background: done === total && total > 0 ? '#10b981' : tokens.accent,
              borderRadius: '99px',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '10px' }}>
        {content.items.map(item => (
          <div
            key={item.id}
            className="group"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px', borderRadius: '8px' }}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggle(item.id)}
              style={{
                width:        '18px',
                height:       '18px',
                borderRadius: '5px',
                border:       `1.5px solid ${item.checked ? tokens.accent : tokens.cardBorder}`,
                background:   item.checked ? tokens.accent : 'transparent',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                flexShrink:   0,
                cursor:       'pointer',
                transition:   'all 0.15s',
              }}
            >
              {item.checked && <Check className="w-2.5 h-2.5" style={{ color: '#000', strokeWidth: 3 }} />}
            </button>

            {/* Text */}
            <input
              type="text"
              value={item.text}
              onChange={e => editText(item.id, e.target.value)}
              style={{
                flex:            1,
                border:          'none',
                outline:         'none',
                background:      'transparent',
                fontSize:        '13px',
                color:           item.checked ? tokens.textGhost : tokens.textPrimary,
                textDecoration:  item.checked ? 'line-through' : 'none',
                fontFamily:      'inherit',
                transition:      'color 0.15s',
              }}
            />

            {/* Delete */}
            <button
              onClick={() => deleteItem(item.id)}
              style={{
                opacity:  0,
                border:   'none',
                background: 'transparent',
                cursor:   'pointer',
                color:    tokens.textGhost,
                padding:  '2px',
                display:  'flex',
              }}
              className="group-hover:!opacity-100"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add item */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <div
          style={{
            width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
            border: `1.5px dashed ${tokens.cardBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Plus className="w-2.5 h-2.5" style={{ color: tokens.textGhost }} />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
          placeholder="Add item…"
          style={{
            flex:       1,
            border:     'none',
            outline:    'none',
            background: 'transparent',
            fontSize:   '13px',
            color:      tokens.textSecondary,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}
