import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { InlineMark } from '../../lib/notebookInlineMarks';
import { mergeAdjacentMarks, sortMarks, DEFAULT_NOTEBOOK_FONT_SIZE } from '../../lib/notebookInlineMarks';
import { getCaretOffsetIn, setCaretOffsetIn, getSelectionOffsetsIn, setSelectionOffsetsIn } from '../../lib/notebookCaret';
import {
  isPenPointer,
  isPenTextBlockActive,
  noteNotebookKeyboardTyping,
  noteNotebookPointerDown,
  noteNotebookPointerUp,
  shouldRejectPenTextBeforeInput,
} from '../../lib/notebookInputPolicy';
import { inkPenTrace } from '../../lib/inkPenTrace';

export interface RichTextUpdate {
  plain: string;
  marks: InlineMark[];
}

interface Props {
  id: string;
  plain: string;
  marks?: InlineMark[];
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, update: RichTextUpdate) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onSelectionChange?: (id: string, el: HTMLDivElement) => void;
  /** Triple/quadruple click — parent applies logical block / document selection. */
  onMultiClickSelect?: (payload: { blockId: string; kind: 'block' | 'document' }) => void;
  /** When true, block user input events (toolbar interaction). */
  suppressInputRef?: RefObject<boolean>;
  /** When equal to this line's id, block DOM onInput commits (mark apply in flight). */
  ignoreDomInputBlockIdRef?: RefObject<string | null>;
  /** Timestamp (ms) until which divergent DOM commits are rejected. */
  domCommitLockUntilRef?: RefObject<number>;
  /** While equal to this line id, reject all onInput commits (toolbar session). */
  toolbarActiveBlockIdRef?: RefObject<string | null>;
}

const MARK_TAGS: Record<string, InlineMark['t']> = {
  STRONG: 'b',
  B: 'b',
  EM: 'i',
  I: 'i',
  U: 'u',
  S: 's',
  STRIKE: 's',
  DEL: 's',
};

function domToRichLine(root: HTMLElement): RichTextUpdate {
  let plain = '';
  const marks: InlineMark[] = [];

  const walk = (node: Node, active: InlineMark['t'][], activeVal?: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? '';
      if (!t) return;
      const start = plain.length;
      plain += t;
      const end = plain.length;
      for (const type of active) {
        marks.push({
          s: start,
          e: end,
          t: type,
          ...(type === 'fs' || type === 'fg' || type === 'bg' || type === 'hl'
            ? activeVal ? { v: activeVal } : {}
            : {}),
        });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    const nextActive = [...active];
    let val = activeVal;

    if (tag === 'SPAN') {
      const fs = el.getAttribute('data-fs');
      const fg = el.getAttribute('data-fg');
      const bg = el.getAttribute('data-bg');
      const hl = el.getAttribute('data-hl');
      if (fs) {
        nextActive.push('fs');
        val = fs;
      } else if (fg) {
        nextActive.push('fg');
        val = fg;
      } else if (bg) {
        nextActive.push('bg');
        val = bg;
      } else if (hl) {
        nextActive.push('hl');
        val = hl;
      }
    } else if (tag === 'MARK') {
      nextActive.push('hl');
      val = el.style.backgroundColor || '#fef08a';
    } else {
      const mapped = MARK_TAGS[tag];
      if (mapped) nextActive.push(mapped);
    }

    for (let i = 0; i < el.childNodes.length; i += 1) {
      walk(el.childNodes[i]!, nextActive, val);
    }
  };

  for (let i = 0; i < root.childNodes.length; i += 1) {
    walk(root.childNodes[i]!, []);
  }

  return { plain, marks: mergeAdjacentMarks(marks) };
}

type Segment = { start: number; end: number; types: Map<InlineMark['t'], string | undefined> };

function buildSegments(marks: InlineMark[], len: number): Segment[] {
  const points = new Set<number>([0, len]);
  for (const m of marks) {
    points.add(m.s);
    points.add(m.e);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    if (start >= end) continue;
    const types = new Map<InlineMark['t'], string | undefined>();
    for (const m of marks) {
      if (m.s <= start && m.e >= end) {
        types.set(m.t, m.v);
      }
    }
    segments.push({ start, end, types });
  }
  return segments;
}

function wrapText(text: string, types: Map<InlineMark['t'], string | undefined>): Node {
  let node: Node = document.createTextNode(text);
  const order: InlineMark['t'][] = ['fs', 'fg', 'bg', 'hl', 'b', 'i', 'u', 's'];
  for (const t of order) {
    if (!types.has(t)) continue;
    const v = types.get(t);
    let el: HTMLElement;
    switch (t) {
      case 'b':
        el = document.createElement('strong');
        break;
      case 'i':
        el = document.createElement('em');
        break;
      case 'u':
        el = document.createElement('u');
        break;
      case 's':
        el = document.createElement('s');
        break;
      case 'fs': {
        el = document.createElement('span');
        el.setAttribute('data-fs', v ?? String(DEFAULT_NOTEBOOK_FONT_SIZE));
        el.style.fontSize = `${v ?? DEFAULT_NOTEBOOK_FONT_SIZE}px`;
        break;
      }
      case 'fg': {
        el = document.createElement('span');
        el.setAttribute('data-fg', v ?? '#f8fafc');
        el.style.color = v ?? '#f8fafc';
        break;
      }
      case 'bg': {
        el = document.createElement('span');
        el.setAttribute('data-bg', v ?? '#334155');
        el.style.backgroundColor = v ?? '#334155';
        break;
      }
      case 'hl': {
        el = document.createElement('mark');
        el.setAttribute('data-hl', v ?? '#fef08a');
        el.style.backgroundColor = v ?? '#fef08a';
        el.style.color = 'inherit';
        break;
      }
      default:
        continue;
    }
    el.appendChild(node);
    node = el;
  }
  return node;
}

function renderRichContent(root: HTMLElement, plain: string, marks: InlineMark[]): void {
  root.textContent = '';
  if (!plain) return;
  const segments = buildSegments(sortMarks(marks), plain.length);
  const frag = document.createDocumentFragment();
  for (const seg of segments) {
    const slice = plain.slice(seg.start, seg.end);
    if (!slice) continue;
    frag.appendChild(wrapText(slice, seg.types));
  }
  root.appendChild(frag);
}

function isInputSuppressed(
  id: string,
  suppressInputRef?: RefObject<boolean>,
  ignoreDomInputBlockIdRef?: RefObject<string | null>,
): boolean {
  return (
    suppressInputRef?.current === true || ignoreDomInputBlockIdRef?.current === id
  );
}

/** Reject toolbar/browser selection replacement (e.g. "shalom world" → "B world"). */
function isLikelyDomCorruption(expectedPlain: string, domPlain: string): boolean {
  if (expectedPlain === domPlain) return false;
  if (domPlain.startsWith(expectedPlain) || expectedPlain.startsWith(domPlain)) return false;
  if (Math.abs(domPlain.length - expectedPlain.length) <= 1) return false;
  return true;
}

export function RichEditableLine({
  id,
  plain,
  marks = [],
  tokens,
  placeholder,
  style,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  onSelectionChange,
  onMultiClickSelect,
  suppressInputRef,
  ignoreDomInputBlockIdRef,
  domCommitLockUntilRef,
  toolbarActiveBlockIdRef,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const programmaticRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const isEmpty = plain.length === 0;
  const lineHeight = typeof style.lineHeight === 'number' ? style.lineHeight : 1.65;

  const finishProgrammaticRender = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticRef.current = false;
      });
    });
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = domToRichLine(el);
    const samePlain = current.plain === plain;
    const sameMarks = JSON.stringify(current.marks) === JSON.stringify(marks);
    if (focusedRef.current) {
      if (!samePlain || !sameMarks) {
        const preserved =
          samePlain && !sameMarks ? getSelectionOffsetsIn(el) : null;
        programmaticRef.current = true;
        renderRichContent(el, plain, marks);
        if (!samePlain) {
          const offset = getCaretOffsetIn(el);
          setCaretOffsetIn(el, Math.min(offset, plain.length));
        } else if (preserved && !preserved.collapsed) {
          setSelectionOffsetsIn(el, preserved.start, preserved.end);
        }
        finishProgrammaticRender();
      }
      return;
    }
    if (!samePlain || !sameMarks) {
      programmaticRef.current = true;
      renderRichContent(el, plain, marks);
      finishProgrammaticRender();
    }
  }, [plain, marks, id, finishProgrammaticRender]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeBeforeInput = (ev: Event) => {
      const ie = ev as InputEvent;
      const reject = shouldRejectPenTextBeforeInput(ie);
      inkPenTrace('beforeinput', reject ? 'D' : 'E', reject ? 'REL reject' : 'REL allow', {
        surface: `RichEditableLine:${id}`,
        inputType: ie.inputType,
        rejected: reject,
        inNbRoot: true,
      });
      if (reject) {
        ev.preventDefault();
        return;
      }
      if (
        programmaticRef.current ||
        isInputSuppressed(id, suppressInputRef, ignoreDomInputBlockIdRef)
      ) {
        ev.preventDefault();
      }
    };
    el.addEventListener('beforeinput', onNativeBeforeInput, { capture: true });
    return () => el.removeEventListener('beforeinput', onNativeBeforeInput, { capture: true });
  }, [id, suppressInputRef, ignoreDomInputBlockIdRef]);

  const notifySelection = useCallback(() => {
    const el = ref.current;
    if (el && onSelectionChange) onSelectionChange(id, el);
  }, [id, onSelectionChange]);

  const handleMouseDown = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      // Consume multi-click before Free Space card/canvas handlers.
      if (ev.detail >= 3) {
        ev.preventDefault();
        ev.stopPropagation();
        const kind = ev.detail >= 4 ? 'document' : 'block';
        if (kind === 'block') {
          const el = ref.current;
          if (el) {
            setSelectionOffsetsIn(el, 0, plain.length);
            el.focus({ preventScroll: true });
          }
        }
        onMultiClickSelect?.({ blockId: id, kind });
        requestAnimationFrame(() => notifySelection());
        return;
      }
      if (ev.detail === 2) {
        // Native word selection — still stop bubbling so canvas does not steal the gesture.
        ev.stopPropagation();
      }
    },
    [id, plain.length, onMultiClickSelect, notifySelection],
  );

  const handleClick = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      if (ev.detail >= 3) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    },
    [],
  );

  const handlePenGuardPointerDown = useCallback((ev: ReactPointerEvent<HTMLDivElement>) => {
    noteNotebookPointerDown(ev.nativeEvent);
    if (!isPenPointer(ev.nativeEvent)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ref.current && document.activeElement === ref.current) {
      ref.current.blur();
    }
  }, []);

  const handlePenGuardPointerUp = useCallback((ev: ReactPointerEvent<HTMLDivElement>) => {
    noteNotebookPointerUp(ev.nativeEvent);
  }, []);

  const rejectPenBeforeInput = useCallback(
    (ev: { preventDefault: () => void; nativeEvent: InputEvent }) => {
      if (shouldRejectPenTextBeforeInput(ev.nativeEvent)) {
        ev.preventDefault();
        return true;
      }
      return false;
    },
    [],
  );

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onPointerDownCapture={handlePenGuardPointerDown}
      onPointerUpCapture={handlePenGuardPointerUp}
      onFocusCapture={() => {
        focusedRef.current = true;
        setFocused(true);
      }}
      onBlurCapture={() => {
        focusedRef.current = false;
        setFocused(false);
      }}
    >
      {isEmpty ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            pointerEvents: 'none',
            userSelect: 'none',
            color: tokens.textMuted,
            opacity: focused ? 0.28 : 0.38,
            fontWeight: 400,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight ?? lineHeight,
            letterSpacing: '0.02em',
            transition: 'opacity 0.2s ease',
          }}
        >
          {placeholder}
        </div>
      ) : null}
      <div
        ref={ref}
        data-editable-id={id}
        data-block-id={id}
        data-rich-editable="1"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onBeforeInput={(ev) => {
          if (rejectPenBeforeInput(ev)) return;
          const blocked =
            programmaticRef.current ||
            isInputSuppressed(id, suppressInputRef, ignoreDomInputBlockIdRef);
          if (blocked) {
            ev.preventDefault();
          }
        }}
        onInput={(ev) => {
          const target = ev.currentTarget;
          if (isPenTextBlockActive()) {
            programmaticRef.current = true;
            renderRichContent(target, plain, marks);
            finishProgrammaticRender();
            return;
          }
          if (toolbarActiveBlockIdRef?.current === id) {
            programmaticRef.current = true;
            renderRichContent(target, plain, marks);
            finishProgrammaticRender();
            return;
          }
          const suppressed =
            programmaticRef.current ||
            isInputSuppressed(id, suppressInputRef, ignoreDomInputBlockIdRef);
          const rich = domToRichLine(target);
          if (suppressed) return;
          const lockActive =
            ignoreDomInputBlockIdRef?.current === id ||
            (domCommitLockUntilRef != null && Date.now() < domCommitLockUntilRef.current);
          if (lockActive && isLikelyDomCorruption(plain, rich.plain)) {
            programmaticRef.current = true;
            renderRichContent(target, plain, marks);
            finishProgrammaticRender();
            return;
          }
          onUpdate(id, rich);
          requestAnimationFrame(() => onAfterInput?.(target));
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onMouseUp={notifySelection}
        onKeyUp={notifySelection}
        onKeyDown={() => noteNotebookKeyboardTyping()}
        onFocus={() => onFocusIndex(id)}
        style={{
          ...style,
          minHeight: isEmpty ? `${lineHeight}em` : undefined,
          transition: `${style.transition ? `${style.transition}, ` : ''}color 0.2s ease`,
        }}
      />
    </div>
  );
}