import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { fitNotebookToolbar } from '../../lib/notebookToolbarOverflow';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';

export type NotebookToolbarItem = {
  id: string;
  priority: 'primary' | 'secondary';
  label: string;
  /** Used until the control has been measured, and while it is in the menu. */
  fallbackWidth: number;
  inline: ReactNode;
  /** Shown in the overflow menu. Defaults to the inline control. */
  menu?: ReactNode;
};

type Props = {
  ariaLabel: string;
  items: readonly NotebookToolbarItem[];
  gap?: number;
  /** Test seam. Production measures the toolbar content box. */
  containerWidth?: number;
  /** Test seam. Production measures each inline control. */
  itemWidths?: Readonly<Record<string, number>>;
  justify?: 'flex-start' | 'flex-end';
  style?: CSSProperties;
  rootProps?: Record<string, string>;
  divider?: ReactNode;
  /** Added to fallback width for every item after the first while a divider is shown. */
  dividerWidth?: number;
  overflowVariant?: 'text' | 'icon';
  overflowButtonStyle?: CSSProperties;
};

const OVERFLOW_ICON_PX = 44;
const OVERFLOW_TEXT_PX = 72;

function contentBoxWidth(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  const pad =
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  return Math.max(0, el.clientWidth - pad);
}

function focusableMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])'),
  );
}

export function NotebookResponsiveToolbar({
  ariaLabel,
  items,
  gap = 4,
  containerWidth,
  itemWidths,
  justify = 'flex-start',
  style,
  rootProps,
  divider,
  dividerWidth = 0,
  overflowVariant = 'text',
  overflowButtonStyle,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const focusMenuRef = useRef(false);
  const [measuredContainer, setMeasuredContainer] = useState(0);
  const [measuredItems, setMeasuredItems] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (containerWidth != null) return;
    const el = barRef.current;
    if (!el) return;
    const read = () => {
      const nextWidth = contentBoxWidth(el);
      setMeasuredContainer(prev => (prev === nextWidth ? prev : nextWidth));
      const next: Record<string, number> = {};
      itemRefs.current.forEach((node, id) => {
        if (node.offsetWidth > 0) next[id] = node.offsetWidth;
      });
      setMeasuredItems(prev => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.entries(next).every(([id, width]) => prev[id] === width);
        return same ? prev : { ...prev, ...next };
      });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerWidth, items]);

  const resolvedContainer = containerWidth ?? measuredContainer;
  const overflowWidth = overflowVariant === 'icon' ? OVERFLOW_ICON_PX : OVERFLOW_TEXT_PX;
  const fitItems = items.map((item, index) => {
    const measured = measuredItems[item.id] ?? 0;
    const explicit = itemWidths?.[item.id];
    const base = explicit ?? (measured > 0 ? measured : item.fallbackWidth);
    const dividerExtra = explicit == null && measured <= 0 && divider && index > 0 ? dividerWidth : 0;
    return {
      id: item.id,
      priority: item.priority,
      width: base + dividerExtra,
    };
  });
  const fit =
    resolvedContainer > 0
      ? fitNotebookToolbar({
          containerWidth: resolvedContainer,
          items: fitItems,
          gap,
          overflowWidth,
        })
      : { inlineIds: items.map(item => item.id), overflowIds: [] as string[] };

  const inline = new Set(fit.inlineIds);
  const overflowItems = items.filter(item => fit.overflowIds.includes(item.id));
  const visible = items.filter(item => inline.has(item.id));

  useEffect(() => {
    if (overflowItems.length === 0 && open) setOpen(false);
  }, [overflowItems.length, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = buttonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setMenuPos({ top: rect.bottom + 6, left });
    if (focusMenuRef.current) {
      focusMenuRef.current = false;
      window.requestAnimationFrame(() => {
        const menu = menuRef.current;
        if (!menu) return;
        focusableMenuItems(menu)[0]?.focus();
      });
    }
  }, [open, overflowItems.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const list = focusableMenuItems(menu);
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.length === 0) return;
      const next =
        event.key === 'ArrowDown'
          ? (index + 1 + list.length) % list.length
          : (index <= 0 ? list.length - 1 : index - 1);
      list[next]?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      list[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      list[list.length - 1]?.focus();
      return;
    }
    if (event.key === 'Tab') setOpen(false);
  };

  const menu =
    open && overflowItems.length > 0 && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            data-testid="notebook-toolbar-overflow-menu"
            data-nb-toolbar-overflow-menu="1"
            onKeyDown={onMenuKeyDown}
            onMouseDown={event => {
              const target = event.target as HTMLElement | null;
              if (target?.closest('select, input, textarea, [contenteditable="true"]')) return;
              event.preventDefault();
            }}
            onClick={event => {
              const target = event.target as HTMLElement | null;
              if (target?.closest('select, input, textarea, [contenteditable="true"]')) return;
              if (target?.closest('button')) setOpen(false);
            }}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: 240,
              zIndex: 10060,
              padding: 4,
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.16)',
              background: 'rgba(17,24,39,0.98)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.42)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxHeight: 'min(70vh, 420px)',
              overflowY: 'auto',
            }}
          >
            {overflowItems.map(item => (
              <div key={item.id} role="none" data-toolbar-overflow-item={item.id} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 650, letterSpacing: '0.04em', color: 'rgba(148,163,184,0.8)', padding: '6px 8px 0' }}>
                  {item.label}
                </div>
                <div style={{ minHeight: TOUCH_TARGET_MIN_PX, display: 'flex', alignItems: 'center' }}>
                  {item.menu ?? item.inline}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={ariaLabel}
      data-testid="notebook-responsive-toolbar"
      data-toolbar-overflow={overflowItems.length > 0 ? '1' : '0'}
      {...rootProps}
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        justifyContent: justify,
        gap,
        minWidth: 0,
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {visible.map((item, index) => (
        <span
          key={item.id}
          ref={node => {
            if (node) itemRefs.current.set(item.id, node);
            else itemRefs.current.delete(item.id);
          }}
          data-toolbar-item={item.id}
          data-toolbar-placement="inline"
          style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, gap }}
        >
          {divider && index > 0 ? divider : null}
          {item.inline}
        </span>
      ))}
      {overflowItems.length > 0 ? (
        <button
          ref={buttonRef}
          type="button"
          data-testid="notebook-toolbar-overflow"
          aria-label="More toolbar actions"
          title="More"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setOpen(value => !value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              focusMenuRef.current = true;
              setOpen(true);
            }
          }}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            width: overflowWidth,
            minWidth: overflowWidth,
            minHeight: 32,
            padding: 0,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'inherit',
            ...overflowButtonStyle,
          }}
        >
          <MoreHorizontal size={15} strokeWidth={2.1} aria-hidden />
          {overflowVariant === 'text' ? <span>More</span> : null}
        </button>
      ) : null}
      {menu}
    </div>
  );
}
