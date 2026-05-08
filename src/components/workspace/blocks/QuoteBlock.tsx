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
        padding:    '20px 22px 18px',
        position:   'relative',
        overflow:   'hidden',
      }}
    >
      {/* Accent left bar */}
      <div
        style={{
          position:        'absolute',
          left:            0,
          top:             0,
          bottom:          0,
          width:           '3px',
          background:      `linear-gradient(180deg, ${tokens.accent}, ${tokens.accent}40)`,
          boxShadow:       `2px 0 16px ${tokens.accentGlow}`,
          borderRadius:    '0 2px 2px 0',
        }}
      />

      {/* Opening quote mark — large, decorative */}
      <div
        style={{
          fontSize:     '52px',
          lineHeight:   0.8,
          color:        `${tokens.accent}30`,
          fontFamily:   'Georgia, "Times New Roman", serif',
          marginBottom: '10px',
          userSelect:   'none',
          paddingLeft:  '8px',
        }}
      >
        "
      </div>

      {/* Body */}
      <textarea
        ref={bodyRef}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(bodyRef.current); }}
        placeholder="Enter a quote…"
        rows={2}
        style={{
          width:      '100%',
          resize:     'none',
          border:     'none',
          outline:    'none',
          background: 'transparent',
          fontSize:   '15px',
          lineHeight: 1.7,
          fontStyle:  'italic',
          color:      tokens.textPrimary,
          fontFamily: 'Georgia, "Times New Roman", serif',
          overflow:   'hidden',
          display:    'block',
          paddingLeft: '8px',
          caretColor: tokens.accent,
        }}
      />

      {/* Author line */}
      <div
        style={{
          display:     'flex',
          alignItems:  'center',
          gap:         '6px',
          marginTop:   '12px',
          paddingLeft: '8px',
        }}
      >
        <span
          style={{
            color:      tokens.accent,
            fontSize:   '14px',
            fontWeight: 600,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          —
        </span>
        <input
          ref={authorRef}
          type="text"
          value={content.author ?? ''}
          onChange={e => onChange({ ...content, author: e.target.value })}
          placeholder="Author (optional)"
          style={{
            flex:        1,
            border:      'none',
            outline:     'none',
            background:  'transparent',
            fontSize:    '11px',
            fontWeight:  500,
            letterSpacing: '0.03em',
            color:       tokens.textMuted,
            fontFamily:  "'Space Grotesk', system-ui, sans-serif",
            caretColor:  tokens.accent,
          }}
        />
      </div>
    </div>
  );
}
