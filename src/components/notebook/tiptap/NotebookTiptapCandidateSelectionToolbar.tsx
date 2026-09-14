/**
 * M4.2 — Candidate floating formatting + block toolbar.
 * Commands live in candidateFormatCommands / candidateBlockCommands.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState } from '@tiptap/react';
import { posToDOMRect, type Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Sigma,
  Eraser,
  Highlighter,
  Baseline,
  Type,
  ChevronDown,
} from 'lucide-react';
import {
  DEFAULT_NOTEBOOK_FONT_SIZE,
  HIGHLIGHT_PRESETS,
  TEXT_COLOR_PRESETS,
} from '../../../lib/notebookInlineMarks';
import {
  computeToolbarAnchor,
  type ToolbarAnchor,
} from '../../../lib/notebookSelectionToolbar';
import { NB_FORMAT_TOOLBAR_Z } from '../../../lib/notebookToolbarLayers';
import {
  CANDIDATE_FONT_SIZE_PRESETS,
  readCandidateFormatState,
  runCandidateFormatCommand,
  type CandidateFormatCommand,
} from '../../../lib/notebookTiptap/candidateFormatCommands';
import {
  readCandidateBlockKind,
  runCandidateBlockCommand,
  type CandidateBlockTarget,
} from '../../../lib/notebookTiptap/candidateBlockCommands';
import '../notebookToolbar.css';
import { NotebookTiptapCandidateBlockPicker } from './NotebookTiptapCandidateBlockPicker';

export const candidateSelectionToolbarBusyRef = { current: false };

function preventToolbarEvent(e: React.PointerEvent | React.MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

function selectionShouldShowToolbar(editor: Editor): boolean {
  if (!editor.isEditable || editor.isDestroyed) return false;
  if (editor.state.selection instanceof NodeSelection) return false;
  const { empty, from, to } = editor.state.selection;
  return !empty && to > from;
}

function CaptureBtn({
  title,
  active,
  testId,
  onAction,
  children,
  style,
}: {
  title: string;
  active?: boolean;
  testId: string;
  onAction: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const gate = useRef(false);
  const fire = () => {
    if (gate.current) return;
    gate.current = true;
    onAction();
    requestAnimationFrame(() => {
      gate.current = false;
    });
  };
  return (
    <button
      type="button"
      className="nb-toolbar-btn"
      title={title}
      tabIndex={-1}
      data-active={active ? 'true' : undefined}
      data-nb-candidate-fmt={testId}
      style={style}
      onPointerDownCapture={e => {
        preventToolbarEvent(e);
        fire();
      }}
      onMouseDownCapture={e => {
        preventToolbarEvent(e);
        fire();
      }}
    >
      {children}
    </button>
  );
}

/** M4.1 gestures are deduplicated by event source, never by animation timing.
 * Keep CaptureBtn above unchanged for the existing M4.2 block controls. */
function useFormatCapture(onAction: () => void) {
  const pointerSeen = useRef(false);
  return {
    onPointerDownCapture: (e: React.PointerEvent) => {
      preventToolbarEvent(e);
      pointerSeen.current = true;
      if (e.button === 0) onAction();
    },
    onMouseDownCapture: (e: React.MouseEvent) => {
      preventToolbarEvent(e);
      if (!pointerSeen.current && e.button === 0) onAction();
    },
    onClick: (e: React.MouseEvent) => {
      preventToolbarEvent(e);
      if (e.detail === 0) onAction();
    },
  };
}

function FormatBtn({ title, active, testId, onAction, children, style }: Parameters<typeof CaptureBtn>[0]) {
  const capture = useFormatCapture(onAction);
  return (
    <button type="button" className="nb-toolbar-btn" title={title} aria-label={title}
      aria-pressed={active} data-active={active ? 'true' : undefined}
      data-nb-candidate-fmt={testId} style={style} {...capture}>
      {children}
    </button>
  );
}

function ColorSwatch({
  color,
  active,
  kind,
  onPick,
}: {
  color: string;
  active: boolean;
  kind: 'color' | 'highlight';
  onPick: () => void;
}) {
  const capture = useFormatCapture(onPick);
  return (
    <button
      type="button"
      className="nb-color-swatch"
      title={kind === 'color' ? `Text color ${color}` : `Highlight ${color}`}
      tabIndex={-1}
      data-nb-candidate-fmt={kind}
      data-nb-candidate-color={kind === 'color' ? color : undefined}
      data-nb-candidate-highlight={kind === 'highlight' ? color : undefined}
      style={{
        backgroundColor: color,
        outline: active ? '2px solid rgba(255,255,255,0.85)' : undefined,
      }}
      {...capture}
    />
  );
}

interface Props {
  editor: Editor;
  borderColor?: string;
}

type CmdDiag = {
  cmd: string;
  ok: boolean | null;
  skippedEmpty: boolean;
  beforeFrom: number;
  beforeTo: number;
  afterFrom: number;
  afterTo: number;
};

export function NotebookTiptapCandidateSelectionToolbar({
  editor,
  borderColor = 'rgba(255,255,255,0.12)',
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const storedSelRef = useRef<{ from: number; to: number } | null>(null);
  const [anchor, setAnchor] = useState<ToolbarAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [diag, setDiag] = useState({
    empty: true,
    from: 0,
    to: 0,
    focused: false,
    shouldShow: false,
  });
  const [cmdDiag, setCmdDiag] = useState<CmdDiag | null>(null);

  const fmt = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      ...readCandidateFormatState(ed),
      block: readCandidateBlockKind(ed),
    }),
  });

  const syncFromEditor = useCallback(() => {
    if (editor.isDestroyed) return;
    const { from, to, empty } = editor.state.selection;
    const focused = editor.view.hasFocus();
    const shouldShow = selectionShouldShowToolbar(editor);
    setDiag({ empty, from, to, focused, shouldShow });

    if (!shouldShow) {
      setOpen(false);
      setAnchor(null);
      setSizeOpen(false);
      setBlockOpen(false);
      return;
    }

    storedSelRef.current = { from, to };
    try {
      const rect = posToDOMRect(editor.view, from, to);
      let place = rect;
      if (rect.width === 0 && rect.height === 0) {
        const box = editor.view.dom.getBoundingClientRect();
        place = new DOMRect(box.left || 24, (box.top || 24) + 8, Math.max(box.width || 0, 160), 24);
      }
      setAnchor(computeToolbarAnchor(place, 520, 96));
      setOpen(true);
    } catch {
      setOpen(false);
      setAnchor(null);
    }
  }, [editor]);

  useEffect(() => {
    syncFromEditor();
    const onSel = () => syncFromEditor();
    const onBlur = ({ event }: { event: FocusEvent }) => {
      if (candidateSelectionToolbarBusyRef.current) return;
      const related = event.relatedTarget as Node | null;
      if (related && toolbarRef.current?.contains(related)) return;
      requestAnimationFrame(() => {
        if (candidateSelectionToolbarBusyRef.current) return;
        if (!selectionShouldShowToolbar(editor)) setOpen(false);
      });
    };
    editor.on('selectionUpdate', onSel);
    editor.on('transaction', onSel);
    editor.on('focus', onSel);
    editor.on('blur', onBlur);
    window.addEventListener('resize', onSel);
    window.addEventListener('scroll', onSel, true);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('transaction', onSel);
      editor.off('focus', onSel);
      editor.off('blur', onBlur);
      window.removeEventListener('resize', onSel);
      window.removeEventListener('scroll', onSel, true);
    };
  }, [editor, syncFromEditor]);

  useEffect(() => {
    if (!sizeOpen && !blockOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) {
        setSizeOpen(false);
        setBlockOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sizeOpen, blockOpen]);

  const releaseBusy = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        candidateSelectionToolbarBusyRef.current = false;
      });
    });
  }, []);

  const ensureSelection = useCallback(() => {
    candidateSelectionToolbarBusyRef.current = true;
    let before = editor.state.selection;
    if (before.empty && storedSelRef.current) {
      const { from, to } = storedSelRef.current;
      editor.chain().setTextSelection({ from, to }).run();
      before = editor.state.selection;
    }
    return before;
  }, [editor]);

  const runFmt = useCallback(
    (cmd: CandidateFormatCommand) => {
      const before = ensureSelection();
      if (before.empty) {
        setCmdDiag({
          cmd: cmd.type,
          ok: null,
          skippedEmpty: true,
          beforeFrom: before.from,
          beforeTo: before.to,
          afterFrom: before.from,
          afterTo: before.to,
        });
        releaseBusy();
        return;
      }
      storedSelRef.current = { from: before.from, to: before.to };
      const ok = runCandidateFormatCommand(editor, cmd);
      const after = editor.state.selection;
      if (!after.empty) storedSelRef.current = { from: after.from, to: after.to };
      setCmdDiag({
        cmd: cmd.type,
        ok,
        skippedEmpty: false,
        beforeFrom: before.from,
        beforeTo: before.to,
        afterFrom: after.from,
        afterTo: after.to,
      });
      releaseBusy();
      syncFromEditor();
    },
    [editor, ensureSelection, releaseBusy, syncFromEditor],
  );

  const runBlock = useCallback(
    (target: CandidateBlockTarget) => {
      const before = ensureSelection();
      if (before.empty) {
        releaseBusy();
        return;
      }
      const ok = runCandidateBlockCommand(editor, target);
      setCmdDiag({
        cmd: `block:${target}`,
        ok,
        skippedEmpty: false,
        beforeFrom: before.from,
        beforeTo: before.to,
        afterFrom: editor.state.selection.from,
        afterTo: editor.state.selection.to,
      });
      setBlockOpen(false);
      releaseBusy();
      syncFromEditor();
    },
    [editor, ensureSelection, releaseBusy, syncFromEditor],
  );

  const showToolbar = open && anchor != null;
  const sizeLabel = fmt.fontSizeMixed
    ? 'Mixed'
    : String(fmt.fontSizePx ?? DEFAULT_NOTEBOOK_FONT_SIZE);

  const toolbar =
    showToolbar && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label="Notebook text formatting"
            data-nb-candidate-selection-toolbar="1"
            data-nb-candidate-selection-toolbar-open="1"
            data-nb-tiptap-selection-toolbar="1"
            className="nb-selection-toolbar"
            style={{
              position: 'fixed',
              zIndex: NB_FORMAT_TOOLBAR_Z.toolbar,
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
              padding: '5px 7px',
              borderRadius: 10,
              border: `1px solid ${borderColor}`,
              background: 'rgba(10, 14, 24, 0.96)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(12px)',
              maxWidth: 'calc(100vw - 24px)',
              pointerEvents: 'auto',
            }}
            onMouseDown={e => {
              e.preventDefault();
              candidateSelectionToolbarBusyRef.current = true;
            }}
          >
            <FormatBtn title="Bold" testId="bold" active={fmt.bold} onAction={() => runFmt({ type: 'toggleBold' })}>
              <Bold size={14} strokeWidth={2.5} />
            </FormatBtn>
            <FormatBtn title="Italic" testId="italic" active={fmt.italic} onAction={() => runFmt({ type: 'toggleItalic' })}>
              <Italic size={14} strokeWidth={2.5} />
            </FormatBtn>
            <FormatBtn
              title="Underline"
              testId="underline"
              active={fmt.underline}
              onAction={() => runFmt({ type: 'toggleUnderline' })}
            >
              <Underline size={14} strokeWidth={2.5} />
            </FormatBtn>
            <FormatBtn title="Strike" testId="strike" active={fmt.strike} onAction={() => runFmt({ type: 'toggleStrike' })}>
              <Strikethrough size={14} strokeWidth={2.5} />
            </FormatBtn>
            <FormatBtn title="Math" testId="math" active={fmt.math} onAction={() => runFmt({ type: 'toggleMath' })}>
              <Sigma size={14} strokeWidth={2.5} />
            </FormatBtn>

            <div className="nb-toolbar-divider" />

            <div style={{ position: 'relative' }}>
              <FormatBtn
                title="Font size"
                testId="fontSize"
                active={!fmt.fontSizeMixed && fmt.fontSizePx != null}
                onAction={() => {
                  setBlockOpen(false);
                  setSizeOpen(v => !v);
                }}
                style={{ minWidth: 44, gap: 2, fontSize: 11, fontWeight: 700 }}
              >
                <Type size={12} strokeWidth={2.5} />
                {sizeLabel}
                <ChevronDown size={12} />
              </FormatBtn>
              {sizeOpen ? (
                <div
                  data-nb-candidate-fontsize-menu="1"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 6,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 4,
                    padding: 6,
                    borderRadius: 8,
                    background: 'rgba(10,14,24,0.98)',
                    border: `1px solid ${borderColor}`,
                    zIndex: 2,
                    minWidth: 160,
                  }}
                >
                  {CANDIDATE_FONT_SIZE_PRESETS.map(px => (
                    <FormatBtn
                      key={px}
                      title={`${px}px`}
                      testId={`fontSize-${px}`}
                      active={!fmt.fontSizeMixed && (fmt.fontSizePx ?? DEFAULT_NOTEBOOK_FONT_SIZE) === px}
                      onAction={() => {
                        runFmt({ type: 'setFontSize', px });
                        setSizeOpen(false);
                      }}
                      style={{ minWidth: 34, fontSize: 11, fontWeight: 700 }}
                    >
                      {px}
                    </FormatBtn>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="nb-toolbar-divider" />

            <span className="nb-toolbar-btn" style={{ pointerEvents: 'none', opacity: 0.7 }} aria-hidden>
              <Baseline size={14} />
            </span>
            {TEXT_COLOR_PRESETS.map(c => (
              <ColorSwatch
                key={`fg-${c}`}
                color={c}
                kind="color"
                active={!fmt.colorMixed && fmt.color === c}
                onPick={() => runFmt({ type: 'setTextColor', color: c })}
              />
            ))}

            <div className="nb-toolbar-divider" />

            <span className="nb-toolbar-btn" style={{ pointerEvents: 'none', opacity: 0.7 }} aria-hidden>
              <Highlighter size={14} />
            </span>
            {HIGHLIGHT_PRESETS.map(c => (
              <ColorSwatch
                key={`hl-${c}`}
                color={c}
                kind="highlight"
                active={!fmt.highlightMixed && fmt.highlight === c}
                onPick={() => runFmt({ type: 'setHighlight', color: c })}
              />
            ))}
            <FormatBtn title="Clear highlight" testId="clearHighlight" onAction={() => runFmt({ type: 'clearHighlight' })}>
              <span style={{ fontSize: 10, fontWeight: 700 }}>Clear highlight</span>
            </FormatBtn>

            <div className="nb-toolbar-divider" />

            <NotebookTiptapCandidateBlockPicker
              open={blockOpen}
              label={fmt.block?.label ?? 'Block'}
              onToggle={() => { setSizeOpen(false); setBlockOpen(value => !value); }}
              onClose={() => setBlockOpen(false)}
              onSelect={runBlock}
            />

            <div className="nb-toolbar-divider" />

            <FormatBtn title="Clear formatting" testId="clear" onAction={() => runFmt({ type: 'clearFormatting' })}>
              <Eraser size={14} strokeWidth={2} />
            </FormatBtn>
          </div>,
          document.body,
        )
      : null;

  const diagnostics =
    import.meta.env.DEV && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-nb-candidate-sel-diag="1"
            data-nb-candidate-sel-empty={diag.empty ? '1' : '0'}
            data-nb-candidate-sel-should-show={diag.shouldShow ? '1' : '0'}
            data-nb-candidate-sel-open={showToolbar ? '1' : '0'}
            data-nb-candidate-sel-from={String(diag.from)}
            data-nb-candidate-sel-to={String(diag.to)}
            data-nb-candidate-cmd={cmdDiag?.cmd ?? ''}
            data-nb-candidate-cmd-ok={
              cmdDiag == null ? '' : cmdDiag.skippedEmpty ? 'skipped-empty' : cmdDiag.ok ? '1' : '0'
            }
            title="DEV-only candidate selection toolbar diagnostics"
            style={{
              position: 'fixed',
              right: 10,
              bottom: 10,
              zIndex: NB_FORMAT_TOOLBAR_Z.toolbar + 1,
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 10,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              background: 'rgba(15,23,42,0.92)',
              color: '#e2e8f0',
              border: '1px solid rgba(148,163,184,0.35)',
              pointerEvents: 'none',
              maxWidth: 340,
              lineHeight: 1.45,
            }}
          >
            candidate toolbar · M4.2
            <br />
            empty={diag.empty ? 'yes' : 'no'} open={showToolbar ? 'yes' : 'no'} size=
            {sizeLabel}
            <br />
            from={diag.from} to={diag.to}
            <br />
            {cmdDiag
              ? `lastCmd=${cmdDiag.cmd} ok=${cmdDiag.skippedEmpty ? 'skipped-empty' : String(cmdDiag.ok)}`
              : 'lastCmd=(none)'}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {toolbar}
      {diagnostics}
    </>
  );
}
