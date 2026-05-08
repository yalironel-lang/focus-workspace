import { useRef, useEffect } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'note' }>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

export function NoteBlock({ content, tokens, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Line height kept in sync for the lined-paper grid
  const LINE_H = 26; // px

  const autoResize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => { autoResize(); }, [content.body]);

  return (
    <div
      style={{
        padding:    '14px 18px',
        minHeight:  '100px',
        position:   'relative',
        // Lined-paper: lines start after first row
        backgroundImage: `repeating-linear-gradient(
          transparent,
          transparent ${LINE_H - 1}px,
          ${tokens.cardBorder} ${LINE_H - 1}px,
          ${tokens.cardBorder} ${LINE_H}px
        )`,
        backgroundSize:     `100% ${LINE_H}px`,
        backgroundPosition: `0 ${LINE_H + 2}px`,
      }}
    >
      {/* Faint top rule as a "header line" */}
      <div
        style={{
          position:        'absolute',
          top:             `${LINE_H + 14}px`,
          left:            '18px',
          right:           '18px',
          height:          '1px',
          backgroundColor: `${tokens.accent}18`,
          pointerEvents:   'none',
        }}
      />

      <textarea
        ref={ref}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(); }}
        onFocus={autoResize}
        placeholder="Your note…"
        rows={4}
        style={{
          width:      '100%',
          resize:     'none',
          border:     'none',
          outline:    'none',
          background: 'transparent',
          fontSize:   '13px',
          lineHeight: `${LINE_H}px`,
          color:      tokens.textPrimary,
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          overflow:   'hidden',
          display:    'block',
          position:   'relative',
          zIndex:     1,
          caretColor: tokens.accent,
        }}
      />
    </div>
  );
}
