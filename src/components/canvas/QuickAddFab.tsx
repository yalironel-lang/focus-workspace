import { useState, useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { BlockType } from '../../hooks/useCustomBlocks';
import { BLOCK_META } from '../../hooks/useCustomBlocks';

interface Props {
  tokens:       AtmosphereTokens;
  onAddBlock:   (type: BlockType) => void;
  onOpenModules: () => void;
}

interface Option {
  type:  BlockType | 'module';
  label: string;
  icon:  string;
}

const OPTIONS: Option[] = [
  { type: 'text',      label: 'Text',      icon: BLOCK_META.text.icon      },
  { type: 'quote',     label: 'Quote',     icon: BLOCK_META.quote.icon     },
  { type: 'image',     label: 'Image',     icon: BLOCK_META.image.icon     },
  { type: 'note',      label: 'Note',      icon: BLOCK_META.note.icon      },
  { type: 'link',      label: 'Link',      icon: BLOCK_META.link.icon      },
  { type: 'checklist', label: 'Checklist', icon: BLOCK_META.checklist.icon },
  { type: 'emoji',     label: 'Sticker',   icon: BLOCK_META.emoji.icon     },
  { type: 'divider',   label: 'Divider',   icon: BLOCK_META.divider.icon   },
  { type: 'module',    label: 'Module',    icon: '⊞'                       },
];

export function QuickAddFab({ tokens, onAddBlock, onOpenModules }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSelect = (opt: Option) => {
    setOpen(false);
    if (opt.type === 'module') { onOpenModules(); return; }
    onAddBlock(opt.type as BlockType);
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom:   '96px',
        right:    '24px',
        zIndex:   45,
        display:  'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap:      '8px',
      }}
    >
      {/* Option menu (expands upward) */}
      {open && (
        <div
          style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           '4px',
            animation:     'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Section label */}
          <p
            style={{
              fontSize:      '9px',
              fontWeight:    700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color:         tokens.textGhost,
              textAlign:     'right',
              paddingRight:  '6px',
              marginBottom:  '2px',
              fontFamily:    "'Space Grotesk', sans-serif",
            }}
          >
            Add anything
          </p>

          {/* Option buttons — staggered layout */}
          <div
            style={{
              display:   'flex',
              flexWrap:  'wrap',
              gap:       '6px',
              maxWidth:  '240px',
              justifyContent: 'flex-end',
            }}
          >
            {OPTIONS.map((opt, i) => (
              <button
                key={opt.type}
                onClick={() => handleSelect(opt)}
                style={{
                  display:         'flex',
                  alignItems:      'center',
                  gap:             '5px',
                  padding:         '6px 10px',
                  borderRadius:    '20px',
                  border:          `1px solid ${tokens.cardBorder}`,
                  backgroundColor: tokens.cardBg,
                  color:           tokens.textSecondary,
                  fontSize:        '12px',
                  fontWeight:      600,
                  cursor:          'pointer',
                  backdropFilter:  'blur(12px)',
                  transition:      'all 0.12s',
                  animationDelay:  `${i * 25}ms`,
                  boxShadow:       `0 2px 8px rgba(0,0,0,0.25)`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${tokens.accent}60`;
                  (e.currentTarget as HTMLButtonElement).style.color = tokens.accent;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBg;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
                  (e.currentTarget as HTMLButtonElement).style.color = tokens.textSecondary;
                  (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                }}
              >
                <span style={{ fontSize: '13px' }}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main FAB button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close' : 'Add anything'}
        style={{
          width:           '48px',
          height:          '48px',
          borderRadius:    '50%',
          border:          'none',
          backgroundColor: open ? tokens.cardBg : tokens.accent,
          color:           open ? tokens.textPrimary : '#000',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          cursor:          'pointer',
          boxShadow:       open
            ? `0 0 0 1px ${tokens.cardBorder}, 0 8px 32px rgba(0,0,0,0.4)`
            : `0 0 0 1px ${tokens.accent}50, 0 8px 32px ${tokens.accentGlow}, 0 4px 12px rgba(0,0,0,0.3)`,
          transform:       'none',
          transition:      'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        }}
      >
        <div
          style={{
            transform:  open ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            display:    'flex',
          }}
        >
          {open ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" strokeWidth={2.5} />}
        </div>
      </button>
    </div>
  );
}
