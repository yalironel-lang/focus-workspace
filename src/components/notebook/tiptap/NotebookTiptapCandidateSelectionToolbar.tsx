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
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { sanitizeUrl } from '../../../lib/urlSanitizer';
import { openNotebookLink } from '../../../lib/notebookTiptap/openNotebookLink';
import {
  shouldShowExplainAction,
  useExplainSelectionController,
  type ExplainHost,
} from '../../../lib/ai/explainSelection';
import { NotebookExplainSelectionPanel } from './NotebookExplainSelectionPanel';
import { nbP0Bump } from '../../../lib/notebookP0Forensics';
import {
  DEFAULT_NOTEBOOK_FONT_SIZE,
  HIGHLIGHT_PRESETS,
  TEXT_COLOR_PRESETS,
} from '../../../lib/notebookInlineMarks';
import {
  computeToolbarAnchor,
  type ToolbarAnchor,
} from '../../../lib/notebookSelectionToolbar';
import { computeViewportAnchoredMenuPosition } from '../../../lib/notebookTiptap/viewportAnchoredMenu';
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
import {
  isSelectionInsideTable,
  readCandidateTableState,
  runCandidateTableCommand,
  type CandidateTableCommand,
} from '../../../lib/notebookTiptap/tableCommands';
import type { TableMenuAction } from '../../../lib/notebookTiptap/candidateTableUi';
import { isNotebookEngineeringChromeEnabled } from '../../../lib/notebookTiptap/featureFlag';
import '../notebookToolbar.css';
import { NotebookTiptapCandidateBlockPicker } from './NotebookTiptapCandidateBlockPicker';
import { NotebookTiptapCandidateTableSizePicker } from './NotebookTiptapCandidateTableSizePicker';
import { NotebookTiptapCandidateTableMenu } from './NotebookTiptapCandidateTableMenu';

export const candidateSelectionToolbarBusyRef = { current: false };

/**
 * Product Escape path while the floating toolbar is open.
 * CandidateEditor wires this into ProseMirror `handleKeyDown` so Escape still
 * dismisses when focus is inside the editor (window capture alone is not enough
 * if a lower-level handler swallows the DOM event after capture).
 * Returns true when Escape was handled (toolbar dismissed).
 */
export const candidateFloatingToolbarEscapeRef: {
  current: ((event: KeyboardEvent) => boolean) | null;
} = { current: null };

function preventToolbarEvent(e: React.PointerEvent | React.MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

/** Selection toolbar: non-empty text range, whole-table NodeSelection, or in-table context.
 * Collapsed typing carets in normal prose/callouts do NOT summon the toolbar (M7.4A contract). */
export function selectionShouldShowToolbar(editor: Editor): boolean {
  if (!editor.isEditable || editor.isDestroyed) return false;
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) {
    return selection.node.type.name === 'nbTable';
  }
  const { empty, from, to } = selection;
  // Real non-empty text selection (mouse drag or Shift+Arrow).
  if (!empty && to > from) return true;
  // Table ▾ context while the caret is inside a cell (pre-existing table UX).
  if (isSelectionInsideTable(editor)) return true;
  return false;
}

const CONVERTIBLE_TEXTBLOCK_TYPES = new Set([
  'nbParagraph',
  'nbTitle',
  'nbSection',
  'nbBullet',
  'nbOrdered',
  'nbTask',
  'nbQuote',
  'nbStep',
  'nbMath',
  'nbCallout',
]);

/** Parent textblock can be morph'd by Turn into (CONVERT). Not a visibility rule. */
export function isConvertibleTextblockSelection(editor: Editor): boolean {
  if (editor.isDestroyed) return false;
  const parent = editor.state.selection.$from.parent;
  return parent.isTextblock && CONVERTIBLE_TEXTBLOCK_TYPES.has(parent.type.name);
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

function FormatBtn({
  title,
  active,
  testId,
  onAction,
  children,
  style,
  disabled,
}: Parameters<typeof CaptureBtn>[0] & { disabled?: boolean }) {
  const capture = useFormatCapture(onAction);
  return (
    <button
      type="button"
      className="nb-toolbar-btn"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      data-active={active ? 'true' : undefined}
      data-nb-candidate-fmt={testId}
      style={{
        ...style,
        ...(disabled ? { opacity: 0.35, pointerEvents: 'none' } : {}),
      }}
      {...(disabled ? {} : capture)}
    >
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
  /** Active page identity — invalidates Explain when the page changes. */
  pageKey?: string;
  /** Host identity for M0.1 capture; null → Explain cannot call the gateway. */
  aiHost?: ExplainHost | null;
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
  pageKey = 'legacy-body',
  aiHost = null,
  borderColor = 'rgba(255,255,255,0.12)',
}: Props) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const storedSelRef = useRef<{ from: number; to: number } | null>(null);
  /**
   * Range captured when the Link popover opens. Survives input-focus / outside
   * blur collapsing the live ProseMirror selection so Apply/Save still targets
   * the text the student originally selected (M7.5B product contract).
   */
  const linkRangeRef = useRef<{ from: number; to: number } | null>(null);
  const linkOpenRef = useRef(false);
  /**
   * After Turn into / Escape / outside dismiss, block syncFromEditor from reopening
   * for the *same* range (M7.4A). Cleared on editor pointerdown or when the
   * selection actually changes from the dismissed snapshot.
   */
  const suppressAutoOpenRef = useRef(false);
  const dismissedSelRef = useRef<{ from: number; to: number } | null>(null);
  /**
   * While the primary pointer is down in the editor (selection drag), defer
   * opening/repositioning so the toolbar does not jump during the drag.
   * Keyboard selections are unaffected (pointerSelecting stays false).
   */
  const pointerSelectingRef = useRef(false);
  const [anchor, setAnchor] = useState<ToolbarAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  /** Mirror open chrome for scroll/resize handlers without setState on every wheel tick. */
  const floatingChromeOpenRef = useRef(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkTriggerRef = useRef<HTMLDivElement | null>(null);
  const tableInsertTriggerRef = useRef<HTMLDivElement | null>(null);
  const [linkPos, setLinkPos] = useState<{ top: number; left: number; width: number } | null>(null);
  /** Preserve caret/selection inside the intended table while the Table menu is open. */
  const tableTargetPosRef = useRef<number | null>(null);
  const [diag, setDiag] = useState({
    empty: true,
    from: 0,
    to: 0,
    focused: false,
    shouldShow: false,
  });
  const [cmdDiag, setCmdDiag] = useState<CmdDiag | null>(null);

  const {
    state: explainState,
    activateExplain,
    retry: retryExplain,
    close: closeExplain,
    isOpen: explainOpen,
  } = useExplainSelectionController({
    editor,
    host: aiHost ?? null,
    pageKey,
  });
  const explainOpenRef = useRef(false);
  explainOpenRef.current = explainOpen;

  // Keep scroll/resize handlers O(1) when floating chrome is closed (Designer-closed scroll path).
  floatingChromeOpenRef.current =
    open || linkOpen || sizeOpen || blockOpen || tablePickerOpen || tableMenuOpen;

  const fmt = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      ...readCandidateFormatState(ed),
      block: readCandidateBlockKind(ed),
      table: readCandidateTableState(ed),
    }),
  });

  const closeMenus = useCallback(() => {
    setSizeOpen(false);
    setBlockOpen(false);
    setLinkOpen(false);
    linkOpenRef.current = false;
    setLinkPos(null);
    setTablePickerOpen(false);
    setTableMenuOpen(false);
  }, []);

  const repositionLinkPopover = useCallback(() => {
    const el = linkTriggerRef.current;
    if (!el) return;
    const width = 280;
    const next = computeViewportAnchoredMenuPosition({
      anchor: el.getBoundingClientRect(),
      menuWidth: width,
      menuHeight: 96,
      minHeight: 72,
    });
    setLinkPos({ top: next.top, left: next.left, width });
  }, []);

  useEffect(() => {
    if (!linkOpen) {
      setLinkPos(null);
      return;
    }
    repositionLinkPopover();
    const onReposition = () => repositionLinkPopover();
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
  }, [linkOpen, repositionLinkPopover]);

  const dismissToolbar = useCallback(
    (opts?: { suppressReopen?: boolean }) => {
      closeExplain();
      if (opts?.suppressReopen) {
        suppressAutoOpenRef.current = true;
        if (!editor.isDestroyed) {
          const { from, to } = editor.state.selection;
          dismissedSelRef.current = { from, to };
        }
      }
      setOpen(false);
      setAnchor(null);
      closeMenus();
    },
    [closeMenus, closeExplain, editor],
  );

  const syncFromEditor = useCallback((source: 'editor' | 'scroll' | 'resize' = 'editor') => {
    if (editor.isDestroyed) return;
    // Scroll/resize only need to reposition visible floating chrome.
    // Idle closed path must not setState on every wheel tick — with sticky product
    // toolbar + study-page overflow:visible this was a main-thread lock (Page Unresponsive).
    if (
      (source === 'scroll' || source === 'resize') &&
      !floatingChromeOpenRef.current
    ) {
      return;
    }
    nbP0Bump('selectionToolbarSyncs');
    if (source === 'scroll') nbP0Bump('selectionToolbarScrollSyncs');
    const { from, to, empty } = editor.state.selection;
    const focused = editor.view.hasFocus();
    const shouldShow = selectionShouldShowToolbar(editor);
    setDiag(prev =>
      prev.empty === empty &&
      prev.from === from &&
      prev.to === to &&
      prev.focused === focused &&
      prev.shouldShow === shouldShow
        ? prev
        : { empty, from, to, focused, shouldShow },
    );

    if (!empty) {
      storedSelRef.current = { from, to };
      if (linkOpenRef.current) {
        linkRangeRef.current = { from, to };
      }
    }

    if (!shouldShow) {
      // M7.5B: while the Link popover is open, keep the floating toolbar mounted
      // even if focusing the URL input collapsed the live selection. Apply/Save
      // restores linkRangeRef / storedSelRef. Do not summon the toolbar for a
      // caret alone when the popover is closed (M7.4A unchanged).
      if (linkOpenRef.current) {
        return;
      }
      setOpen(false);
      setAnchor(null);
      closeMenus();
      return;
    }

    // Mouse selection still in progress — wait for pointerup before showing/moving.
    if (pointerSelectingRef.current) {
      setOpen(false);
      setAnchor(null);
      closeMenus();
      return;
    }

    if (suppressAutoOpenRef.current) {
      const snap = dismissedSelRef.current;
      const selectionChanged = !snap || snap.from !== from || snap.to !== to;
      if (!selectionChanged) {
        // Same range as when dismissed (Escape / convert) — stay closed.
        setOpen(false);
        setAnchor(null);
        closeMenus();
        return;
      }
      // User made a genuinely new selection after dismiss — allow toolbar again.
      suppressAutoOpenRef.current = false;
      dismissedSelRef.current = null;
    }

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
  }, [editor, closeMenus]);

  useEffect(() => {
    syncFromEditor();
    const onSel = () => syncFromEditor('editor');
    const onScrollSel = () => syncFromEditor('scroll');
    const onResizeSel = () => syncFromEditor('resize');
    const onBlur = ({ event }: { event: FocusEvent }) => {
      if (candidateSelectionToolbarBusyRef.current) return;
      if (linkOpenRef.current) return;
      if (explainOpenRef.current) return;
      const related = event.relatedTarget as Node | null;
      if (related && toolbarRef.current?.contains(related)) return;
      requestAnimationFrame(() => {
        if (candidateSelectionToolbarBusyRef.current) return;
        if (linkOpenRef.current) return;
        if (explainOpenRef.current) return;
        if (!selectionShouldShowToolbar(editor)) {
          setOpen(false);
          setAnchor(null);
          closeMenus();
        }
      });
    };
    // After dismiss/convert, a later click in the editor allows the toolbar again
    // once a (possibly new) selection qualifies.
    const onEditorPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerSelectingRef.current = true;
      if (suppressAutoOpenRef.current) {
        suppressAutoOpenRef.current = false;
        dismissedSelRef.current = null;
      }
    };
    const endPointerSelecting = () => {
      if (!pointerSelectingRef.current) return;
      pointerSelectingRef.current = false;
      syncFromEditor();
    };
    const editorDom = editor.isDestroyed ? null : editor.view?.dom ?? null;
    editor.on('selectionUpdate', onSel);
    editor.on('transaction', onSel);
    editor.on('focus', onSel);
    editor.on('blur', onBlur);
    editorDom?.addEventListener('pointerdown', onEditorPointerDown);
    // pointerup may land outside the editor after a drag.
    window.addEventListener('pointerup', endPointerSelecting, true);
    window.addEventListener('pointercancel', endPointerSelecting, true);
    window.addEventListener('resize', onResizeSel);
    window.addEventListener('scroll', onScrollSel, true);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('transaction', onSel);
      editor.off('focus', onSel);
      editor.off('blur', onBlur);
      editorDom?.removeEventListener('pointerdown', onEditorPointerDown);
      window.removeEventListener('pointerup', endPointerSelecting, true);
      window.removeEventListener('pointercancel', endPointerSelecting, true);
      window.removeEventListener('resize', onResizeSel);
      window.removeEventListener('scroll', onScrollSel, true);
    };
  }, [editor, syncFromEditor, closeMenus]);

  // Escape + outside click dismiss the whole floating toolbar (not only nested menus).
  // Dual path: (1) window capture for focus in portaled Turn into / menus / chrome;
  // (2) ProseMirror handleKeyDown via candidateFloatingToolbarEscapeRef when caret is in the editor.
  useEffect(() => {
    if (!open && !explainOpen) {
      candidateFloatingToolbarEscapeRef.current = null;
      return;
    }
    const handleEscape = (e: KeyboardEvent): boolean => {
      if (e.key !== 'Escape' && e.code !== 'Escape') return false;
      e.preventDefault();
      e.stopPropagation();
      if (explainOpenRef.current) {
        closeExplain();
        return true;
      }
      dismissToolbar({ suppressReopen: true });
      // Do not re-focus — same selection must stay suppressed until a deliberate edit gesture.
      return true;
    };
    candidateFloatingToolbarEscapeRef.current = handleEscape;

    const isToolbarChrome = (t: EventTarget | null) => {
      if (!(t instanceof Node)) return false;
      if (toolbarRef.current?.contains(t)) return true;
      if (
        t instanceof Element &&
        (t.closest('[data-nb-candidate-block-menu]') ||
          t.closest('[data-nb-candidate-table-size-picker]') ||
          t.closest('[data-nb-candidate-table-menu]') ||
          // M7.7: link popover is portaled to document.body (viewport clamp).
          // Must be treated as chrome or pointerdown dismisses before Apply/Open click.
          t.closest('[data-nb-candidate-link-popover]') ||
          t.closest('[data-nb-candidate-explain-panel]'))
      ) {
        return true;
      }
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      handleEscape(e);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (isToolbarChrome(e.target)) return;
      // Click elsewhere in the Notebook / UI → dismiss; don't reopen on same selection.
      dismissToolbar({ suppressReopen: true });
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      if (candidateFloatingToolbarEscapeRef.current === handleEscape) {
        candidateFloatingToolbarEscapeRef.current = null;
      }
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, explainOpen, dismissToolbar, closeExplain]);

  useEffect(() => {
    if (!sizeOpen && !blockOpen && !linkOpen && !tablePickerOpen && !tableMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (toolbarRef.current?.contains(t)) return;
      // Portaled Turn into / table / link menus live on document.body.
      if (
        t instanceof Element &&
        (t.closest('[data-nb-candidate-block-menu]') ||
          t.closest('[data-nb-candidate-table-size-picker]') ||
          t.closest('[data-nb-candidate-table-menu]') ||
          t.closest('[data-nb-candidate-link-popover]'))
      ) {
        return;
      }
      closeMenus();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sizeOpen, blockOpen, linkOpen, tablePickerOpen, tableMenuOpen, closeMenus]);

  useEffect(() => {
    if (linkOpen) {
      // Snapshot again right before focus — autofocus must not lose the target range.
      const { from, to, empty } = editor.state.selection;
      if (!empty && to > from) {
        linkRangeRef.current = { from, to };
        storedSelRef.current = { from, to };
      }
      setTimeout(() => {
        linkInputRef.current?.focus();
        linkInputRef.current?.select();
      }, 50);
    }
  }, [linkOpen, editor]);

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
    const preferred =
      (linkOpenRef.current && linkRangeRef.current) || storedSelRef.current;
    if (before.empty && preferred && preferred.to > preferred.from) {
      editor.chain().focus().setTextSelection({ from: preferred.from, to: preferred.to }).run();
      before = editor.state.selection;
    }
    return before;
  }, [editor]);

  const restoreLinkTargetSelection = useCallback(() => {
    candidateSelectionToolbarBusyRef.current = true;
    const preferred = linkRangeRef.current ?? storedSelRef.current;
    if (preferred && preferred.to > preferred.from) {
      editor.chain().focus().setTextSelection({ from: preferred.from, to: preferred.to }).run();
    }
    return editor.state.selection;
  }, [editor]);

  const runFmt = useCallback(
    (cmd: CandidateFormatCommand) => {
      const before = ensureSelection();
      const isAllowedEmpty =
        cmd.type === 'setAlignment' ||
        ((cmd.type === 'applyLink' || cmd.type === 'removeLink') && editor.isActive('link'));
      if (before.empty && !isAllowedEmpty) {
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
        return false;
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
      return ok;
    },
    [editor, ensureSelection, releaseBusy, syncFromEditor],
  );

  const toggleLinkPopover = useCallback(() => {
    if (linkOpen) {
      linkOpenRef.current = false;
      setLinkOpen(false);
      setLinkError(null);
      return;
    }
    setSizeOpen(false);
    setBlockOpen(false);
    setTablePickerOpen(false);
    setTableMenuOpen(false);
    const { from, to, empty } = editor.state.selection;
    if (!empty && to > from) {
      storedSelRef.current = { from, to };
      linkRangeRef.current = { from, to };
    } else if (storedSelRef.current) {
      linkRangeRef.current = { ...storedSelRef.current };
    } else {
      linkRangeRef.current = null;
    }
    const editing = fmt.link;
    setIsEditingLink(editing);
    setLinkUrl(editing ? (fmt.linkHref ?? '') : '');
    setLinkError(null);
    linkOpenRef.current = true;
    setLinkOpen(true);
  }, [linkOpen, fmt.link, fmt.linkHref, editor]);

  const handleApplyLink = useCallback(() => {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setLinkError('Please enter a URL');
      return;
    }
    const sanitized = sanitizeUrl(trimmed);
    if (!sanitized) {
      setLinkError('Invalid URL (http(s), mailto:, tel:, /path, or #anchor)');
      return;
    }
    const before = restoreLinkTargetSelection();
    if (before.empty && !editor.isActive('link')) {
      setLinkError('Select text to link, then Apply');
      releaseBusy();
      return;
    }
    const ok = runCandidateFormatCommand(editor, { type: 'applyLink', href: sanitized });
    setCmdDiag({
      cmd: 'applyLink',
      ok,
      skippedEmpty: false,
      beforeFrom: before.from,
      beforeTo: before.to,
      afterFrom: editor.state.selection.from,
      afterTo: editor.state.selection.to,
    });
    if (!ok) {
      setLinkError('Could not apply link — reselect the text and try again');
      releaseBusy();
      return;
    }
    linkOpenRef.current = false;
    setLinkOpen(false);
    setLinkError(null);
    releaseBusy();
    // Keep the linked range selected so the mark + chrome are immediately visible.
    const applied = linkRangeRef.current ?? storedSelRef.current;
    if (applied && applied.to > applied.from) {
      editor.chain().focus().setTextSelection(applied).run();
      storedSelRef.current = applied;
    } else {
      editor.commands.focus();
    }
    syncFromEditor();
  }, [editor, linkUrl, restoreLinkTargetSelection, releaseBusy, syncFromEditor]);

  const handleOpenLink = useCallback(() => {
    const raw = linkUrl.trim() || fmt.linkHref || '';
    // Sanitize first so Open Link never forwards an unsafe raw string.
    const sanitized = sanitizeUrl(raw);
    if (!sanitized) {
      setLinkError('Invalid or unsafe URL — cannot open');
      return;
    }
    const ok = openNotebookLink(sanitized);
    if (!ok) {
      setLinkError('Invalid or unsafe URL — cannot open');
    }
  }, [linkUrl, fmt.linkHref]);

  const handleRemoveLink = useCallback(() => {
    restoreLinkTargetSelection();
    const ok = runCandidateFormatCommand(editor, { type: 'removeLink' });
    if (!ok) {
      setLinkError('Could not remove link — reselect the linked text');
      releaseBusy();
      return;
    }
    linkOpenRef.current = false;
    setLinkOpen(false);
    setLinkError(null);
    releaseBusy();
    editor.commands.focus();
    syncFromEditor();
  }, [editor, restoreLinkTargetSelection, releaseBusy, syncFromEditor]);

  const handleCancelLink = useCallback(() => {
    linkOpenRef.current = false;
    setLinkOpen(false);
    setLinkError(null);
    editor.commands.focus();
    syncFromEditor();
  }, [editor, syncFromEditor]);

  /** Fire link actions on pointerdown (like FormatBtn) so they match Enter and
   * survive before click — still requires portaled popover to be chrome. */
  const linkApplyCapture = useFormatCapture(handleApplyLink);
  const linkOpenCapture = useFormatCapture(handleOpenLink);
  const linkRemoveCapture = useFormatCapture(handleRemoveLink);
  const linkCancelCapture = useFormatCapture(handleCancelLink);

  const runBlock = useCallback(
    (target: CandidateBlockTarget) => {
      candidateSelectionToolbarBusyRef.current = true;
      // CONVERT the live caret/range parent — do NOT restore a prior text range
      // (that would morph the wrong block) and never call insertCandidateBlockAtTarget.
      if (!isConvertibleTextblockSelection(editor)) {
        setCmdDiag({
          cmd: `block:${target}`,
          ok: false,
          skippedEmpty: true,
          beforeFrom: editor.state.selection.from,
          beforeTo: editor.state.selection.to,
          afterFrom: editor.state.selection.from,
          afterTo: editor.state.selection.to,
        });
        releaseBusy();
        return;
      }
      const before = editor.state.selection;
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
      // One-shot: close Turn into + dismiss floating toolbar; suppress same-range reopen.
      dismissToolbar({ suppressReopen: true });
      try {
        editor.commands.focus();
      } catch {
        /* best-effort */
      }
      releaseBusy();
      syncFromEditor();
    },
    [editor, dismissToolbar, releaseBusy, syncFromEditor],
  );

  const restoreTableTargetSelection = useCallback(() => {
    candidateSelectionToolbarBusyRef.current = true;
    const pos = tableTargetPosRef.current;
    if (pos != null && pos >= 0 && pos <= editor.state.doc.content.size) {
      try {
        editor.chain().focus().setTextSelection(pos).run();
      } catch {
        editor.commands.focus();
      }
    } else {
      editor.commands.focus();
    }
  }, [editor]);

  const runTableInsert = useCallback(
    (cols: number, rows: number) => {
      const before = ensureSelection();
      const cmd: CandidateTableCommand = { type: 'insertTable', rows, cols };
      const ok = runCandidateTableCommand(editor, cmd);
      setCmdDiag({
        cmd: `table:insertTable:${rows}x${cols}`,
        ok,
        skippedEmpty: false,
        beforeFrom: before.from,
        beforeTo: before.to,
        afterFrom: editor.state.selection.from,
        afterTo: editor.state.selection.to,
      });
      dismissToolbar({ suppressReopen: true });
      releaseBusy();
      syncFromEditor();
    },
    [editor, dismissToolbar, ensureSelection, releaseBusy, syncFromEditor],
  );

  const runTableAction = useCallback(
    (action: TableMenuAction) => {
      restoreTableTargetSelection();
      const before = editor.state.selection;
      const cmd: CandidateTableCommand = { type: action.cmd };
      const ok = runCandidateTableCommand(editor, cmd);
      setCmdDiag({
        cmd: `table:${action.cmd}`,
        ok,
        skippedEmpty: false,
        beforeFrom: before.from,
        beforeTo: before.to,
        afterFrom: editor.state.selection.from,
        afterTo: editor.state.selection.to,
      });
      setTableMenuOpen(false);
      releaseBusy();
      syncFromEditor();
    },
    [editor, releaseBusy, restoreTableTargetSelection, syncFromEditor],
  );

  const handleExplain = useCallback(() => {
    if (explainState.phase === 'loading') return;
    candidateSelectionToolbarBusyRef.current = true;
    ensureSelection();
    activateExplain();
    releaseBusy();
  }, [activateExplain, ensureSelection, explainState.phase, releaseBusy]);

  const showToolbar = open && anchor != null;
  const showExplain = showToolbar && shouldShowExplainAction(editor);
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
              if ((e.target as HTMLElement).tagName !== 'INPUT') {
                e.preventDefault();
              }
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
            {showExplain ? (
              <FormatBtn
                title="Explain · Beta"
                testId="explain"
                active={explainOpen}
                disabled={explainState.phase === 'loading'}
                onAction={handleExplain}
              >
                <Sparkles size={14} strokeWidth={2.5} />
              </FormatBtn>
            ) : null}

            <div ref={linkTriggerRef} style={{ position: 'relative' }}>
              <FormatBtn
                title={fmt.link ? 'Edit link' : 'Insert link'}
                testId="link"
                active={fmt.link}
                disabled={!fmt.canLink}
                onAction={toggleLinkPopover}
              >
                <Link2 size={14} strokeWidth={2.5} />
              </FormatBtn>
              {linkOpen && linkPos && typeof document !== 'undefined'
                ? createPortal(
                    <div
                      data-nb-candidate-link-popover="1"
                      style={{
                        position: 'fixed',
                        top: linkPos.top,
                        left: linkPos.left,
                        width: linkPos.width,
                        marginTop: 0,
                        padding: 8,
                        borderRadius: 8,
                        background: 'rgba(10,14,24,0.98)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        zIndex: NB_FORMAT_TOOLBAR_Z.toolbar + 20,
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 260,
                        boxSizing: 'border-box',
                      }}
                      onMouseDown={e => {
                        // Keep the original text selection intact for Apply/Save/Remove.
                        // Allow the URL <input> to take focus (do not preventDefault on it).
                        e.stopPropagation();
                        const tag = (e.target as HTMLElement | null)?.tagName;
                        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                          e.preventDefault();
                        } else if (!editor.isDestroyed) {
                          const { from, to, empty } = editor.state.selection;
                          if (!empty && to > from) {
                            linkRangeRef.current = { from, to };
                            storedSelRef.current = { from, to };
                          }
                        }
                        candidateSelectionToolbarBusyRef.current = true;
                      }}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <input
                        ref={linkInputRef}
                        data-nb-candidate-link-input="1"
                        type="text"
                        dir="ltr"
                        value={linkUrl}
                        placeholder="https://example.com"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: 4,
                          color: '#ffffff',
                          fontSize: 16,
                          padding: '6px 8px',
                          outline: 'none',
                          flex: '1 1 180px',
                          minWidth: 140,
                          direction: 'ltr',
                          unicodeBidi: 'isolate',
                        }}
                        onChange={e => {
                          setLinkUrl(e.target.value);
                          setLinkError(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApplyLink();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCancelLink();
                          }
                        }}
                      />
                      <button
                        type="button"
                        data-nb-candidate-link-apply="1"
                        className="nb-toolbar-btn"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          background: 'rgba(59, 130, 246, 0.25)',
                          color: '#93c5fd',
                        }}
                        {...linkApplyCapture}
                      >
                        {isEditingLink ? 'Save' : 'Apply'}
                      </button>
                      {isEditingLink ? (
                        <button
                          type="button"
                          data-nb-candidate-link-open="1"
                          className="nb-toolbar-btn"
                          title="Open link"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            color: '#7dd3fc',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          {...linkOpenCapture}
                        >
                          <ExternalLink size={12} strokeWidth={2.5} />
                          Open Link
                        </button>
                      ) : null}
                      {isEditingLink ? (
                        <button
                          type="button"
                          data-nb-candidate-link-remove="1"
                          className="nb-toolbar-btn"
                          style={{ fontSize: 11, padding: '3px 8px', color: '#fca5a5' }}
                          {...linkRemoveCapture}
                        >
                          Remove Link
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-nb-candidate-link-cancel="1"
                        className="nb-toolbar-btn"
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        {...linkCancelCapture}
                      >
                        Cancel
                      </button>
                      {linkError ? (
                        <div
                          data-nb-candidate-link-error="1"
                          style={{ color: '#f87171', fontSize: 10, marginTop: 4, width: '100%' }}
                        >
                          {linkError}
                        </div>
                      ) : null}
                    </div>,
                    document.body,
                  )
                : null}
            </div>

            <div className="nb-toolbar-divider" />

            <div style={{ position: 'relative' }}>
              <FormatBtn
                title="Font size"
                testId="fontSize"
                active={!fmt.fontSizeMixed && fmt.fontSizePx != null}
                onAction={() => {
                  setBlockOpen(false);
                  setLinkOpen(false);
                  setTablePickerOpen(false);
                  setTableMenuOpen(false);
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
              onToggle={() => {
                setSizeOpen(false);
                setLinkOpen(false);
                setTablePickerOpen(false);
                setTableMenuOpen(false);
                setBlockOpen(value => !value);
              }}
              onClose={() => setBlockOpen(false)}
              onSelect={runBlock}
            />

            <div className="nb-toolbar-divider" />

            <div
              ref={tableInsertTriggerRef}
              style={{ position: 'relative' }}
              data-nb-candidate-table-insert="1"
            >
              <FormatBtn
                title="Insert table"
                testId="tableInsert"
                active={tablePickerOpen}
                onAction={() => {
                  setSizeOpen(false);
                  setBlockOpen(false);
                  setLinkOpen(false);
                  setTableMenuOpen(false);
                  setTablePickerOpen(v => !v);
                }}
                style={{ minWidth: 58, gap: 3, fontSize: 11, fontWeight: 700 }}
              >
                <Plus size={13} strokeWidth={2.6} aria-hidden />
                Table
              </FormatBtn>
              <NotebookTiptapCandidateTableSizePicker
                open={tablePickerOpen}
                borderColor={borderColor}
                anchorRef={tableInsertTriggerRef}
                onClose={() => setTablePickerOpen(false)}
                onPick={runTableInsert}
              />
            </div>

            {fmt.table?.inTable ? (
              <>
                <div className="nb-toolbar-divider" />
                <NotebookTiptapCandidateTableMenu
                  open={tableMenuOpen}
                  state={fmt.table}
                  borderColor={borderColor}
                  onToggle={() => {
                    setSizeOpen(false);
                    setBlockOpen(false);
                    setLinkOpen(false);
                    setTablePickerOpen(false);
                    tableTargetPosRef.current = editor.state.selection.from;
                    setTableMenuOpen(v => !v);
                  }}
                  onClose={() => setTableMenuOpen(false)}
                  onAction={runTableAction}
                />
              </>
            ) : null}

            <div className="nb-toolbar-divider" />

            <div
              data-nb-candidate-align-group="1"
              style={{ display: 'flex', alignItems: 'center', gap: 2 }}
            >
              <FormatBtn
                title="Align: Auto (Default)"
                testId="align-auto"
                active={fmt.alignSupported && fmt.align === null}
                disabled={!fmt.alignSupported}
                onAction={() => runFmt({ type: 'setAlignment', align: null })}
                style={{ fontSize: 11, fontWeight: 700, padding: '2px 5px', minWidth: 36 }}
              >
                Auto
              </FormatBtn>
              <FormatBtn
                title="Align left"
                testId="align-left"
                active={fmt.alignSupported && fmt.align === 'left'}
                disabled={!fmt.alignSupported}
                onAction={() => runFmt({ type: 'setAlignment', align: 'left' })}
              >
                <AlignLeft size={14} strokeWidth={2.5} />
              </FormatBtn>
              <FormatBtn
                title="Align center"
                testId="align-center"
                active={fmt.alignSupported && fmt.align === 'center'}
                disabled={!fmt.alignSupported}
                onAction={() => runFmt({ type: 'setAlignment', align: 'center' })}
              >
                <AlignCenter size={14} strokeWidth={2.5} />
              </FormatBtn>
              <FormatBtn
                title="Align right"
                testId="align-right"
                active={fmt.alignSupported && fmt.align === 'right'}
                disabled={!fmt.alignSupported}
                onAction={() => runFmt({ type: 'setAlignment', align: 'right' })}
              >
                <AlignRight size={14} strokeWidth={2.5} />
              </FormatBtn>
            </div>

            <div className="nb-toolbar-divider" />

            <FormatBtn title="Clear formatting" testId="clear" onAction={() => runFmt({ type: 'clearFormatting' })}>
              <Eraser size={14} strokeWidth={2} />
            </FormatBtn>
          </div>,
          document.body,
        )
      : null;

  const diagnostics =
    isNotebookEngineeringChromeEnabled() && typeof document !== 'undefined'
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
            title="Opt-in Notebook engineering selection diagnostics"
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
      <NotebookExplainSelectionPanel
        state={explainState}
        anchor={anchor}
        borderColor={borderColor}
        onClose={closeExplain}
        onRetry={retryExplain}
      />
      {diagnostics}
    </>
  );
}
