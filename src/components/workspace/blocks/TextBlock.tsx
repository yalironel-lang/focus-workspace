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
// SVG-based alignment icons to keep them crisp
const ALIGN_SVG: Record<string, React.ReactNode> = {
  left: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="0" y="1" width="12" height="1.5" rx="0.75" />
      <rect x="0" y="5" width="8"  height="1.5" rx="0.75" />
      <rect x="0" y="9" width="10" height="1.5" rx="0.75" />
    </svg>
  ),
  center: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="0"   y="1" width="12" height="1.5" rx="0.75" />
      <rect x="2"   y="5" width="8"  height="1.5" rx="0.75" />
      <rect x="1"   y="9" width="10" height="1.5" rx="0.75" />
    </svg>
  ),
  right: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="0"  y="1" width="12" height="1.5" rx="0.75" />
      <rect x="4"  y="5" width="8"  height="1.5" rx="0.75" />
      <rect x="2"  y="9" width="10" height="1.5" rx="0.75" />
    </svg>
  ),
};

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
    <div style={{ padding: '14px 18px 12px' }}>

      {/* Alignment bar */}
      <div
        style={{
          display:        'flex',
          gap:            '2px',
          marginBottom:   '10px',
          backgroundColor: `${tokens.wellBg}`,
          borderRadius:   '7px',
          padding:        '3px',
          width:          'fit-content',
          border:         `1px solid ${tokens.cardBorder}`,
        }}
      >
        {ALIGNS.map(a => {
          const isActive = (content.align ?? 'left') === a;
          return (
            <button
              key={a}
              onClick={() => onChange({ ...content, align: a })}
              title={`Align ${a}`}
              style={{
                padding:         '4px 7px',
                borderRadius:    '5px',
                border:          'none',
                cursor:          'pointer',
                backgroundColor: isActive ? tokens.accent : 'transparent',
                color:           isActive ? '#000' : tokens.textGhost,
                transition:      'all 0.12s ease',
                lineHeight:      0,
              }}
            >
              {ALIGN_SVG[a]}
            </button>
          );
        })}
      </div>

      <textarea
        ref={ref}
        value={content.body}
        onChange={e => { onChange({ ...content, body: e.target.value }); autoResize(); }}
        onFocus={autoResize}
        placeholder="Start writing…"
        rows={3}
        style={{
          width:       '100%',
          resize:      'none',
          border:      'none',
          outline:     'none',
          background:  'transparent',
          fontSize:    '14px',
          lineHeight:  1.75,
          color:       tokens.textPrimary,
          fontFamily:  "'Plus Jakarta Sans', system-ui, sans-serif",
          textAlign:   content.align ?? 'left',
          overflow:    'hidden',
          display:     'block',
          caretColor:  tokens.accent,
        }}
      />
    </div>
  );
}
