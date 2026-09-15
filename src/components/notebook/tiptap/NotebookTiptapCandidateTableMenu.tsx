/**
 * M6.4C — Contextual Table ▾ menu (structural commands only).
 */

import { useId } from 'react';
import { ChevronDown, Table2 } from 'lucide-react';
import type { CandidateTableState } from '../../../lib/notebookTiptap/tableCommands';
import {
  TABLE_CONTEXT_MENU_ACTIONS,
  type TableMenuAction,
} from '../../../lib/notebookTiptap/candidateTableUi';

function holdSelection(event: React.MouseEvent | React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function isActionEnabled(state: CandidateTableState, action: TableMenuAction): boolean {
  if (!state.inTable) return false;
  if (!action.enableKey) return true;
  return Boolean(state[action.enableKey]);
}

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
  if (!state.inTable) return null;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} data-nb-candidate-table-controls="1">
      <button
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
      {open ? (
        <div
          id={id}
          role="menu"
          aria-label="Table actions"
          data-nb-candidate-table-menu="1"
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 168,
            padding: 4,
            borderRadius: 8,
            background: 'rgba(10,14,24,0.98)',
            border: `1px solid ${borderColor}`,
            zIndex: 3,
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {TABLE_CONTEXT_MENU_ACTIONS.map((action, index) => {
            const enabled = isActionEnabled(state, action);
            const prev = TABLE_CONTEXT_MENU_ACTIONS[index - 1];
            const showDivider =
              action.destructive && prev && !prev.destructive;
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
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: action.destructive ? '#fca5a5' : '#e2e8f0',
                    fontSize: 12,
                    fontWeight: action.cmd === 'deleteTable' ? 700 : 500,
                    cursor: enabled ? 'pointer' : 'not-allowed',
                    opacity: enabled ? 1 : 0.35,
                  }}
                >
                  {action.label}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
