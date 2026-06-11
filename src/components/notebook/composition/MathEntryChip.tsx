import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';
import { Z_COMPOSITION_CHROME } from '../../../lib/ui/zIndexLayers';

type Props = {
  tokens: AtmosphereTokens;
  opacity: number;
  active: boolean;
  onOpenSheet: () => void;
};

export function MathEntryChip({ tokens, opacity, active, onOpenSheet }: Props) {
  return (
    <button
      type="button"
      data-composition-chip="1"
      aria-label="Math structures"
      onMouseDown={e => e.preventDefault()}
      onClick={onOpenSheet}
      style={{
        position: 'absolute',
        right: 8,
        bottom: 12,
        zIndex: Z_COMPOSITION_CHROME,
        minWidth: TOUCH_TARGET_MIN_PX,
        minHeight: TOUCH_TARGET_MIN_PX,
        height: 36,
        padding: '0 14px',
        borderRadius: 999,
        border: `1px solid ${active ? tokens.accent + '66' : tokens.cardBorder}`,
        background: active ? `${tokens.accent}18` : 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(8px)',
        color: active ? tokens.accent : tokens.textPrimary,
        fontSize: 13,
        fontWeight: 650,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        opacity,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        transition: 'opacity 0.2s ease, border-color 0.15s ease, background 0.15s ease',
      }}
    >
      Math
    </button>
  );
}
