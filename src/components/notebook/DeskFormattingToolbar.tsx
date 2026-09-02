import { useCallback, useEffect, useRef } from 'react';
import { Bold, Eraser, Italic, Underline } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { FONT_SIZE_OPTIONS, marksAtSelection, DEFAULT_NOTEBOOK_FONT_SIZE } from '../../lib/notebookInlineMarks';
import type { NotebookSelectionState, ToolbarCommand } from '../../lib/notebookSelectionToolbar';
import { nbToolbarDebug } from '../../lib/notebookToolbarDebug';
import './notebookToolbar.css';
import './deskFormattingToolbar.css';

interface Props {
  tokens: AtmosphereTokens;
  selection: NotebookSelectionState;
  onCommand: (cmd: ToolbarCommand) => void;
  onDismiss: () => void;
  onToolbarPointerDown?: () => void;
  onToolbarPointerUp?: () => void;
}

function preventToolbarEvent(e: React.PointerEvent | React.MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

function preventToolbarContainerDefault(e: React.PointerEvent | React.MouseEvent): void {
  e.preventDefault();
}

function DeskToolbarBtn({
  title,
  active,
  onAction,
  children,
}: {
  title: string;
  active?: boolean;
  onAction: () => void;
  children: React.ReactNode;
}) {
  const actionGateRef = useRef(false);
  const fireActionOnce = () => {
    if (actionGateRef.current) return;
    actionGateRef.current = true;
    onAction();
    requestAnimationFrame(() => {
      actionGateRef.current = false;
    });
  };
  return (
    <button
      type="button"
      className="nb-toolbar-btn nb-desk-format-toolbar__btn"
      title={title}
      tabIndex={-1}
      data-active={active ? 'true' : undefined}
      onPointerDownCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireActionOnce();
      }}
      onMouseDownCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        fireActionOnce();
      }}
    >
      {children}
    </button>
  );
}

export function DeskFormattingToolbar({
  tokens,
  selection,
  onCommand,
  onDismiss,
  onToolbarPointerDown,
  onToolbarPointerUp,
}: Props) {
  const { start, end, marks } = selection;
  const active = marksAtSelection(marks, start, end);
  const fsValue = typeof active.fs === 'string' ? active.fs : String(DEFAULT_NOTEBOOK_FONT_SIZE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  const run = useCallback(
    (cmd: ToolbarCommand) => {
      nbToolbarDebug('desk-format command', cmd);
      onCommand(cmd);
    },
    [onCommand],
  );

  const onToolbarInteractionStart = (e: React.PointerEvent | React.MouseEvent) => {
    preventToolbarContainerDefault(e);
    onToolbarPointerDown?.();
  };

  const onToolbarInteractionEnd = () => {
    onToolbarPointerUp?.();
  };

  return (
    <div
      role="toolbar"
      aria-label="Desk text formatting"
      className="nb-desk-format-toolbar"
      data-nb-format-toolbar="1"
      contentEditable={false}
      suppressContentEditableWarning
      style={{
        borderBottom: `1px solid ${tokens.cardBorder}`,
        background: 'rgba(255, 252, 248, 0.92)',
      }}
      onMouseDownCapture={onToolbarInteractionStart}
      onPointerDownCapture={onToolbarInteractionStart}
      onMouseUpCapture={onToolbarInteractionEnd}
      onPointerUpCapture={onToolbarInteractionEnd}
      onPointerCancelCapture={onToolbarInteractionEnd}
    >
      <select
        className="nb-toolbar-select nb-desk-format-toolbar__size"
        title="Font size"
        aria-label="Font size"
        value={fsValue}
        onMouseDown={(e) => preventToolbarEvent(e)}
        onPointerDown={(e) => preventToolbarEvent(e)}
        onChange={(e) => run({ type: 'setFontSize', px: Number(e.target.value) })}
      >
        {FONT_SIZE_OPTIONS.map(px => (
          <option key={px} value={px}>
            {px}
          </option>
        ))}
      </select>

      <span className="nb-toolbar-divider nb-desk-format-toolbar__divider" aria-hidden />

      <DeskToolbarBtn title="Bold" active={!!active.b} onAction={() => run({ type: 'toggleMark', mark: 'b' })}>
        <Bold size={14} strokeWidth={2.5} />
      </DeskToolbarBtn>
      <DeskToolbarBtn title="Italic" active={!!active.i} onAction={() => run({ type: 'toggleMark', mark: 'i' })}>
        <Italic size={14} strokeWidth={2.5} />
      </DeskToolbarBtn>
      <DeskToolbarBtn title="Underline" active={!!active.u} onAction={() => run({ type: 'toggleMark', mark: 'u' })}>
        <Underline size={14} strokeWidth={2.5} />
      </DeskToolbarBtn>

      <span className="nb-toolbar-divider nb-desk-format-toolbar__divider" aria-hidden />

      <DeskToolbarBtn title="Clear formatting" onAction={() => run({ type: 'clearFormatting' })}>
        <Eraser size={14} strokeWidth={2} />
      </DeskToolbarBtn>
    </div>
  );
}
