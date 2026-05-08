import { useRef, useEffect } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'text' }>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

const ALIGNS = ['left', 'center', 'right'] as const;
const ALIGN_ICON: Record<string, string> = { left: '⊢', center: '≡', right: '⊣' };

export function TextBlock({ content, tokens, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => { autoResize(); }, [content.body]);

  return (
    <div style={{ padding: '18px 20px 14px' }}>
      {/* Alignment bar */}
      <div className="flex gap-1 mb-2.5">
        {ALIGNS.map(a => (
          <button
            key={a}
            onClick={() => onChange({ ...content, align: a })}
            title={`Align ${a}`}
            style={{
              fontSize:        '11px',
              padding:         '2px 6px',
              borderRadius:    '5px',
              border:          'none',
              cursor:          'pointer',
              backgroundColor: content.align === a ? `${tokens.accent}20` : 'transparent',
              color:           content.align === a ? tokens.accent : tokens.textGhost,
              transition:      'all 0.1s',
            }}
          >
            {ALIGN_ICON[a]}
          </button>
        ))}
      </div>

      <textarea
        ref={ref}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(); }}
        onFocus={autoResize}
        placeholder="Start writing…"
        rows={3}
        style={{
          width:        '100%',
          resize:       'none',
          border:       'none',
          outline:      'none',
          background:   'transparent',
          fontSize:     '14px',
          lineHeight:   1.75,
          color:        tokens.textPrimary,
          fontFamily:   'inherit',
          textAlign:    content.align ?? 'left',
          overflow:     'hidden',
          display:      'block',
        }}
      />
    </div>
  );
}
