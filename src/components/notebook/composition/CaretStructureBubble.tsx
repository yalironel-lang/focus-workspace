import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../../hooks/useAtmosphere';
import {
  BUBBLE_OVERFLOW_STRUCTURES,
  type CompositionFavoriteId,
  type CompositionStructureId,
  favoriteBubbleLabel,
} from '../../../lib/compositionStructureCatalog';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';
import { Z_COMPOSITION_CHROME } from '../../../lib/ui/zIndexLayers';
import { useCaretAnchorRect } from './useCaretAnchorRect';

type Props = {
  tokens: AtmosphereTokens;
  visible: boolean;
  blockId: string | null;
  editorRoot: HTMLElement | null;
  favoriteId: CompositionFavoriteId;
  onInsertFraction: () => void;
  onInsertExponent: () => void;
  onInsertSubscript: () => void;
  onInsertFavorite: () => void;
  onInsertStructure: (id: CompositionStructureId) => void;
  onPinFavorite: (id: CompositionFavoriteId) => void;
};

function bubbleBtnStyle(tokens: AtmosphereTokens, active = false): React.CSSProperties {
  return {
    minWidth: TOUCH_TARGET_MIN_PX,
    minHeight: 36,
    height: 36,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? tokens.accent + '55' : tokens.cardBorder}`,
    background: active ? `${tokens.accent}14` : 'rgba(255,255,255,0.05)',
    color: tokens.textPrimary,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: 1,
  };
}

export function CaretStructureBubble({
  tokens,
  visible,
  blockId,
  editorRoot,
  favoriteId,
  onInsertFraction,
  onInsertExponent,
  onInsertSubscript,
  onInsertFavorite,
  onInsertStructure,
  onPinFavorite,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const anchor = useCaretAnchorRect(visible, blockId, editorRoot, 56);

  useEffect(() => {
    if (!visible) setMoreOpen(false);
  }, [visible, blockId]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const onMore = useCallback(
    (id: CompositionStructureId) => {
      setMoreOpen(false);
      onInsertStructure(id);
    },
    [onInsertStructure],
  );

  if (!visible || !anchor || typeof document === 'undefined') return null;

  const top = Math.max(8, anchor.top - 44);
  const left = anchor.left;

  return createPortal(
    <div
      ref={wrapRef}
      data-composition-bubble="1"
      role="toolbar"
      aria-label="Inline math structures"
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: Z_COMPOSITION_CHROME,
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 10,
        border: `1px solid ${tokens.cardBorder}`,
        background: tokens.wellBg,
        boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
        maxWidth: 'calc(100vw - 72px)',
        flexWrap: 'wrap',
      }}
    >
      <button type="button" style={bubbleBtnStyle(tokens)} onMouseDown={e => e.preventDefault()} onClick={onInsertFraction} title="Fraction">
        a/b
      </button>
      <button type="button" style={bubbleBtnStyle(tokens)} onMouseDown={e => e.preventDefault()} onClick={onInsertExponent} title="Power">
        xⁿ
      </button>
      <button type="button" style={bubbleBtnStyle(tokens)} onMouseDown={e => e.preventDefault()} onClick={onInsertSubscript} title="Subscript">
        xₙ
      </button>
      <button
        type="button"
        style={bubbleBtnStyle(tokens)}
        onMouseDown={e => e.preventDefault()}
        onClick={onInsertFavorite}
        title={`Favorite: ${favoriteBubbleLabel(favoriteId)}`}
      >
        ★
      </button>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          style={bubbleBtnStyle(tokens, moreOpen)}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setMoreOpen(v => !v)}
          title="More structures"
          aria-expanded={moreOpen}
        >
          ···
        </button>
        {moreOpen ? (
          <div
            data-composition-more="1"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              padding: 4,
              borderRadius: 10,
              border: `1px solid ${tokens.cardBorder}`,
              background: tokens.wellBg,
              boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
              minWidth: 140,
              zIndex: Z_COMPOSITION_CHROME + 1,
            }}
          >
            {BUBBLE_OVERFLOW_STRUCTURES.map(s => (
              <button
                key={s.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => onMore(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  minHeight: 36,
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: 'transparent',
                  color: tokens.textPrimary,
                  fontSize: 13,
                  cursor: 'pointer',
                  gap: 8,
                }}
              >
                <span>{s.title}</span>
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
                    onPinFavorite(s.id as CompositionFavoriteId);
                  }}
                  style={{ opacity: favoriteId === s.id ? 1 : 0.45, fontSize: 12 }}
                >
                  ★
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
