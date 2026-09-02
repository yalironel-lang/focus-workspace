import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  Highlighter,
  Baseline,
} from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  DEFAULT_NOTEBOOK_FONT_SIZE,
  FONT_SIZE_OPTIONS,
  HIGHLIGHT_PRESETS,
  TEXT_COLOR_PRESETS,
  fontSizeAtSelection,
  marksAtSelection,
  type InlineMark,
} from '../../lib/notebookInlineMarks';
import {
  computeToolbarAnchor,
  type NotebookSelectionState,
  type ToolbarCommand,
} from '../../lib/notebookSelectionToolbar';
import { getSelectionClientRect } from '../../lib/notebookCaret';
import { nbToolbarDebug } from '../../lib/notebookToolbarDebug';
import { NB_FORMAT_TOOLBAR_Z } from '../../lib/notebookToolbarLayers';
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

/**
 * Unified toolbar control: fire on pointerdown/mousedown with preventDefault
 * so the contenteditable never loses focus / selection before the command runs.
 * Do not use click — click runs after focus steal and collapses the browser selection.
 */
function ToolbarBtn({
  title,
  active,
  onAction,
  testId,
  children,
}: {
  title: string;
  active?: boolean;
  onAction: () => void;
  testId?: string;
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
      className="nb-toolbar-btn"
      title={title}
      tabIndex={-1}
      data-active={active ? 'true' : undefined}
      data-nb-toolbar-btn={testId}
      data-nb-toolbar-bold={testId === 'bold' ? '1' : undefined}
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

function ColorPicker({
  presets,
  onPick,
  label,
  icon,
  testId,
}: {
  presets: readonly string[];
  onPick: (c: string) => void;
  label: string;
  icon: React.ReactNode;
  testId: string;
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

  return (
    <div ref={ref} style={{ position: 'relative' }} data-nb-toolbar-btn={testId}>
      <button
        type="button"
        className="nb-toolbar-btn"
        title={label}
        tabIndex={-1}
        onPointerDownCapture={(e) => {
          preventToolbarEvent(e);
          setOpen(v => !v);
        }}
        onMouseDownCapture={(e) => {
          preventToolbarEvent(e);
          setOpen(v => !v);
        }}
      >
        {icon}
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
              onPointerDownCapture={(e) => {
                preventToolbarEvent(e);
                onPick(c);
                setOpen(false);
              }}
              onMouseDownCapture={(e) => {
                preventToolbarEvent(e);
                onPick(c);
                setOpen(false);
              }}
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
  const { start, end, marks, anchor, blockKind, scope } = selection;
  const active = marksAtSelection(marks, start, end);
  const fsInfo = fontSizeAtSelection(marks, start, end);
  const fsValue = fsInfo.mixed ? '' : (fsInfo.value || String(DEFAULT_NOTEBOOK_FONT_SIZE));
  const isDocumentScope = scope === 'document';
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const posRef = useRef({ top: anchor.top, left: anchor.left, width: anchor.width });

  const applyPosition = useCallback((next: { top: number; left: number; width: number }) => {
    posRef.current = next;
    const el = toolbarRef.current;
    if (!el) return;
    el.style.top = `${next.top}px`;
    el.style.left = `${next.left}px`;
    el.style.width = `${next.width}px`;
  }, []);

  const repositionFromLiveSelection = useCallback(() => {
    const el = toolbarRef.current;
    if (!el || leaving) return;
    const rect = getSelectionClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    const measuredH = Math.max(44, el.offsetHeight);
    const measuredW = Math.max(200, el.offsetWidth);
    const next = computeToolbarAnchor(rect, measuredW, measuredH);
    applyPosition(next);
  }, [applyPosition, leaving]);

  useLayoutEffect(() => {
    applyPosition({ top: anchor.top, left: anchor.left, width: anchor.width });
    // After first paint, remeasure real height (two-row wrap) and clear selection.
    requestAnimationFrame(() => repositionFromLiveSelection());
  }, [anchor.top, anchor.left, anchor.width, applyPosition, repositionFromLiveSelection]);

  useEffect(() => {
    const onScrollOrResize = () => repositionFromLiveSelection();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    // After formatting, selection geometry may change slightly — smooth follow.
    document.addEventListener('selectionchange', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('selectionchange', onScrollOrResize);
    };
  }, [repositionFromLiveSelection]);

  const requestDismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      onDismiss();
    }, 140);
  }, [leaving, onDismiss]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestDismiss();
    };
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-nb-format-toolbar="1"]')) return;
      requestDismiss();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    };
  }, [requestDismiss]);

  const run = useCallback(
    (cmd: ToolbarCommand) => {
      nbToolbarDebug('command dispatch', cmd);
      onCommand(cmd);
      // Geometry may change after marks — follow selection without touching offsets.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => repositionFromLiveSelection());
      });
    },
    [onCommand, repositionFromLiveSelection],
  );

  return createPortal(
    <>
      <div
        aria-hidden
        data-nb-toolbar-backdrop="1"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: NB_FORMAT_TOOLBAR_Z.backdrop,
          pointerEvents: 'none',
        }}
      />
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Text formatting"
        className={`nb-selection-toolbar${leaving ? ' nb-selection-toolbar--leave' : ''}`}
        data-nb-format-toolbar="1"
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          position: 'fixed',
          zIndex: NB_FORMAT_TOOLBAR_Z.toolbar,
          top: posRef.current.top,
          left: posRef.current.left,
          width: posRef.current.width,
          maxWidth: 'calc(100vw - 24px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 4,
          rowGap: 4,
          padding: '5px 7px',
          borderRadius: 10,
          border: `1px solid ${tokens.cardBorder}`,
          background: 'rgba(10, 14, 24, 0.96)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)',
          pointerEvents: leaving ? 'none' : 'auto',
          transition: 'top 120ms cubic-bezier(0.22, 1, 0.36, 1), left 120ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onPointerDownCapture={() => onToolbarPointerDown?.()}
        onPointerUpCapture={() => onToolbarPointerUp?.()}
        onPointerDown={() => onToolbarPointerDown?.()}
        onPointerUp={() => onToolbarPointerUp?.()}
      >
        <ToolbarBtn
          title="Bold"
          active={!!active.b}
          testId="bold"
          onAction={() => run({ type: 'toggleMark', mark: 'b' })}
        >
          <Bold size={14} strokeWidth={2.5} />
        </ToolbarBtn>
        <ToolbarBtn title="Italic" active={!!active.i} testId="italic" onAction={() => run({ type: 'toggleMark', mark: 'i' })}>
          <Italic size={14} strokeWidth={2.5} />
        </ToolbarBtn>
        <ToolbarBtn title="Underline" active={!!active.u} testId="underline" onAction={() => run({ type: 'toggleMark', mark: 'u' })}>
          <Underline size={14} strokeWidth={2.5} />
        </ToolbarBtn>
        <ToolbarBtn title="Strikethrough" active={!!active.s} testId="strike" onAction={() => run({ type: 'toggleMark', mark: 's' })}>
          <Strikethrough size={14} strokeWidth={2.5} />
        </ToolbarBtn>

        <div className="nb-toolbar-divider" />

        <select
          className="nb-toolbar-select"
          title={fsInfo.mixed ? 'Font size (mixed)' : 'Font size'}
          value={fsValue}
          data-nb-toolbar-btn="font-size"
          onPointerDown={(e) => {
            e.stopPropagation();
            onToolbarPointerDown?.();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onToolbarPointerDown?.();
          }}
          onChange={(e) => {
            const px = Number(e.target.value);
            if (!Number.isFinite(px)) return;
            run({ type: 'setFontSize', px });
          }}
        >
          {fsInfo.mixed ? (
            <option value="" disabled>
              Mixed
            </option>
          ) : null}
          {FONT_SIZE_OPTIONS.map(px => (
            <option key={px} value={px}>
              {px}px
            </option>
          ))}
        </select>

        <div className="nb-toolbar-divider" />

        <ColorPicker
          label="Text color"
          testId="text-color"
          presets={TEXT_COLOR_PRESETS}
          icon={<Baseline size={14} strokeWidth={2} />}
          onPick={(c) => run({ type: 'setTextColor', color: c })}
        />
        <ColorPicker
          label="Highlight"
          testId="highlight"
          presets={HIGHLIGHT_PRESETS}
          icon={<Highlighter size={14} strokeWidth={2} />}
          onPick={(c) => run({ type: 'setHighlight', color: c })}
        />

        <div className="nb-toolbar-divider" />

        {!isDocumentScope ? (
          <>
            <ToolbarBtn
              title="Paragraph"
              active={blockKind === 'paragraph' || blockKind == null}
              testId="paragraph"
              onAction={() => run({ type: 'morphBlock', target: 'paragraph' })}
            >
              <Pilcrow size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Heading 1"
              active={blockKind === 'title'}
              testId="h1"
              onAction={() => run({ type: 'morphBlock', target: 'title' })}
            >
              <Heading1 size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Heading 2"
              active={blockKind === 'section'}
              testId="h2"
              onAction={() => run({ type: 'morphBlock', target: 'section' })}
            >
              <Heading2 size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Quote"
              active={blockKind === 'quote'}
              testId="quote"
              onAction={() => run({ type: 'morphBlock', target: 'quote' })}
            >
              <Quote size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Callout"
              active={blockKind === 'callout'}
              testId="callout"
              onAction={() => run({ type: 'morphBlock', target: 'callout' })}
            >
              <MessageSquare size={14} strokeWidth={2} />
            </ToolbarBtn>

            <div className="nb-toolbar-divider" />

            <ToolbarBtn
              title="Bullet list"
              active={blockKind === 'bullet'}
              testId="bullet"
              onAction={() => run({ type: 'morphBlock', target: 'bullet' })}
            >
              <List size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Numbered list"
              active={blockKind === 'ordered'}
              testId="ordered"
              onAction={() => run({ type: 'morphBlock', target: 'ordered' })}
            >
              <ListOrdered size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn
              title="Checklist"
              active={blockKind === 'task'}
              testId="task"
              onAction={() => run({ type: 'morphBlock', target: 'task' })}
            >
              <ListChecks size={14} strokeWidth={2} />
            </ToolbarBtn>

            <div className="nb-toolbar-divider" />
          </>
        ) : null}

        <ToolbarBtn title="Copy" testId="copy" onAction={() => run({ type: 'copy' })}>
          <Copy size={14} strokeWidth={2} />
        </ToolbarBtn>
        {!isDocumentScope ? (
          <ToolbarBtn
            title="Duplicate selection"
            testId="duplicate"
            onAction={() => run({ type: 'duplicate' })}
          >
            <CopyPlus size={14} strokeWidth={2} />
          </ToolbarBtn>
        ) : null}
        <ToolbarBtn
          title="Clear formatting"
          testId="clear"
          onAction={() => run({ type: 'clearFormatting' })}
        >
          <Eraser size={14} strokeWidth={2} />
        </ToolbarBtn>
      </div>
    </>,
    document.body,
  );
}

export type { InlineMark };
