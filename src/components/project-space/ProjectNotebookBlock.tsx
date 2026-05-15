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
  RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject } from '../../hooks/useSectionFreeSpaceObjects';
import { NotebookContextSidebar, deriveNotebookContextData } from './NotebookContextSidebar';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

type ParagraphVariant = 'muted' | 'fine';
type CalloutTone = 'summary' | 'concept' | 'review';

type NotebookLine =
  | { kind: 'blank' }
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'divider' }
  | { kind: 'ordered'; number: number; text: string }
  | { kind: 'task'; checked: boolean; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'callout'; tone: CalloutTone; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'paragraph'; text: string; variant?: ParagraphVariant };

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

  const orderedMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);
  if (orderedMatch) {
    return {
      kind: 'ordered',
      number: Math.max(1, Number(orderedMatch[1] ?? 1) || 1),
      text: (orderedMatch[2] ?? '').trimEnd(),
    };
  }

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

  const calloutMatch = trimmed.match(/^!(summary|concept|review)\s*(.*)$/i);
  if (calloutMatch) {
    return {
      kind: 'callout',
      tone: calloutMatch[1]!.toLowerCase() as CalloutTone,
      text: (calloutMatch[2] ?? '').trimEnd(),
    };
  }

  const mathMatch = trimmed.match(/^\$\$\s*(.*)$/);
  if (mathMatch) return { kind: 'math', text: (mathMatch[1] ?? '').trimEnd() };

  /** Pilcrow prefixes — editorial tone scale (not shown in contenteditable; storage + paste only). */
  if (trimmed.startsWith('\u00b6\u00b6')) {
    const rest = trimmed.slice(2).trimStart();
    return { kind: 'paragraph', text: rest.trimEnd(), variant: 'fine' };
  }
  if (trimmed.startsWith('\u00b6')) {
    const rest = trimmed.slice(1).trimStart();
    return { kind: 'paragraph', text: rest.trimEnd(), variant: 'muted' };
  }

  return { kind: 'paragraph', text: normalized };
}

type Block =
  | { id: string; kind: 'title'; text: string }
  | { id: string; kind: 'section'; text: string }
  | { id: string; kind: 'ordered'; number: number; text: string }
  | { id: string; kind: 'task'; text: string; checked: boolean }
  | { id: string; kind: 'quote'; text: string }
  | { id: string; kind: 'callout'; tone: CalloutTone; text: string }
  | { id: string; kind: 'math'; text: string }
  | { id: string; kind: 'divider' }
  | { id: string; kind: 'paragraph'; text: string; variant?: ParagraphVariant };

let blockIdSeq = 0;
function newBlockId(): string {
  blockIdSeq += 1;
  return `nb-${blockIdSeq}`;
}

function calloutLabel(tone: CalloutTone): string {
  if (tone === 'summary') return 'Summary';
  if (tone === 'concept') return 'Key idea';
  return 'Review';
}

function looksCodeLikeStart(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  return /^(`|\$|#|\(|\[|\{)/.test(trimmed)
    || /^\d+\./.test(trimmed)
    || /^[a-zA-Z_]+\s*(=|:|\(|\[|\{)/.test(trimmed)
    || /^[a-zA-Z]\s*([+\-*/^<>=]|:)/.test(trimmed)
    || /^[a-zA-Z]\d/.test(trimmed);
}

function autoCapitalizeParagraphStart(text: string): string {
  const leading = text.match(/^\s*/)?.[0] ?? '';
  const body = text.slice(leading.length);
  if (!body || !/^[a-z]/.test(body) || looksCodeLikeStart(body)) return text;
  return `${leading}${body[0]!.toUpperCase()}${body.slice(1)}`;
}

function normalizeRecallPromptText(text: string): string {
  return text.replace(/\u2028/g, '\n').trim();
}

function normalizeOrderedSequences(blocks: Block[]): Block[] {
  let changed = false;
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.kind !== 'ordered') {
      out.push(block);
      continue;
    }
    const prev = out[out.length - 1];
    const nextNumber = prev?.kind === 'ordered' ? prev.number + 1 : Math.max(1, block.number);
    if (block.number !== nextNumber) {
      changed = true;
      out.push({ ...block, number: nextNumber });
    } else {
      out.push(block);
    }
  }
  return changed ? out : blocks;
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
    case 'ordered':
      return { id, kind: 'ordered', number: parsed.number, text: parsed.text };
    case 'divider':
      return { id, kind: 'divider' };
    case 'task':
      return { id, kind: 'task', text: parsed.text, checked: parsed.checked };
    case 'quote':
      return { id, kind: 'quote', text: parsed.text };
    case 'callout':
      return { id, kind: 'callout', tone: parsed.tone, text: parsed.text };
    case 'math':
      return { id, kind: 'math', text: parsed.text };
    case 'paragraph':
      return {
        id,
        kind: 'paragraph',
        text: parsed.text,
        ...(parsed.variant ? { variant: parsed.variant } : {}),
      };
  }
}

function parseBodyToBlocks(body: string): Block[] {
  // Empty document: title row + body row (storage is "# \n" — no placeholder text persisted).
  if (body.trim().length === 0) {
    return [
      { id: newBlockId(), kind: 'title', text: '' },
      { id: newBlockId(), kind: 'paragraph', text: '' },
    ];
  }
  return body.split(/\r?\n/).map(lineToBlock);
}

function blockToLine(b: Block): string {
  switch (b.kind) {
    case 'title':
      return `# ${b.text}`;
    case 'section':
      return `## ${b.text}`;
    case 'ordered':
      return `${b.number}. ${b.text}`;
    case 'task':
      return `- [${b.checked ? 'x' : ' '}] ${b.text}`;
    case 'quote':
      return `> ${b.text}`;
    case 'callout':
      return `!${b.tone} ${b.text}`;
    case 'math':
      return `$$ ${b.text}`;
    case 'divider':
      return '---';
    case 'paragraph':
      if (b.variant === 'muted') return `\u00b6 ${b.text}`;
      if (b.variant === 'fine') return `\u00b6\u00b6 ${b.text}`;
      return b.text;
  }
}

function serializeBlocks(blocks: Block[]): string {
  const normalized = normalizeOrderedSequences(blocks);
  // Canonical empty document: persist as "" (no placeholder strings; parse maps back to title + body).
  if (
    normalized.length === 2 &&
    normalized[0]?.kind === 'title' &&
    normalized[0].text === '' &&
    normalized[1]?.kind === 'paragraph' &&
    normalized[1].text === '' &&
    !normalized[1].variant
  ) {
    return '';
  }
  if (
    normalized.length === 1 &&
    normalized[0]?.kind === 'paragraph' &&
    normalized[0].text === '' &&
    !normalized[0].variant
  ) {
    return '';
  }
  return normalized.map(blockToLine).join('\n');
}

function morphParagraphLine(text: string, blockId: string): Block | Block[] {
  const normalized = normalizeNotebookSpaces(text).replace(/\r\n/g, '\n');
  if (!normalized.includes('\n')) {
    const parsed = parseNotebookLine(normalized);
    if (parsed.kind === 'blank') return { id: blockId, kind: 'paragraph', text: '' };
    if (parsed.kind === 'divider') return { id: blockId, kind: 'divider' };
    if (parsed.kind === 'paragraph')
      return {
        id: blockId,
        kind: 'paragraph',
        text: parsed.text,
        ...(parsed.variant ? { variant: parsed.variant } : {}),
      };
    if (parsed.kind === 'title') return { id: blockId, kind: 'title', text: parsed.text };
    if (parsed.kind === 'section') return { id: blockId, kind: 'section', text: parsed.text };
    if (parsed.kind === 'ordered') return { id: blockId, kind: 'ordered', number: parsed.number, text: parsed.text };
    if (parsed.kind === 'task')
      return { id: blockId, kind: 'task', text: parsed.text, checked: parsed.checked };
    if (parsed.kind === 'quote') return { id: blockId, kind: 'quote', text: parsed.text };
    if (parsed.kind === 'callout') return { id: blockId, kind: 'callout', tone: parsed.tone, text: parsed.text };
    if (parsed.kind === 'math') return { id: blockId, kind: 'math', text: parsed.text };
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
  if (block.kind === 'ordered') {
    const m = trimmed.match(/^(\d+)\.\s*(.*)$/);
    if (m) {
      return {
        ...block,
        number: Math.max(1, Number(m[1] ?? block.number) || block.number),
        text: (m[2] ?? '').trimEnd(),
      };
    }
    return { ...block, text: line.trimEnd() };
  }
  if (block.kind === 'quote') {
    const m = trimmed.match(/^>\s?(.*)$/);
    return { ...block, text: m ? (m[1] ?? '').trimEnd() : line.trimEnd() };
  }
  if (block.kind === 'callout') {
    const m = trimmed.match(/^!(summary|concept|review)\s*(.*)$/i);
    if (m) {
      return {
        ...block,
        tone: m[1]!.toLowerCase() as CalloutTone,
        text: (m[2] ?? '').trimEnd(),
      };
    }
    return { ...block, text: line.trimEnd() };
  }
  if (block.kind === 'math') {
    const m = trimmed.match(/^\$\$\s*(.*)$/);
    return { ...block, text: m ? (m[1] ?? '').trimEnd() : line.trimEnd() };
  }
  if (block.kind === 'task') {
    const parsed = parseNotebookLine(trimmed);
    if (parsed.kind === 'task') return { ...block, text: parsed.text, checked: parsed.checked };
    return { ...block, text: line.trimEnd() };
  }
  if (block.kind === 'paragraph') {
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
    case 'ordered':
      return { id: prev.id, kind: 'ordered', number: prev.number, text: mergedText };
    case 'quote':
      return { id: prev.id, kind: 'quote', text: mergedText };
    case 'callout':
      return { id: prev.id, kind: 'callout', tone: prev.tone, text: mergedText };
    case 'math':
      return { id: prev.id, kind: 'math', text: mergedText };
    case 'task':
      return { id: prev.id, kind: 'task', text: mergedText, checked: prev.checked };
    case 'paragraph':
      if (next.kind !== 'paragraph') return { id: prev.id, kind: 'paragraph', text: mergedText };
      if (prev.variant !== next.variant) return { id: prev.id, kind: 'paragraph', text: mergedText };
      return {
        id: prev.id,
        kind: 'paragraph',
        text: mergedText,
        ...(prev.variant ? { variant: prev.variant } : {}),
      };
  }
}

/** Typography scale rail + Alt+↑↓ — maps to block kinds / paragraph variants. */
function getBlockLevel(b: Block): 1 | 2 | 3 | 4 | 5 | null {
  if (b.kind === 'title') return 1;
  if (b.kind === 'section') return 2;
  if (b.kind === 'paragraph') {
    if (b.variant === 'muted') return 4;
    if (b.variant === 'fine') return 5;
    return 3;
  }
  return null;
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

type SlashCommandId =
  | 'title'
  | 'section'
  | 'task'
  | 'quote'
  | 'divider'
  | 'muted'
  | 'fine'
  | 'summary'
  | 'concept'
  | 'review'
  | 'formula';

const SLASH_COMMAND_META: { id: SlashCommandId; label: string; hint: string }[] = [
  { id: 'title', label: 'Title', hint: 'Level 1 — focal heading' },
  { id: 'section', label: 'Section', hint: 'Level 2 — structure' },
  { id: 'summary', label: 'Summary', hint: 'Study callout' },
  { id: 'concept', label: 'Concept', hint: 'Key idea callout' },
  { id: 'review', label: 'Review', hint: 'Quick revision prompt' },
  { id: 'formula', label: 'Formula', hint: 'Highlight a line of math' },
  { id: 'muted', label: 'Subtle', hint: 'Level 4 — softer body' },
  { id: 'fine', label: 'Fine', hint: 'Level 5 — caption / aside' },
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

/** Free Space: fixed chrome height + scrollable writing/preview; wheel does not bubble to canvas. */
function NotebookBodyScroll({
  enabled,
  scrollRef,
  children,
}: {
  enabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  if (!enabled) return <Fragment>{children}</Fragment>;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        ref={scrollRef}
        data-nb-body-scroll="1"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
        onWheelCapture={(e) => {
          e.stopPropagation();
        }}
      >
        {children}
      </div>
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 16,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.28) 0%, transparent 100%)',
          opacity: 0.25,
        }}
      />
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 20,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.26) 0%, transparent 100%)',
          opacity: 0.3,
        }}
      />
    </div>
  );
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
  objectId?: string;
  objectTitle?: string;
  allObjects?: ProjectSpaceObject[];
  onRequestSelectObject?: (id: string) => void;
  onCreateRecallItem?: (prompt: string) => void;
  /**
   * Optional host context (e.g. Free Space canvas) so the notebook can expose a richer focus state.
   * When set to "free-space", edit/preview transitions can drive ambient canvas lighting.
   */
  context?: 'free-space' | 'inline';
  /** Notify host when this notebook enters or exits edit mode (for cinematic focus on Free Space). */
  onEditingChange?: (isEditing: boolean) => void;
}

export function ProjectNotebookBlock({
  content,
  tokens,
  onChange,
  objectId,
  objectTitle,
  allObjects,
  onRequestSelectObject,
  onCreateRecallItem,
  context = 'inline',
  onEditingChange,
}: Props) {
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
  const [morphPulseId, setMorphPulseId] = useState<string | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  const [typoRail, setTypoRail] = useState<{
    top: number;
    left: number;
    blockId: string;
    level: 1 | 2 | 3 | 4 | 5;
  } | null>(null);

  const shellRef = useRef<HTMLDivElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const notebookBodyScrollRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const focusIndexRef = useRef(0);
  const pendingCaretRef = useRef<{ id: string; offset: number } | null>(null);

  const contextData = useMemo(
    () => deriveNotebookContextData(objectId, allObjects),
    [objectId, allObjects],
  );
  const activeNotebookBlock = useMemo(
    () => (surfaceFocusBlockId ? blocks.find((b) => b.id === surfaceFocusBlockId) ?? null : null),
    [blocks, surfaceFocusBlockId],
  );
  const activeRecallPrompt = useMemo(() => {
    const focused = activeNotebookBlock && activeNotebookBlock.kind !== 'divider'
      ? activeNotebookBlock
      : null;
    const fallback = blocks[focusIndexRef.current];
    const source = focused ?? (fallback && fallback.kind !== 'divider' ? fallback : null);
    if (!source) return '';
    return normalizeRecallPromptText(source.text);
  }, [activeNotebookBlock, blocks]);
  const hasNotebookContext = contextData.totalCount > 0;
  const canDockContext = surfaceWidth >= 640;
  const showNotebookContext = context === 'free-space' && hasNotebookContext && contextPanelOpen;

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setSurfaceWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!hasNotebookContext && contextPanelOpen) setContextPanelOpen(false);
  }, [hasNotebookContext, contextPanelOpen]);

  const persist = useCallback(
    (next: Block[]) => {
      const normalized = normalizeOrderedSequences(next);
      setBlocks(normalized);
      onChange({ ...content, body: serializeBlocks(normalized) });
    },
    [content, onChange],
  );

  const applyBlockLevel = useCallback(
    (blockId: string, level: 1 | 2 | 3 | 4 | 5) => {
      setMorphPulseId(blockId);
      setBlocks((prev) => {
        const i = prev.findIndex((b) => b.id === blockId);
        if (i === -1) return prev;
        const cur = prev[i]!;
        if (cur.kind === 'divider') return prev;
        const text = cur.text;
        let nb: Block;
        if (level === 1) nb = { id: blockId, kind: 'title', text };
        else if (level === 2) nb = { id: blockId, kind: 'section', text };
        else if (level === 3) nb = { id: blockId, kind: 'paragraph', text };
        else if (level === 4) nb = { id: blockId, kind: 'paragraph', text, variant: 'muted' };
        else nb = { id: blockId, kind: 'paragraph', text, variant: 'fine' };
        const next = [...prev.slice(0, i), nb, ...prev.slice(i + 1)];
        onChange({ ...content, body: serializeBlocks(next) });
        return next;
      });
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

  useEffect(() => {
    if (!morphPulseId) return;
    const t = window.setTimeout(() => setMorphPulseId(null), 420);
    return () => window.clearTimeout(t);
  }, [morphPulseId]);

  const paperStyle = content.paperStyle ?? 'ruled';

  const paperSize = paperStyle === 'grid' ? '36px 36px' : '100% 38px';

  /** Paper + very light edge (lines stay faint; text stays dominant). */
  const writingSurfaceBackground = useMemo(() => {
    const edge = `radial-gradient(ellipse 130% 100% at 50% 52%, transparent 55%, rgba(0,0,0,0.028) 88%, rgba(0,0,0,0.05) 100%)`;
    if (paperStyle === 'blank') {
      return {
        image: `
          radial-gradient(ellipse 120% 55% at 50% -8%, rgba(255,255,255,0.04), transparent 55%),
          ${edge}
        `,
        size: '100% 100%, 100% 100%',
      };
    }
    if (paperStyle === 'grid') {
      return {
        image: `
          linear-gradient(rgba(255,255,255,0.006) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.006) 1px, transparent 1px),
          ${edge}
        `,
        size: '36px 36px, 36px 36px, 100% 100%',
      };
    }
    return {
      image: `
        repeating-linear-gradient(
          180deg,
          transparent,
          transparent 37px,
          rgba(255,255,255,0.01) 37px,
          rgba(255,255,255,0.01) 38px
        ),
        ${edge}
      `,
      size: `${paperSize}, 100% 100%`,
    };
  }, [paperStyle, paperSize]);

  /** Editorial ink — brighter body for real reading on dark paper. */
  const notebookInk = useMemo(
    () => ({
      headline: `color-mix(in srgb, ${tokens.textPrimary} 97%, #fafafa 3%)`,
      primary: `color-mix(in srgb, ${tokens.textPrimary} 94%, #f8fafc 6%)`,
      section: `color-mix(in srgb, ${tokens.textSecondary} 90%, #f1f5f9 10%)`,
      secondary: `color-mix(in srgb, ${tokens.textSecondary} 90%, #f8fafc 10%)`,
      muted: `color-mix(in srgb, ${tokens.textMuted} 88%, #f8fafc 12%)`,
      ghost: `color-mix(in srgb, ${tokens.textGhost} 82%, #e2e8f0 18%)`,
    }),
    [tokens.textPrimary, tokens.textSecondary, tokens.textMuted, tokens.textGhost],
  );

  /** New empty doc: title + first body line, both empty (not legacy single empty paragraph). */
  const isStarterNotebook = useMemo(
    () =>
      editorMode === 'edit' &&
      blocks.length === 2 &&
      blocks[0]?.kind === 'title' &&
      blocks[0].text === '' &&
      blocks[1]?.kind === 'paragraph' &&
      blocks[1].text === '' &&
      !blocks[1].variant,
    [editorMode, blocks],
  );

  const isLegacySingleEmptyParagraph = useMemo(
    () =>
      editorMode === 'edit' &&
      blocks.length === 1 &&
      blocks[0]?.kind === 'paragraph' &&
      blocks[0].text === '' &&
      !blocks[0].variant,
    [editorMode, blocks],
  );

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
      if (rt.closest('[data-nb-typo-rail]')) return;
    }
    setSurfaceFocusBlockId(null);
  }, []);

  const blockSurfaceChrome = useCallback(
    (blockId: string): CSSProperties => {
      const has = surfaceFocusBlockId !== null;
      const active = surfaceFocusBlockId === blockId;
      const soften = has && !active;
      return {
        opacity: soften ? 0.985 : 1,
        filter: active ? 'brightness(1.012)' : 'none',
        transition: 'opacity 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.22s ease',
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

  const ensureNotebookBodyCaretVisible = useCallback(
    (host: HTMLElement) => {
      const sc = notebookBodyScrollRef.current;
      if (context !== 'free-space' || !sc?.contains(host)) return;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const sr = sc.getBoundingClientRect();
      const pad = 28;
      if (r.bottom > sr.bottom - pad) {
        sc.scrollTop += Math.max(1, r.bottom - sr.bottom + pad);
      } else if (r.top < sr.top + pad) {
        sc.scrollTop -= Math.max(1, sr.top + pad - r.top);
      }
    },
    [context],
  );

  const onEditableAfterInput = useCallback(
    (blockId: string, el: HTMLDivElement) => {
      syncSlashFromParagraph(blockId, el);
      ensureNotebookBodyCaretVisible(el);
    },
    [syncSlashFromParagraph, ensureNotebookBodyCaretVisible],
  );

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
    requestAnimationFrame(() => {
      ensureNotebookBodyCaretVisible(host);
    });
  }, [blocks, ensureNotebookBodyCaretVisible]);

  const applySlashCommand = useCallback(
    (blockId: string, cmd: SlashCommandId) => {
      setSlashMenu(null);
      setMorphPulseId(blockId);
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
          case 'summary':
            next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'summary', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'concept':
            next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'concept', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'review':
            next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'review', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'formula':
            next = [...prev.slice(0, i), { id, kind: 'math', text: rest }, ...prev.slice(i + 1)];
            break;
          case 'muted':
            next = [...prev.slice(0, i), { id, kind: 'paragraph', text: rest, variant: 'muted' }, ...prev.slice(i + 1)];
            break;
          case 'fine':
            next = [...prev.slice(0, i), { id, kind: 'paragraph', text: rest, variant: 'fine' }, ...prev.slice(i + 1)];
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

  useLayoutEffect(() => {
    if (editorMode !== 'edit' || slashMenu) {
      setTypoRail(null);
      return;
    }
    if (!surfaceFocusBlockId) {
      setTypoRail(null);
      return;
    }
    const blk = blocks.find((b) => b.id === surfaceFocusBlockId);
    if (!blk || (blk.kind !== 'title' && blk.kind !== 'section' && blk.kind !== 'paragraph')) {
      setTypoRail(null);
      return;
    }
    const wrap = editorRootRef.current?.querySelector<HTMLElement>(
      `[data-nb-surface-block][data-block-id="${surfaceFocusBlockId}"]`,
    );
    if (!wrap) {
      setTypoRail(null);
      return;
    }
    const level = getBlockLevel(blk);
    if (level === null) {
      setTypoRail(null);
      return;
    }
    const r = wrap.getBoundingClientRect();
    const railW = 96;
    const railH = 26;
    const m = 10;
    // Small pill tucked to the block’s top-right — stays near the line, not floating mid-air.
    let top = Math.round(r.top + 2);
    let left = Math.round(r.right - railW - 6);
    if (typeof window !== 'undefined') {
      if (left < m) left = Math.round(r.left + 6);
      left = Math.min(Math.max(m, left), window.innerWidth - railW - m);
      top = Math.min(Math.max(m, top), window.innerHeight - railH - m);
    } else {
      left = Math.max(m, left);
    }
    setTypoRail({ top, left, blockId: surfaceFocusBlockId, level });
  }, [editorMode, slashMenu, surfaceFocusBlockId, blocks]);

  const slashFiltered = useMemo(
    () => (slashMenu ? getSlashFiltered(slashMenu.query) : []),
    [slashMenu],
  );

  const previewLines = useMemo(() => {
    const body = content.body ?? '';
    return body.split(/\r?\n/).map(parseNotebookLine);
  }, [content.body]);

  const fontStack = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  const typeScale = useMemo(() => {
    const ratio = 1.25;
    const level3 = 18;
    const step = (delta: number) => Number((level3 * Math.pow(ratio, delta)).toFixed(2));
    return {
      ratio,
      l1: step(2),
      l2: step(1),
      l3: step(0),
      l4: step(-1),
      l5: step(-2),
      s1: 32,
      s2: 24,
      s3: 18,
      s4: 14,
      s5: 10,
    };
  }, []);

  const writingColumnStyle = useMemo(
    (): CSSProperties => ({
      maxWidth: 'min(600px, 100%)',
      margin: '0 auto',
      width: '100%',
      paddingLeft: 'clamp(20px, 4vw, 44px)',
      paddingRight: 'clamp(20px, 4vw, 44px)',
    }),
    [],
  );

  const editorSurfaceStyle = useMemo(
    (): CSSProperties => ({
      position: 'relative',
      width: '100%',
      ...(context === 'free-space' ? {} : { minHeight: '420px' }),
      boxSizing: 'border-box',
      backgroundColor: 'rgba(255,255,255,0.018)',
      backgroundImage: writingSurfaceBackground.image,
      backgroundSize: writingSurfaceBackground.size,
      color: notebookInk.primary,
      fontSize: `${typeScale.l3}px`,
      lineHeight: 1.88,
      letterSpacing: '0.005em',
      fontFamily: fontStack,
      fontFeatureSettings: '"kern" 1, "liga" 1',
      border: '1px solid rgba(255,255,255,0.055)',
      borderRadius: 22,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 54px rgba(0,0,0,0.18)',
      paddingTop: '18px',
      paddingBottom: '88px',
      outline: 'none',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      textRendering: 'optimizeLegibility',
      transition: 'color 0.22s ease, background-image 0.28s ease, border-color 0.24s ease, box-shadow 0.24s ease',
    }),
    [context, fontStack, writingSurfaceBackground, notebookInk.primary, typeScale.l3],
  );

  const contextSummaryChips = useMemo(
    () =>
      [
        contextData.linkedNotes.length ? `${contextData.linkedNotes.length} notes` : null,
        contextData.connectedMistakes.length ? `${contextData.connectedMistakes.length} mistakes` : null,
        contextData.references.length ? `${contextData.references.length} refs` : null,
      ].filter(Boolean) as string[],
    [contextData],
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
          const variantMatch =
            transformed.kind !== 'paragraph' || block.kind !== 'paragraph'
              ? true
              : (transformed.variant ?? undefined) === (block.variant ?? undefined);
          const sameShape =
            transformed.kind === block.kind &&
            transformed.text === block.text &&
            transformed.id === block.id &&
            variantMatch;
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
          (block.kind !== 'task' || (edited.kind === 'task' && edited.checked === block.checked)) &&
          (block.kind !== 'ordered' || (edited.kind === 'ordered' && edited.number === block.number));
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
        const filled = next.length === 0 ? parseBodyToBlocks('') : next;
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

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        if (block.kind === 'divider') return;
        const prompt = normalizeRecallPromptText(block.text);
        if (!prompt || !onCreateRecallItem) return;
        e.preventDefault();
        onCreateRecallItem(prompt);
        return;
      }

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.repeat) {
        const lv = getBlockLevel(block);
        if (lv !== null) {
          e.preventDefault();
          const nextLv: 1 | 2 | 3 | 4 | 5 =
            e.key === 'ArrowDown' ? (lv === 5 ? 1 : ((lv + 1) as 1 | 2 | 3 | 4 | 5)) : lv === 1 ? 5 : ((lv - 1) as 1 | 2 | 3 | 4 | 5);
          applyBlockLevel(id, nextLv);
          return;
        }
      }

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
            ? {
                id: block.id,
                kind: 'paragraph',
                text: nextText,
                ...(block.variant ? { variant: block.variant } : {}),
              }
            : block.kind === 'title'
              ? { id: block.id, kind: 'title', text: nextText }
              : block.kind === 'section'
                ? { id: block.id, kind: 'section', text: nextText }
                : block.kind === 'ordered'
                  ? { id: block.id, kind: 'ordered', number: block.number, text: nextText }
                : block.kind === 'quote'
                  ? { id: block.id, kind: 'quote', text: nextText }
                  : block.kind === 'task'
                    ? { id: block.id, kind: 'task', text: nextText, checked: block.checked }
                    : block.kind === 'callout'
                      ? { id: block.id, kind: 'callout', tone: block.tone, text: nextText }
                      : { id: block.id, kind: 'math', text: nextText };
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
            block.kind === 'ordered' ||
            block.kind === 'quote' ||
            block.kind === 'task' ||
            block.kind === 'callout' ||
            block.kind === 'math') &&
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

        if (
          block.kind === 'title' ||
          block.kind === 'section' ||
          block.kind === 'ordered' ||
          block.kind === 'quote' ||
          block.kind === 'task' ||
          block.kind === 'callout' ||
          block.kind === 'math'
        ) {
          const before = text.slice(0, offset);
          const after = autoCapitalizeParagraphStart(text.slice(offset));
          const updated = { ...block, text: before } as Block;
          const nextBlock: Block =
            block.kind === 'ordered' && before.trim() !== ''
              ? { id: newBlockId(), kind: 'ordered', number: block.number + 1, text: after }
              : { id: newBlockId(), kind: 'paragraph', text: after };
          const next = [...blocks.slice(0, index), updated, nextBlock, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
          return;
        }

        const before = text.slice(0, offset);
        const after = autoCapitalizeParagraphStart(text.slice(offset));
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
            block.kind === 'ordered' ||
            block.kind === 'quote' ||
            block.kind === 'task' ||
            block.kind === 'callout' ||
            block.kind === 'math') &&
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
      applyBlockLevel,
      content,
      onChange,
      onCreateRecallItem,
      focusEditableBlock,
    ],
  );

  const nbMotionCss = `
@keyframes nbSlashIn {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes nbMorphGlow {
  0% { box-shadow: 0 0 0 0 transparent; }
  45% { box-shadow: 0 0 0 1px ${tokens.accent}14, 0 8px 28px ${tokens.accentGlow}18; }
  100% { box-shadow: none; }
}
[data-nb-surface-block][data-nb-pulse="1"] { animation: nbMorphGlow 0.44s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
[data-nb-body-scroll] {
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.14) transparent;
}
[data-nb-body-scroll]::-webkit-scrollbar { width: 5px; height: 5px; }
[data-nb-body-scroll]::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 99px;
}
[data-nb-body-scroll]::-webkit-scrollbar-track { background: transparent; }
`;

  // Host notification: when running inside Free Space, surface edit vs preview to the canvas host.
  useEffect(() => {
    if (context !== 'free-space' || !onEditingChange) return;
    onEditingChange(editorMode === 'edit');
  }, [context, editorMode, onEditingChange]);

  return (
    <Fragment>
      <style dangerouslySetInnerHTML={{ __html: nbMotionCss }} />
      <div
        ref={shellRef}
        style={{
          padding: context === 'free-space' ? '18px 18px 18px' : '18px 24px 28px',
          ...(context === 'free-space'
            ? {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                boxSizing: 'border-box',
              }
            : { minHeight: '420px' }),
          borderRadius: '22px',
          position: 'relative',
          backgroundColor: `${tokens.cardBg}f2`,
          backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05), transparent 36%),
            linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 34%)
          `,
          boxShadow: `
            0 26px 72px rgba(0,0,0,0.34),
            0 0 0 1px rgba(255,255,255,0.075),
            inset 0 1px 0 rgba(255,255,255,0.06)
          `,
        }}
      >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '18px',
          flexWrap: 'wrap',
          padding: '4px 6px 14px',
          marginBottom: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
          ...(context === 'free-space' ? { flexShrink: 0 } : {}),
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: notebookInk.ghost,
              opacity: 0.92,
            }}
          >
            Thinking surface
          </div>

          <div
            style={{
              fontSize: '13px',
              color: notebookInk.secondary,
              letterSpacing: '0.01em',
              lineHeight: 1.55,
              maxWidth: '420px',
            }}
          >
            {objectTitle && objectTitle !== 'Notebook' ? objectTitle : 'Notebook'}{hasNotebookContext
              ? ` · ${contextData.totalCount} connected`
              : ''}{' '}
            <span style={{ color: notebookInk.muted }}>
              Slash commands · Alt + ↑↓ for levels · Cmd/Ctrl + Shift + R for recall
            </span>
          </div>

          {contextSummaryChips.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {contextSummaryChips.map(chip => (
                <div
                  key={chip}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    color: notebookInk.secondary,
                    padding: '6px 9px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.035)',
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: '8px',
            flexShrink: 0,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {context === 'free-space' ? (
            <button
              type="button"
              disabled={!onCreateRecallItem || !activeRecallPrompt}
              onClick={() => {
                if (!onCreateRecallItem || !activeRecallPrompt) return;
                onCreateRecallItem(activeRecallPrompt);
              }}
              style={{
                border: '1px solid rgba(255,255,255,0.06)',
                background: onCreateRecallItem && activeRecallPrompt
                  ? `${tokens.accent}16`
                  : 'rgba(255,255,255,0.02)',
                color: onCreateRecallItem && activeRecallPrompt ? tokens.accent : notebookInk.ghost,
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '7px 10px',
                cursor: onCreateRecallItem && activeRecallPrompt ? 'pointer' : 'default',
                opacity: onCreateRecallItem && activeRecallPrompt ? 1 : 0.62,
                transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
              }}
              title="Create a connected recall item from the active block"
            >
              Create recall
            </button>
          ) : null}
          {context === 'free-space' ? (
            <button
              type="button"
              disabled={!hasNotebookContext}
              onClick={() => setContextPanelOpen(v => !v)}
              style={{
                border: '1px solid rgba(255,255,255,0.06)',
                background: !hasNotebookContext
                  ? 'rgba(255,255,255,0.02)'
                  : showNotebookContext
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(255,255,255,0.03)',
                color: !hasNotebookContext
                  ? notebookInk.ghost
                  : showNotebookContext
                    ? notebookInk.primary
                    : notebookInk.secondary,
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '7px 10px',
                cursor: !hasNotebookContext ? 'default' : 'pointer',
                opacity: !hasNotebookContext ? 0.62 : 1,
                transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
              }}
            >
              {!hasNotebookContext ? 'No context yet' : showNotebookContext ? 'Hide context' : 'Show context'}
            </button>
          ) : null}
          <div
            style={{
              display: 'inline-flex',
              padding: '3px',
              gap: '2px',
              borderRadius: '10px',
              background: 'rgba(0,0,0,0.16)',
              border: '1px solid rgba(255,255,255,0.055)',
            }}
          >
            {(['edit', 'preview'] as const).map((mode) => {
              const active = editorMode === mode;
              const label = mode === 'edit' ? 'Edit' : 'Preview';
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEditorMode(mode)}
                  style={{
                    border: 'none',
                    background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                    color: active ? notebookInk.primary : notebookInk.ghost,
                    borderRadius: '7px',
                    fontSize: '10px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '6px 11px',
                    cursor: 'pointer',
                    opacity: active ? 1 : 0.82,
                    transition: 'background 0.18s ease, color 0.18s ease, opacity 0.18s ease',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div
            style={{
              display: 'inline-flex',
              padding: '3px',
              gap: '2px',
              borderRadius: '10px',
              background: 'rgba(0,0,0,0.12)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {(['blank', 'ruled', 'grid'] as const).map((style) => {
              const active = paperStyle === style;

              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => onChange({ ...content, paperStyle: style })}
                  style={{
                    border: 'none',
                    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                    color: active ? notebookInk.secondary : notebookInk.ghost,
                    borderRadius: '7px',
                    fontSize: '9px',
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    padding: '5px 9px',
                    cursor: 'pointer',
                    opacity: active ? 1 : 0.78,
                    transition: 'background 0.18s ease, color 0.18s ease, opacity 0.18s ease',
                  }}
                >
                  {style}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {editorMode === 'edit' && typoRail && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-nb-typo-rail
              role="toolbar"
              aria-label="Text scale"
              style={{
                position: 'fixed',
                zIndex: 10045,
                top: typoRail.top,
                left: typoRail.left,
                display: 'flex',
                alignItems: 'center',
                gap: '1px',
                padding: '2px 4px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(12,14,18,0.82)',
                backdropFilter: 'blur(12px) saturate(1.1)',
                WebkitBackdropFilter: 'blur(12px) saturate(1.1)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                opacity: 0.55,
                transition: 'opacity 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.opacity = '0.55';
              }}
            >
              {([1, 2, 3, 4, 5] as const).map((lv) => {
                const on = typoRail.level === lv;
                return (
                  <button
                    key={lv}
                    type="button"
                    title={
                      lv === 1
                        ? 'Title'
                        : lv === 2
                          ? 'Section'
                          : lv === 3
                            ? 'Body'
                            : lv === 4
                              ? 'Subtle'
                              : 'Fine'
                    }
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      applyBlockLevel(typoRail.blockId, lv);
                    }}
                    style={{
                      border: 'none',
                      borderRadius: '5px',
                      width: '18px',
                      height: '20px',
                      cursor: 'pointer',
                      fontFamily: "'Space Grotesk', monospace",
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: on ? notebookInk.primary : notebookInk.ghost,
                      background: on ? 'rgba(255,255,255,0.1)' : 'transparent',
                      opacity: on ? 1 : 0.72,
                      transition: 'background 0.16s ease, color 0.16s ease, opacity 0.16s ease',
                    }}
                  >
                    {lv}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}

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

      <NotebookBodyScroll enabled={context === 'free-space'} scrollRef={notebookBodyScrollRef}>
      <div
        style={{
          position: 'relative',
          display: showNotebookContext && canDockContext ? 'grid' : 'block',
          gridTemplateColumns: showNotebookContext && canDockContext ? 'minmax(0, 1fr) 232px' : undefined,
          gap: showNotebookContext && canDockContext ? '16px' : undefined,
          minHeight: context === 'free-space' ? '100%' : undefined,
        }}
      >
      {editorMode === 'edit' ? (
        <div
          ref={editorRootRef}
          data-fw-cmd-ignore="1"
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
            const prevKind = index > 0 ? blocks[index - 1]!.kind : undefined;
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
                    margin: '28px 0',
                    outline: 'none',
                    borderRadius: '10px',
                    transition:
                      'opacity 0.26s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.26s ease, box-shadow 0.28s ease',
                    boxShadow:
                      focusedDividerId === block.id
                        ? `0 0 24px ${tokens.accent}10, inset 0 0 0 1px ${tokens.accent}14`
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
                      opacity: focusedDividerId === block.id ? 0.82 : 0.38,
                      boxShadow:
                        focusedDividerId === block.id ? `0 0 16px ${tokens.accent}12` : 'none',
                      transition: 'opacity 0.24s ease, box-shadow 0.28s ease',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'title') {
              const titleMarginTop = index === 0 ? 0 : typeScale.s1;
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={blockSurfaceChrome(block.id)}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Untitled"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: notebookInk.headline,
                      fontSize: `${typeScale.l1}px`,
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                      lineHeight: 1.16,
                      margin: `${titleMarginTop}px 0 ${typeScale.s2}px`,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'section') {
              const secTop =
                index === 0 ? typeScale.s5 : prevKind === 'title' ? typeScale.s3 : prevKind === 'section' ? typeScale.s4 : typeScale.s2;
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={blockSurfaceChrome(block.id)}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Section label…"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: notebookInk.section,
                      fontSize: `${typeScale.l2}px`,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.32,
                      margin: `${secTop}px 0 ${typeScale.s3}px`,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'ordered') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    margin: `${prevKind === 'title' ? typeScale.s4 : typeScale.s3}px 0`,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(26, String(block.number).length * 10 + 8)}px`,
                      flexShrink: 0,
                      textAlign: 'right',
                      color: notebookInk.muted,
                      fontSize: `${typeScale.l4}px`,
                      fontWeight: 600,
                      lineHeight: 1.8,
                      paddingTop: '1px',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {block.number}.
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EditableLine
                      id={block.id}
                      text={block.text}
                      tokens={tokens}
                      placeholder="List item…"
                      onUpdate={updateBlockText}
                      onFocusIndex={setFocusIndexById}
                      onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: notebookInk.primary,
                        fontSize: `${typeScale.l3}px`,
                        fontWeight: 400,
                        lineHeight: 1.84,
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

            if (block.kind === 'task') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '12px',
                    margin: `${prevKind === 'title' ? 12 : 14}px 0`,
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
                      border: `1px solid ${
                        block.checked ? `${tokens.accent}cc` : 'rgba(255,255,255,0.1)'
                      }`,
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
                        : 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
                      placeholder="Checklist line…"
                      onUpdate={updateBlockText}
                      onFocusIndex={setFocusIndexById}
                      onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: notebookInk.primary,
                      fontSize: `${typeScale.l3}px`,
                        fontWeight: 400,
                      lineHeight: 1.84,
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
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    margin: `${typeScale.s3 + 6}px 0`,
                    paddingLeft: '26px',
                    borderLeft: `1px solid rgba(255,255,255,0.1)`,
                    boxShadow: `-6px 0 24px rgba(0,0,0,0.12)`,
                    transition: 'border-color 0.24s ease, box-shadow 0.26s ease',
                  }}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Pull quote…"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: notebookInk.secondary,
                      fontSize: `${typeScale.l3}px`,
                      fontStyle: 'italic',
                      fontWeight: 400,
                      lineHeight: 1.84,
                      margin: 0,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'callout') {
              const toneColor =
                block.tone === 'concept'
                  ? tokens.accent
                  : block.tone === 'summary'
                    ? notebookInk.secondary
                    : notebookInk.muted;
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2}px 0`,
                    padding: '15px 16px 15px',
                    borderRadius: '16px',
                    border: `1px solid ${tokens.cardBorder}`,
                    background: `linear-gradient(180deg, ${tokens.cardBg}ee 0%, ${tokens.wellBg}d0 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      fontSize: `${typeScale.l5}px`,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: toneColor,
                      marginBottom: `${typeScale.s5 - 2}px`,
                    }}
                  >
                    {calloutLabel(block.tone)}
                  </div>
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder={`${calloutLabel(block.tone)}…`}
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: notebookInk.primary,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 500,
                      lineHeight: 1.78,
                      margin: 0,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'math') {
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2}px 0`,
                    padding: '15px 18px',
                    borderRadius: '16px',
                    border: `1px solid ${tokens.cardBorder}`,
                    background: `linear-gradient(180deg, ${tokens.wellBg}ee 0%, ${tokens.cardBg}c8 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      fontSize: `${typeScale.l5}px`,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: notebookInk.ghost,
                      marginBottom: `${typeScale.s5 - 2}px`,
                    }}
                  >
                    Formula
                  </div>
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="x = ..."
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: notebookInk.headline,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 500,
                      lineHeight: 1.78,
                      letterSpacing: '0.02em',
                      fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
                      margin: 0,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            const paraMuted = block.variant === 'muted';
            const paraFine = block.variant === 'fine';
            const paraTop =
              index === 0 ? 0 : prevKind === 'title' ? typeScale.s5 : prevKind === 'section' ? typeScale.s5 : typeScale.s5;
            const useStartWritingPlaceholder =
              block.text === '' &&
              !paraFine &&
              !paraMuted &&
              ((isStarterNotebook && index === 1) || (isLegacySingleEmptyParagraph && index === 0));
            const paragraphPlaceholder = useStartWritingPlaceholder
              ? 'Start writing...'
              : paraFine
                ? 'Fine print…'
                : paraMuted
                  ? 'Softer emphasis…'
                  : 'Write…';
            return (
              <div
                key={block.id}
                data-nb-surface-block
                data-block-id={block.id}
                data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                style={blockSurfaceChrome(block.id)}
              >
                <EditableLine
                  id={block.id}
                  text={block.text}
                  tokens={tokens}
                  placeholder={paragraphPlaceholder}
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: paraFine ? notebookInk.muted : paraMuted ? notebookInk.secondary : notebookInk.primary,
                    fontSize: paraFine ? `${typeScale.l5}px` : paraMuted ? `${typeScale.l4}px` : `${typeScale.l3}px`,
                    fontWeight: paraMuted ? 500 : 400,
                    lineHeight: paraFine ? 1.7 : 1.84,
                    letterSpacing: paraFine ? '0.024em' : '0.004em',
                    margin: `${paraTop}px 0 ${typeScale.s4 - 2}px`,
                    opacity: paraFine ? 0.9 : paraMuted ? 0.94 : 1,
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
          {(content.body ?? '').trim() === '' ? (
            <>
              <div
                style={{
                  fontSize: `${typeScale.l1}px`,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.16,
                  margin: `0 0 ${typeScale.s2}px`,
                  color: notebookInk.headline,
                }}
              >
                <span style={{ color: notebookInk.muted, fontWeight: 600 }}>Untitled</span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: `${typeScale.l3}px`,
                  lineHeight: 1.84,
                  color: notebookInk.muted,
                  letterSpacing: '0.005em',
                }}
              >
                Start writing...
              </p>
            </>
          ) : null}
          {(content.body ?? '').trim() === ''
            ? null
            : previewLines.map((line, index) => {
            const lineKey =
              line.kind === 'blank'
                ? `blank-${index}`
                : line.kind === 'divider'
                  ? `divider-${index}`
                  : `${line.kind}-${index}-${line.text.slice(0, 24)}`;
            const prevLine = index > 0 ? previewLines[index - 1] : undefined;
            const prevKind =
              prevLine && prevLine.kind !== 'blank' ? prevLine.kind : undefined;
            if (line.kind === 'blank') {
              return <div key={`blank-${index}`} style={{ height: '14px' }} />;
            }
            if (line.kind === 'title') {
              const titleMarginTop = index === 0 ? 0 : typeScale.s1;
              const showPreviewUntitled = line.text.trim() === '';
              return (
                <div
                  key={lineKey}
                  style={{
                    fontSize: `${typeScale.l1}px`,
                    fontWeight: 700,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.16,
                    margin: `${titleMarginTop}px 0 ${typeScale.s2}px`,
                    color: notebookInk.headline,
                  }}
                >
                  {showPreviewUntitled ? (
                    <span style={{ color: notebookInk.muted, fontWeight: 600 }}>Untitled</span>
                  ) : (
                    line.text
                  )}
                </div>
              );
            }
            if (line.kind === 'section') {
              const secTop =
                index === 0 ? typeScale.s5 : prevKind === 'title' ? typeScale.s3 : prevKind === 'section' ? typeScale.s4 : typeScale.s2;
              return (
                <div
                  key={lineKey}
                  style={{
                    fontSize: `${typeScale.l2}px`,
                    fontWeight: 600,
                    lineHeight: 1.32,
                    letterSpacing: '-0.02em',
                    margin: `${secTop}px 0 ${typeScale.s3}px`,
                    color: notebookInk.section,
                  }}
                >
                  {line.text}
                </div>
              );
            }
            if (line.kind === 'divider') {
              return (
                <div
                  key={lineKey}
                  style={{
                    height: '1px',
                    margin: '28px 0',
                    background: tokens.divider,
                    opacity: 0.48,
                  }}
                  role="separator"
                />
              );
            }
            if (line.kind === 'ordered') {
              return (
                <div
                  key={lineKey}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    margin: `${prevKind === 'title' ? typeScale.s4 : typeScale.s3}px 0`,
                    color: notebookInk.primary,
                  }}
                >
                  <span
                    style={{
                      width: `${Math.max(26, String(line.number).length * 10 + 8)}px`,
                      flexShrink: 0,
                      textAlign: 'right',
                      color: notebookInk.muted,
                      fontSize: `${typeScale.l4}px`,
                      fontWeight: 600,
                      lineHeight: 1.8,
                      paddingTop: '1px',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {line.number}.
                  </span>
                  <span
                    style={{
                      flex: 1,
                      whiteSpace: 'pre-wrap',
                      fontSize: `${typeScale.l3}px`,
                      lineHeight: 1.84,
                    }}
                  >
                    {line.text}
                  </span>
                </div>
              );
            }
            if (line.kind === 'task') {
              return (
                <div
                  key={lineKey}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '12px',
                    margin: `${prevKind === 'title' ? typeScale.s4 : typeScale.s3}px 0`,
                    color: notebookInk.primary,
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
                      border: `1px solid ${line.checked ? `${tokens.accent}cc` : 'rgba(255,255,255,0.1)'}`,
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
                        : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                  >
                    {line.checked ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, whiteSpace: 'pre-wrap', fontSize: `${typeScale.l3}px`, lineHeight: 1.84 }}>
                    {line.text}
                  </span>
                </div>
              );
            }
            if (line.kind === 'quote') {
              return (
                <blockquote
                  key={lineKey}
                  style={{
                    margin: `${typeScale.s3 + 6}px 0`,
                    paddingLeft: '26px',
                    borderLeft: `1px solid rgba(255,255,255,0.1)`,
                    boxShadow: `-6px 0 24px rgba(0,0,0,0.12)`,
                    color: notebookInk.secondary,
                    fontStyle: 'italic',
                    fontSize: `${typeScale.l3}px`,
                    lineHeight: 1.84,
                    fontWeight: 400,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.text}
                </blockquote>
              );
            }
            if (line.kind === 'callout') {
              const toneColor =
                line.tone === 'concept'
                  ? tokens.accent
                  : line.tone === 'summary'
                    ? notebookInk.secondary
                    : notebookInk.muted;
              return (
                <div
                  key={lineKey}
                  style={{
                    margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2}px 0`,
                    padding: '15px 16px 15px',
                    borderRadius: '16px',
                    border: `1px solid ${tokens.cardBorder}`,
                    background: `linear-gradient(180deg, ${tokens.cardBg}ee 0%, ${tokens.wellBg}d0 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      fontSize: `${typeScale.l5}px`,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: toneColor,
                      marginBottom: `${typeScale.s5 - 2}px`,
                    }}
                  >
                    {calloutLabel(line.tone)}
                  </div>
                  <div
                    style={{
                      color: notebookInk.primary,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 500,
                      lineHeight: 1.78,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {line.text}
                  </div>
                </div>
              );
            }
            if (line.kind === 'math') {
              return (
                <div
                  key={lineKey}
                  style={{
                    margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2}px 0`,
                    padding: '15px 18px',
                    borderRadius: '16px',
                    border: `1px solid ${tokens.cardBorder}`,
                    background: `linear-gradient(180deg, ${tokens.wellBg}ee 0%, ${tokens.cardBg}c8 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      fontSize: `${typeScale.l5}px`,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: notebookInk.ghost,
                      marginBottom: `${typeScale.s5 - 2}px`,
                    }}
                  >
                    Formula
                  </div>
                  <div
                    style={{
                      color: notebookInk.headline,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 500,
                      lineHeight: 1.78,
                      letterSpacing: '0.02em',
                      fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {line.text}
                  </div>
                </div>
              );
            }
            if (line.kind === 'paragraph') {
              const fine = line.variant === 'fine';
              const muted = line.variant === 'muted';
              const paraTop =
                index === 0 ? 0 : prevKind === 'title' ? typeScale.s5 : prevKind === 'section' ? typeScale.s5 : typeScale.s5;
              return (
                <p
                  key={lineKey}
                  style={{
                    margin: `${paraTop}px 0 ${typeScale.s4 - 2}px`,
                    color: fine ? notebookInk.muted : muted ? notebookInk.secondary : notebookInk.primary,
                    fontSize: fine ? `${typeScale.l5}px` : muted ? `${typeScale.l4}px` : `${typeScale.l3}px`,
                    lineHeight: fine ? 1.7 : 1.84,
                    letterSpacing: fine ? '0.024em' : '0.005em',
                    opacity: fine ? 0.9 : muted ? 0.94 : 1,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.text}
                </p>
              );
            }
            return null;
          })}
          </div>
        </div>
      )}
      {showNotebookContext ? (
        canDockContext ? (
          <NotebookContextSidebar
            tokens={tokens}
            title={objectTitle && objectTitle !== 'Notebook' ? objectTitle : 'Notebook'}
            data={contextData}
            onSelectObject={onRequestSelectObject}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 12,
              zIndex: 4,
              maxWidth: 'calc(100% - 24px)',
            }}
          >
            <NotebookContextSidebar
              tokens={tokens}
              title={objectTitle && objectTitle !== 'Notebook' ? objectTitle : 'Notebook'}
              data={contextData}
              floating
              onClose={() => setContextPanelOpen(false)}
              onSelectObject={onRequestSelectObject}
            />
          </div>
        )
      ) : null}
      </div>
      </NotebookBodyScroll>
    </div>
    </Fragment>
  );
}
