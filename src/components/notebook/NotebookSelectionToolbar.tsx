import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Copy,
  CopyPlus,
  Eraser,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Pilcrow,
  Heading1,
  Heading2,
  MessageSquare,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  FONT_SIZE_OPTIONS,
  HIGHLIGHT_PRESETS,
  TEXT_COLOR_PRESETS,
  marksAtSelection,
  type InlineMark,
} from '../../lib/notebookInlineMarks';
import type { NotebookSelectionState, ToolbarCommand } from '../../lib/notebookSelectionToolbar';
import { nbToolbarDebug } from '../../lib/notebookToolbarDebug';
import { nbAgentLog } from '../../lib/notebookDebugIngest';
import './notebookToolbar.css';

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

function ToolbarBtn({
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
  return (
    <button
      type="button"
      className="nb-toolbar-btn"
      title={title}
      tabIndex={-1}
      data-active={active ? 'true' : undefined}
      onMouseDownCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // #region agent log
        nbAgentLog(
          'NotebookSelectionToolbar:ToolbarBtn',
          'toolbar-mousedown-capture',
          {
            title,
            selectionText: window.getSelection()?.toString() ?? '',
            activeElement:
              document.activeElement instanceof HTMLElement
                ? document.activeElement.tagName
                : null,
            activeInContentEditable:
              document.activeElement instanceof HTMLElement &&
              (document.activeElement.isContentEditable ||
                !!document.activeElement.closest('[contenteditable="true"]')),
          },
          'A',
          'post-fix',
        );
        // #endregion
        onAction();
      }}
      onPointerDownCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}

function ColorPicker({
  presets,
  onPick,
  label,
}: {
  presets: readonly string[];
  onPick: (c: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggleOpen = (e: React.MouseEvent) => {
    preventToolbarEvent(e);
    setOpen(v => !v);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="nb-toolbar-btn"
        title={label}
        onMouseDown={toggleOpen}
        onPointerDown={preventToolbarEvent}
        style={{ fontSize: 10, fontWeight: 700 }}
      >
        A
      </button>
      {open ? (
        <div className="nb-color-popover">
          {presets.map(c => (
            <button
              key={c}
              type="button"
              className="nb-color-swatch"
              style={{ backgroundColor: c }}
              title={c}
              onMouseDown={(e) => {
                preventToolbarEvent(e);
                onPick(c);
                setOpen(false);
              }}
              onPointerDown={preventToolbarEvent}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NotebookSelectionToolbar({
  tokens,
  selection,
  onCommand,
  onDismiss,
  onToolbarPointerDown,
  onToolbarPointerUp,
}: Props) {
  const { start, end, marks, anchor } = selection;
  const active = marksAtSelection(marks, start, end);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.nb-selection-toolbar')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDocMouseDown, true);
    };
  }, [onDismiss]);

  const run = useCallback(
    (cmd: ToolbarCommand) => {
      nbToolbarDebug('command dispatch', cmd);
      onCommand(cmd);
    },
    [onCommand],
  );

  const fsValue = typeof active.fs === 'string' ? active.fs : '16';

  const onToolbarInteractionStart = (e: React.PointerEvent | React.MouseEvent) => {
    preventToolbarEvent(e);
    onToolbarPointerDown?.();
  };

  const onToolbarInteractionEnd = () => {
    onToolbarPointerUp?.();
  };

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Dismiss formatting toolbar"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10049,
          background: 'transparent',
          border: 'none',
          cursor: 'default',
        }}
        onMouseDown={(e) => {
          preventToolbarEvent(e);
          onDismiss();
        }}
        onPointerDown={(e) => {
          preventToolbarEvent(e);
          onDismiss();
        }}
      />
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="nb-selection-toolbar"
        data-nb-format-toolbar="1"
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          position: 'fixed',
          zIndex: 10050,
          top: anchor.top,
          left: anchor.left,
          width: anchor.width,
          maxWidth: 'calc(100vw - 24px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
          padding: '4px 6px',
          borderRadius: 10,
          border: `1px solid ${tokens.cardBorder}`,
          background: 'rgba(10, 14, 24, 0.96)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
        }}
        onMouseDownCapture={onToolbarInteractionStart}
        onPointerDownCapture={onToolbarInteractionStart}
        onMouseUpCapture={onToolbarInteractionEnd}
        onPointerUpCapture={onToolbarInteractionEnd}
        onPointerCancelCapture={onToolbarInteractionEnd}
      >
        <ToolbarBtn title="Bold" active={!!active.b} onAction={() => run({ type: 'toggleMark', mark: 'b' })}>
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarBtn>
        <ToolbarBtn title="Italic" active={!!active.i} onAction={() => run({ type: 'toggleMark', mark: 'i' })}>
          <Italic size={14} strokeWidth={2.5} />
        </ToolbarBtn>
        <ToolbarBtn title="Underline" active={!!active.u} onAction={() => run({ type: 'toggleMark', mark: 'u' })}>
          <Underline size={14} strokeWidth={2.5} />
        </ToolbarBtn>
        <ToolbarBtn title="Strikethrough" active={!!active.s} onAction={() => run({ type: 'toggleMark', mark: 's' })}>
          <Strikethrough size={14} strokeWidth={2.5} />
        </ToolbarBtn>

        <div className="nb-toolbar-divider" />

        <select
          className="nb-toolbar-select"
          title="Font size"
          value={fsValue}
          onMouseDown={(e) => preventToolbarEvent(e)}
          onPointerDown={(e) => preventToolbarEvent(e)}
          onChange={(e) => run({ type: 'setFontSize', px: Number(e.target.value) })}
        >
          {FONT_SIZE_OPTIONS.map(px => (
            <option key={px} value={px}>
              {px}px
            </option>
          ))}
        </select>

        <div className="nb-toolbar-divider" />

        <ColorPicker
          label="Text color"
          presets={TEXT_COLOR_PRESETS}
          onPick={(c) => run({ type: 'setTextColor', color: c })}
        />
        <ColorPicker
          label="Highlight"
          presets={HIGHLIGHT_PRESETS}
          onPick={(c) => run({ type: 'setHighlight', color: c })}
        />

        <div className="nb-toolbar-divider" />

        <ToolbarBtn title="Paragraph" onAction={() => run({ type: 'morphBlock', target: 'paragraph' })}>
          <Pilcrow size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 1" onAction={() => run({ type: 'morphBlock', target: 'title' })}>
          <Heading1 size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 2" onAction={() => run({ type: 'morphBlock', target: 'section' })}>
          <Heading2 size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Quote" onAction={() => run({ type: 'morphBlock', target: 'quote' })}>
          <Quote size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Callout" onAction={() => run({ type: 'morphBlock', target: 'callout' })}>
          <MessageSquare size={14} strokeWidth={2} />
        </ToolbarBtn>

        <div className="nb-toolbar-divider" />

        <ToolbarBtn title="Bullet list" onAction={() => run({ type: 'morphBlock', target: 'bullet' })}>
          <List size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list" onAction={() => run({ type: 'morphBlock', target: 'ordered' })}>
          <ListOrdered size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Checklist" onAction={() => run({ type: 'morphBlock', target: 'task' })}>
          <ListChecks size={14} strokeWidth={2} />
        </ToolbarBtn>

        <div className="nb-toolbar-divider" />

        <ToolbarBtn title="Copy" onAction={() => run({ type: 'copy' })}>
          <Copy size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Duplicate selection" onAction={() => run({ type: 'duplicate' })}>
          <CopyPlus size={14} strokeWidth={2} />
        </ToolbarBtn>
        <ToolbarBtn title="Clear formatting" onAction={() => run({ type: 'clearFormatting' })}>
          <Eraser size={14} strokeWidth={2} />
        </ToolbarBtn>
      </div>
    </>,
    document.body,
  );
}

export type { InlineMark };
