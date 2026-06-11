import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import {
  SHEET_ALGEBRA,
  SHEET_CALCULUS,
  SHEET_DOCUMENT,
  type CompositionFavoriteId,
  type CompositionStructureDef,
  type CompositionStructureId,
  favoriteBubbleLabel,
  structureLabel,
} from '../../../lib/compositionStructureCatalog';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';
import { Z_COMPOSITION_CHROME } from '../../../lib/ui/zIndexLayers';

type Props = {
  tokens: AtmosphereTokens;
  open: boolean;
  onClose: () => void;
  recents: CompositionStructureId[];
  favoriteId: CompositionFavoriteId;
  paneRect: DOMRect | null;
  guidanceText: string | null;
  onSelect: (id: CompositionStructureId) => void;
  onPinFavorite: (id: CompositionFavoriteId) => void;
};

function Section({
  title,
  items,
  tokens,
  favoriteId,
  onSelect,
  onPinFavorite,
}: {
  title: string;
  items: CompositionStructureDef[];
  tokens: AtmosphereTokens;
  favoriteId: CompositionFavoriteId;
  onSelect: (id: CompositionStructureId) => void;
  onPinFavorite: (id: CompositionFavoriteId) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: tokens.textGhost,
          marginBottom: 6,
          padding: '0 4px',
        }}
      >
        {title}
      </div>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => onSelect(item.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            minHeight: TOUCH_TARGET_MIN_PX,
            padding: '8px 12px',
            gap: 10,
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            color: tokens.textPrimary,
            fontSize: 14,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 28, fontWeight: 600 }}>{item.label}</span>
          <span style={{ flex: 1 }}>{item.title}</span>
          {item.pinnable ? (
            <span
              role="button"
              tabIndex={0}
              title="Pin as favorite"
              onMouseDown={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={e => {
                e.stopPropagation();
                onPinFavorite(item.id as CompositionFavoriteId);
              }}
              style={{ opacity: favoriteId === item.id ? 1 : 0.4, fontSize: 13 }}
            >
              ★
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function MathStructureSheet({
  tokens,
  open,
  onClose,
  recents,
  favoriteId,
  paneRect,
  guidanceText,
  onSelect,
  onPinFavorite,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const width = paneRect ? Math.min(360, Math.max(260, paneRect.width - 16)) : 320;
  const left = paneRect ? paneRect.left + (paneRect.width - width) / 2 : '50%';
  const bottom = paneRect ? Math.max(12, window.innerHeight - paneRect.bottom + 12) : 24;

  return createPortal(
    <div
      ref={panelRef}
      data-composition-sheet="1"
      role="dialog"
      aria-label="Math structures"
      style={{
        position: 'fixed',
        left: typeof left === 'number' ? left : '50%',
        transform: typeof left === 'number' ? undefined : 'translateX(-50%)',
        bottom,
        width,
        maxHeight: 'min(52vh, 420px)',
        zIndex: Z_COMPOSITION_CHROME + 2,
        borderRadius: 14,
        border: `1px solid ${tokens.cardBorder}`,
        background: tokens.wellBg,
        boxShadow: '0 12px 40px rgba(0,0,0,0.32)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 14px 8px',
          borderBottom: `1px solid ${tokens.cardBorder}`,
          fontSize: 13,
          fontWeight: 650,
        }}
      >
        Math
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {guidanceText ? (
          <p style={{ margin: '0 0 10px', padding: '0 6px', fontSize: 12, color: tokens.textMuted, lineHeight: 1.45 }}>
            {guidanceText}
          </p>
        ) : null}
        {recents.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: tokens.textGhost,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Recent
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap' }}>
              {recents.map(id => (
                <button
                  key={id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onSelect(id)}
                  style={{
                    minHeight: 36,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: `1px solid ${tokens.cardBorder}`,
                    background: 'rgba(255,255,255,0.04)',
                    color: tokens.textPrimary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {structureLabel(id)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${tokens.cardBorder}`,
            background: 'rgba(255,255,255,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
          }}
        >
          <span style={{ color: tokens.textMuted }}>★ Favorite</span>
          <span style={{ fontWeight: 600 }}>{favoriteBubbleLabel(favoriteId)}</span>
        </div>
        <Section title="Calculus" items={SHEET_CALCULUS} tokens={tokens} favoriteId={favoriteId} onSelect={onSelect} onPinFavorite={onPinFavorite} />
        <Section title="Algebra" items={SHEET_ALGEBRA} tokens={tokens} favoriteId={favoriteId} onSelect={onSelect} onPinFavorite={onPinFavorite} />
        <Section title="Document" items={SHEET_DOCUMENT} tokens={tokens} favoriteId={favoriteId} onSelect={onSelect} onPinFavorite={onPinFavorite} />
      </div>
      <div
        style={{
          padding: '10px 14px',
          borderTop: `1px solid ${tokens.cardBorder}`,
          fontSize: 11,
          color: tokens.textGhost,
          textAlign: 'center',
        }}
      >
        Type / for all commands
      </div>
    </div>,
    document.body,
  );
}
