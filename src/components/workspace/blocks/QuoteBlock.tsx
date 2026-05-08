import { useRef, useEffect } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'quote' }>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function QuoteBlock({ content, tokens, onChange }: Props) {
  const bodyRef   = useRef<HTMLTextAreaElement>(null);
  const authorRef = useRef<HTMLInputElement>(null);

  useEffect(() => { autoResize(bodyRef.current); }, [content.body]);

  return (
    <div
      style={{
        padding:     '20px 24px',
        borderLeft:  `3px solid ${tokens.accent}`,
        marginLeft:  '4px',
      }}
    >
      {/* Quote mark */}
      <div
        style={{
          fontSize:    '36px',
          lineHeight:  1,
          color:       `${tokens.accent}50`,
          fontFamily:  'Georgia, serif',
          marginBottom: '6px',
          userSelect:  'none',
        }}
      >
        "
      </div>

      {/* Body */}
      <textarea
        ref={bodyRef}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(bodyRef.current); }}
        placeholder="Enter quote…"
        rows={2}
        style={{
          width:      '100%',
          resize:     'none',
          border:     'none',
          outline:    'none',
          background: 'transparent',
          fontSize:   '16px',
          lineHeight: 1.65,
          fontStyle:  'italic',
          color:      tokens.textPrimary,
          fontFamily: 'Georgia, serif',
          overflow:   'hidden',
          display:    'block',
        }}
      />

      {/* Author */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
        <span style={{ color: tokens.accent, fontSize: '12px', fontWeight: 600 }}>—</span>
        <input
          ref={authorRef}
          type="text"
          value={content.author ?? ''}
          onChange={e => onChange({ ...content, author: e.target.value })}
          placeholder="Author (optional)"
          style={{
            flex:       1,
            border:     'none',
            outline:    'none',
            background: 'transparent',
            fontSize:   '12px',
            color:      tokens.textMuted,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}
