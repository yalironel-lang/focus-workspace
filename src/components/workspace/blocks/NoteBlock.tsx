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

  const autoResize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => { autoResize(); }, [content.body]);

  // Subtle lined-paper rows behind textarea
  const lineHeight = 24; // px

  return (
    <div
      style={{
        padding:    '16px 18px',
        position:   'relative',
        minHeight:  '100px',
        // Lined-paper effect
        backgroundImage: `repeating-linear-gradient(
          transparent,
          transparent ${lineHeight - 1}px,
          ${tokens.cardBorder}55 ${lineHeight - 1}px,
          ${tokens.cardBorder}55 ${lineHeight}px
        )`,
        backgroundSize:     `100% ${lineHeight}px`,
        backgroundPosition: `0 ${lineHeight + 4}px`,
      }}
    >
      <textarea
        ref={ref}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(); }}
        onFocus={autoResize}
        placeholder="Your note…"
        rows={4}
        style={{
          width:       '100%',
          resize:      'none',
          border:      'none',
          outline:     'none',
          background:  'transparent',
          fontSize:    '13px',
          lineHeight:  `${lineHeight}px`,
          color:       tokens.textPrimary,
          fontFamily:  "'Space Grotesk', inherit",
          overflow:    'hidden',
          display:     'block',
          position:    'relative',
          zIndex:      1,
        }}
      />
    </div>
  );
}
