/**
 * Product Block / Academic… menu for the TipTap document toolbar.
 * Portal + fixed positioning so overflow parents cannot clip options.
 * Media inserts (Image, Handwriting) sit immediately after basic blocks (Step),
 * not buried under academic callouts.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  CANDIDATE_BLOCK_MENU,
  type CandidateBlockMenuItem,
  type CandidateBlockTarget,
} from '../../../lib/notebookTiptap/candidateBlockCommands';
import { CANDIDATE_INSERT_IMAGE_MENU_VALUE } from '../../../lib/notebookTiptap/candidateImageInsert';
import { CANDIDATE_INSERT_HANDWRITING_MENU_VALUE } from '../../../lib/notebookTiptap/candidateHandwritingInsert';

export type ProductBlockMenuAction =
  | { kind: 'block'; target: CandidateBlockTarget }
  | { kind: 'image' }
  | { kind: 'handwriting' };

type Props = {
  buttonStyle: CSSProperties;
  /** Called when the menu is about to open — capture TipTap insert target before blur. */
  onBeforeOpen?: () => void;
  onAction: (action: ProductBlockMenuAction) => void;
};

/** Basic blocks shown before media inserts (matches product order through Step). */
const BASIC_BEFORE_MEDIA = new Set([
  'paragraph',
  'title',
  'section',
  'bullet',
  'ordered',
  'task',
  'quote',
  'step',
]);

function holdEditorSelection(e: React.MouseEvent | React.PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function splitMenuItems(items: readonly CandidateBlockMenuItem[]) {
  const beforeMedia: CandidateBlockMenuItem[] = [];
  const afterMedia: CandidateBlockMenuItem[] = [];
  for (const item of items) {
    if (item.group === 'basic' && BASIC_BEFORE_MEDIA.has(item.id)) {
      beforeMedia.push(item);
    } else {
      afterMedia.push(item);
    }
  }
  return { beforeMedia, afterMedia };
}

export function NotebookTiptapProductBlockMenu({
  buttonStyle,
  onBeforeOpen,
  onAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const { beforeMedia, afterMedia } = splitMenuItems(CANDIDATE_BLOCK_MENU);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(200, Math.min(280, Math.max(r.width, 120) + 80));
    let left = r.left;
    const maxLeft = (window.visualViewport?.width ?? window.innerWidth) - width - 8;
    left = Math.max(8, Math.min(left, maxLeft));
    const top = (r.bottom || 0) + 4;
    setPos({
      top,
      left,
      width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node | null;
      if (
        menuRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updatePosition();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.visualViewport?.addEventListener('resize', onReposition);
    window.visualViewport?.addEventListener('scroll', onReposition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.visualViewport?.removeEventListener('resize', onReposition);
      window.visualViewport?.removeEventListener('scroll', onReposition);
    };
  }, [open]);

  const itemStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'start',
    padding: '7px 10px',
    border: 'none',
    background: 'transparent',
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
  };

  const closeAndRun = (action: ProductBlockMenuAction) => {
    setOpen(false);
    setPos(null);
    onAction(action);
  };

  const renderBlockItem = (item: CandidateBlockMenuItem) => (
    <button
      key={item.id}
      type="button"
      role="menuitem"
      data-nb-product-block-option={item.id}
      style={itemStyle}
      onMouseDown={holdEditorSelection}
      onClick={e => {
        e.stopPropagation();
        closeAndRun({ kind: 'block', target: item.id });
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(56,189,248,0.16)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {item.group === 'academic' ? `◆ ${item.label}` : item.label}
    </button>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-nb-product-block="1"
        aria-label="Block type"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        style={{ ...buttonStyle, fontWeight: 500, minWidth: 120 }}
        onMouseDown={holdEditorSelection}
        onClick={e => {
          e.stopPropagation();
          if (!open) {
            onBeforeOpen?.();
            // Set position in the same event so the portal can render immediately
            // (avoids a blank frame / test flake waiting on layout effect).
            updatePosition();
            setOpen(true);
          } else {
            setOpen(false);
            setPos(null);
          }
        }}
      >
        Block / Academic…
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="Block / Academic"
              data-nb-product-block-menu="1"
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: Math.min(
                  420,
                  Math.max(160, (window.visualViewport?.height ?? window.innerHeight) - pos.top - 12),
                ),
                overflowY: 'auto',
                zIndex: 10050,
                padding: 6,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(15, 23, 42, 0.96)',
                boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              {beforeMedia.map(renderBlockItem)}

              {/* Product media inserts — always in this menu, right after Step */}
              <button
                type="button"
                role="menuitem"
                data-nb-product-image-option="1"
                data-nb-product-block-option={CANDIDATE_INSERT_IMAGE_MENU_VALUE}
                style={itemStyle}
                onMouseDown={holdEditorSelection}
                onClick={e => {
                  e.stopPropagation();
                  closeAndRun({ kind: 'image' });
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(56,189,248,0.16)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                Image
              </button>
              <button
                type="button"
                role="menuitem"
                data-nb-product-handwriting-option="1"
                data-nb-product-block-option={CANDIDATE_INSERT_HANDWRITING_MENU_VALUE}
                style={itemStyle}
                onMouseDown={holdEditorSelection}
                onClick={e => {
                  e.stopPropagation();
                  closeAndRun({ kind: 'handwriting' });
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(56,189,248,0.16)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                Handwriting
              </button>

              {afterMedia.map(renderBlockItem)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
