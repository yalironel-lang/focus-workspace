/**
 * M6.4C / M7.7 — Contextual Table ▾ menu (structural commands only).
 * Portaled + viewport-clamped so it stays usable near iPad screen edges.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Table2 } from 'lucide-react';
import type { CandidateTableState } from '../../../lib/notebookTiptap/tableCommands';
import {
  TABLE_CONTEXT_MENU_ACTIONS,
  type TableMenuAction,
} from '../../../lib/notebookTiptap/candidateTableUi';
import { computeViewportAnchoredMenuPosition } from '../../../lib/notebookTiptap/viewportAnchoredMenu';

function holdSelection(event: React.MouseEvent | React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function isActionEnabled(state: CandidateTableState, action: TableMenuAction): boolean {
  if (!state.inTable) return false;
  if (!action.enableKey) return true;
  return Boolean(state[action.enableKey]);
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

export function NotebookTiptapCandidateTableMenu({
  open,
  state,
  onToggle,
  onClose,
  onAction,
  borderColor = 'rgba(255,255,255,0.12)',
}: {
  open: boolean;
  state: CandidateTableState;
  onToggle: () => void;
  onClose: () => void;
  onAction: (action: TableMenuAction) => void;
  borderColor?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const width = 188;
    const estimatedHeight = TABLE_CONTEXT_MENU_ACTIONS.length * 32 + 16;
    const next = computeViewportAnchoredMenuPosition({
      anchor: el.getBoundingClientRect(),
      menuWidth: width,
      menuHeight: estimatedHeight,
      minHeight: 100,
    });
    setPos({
      top: next.top,
      left: next.left,
      width,
      maxHeight: next.maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => reposition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.visualViewport?.addEventListener('resize', onReposition);
    window.visualViewport?.addEventListener('scroll', onReposition);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.visualViewport?.removeEventListener('resize', onReposition);
      window.visualViewport?.removeEventListener('scroll', onReposition);
    };
  }, [open, reposition]);

  if (!state.inTable) return null;

  const menu =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label="Table actions"
            data-nb-candidate-table-menu="1"
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              overflowY: 'auto',
              marginTop: 0,
              minWidth: 168,
              padding: 4,
              borderRadius: 8,
              background: 'rgba(10,14,24,0.98)',
              border: `1px solid ${borderColor}`,
              zIndex: 10070,
              boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              boxSizing: 'border-box',
            }}
          >
            {TABLE_CONTEXT_MENU_ACTIONS.map((action, index) => {
              const enabled = isActionEnabled(state, action);
              const prev = TABLE_CONTEXT_MENU_ACTIONS[index - 1];
              const showDivider = action.destructive && prev && !prev.destructive;
              return (
                <div key={action.cmd}>
                  {showDivider ? (
                    <div
                      role="separator"
                      style={{
                        height: 1,
                        margin: '4px 2px',
                        background: 'rgba(148,163,184,0.35)',
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!enabled}
                    title={action.title}
                    data-nb-candidate-table-action={action.cmd}
                    data-nb-candidate-table-destructive={action.destructive ? '1' : '0'}
                    onPointerDownCapture={holdSelection}
                    onMouseDownCapture={holdSelection}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!enabled) return;
                      onAction(action);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'start',
                      padding: '8px 10px',
                      minHeight: 36,
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: action.destructive ? '#fca5a5' : '#e2e8f0',
                      fontSize: 12,
                      fontWeight: action.cmd === 'deleteTable' ? 700 : 500,
                      cursor: enabled ? 'pointer' : 'not-allowed',
                      opacity: enabled ? 1 : 0.35,
                      touchAction: 'manipulation',
                    }}
                  >
                    {action.label}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} data-nb-candidate-table-controls="1">
      <button
        ref={triggerRef}
        type="button"
        className="nb-toolbar-btn"
        title="Table actions"
        aria-label="Table"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        data-nb-candidate-fmt="tableMenu"
        data-nb-candidate-table-menu-trigger="1"
        data-active={open ? 'true' : undefined}
        onPointerDownCapture={holdSelection}
        onMouseDownCapture={holdSelection}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        style={{
          minWidth: 64,
          gap: 3,
          fontSize: 11,
          fontWeight: 700,
          ...(open ? { background: 'rgba(56,189,248,0.18)' } : {}),
        }}
      >
        <Table2 size={13} strokeWidth={2.4} aria-hidden />
        Table
        <ChevronDown size={12} aria-hidden />
      </button>
      {menu}
    </div>
  );
}
