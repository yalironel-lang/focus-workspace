/**
 * Compact Notebook product “More” menu (⋯) for notebook-level actions.
 * Portaled so sticky toolbar overflow does not clip the menu.
 * Keeps the writing toolbar uncluttered — Export PDF lives here.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import {
  NB_PRODUCT_CHROME,
  nbProductIconBtnStyle,
} from './notebookProductToolbarChrome';

type Props = {
  /** Called when the user chooses Export PDF. Parent runs M7.6 pipeline. */
  onExportPdf: () => void;
};

type MenuPos = { top: number; left: number; width: number };

function computeMenuPosition(trigger: HTMLElement): MenuPos {
  const r = trigger.getBoundingClientRect();
  const vv = window.visualViewport;
  const viewW = vv?.width ?? window.innerWidth;
  const viewH = vv?.height ?? window.innerHeight;
  const width = 188;
  let left = r.right - width;
  left = Math.max(8, Math.min(left, viewW - width - 8));
  const spaceBelow = viewH - r.bottom - 8;
  const preferBelow = spaceBelow >= 80;
  const top = preferBelow ? r.bottom + 6 : Math.max(8, r.top - 6 - 52);
  return { top, left, width };
}

export function NotebookTiptapProductMoreMenu({ onExportPdf }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    setPos(computeMenuPosition(el));
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
    const onReposition = () => reposition();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
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
            <button
              type="button"
              role="menuitem"
              data-nb-product-export-pdf="1"
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                textAlign: 'start',
                padding: '9px 12px',
                border: 'none',
                background: 'transparent',
                color: NB_PRODUCT_CHROME.ink,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: 8,
                fontFamily: 'inherit',
                minHeight: 36,
              }}
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
