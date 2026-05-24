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
import { EquationBlockEditor } from '../notebook/EquationBlockEditor';
import { StepBlockRenderer } from '../notebook/StepBlockRenderer';
import { MathInputToolbar } from '../notebook/MathInputToolbar';
import { MathRichText } from '../notebook/MathRichText';
import { MathEditableParagraph } from '../notebook/MathEditableParagraph';
import { MathStudyInsight } from '../notebook/MathStudyInsight';
import { KatexPreview } from '../notebook/KatexPreview';
import { textHasMathDelimiters } from '../../lib/notebookMath';
import { nbImageGet, nbImageSet } from '../../lib/notebookImageStore';
import {
  getMathTemplate,
  isLikelyMathLine,
  plainMathToLatex,
  textLikelyHasPlainMath,
  type MathTemplateId,
} from '../../lib/mathInputAssistant';
import { isEmptyMathStarterBody, MATH_CALCULUS_NOTEBOOK_SEED } from '../../lib/mathNotebookSeed';
import {
  getMathSlashFiltered,
  MATH_SLASH_TEMPLATES,
  tryMathTabExpansion,
  type MathSlashId,
} from '../../lib/mathStemShortcuts';
import { notebookBodyToMarkdown, notebookBodyToPlainText } from '../../lib/notebookExport';
import toast from 'react-hot-toast';

type NotebookContent = Extract<ProjectObjectContent, { type: 'notebook' }>;

type ParagraphVariant = 'muted' | 'fine';
type CalloutTone = 'summary' | 'concept' | 'review' | 'definition' | 'theorem' | 'example' | 'mistake';

type NotebookLine =
  | { kind: 'blank' }
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'divider' }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'ordered'; number: number; text: string }
  | { kind: 'task'; checked: boolean; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'step'; text: string }
  | { kind: 'callout'; tone: CalloutTone; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'image-ref'; key: string; alt: string }
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

  // Plain bullet: "- text" without [ ] → bullet block (depth from leading indent)
  const bulletIndentMatch = normalized.match(/^(\s*)- (?!\[)\s*(.*)$/);
  if (bulletIndentMatch) {
    const depth = Math.min(2, Math.floor((bulletIndentMatch[1]?.length ?? 0) / 2));
    return { kind: 'bullet', depth, text: (bulletIndentMatch[2] ?? '').trimEnd() };
  }

  const quoteMatch = trimmed.match(/^>\s?(.*)$/);
  if (quoteMatch && trimmed.startsWith('>')) return { kind: 'quote', text: (quoteMatch[1] ?? '').trimEnd() };

  const calloutMatch = trimmed.match(/^!(summary|concept|review|definition|theorem|example|mistake)\s*(.*)$/i);
  if (calloutMatch) {
    return {
      kind: 'callout',
      tone: calloutMatch[1]!.toLowerCase() as CalloutTone,
      text: (calloutMatch[2] ?? '').trimEnd(),
    };
  }

  const mathMatch = trimmed.match(/^\$\$\s*(.*)$/);
  if (mathMatch) return { kind: 'math', text: (mathMatch[1] ?? '').trimEnd() };

  const imgMatch = trimmed.match(/^::img::([a-z0-9-]+)::(.*)::$/);
  if (imgMatch) return { kind: 'image-ref', key: imgMatch[1]!, alt: imgMatch[2] ?? '' };

  const stepMatch = trimmed.match(/^=>\s*(.*)$/);
  if (stepMatch) return { kind: 'step', text: (stepMatch[1] ?? '').trimEnd() };

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
  | { id: string; kind: 'bullet'; text: string; depth: number }
  | { id: string; kind: 'ordered'; number: number; text: string }
  | { id: string; kind: 'task'; text: string; checked: boolean }
  | { id: string; kind: 'quote'; text: string }
  | { id: string; kind: 'step'; text: string }
  | { id: string; kind: 'callout'; tone: CalloutTone; text: string }
  | { id: string; kind: 'math'; text: string }
  | { id: string; kind: 'image-ref'; key: string; alt: string }
  | { id: string; kind: 'divider' }
  | { id: string; kind: 'paragraph'; text: string; variant?: ParagraphVariant };

let blockIdSeq = 0;
function newBlockId(): string {
  blockIdSeq += 1;
  return `nb-${blockIdSeq}`;
}

function calloutLabel(tone: CalloutTone): string {
  switch (tone) {
    case 'summary':    return 'Summary';
    case 'concept':    return 'Key Concept';
    case 'review':     return 'Review';
    case 'definition': return 'Definition';
    case 'theorem':    return 'Theorem';
    case 'example':    return 'Example';
    case 'mistake':    return 'Mistake';
  }
}

function calloutToneTokens(tone: CalloutTone): { bar: string; bg: string; label: string; glyph: string } {
  switch (tone) {
    case 'concept':    return { bar: '#f59e0b', bg: 'rgba(245,158,11,0.07)', label: '#f59e0b', glyph: '◆' };
    case 'definition': return { bar: '#a78bfa', bg: 'rgba(167,139,250,0.07)', label: '#a78bfa', glyph: ':=' };
    case 'theorem':    return { bar: '#818cf8', bg: 'rgba(129,140,248,0.07)', label: '#818cf8', glyph: '∴' };
    case 'example':    return { bar: '#34d399', bg: 'rgba(52,211,153,0.06)', label: '#34d399', glyph: '→' };
    case 'mistake':    return { bar: '#f87171', bg: 'rgba(248,113,113,0.07)', label: '#f87171', glyph: '✕' };
    case 'summary':    return { bar: '#60a5fa', bg: 'rgba(96,165,250,0.07)', label: '#60a5fa', glyph: '≡' };
    case 'review':     return { bar: '#fb923c', bg: 'rgba(251,146,60,0.07)', label: '#fb923c', glyph: '↩' };
  }
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

function tryAcademicAutoTransform(text: string): { tone: CalloutTone; body: string } | null {
  const m = text.match(
    /^(Definition|Theorem|Lemma|Corollary|Proposition|Proof|Example|Mistake|Error|Note|Concept|Summary|Review)\s*[\uff1a:]\s*(.*)$/i
  );
  if (!m) return null;
  const kw = (m[1] ?? '').toLowerCase();
  const body = (m[2] ?? '').trim();
  if (kw === 'definition') return { tone: 'definition', body };
  if (['theorem','lemma','corollary','proposition','proof'].includes(kw)) return { tone: 'theorem', body };
  if (kw === 'example') return { tone: 'example', body };
  if (kw === 'mistake' || kw === 'error') return { tone: 'mistake', body };
  if (kw === 'note' || kw === 'concept') return { tone: 'concept', body };
  if (kw === 'summary') return { tone: 'summary', body };
  if (kw === 'review') return { tone: 'review', body };
  return null;
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
    case 'bullet':
      return { id, kind: 'bullet', depth: parsed.depth, text: parsed.text };
    case 'divider':
      return { id, kind: 'divider' };
    case 'task':
      return { id, kind: 'task', text: parsed.text, checked: parsed.checked };
    case 'quote':
      return { id, kind: 'quote', text: parsed.text };
    case 'step':
      return { id, kind: 'step', text: parsed.text };
    case 'callout':
      return { id, kind: 'callout', tone: parsed.tone, text: parsed.text };
    case 'math':
      return { id, kind: 'math', text: parsed.text };
    case 'image-ref':
      return { id, kind: 'image-ref', key: parsed.key, alt: parsed.alt };
    case 'paragraph':
      return {
        id,
        kind: 'paragraph',
        text: parsed.text,
        ...(parsed.variant ? { variant: parsed.variant } : {}),
      };
  }
}

/** Reuse block ids when re-parsing so React does not remount focused editables. */
function blockKindsAlign(a: Block, b: Block): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'image-ref' && b.kind === 'image-ref') return a.key === b.key;
  if (a.kind === 'task' && b.kind === 'task') return a.checked === b.checked;
  if (a.kind === 'bullet' && b.kind === 'bullet') return a.depth === b.depth;
  if (a.kind === 'ordered' && b.kind === 'ordered') return true;
  if (a.kind === 'callout' && b.kind === 'callout') return a.tone === b.tone;
  if (a.kind === 'paragraph' && b.kind === 'paragraph') {
    return (a.variant ?? undefined) === (b.variant ?? undefined);
  }
  return true;
}

function parseBodyToBlocks(body: string, prev?: Block[]): Block[] {
  // Empty document: title row + body row (storage is "# \n" — no placeholder text persisted).
  if (body.trim().length === 0) {
    const defaults: Block[] = [
      { id: newBlockId(), kind: 'title', text: '' },
      { id: newBlockId(), kind: 'paragraph', text: '' },
    ];
    if (prev?.length === 2 && prev[0]?.kind === 'title' && prev[1]?.kind === 'paragraph') {
      return [
        { ...defaults[0], id: prev[0].id },
        { ...defaults[1], id: prev[1].id },
      ];
    }
    return defaults;
  }
  const lines = body.split(/\r?\n/);
  return lines.map((line, index) => {
    const fresh = lineToBlock(line);
    const prevAt = prev?.[index];
    if (prevAt && blockKindsAlign(prevAt, fresh)) {
      return { ...fresh, id: prevAt.id };
    }
    const prevByLine = prev?.find((p) => blockToLine(p) === line);
    if (prevByLine && prevByLine.kind === fresh.kind) {
      return { ...fresh, id: prevByLine.id };
    }
    return fresh;
  });
}

function clampCaretOffset(block: Block, offset: number): number {
  if (block.kind === 'divider' || block.kind === 'image-ref') return 0;
  return Math.max(0, Math.min(offset, block.text.length));
}

function blockToLine(b: Block): string {
  switch (b.kind) {
    case 'title':
      return `# ${b.text}`;
    case 'section':
      return `## ${b.text}`;
    case 'ordered':
      return `${b.number}. ${b.text}`;
    case 'bullet':
      return `${'  '.repeat(b.depth)}- ${b.text}`;
    case 'task':
      return `- [${b.checked ? 'x' : ' '}] ${b.text}`;
    case 'quote':
      return `> ${b.text}`;
    case 'step':
      return `=> ${b.text}`;
    case 'callout':
      return `!${b.tone} ${b.text}`;
    case 'math':
      return `$$ ${b.text}`;
    case 'image-ref':
      return `::img::${b.key}::${b.alt}::`;
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
    if (parsed.kind === 'bullet') return { id: blockId, kind: 'bullet', depth: parsed.depth, text: parsed.text };
    if (parsed.kind === 'task')
      return { id: blockId, kind: 'task', text: parsed.text, checked: parsed.checked };
    if (parsed.kind === 'quote') return { id: blockId, kind: 'quote', text: parsed.text };
    if (parsed.kind === 'step') return { id: blockId, kind: 'step', text: parsed.text };
    if (parsed.kind === 'callout') return { id: blockId, kind: 'callout', tone: parsed.tone, text: parsed.text };
    if (parsed.kind === 'math') return { id: blockId, kind: 'math', text: parsed.text };
    if (parsed.kind === 'image-ref') return { id: blockId, kind: 'image-ref', key: parsed.key, alt: parsed.alt };
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
  if (block.kind === 'step') {
    const m = trimmed.match(/^=>\s*(.*)$/);
    return { ...block, text: m ? (m[1] ?? '').trimEnd() : line.trimEnd() };
  }
  if (block.kind === 'callout') {
    const m = trimmed.match(/^!(summary|concept|review|definition|theorem|example|mistake)\s*(.*)$/i);
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
  if (block.kind === 'bullet') {
    return { ...block, text: line.trimEnd() };
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
  if (b.kind === 'divider' || b.kind === 'image-ref') return 0;
  return b.text.length;
}

function getCaretOffsetIn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return el.textContent?.length ?? 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
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
  if (prev.kind === 'divider' || prev.kind === 'image-ref') return next;
  const nextText = next.kind === 'divider' || next.kind === 'image-ref' ? '' : next.text;
  const mergedText = prev.text + nextText;
  switch (prev.kind) {
    case 'title':
      return { id: prev.id, kind: 'title', text: mergedText };
    case 'section':
      return { id: prev.id, kind: 'section', text: mergedText };
    case 'ordered':
      return { id: prev.id, kind: 'ordered', number: prev.number, text: mergedText };
    case 'bullet':
      return { id: prev.id, kind: 'bullet', depth: prev.depth, text: mergedText };
    case 'quote':
      return { id: prev.id, kind: 'quote', text: mergedText };
    case 'step':
      return { id: prev.id, kind: 'step', text: mergedText };
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
function paragraphTextAfterSlashApply(fullParagraphText: string, cmd: SlashCommandId): string {
  const parts = fullParagraphText.split(SOFT_BREAK);
  const p0 = parseSlashFirstSegment(parts[0] ?? '');
  if (!p0) return fullParagraphText;
  const template = cmd in MATH_SLASH_TEMPLATES ? MATH_SLASH_TEMPLATES[cmd as MathSlashId] : null;
  const firstBody = template ?? p0.body;
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
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'divider'
  | 'muted'
  | 'fine'
  | 'definition'
  | 'theorem'
  | 'example'
  | 'mistake'
  | 'concept'
  | 'summary'
  | 'review'
  | 'formula'
  | MathSlashId;

type SlashGroup = 'structure' | 'writing' | 'academic' | 'math';

const SLASH_COMMAND_META: { id: SlashCommandId; label: string; hint: string; group: SlashGroup; glyph: string }[] = [
  // Structure
  { id: 'title',      label: 'Title',      hint: 'Level 1 heading',         group: 'structure', glyph: 'H1' },
  { id: 'section',    label: 'Section',    hint: 'Level 2 heading',         group: 'structure', glyph: 'H2' },
  { id: 'divider',    label: 'Divider',    hint: 'Horizontal rule',         group: 'structure', glyph: '—'  },
  // Writing
  { id: 'bullet',     label: 'Bullet',     hint: 'Unordered list',          group: 'writing',   glyph: '•'  },
  { id: 'ordered',    label: 'List',       hint: 'Numbered list',           group: 'writing',   glyph: '1.' },
  { id: 'task',       label: 'Task',       hint: 'Checkbox item',           group: 'writing',   glyph: '☐'  },
  { id: 'quote',      label: 'Quote',      hint: 'Source / pull quote',     group: 'writing',   glyph: '"'  },
  { id: 'muted',      label: 'Subtle',     hint: 'Softer emphasis',         group: 'writing',   glyph: 'A'  },
  { id: 'fine',       label: 'Fine',       hint: 'Caption / aside',         group: 'writing',   glyph: 'a'  },
  // Academic
  { id: 'definition', label: 'Definition', hint: 'Define a term',           group: 'academic',  glyph: ':=' },
  { id: 'theorem',    label: 'Theorem',    hint: 'Formal result or rule',   group: 'academic',  glyph: '∴'  },
  { id: 'example',    label: 'Example',    hint: 'Worked example',          group: 'academic',  glyph: '→'  },
  { id: 'mistake',    label: 'Mistake',    hint: 'Error to remember',       group: 'academic',  glyph: '✕'  },
  { id: 'concept',    label: 'Concept',    hint: 'Key idea callout',        group: 'academic',  glyph: '◆'  },
  { id: 'summary',    label: 'Summary',    hint: 'Study summary block',     group: 'academic',  glyph: '≡'  },
  { id: 'review',     label: 'Review',     hint: 'Quick revision prompt',   group: 'academic',  glyph: '↩'  },
  // Math
  { id: 'formula',    label: 'Formula',    hint: 'Math equation block',     group: 'math',      glyph: 'Σ'  },
];

const SLASH_GROUP_LABELS: Record<SlashGroup, string> = {
  structure: 'Structure',
  writing:   'Writing',
  academic:  'Academic',
  math:      'Math',
};

function getSlashFiltered(
  query: string,
  mathMode: boolean,
): { id: SlashCommandId; label: string; hint: string; group: SlashGroup; glyph: string }[] {
  const base = SLASH_COMMAND_META.map(c => ({ c, s: fuzzySlashScore(query, c.label, c.hint) }));
  const math = mathMode
    ? getMathSlashFiltered(query).map(c => ({
        c: { id: c.id as SlashCommandId, label: c.label, hint: c.hint, group: 'math' as SlashGroup, glyph: 'Σ' },
        s: 2,
      }))
    : [];
  return [...base, ...math]
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.c);
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
          background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 100%)',
          opacity: 0.14,
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
          background: 'linear-gradient(0deg, rgba(0,0,0,0.16) 0%, transparent 100%)',
          opacity: 0.16,
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
  const focusedRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const isEmpty = text.length === 0;
  const lineHeight = typeof style.lineHeight === 'number' ? style.lineHeight : 1.65;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const domText = el.textContent ?? '';
    if (focusedRef.current) {
      if (domText !== text) {
        const offset = getCaretOffsetIn(el);
        el.textContent = text;
        setCaretOffsetIn(el, Math.min(offset, text.length));
      }
      return;
    }
    if (domText !== text) el.textContent = text;
  }, [text, id]);

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
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
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={(ev) => {
          const raw = ev.currentTarget.textContent ?? '';
          onUpdate(id, raw);
          // Capture the element now — React nullifies ev.currentTarget after the
          // handler returns (async/rAF closures over ev.currentTarget always get null).
          const target = ev.currentTarget;
          requestAnimationFrame(() => onAfterInput?.(target));
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
  objectUpdatedAt?: number;
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

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function ProjectNotebookBlock({
  content,
  tokens,
  onChange,
  objectId,
  objectTitle,
  objectUpdatedAt,
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
  const [paperPopoverOpen, setPaperPopoverOpen] = useState(false);
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [focusAnnouncement, setFocusAnnouncement] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [focusToolbarHovered, setFocusToolbarHovered] = useState(false);
  const [mathToolbarHovered, setMathToolbarHovered] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const focusEditorRootRef = useRef<HTMLDivElement>(null);
  const notebookBodyScrollRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const focusIndexRef = useRef(0);
  const pendingCaretRef = useRef<{ id: string; offset: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Stable ref so onEditingChange reference churn never fires the editing effect
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const notebookPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNotebookContentRef = useRef<NotebookContent | null>(null);

  const flushNotebookPersist = useCallback(() => {
    if (notebookPersistTimerRef.current) {
      clearTimeout(notebookPersistTimerRef.current);
      notebookPersistTimerRef.current = null;
    }
    const pending = pendingNotebookContentRef.current;
    if (!pending) return;
    pendingNotebookContentRef.current = null;
    onChangeRef.current(pending);
  }, []);

  const pushContent = useCallback(
    (next: NotebookContent) => {
      if (next.body === content.body) {
        flushNotebookPersist();
        onChangeRef.current(next);
        return;
      }
      pendingNotebookContentRef.current = next;
      if (notebookPersistTimerRef.current) clearTimeout(notebookPersistTimerRef.current);
      notebookPersistTimerRef.current = setTimeout(flushNotebookPersist, 420);
    },
    [content.body, flushNotebookPersist],
  );

  useEffect(() => () => flushNotebookPersist(), [flushNotebookPersist]);

  const contextData = useMemo(
    () => deriveNotebookContextData(objectId, allObjects),
    [objectId, allObjects],
  );
  const activeNotebookBlock = useMemo(
    () => (surfaceFocusBlockId ? blocks.find((b) => b.id === surfaceFocusBlockId) ?? null : null),
    [blocks, surfaceFocusBlockId],
  );
  const activeRecallPrompt = useMemo(() => {
    const focused = activeNotebookBlock && activeNotebookBlock.kind !== 'divider' && activeNotebookBlock.kind !== 'image-ref'
      ? activeNotebookBlock
      : null;
    const fallback = blocks[focusIndexRef.current];
    const source = focused ?? (fallback && fallback.kind !== 'divider' && fallback.kind !== 'image-ref' ? fallback : null);
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

  const insertImageBlock = useCallback((key: string, alt: string) => {
    const focusedId = surfaceFocusBlockId ?? (blocks.length > 0 ? blocks[blocks.length - 1]!.id : null);
    const newBlock: Block = { id: newBlockId(), kind: 'image-ref', key, alt };
    setBlocks(prev => {
      const idx = focusedId ? prev.findIndex(b => b.id === focusedId) : prev.length - 1;
      const insertIdx = idx < 0 ? prev.length : idx + 1;
      const next = [...prev];
      next.splice(insertIdx, 0, newBlock);
      return next;
    });
  }, [blocks, surfaceFocusBlockId]);

  const handleNotebookPaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items ?? []);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const key = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      nbImageSet(key, dataUrl);
      insertImageBlock(key, '');
    };
    reader.readAsDataURL(file);
  }, [insertImageBlock]);

  const handleWritingAreaDrop = useCallback((e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    e.stopPropagation();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const key = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      nbImageSet(key, dataUrl);
      const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      insertImageBlock(key, cleanName);
    };
    reader.readAsDataURL(file);
  }, [insertImageBlock]);

  const persist = useCallback(
    (next: Block[]) => {
      const normalized = normalizeOrderedSequences(next);
      setBlocks(normalized);
      pushContent({ ...content, body: serializeBlocks(normalized) });
    },
    [content, pushContent],
  );

  const getEditorRoot = useCallback((): HTMLElement | null => {
    if (isFocusModeOpen && focusEditorRootRef.current) return focusEditorRootRef.current;
    return editorRootRef.current;
  }, [isFocusModeOpen]);

  const isNotebookEditorFocused = useCallback((): boolean => {
    const active = document.activeElement;
    if (!active) return false;
    return !!(
      editorRootRef.current?.contains(active) ||
      focusEditorRootRef.current?.contains(active)
    );
  }, []);

  const captureCaretForBlock = useCallback(
    (blockId: string): number | null => {
      const root = getEditorRoot();
      if (!root) return null;
      const el = root.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`);
      if (!el) return null;
      const active = document.activeElement;
      if (active !== el && !el.contains(active)) return null;
      return getCaretOffsetIn(el);
    },
    [getEditorRoot],
  );

  const scheduleCaret = useCallback((block: Block, offset: number) => {
    pendingCaretRef.current = { id: block.id, offset: clampCaretOffset(block, offset) };
  }, []);

  const applyBlockLevel = useCallback(
    (blockId: string, level: 1 | 2 | 3 | 4 | 5) => {
      const caretBefore = captureCaretForBlock(blockId);
      const prev = blocksRef.current;
      const i = prev.findIndex((b) => b.id === blockId);
      if (i === -1) return;
      const cur = prev[i]!;
      if (cur.kind === 'divider' || cur.kind === 'image-ref') return;
      const text = cur.text;
      let nb: Block;
      if (level === 1) nb = { id: blockId, kind: 'title', text };
      else if (level === 2) nb = { id: blockId, kind: 'section', text };
      else if (level === 3) nb = { id: blockId, kind: 'paragraph', text };
      else if (level === 4) nb = { id: blockId, kind: 'paragraph', text, variant: 'muted' };
      else nb = { id: blockId, kind: 'paragraph', text, variant: 'fine' };
      const next = [...prev.slice(0, i), nb, ...prev.slice(i + 1)];
      setMorphPulseId(blockId);
      setBlocks(next);
      pushContent({ ...content, body: serializeBlocks(next) });
      if (caretBefore !== null) scheduleCaret(nb, caretBefore);
    },
    [content, pushContent, captureCaretForBlock, scheduleCaret],
  );

  useEffect(() => {
    const body = content.body ?? '';
    setBlocks((prev) => {
      if (serializeBlocks(prev) === body) return prev;
      if (isNotebookEditorFocused()) return prev;
      return parseBodyToBlocks(body, prev);
    });
  }, [content.body, isNotebookEditorFocused]);

  useEffect(() => {
    if (!morphPulseId) return;
    const t = window.setTimeout(() => setMorphPulseId(null), 420);
    return () => window.clearTimeout(t);
  }, [morphPulseId]);

  useEffect(() => {
    if (!isFocusModeOpen) return;
    // Show announcement for 1.8s
    setFocusAnnouncement(true);
    const t = setTimeout(() => setFocusAnnouncement(false), 1800);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFocusModeOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [isFocusModeOpen]);

  const paperStyle = content.paperStyle ?? 'ruled';
  const notebookSurface = content.notebookSurface ?? 'spatial';
  const isPaperSurface = notebookSurface === 'paper';
  const notebookMode = content.notebookMode ?? 'normal';
  const isMathNotebook = notebookMode === 'math' || notebookMode === 'math-workspace';

  const paperSize = paperStyle === 'grid' ? '36px 36px' : '100% 38px';

  /** Line texture — spatial (dark glass) vs document page (warm paper). */
  const writingSurfaceBackground = useMemo(() => {
    if (isPaperSurface) {
      const edge = `radial-gradient(ellipse 120% 90% at 50% 0%, rgba(255,255,255,0.65) 0%, transparent 62%)`;
      if (paperStyle === 'blank') {
        return { image: edge, size: '100% 100%' };
      }
      if (paperStyle === 'grid') {
        return {
          image: `
            linear-gradient(rgba(28,25,23,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(28,25,23,0.055) 1px, transparent 1px),
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
            rgba(28,25,23,0.07) 37px,
            rgba(28,25,23,0.07) 38px
          ),
          ${edge}
        `,
        size: `${paperSize}, 100% 100%`,
      };
    }
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
  }, [paperStyle, paperSize, isPaperSurface]);

  /** Editorial ink — spatial (light on dark) vs document (dark on paper). */
  const notebookInk = useMemo(
    () =>
      isPaperSurface
        ? {
            headline: '#1c1917',
            primary: '#292524',
            section: '#57534e',
            secondary: '#44403c',
            muted: '#78716c',
            ghost: '#a8a29e',
          }
        : {
            headline: `color-mix(in srgb, ${tokens.textPrimary} 97%, #fafafa 3%)`,
            primary: `color-mix(in srgb, ${tokens.textPrimary} 94%, #f8fafc 6%)`,
            section: `color-mix(in srgb, ${tokens.textSecondary} 90%, #f1f5f9 10%)`,
            secondary: `color-mix(in srgb, ${tokens.textSecondary} 90%, #f8fafc 10%)`,
            muted: `color-mix(in srgb, ${tokens.textMuted} 88%, #f8fafc 12%)`,
            ghost: `color-mix(in srgb, ${tokens.textGhost} 82%, #e2e8f0 18%)`,
          },
    [isPaperSurface, tokens.textPrimary, tokens.textSecondary, tokens.textMuted, tokens.textGhost],
  );

  const ink = notebookInk;

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
    const filtered = getSlashFiltered(token, isMathNotebook);
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
  }, [isMathNotebook]);

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
      // Guard: el can be null/stale when the element unmounted before the rAF fired
      // (e.g. a block morph unmounts the old EditableLine between the input event and the rAF).
      if (!el) return;
      syncSlashFromParagraph(blockId, el);
      ensureNotebookBodyCaretVisible(el);
    },
    [syncSlashFromParagraph, ensureNotebookBodyCaretVisible],
  );

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    const root = focusEditorRootRef.current ?? editorRootRef.current;
    if (!root) return;
    const row = root.querySelector<HTMLElement>(
      `[data-divider-row][data-block-id="${pending.id}"]`,
    );
    if (row) {
      row.focus();
      pendingCaretRef.current = null;
      return;
    }
    const host = root.querySelector<HTMLElement>(`[data-editable-id="${pending.id}"]`);
    if (!host) return;
    setCaretOffsetIn(host, pending.offset);
    pendingCaretRef.current = null;
    requestAnimationFrame(() => {
      ensureNotebookBodyCaretVisible(host);
    });
  }, [blocks, ensureNotebookBodyCaretVisible]);

  const applySlashCommand = useCallback(
    (blockId: string, cmd: SlashCommandId) => {
      const prev = blocksRef.current;
      const i = prev.findIndex((b) => b.id === blockId);
      if (i === -1) return;
      const cur = prev[i]!;
      if (cur.kind !== 'paragraph') return;
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
        case 'bullet':
          next = [...prev.slice(0, i), { id, kind: 'bullet', depth: 0, text: rest }, ...prev.slice(i + 1)];
          break;
        case 'ordered':
          next = [...prev.slice(0, i), { id, kind: 'ordered', number: 1, text: rest }, ...prev.slice(i + 1)];
          break;
        case 'definition':
          next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'definition', text: rest }, ...prev.slice(i + 1)];
          break;
        case 'theorem':
          next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'theorem', text: rest }, ...prev.slice(i + 1)];
          break;
        case 'example':
          next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'example', text: rest }, ...prev.slice(i + 1)];
          break;
        case 'mistake':
          next = [...prev.slice(0, i), { id, kind: 'callout', tone: 'mistake', text: rest }, ...prev.slice(i + 1)];
          break;
        case 'muted':
          next = [...prev.slice(0, i), { id, kind: 'paragraph', text: rest, variant: 'muted' }, ...prev.slice(i + 1)];
          break;
        case 'fine':
          next = [...prev.slice(0, i), { id, kind: 'paragraph', text: rest, variant: 'fine' }, ...prev.slice(i + 1)];
          break;
        case 'step':
          next = [...prev.slice(0, i), { id, kind: 'step', text: rest }, ...prev.slice(i + 1)];
          break;
        case 'divider': {
          const pid = newBlockId();
          next = [...prev.slice(0, i), { id, kind: 'divider' }, { id: pid, kind: 'paragraph', text: rest }, ...prev.slice(i + 1)];
          setSlashMenu(null);
          setMorphPulseId(blockId);
          setBlocks(next);
          pushContent({ ...content, body: serializeBlocks(next) });
          pendingCaretRef.current = { id: pid, offset: rest.length };
          return;
        }
        default: {
          if (!(cmd in MATH_SLASH_TEMPLATES)) return;
          const mathRest = paragraphTextAfterSlashApply(cur.text, cmd);
          next = [...prev.slice(0, i), { id, kind: 'paragraph', text: mathRest }, ...prev.slice(i + 1)];
          break;
        }
      }
      const nb = next[i]!;
      setSlashMenu(null);
      setMorphPulseId(blockId);
      setBlocks(next);
      pushContent({ ...content, body: serializeBlocks(next) });
      pendingCaretRef.current = { id: nb.id, offset: rest.length };
    },
    [content, pushContent],
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
    const wrap = getEditorRoot()?.querySelector<HTMLElement>(
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
  }, [editorMode, slashMenu, surfaceFocusBlockId, blocks, getEditorRoot]);

  const slashFiltered = useMemo(
    () => (slashMenu ? getSlashFiltered(slashMenu.query, isMathNotebook) : []),
    [slashMenu, isMathNotebook],
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
      maxWidth: isMathNotebook ? 'min(760px, 100%)' : isPaperSurface ? 'min(640px, 100%)' : 'min(700px, 100%)',
      margin: '0 auto',
      width: '100%',
      paddingLeft: isPaperSurface ? 'clamp(32px, 6vw, 56px)' : 'clamp(20px, 4vw, 44px)',
      paddingRight: isPaperSurface ? 'clamp(32px, 6vw, 56px)' : 'clamp(20px, 4vw, 44px)',
    }),
    [isMathNotebook, isPaperSurface],
  );

  const editorSurfaceStyle = useMemo((): CSSProperties => {
    if (isPaperSurface) {
      return {
        position: 'relative',
        width: '100%',
        ...(context === 'free-space' ? {} : { minHeight: '420px' }),
        boxSizing: 'border-box',
        backgroundColor: '#f8f6f0',
        backgroundImage: writingSurfaceBackground.image,
        backgroundSize: writingSurfaceBackground.size,
        color: ink.primary,
        fontSize: `${typeScale.l3}px`,
        lineHeight: 1.88,
        letterSpacing: '0.01em',
        fontFamily: fontStack,
        fontFeatureSettings: '"kern" 1, "liga" 1',
        // Use explicit longhand border properties to avoid shorthand/longhand conflict warning
        borderTop: '1px solid rgba(28,25,23,0.08)',
        borderRight: '1px solid rgba(28,25,23,0.08)',
        borderBottom: '1px solid rgba(28,25,23,0.08)',
        borderLeft: isMathNotebook ? '2px solid rgba(120,113,108,0.35)' : '1px solid rgba(28,25,23,0.08)',
        borderRadius: context === 'free-space' ? 12 : 16,
        boxShadow:
          '0 1px 2px rgba(28,25,23,0.04), 0 8px 28px rgba(28,25,23,0.08), inset 0 1px 0 rgba(255,255,255,0.65)',
        paddingTop: '28px',
        paddingBottom: '96px',
        outline: 'none',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
        transition: 'color 0.22s ease, background-image 0.28s ease, border-color 0.24s ease, box-shadow 0.24s ease',
      };
    }
    return {
      position: 'relative',
      width: '100%',
      ...(context === 'free-space' ? {} : { minHeight: '420px' }),
      boxSizing: 'border-box',
      backgroundColor: 'rgba(255,255,255,0.018)',
      backgroundImage: writingSurfaceBackground.image,
      backgroundSize: writingSurfaceBackground.size,
      color: ink.primary,
      fontSize: `${typeScale.l3}px`,
      lineHeight: 1.96,
      letterSpacing: '0.005em',
      fontFamily: fontStack,
      fontFeatureSettings: '"kern" 1, "liga" 1',
      // Use explicit longhand border properties to avoid shorthand/longhand conflict warning
      borderTop: '1px solid rgba(255,255,255,0.055)',
      borderRight: '1px solid rgba(255,255,255,0.055)',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      borderLeft: isMathNotebook ? '2px solid rgba(129,140,248,0.20)' : '1px solid rgba(255,255,255,0.055)',
      borderRadius: 22,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 54px rgba(0,0,0,0.18)',
      paddingTop: '24px',
      paddingBottom: '88px',
      outline: 'none',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      textRendering: 'optimizeLegibility',
      transition: 'color 0.22s ease, background-image 0.28s ease, border-color 0.24s ease, box-shadow 0.24s ease',
    };
  }, [
    context,
    fontStack,
    writingSurfaceBackground,
    ink.primary,
    typeScale.l3,
    isMathNotebook,
    isPaperSurface,
  ]);

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
      const caretBefore = captureCaretForBlock(id);
      const prev = blocksRef.current;
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return;
      const block = prev[i]!;
      if (block.kind === 'divider') return;

      const text = rawText.replace(/\r\n/g, '\n');

      if (block.kind === 'paragraph') {
        const transformed = morphParagraphLine(text, block.id);
        if (Array.isArray(transformed)) {
          const next = [...prev.slice(0, i), ...transformed, ...prev.slice(i + 1)];
          setBlocks(next);
          pushContent({ ...content, body: serializeBlocks(next) });
          const last = transformed[transformed.length - 1]!;
          if (caretBefore !== null && last.kind !== 'divider' && last.kind !== 'image-ref') {
            scheduleCaret(last, caretBefore);
          }
          // Multi-block paste morph: pulse the first non-divider block
          const firstMorphed = transformed.find(b => b.kind !== 'divider' && b.kind !== 'paragraph');
          if (firstMorphed) setMorphPulseId(firstMorphed.id);
          return;
        }
        const variantMatch =
          transformed.kind !== 'paragraph' || block.kind !== 'paragraph'
            ? true
            : (transformed.variant ?? undefined) === (block.variant ?? undefined);
        const transformedText = (transformed as { text?: string }).text ?? '';
        const blockText = (block as { text?: string }).text ?? '';
        const sameShape =
          transformed.kind === block.kind &&
          transformedText === blockText &&
          transformed.id === block.id &&
          variantMatch;
        if (sameShape && text === blockText) return;
        const next = [...prev.slice(0, i), transformed, ...prev.slice(i + 1)];
        setBlocks(next);
        pushContent({ ...content, body: serializeBlocks(next) });
        if (caretBefore !== null && transformed.kind !== 'divider' && transformed.kind !== 'image-ref') {
          scheduleCaret(transformed, caretBefore);
        }
        // Single-block morph: pulse when block kind changes (e.g. paragraph → step/quote/title)
        if (transformed.kind !== 'paragraph') setMorphPulseId(transformed.id);
        return;
      }

      const singleLine = text.includes('\n') ? (text.split('\n')[0] ?? '') : text;
      const edited: Block = applyVisualEditToStructuredBlock(block, singleLine);
      const editedText = (edited as { text?: string }).text ?? '';
      const blockText2 = (block as { text?: string }).text ?? '';
      const same =
        edited.kind === block.kind &&
        editedText === blockText2 &&
        (block.kind !== 'task' || (edited.kind === 'task' && edited.checked === block.checked)) &&
        (block.kind !== 'ordered' || (edited.kind === 'ordered' && edited.number === block.number));
      if (same && text === blockText2) return;
      const next = [...prev.slice(0, i), edited, ...prev.slice(i + 1)];
      setBlocks(next);
      pushContent({ ...content, body: serializeBlocks(next) });
      if (caretBefore !== null) scheduleCaret(edited, caretBefore);
    },
    [content, pushContent, captureCaretForBlock, scheduleCaret],
  );

  const toggleTask = useCallback(
    (id: string) => {
      const prev = blocksRef.current;
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return;
      const block = prev[i]!;
      if (block.kind !== 'task') return;
      const next = [...prev.slice(0, i), { ...block, checked: !block.checked }, ...prev.slice(i + 1)];
      setBlocks(next);
      pushContent({ ...content, body: serializeBlocks(next) });
    },
    [content, pushContent],
  );

  const removeBlockAt = useCallback(
    (index: number) => {
      const prev = blocksRef.current;
      if (index < 0 || index >= prev.length) return;
      const next = [...prev.slice(0, index), ...prev.slice(index + 1)];
      const filled = next.length === 0 ? parseBodyToBlocks('') : next;
      setBlocks(filled);
      pushContent({ ...content, body: serializeBlocks(filled) });
      const focusIdx = Math.max(0, index - 1);
      const focusBlock = filled[focusIdx];
      if (focusBlock && focusBlock.kind !== 'divider' && focusBlock.kind !== 'image-ref') {
        pendingCaretRef.current = {
          id: focusBlock.id,
          offset: focusBlock.text.length,
        };
      }
    },
    [content, pushContent],
  );

  const insertMathSnippet = useCallback(
    (snippet: string) => {
      const blockId = surfaceFocusBlockId;
      if (!blockId) return;
      const blk = blocksRef.current.find(b => b.id === blockId);
      if (!blk || blk.kind === 'divider' || blk.kind === 'image-ref') return;
      if (blk.kind === 'math') {
        const latex = plainMathToLatex(snippet);
        updateBlockText(blockId, latex);
        return;
      }
      const root = getEditorRoot();
      const el = root?.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`);
      const offset = el ? getCaretOffsetIn(el) : blk.text.length;
      const insert = snippet.endsWith(' ') ? snippet : `${snippet} `;
      const newText = blk.text.slice(0, offset) + insert + blk.text.slice(offset);
      updateBlockText(blockId, newText);
      pendingCaretRef.current = { id: blockId, offset: offset + insert.length };
    },
    [surfaceFocusBlockId, updateBlockText, getEditorRoot],
  );

  const applyMathTemplate = useCallback(
    (templateId: MathTemplateId, values: Record<string, string>) => {
      const template = getMathTemplate(templateId);
      if (!template) return;
      const blockId = surfaceFocusBlockId;
      if (blockId) {
        const blk = blocksRef.current.find(b => b.id === blockId);
        if (blk?.kind === 'math') {
          updateBlockText(blockId, template.buildLatex(values));
          return;
        }
      }
      insertMathSnippet(template.buildSimple(values));
    },
    [insertMathSnippet, surfaceFocusBlockId, updateBlockText],
  );

  const focusEditableBlock = useCallback((root: HTMLElement, block: Block, offset: number) => {
    if (block.kind === 'divider') {
      (root.querySelector(`[data-divider-row][data-block-id="${block.id}"]`) as HTMLElement | null)?.focus();
      return;
    }
    if (block.kind === 'image-ref') return;
    const o = clampCaretOffset(block, offset);
    pendingCaretRef.current = { id: block.id, offset: o };
    requestAnimationFrame(() => {
      const el = root.querySelector<HTMLElement>(`[data-editable-id="${block.id}"]`);
      el?.focus();
    });
  }, []);

  const copyNotebook = useCallback(
    async (format: 'markdown' | 'plain') => {
      const body = serializeBlocks(blocksRef.current);
      const payload =
        format === 'markdown' ? notebookBodyToMarkdown(body) : notebookBodyToPlainText(body);
      try {
        await navigator.clipboard.writeText(payload);
        toast.success(format === 'markdown' ? 'Notebook copied as Markdown' : 'Notebook copied as plain text');
      } catch {
        toast.error('Could not copy to clipboard');
      }
    },
    [],
  );

  const handleEditorKeyCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editorMode !== 'edit') return;

      const root = getEditorRoot();
      if (!root) return;
      const blocks = blocksRef.current;
      const sm = slashMenuRef.current;

      if (e.key === 'Tab' && isMathNotebook) {
        const sel = window.getSelection();
        if (sel?.rangeCount) {
          let node: Node | null = sel.anchorNode;
          let editable: HTMLElement | null = null;
          while (node && node !== root) {
            if (node instanceof HTMLElement && node.dataset.editableId) {
              editable = node;
              break;
            }
            node = node.parentNode;
          }
          if (editable) {
            const blockId = editable.dataset.editableId!;
            const blk = blocks.find(b => b.id === blockId);
            if (blk?.kind === 'paragraph' || blk?.kind === 'step') {
              const offset = getCaretOffsetIn(editable);
              const expanded = tryMathTabExpansion(blk.text, offset);
              if (expanded) {
                e.preventDefault();
                updateBlockText(blockId, expanded.text);
                pendingCaretRef.current = { id: blockId, offset: expanded.caret };
                return;
              }
            }
          }
        }
      }

      // Bullet Tab / Shift+Tab — indent / dedent
      if (e.key === 'Tab') {
        const selB = window.getSelection();
        if (selB?.rangeCount) {
          let nodeB: Node | null = selB.anchorNode;
          let editableB: HTMLElement | null = null;
          while (nodeB && nodeB !== root) {
            if (nodeB instanceof HTMLElement && nodeB.dataset.editableId) { editableB = nodeB; break; }
            nodeB = nodeB.parentNode;
          }
          if (editableB) {
            const tabBlockId = editableB.dataset.editableId!;
            const tabBlk = blocks.find(b => b.id === tabBlockId);
            if (tabBlk?.kind === 'bullet') {
              e.preventDefault();
              const newDepth = e.shiftKey ? Math.max(0, tabBlk.depth - 1) : Math.min(2, tabBlk.depth + 1);
              if (newDepth !== tabBlk.depth) {
                const caretBefore = getCaretOffsetIn(editableB);
                const prevBlocks = blocksRef.current;
                const bi = prevBlocks.findIndex(b => b.id === tabBlockId);
                if (bi !== -1) {
                  const nb = { ...tabBlk, depth: newDepth };
                  const next = [...prevBlocks.slice(0, bi), nb, ...prevBlocks.slice(bi + 1)];
                  setBlocks(next);
                  pushContent({ ...content, body: serializeBlocks(next) });
                  scheduleCaret(nb, caretBefore);
                }
              }
              return;
            }
          }
        }
        return;
      }

      if (sm) {
        const filtered = getSlashFiltered(sm.query, isMathNotebook);
        if (e.key === 'Escape') {
          e.preventDefault();
          const { blockId } = sm;
          setSlashMenu(null);
          {
            const prevBlocks = blocksRef.current;
            const i = prevBlocks.findIndex((b) => b.id === blockId);
            if (i !== -1) {
              const b = prevBlocks[i]!;
              if (b.kind === 'paragraph') {
                const nt = stripSlashInvocationForEscape(b.text);
                if (nt !== b.text) {
                  const next = [...prevBlocks.slice(0, i), { ...b, text: nt }, ...prevBlocks.slice(i + 1)];
                  setBlocks(next);
                  pushContent({ ...content, body: serializeBlocks(next) });
                  pendingCaretRef.current = { id: blockId, offset: 0 };
                }
              }
            }
          }
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
                  tb.kind === 'divider' || tb.kind === 'image-ref' ? 0 : e.key === 'ArrowUp' ? tb.text.length : 0;
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
      if (block.kind === 'image-ref') return;

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
          const col = pb.kind === 'divider' || pb.kind === 'image-ref' ? 0 : Math.min(offset, pb.text.length);
          focusEditableBlock(root, pb, col);
          return;
        }

        const ni = nextNavBlockIndex(blocks, index);
        if (ni === -1) return;
        e.preventDefault();
        const nb = blocks[ni]!;
        const col = nb.kind === 'divider' || nb.kind === 'image-ref' ? 0 : Math.min(offset, nb.text.length);
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
                : block.kind === 'bullet'
                  ? { id: block.id, kind: 'bullet', depth: block.depth, text: nextText }
                  : block.kind === 'ordered'
                    ? { id: block.id, kind: 'ordered', number: block.number, text: nextText }
                  : block.kind === 'quote'
                    ? { id: block.id, kind: 'quote', text: nextText }
                    : block.kind === 'step'
                      ? { id: block.id, kind: 'step', text: nextText }
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
            block.kind === 'bullet' ||
            block.kind === 'ordered' ||
            block.kind === 'quote' ||
            block.kind === 'step' ||
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
          block.kind === 'bullet' ||
          block.kind === 'ordered' ||
          block.kind === 'quote' ||
          block.kind === 'step' ||
          block.kind === 'task' ||
          block.kind === 'callout' ||
          block.kind === 'math'
        ) {
          const before = text.slice(0, offset);
          const after = block.kind === 'bullet' ? text.slice(offset) : autoCapitalizeParagraphStart(text.slice(offset));
          const updated = { ...block, text: before } as Block;
          const nextBlock: Block =
            block.kind === 'bullet' && before.trim() !== ''
              ? { id: newBlockId(), kind: 'bullet', depth: block.depth, text: after }
              : block.kind === 'ordered' && before.trim() !== ''
              ? { id: newBlockId(), kind: 'ordered', number: block.number + 1, text: after }
              : block.kind === 'step' && before.trim() !== ''
              ? { id: newBlockId(), kind: 'step', text: after }
              : block.kind === 'task' && before.trim() !== ''
              ? { id: newBlockId(), kind: 'task', checked: false, text: after }
              : { id: newBlockId(), kind: 'paragraph', text: after };
          const next = [...blocks.slice(0, index), updated, nextBlock, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
          return;
        }

        // Academic auto-transform: "Definition: text" → callout block on Enter
        if (block.kind === 'paragraph') {
          const transform = tryAcademicAutoTransform(block.text);
          if (transform) {
            e.preventDefault();
            setBlocks(prev => prev.map(b =>
              b.id === id
                ? { ...b, kind: 'callout' as const, tone: transform.tone, text: transform.body }
                : b
            ));
            pendingCaretRef.current = { id, offset: transform.body.length };
            return;
          }
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

      // ── Arrow text transforms on Space ──────────────────────────────────────
      // ->→  =>→  <=>↔  <=←  <-←
      if (e.key === ' ' && block.kind !== 'divider') {
        const offset = getCaretOffsetIn(editable);
        const text   = editable.textContent ?? '';
        const before = text.slice(0, offset);
        const ARROW_TRANSFORMS: [string, string][] = [
          ['<=>', '↔'],
          ['=>',  '→'],
          ['->',  '→'],
          ['<=',  '←'],
          ['<-',  '←'],
        ];
        for (const [pattern, replacement] of ARROW_TRANSFORMS) {
          if (before.endsWith(pattern)) {
            e.preventDefault();
            const newText = before.slice(0, before.length - pattern.length) + replacement + ' ' + text.slice(offset);
            updateBlockText(id, newText);
            pendingCaretRef.current = {
              id,
              offset: offset - pattern.length + replacement.length + 1,
            };
            return;
          }
        }
      }

      if (e.key === 'Backspace') {
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';

        // Empty bullet at depth > 0 → dedent first; at depth 0 → convert to paragraph
        if (block.kind === 'bullet' && offset === 0 && text.length === 0) {
          e.preventDefault();
          if (block.depth > 0) {
            const nb = { ...block, depth: block.depth - 1 };
            const next = [...blocks.slice(0, index), nb, ...blocks.slice(index + 1)];
            persist(next);
            return;
          }
          const nextBlock: Block = { id: block.id, kind: 'paragraph', text: '' };
          const next = [...blocks.slice(0, index), nextBlock, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
          return;
        }

        if (
          (block.kind === 'title' ||
            block.kind === 'section' ||
            block.kind === 'ordered' ||
            block.kind === 'quote' ||
            block.kind === 'step' ||
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

        if ((block.kind === 'paragraph' || block.kind === 'bullet') && offset === 0 && index > 0) {
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
          pendingCaretRef.current = { id: merged.id, offset: prev.kind === 'image-ref' ? 0 : prev.text.length };
        }
      }
    },
    [
      editorMode,
      isMathNotebook,
      persist,
      removeBlockAt,
      applySlashCommand,
      applyBlockLevel,
      updateBlockText,
      content,
      onChange,
      onCreateRecallItem,
      focusEditableBlock,
      getEditorRoot,
      scheduleCaret,
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
.nb-document-page,
.nb-document-surface {
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.nb-document-page [contenteditable],
.nb-document-surface [contenteditable] {
  user-select: text;
  -webkit-user-select: text;
}
.nb-document-page {
  box-sizing: border-box;
}
`;

  // Host notification: when running inside Free Space, surface edit vs preview to the canvas host.
  // Use ref to avoid re-firing when the callback reference changes (inline arrow in parent render).
  useEffect(() => {
    if (context !== 'free-space' || !onEditingChangeRef.current) return;
    onEditingChangeRef.current(editorMode === 'edit');
  }, [context, editorMode]);

  function renderFocusModeBlocks() {
    return blocks.map((block) => {
      if (block.kind === 'divider') {
        return (
          <div key={block.id} style={{ display: 'flex', alignItems: 'center', margin: '28px 0' }}>
            <div style={{ flex: 1, height: '1px', background: isPaperSurface ? 'rgba(28,25,23,0.12)' : 'rgba(255,248,235,0.12)' }} />
          </div>
        );
      }
      if (block.kind === 'title') {
        return (
          <EditableLine
            key={block.id}
            id={block.id}
            text={block.text}
            tokens={tokens}
            placeholder="Untitled"
            onUpdate={updateBlockText}
            onFocusIndex={setFocusIndexById}
            onAfterInput={(el) => onEditableAfterInput(block.id, el)}
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'Georgia, serif', fontSize: '28px', fontWeight: 400, lineHeight: 1.3,
              color: ink.headline, marginBottom: '40px', caretColor: isPaperSurface ? '#b45309' : tokens.accent,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          />
        );
      }
      if (block.kind === 'section') {
        return (
          <div key={block.id} style={{
            borderBottom: `1px solid ${isPaperSurface ? 'rgba(180,83,9,0.35)' : 'rgba(245,158,11,0.18)'}`,
            paddingBottom: 6, marginBottom: 24,
          }}>
            <EditableLine
              id={block.id}
              text={block.text}
              tokens={tokens}
              placeholder="Section label…"
              onUpdate={updateBlockText}
              onFocusIndex={setFocusIndexById}
              onAfterInput={(el) => onEditableAfterInput(block.id, el)}
              style={{
                width: '100%', border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'Georgia, serif', fontSize: '13px', textTransform: 'uppercase',
                letterSpacing: '0.12em', color: isPaperSurface ? '#b45309' : 'rgba(245,158,11,0.75)', margin: 0,
                caretColor: isPaperSurface ? '#b45309' : tokens.accent, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            />
          </div>
        );
      }
      if (block.kind === 'callout') {
        const ct = calloutToneTokens(block.tone);
        return (
          <div key={block.id} style={{
            borderLeft: `3px solid ${ct.bar}`,
            background: ct.bg,
            padding: '16px 18px 16px 20px',
            borderRadius: '0 8px 8px 0',
            marginBottom: 10,
          }}>
            <EditableLine
              id={block.id}
              text={block.text}
              tokens={tokens}
              placeholder={`${calloutLabel(block.tone)}…`}
              onUpdate={updateBlockText}
              onFocusIndex={setFocusIndexById}
              onAfterInput={(el) => onEditableAfterInput(block.id, el)}
              style={{
                width: '100%', border: 'none', outline: 'none', background: 'transparent',
                color: ink.primary, fontSize: '17px', fontWeight: 400,
                lineHeight: 1.96, margin: 0, caretColor: isPaperSurface ? '#b45309' : tokens.accent,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            />
          </div>
        );
      }
      // image-ref in focus mode: show a simple placeholder
      if (block.kind === 'image-ref') {
        const src = nbImageGet(block.key);
        return src ? (
          <div key={block.id} style={{ margin: '12px 0', userSelect: 'none' }}>
            <img src={src} alt={block.alt} style={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'contain', borderRadius: 8 }} />
          </div>
        ) : null;
      }
      // Default: paragraph (and other block kinds)
      return (
        <EditableLine
          key={block.id}
          id={block.id}
          text={block.text}
          tokens={tokens}
          placeholder="Write…"
          onUpdate={updateBlockText}
          onFocusIndex={setFocusIndexById}
          onAfterInput={(el) => onEditableAfterInput(block.id, el)}
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            color: ink.primary, fontSize: '17px', fontWeight: 400,
            lineHeight: 1.96, marginBottom: '10px', caretColor: isPaperSurface ? '#b45309' : tokens.accent,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        />
      );
    });
  }

  return (
    <Fragment>
      <style dangerouslySetInnerHTML={{ __html: nbMotionCss }} />
      <div
        ref={shellRef}
        onPaste={handleNotebookPaste}
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
          borderRadius: context === 'free-space' ? 0 : '22px',
          position: 'relative',
          ...(context === 'free-space'
            ? {
                backgroundColor: 'transparent',
                backgroundImage: 'none',
                boxShadow: 'none',
              }
            : {
                backgroundColor: `${tokens.cardBg}ff`,
                backgroundImage: `
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04), transparent 36%),
            linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 34%)
          `,
                boxShadow: `
            0 22px 60px rgba(0,0,0,0.28),
            0 0 0 1px rgba(255,255,255,0.09),
            inset 0 1px 0 rgba(255,255,255,0.08)
          `,
              }),
        }}
      >
      <div
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '18px',
          flexWrap: 'wrap',
          padding: '4px 6px 14px',
          marginBottom: '8px',
          borderBottom: `1px solid ${
            notebookMode === 'math-workspace'
              ? 'rgba(129,140,248,0.03)'   // near-invisible — no hard chrome/content boundary
              : isMathNotebook
                ? isPaperSurface
                  ? 'rgba(120,113,108,0.28)'
                  : 'rgba(129,140,248,0.18)'
                : isPaperSurface
                  ? 'rgba(28,25,23,0.08)'
                  : 'rgba(255,255,255,0.055)'
          }`,
          ...(context === 'free-space' ? { flexShrink: 0 } : {}),
          // Scratch mode: header recedes to margin-paper weight at rest, surfaces on hover
          ...(notebookMode === 'scratch' ? {
            opacity: headerHovered ? 0.85 : 0.28,
            transition: 'opacity 0.3s ease',
          } : {}),
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              fontSize: '13px',
              color: ink.secondary,
              letterSpacing: '0.01em',
              lineHeight: 1.55,
              maxWidth: '420px',
            }}
          >
            {objectTitle && objectTitle !== 'Notebook' ? objectTitle : 'Notebook'}{hasNotebookContext
              ? ` · ${contextData.totalCount} connected`
              : ''}
          </div>

          {/* Identity row: icon · subtitle · timestamp */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, opacity: headerHovered ? 1 : 0.65, transition: 'opacity 0.4s ease' }}>
            <button
              type="button"
              onClick={() => {
                const icons = ['◈','∑','✕','→','∂','∫','⊞','◎'];
                const curr = content.icon ?? '◈';
                const next = icons[(icons.indexOf(curr) + 1) % icons.length];
                onChange({ ...content, icon: next });
              }}
              title="Change icon"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, padding: '0 2px',
                opacity: content.icon ? 1 : 0.28, transition: 'opacity 0.15s',
                color: tokens.textSecondary,
              }}
            >{content.icon ?? '◈'}</button>

            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={e => {
                const text = e.currentTarget.textContent?.trim() ?? '';
                if (text !== (content.subtitle ?? '')) onChange({ ...content, subtitle: text || undefined });
              }}
              style={{
                fontSize: 11, color: tokens.textGhost, outline: 'none',
                fontStyle: 'italic', minWidth: 40, maxWidth: 180,
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
              data-placeholder="add a subtitle…"
            >{content.subtitle ?? ''}</div>

            <div style={{ flex: 1 }} />

            {objectUpdatedAt && (
              <span style={{ fontSize: 10, color: tokens.textGhost }}>
                {formatRelativeTime(objectUpdatedAt)}
              </span>
            )}
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
                    color: ink.secondary,
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
          <span style={{ opacity: headerHovered ? 1 : 0.55, transition: 'opacity 0.4s ease' }}>
            <button
              type="button"
              title="Focus mode"
              onClick={() => setIsFocusModeOpen(true)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,248,235,0.65)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,248,235,0.28)'; }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                borderRadius: '4px', color: 'rgba(255,248,235,0.28)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 5V1h4M9 1h4v4M1 9v4h4M9 13h4V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </span>
          <div style={{ display:'flex', flexDirection:'row', alignItems:'flex-end', gap:'8px', flexWrap:'wrap', justifyContent:'flex-end', opacity: headerHovered ? (notebookMode === 'math-workspace' ? 0.75 : 1) : (notebookMode === 'math-workspace' ? 0.08 : 0.32), transition: 'opacity 0.4s ease' }}>
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
                color: onCreateRecallItem && activeRecallPrompt ? tokens.accent : ink.ghost,
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
              title={!hasNotebookContext ? 'No context yet' : showNotebookContext ? 'Hide sources' : 'Show sources'}
              style={{
                border: '1px solid rgba(255,255,255,0.06)',
                background: !hasNotebookContext
                  ? 'rgba(255,255,255,0.02)'
                  : showNotebookContext
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(255,255,255,0.03)',
                color: !hasNotebookContext
                  ? ink.ghost
                  : showNotebookContext
                    ? ink.primary
                    : ink.secondary,
                borderRadius: '10px',
                padding: '7px 10px',
                cursor: !hasNotebookContext ? 'default' : 'pointer',
                opacity: !hasNotebookContext ? 0.62 : 1,
                transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="9.5" y1="1" x2="9.5" y2="13" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copyNotebook('markdown')}
            title="Copy entire notebook (Markdown)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px',
              borderRadius: 4, color: 'rgba(255,248,235,0.42)',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', transition: 'color 0.15s',
            }}
          >Copy</button>
          <button
            type="button"
            onClick={() => void copyNotebook('plain')}
            title="Copy entire notebook (plain text)"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px',
              borderRadius: 4, color: 'rgba(255,248,235,0.32)',
              fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', transition: 'color 0.15s',
            }}
          >Plain</button>
          {notebookMode !== 'math-workspace' && (
            <button
              type="button"
              onClick={() => setEditorMode(editorMode === 'edit' ? 'preview' : 'edit')}
              title={editorMode === 'edit' ? 'Switch to preview' : 'Switch to edit'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
                borderRadius: 4, color: editorMode === 'edit' ? tokens.accent : 'rgba(255,248,235,0.30)',
                fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', transition: 'color 0.15s',
              }}
            >{editorMode === 'edit' ? 'Preview' : 'Edit'}</button>
          )}
          {notebookMode === 'math-workspace' ? (
            /* Math Zone ambient trace — deliberately faint; mode is evident from behavior */
            <span
              title="Math Zone — solving mode"
              style={{
                fontSize: 10, fontWeight: 400, letterSpacing: '0.10em',
                color: '#818cf8', opacity: 0.22, padding: '3px 5px',
                userSelect: 'none',
              }}
            >∑ zone</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (notebookMode !== 'math' && isEmptyMathStarterBody(content.body ?? '')) {
                  onChange({
                    ...content,
                    notebookMode: 'math',
                    paperStyle: 'grid',
                    body: MATH_CALCULUS_NOTEBOOK_SEED,
                  });
                  return;
                }
                const nextMode = notebookMode === 'math' ? 'normal' : 'math';
                onChange({
                  ...content,
                  notebookMode: nextMode,
                  ...(nextMode === 'math' && paperStyle === 'ruled'
                    ? { paperStyle: 'grid' as const }
                    : {}),
                });
              }}
              title={notebookMode === 'math' ? 'Normal mode' : 'Math mode'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
                borderRadius: 4, color: notebookMode === 'math' ? '#818cf8' : 'rgba(255,248,235,0.28)',
                fontWeight: notebookMode === 'math' ? 600 : 400,
                fontSize: 13, transition: 'color 0.15s',
              }}
            >√</button>
          )}
          {notebookMode !== 'math-workspace' && (
            <button
              type="button"
              onClick={() => {
                const next: 'spatial' | 'paper' = notebookSurface === 'paper' ? 'spatial' : 'paper';
                onChange({ ...content, notebookSurface: next });
              }}
              title={notebookSurface === 'paper' ? 'Switch to spatial notebook' : 'Switch to paper page'}
              style={{
                background: notebookSurface === 'paper'
                  ? 'rgba(28,25,23,0.06)'
                  : isPaperSurface
                    ? 'transparent'
                    : 'rgba(255,255,255,0.04)',
                border: notebookSurface === 'paper'
                  ? '1px solid rgba(28,25,23,0.1)'
                  : isPaperSurface
                    ? 'none'
                    : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: 4,
                color: notebookSurface === 'paper' ? ink.secondary : isPaperSurface ? ink.ghost : 'rgba(255,248,235,0.42)',
                fontSize: 10,
                fontWeight: notebookSurface === 'paper' ? 600 : 500,
                letterSpacing: '0.04em',
                transition: 'color 0.15s, background 0.15s',
              }}
            >{notebookSurface === 'paper' ? 'Paper' : 'Spatial'}</button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPaperPopoverOpen(p => !p)}
              title="Line pattern (blank, ruled, grid)"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
                borderRadius: 4, color: 'rgba(255,248,235,0.28)', fontSize: 10, transition: 'color 0.15s',
              }}
            >≡</button>
            {paperPopoverOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 200,
                background: 'rgba(20,16,12,0.95)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '4px', display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                {(['blank','ruled','grid'] as const).map(s => (
                  <button key={s} type="button" onClick={() => { onChange({ ...content, paperStyle: s }); setPaperPopoverOpen(false); }}
                    style={{
                      background: paperStyle === s ? 'rgba(245,158,11,0.12)' : 'none',
                      border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 12px',
                      color: paperStyle === s ? tokens.accent : 'rgba(255,248,235,0.50)',
                      fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap',
                    }}
                  >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            )}
          </div>
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
                background: 'rgba(12,14,18,0.94)',
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
                      color: on ? ink.primary : ink.ghost,
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
                minWidth: Math.max(220, slashMenu.width),
                maxWidth: 310,
                padding: '6px',
                borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.055)',
                background: 'rgba(9,10,13,0.97)',
                boxShadow: `0 18px 44px rgba(0,0,0,0.5), 0 0 0 1px ${tokens.accent}10`,
                animation: 'nbSlashIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              {slashFiltered.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: '12px', color: tokens.textGhost, opacity: 0.65 }}>
                  No matches
                </div>
              ) : (() => {
                let lastGroup: SlashGroup | null = null;
                return slashFiltered.map((cmd, i) => {
                  const active = i === slashMenu.selected;
                  const showHeader = cmd.group !== lastGroup;
                  lastGroup = cmd.group;
                  return (
                    <Fragment key={cmd.id}>
                      {showHeader && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: i === 0 ? '4px 10px 4px' : '8px 10px 4px',
                        }}>
                          {i > 0 && <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />}
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: tokens.textGhost,
                            opacity: 0.45,
                            whiteSpace: 'nowrap',
                          }}>
                            {SLASH_GROUP_LABELS[cmd.group]}
                          </span>
                          {i > 0 && <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />}
                        </div>
                      )}
                      <button
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
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          borderRadius: '9px',
                          cursor: 'pointer',
                          padding: '8px 10px',
                          marginBottom: i < slashFiltered.length - 1 ? 1 : 0,
                          background: active ? 'rgba(255,255,255,0.09)' : 'transparent',
                          color: active ? tokens.textPrimary : tokens.textSecondary,
                          transition: 'background 0.14s ease, color 0.14s ease, transform 0.12s ease',
                          transform: active ? 'translateX(2px)' : 'none',
                        }}
                      >
                        <span style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '7px',
                          background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.055)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: active ? tokens.textPrimary : tokens.textMuted,
                          flexShrink: 0,
                          fontFamily: `'Space Grotesk', system-ui, sans-serif`,
                          transition: 'background 0.14s ease',
                          letterSpacing: '0',
                        }}>
                          {cmd.glyph}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.01em' }}>{cmd.label}</div>
                          <div style={{ fontSize: '10px', color: tokens.textGhost, opacity: 0.5, marginTop: '1px' }}>{cmd.hint}</div>
                        </div>
                      </button>
                    </Fragment>
                  );
                });
              })()}
            </div>,
            document.body,
          )
        : null}

      {/* Math Zone command reference strip — ghosted at rest, fully visible on hover */}
      {notebookMode === 'math-workspace' && (
        <div
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.12'; }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '5px 18px 6px',
            flexWrap: 'wrap',
            borderBottom: '1px solid rgba(129,140,248,0.09)',
            flexShrink: 0,
            opacity: 0.12,
            transition: 'opacity 0.25s ease',
          }}
        >
          <span style={{
            fontSize: 9.5, color: 'rgba(129,140,248,0.38)',
            letterSpacing: '0.13em', textTransform: 'uppercase',
            flexShrink: 0, userSelect: 'none',
          }}>Quick ref</span>
          {([
            { key: '=>', label: 'step' },
            { key: '/', label: 'commands' },
            { key: 'int·Tab', label: 'integral' },
            { key: 'lim·Tab', label: 'limit' },
            { key: '/math', label: 'formula' },
          ] as const).map(({ key, label }) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <kbd style={{
                background: 'rgba(129,140,248,0.07)',
                border: '1px solid rgba(129,140,248,0.16)',
                borderRadius: 4, padding: '1px 5px',
                fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                color: 'rgba(129,140,248,0.70)', fontWeight: 500, letterSpacing: 0,
              }}>{key}</kbd>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>{label}</span>
            </span>
          ))}
        </div>
      )}

      <NotebookBodyScroll enabled={context === 'free-space'} scrollRef={notebookBodyScrollRef}>
      <div
        onDrop={handleWritingAreaDrop}
        onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }}
        style={{
          position: 'relative',
          display: showNotebookContext && canDockContext ? 'grid' : 'block',
          gridTemplateColumns: showNotebookContext && canDockContext ? 'minmax(0, 1fr) 232px' : undefined,
          gap: showNotebookContext && canDockContext ? '16px' : undefined,
          minHeight: context === 'free-space' ? '100%' : undefined,
        }}
      >
      {editorMode === 'edit' && !isFocusModeOpen ? (
        <div
          ref={editorRootRef}
          data-nb-editor-root="1"
          data-fw-cmd-ignore="1"
          role="textbox"
          aria-multiline
          aria-label="Notebook"
          tabIndex={-1}
          onKeyDownCapture={handleEditorKeyCapture}
          onFocusCapture={handleSurfaceFocusIn}
          onBlur={handleSurfaceBlur}
          className="nb-document-surface"
          data-nb-surface={notebookSurface}
          style={editorSurfaceStyle}
        >
          <div style={writingColumnStyle}>
          {isMathNotebook ? (
            <>
              <MathStudyInsight body={content.body ?? ''} tokens={tokens} />
              {/* Ghost the symbol row on math-workspace so math content has visual priority */}
              <div
                style={{
                  opacity: notebookMode === 'math-workspace'
                    ? (mathToolbarHovered ? 1 : 0.15)
                    : 1,
                  transition: 'opacity 0.22s ease',
                }}
                onMouseEnter={() => setMathToolbarHovered(true)}
                onMouseLeave={() => setMathToolbarHovered(false)}
              >
                <MathInputToolbar
                  tokens={tokens}
                  textColor={ink.headline}
                  onInsertSymbol={insertMathSnippet}
                  onApplyTemplate={applyMathTemplate}
                />
              </div>
            </>
          ) : null}
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
                      color: ink.headline,
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
                index === 0 ? typeScale.s5 : prevKind === 'title' ? typeScale.s3 : prevKind === 'section' ? typeScale.s4 : typeScale.s2 + 4;
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{ ...blockSurfaceChrome(block.id), marginTop: `${secTop}px` }}
                >
                  <div style={{
                    paddingBottom: '7px',
                    marginBottom: '20px',
                    borderBottom: `1px solid ${tokens.accent}28`,
                  }}>
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
                        color: ink.section,
                        fontSize: `${typeScale.l2}px`,
                        fontWeight: 600,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.35,
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
                      color: ink.muted,
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
                        color: ink.primary,
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

            if (block.kind === 'bullet') {
              const bulletIndentPx = block.depth * 20;
              const bulletGlyph = block.depth === 0 ? '•' : block.depth === 1 ? '◦' : '▸';
              const prevIsBullet = prevKind === 'bullet';
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
                    gap: '8px',
                    paddingLeft: bulletIndentPx,
                    margin: `${prevIsBullet ? 3 : 10}px 0 3px`,
                  }}
                >
                  <div
                    style={{
                      width: '16px',
                      flexShrink: 0,
                      textAlign: 'center',
                      color: block.depth === 0 ? ink.secondary : ink.ghost,
                      fontSize: block.depth === 0 ? '10px' : '9px',
                      lineHeight: `${typeScale.l3 * 1.84}px`,
                      paddingTop: '1px',
                      userSelect: 'none',
                      transition: 'color 0.18s ease',
                    }}
                  >
                    {bulletGlyph}
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
                        color: ink.primary,
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
                        color: ink.primary,
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
                    margin: `${typeScale.s3 + 8}px 0`,
                    paddingLeft: '22px',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                    borderLeft: `2px solid ${tokens.accent}55`,
                    backgroundColor: `${tokens.accent}06`,
                  }}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Source quote or passage…"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: ink.secondary,
                      fontFamily: `Georgia, 'Times New Roman', serif`,
                      fontSize: `${typeScale.l3 - 0.5}px`,
                      fontStyle: 'italic',
                      fontWeight: 400,
                      lineHeight: 1.88,
                      margin: 0,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'step') {
              let stepIndex = 1;
              for (let si = index - 1; si >= 0; si--) {
                if (blocks[si]!.kind !== 'step') break;
                stepIndex++;
              }
              return (
                <StepBlockRenderer
                  key={block.id}
                  block={block}
                  stepIndex={stepIndex}
                  isFocused={surfaceFocusBlockId === block.id}
                  tokens={tokens}
                  ink={ink}
                  typeScale={typeScale}
                  morphPulse={morphPulseId === block.id}
                  blockSurfaceChrome={blockSurfaceChrome(block.id)}
                  EditableLine={EditableLine}
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                />
              );
            }

            if (block.kind === 'callout') {
              const ct = calloutToneTokens(block.tone);
              return (
                <div
                  key={block.id}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{
                    ...blockSurfaceChrome(block.id),
                    margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2 + 4}px 0`,
                    paddingLeft: '18px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingRight: '16px',
                    borderRadius: '0 12px 12px 0',
                    borderLeft: `3px solid ${ct.bar}`,
                    backgroundColor: ct.bg,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      marginBottom: '7px',
                    }}
                  >
                    <span style={{
                      fontSize: '11px',
                      color: ct.label,
                      opacity: 0.9,
                      lineHeight: 1,
                      userSelect: 'none',
                    }}>{ct.glyph}</span>
                    <span style={{
                      fontSize: `${typeScale.l5}px`,
                      fontWeight: 700,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      color: ct.label,
                    }}>
                      {calloutLabel(block.tone)}
                    </span>
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
                      color: ink.primary,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 400,
                      lineHeight: 1.82,
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
                <EquationBlockEditor
                  key={block.id}
                  blockId={block.id}
                  text={block.text}
                  tokens={tokens}
                  notebookInk={notebookInk}
                  typeScale={typeScale}
                  marginStyle={{ margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2}px 0` }}
                  surfaceChrome={blockSurfaceChrome(block.id)}
                  isFocused={surfaceFocusBlockId === block.id}
                  isMathNotebook={isMathNotebook}
                  isMathWorkspace={notebookMode === 'math-workspace'}
                  EditableLine={EditableLine}
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  onAfterInput={el => onEditableAfterInput(block.id, el)}
                  onDelete={() => removeBlockAt(index)}
                  morphPulse={morphPulseId === block.id}
                />
              );
            }

            if (block.kind === 'image-ref') {
              const src = nbImageGet(block.key);
              return (
                <div key={block.id} style={{ margin: '20px 0', userSelect: 'none' }}>
                  {src ? (
                    <div
                      className="nb-img-block"
                      onClick={() => setExpandedImage(src)}
                      style={{
                        borderRadius: 12, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.06)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.38), 0 2px 8px rgba(0,0,0,0.20)',
                        cursor: 'zoom-in',
                        transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease',
                      }}
                    >
                      <img
                        src={src}
                        alt={block.alt}
                        style={{
                          width: '100%', display: 'block',
                          maxHeight: 520, objectFit: 'contain',
                          background: 'rgba(0,0,0,0.15)',
                        }}
                      />
                      {block.alt && (
                        <p style={{
                          padding: '8px 16px 10px', fontSize: 11, margin: 0,
                          color: 'rgba(255,248,235,0.28)', fontStyle: 'italic',
                          letterSpacing: '0.02em',
                          background: 'rgba(0,0,0,0.08)',
                        }}>
                          {block.alt}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px', textAlign: 'center', fontSize: 11,
                      color: 'rgba(255,255,255,0.18)', borderRadius: 10,
                      border: '1px dashed rgba(255,255,255,0.06)',
                      letterSpacing: '0.04em',
                    }}>
                      Image no longer available
                    </div>
                  )}
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
                {(isMathNotebook || isLikelyMathLine(block.text)) && !paraFine && !paraMuted ? (
                  <MathEditableParagraph
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder={paragraphPlaceholder}
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={el => onEditableAfterInput(block.id, el)}
                    EditableLine={EditableLine}
                    textColor={ink.primary}
                    mutedColor={tokens.textMuted}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: ink.primary,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 400,
                      lineHeight: 1.84,
                      letterSpacing: '0.004em',
                      margin: `${paraTop}px 0 10px`,
                      opacity: 1,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                ) : (
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder={paragraphPlaceholder}
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={el => onEditableAfterInput(block.id, el)}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: paraFine ? ink.muted : paraMuted ? ink.secondary : ink.primary,
                      fontSize: paraFine ? `${typeScale.l5}px` : paraMuted ? `${typeScale.l4}px` : `${typeScale.l3}px`,
                      fontWeight: paraMuted ? 500 : 400,
                      lineHeight: paraFine ? 1.7 : 1.96,
                      letterSpacing: paraFine ? '0.024em' : '0.004em',
                      margin: `${paraTop}px 0 10px`,
                      opacity: paraFine ? 0.9 : paraMuted ? 0.94 : 1,
                      caretColor: tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                )}
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
                  color: ink.headline,
                }}
              >
                <span style={{ color: ink.muted, fontWeight: 600 }}>Untitled</span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: `${typeScale.l3}px`,
                  lineHeight: 1.84,
                  color: ink.muted,
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
                  : line.kind === 'image-ref'
                    ? `image-ref-${index}-${line.key}`
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
                    color: ink.headline,
                  }}
                >
                  {showPreviewUntitled ? (
                    <span style={{ color: ink.muted, fontWeight: 600 }}>Untitled</span>
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
                    color: ink.section,
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
                    color: ink.primary,
                  }}
                >
                  <span
                    style={{
                      width: `${Math.max(26, String(line.number).length * 10 + 8)}px`,
                      flexShrink: 0,
                      textAlign: 'right',
                      color: ink.muted,
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
                    color: ink.primary,
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
            if (line.kind === 'bullet') {
              const bulletGlyph = line.depth === 0 ? '•' : line.depth === 1 ? '◦' : '▸';
              return (
                <div
                  key={lineKey}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    paddingLeft: line.depth * 20,
                    margin: `3px 0`,
                  }}
                >
                  <div style={{
                    width: '16px',
                    flexShrink: 0,
                    textAlign: 'center',
                    color: line.depth === 0 ? ink.secondary : ink.ghost,
                    fontSize: line.depth === 0 ? '10px' : '9px',
                    lineHeight: 1.92,
                    userSelect: 'none',
                  }}>
                    {bulletGlyph}
                  </div>
                  <div style={{
                    flex: 1,
                    fontSize: `${typeScale.l3}px`,
                    lineHeight: 1.92,
                    color: ink.primary,
                    fontWeight: 400,
                  }}>
                    {line.text || <span style={{ color: ink.ghost, fontStyle: 'italic' }}>Empty</span>}
                  </div>
                </div>
              );
            }
            if (line.kind === 'quote') {
              return (
                <blockquote
                  key={lineKey}
                  style={{
                    margin: `${typeScale.s3 + 8}px 0`,
                    paddingLeft: '22px',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                    borderLeft: `2px solid ${tokens.accent}55`,
                    backgroundColor: `${tokens.accent}06`,
                    color: ink.secondary,
                    fontFamily: `Georgia, 'Times New Roman', serif`,
                    fontStyle: 'italic',
                    fontSize: `${typeScale.l3 - 0.5}px`,
                    lineHeight: 1.88,
                    fontWeight: 400,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.text}
                </blockquote>
              );
            }
            if (line.kind === 'step') {
              let stepIndex = 1;
              for (let si = index - 1; si >= 0; si--) {
                if (previewLines[si]!.kind !== 'step') break;
                stepIndex++;
              }
              return (
                <div
                  key={lineKey}
                  style={{
                    margin: `${typeScale.s2 + 8}px 0`,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '14px',
                    paddingLeft: '18px',
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    borderLeft: `2px solid ${tokens.accent}38`,
                  }}
                >
                  <span
                    style={{
                      fontSize: `${typeScale.l5 - 1}px`,
                      fontWeight: 400,
                      color: tokens.accent,
                      opacity: 0.35,
                      minWidth: '14px',
                      userSelect: 'none',
                      letterSpacing: '0.04em',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    {stepIndex}
                  </span>
                  <MathRichText
                    text={line.text}
                    autoPlainMath
                    textColor={ink.primary}
                    mutedColor={tokens.textMuted}
                  />
                </div>
              );
            }
            if (line.kind === 'callout') {
              const ct = calloutToneTokens(line.tone);
              return (
                <div
                  key={lineKey}
                  style={{
                    margin: `${prevKind === 'title' ? typeScale.s3 : typeScale.s2 + 4}px 0`,
                    paddingLeft: '18px',
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingRight: '16px',
                    borderRadius: '0 12px 12px 0',
                    borderLeft: `3px solid ${ct.bar}`,
                    backgroundColor: ct.bg,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      marginBottom: '7px',
                    }}
                  >
                    <span style={{
                      fontSize: '11px',
                      color: ct.label,
                      opacity: 0.9,
                      lineHeight: 1,
                      userSelect: 'none',
                    }}>{ct.glyph}</span>
                    <span style={{
                      fontSize: `${typeScale.l5}px`,
                      fontWeight: 700,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      color: ct.label,
                    }}>
                      {calloutLabel(line.tone)}
                    </span>
                  </div>
                  <div
                    style={{
                      color: ink.primary,
                      fontSize: `${typeScale.l3}px`,
                      fontWeight: 400,
                      lineHeight: 1.82,
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
                    backgroundColor: `${tokens.wellBg}44`,
                  }}
                >
                  {!isMathNotebook ? (
                    <div
                      style={{
                        fontSize: `${typeScale.l5}px`,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: ink.ghost,
                        marginBottom: `${typeScale.s5 - 2}px`,
                      }}
                    >
                      Equation
                    </div>
                  ) : null}
                  <div className={isMathNotebook ? 'math-nb-hero' : undefined}>
                    <KatexPreview
                      latex={plainMathToLatex(line.text)}
                      displayMode
                      hero={isMathNotebook}
                      textColor={ink.headline}
                      mutedColor={tokens.textMuted}
                    />
                  </div>
                </div>
              );
            }
            if (line.kind === 'image-ref') {
              const src = nbImageGet(line.key);
              return (
                <div key={lineKey} style={{ margin: '12px 0', userSelect: 'none' }}>
                  {src ? (
                    <div
                      style={{
                        borderRadius: 10, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.07)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.32)',
                        cursor: 'zoom-in',
                      }}
                      onClick={() => setExpandedImage(src)}
                    >
                      <img
                        src={src}
                        alt={line.alt}
                        style={{
                          width: '100%', display: 'block',
                          maxHeight: 480, objectFit: 'contain',
                          background: 'rgba(0,0,0,0.2)',
                        }}
                      />
                      {line.alt && (
                        <p style={{
                          padding: '6px 12px 8px', fontSize: 11, margin: 0,
                          color: 'rgba(255,248,235,0.32)', fontStyle: 'italic',
                        }}>
                          {line.alt}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: '16px', textAlign: 'center', fontSize: 12,
                      color: 'rgba(255,255,255,0.2)', borderRadius: 8,
                      border: '1px dashed rgba(255,255,255,0.08)',
                    }}>
                      Image no longer available
                    </div>
                  )}
                </div>
              );
            }
            if (line.kind === 'paragraph') {
              const fine = line.variant === 'fine';
              const muted = line.variant === 'muted';
              const paraTop =
                index === 0 ? 0 : prevKind === 'title' ? typeScale.s5 : prevKind === 'section' ? typeScale.s5 : typeScale.s5;
              return (
                // Use div, not p: MathRichText may render block-level display math inside,
                // and <div> inside <p> is invalid HTML (triggers React warning).
                <div
                  key={lineKey}
                  style={{
                    margin: `${paraTop}px 0 ${typeScale.s4 - 2}px`,
                    color: fine ? ink.muted : muted ? ink.secondary : ink.primary,
                    fontSize: fine ? `${typeScale.l5}px` : muted ? `${typeScale.l4}px` : `${typeScale.l3}px`,
                    lineHeight: fine ? 1.7 : 1.84,
                    letterSpacing: fine ? '0.024em' : '0.005em',
                    opacity: fine ? 0.9 : muted ? 0.94 : 1,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {isMathNotebook ||
                  textHasMathDelimiters(line.text) ||
                  textLikelyHasPlainMath(line.text) ||
                  isLikelyMathLine(line.text) ? (
                    <MathRichText
                      text={line.text}
                      autoPlainMath={isMathNotebook}
                      textColor={fine ? ink.muted : muted ? ink.secondary : ink.primary}
                      mutedColor={tokens.textMuted}
                    />
                  ) : (
                    line.text
                  )}
                </div>
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

    {isFocusModeOpen && typeof document !== 'undefined' ? createPortal(
      <>
        <div
          onClick={() => setIsFocusModeOpen(false)}
          style={{
            position:'fixed', inset:0, zIndex:9990,
            background: isPaperSurface ? 'rgba(214,208,196,0.92)' : 'rgba(14,10,6,0.88)',
            backdropFilter: isPaperSurface ? 'none' : 'blur(32px) saturate(0.45)',
            WebkitBackdropFilter: isPaperSurface ? 'none' : 'blur(32px) saturate(0.45)',
          }}
        />
        <div
          className="nb-focus-enter"
          style={{
            position: 'fixed', inset: 0, zIndex: 9991, overflowY: 'auto',
            background: isPaperSurface ? '#e8e4dc' : 'transparent',
          }}
        >
          {focusAnnouncement && (
            <span className="nb-focus-announce" style={{
              position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)',
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: isPaperSurface ? 'rgba(28,25,23,0.35)' : 'rgba(255,248,235,0.30)',
              pointerEvents: 'none',
            }}>
              {isPaperSurface ? 'Document' : 'Deep Focus'}
            </span>
          )}
          <div
            ref={focusEditorRootRef}
            data-nb-editor-root="1"
            data-fw-cmd-ignore="1"
            className="nb-document-page"
            data-nb-surface={notebookSurface}
            onKeyDownCapture={handleEditorKeyCapture}
            style={
              isPaperSurface
                ? {
                    maxWidth: 720,
                    margin: '48px auto 80px',
                    padding: '56px 56px 100px',
                    minHeight: 'calc(100vh - 96px)',
                    backgroundColor: '#faf8f4',
                    backgroundImage: writingSurfaceBackground.image,
                    backgroundSize: writingSurfaceBackground.size,
                    color: ink.primary,
                    borderRadius: 4,
                    boxShadow: '0 2px 8px rgba(28,25,23,0.06), 0 16px 48px rgba(28,25,23,0.12)',
                    border: '1px solid rgba(28,25,23,0.06)',
                  }
                : { maxWidth: 680, margin: '0 auto', padding: '80px 48px 140px', minHeight: '100%' }
            }
          >
            <div
              style={{
                position: 'fixed', top: 0, left: 0, right: 0,
                zIndex: 9995,
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                gap: 12, padding: '14px 32px',
                opacity: focusToolbarHovered ? 1 : 0.62,
                transition: 'opacity 0.28s ease',
                pointerEvents: 'auto',
                borderBottom: isPaperSurface
                  ? '1px solid rgba(28,25,23,0.08)'
                  : '1px solid rgba(255,255,255,0.06)',
                background: isPaperSurface
                  ? 'linear-gradient(180deg, rgba(250,248,244,0.96) 0%, rgba(250,248,244,0.82) 100%)'
                  : 'linear-gradient(180deg, rgba(14,10,6,0.92) 0%, rgba(14,10,6,0.72) 100%)',
              }}
              onMouseEnter={() => setFocusToolbarHovered(true)}
              onMouseLeave={() => setFocusToolbarHovered(false)}
            >
              <button
                type="button"
                onClick={() => void copyNotebook('markdown')}
                title="Copy notebook (Markdown)"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, cursor: 'pointer', padding: '5px 10px',
                  color: isPaperSurface ? ink.primary : 'rgba(255,248,235,0.78)', fontSize: 11, fontWeight: 600,
                }}
              >Copy Markdown</button>
              <button
                type="button"
                onClick={() => void copyNotebook('plain')}
                title="Copy notebook (plain text)"
                style={{
                  background: isPaperSurface ? 'rgba(28,25,23,0.04)' : 'rgba(255,255,255,0.04)',
                  border: isPaperSurface ? '1px solid rgba(28,25,23,0.08)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6, cursor: 'pointer', padding: '5px 10px',
                  color: isPaperSurface ? ink.secondary : 'rgba(255,248,235,0.65)', fontSize: 11, fontWeight: 500,
                }}
              >Copy Plain</button>
              <button
                type="button"
                title={notebookSurface === 'paper' ? 'Spatial notebook' : 'Paper page'}
                onClick={() => {
                  const next: 'spatial' | 'paper' = notebookSurface === 'paper' ? 'spatial' : 'paper';
                  onChange({ ...content, notebookSurface: next });
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  color: isPaperSurface ? ink.secondary : 'rgba(255,248,235,0.80)',
                  fontSize: 11, letterSpacing: '0.06em',
                }}
              >{notebookSurface === 'paper' ? 'Paper' : 'Spatial'}</button>
              {/* Math mode toggle */}
              <button
                type="button"
                title={notebookMode === 'math' ? 'Normal mode' : 'Math mode'}
                onClick={() => {
                  if (notebookMode !== 'math' && isEmptyMathStarterBody(content.body ?? '')) {
                    onChange({ ...content, notebookMode: 'math', paperStyle: 'grid', body: MATH_CALCULUS_NOTEBOOK_SEED });
                    return;
                  }
                  const nextMode = notebookMode === 'math' ? 'normal' : 'math';
                  onChange({
                    ...content, notebookMode: nextMode,
                    ...(nextMode === 'math' && paperStyle === 'ruled' ? { paperStyle: 'grid' as const } : {}),
                  });
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  color: notebookMode === 'math' ? '#818cf8' : 'rgba(255,248,235,0.80)',
                  fontSize: 14, fontWeight: notebookMode === 'math' ? 600 : 400,
                }}
              >√</button>

              {/* Paper style cycle */}
              <button
                type="button"
                title={`Paper: ${paperStyle}`}
                onClick={() => {
                  const styles: ('blank' | 'ruled' | 'grid')[] = ['blank', 'ruled', 'grid'];
                  const next = styles[(styles.indexOf(paperStyle as 'blank' | 'ruled' | 'grid') + 1) % styles.length];
                  onChange({ ...content, paperStyle: next });
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  color: 'rgba(255,248,235,0.80)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'capitalize',
                }}
              >{paperStyle}</button>

              {/* Close */}
              <button
                type="button"
                title="Close (Esc)"
                onClick={() => setIsFocusModeOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  color: 'rgba(255,248,235,0.80)', fontSize: 18, lineHeight: 1,
                }}
              >×</button>
            </div>
            {!isPaperSurface ? (
              <h1 style={{
                fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 400,
                color: ink.headline, marginBottom: 40, lineHeight: 1.3,
              }}>
                {objectTitle && objectTitle !== 'Notebook' ? objectTitle : 'Notebook'}
              </h1>
            ) : null}
            {content.subtitle && (
              <p style={{
                fontSize: 13, fontStyle: 'italic',
                color: ink.muted,
                marginTop: isPaperSurface ? 0 : -28, marginBottom: 36, letterSpacing: '0.03em',
              }}>
                {content.subtitle}
              </p>
            )}
            {isMathNotebook && (
              <p style={{
                fontSize: 10, color: 'rgba(129,140,248,0.55)',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: 20,
              }}>{notebookMode === 'math-workspace' ? '∑ Math Zone' : '∑ Math mode'}</p>
            )}
            {renderFocusModeBlocks()}
            <div style={{
              marginTop: 48, paddingTop: 16,
              borderTop: `1px solid ${isPaperSurface ? 'rgba(28,25,23,0.08)' : 'rgba(255,255,255,0.05)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 10, color: ink.ghost, letterSpacing: '0.08em' }}>
                {objectTitle ?? 'Notebook'}
              </span>
              {objectUpdatedAt && (
                <span style={{ fontSize: 10, color: ink.ghost }}>
                  {formatRelativeTime(objectUpdatedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </>,
      document.body,
    ) : null}
    {expandedImage !== null && typeof document !== 'undefined' && createPortal(
      <div
        onClick={() => setExpandedImage(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 10060,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
        }}
      >
        <img
          src={expandedImage}
          alt=""
          style={{
            maxWidth: '90vw', maxHeight: '90vh',
            borderRadius: 8, boxShadow: '0 8px 48px rgba(0,0,0,0.5)',
          }}
        />
      </div>,
      document.body
    )}
    </Fragment>
  );
}
