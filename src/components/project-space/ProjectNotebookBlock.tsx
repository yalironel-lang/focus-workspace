import {
  Fragment,
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent } from '../../hooks/useSectionFreeSpaceObjects';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

type NotebookLine =
  | { kind: 'blank' }
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'divider' }
  | { kind: 'task'; checked: boolean; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'paragraph'; text: string };

/** Normalize invisible spaces so markdown-lite lines classify reliably (e.g. NBSP from paste). */
function normalizeNotebookSpaces(s: string): string {
  return s.replace(/\u00a0/g, ' ');
}

/**
 * Parse one storage line into a notebook line shape.
 * Used for load, preview, and paragraph→block morph. Prefixes are never part of title/section/task/quote text.
 */
function parseNotebookLine(raw: string): NotebookLine {
  const normalized = normalizeNotebookSpaces(raw);
  const trimmed = normalized.trim();
  if (trimmed === '') return { kind: 'blank' };
  if (trimmed === '---') return { kind: 'divider' };

  const sectionMatch = trimmed.match(/^##\s*(.*)$/);
  if (sectionMatch) return { kind: 'section', text: (sectionMatch[1] ?? '').trimEnd() };

  const titleMatch = trimmed.match(/^#(?!\#)\s*(.*)$/);
  if (titleMatch) return { kind: 'title', text: (titleMatch[1] ?? '').trimEnd() };

  const taskMatch = trimmed.match(/^- \[\s*([xX ])\s*\]\s*(.*)$/);
  if (taskMatch) {
    const checked = taskMatch[1]!.trim().toLowerCase() === 'x';
    return { kind: 'task', checked, text: (taskMatch[2] ?? '').trimEnd() };
  }

  const looseTaskMatch = trimmed.match(/^- (?!\[)\s*(.*)$/);
  if (looseTaskMatch) {
    return { kind: 'task', checked: false, text: (looseTaskMatch[1] ?? '').trimEnd() };
  }

  const quoteMatch = trimmed.match(/^>\s?(.*)$/);
  if (quoteMatch && trimmed.startsWith('>')) return { kind: 'quote', text: (quoteMatch[1] ?? '').trimEnd() };

  return { kind: 'paragraph', text: normalized };
}

type Block =
  | { id: string; kind: 'title'; text: string }
  | { id: string; kind: 'section'; text: string }
  | { id: string; kind: 'task'; text: string; checked: boolean }
  | { id: string; kind: 'quote'; text: string }
  | { id: string; kind: 'divider' }
  | { id: string; kind: 'paragraph'; text: string };

let blockIdSeq = 0;
function newBlockId(): string {
  blockIdSeq += 1;
  return `nb-${blockIdSeq}`;
}

function lineToBlock(line: string): Block {
  const id = newBlockId();
  const parsed = parseNotebookLine(line);
  switch (parsed.kind) {
    case 'blank':
      return { id, kind: 'paragraph', text: '' };
    case 'title':
      return { id, kind: 'title', text: parsed.text };
    case 'section':
      return { id, kind: 'section', text: parsed.text };
    case 'divider':
      return { id, kind: 'divider' };
    case 'task':
      return { id, kind: 'task', text: parsed.text, checked: parsed.checked };
    case 'quote':
      return { id, kind: 'quote', text: parsed.text };
    case 'paragraph':
      return { id, kind: 'paragraph', text: parsed.text };
  }
}

function parseBodyToBlocks(body: string): Block[] {
  if (body.length === 0) return [{ id: newBlockId(), kind: 'paragraph', text: '' }];
  return body.split(/\r?\n/).map(lineToBlock);
}

function blockToLine(b: Block): string {
  switch (b.kind) {
    case 'title':
      return `# ${b.text}`;
    case 'section':
      return `## ${b.text}`;
    case 'task':
      return `- [${b.checked ? 'x' : ' '}] ${b.text}`;
    case 'quote':
      return `> ${b.text}`;
    case 'divider':
      return '---';
    case 'paragraph':
      return b.text;
  }
}

function serializeBlocks(blocks: Block[]): string {
  return blocks.map(blockToLine).join('\n');
}

function morphParagraphLine(text: string, blockId: string): Block | Block[] {
  const normalized = normalizeNotebookSpaces(text).replace(/\r\n/g, '\n');
  if (!normalized.includes('\n')) {
    const parsed = parseNotebookLine(normalized);
    if (parsed.kind === 'blank') return { id: blockId, kind: 'paragraph', text: '' };
    if (parsed.kind === 'divider') return { id: blockId, kind: 'divider' };
    if (parsed.kind === 'paragraph') return { id: blockId, kind: 'paragraph', text: parsed.text };
    if (parsed.kind === 'title') return { id: blockId, kind: 'title', text: parsed.text };
    if (parsed.kind === 'section') return { id: blockId, kind: 'section', text: parsed.text };
    if (parsed.kind === 'task')
      return { id: blockId, kind: 'task', text: parsed.text, checked: parsed.checked };
    if (parsed.kind === 'quote') return { id: blockId, kind: 'quote', text: parsed.text };
    return { id: blockId, kind: 'paragraph', text: normalized };
  }
  return normalized.split(/\r?\n/).map((ln) => lineToBlock(ln));
}

type EditableBlock = Exclude<Block, { kind: 'divider' }>;

/** Map contenteditable text to stored visible payload (strip markdown-lite prefixes if pasted). */
function applyVisualEditToStructuredBlock(block: EditableBlock, rawSingleLine: string): EditableBlock {
  const line = normalizeNotebookSpaces(rawSingleLine).split('\n')[0] ?? '';
  const trimmed = line.trim();
  if (block.kind === 'title') {
    const m = trimmed.match(/^#(?!\#)\s*(.*)$/);
    return { ...block, text: m ? (m[1] ?? '').trimEnd() : line.trimEnd() };
  }
  if (block.kind === 'section') {
    const m = trimmed.match(/^##\s*(.*)$/);
    return { ...block, text: m ? (m[1] ?? '').trimEnd() : line.trimEnd() };
  }
  if (block.kind === 'quote') {
    const m = trimmed.match(/^>\s?(.*)$/);
    return { ...block, text: m ? (m[1] ?? '').trimEnd() : line.trimEnd() };
  }
  if (block.kind === 'task') {
    const parsed = parseNotebookLine(trimmed);
    if (parsed.kind === 'task') return { ...block, text: parsed.text, checked: parsed.checked };
    return { ...block, text: line.trimEnd() };
  }
  return block;
}

function blockTextLen(b: Block): number {
  return b.kind === 'divider' ? 0 : b.text.length;
}

function getCaretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return el.textContent?.length ?? 0;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return el.textContent?.length ?? 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaretOffsetIn(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (let i = 0; i < node.childNodes.length; i += 1) {
        if (walk(node.childNodes[i]!)) return true;
      }
    }
    return false;
  };
  if (!walk(el)) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function rangeHeightFromStartToCaret(editable: HTMLElement): number {
  const sel = window.getSelection();
  const an = sel?.anchorNode;
  if (!sel?.rangeCount || !an || !editable.contains(an)) return 0;
  const range = document.createRange();
  try {
    range.selectNodeContents(editable);
    range.setEnd(an, sel.anchorOffset);
  } catch {
    return 0;
  }
  const h = range.getBoundingClientRect().height;
  return Number.isFinite(h) ? h : 0;
}

function rangeHeightFromCaretToEnd(editable: HTMLElement): number {
  const sel = window.getSelection();
  const an = sel?.anchorNode;
  if (!sel?.rangeCount || !an || !editable.contains(an)) return 0;
  const range = document.createRange();
  try {
    range.selectNodeContents(editable);
    range.setStart(an, sel.anchorOffset);
  } catch {
    return 0;
  }
  return range.getBoundingClientRect().height;
}

function lineHeightOf(el: HTMLElement): number {
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  if (!Number.isNaN(lh) && lh > 0) return lh;
  const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
  return fs * 1.5;
}

function caretInFirstVisualLine(el: HTMLElement): boolean {
  const h = rangeHeightFromStartToCaret(el);
  return h <= lineHeightOf(el) * 1.35;
}

function caretInLastVisualLine(el: HTMLElement): boolean {
  const h = rangeHeightFromCaretToEnd(el);
  return h <= lineHeightOf(el) * 1.35;
}

function caretAtVisualLineStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return getCaretOffsetIn(el) === 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const cr = r.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (cr.width === 0 && cr.height === 0) return getCaretOffsetIn(el) === 0;
  return cr.left <= er.left + 10;
}

function caretAtVisualLineEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return true;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const cr = r.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  if (cr.width === 0 && cr.height === 0) return true;
  return cr.right >= er.right - 10;
}

const SOFT_BREAK = '\u2028';

function mergeBlocks(prev: Block, next: Block): Block {
  if (prev.kind === 'divider') return next;
  const nextText = next.kind === 'divider' ? '' : next.text;
  const mergedText = prev.text + nextText;
  switch (prev.kind) {
    case 'title':
      return { id: prev.id, kind: 'title', text: mergedText };
    case 'section':
      return { id: prev.id, kind: 'section', text: mergedText };
    case 'quote':
      return { id: prev.id, kind: 'quote', text: mergedText };
    case 'task':
      return { id: prev.id, kind: 'task', text: mergedText, checked: prev.checked };
    case 'paragraph':
      return { id: prev.id, kind: 'paragraph', text: mergedText };
  }
}

function prevNavBlockIndex(blocks: Block[], from: number): number {
  for (let i = from - 1; i >= 0; i--) if (blocks[i]!.kind !== 'divider') return i;
  return -1;
}

function nextNavBlockIndex(blocks: Block[], from: number): number {
  for (let i = from + 1; i < blocks.length; i++) if (blocks[i]!.kind !== 'divider') return i;
  return -1;
}

/** First segment after `/`: command token + optional body (never treat command label as content). */
function parseSlashFirstSegment(firstLine: string): { commandToken: string; body: string } | null {
  const t = firstLine.trimStart();
  if (!t.startsWith('/')) return null;
  const after = t.slice(1).trimStart();
  if (after === '') return { commandToken: '', body: '' };
  const m = after.match(/^([\w-]+)(?:\s+(.*))?$/s);
  if (!m) return { commandToken: '', body: '' };
  return { commandToken: m[1] ?? '', body: (m[2] ?? '').trimStart() };
}

/** Token after `/` for slash menu fuzzy filter (not the full line). */
function slashFilterTokenFromParagraph(text: string): string | null {
  const first = (text.split(SOFT_BREAK)[0] ?? '').split('\n')[0] ?? '';
  const p = parseSlashFirstSegment(first);
  if (!p) return null;
  return p.commandToken;
}

/** Body to keep after applying a slash command; removes `/token` and command word only. */
function paragraphTextAfterSlashApply(fullParagraphText: string, _cmd: SlashCommandId): string {
  const parts = fullParagraphText.split(SOFT_BREAK);
  const p0 = parseSlashFirstSegment(parts[0] ?? '');
  if (!p0) return fullParagraphText;
  const firstBody = p0.body;
  return [firstBody, ...parts.slice(1)].join(SOFT_BREAK);
}

/** Strip slash invocation on Escape: keep body text only, or clear slash fragment. */
function stripSlashInvocationForEscape(fullParagraphText: string): string {
  const parts = fullParagraphText.split(SOFT_BREAK);
  const p = parseSlashFirstSegment(parts[0] ?? '');
  if (!p) return fullParagraphText;
  if (p.body.length > 0) return [p.body, ...parts.slice(1)].join(SOFT_BREAK);
  return parts.slice(1).join(SOFT_BREAK);
}

function fuzzySlashScore(query: string, label: string, hint: string): number {
  const q = query.trim().toLowerCase();
  const hay = `${label} ${hint}`.toLowerCase();
  if (!q) return 1;
  let j = 0;
  for (let i = 0; i < hay.length && j < q.length; i++) if (hay[i] === q[j]) j++;
  return j === q.length ? 2 + 1 / hay.length : 0;
}

type SlashCommandId = 'title' | 'section' | 'task' | 'quote' | 'divider';

const SLASH_COMMAND_META: { id: SlashCommandId; label: string; hint: string }[] = [
  { id: 'title', label: 'Title', hint: 'Large heading' },
  { id: 'section', label: 'Section', hint: 'Subheading' },
  { id: 'task', label: 'Task', hint: 'Checklist' },
  { id: 'quote', label: 'Quote', hint: 'Pull quote' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule' },
];

function getSlashFiltered(query: string): { id: SlashCommandId; label: string; hint: string }[] {
  return [...SLASH_COMMAND_META]
    .map((c) => ({ c, s: fuzzySlashScore(query, c.label, c.hint) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

interface EditableLineProps {
  id: string;
  text: string;
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
}

function EditableLine({
  id,
  text,
  tokens,
  placeholder,
  style,
  onUpdate,
  onFocusIndex,
  onAfterInput,
}: EditableLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const isEmpty = text.length === 0;
  const lineHeight = typeof style.lineHeight === 'number' ? style.lineHeight : 1.65;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
  }, [text, id]);

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
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
            color: tokens.textGhost,
            opacity: focused ? 0.1 : 0.18,
            fontWeight: 400,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight ?? lineHeight,
            letterSpacing: '0.03em',
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
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={(ev) => {
          const raw = ev.currentTarget.textContent ?? '';
          onUpdate(id, raw);
          requestAnimationFrame(() => onAfterInput?.(ev.currentTarget));
        }}
        onFocus={() => {
          onFocusIndex(id);
        }}
        style={{
          ...style,
          minHeight: isEmpty ? `${lineHeight}em` : undefined,
          transition: `${style.transition ? `${style.transition}, ` : ''}color 0.2s ease`,
        }}
      />
    </div>
  );
}

interface Props {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  onChange: (content: NotebookContent) => void;
}

export function ProjectNotebookBlock({ content, tokens, onChange }: Props) {
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [blocks, setBlocks] = useState<Block[]>(() => parseBodyToBlocks(content.body ?? ''));
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string;
    query: string;
    top: number;
    left: number;
    width: number;
    selected: number;
  } | null>(null);
  const [focusedDividerId, setFocusedDividerId] = useState<string | null>(null);
  const [surfaceFocusBlockId, setSurfaceFocusBlockId] = useState<string | null>(null);

  const editorRootRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const focusIndexRef = useRef(0);
  const pendingCaretRef = useRef<{ id: string; offset: number } | null>(null);

  const persist = useCallback(
    (next: Block[]) => {
      setBlocks(next);
      onChange({ ...content, body: serializeBlocks(next) });
    },
    [content, onChange],
  );

  useEffect(() => {
    const body = content.body ?? '';
    setBlocks((prev) => {
      if (serializeBlocks(prev) === body) return prev;
      return parseBodyToBlocks(body);
    });
  }, [content.body]);

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    const row = editorRootRef.current?.querySelector<HTMLElement>(
      `[data-divider-row][data-block-id="${pending.id}"]`,
    );
    if (row) {
      row.focus();
      pendingCaretRef.current = null;
      return;
    }
    const host = editorRootRef.current?.querySelector<HTMLElement>(`[data-editable-id="${pending.id}"]`);
    if (!host) return;
    setCaretOffsetIn(host, pending.offset);
    pendingCaretRef.current = null;
  }, [blocks]);

  const paperStyle = content.paperStyle ?? 'ruled';

  /** Paper lines stay atmospheric — never compete with text. */
  const writingPaperLayers = useMemo(() => {
    if (paperStyle === 'blank') {
      return `
        radial-gradient(ellipse 130% 75% at 50% -18%, ${tokens.accentSubtle}, transparent 58%),
        radial-gradient(ellipse 90% 45% at 50% 108%, rgba(0,0,0,0.14), transparent 52%)
      `;
    }
    if (paperStyle === 'grid') {
      return `
        linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px)
      `;
    }
    return `
      repeating-linear-gradient(
        180deg,
        transparent,
        transparent 35px,
        rgba(255,255,255,0.028) 35px,
        rgba(255,255,255,0.028) 36px
      )
    `;
  }, [paperStyle, tokens.accentSubtle]);

  const paperSize = paperStyle === 'grid' ? '36px 36px' : '100% 36px';

  const setFocusIndexById = useCallback(
    (id: string) => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx !== -1) focusIndexRef.current = idx;
    },
    [blocks],
  );

  const handleSurfaceFocusIn = useCallback((e: ReactFocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement | null;
    if (t === e.currentTarget) {
      setSurfaceFocusBlockId(null);
      return;
    }
    const wrap = t?.closest?.('[data-nb-surface-block]') as HTMLElement | null;
    const bid = wrap?.dataset?.blockId;
    if (bid) setSurfaceFocusBlockId(bid);
  }, []);

  const handleSurfaceBlur = useCallback((e: ReactFocusEvent<HTMLDivElement>) => {
    const rt = e.relatedTarget as Node | null;
    if (rt instanceof HTMLElement) {
      if (e.currentTarget.contains(rt)) return;
      if (rt.closest('[data-nb-slash-menu]')) return;
    }
    setSurfaceFocusBlockId(null);
  }, []);

  const blockSurfaceChrome = useCallback(
    (blockId: string): CSSProperties => {
      const has = surfaceFocusBlockId !== null;
      const active = surfaceFocusBlockId === blockId;
      const soften = has && !active;
      return {
        opacity: soften ? 0.88 : 1,
        filter: active ? 'brightness(1.04) saturate(1.02)' : 'none',
        transition: 'opacity 0.26s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.26s ease',
      };
    },
    [surfaceFocusBlockId],
  );

  const syncSlashFromParagraph = useCallback((blockId: string, el: HTMLDivElement) => {
    const blk = blocksRef.current.find((b) => b.id === blockId);
    if (blk?.kind !== 'paragraph') {
      setSlashMenu((s) => (s?.blockId === blockId ? null : s));
      return;
    }
    const text = el.textContent ?? '';
    const token = slashFilterTokenFromParagraph(text);
    if (token === null) {
      setSlashMenu((s) => (s?.blockId === blockId ? null : s));
      return;
    }
    const sel = window.getSelection();
    let rect: DOMRect | null = null;
    if (sel?.rangeCount && el.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0).cloneRange();
      r.collapse(true);
      rect = r.getBoundingClientRect();
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      rect = el.getBoundingClientRect();
    }
    const filtered = getSlashFiltered(token);
    const margin = 10;
    const estW = 260;
    const estH = 240;
    let top = rect.bottom + 8;
    let left = rect.left;
    if (typeof window !== 'undefined') {
      left = Math.min(Math.max(margin, left), window.innerWidth - estW - margin);
      if (top + estH > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - estH - 8);
      }
      top = Math.min(Math.max(margin, top), window.innerHeight - margin);
    }
    setSlashMenu((prev) => {
      const selected =
        prev && prev.blockId === blockId && prev.query === token
          ? Math.min(prev.selected, Math.max(0, filtered.length - 1))
          : 0;
      return {
        blockId,
        query: token,
        top,
        left,
        width: Math.max(200, Math.min(estW, rect.width || 200)),
        selected,
      };
    });
  }, []);

  const applySlashCommand = useCallback(
    (blockId: string, cmd: SlashCommandId) => {
      setSlashMenu(null);
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === blockId);
        if (i === -1) return prev;
        const cur = prev[i]!;
        if (cur.kind !== 'paragraph') return prev;
        const rest = paragraphTextAfterSlashApply(cur.text, cmd);
        const id = cur.id;
        let next: Block[];
        switch (cmd) {
          case 'title':
            next = [...prev.slice(0, i), { id, kind: 'title', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'section':
            next = [...prev.slice(0, i), { id, kind: 'section', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'task':
            next = [...prev.slice(0, i), { id, kind: 'task', text: rest, checked: false }, ...prev.slice(i + 1)];
            break;
          case 'quote':
            next = [...prev.slice(0, i), { id, kind: 'quote', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'divider': {
            const pid = newBlockId();
            next = [...prev.slice(0, i), { id, kind: 'divider' }, { id: pid, kind: 'paragraph', text: rest }, ...prev.slice(i + 1)];
            const serialized = serializeBlocks(next);
            onChange({ ...content, body: serialized });
            pendingCaretRef.current = { id: pid, offset: rest.length };
            return next;
          }
        }
        const serialized = serializeBlocks(next);
        onChange({ ...content, body: serialized });
        const nb = next[i]!;
        pendingCaretRef.current = { id: nb.id, offset: rest.length };
        return next;
      });
    },
    [content, onChange],
  );

  const slashFiltered = useMemo(
    () => (slashMenu ? getSlashFiltered(slashMenu.query) : []),
    [slashMenu],
  );

  const previewLines = useMemo(() => {
    const body = content.body ?? '';
    return body.split(/\r?\n/).map(parseNotebookLine);
  }, [content.body]);

  const fontStack = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

  const writingColumnStyle = useMemo(
    (): CSSProperties => ({
      maxWidth: 'min(640px, 100%)',
      margin: '0 auto',
      width: '100%',
      paddingLeft: 'clamp(32px, 6vw, 72px)',
      paddingRight: 'clamp(32px, 6vw, 72px)',
    }),
    [],
  );

  const editorSurfaceStyle = useMemo(
    (): CSSProperties => ({
      width: '100%',
      minHeight: '420px',
      boxSizing: 'border-box',
      backgroundColor: 'transparent',
      backgroundImage: writingPaperLayers,
      backgroundSize: paperSize,
      color: tokens.textPrimary,
      fontSize: '16px',
      lineHeight: 1.78,
      letterSpacing: '0.008em',
      fontFamily: fontStack,
      paddingTop: '48px',
      paddingBottom: '120px',
      outline: 'none',
      transition: 'color 0.22s ease, background-image 0.28s ease',
    }),
    [fontStack, writingPaperLayers, paperSize, tokens.textPrimary],
  );

  const updateBlockText = useCallback(
    (id: string, rawText: string) => {
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        if (i === -1) return prev;
        const block = prev[i]!;
        if (block.kind === 'divider') return prev;

        const text = rawText.replace(/\r\n/g, '\n');

        if (block.kind === 'paragraph') {
          const transformed = morphParagraphLine(text, block.id);
          if (Array.isArray(transformed)) {
            const next = [...prev.slice(0, i), ...transformed, ...prev.slice(i + 1)];
            onChange({ ...content, body: serializeBlocks(next) });
            const last = transformed[transformed.length - 1]!;
            pendingCaretRef.current = {
              id: last.id,
              offset:
                last.kind === 'divider'
                  ? 0
                  : last.kind === 'title' ||
                      last.kind === 'section' ||
                      last.kind === 'quote' ||
                      last.kind === 'task'
                    ? last.text.length
                    : last.text.length,
            };
            return next;
          }
          const sameShape =
            transformed.kind === block.kind &&
            transformed.text === block.text &&
            transformed.id === block.id;
          if (sameShape) return prev;
          const next = [...prev.slice(0, i), transformed, ...prev.slice(i + 1)];
          onChange({ ...content, body: serializeBlocks(next) });
          pendingCaretRef.current = {
            id: transformed.id,
            offset:
              transformed.kind === 'divider'
                ? 0
                : transformed.kind === 'title' ||
                    transformed.kind === 'section' ||
                    transformed.kind === 'quote' ||
                    transformed.kind === 'task'
                  ? transformed.text.length
                  : transformed.text.length,
          };
          return next;
        }

        const singleLine = text.includes('\n') ? (text.split('\n')[0] ?? '') : text;
        const edited: Block = applyVisualEditToStructuredBlock(block, singleLine);
        const same =
          edited.kind === block.kind &&
          edited.text === block.text &&
          (block.kind !== 'task' || (edited.kind === 'task' && edited.checked === block.checked));
        if (same) return prev;
        const next = [...prev.slice(0, i), edited, ...prev.slice(i + 1)];
        onChange({ ...content, body: serializeBlocks(next) });
        return next;
      });
    },
    [content, onChange],
  );

  const toggleTask = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        if (i === -1) return prev;
        const block = prev[i]!;
        if (block.kind !== 'task') return prev;
        const next = [...prev.slice(0, i), { ...block, checked: !block.checked }, ...prev.slice(i + 1)];
        onChange({ ...content, body: serializeBlocks(next) });
        return next;
      });
    },
    [content, onChange],
  );

  const removeBlockAt = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        const next = [...prev.slice(0, index), ...prev.slice(index + 1)];
        const filled = next.length === 0 ? [{ id: newBlockId(), kind: 'paragraph' as const, text: '' }] : next;
        onChange({ ...content, body: serializeBlocks(filled) });
        const focusIdx = Math.max(0, index - 1);
        const focusBlock = filled[focusIdx];
        if (focusBlock && focusBlock.kind !== 'divider') {
          pendingCaretRef.current = {
            id: focusBlock.id,
            offset:
              focusBlock.kind === 'title' ||
              focusBlock.kind === 'section' ||
              focusBlock.kind === 'quote' ||
              focusBlock.kind === 'task'
                ? focusBlock.text.length
                : focusBlock.text.length,
          };
        }
        return filled;
      });
    },
    [content, onChange],
  );

  const focusEditableBlock = useCallback((root: HTMLElement, block: Block, offset: number) => {
    if (block.kind === 'divider') {
      (root.querySelector(`[data-divider-row][data-block-id="${block.id}"]`) as HTMLElement | null)?.focus();
      return;
    }
    const len = block.text.length;
    const o = Math.max(0, Math.min(offset, len));
    pendingCaretRef.current = { id: block.id, offset: o };
    requestAnimationFrame(() => {
      const el = root.querySelector<HTMLElement>(`[data-editable-id="${block.id}"]`);
      el?.focus();
      if (el) setCaretOffsetIn(el, o);
      pendingCaretRef.current = null;
    });
  }, []);

  const handleEditorKeyCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editorMode !== 'edit') return;
      if (e.key === 'Tab') return;

      const root = editorRootRef.current;
      if (!root) return;
      const blocks = blocksRef.current;
      const sm = slashMenuRef.current;

      if (sm) {
        const filtered = getSlashFiltered(sm.query);
        if (e.key === 'Escape') {
          e.preventDefault();
          const { blockId } = sm;
          setSlashMenu(null);
          setBlocks((prev) => {
            const i = prev.findIndex((b) => b.id === blockId);
            if (i === -1) return prev;
            const b = prev[i]!;
            if (b.kind !== 'paragraph') return prev;
            const nt = stripSlashInvocationForEscape(b.text);
            if (nt === b.text) return prev;
            const next = [...prev.slice(0, i), { ...b, text: nt }, ...prev.slice(i + 1)];
            onChange({ ...content, body: serializeBlocks(next) });
            pendingCaretRef.current = { id: blockId, offset: 0 };
            return next;
          });
          return;
        }
        if (e.key === 'ArrowDown' && filtered.length > 0) {
          e.preventDefault();
          setSlashMenu((s) =>
            s ? { ...s, selected: Math.min(s.selected + 1, filtered.length - 1) } : s,
          );
          return;
        }
        if (e.key === 'ArrowUp' && filtered.length > 0) {
          e.preventDefault();
          setSlashMenu((s) => (s ? { ...s, selected: Math.max(s.selected - 1, 0) } : s));
          return;
        }
        if (e.key === 'Enter' && filtered.length > 0) {
          e.preventDefault();
          const cmd = filtered[Math.min(sm.selected, filtered.length - 1)]!.id;
          applySlashCommand(sm.blockId, cmd);
          return;
        }
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && e.target instanceof HTMLElement) {
        const row = e.target.closest<HTMLElement>('[data-divider-row]');
        if (row) {
          e.preventDefault();
          const did = row.dataset.blockId;
          if (!did) return;
          const idx = blocks.findIndex((b) => b.id === did);
          if (idx !== -1) removeBlockAt(idx);
          return;
        }
      }

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      let node: Node | null = sel.anchorNode;
      let editable: HTMLElement | null = null;
      while (node && node !== root) {
        if (node instanceof HTMLElement && node.dataset.editableId) {
          editable = node;
          break;
        }
        node = node.parentNode;
      }

      if (!editable) {
        if (
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          document.activeElement &&
          root.contains(document.activeElement)
        ) {
          const row = (document.activeElement as HTMLElement).closest('[data-divider-row]');
          if (row) {
            const did = row.getAttribute('data-block-id');
            const idx = did ? blocks.findIndex((b) => b.id === did) : -1;
            if (idx !== -1) {
              const ti =
                e.key === 'ArrowUp' ? prevNavBlockIndex(blocks, idx) : nextNavBlockIndex(blocks, idx);
              if (ti !== -1) {
                e.preventDefault();
                const tb = blocks[ti]!;
                const off =
                  tb.kind === 'divider' ? 0 : e.key === 'ArrowUp' ? tb.text.length : 0;
                focusEditableBlock(root, tb, off);
              }
            }
          }
        }
        return;
      }

      const id = editable.dataset.editableId;
      if (!id) return;
      const index = blocks.findIndex((b) => b.id === id);
      if (index === -1) return;
      const block = blocks[index]!;

      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';
        const len = text.length;
        const lh = lineHeightOf(editable);
        const hStart = rangeHeightFromStartToCaret(editable);
        const hEnd = rangeHeightFromCaretToEnd(editable);
        const firstVisual = caretInFirstVisualLine(editable);
        const lastVisual = caretInLastVisualLine(editable);
        const atLineStart = caretAtVisualLineStart(editable);
        const atLineEnd = caretAtVisualLineEnd(editable);
        const upLeave =
          (firstVisual && atLineStart) ||
          (offset === 0 && (hStart <= lh * 1.35 || !Number.isFinite(hStart) || hStart === 0));
        const downLeave =
          (lastVisual && atLineEnd) ||
          (offset >= len && (hEnd <= lh * 1.35 || !Number.isFinite(hEnd) || hEnd === 0));

        if (e.key === 'ArrowUp' && !upLeave) return;
        if (e.key === 'ArrowDown' && !downLeave) return;

        if (e.key === 'ArrowUp') {
          const pi = prevNavBlockIndex(blocks, index);
          if (pi === -1) return;
          e.preventDefault();
          const pb = blocks[pi]!;
          const col = pb.kind === 'divider' ? 0 : Math.min(offset, pb.text.length);
          focusEditableBlock(root, pb, col);
          return;
        }

        const ni = nextNavBlockIndex(blocks, index);
        if (ni === -1) return;
        e.preventDefault();
        const nb = blocks[ni]!;
        const col = nb.kind === 'divider' ? 0 : Math.min(offset, nb.text.length);
        focusEditableBlock(root, nb, col);
        return;
      }

      if (e.key === 'Enter' && e.shiftKey) {
        if (block.kind === 'divider') return;
        e.preventDefault();
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';
        const nextText = text.slice(0, offset) + SOFT_BREAK + text.slice(offset);
        const nb: Block =
          block.kind === 'paragraph'
            ? { id: block.id, kind: 'paragraph', text: nextText }
            : block.kind === 'title'
              ? { id: block.id, kind: 'title', text: nextText }
              : block.kind === 'section'
                ? { id: block.id, kind: 'section', text: nextText }
                : block.kind === 'quote'
                  ? { id: block.id, kind: 'quote', text: nextText }
                  : { id: block.id, kind: 'task', text: nextText, checked: block.checked };
        const next = [...blocks.slice(0, index), nb, ...blocks.slice(index + 1)];
        persist(next);
        pendingCaretRef.current = { id: block.id, offset: offset + 1 };
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';

        if (
          (block.kind === 'title' ||
            block.kind === 'section' ||
            block.kind === 'quote' ||
            block.kind === 'task') &&
          text.trim() === ''
        ) {
          e.preventDefault();
          const nb: Block = { id: block.id, kind: 'paragraph', text: '' };
          const next = [...blocks.slice(0, index), nb, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: nb.id, offset: 0 };
          return;
        }

        e.preventDefault();

        if (block.kind === 'divider') {
          const fresh: Block = { id: newBlockId(), kind: 'paragraph', text: '' };
          const next = [...blocks.slice(0, index + 1), fresh, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: fresh.id, offset: 0 };
          return;
        }

        if (block.kind === 'title' || block.kind === 'section' || block.kind === 'quote' || block.kind === 'task') {
          const before = text.slice(0, offset);
          const after = text.slice(offset);
          const updated = { ...block, text: before } as Block;
          const nextBlock: Block = { id: newBlockId(), kind: 'paragraph', text: after };
          const next = [...blocks.slice(0, index), updated, nextBlock, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
          return;
        }

        const before = text.slice(0, offset);
        const after = text.slice(offset);
        const updated: Block = { ...block, text: before };
        const nextBlock: Block = { id: newBlockId(), kind: 'paragraph', text: after };
        const next = [...blocks.slice(0, index), updated, nextBlock, ...blocks.slice(index + 1)];
        persist(next);
        pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
        return;
      }

      if (e.key === 'Delete') {
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';
        if (offset < text.length) return;
        if (index >= blocks.length - 1) return;
        const nx = blocks[index + 1]!;
        e.preventDefault();
        if (nx.kind === 'divider') {
          removeBlockAt(index + 1);
          return;
        }
        const merged = mergeBlocks(block, nx);
        const next = [...blocks.slice(0, index), merged, ...blocks.slice(index + 2)];
        persist(next);
        pendingCaretRef.current = { id: merged.id, offset: blockTextLen(block) };
        return;
      }

      if (e.key === 'Backspace') {
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';

        if (
          (block.kind === 'title' ||
            block.kind === 'section' ||
            block.kind === 'quote' ||
            block.kind === 'task') &&
          offset === 0 &&
          text.length === 0
        ) {
          e.preventDefault();
          const nextBlock: Block = { id: block.id, kind: 'paragraph', text: '' };
          const next = [...blocks.slice(0, index), nextBlock, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
          return;
        }

        if (block.kind === 'paragraph' && offset === 0 && index > 0) {
          const prev = blocks[index - 1]!;
          if (prev.kind === 'divider') {
            e.preventDefault();
            removeBlockAt(index - 1);
            return;
          }
          e.preventDefault();
          const merged = mergeBlocks(prev, block);
          const next = [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: merged.id, offset: prev.text.length };
        }
      }
    },
    [
      editorMode,
      persist,
      removeBlockAt,
      applySlashCommand,
      content,
      onChange,
      focusEditableBlock,
    ],
  );

  const nbMotionCss = `
@keyframes nbSlashIn {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
`;

  return (
    <Fragment>
      <style dangerouslySetInnerHTML={{ __html: nbMotionCss }} />
      <div
        style={{
          padding: '32px 36px 40px',
          minHeight: '420px',
          borderRadius: '26px',
          position: 'relative',
          background: `
            linear-gradient(155deg, rgba(255,255,255,0.045) 0%, transparent 42%),
            linear-gradient(180deg, ${tokens.cardBg}, ${tokens.wellBg})
          `,
          boxShadow: `
            0 40px 120px rgba(0,0,0,0.42),
            0 0 0 1px rgba(255,255,255,0.05),
            inset 0 1px 0 rgba(255,255,255,0.07),
            inset 0 -1px 0 rgba(0,0,0,0.12)
          `,
        }}
      >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              opacity: 0.75,
              marginBottom: '8px',
            }}
          >
            Notebook
          </div>

          <div
            style={{
              fontSize: '12.5px',
              color: tokens.textGhost,
              opacity: 0.85,
              letterSpacing: '0.01em',
              lineHeight: 1.45,
            }}
          >
            Keyboard-first writing. Type / for blocks.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['edit', 'preview'] as const).map((mode) => {
              const active = editorMode === mode;
              const label = mode === 'edit' ? 'Edit' : 'Preview';
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEditorMode(mode)}
                  style={{
                    border: active ? `1px solid ${tokens.accent}55` : `1px solid ${tokens.cardBorder}`,
                    background: active ? `${tokens.accent}18` : 'transparent',
                    color: active ? tokens.accent : tokens.textGhost,
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '5px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['blank', 'ruled', 'grid'] as const).map((style) => {
              const active = paperStyle === style;

              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => onChange({ ...content, paperStyle: style })}
                  style={{
                    border: active ? `1px solid ${tokens.accent}55` : `1px solid ${tokens.cardBorder}`,
                    background: active ? `${tokens.accent}18` : 'transparent',
                    color: active ? tokens.accent : tokens.textGhost,
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '5px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {style}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {editorMode === 'edit' && slashMenu && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-nb-slash-menu
              role="listbox"
              aria-label="Block commands"
              style={{
                position: 'fixed',
                zIndex: 10050,
                top: slashMenu.top,
                left: slashMenu.left,
                minWidth: Math.max(200, slashMenu.width),
                maxWidth: 288,
                padding: '6px',
                borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.055)',
                background: 'rgba(9,10,13,0.94)',
                backdropFilter: 'blur(22px) saturate(1.35)',
                WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
                boxShadow: `
                  0 22px 56px rgba(0,0,0,0.58),
                  0 0 0 1px ${tokens.accent}10,
                  inset 0 1px 0 rgba(255,255,255,0.05)
                `,
                animation: 'nbSlashIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              {slashFiltered.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: '12px', color: tokens.textGhost, opacity: 0.65 }}>
                  No matches
                </div>
              ) : (
                slashFiltered.map((cmd, i) => {
                  const active = i === slashMenu.selected;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        applySlashCommand(slashMenu.blockId, cmd.id);
                      }}
                      onMouseEnter={(ev) => {
                        if (!active) (ev.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.045)';
                      }}
                      onMouseLeave={(ev) => {
                        const el = ev.currentTarget as HTMLButtonElement;
                        el.style.background = active ? 'rgba(255,255,255,0.09)' : 'transparent';
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '2px',
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: '9px',
                        cursor: 'pointer',
                        padding: '9px 11px',
                        marginBottom: i < slashFiltered.length - 1 ? 2 : 0,
                        background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                        color: active ? tokens.textPrimary : tokens.textSecondary,
                        transition:
                          'background 0.16s cubic-bezier(0.25, 0.46, 0.45, 0.94), color 0.16s ease, transform 0.14s ease',
                        transform: active ? 'translateX(1px)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '13.5px', fontWeight: 600, letterSpacing: '-0.02em' }}>{cmd.label}</span>
                      <span style={{ fontSize: '10px', color: tokens.textGhost, opacity: 0.5, fontWeight: 500 }}>
                        {cmd.hint}
                      </span>
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}

      {editorMode === 'edit' ? (
        <div
          ref={editorRootRef}
          role="textbox"
          aria-multiline
          aria-label="Notebook"
          tabIndex={-1}
          onKeyDownCapture={handleEditorKeyCapture}
          onFocusCapture={handleSurfaceFocusIn}
          onBlur={handleSurfaceBlur}
          style={editorSurfaceStyle}
        >
          <div style={writingColumnStyle}>
          {blocks.map((block, index) => {
            if (block.kind === 'divider') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-divider-row
                  tabIndex={0}
                  role="separator"
                  aria-label="Section divider"
                  style={{
                    ...blockSurfaceChrome(block.id),
                    display: 'flex',
                    alignItems: 'center',
                    margin: '32px 0',
                    outline: 'none',
                    borderRadius: '10px',
                    transition:
                      'opacity 0.26s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.26s ease, box-shadow 0.28s ease',
                    boxShadow:
                      focusedDividerId === block.id
                        ? `0 0 28px ${tokens.accent}14, inset 0 0 0 1px ${tokens.accent}18`
                        : 'none',
                  }}
                  onFocus={() => {
                    focusIndexRef.current = index;
                    setFocusedDividerId(block.id);
                  }}
                  onBlur={() => {
                    setFocusedDividerId((id) => (id === block.id ? null : id));
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      const fresh: Block = { id: newBlockId(), kind: 'paragraph', text: '' };
                      const b = blocksRef.current;
                      persist([...b.slice(0, index + 1), fresh, ...b.slice(index + 1)]);
                      pendingCaretRef.current = { id: fresh.id, offset: 0 };
                      return;
                    }
                    if (ev.key === 'Backspace' || ev.key === 'Delete') {
                      ev.preventDefault();
                      removeBlockAt(index);
                    }
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: '1px',
                      background: tokens.divider,
                      opacity: focusedDividerId === block.id ? 0.88 : 0.52,
                      boxShadow:
                        focusedDividerId === block.id ? `0 0 18px ${tokens.accent}18` : 'none',
                      transition: 'opacity 0.24s ease, box-shadow 0.28s ease',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'title') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  style={blockSurfaceChrome(block.id)}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Title..."
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => syncSlashFromParagraph(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '34px',
                      fontWeight: 700,
                      letterSpacing: '-0.032em',
                      lineHeight: 1.1,
                      margin: '36px 0 22px',
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'section') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  style={blockSurfaceChrome(block.id)}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Section..."
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => syncSlashFromParagraph(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '22px',
                      fontWeight: 500,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.34,
                      margin: '48px 0 18px',
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'task') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '11px',
                    margin: '14px 0',
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={block.checked}
                    onClick={() => toggleTask(block.id)}
                    style={{
                      flexShrink: 0,
                      width: '15px',
                      height: '15px',
                      margin: 0,
                      padding: 0,
                      borderRadius: '4px',
                      border: `1px solid ${block.checked ? `${tokens.accent}cc` : tokens.cardBorder}`,
                      background: block.checked
                        ? `linear-gradient(145deg, ${tokens.accent}35, ${tokens.accent}12)`
                        : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      top: '0.14em',
                      lineHeight: 0,
                      transition:
                        'border-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), background 0.22s ease, box-shadow 0.24s ease, transform 0.16s ease',
                      boxShadow: block.checked
                        ? `0 0 0 1px ${tokens.accent}22, 0 0 14px ${tokens.accent}28`
                        : 'inset 0 1px 1px rgba(0,0,0,0.12)',
                    }}
                    onMouseDown={(ev) => {
                      (ev.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)';
                    }}
                    onMouseUp={(ev) => {
                      (ev.currentTarget as HTMLButtonElement).style.transform = '';
                    }}
                    onMouseLeave={(ev) => {
                      (ev.currentTarget as HTMLButtonElement).style.transform = '';
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'block',
                        fontSize: '9px',
                        fontWeight: 800,
                        color: tokens.accent,
                        lineHeight: 1,
                        transform: block.checked ? 'scale(1)' : 'scale(0.7)',
                        opacity: block.checked ? 1 : 0,
                        transition:
                          'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.16s ease',
                      }}
                    >
                      ✓
                    </span>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EditableLine
                      id={block.id}
                      text={block.text}
                      tokens={tokens}
                      placeholder="Task..."
                      onUpdate={updateBlockText}
                      onFocusIndex={setFocusIndexById}
                      onAfterInput={(el) => syncSlashFromParagraph(block.id, el)}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: tokens.textPrimary,
                        fontSize: '16px',
                        fontWeight: 400,
                        lineHeight: 1.72,
                        margin: 0,
                        caretColor: tokens.accent,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    />
                  </div>
                </div>
              );
            }

            if (block.kind === 'quote') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    margin: '24px 0',
                    paddingLeft: '22px',
                    borderLeft: `2px solid ${tokens.accent}22`,
                    boxShadow: `-8px 0 32px ${tokens.accent}0a`,
                    transition: 'border-color 0.24s ease, box-shadow 0.26s ease',
                  }}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Quote..."
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => syncSlashFromParagraph(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: tokens.textMuted,
                      fontSize: '16px',
                      fontStyle: 'italic',
                      fontWeight: 400,
                      lineHeight: 1.75,
                      margin: 0,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            return (
              <div
                key={block.id}
                data-nb-surface-block
                data-block-id={block.id}
                style={blockSurfaceChrome(block.id)}
              >
                <EditableLine
                  id={block.id}
                  text={block.text}
                  tokens={tokens}
                  placeholder="Write..."
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  onAfterInput={(el) => syncSlashFromParagraph(block.id, el)}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: tokens.textSecondary,
                    fontSize: '16px',
                    fontWeight: 400,
                    lineHeight: 1.78,
                    margin: '12px 0',
                    caretColor: tokens.accent,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                />
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        <div role="document" aria-label="Notebook preview" style={editorSurfaceStyle}>
          <div style={writingColumnStyle}>
          {previewLines.map((line, index) => {
            if (line.kind === 'blank') {
              return <div key={index} style={{ height: '18px' }} />;
            }
            if (line.kind === 'title') {
              return (
                <div
                  key={index}
                  style={{
                    fontSize: '34px',
                    fontWeight: 700,
                    letterSpacing: '-0.032em',
                    lineHeight: 1.1,
                    margin: '36px 0 22px',
                    color: tokens.textPrimary,
                  }}
                >
                  {line.text}
                </div>
              );
            }
            if (line.kind === 'section') {
              return (
                <div
                  key={index}
                  style={{
                    fontSize: '22px',
                    fontWeight: 500,
                    lineHeight: 1.34,
                    letterSpacing: '-0.02em',
                    margin: '48px 0 18px',
                    color: tokens.textPrimary,
                  }}
                >
                  {line.text}
                </div>
              );
            }
            if (line.kind === 'divider') {
              return (
                <div
                  key={index}
                  style={{
                    height: '1px',
                    margin: '32px 0',
                    background: tokens.divider,
                    opacity: 0.52,
                  }}
                  role="separator"
                />
              );
            }
            if (line.kind === 'task') {
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '11px',
                    margin: '14px 0',
                    color: tokens.textPrimary,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: '15px',
                      height: '15px',
                      position: 'relative',
                      top: '0.14em',
                      borderRadius: '4px',
                      border: `1px solid ${line.checked ? `${tokens.accent}cc` : tokens.cardBorder}`,
                      background: line.checked
                        ? `linear-gradient(145deg, ${tokens.accent}35, ${tokens.accent}12)`
                        : 'rgba(255,255,255,0.02)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 800,
                      color: tokens.accent,
                      lineHeight: 1,
                      boxShadow: line.checked
                        ? `0 0 0 1px ${tokens.accent}22, 0 0 14px ${tokens.accent}28`
                        : 'inset 0 1px 1px rgba(0,0,0,0.12)',
                    }}
                  >
                    {line.checked ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, whiteSpace: 'pre-wrap', fontSize: '16px', lineHeight: 1.72 }}>
                    {line.text}
                  </span>
                </div>
              );
            }
            if (line.kind === 'quote') {
              return (
                <blockquote
                  key={index}
                  style={{
                    margin: '24px 0',
                    paddingLeft: '22px',
                    borderLeft: `2px solid ${tokens.accent}22`,
                    boxShadow: `-8px 0 32px ${tokens.accent}0a`,
                    color: tokens.textMuted,
                    fontStyle: 'italic',
                    fontSize: '16px',
                    lineHeight: 1.75,
                    fontWeight: 400,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.text}
                </blockquote>
              );
            }
            return (
              <p
                key={index}
                style={{
                  margin: '12px 0',
                  color: tokens.textSecondary,
                  fontSize: '16px',
                  lineHeight: 1.78,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {line.text}
              </p>
            );
          })}
          </div>
        </div>
      )}
    </div>
    </Fragment>
  );
}
