import { useCallback, useEffect, useState } from 'react';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';
import { Z_COMPOSITION_CHROME } from '../../../lib/ui/zIndexLayers';

type Props = {
  tokens: AtmosphereTokens;
  afterIndex: number;
  onInsertStep: (afterIndex: number) => void;
  onInsertEquation: (afterIndex: number) => void;
  onInsertHandwriting: (afterIndex: number) => void;
};

export function BlockGutterInsert({
  tokens,
  afterIndex,
  onInsertStep,
  onInsertEquation,
  onInsertHandwriting,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    setCoarsePointer(window.matchMedia('(hover: none)').matches);
  }, []);

  const run = useCallback(
    (action: 'step' | 'equation' | 'handwriting') => {
      setOpen(false);
      if (action === 'step') onInsertStep(afterIndex);
      else if (action === 'equation') onInsertEquation(afterIndex);
      else onInsertHandwriting(afterIndex);
    },
    [afterIndex, onInsertEquation, onInsertHandwriting, onInsertStep],
  );

  const show = open || hovered;

  return (
    <div
      data-composition-gutter="1"
      style={{
        position: 'relative',
        height: show ? 52 : coarsePointer ? 48 : 20,
        margin: '2px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'height 0.15s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        if (!open) setHovered(false);
      }}
    >
      <button
        type="button"
        aria-label="Insert block"
        aria-expanded={open}
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        style={{
          minWidth: TOUCH_TARGET_MIN_PX,
          minHeight: TOUCH_TARGET_MIN_PX,
          width: TOUCH_TARGET_MIN_PX,
          height: TOUCH_TARGET_MIN_PX,
          borderRadius: 999,
          border: `1px solid ${show ? tokens.accent + '55' : tokens.cardBorder}`,
          background: show ? `${tokens.accent}12` : 'rgba(255,255,255,0.04)',
          color: show ? tokens.accent : tokens.textMuted,
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          opacity: show ? 1 : coarsePointer ? 0.62 : 0.35,
          transition: 'opacity 0.15s ease, background 0.15s ease',
        }}
      >
        +
      </button>
      {open ? (
        <div
          data-composition-gutter-menu="1"
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: Z_COMPOSITION_CHROME,
            marginTop: 4,
            padding: 4,
            borderRadius: 10,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.wellBg,
            boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
            minWidth: 148,
          }}
        >
          {(
            [
              { id: 'step' as const, label: 'Step' },
              { id: 'equation' as const, label: 'Equation' },
              { id: 'handwriting' as const, label: 'Handwriting' },
            ] as const
          ).map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => run(item.id)}
              style={{
                display: 'block',
                width: '100%',
                minHeight: TOUCH_TARGET_MIN_PX,
                padding: '8px 12px',
                textAlign: 'left',
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                color: tokens.textPrimary,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
