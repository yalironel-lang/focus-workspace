import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import type { BlockContent } from '../../../hooks/useCustomBlocks';

type Content = Extract<BlockContent, { type: 'divider' }>;
type DividerStyle = NonNullable<Content['style']>;

interface Props {
  content:  Content;
  tokens:   AtmosphereTokens;
  onChange: (c: Content) => void;
}

const STYLES: DividerStyle[] = ['line', 'dots', 'gradient'];
const STYLE_LABELS: Record<DividerStyle, string> = { line: 'Line', dots: 'Dots', gradient: 'Gradient' };

export function DividerBlock({ content, tokens, onChange }: Props) {
  const style = content.style ?? 'gradient';

  return (
    <div style={{ padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
      {/* The visual divider */}
      <div style={{ width: '100%', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {style === 'line' && (
          <div style={{ height: '1px', width: '100%', background: tokens.cardBorder }} />
        )}
        {style === 'dots' && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                style={{
                  width:        i === 3 ? '5px' : '3px',
                  height:       i === 3 ? '5px' : '3px',
                  borderRadius: '50%',
                  background:   i === 3 ? tokens.accent : tokens.cardBorder,
                  opacity:      i === 3 ? 0.8 : 0.5,
                }}
              />
            ))}
          </div>
        )}
        {style === 'gradient' && (
          <div style={{
            height: '1px', width: '100%',
            background: `linear-gradient(to right, transparent, ${tokens.accent}60, transparent)`,
          }} />
        )}
      </div>

      {/* Style picker — small, unobtrusive */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {STYLES.map(s => (
          <button
            key={s}
            onClick={() => onChange({ ...content, style: s })}
            style={{
              padding:         '2px 8px',
              borderRadius:    '5px',
              border:          `1px solid ${s === style ? tokens.accent + '50' : tokens.cardBorder}`,
              background:      s === style ? `${tokens.accent}15` : 'transparent',
              color:           s === style ? tokens.accent : tokens.textGhost,
              fontSize:        '9px',
              fontWeight:      600,
              letterSpacing:   '0.08em',
              textTransform:   'uppercase',
              cursor:          'pointer',
              transition:      'all 0.1s',
            }}
          >
            {STYLE_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
