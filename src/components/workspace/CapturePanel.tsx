import { useState, useRef } from 'react';
import { Zap, Send, Loader2 } from 'lucide-react';

interface Props {
  onCapture: (text: string) => Promise<void>;
}

export function CapturePanel({ onCapture }: Props) {
  const [text,       setText]       = useState('');
  const [saving,     setSaving]     = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const val = text.trim();
    if (!val || saving) return;
    setSaving(true);
    try {
      await onCapture(val);
      setText('');
      textareaRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: 'linear-gradient(145deg, #0d1424 0%, #0a1020 100%)',
        border: '1px solid #1a2638',
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.35)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '11px',
              letterSpacing: '0.14em',
              color: '#475569',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Quick Capture
          </span>
        </div>
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '10px',
            color: '#1e2d40',
            letterSpacing: '0.05em',
          }}
        >
          ⌘↵ to save
        </span>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What's on your mind? A task, idea, deadline..."
        rows={3}
        className="resize-none focus:outline-none w-full"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#e2e8f0',
          fontSize: '14px',
          lineHeight: '1.65',
          padding: 0,
        }}
      />

      {/* Footer */}
      <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid #111d2e' }}>
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '10px',
            color: '#1a2638',
            letterSpacing: '0.05em',
          }}
        >
          Saved to deadlines
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || saving}
          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all disabled:opacity-30"
          style={{ backgroundColor: '#f59e0b', color: '#000' }}
          onMouseEnter={e => {
            if (text.trim() && !saving)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fbbf24';
          }}
          onMouseLeave={e =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f59e0b')
          }
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Capture
        </button>
      </div>
    </div>
  );
}
