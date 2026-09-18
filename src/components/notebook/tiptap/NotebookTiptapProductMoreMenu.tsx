/**
 * Compact Notebook product “More” menu (⋯) for notebook-level actions.
 * Portaled so sticky toolbar overflow does not clip the menu.
 * Keeps the writing toolbar uncluttered — Customize + Export PDF live here.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Palette } from 'lucide-react';
import { TOUCH_TARGET_MIN_PX } from '../../../lib/ui/touchTarget';
import {
  NB_PRODUCT_CHROME,
  nbProductIconBtnStyle,
} from './notebookProductToolbarChrome';
import { nbP0Bump } from '../../../lib/notebookP0Forensics';

type Props = {
  /** Open Notebook Designer (Customize Notebook). */
  onCustomizeNotebook?: () => void;
  /** Called when the user chooses Export PDF. Parent runs M7.6 pipeline. */
  onExportPdf?: () => void;
};

type MenuPos = { top: number; left: number; width: number };

function computeMenuPosition(trigger: HTMLElement): MenuPos {
  const r = trigger.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewW = vv?.width ?? window.innerWidth;
  const viewH = vv?.height ?? window.innerHeight;
  const width = 220;
  let left = r.right - width;
  left = Math.max(8, Math.min(left, viewW - width - 8));
  const spaceBelow = viewH - r.bottom - 8;
  const preferBelow = spaceBelow >= 80;
  const top = preferBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - 100);
  return { top, left, width };
}

function menuItemStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'start',
    padding: '10px 12px',
    border: 'none',
    background: 'transparent',
    color: NB_PRODUCT_CHROME.ink,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 8,
    fontFamily: 'inherit',
    minHeight: TOUCH_TARGET_MIN_PX,
  };
}

export function NotebookTiptapProductMoreMenu({ onCustomizeNotebook, onExportPdf }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    nbP0Bump('moreMenuRepositions');
    const next = computeMenuPosition(el);
    setPos(prev => {
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.width === next.width
      ) {
        return prev;
      }
      nbP0Bump('moreMenuPosStateUpdates');
      return next;
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    // P0: do NOT reposition on every scroll tick while sticky toolbar moves —
    // that was a setPos storm on heavy pages (same class as selection-toolbar scroll storm).
    // Close on scroll instead; resize still repositions when menu stays open.
    const onScrollClose = () => {
      nbP0Bump('moreMenuScrollRepositions');
      setOpen(false);
    };
    const onResizeReposition = () => reposition();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onResizeReposition);
    window.addEventListener('scroll', onScrollClose, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onResizeReposition);
    // visualViewport scroll often tracks keyboard/pinch — treat like window scroll for P0.
    vv?.addEventListener('scroll', onScrollClose);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onResizeReposition);
      window.removeEventListener('scroll', onScrollClose, true);
      vv?.removeEventListener('resize', onResizeReposition);
      vv?.removeEventListener('scroll', onScrollClose);
    };
  }, [open]);

  const menu =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            data-nb-product-more-menu="1"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 10060,
              padding: 4,
              borderRadius: 10,
              border: `1px solid ${NB_PRODUCT_CHROME.menuBorder}`,
              background: NB_PRODUCT_CHROME.menuSurface,
              boxShadow: NB_PRODUCT_CHROME.menuShadow,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {onCustomizeNotebook ? (
              <button
                type="button"
                role="menuitem"
                data-nb-product-customize="1"
                style={menuItemStyle()}
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={e => {
                  e.stopPropagation();
                  setOpen(false);
                  onCustomizeNotebook();
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Palette size={15} strokeWidth={2.1} aria-hidden />
                Customize Notebook
              </button>
            ) : null}
            {onExportPdf ? (
              <button
                type="button"
                role="menuitem"
                data-nb-product-export-pdf="1"
                style={menuItemStyle()}
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={e => {
                  e.stopPropagation();
                  setOpen(false);
                  onExportPdf();
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Export PDF
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-nb-product-more="1"
        aria-label="More notebook actions"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        style={{
          ...nbProductIconBtnStyle(),
          background: open ? NB_PRODUCT_CHROME.activeFill : 'transparent',
          boxShadow: open ? `inset 0 0 0 1px ${NB_PRODUCT_CHROME.focusRing}` : 'none',
        }}
        onMouseDown={e => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        onMouseEnter={e => {
          if (!open) e.currentTarget.style.background = NB_PRODUCT_CHROME.hoverFill;
        }}
        onMouseLeave={e => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
      >
        <MoreHorizontal size={15} strokeWidth={2.1} aria-hidden />
      </button>
      {menu}
    </>
  );
}
