import { useEffect, useId, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowInWorkspace: () => void;
};

export function MissionControlResourceMenu({ open, onOpenChange, onShowInWorkspace }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
        btnRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const menu = document.getElementById(menuId);
      if (menu?.contains(t)) return;
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [open, onOpenChange, menuId]);

  return (
    <div className="mc-row-menu-wrap">
      <button
        ref={btnRef}
        type="button"
        className="mc-row-menu-btn"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={e => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden />
      </button>
      {open && (
        <div id={menuId} className="mc-row-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={e => {
              e.stopPropagation();
              onOpenChange(false);
              onShowInWorkspace();
            }}
          >
            Show in Workspace
          </button>
        </div>
      )}
    </div>
  );
}
