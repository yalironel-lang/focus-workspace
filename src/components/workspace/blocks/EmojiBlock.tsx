import { useState } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'emoji' }>;
type EmojiSize = NonNullable<Content['size']>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

const FONT_SIZES: Record<EmojiSize, string> = { sm: '32px', md: '48px', lg: '64px', xl: '96px' };
const SIZE_LABELS: Record<EmojiSize, string> = { sm: 'S', md: 'M', lg: 'L', xl: 'XL' };
const SIZES: EmojiSize[] = ['sm', 'md', 'lg', 'xl'];

// Quick emoji picker palette
const QUICK_EMOJIS = [
  '✨','🔥','💡','🎯','⚡','🌊','🌿','🎨',
  '📌','📎','🔮','💎','🏆','🚀','💬','❤️',
  '⭐','🌙','☀️','🌸','🍀','🦋','🌈','🎵',
];

export function EmojiBlock({ content, tokens, onChange }: Props) {
  const [picking, setPicking] = useState(false);
  const [draft,   setDraft]   = useState(content.emoji);

  const size = content.size ?? 'lg';

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      {/* Main emoji display */}
      <button
        onClick={() => setPicking(p => !p)}
        title="Click to change emoji"
        style={{
          fontSize:   FONT_SIZES[size],
          lineHeight:  1,
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          padding:    '4px',
          borderRadius: '12px',
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
      >
        {content.emoji}
      </button>

      {/* Optional label */}
      <input
        type="text"
        value={content.label ?? ''}
        onChange={e => onChange({ ...content, label: e.target.value })}
        placeholder="Add label…"
        style={{
          border:     'none',
          outline:    'none',
          background: 'transparent',
          fontSize:   '11px',
          color:      tokens.textMuted,
          textAlign:  'center',
          fontFamily: 'inherit',
          width:      '100%',
        }}
      />

      {/* Size selector */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {SIZES.map(s => (
          <button
            key={s}
            onClick={() => onChange({ ...content, size: s })}
            style={{
              width:        '26px',
              height:       '22px',
              borderRadius: '5px',
              border:       `1px solid ${s === size ? tokens.accent + '50' : tokens.cardBorder}`,
              background:   s === size ? `${tokens.accent}15` : 'transparent',
              color:        s === size ? tokens.accent : tokens.textGhost,
              fontSize:     '9px',
              fontWeight:   700,
              cursor:       'pointer',
              transition:   'all 0.1s',
            }}
          >
            {SIZE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Emoji picker */}
      {picking && (
        <div
          style={{
            width:         '100%',
            padding:       '10px',
            borderRadius:  '12px',
            border:        `1px solid ${tokens.cardBorder}`,
            background:    tokens.wellBg,
          }}
        >
          {/* Input */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Paste emoji…"
              maxLength={8}
              style={{
                flex: 1, padding: '5px 8px', borderRadius: '8px',
                border: `1px solid ${tokens.cardBorder}`, background: tokens.pageBg,
                color: tokens.textPrimary, fontSize: '14px', outline: 'none',
                textAlign: 'center',
              }}
            />
            <button
              onClick={() => { onChange({ ...content, emoji: draft }); setPicking(false); }}
              style={{
                padding: '5px 10px', borderRadius: '8px', border: 'none',
                background: tokens.accent, color: '#000', fontWeight: 700, fontSize: '11px', cursor: 'pointer',
              }}
            >
              Use
            </button>
          </div>

          {/* Quick palette */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
            {QUICK_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => { onChange({ ...content, emoji: e }); setPicking(false); }}
                style={{
                  fontSize: '18px', lineHeight: 1, padding: '4px', borderRadius: '6px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={ev => ((ev.currentTarget as HTMLButtonElement).style.background = tokens.cardBorder)}
                onMouseLeave={ev => ((ev.currentTarget as HTMLButtonElement).style.background = 'transparent')}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
