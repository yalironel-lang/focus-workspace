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
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ProjectObjectContent, ProjectSpaceObject, NotebookWritingMode } from '../../hooks/useSectionFreeSpaceObjects';
import {
  addNotebookPage,
  addNotebookSection,
  applyNotebookPersist,
  collectNotebookPageInkKeys,
  getNotebookWorkspaceBreadcrumb,
  inkPageKeyForNotebookPage,
  isNotebookV1PagesEnabled,
  pageDisplayTitle,
  renameNotebookPage,
  renameNotebookSection,
  saveNotebookPageBody,
  setActiveNotebookSection,
  setNotebookPageLinkedPdf,
  switchNotebookPage,
  type NotebookPageKind,
} from '../../lib/notebookPages';
import { NotebookWorkspaceLayout } from '../notebook/NotebookWorkspaceLayout';
import { NotebookWorkspaceNavigator } from '../notebook/NotebookWorkspaceNavigator';
import { NotebookContextSidebar, deriveNotebookContextData } from './NotebookContextSidebar';
import { EquationBlockEditor } from '../notebook/EquationBlockEditor';
import { HandwritingBlock } from '../notebook/HandwritingBlock';
import { StepBlockRenderer } from '../notebook/StepBlockRenderer';
import {
  CompositionCoachSlot,
  CompositionGutter,
  CompositionOverlays,
  useCompositionChromeState,
} from '../notebook/composition/CompositionChrome';
import { isMathCapableBlockKind } from '../../lib/compositionStructureCatalog';
import { MathRichText } from '../notebook/MathRichText';
import { MathEditableParagraph } from '../notebook/MathEditableParagraph';
import { MathStudyInsight } from '../notebook/MathStudyInsight';
import { KatexPreview } from '../notebook/KatexPreview';
import { textHasMathDelimiters } from '../../lib/notebookMath';
import { renderInlineFormatted } from '../../lib/mathZoneInlineFormat';
import { parseRichLine } from '../../lib/notebookInlineMarks';
import {
  hydrateNotebookImages,
  nbImageGet,
  nbImageSet,
  subscribeNotebookImages,
} from '../../lib/notebookImageStore';
import {
  gcOrphanHandwriting,
  gcOrphanHandwritingKeys,
  hydrateHandwritingBlocks,
  hwDelete,
} from '../../lib/notebookHandwritingStore';
import { newHandwritingKey, referencedHandwritingKeys, PAGE_INK_BLOCK_KEY, PAGE_INK_INITIAL_HEIGHT } from '../../lib/handwritingTypes';
import {
  isPenPointer,
  noteNotebookKeyboardTyping,
  noteNotebookPointerDown,
  noteNotebookPointerUp,
  shouldRejectPenTextBeforeInput,
} from '../../lib/notebookInputPolicy';
import {
  inkPenTrace,
  inkPenTraceSetSurface,
  installInkPenTraceGlobal,
  isInkPenTraceEnabled,
} from '../../lib/inkPenTrace';
import { InkPenTraceHud } from '../notebook/InkPenTraceHud';
import { flushAllHandwritingForObject } from '../../lib/handwritingFlushRegistry';
import { TOUCH_TARGET_MIN_PX } from '../../lib/ui/touchTarget';
import {
  getMathTemplate,
  isLikelyMathLine,
  normalizeToLinearMath,
  plainMathToLatex,
  textLikelyHasPlainMath,
  type MathTemplateId,
} from '../../lib/mathInputAssistant';
import {
  isEmptyMathStarterBody,
  isMathNotebookStarterContent,
  MATH_CALCULUS_NOTEBOOK_SEED,
} from '../../lib/mathNotebookSeed';
import {
  findOwningQuestionNumber,
  findSectionBlockIdForOwningBlock,
  findSectionBlockIdForQuestionNumber,
  type ExamQuestionBlockRef,
} from '../../lib/studySession/parseExamQuestions';
import type { NotebookMode } from '../../hooks/useSectionFreeSpaceObjects';
import {
  getMathNotebookDiscoverabilityLabel,
  NOTEBOOK_MODE_OPTIONS,
} from '../../lib/notebookModeLabels';
import {
  getMathSlashFiltered,
  MATH_SLASH_TEMPLATES,
  tryMathTabExpansion,
  type MathSlashId,
} from '../../lib/mathStemShortcuts';
import { notebookBodyToMarkdown, notebookBodyToPlainText } from '../../lib/notebookExport';
import { loadNotebookPose, saveNotebookPose } from '../../lib/notebookPose';
import toast from 'react-hot-toast';
import type { InlineMark } from '../../lib/notebookInlineMarks';
import {
  applyMarkToggle,
  clearAllMarksInRange,
  duplicateRange,
} from '../../lib/notebookInlineMarks';
import {
  attachMarksToText,
  mergeBlockMarks,
  morphBlockKind,
  serializeBlockText,
} from '../../lib/notebookBlockRichText';
import {
  anchorFromSelection,
  computeToolbarAnchor,
  copyRichSlice,
  findRichEditable,
  type NotebookSelectionState,
  type StoredNotebookSelection,
  type ToolbarCommand,
} from '../../lib/notebookSelectionToolbar';
import {
  getCaretOffsetIn,
  setCaretOffsetIn,
  setSelectionOffsetsIn,
  getSelectionOffsetsIn,
  getSelectionClientRect,
  rangeHeightFromStartToCaret,
  rangeHeightFromCaretToEnd,
  lineHeightOf,
  caretInFirstVisualLine,
  caretInLastVisualLine,
  caretAtVisualLineStart,
  caretAtVisualLineEnd,
} from '../../lib/notebookCaret';
import { RichEditableLine } from '../notebook/RichEditableLine';
import { NotebookSelectionToolbar } from '../notebook/NotebookSelectionToolbar';
import { DeskFormattingToolbar } from '../notebook/DeskFormattingToolbar';
import {
  readDeskFormattingV1,
  useDeskFormattingV1,
} from '../../lib/studySession/deskFormattingFeatureFlag';
import { recordDeskFormatSyncEvent } from '../../lib/studySession/deskFormatSyncDebug';
import { recordDeskFormattingMetric } from '../../lib/studySession/deskFormattingMetrics';
import { nbToolbarDebug } from '../../lib/notebookToolbarDebug';
import { nbAgentLog } from '../../lib/notebookDebugIngest';
import { isSelectionInMathEditor } from '../../lib/tiptapSelectionRegistry';
import { computeDeskCheck } from '../../lib/mathDesk/deskCheck';
import { DeskCheckRow, type DeskCheckRowState } from './desk/DeskCheckRow';

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
  | { kind: 'handwriting'; key: string }
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

  const hwMatch = trimmed.match(/^::hw::([a-z0-9-]+)::$/);
  if (hwMatch) return { kind: 'handwriting', key: hwMatch[1]! };

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

/** Preview/read paths: never show mark envelope literals. */
function previewInlineContent(text: string): ReactNode {
  return renderInlineFormatted(text);
}

function previewPlainForMath(text: string): string {
  return parseRichLine(text).plain;
}

type BlockMarks = { marks?: InlineMark[] };

type Block =
  | ({ id: string; kind: 'title'; text: string } & BlockMarks)
  | ({ id: string; kind: 'section'; text: string } & BlockMarks)
  | ({ id: string; kind: 'bullet'; text: string; depth: number } & BlockMarks)
  | ({ id: string; kind: 'ordered'; number: number; text: string } & BlockMarks)
  | ({ id: string; kind: 'task'; text: string; checked: boolean } & BlockMarks)
  | ({ id: string; kind: 'quote'; text: string } & BlockMarks)
  | ({ id: string; kind: 'step'; text: string } & BlockMarks)
  | ({ id: string; kind: 'callout'; tone: CalloutTone; text: string } & BlockMarks)
  | ({ id: string; kind: 'math'; text: string } & BlockMarks)
  | ({ id: string; kind: 'image-ref'; key: string; alt: string })
  | ({ id: string; kind: 'handwriting'; key: string })
  | ({ id: string; kind: 'divider' })
  | ({ id: string; kind: 'paragraph'; text: string; variant?: ParagraphVariant } & BlockMarks);

let blockIdSeq = 0;
/** Stable list keys even if block ids collide after parse/reuse. */
function blockListKey(block: Block, index: number): string {
  return `${block.id}:${index}`;
}

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

function withLineMarks(b: Block): Block {
  if (b.kind === 'divider' || b.kind === 'image-ref' || b.kind === 'handwriting') return b;
  return attachMarksToText(b) as Block;
}

function lineToBlock(line: string): Block {
  const id = newBlockId();
  const parsed = parseNotebookLine(line);
  switch (parsed.kind) {
    case 'blank':
      return withLineMarks({ id, kind: 'paragraph', text: '' });
    case 'title':
      return withLineMarks({ id, kind: 'title', text: parsed.text });
    case 'section':
      return withLineMarks({ id, kind: 'section', text: parsed.text });
    case 'ordered':
      return withLineMarks({ id, kind: 'ordered', number: parsed.number, text: parsed.text });
    case 'bullet':
      return withLineMarks({ id, kind: 'bullet', depth: parsed.depth, text: parsed.text });
    case 'divider':
      return { id, kind: 'divider' };
    case 'task':
      return withLineMarks({ id, kind: 'task', text: parsed.text, checked: parsed.checked });
    case 'quote':
      return withLineMarks({ id, kind: 'quote', text: parsed.text });
    case 'step':
      return withLineMarks({ id, kind: 'step', text: parsed.text });
    case 'callout':
      return withLineMarks({ id, kind: 'callout', tone: parsed.tone, text: parsed.text });
    case 'math':
      return withLineMarks({ id, kind: 'math', text: parsed.text });
    case 'image-ref':
      return { id, kind: 'image-ref', key: parsed.key, alt: parsed.alt };
    case 'handwriting':
      return { id, kind: 'handwriting', key: parsed.key };
    case 'paragraph':
      return withLineMarks({
        id,
        kind: 'paragraph',
        text: parsed.text,
        ...(parsed.variant ? { variant: parsed.variant } : {}),
      });
  }
}

/** Reuse block ids when re-parsing so React does not remount focused editables. */
function blockKindsAlign(a: Block, b: Block): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'image-ref' && b.kind === 'image-ref') return a.key === b.key;
  if (a.kind === 'handwriting' && b.kind === 'handwriting') return a.key === b.key;
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
  const usedIds = new Set<string>();
  return lines.map((line, index) => {
    const fresh = lineToBlock(line);
    const prevAt = prev?.[index];
    let id = fresh.id;
    if (prevAt && blockKindsAlign(prevAt, fresh)) {
      id = prevAt.id;
    } else {
      const prevByLine = prev?.find((p) => blockToLine(p) === line);
      if (prevByLine && prevByLine.kind === fresh.kind && !usedIds.has(prevByLine.id)) {
        id = prevByLine.id;
      }
    }
    if (usedIds.has(id)) id = newBlockId();
    usedIds.add(id);
    return { ...fresh, id };
  });
}

function clampCaretOffset(block: Block, offset: number): number {
  if (block.kind === 'divider' || block.kind === 'image-ref' || block.kind === 'handwriting') return 0;
  return Math.max(0, Math.min(offset, block.text.length));
}

type CaretScrollPolicy = 'force' | 'ifNeeded' | 'never';

type PendingCaretIntent = {
  id: string;
  offset: number;
  scroll: CaretScrollPolicy;
};

function blockTextPayload(b: { text: string; marks?: InlineMark[] }): string {
  return serializeBlockText(b.text, b.marks);
}

/** Avoid wiping stored marks when DOM briefly reports [] without a text change. */
function resolveBlockMarksAfterEdit(
  prevPlain: string,
  nextPlain: string,
  prevMarks: InlineMark[] | undefined,
  marksOverride: InlineMark[] | undefined,
): InlineMark[] | undefined {
  if (marksOverride === undefined) return prevMarks;
  if (marksOverride.length > 0) return marksOverride;
  if ((prevMarks?.length ?? 0) > 0 && nextPlain === prevPlain) return prevMarks;
  return undefined;
}

function blockToLine(b: Block): string {
  switch (b.kind) {
    case 'title':
      return `# ${blockTextPayload(b)}`;
    case 'section':
      return `## ${blockTextPayload(b)}`;
    case 'ordered':
      return `${b.number}. ${blockTextPayload(b)}`;
    case 'bullet':
      return `${'  '.repeat(b.depth)}- ${blockTextPayload(b)}`;
    case 'task':
      return `- [${b.checked ? 'x' : ' '}] ${blockTextPayload(b)}`;
    case 'quote':
      return `> ${blockTextPayload(b)}`;
    case 'step':
      return `=> ${blockTextPayload(b)}`;
    case 'callout':
      return `!${b.tone} ${blockTextPayload(b)}`;
    case 'math':
      return `$$ ${blockTextPayload(b)}`;
    case 'image-ref':
      return `::img::${b.key}::${b.alt}::`;
    case 'handwriting':
      return `::hw::${b.key}::`;
    case 'divider':
      return '---';
    case 'paragraph':
      if (b.variant === 'muted') return `\u00b6 ${blockTextPayload(b)}`;
      if (b.variant === 'fine') return `\u00b6\u00b6 ${blockTextPayload(b)}`;
      return blockTextPayload(b);
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
    const hasMeaningfulListText = (s: string) => s.trim().length > 0;
    // Never steal active typing for empty list starters like "1. " or "- ".
    if (parsed.kind === 'ordered' && !hasMeaningfulListText(parsed.text)) {
      return { id: blockId, kind: 'paragraph', text: normalized };
    }
    if (parsed.kind === 'bullet' && !hasMeaningfulListText(parsed.text)) {
      return { id: blockId, kind: 'paragraph', text: normalized };
    }
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
    if (parsed.kind === 'handwriting') return { id: blockId, kind: 'handwriting', key: parsed.key };
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
    return { ...block, text: m ? (m[1] ?? '') : line };
  }
  if (block.kind === 'section') {
    const m = trimmed.match(/^##\s*(.*)$/);
    return { ...block, text: m ? (m[1] ?? '') : line };
  }
  if (block.kind === 'ordered') {
    const m = line.match(/^\s*(\d+)\.\s?(.*)$/);
    if (m) {
      return {
        ...block,
        number: Math.max(1, Number(m[1] ?? block.number) || block.number),
        text: m[2] ?? '',
      };
    }
    return { ...block, text: line };
  }
  if (block.kind === 'quote') {
    const m = line.match(/^\s*>\s?(.*)$/);
    return { ...block, text: m ? (m[1] ?? '') : line };
  }
  if (block.kind === 'step') {
    const m = line.match(/^\s*=>\s?(.*)$/);
    return { ...block, text: m ? (m[1] ?? '') : line };
  }
  if (block.kind === 'callout') {
    const m = line.match(/^\s*!(summary|concept|review|definition|theorem|example|mistake)\s*(.*)$/i);
    if (m) {
      return {
        ...block,
        tone: m[1]!.toLowerCase() as CalloutTone,
        text: m[2] ?? '',
      };
    }
    return { ...block, text: line };
  }
  if (block.kind === 'math') {
    const m = line.match(/^\s*\$\$\s?(.*)$/);
    return { ...block, text: m ? (m[1] ?? '') : line };
  }
  if (block.kind === 'bullet') {
    return { ...block, text: line };
  }
  if (block.kind === 'task') {
    const parsed = parseNotebookLine(trimmed);
    if (parsed.kind === 'task') return { ...block, text: parsed.text, checked: parsed.checked };
    return { ...block, text: line };
  }
  if (block.kind === 'paragraph') {
    return { ...block, text: line };
  }
  return block;
}

function blockTextLen(b: Block): number {
  if (b.kind === 'divider' || b.kind === 'image-ref' || b.kind === 'handwriting') return 0;
  return b.text.length;
}

const SOFT_BREAK = '\u2028';

function mergeBlocks(prev: Block, next: Block): Block {
  if (prev.kind === 'divider' || prev.kind === 'image-ref' || prev.kind === 'handwriting') return next;
  const nextText =
    next.kind === 'divider' || next.kind === 'image-ref' || next.kind === 'handwriting' ? '' : next.text;
  const nextMarks =
    next.kind === 'divider' || next.kind === 'image-ref' || next.kind === 'handwriting' ? undefined : next.marks;
  const merged = mergeBlockMarks(prev.text, prev.marks, nextText, nextMarks);
  switch (prev.kind) {
    case 'title':
      return { id: prev.id, kind: 'title', ...merged };
    case 'section':
      return { id: prev.id, kind: 'section', ...merged };
    case 'ordered':
      return { id: prev.id, kind: 'ordered', number: prev.number, ...merged };
    case 'bullet':
      return { id: prev.id, kind: 'bullet', depth: prev.depth, ...merged };
    case 'quote':
      return { id: prev.id, kind: 'quote', ...merged };
    case 'step':
      return { id: prev.id, kind: 'step', ...merged };
    case 'callout':
      return { id: prev.id, kind: 'callout', tone: prev.tone, ...merged };
    case 'math':
      return { id: prev.id, kind: 'math', ...merged };
    case 'task':
      return { id: prev.id, kind: 'task', ...merged, checked: prev.checked };
    case 'paragraph':
      if (next.kind !== 'paragraph') return { id: prev.id, kind: 'paragraph', ...merged };
      if (prev.variant !== next.variant) return { id: prev.id, kind: 'paragraph', ...merged };
      return {
        id: prev.id,
        kind: 'paragraph',
        ...merged,
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
  | 'handwriting'
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
  { id: 'handwriting', label: 'Handwriting', hint: 'Draw with pen or stylus', group: 'writing', glyph: '✎' },
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
  marks?: InlineMark[];
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string, marks?: InlineMark[]) => void;
  onFocusIndex: (id: string) => void;
  onAfterInput?: (el: HTMLDivElement) => void;
  onSelectionChange?: (id: string, el: HTMLDivElement) => void;
  suppressInputRef?: RefObject<boolean>;
  ignoreDomInputBlockIdRef?: RefObject<string | null>;
  domCommitLockUntilRef?: RefObject<number>;
  toolbarActiveBlockIdRef?: RefObject<string | null>;
}

function EditableLine({
  id,
  text,
  marks,
  tokens,
  placeholder,
  style,
  onUpdate,
  onFocusIndex,
  onAfterInput,
  onSelectionChange,
  suppressInputRef,
  ignoreDomInputBlockIdRef,
  domCommitLockUntilRef,
  toolbarActiveBlockIdRef,
}: EditableLineProps) {
  return (
    <RichEditableLine
      id={id}
      plain={text}
      marks={marks}
      tokens={tokens}
      placeholder={placeholder}
      style={style}
      onUpdate={(bid, upd) => onUpdate(bid, upd.plain, upd.marks)}
      onFocusIndex={onFocusIndex}
      onAfterInput={onAfterInput}
      onSelectionChange={onSelectionChange}
      suppressInputRef={suppressInputRef}
      ignoreDomInputBlockIdRef={ignoreDomInputBlockIdRef}
      domCommitLockUntilRef={domCommitLockUntilRef}
      toolbarActiveBlockIdRef={toolbarActiveBlockIdRef}
    />
  );
}

/** Free Space: fixed chrome height + scrollable writing/preview; wheel does not bubble to canvas. */
function NotebookBodyScroll({
  enabled,
  scrollRef,
  hostRef,
  onHostReady,
  children,
}: {
  enabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  hostRef?: RefObject<HTMLDivElement | null>;
  onHostReady?: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  if (!enabled) return <Fragment>{children}</Fragment>;
  return (
    <div
      ref={el => {
        if (hostRef) hostRef.current = el;
        onHostReady?.(el);
      }}
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

function MathNotebookQuickRefStrip({ prominent }: { prominent?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const ghosted = !prominent && !hovered;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '5px 18px 6px',
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(129,140,248,0.09)',
        flexShrink: 0,
        opacity: ghosted ? 0.12 : 1,
        transition: 'opacity 0.25s ease',
      }}
    >
      <span style={{
        fontSize: 9.5, color: 'rgba(129,140,248,0.38)',
        letterSpacing: '0.13em', textTransform: 'uppercase',
        flexShrink: 0, userSelect: 'none',
      }}>{prominent ? 'Get started' : 'Quick ref'}</span>
      {([
        { key: '=>', label: 'derivation step' },
        { key: '/', label: 'commands' },
        { key: 'int·Tab', label: 'integral' },
        { key: 'lim·Tab', label: 'limit' },
        { key: '/math', label: 'formula block' },
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
  );
}

function NotebookModeSelect({
  mode,
  paperStyle,
  body,
  onChange,
}: {
  mode: NotebookMode;
  paperStyle: 'blank' | 'ruled' | 'grid';
  body: string;
  onChange: (patch: { notebookMode: NotebookMode; paperStyle?: 'blank' | 'ruled' | 'grid'; body?: string }) => void;
}) {
  return (
    <select
      value={mode}
      title="Notebook mode"
      aria-label="Notebook mode"
      onChange={e => {
        const next = e.target.value as NotebookMode;
        onChange({
          notebookMode: next,
          ...(next === 'math' && paperStyle === 'ruled' ? { paperStyle: 'grid' as const } : {}),
          ...(next === 'math' && isEmptyMathStarterBody(body) ? { body: MATH_CALCULUS_NOTEBOOK_SEED } : {}),
        });
      }}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        color: mode === 'math' || mode === 'math-workspace' ? '#a5b4fc' : 'rgba(255,248,235,0.55)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '3px 6px',
        cursor: 'pointer',
        maxWidth: 108,
      }}
    >
      {NOTEBOOK_MODE_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value} style={{ color: '#1c1917' }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function NotebookWritingModeToggle({
  mode,
  onChange,
  tokens,
}: {
  mode: NotebookWritingMode;
  onChange: (mode: NotebookWritingMode) => void;
  tokens: AtmosphereTokens;
}) {
  const segment = (value: NotebookWritingMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => {
        if (mode !== value) onChange(value);
      }}
      style={{
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        border: 'none',
        cursor: 'pointer',
        borderRadius: 5,
        background: mode === value ? `${tokens.accent}24` : 'transparent',
        color: mode === value ? tokens.accent : 'rgba(255,248,235,0.45)',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Notebook writing mode"
      title="Text: type notes. Ink: write on the page with Apple Pencil."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 7,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      {segment('text', 'Text')}
      {segment('ink', 'Ink')}
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
  /** Section + board for knowledge journal (tombstones / snapshots). */
  freeSpaceSectionId?: string;
  freeSpaceBoardId?: string;
  /** Desk layout: paper-first math surface inside MathDeskPrototype shell. */
  presentation?: 'notebook' | 'desk' | 'workspace';
  /** Desk: notify shell when the focused derivation line changes (for Plot-from-line). */
  onDeskFocusedLine?: (payload: { blockId: string | null; text: string }) => void;
  /** Study session: one-time restore of focused block after resume. */
  sessionRestoreBlockId?: string | null;
  /** Study session: jump to a question section by number (rail). */
  studyFocusQuestionNumber?: number | null;
  studyFocusQuestionToken?: number;
  /** Study session: report which question owns the focused block. */
  onActiveQuestionNumber?: (questionNumber: number | null) => void;
  /** Exam / reading focus: hide composition chrome (chip, bubble, gutter). */
  compositionChromeSuppressed?: boolean;
  /** Opens PDF + ink split for a write page (past exam practice). */
  onOpenBinderStudy?: (payload: {
    pdfObjectId: string;
    inkObjectId: string;
    inkBlockKey: string;
    surfaceTitle: string;
  }) => void;
}

function blocksToExamRefs(blocks: Block[]): ExamQuestionBlockRef[] {
  return blocks.map(b => ({
    id: b.id,
    kind: b.kind,
    text: 'text' in b ? String(b.text) : '',
  }));
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
  onChange: emitContentChange,
  objectId,
  objectTitle,
  objectUpdatedAt,
  allObjects,
  onRequestSelectObject,
  onCreateRecallItem,
  context = 'inline',
  onEditingChange,
  freeSpaceSectionId,
  freeSpaceBoardId = '',
  presentation = 'notebook',
  onDeskFocusedLine,
  sessionRestoreBlockId = null,
  studyFocusQuestionNumber = null,
  studyFocusQuestionToken = 0,
  onActiveQuestionNumber,
  compositionChromeSuppressed = false,
  onOpenBinderStudy,
}: Props) {
  const persistNotebookContent = useCallback(
    (next: NotebookContent) => emitContentChange(applyNotebookPersist(next)),
    [emitContentChange],
  );
  const v1PagesShell = isNotebookV1PagesEnabled();
  const contentRef = useRef(content);
  contentRef.current = content;
  const isDeskPresentation = presentation === 'desk';
  const isWorkspacePresentation = presentation === 'workspace';
  const showCardChrome = !isDeskPresentation && !isWorkspacePresentation;
  const activeNotebookPage = useMemo(() => {
    if (!v1PagesShell || !content.activePageId) return null;
    return (content.pages ?? []).find(p => p.id === content.activePageId) ?? null;
  }, [v1PagesShell, content.activePageId, content.pages]);
  const activePageKind: NotebookPageKind = activeNotebookPage?.kind ?? 'document';
  const activeInkBlockKey =
    activeNotebookPage?.kind === 'write'
      ? inkPageKeyForNotebookPage(activeNotebookPage)
      : null;
  const workspaceBinderMode = v1PagesShell && isWorkspacePresentation;
  const deskFormattingV1 = useDeskFormattingV1();
  const deskFormattingActive = isDeskPresentation && deskFormattingV1;
  const sessionRestoreAppliedRef = useRef(false);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [blocks, setBlocks] = useState<Block[]>(() => parseBodyToBlocks(content.body ?? ''));
  const [, bumpNotebookImageCache] = useState(0);
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
  useEffect(() => {
    sessionRestoreAppliedRef.current = false;
  }, [sessionRestoreBlockId]);

  useEffect(() => subscribeNotebookImages(() => bumpNotebookImageCache(n => n + 1)), []);

  useEffect(() => {
    const keys = blocks
      .filter((b): b is Extract<Block, { kind: 'image-ref' }> => b.kind === 'image-ref')
      .map(b => b.key);
    void hydrateNotebookImages(keys);
  }, [blocks]);

  useEffect(() => {
    if (!objectId) return;
    const keys = blocks
      .filter((b): b is Extract<Block, { kind: 'handwriting' }> => b.kind === 'handwriting')
      .map(b => b.key);
    void hydrateHandwritingBlocks(objectId, keys);
  }, [blocks, objectId]);

  useEffect(() => {
    if (!objectId) return;
    const fromBlocks = blocks
      .filter((b): b is Extract<Block, { kind: 'handwriting' }> => b.kind === 'handwriting')
      .map(b => b.key);
    const fromBody = referencedHandwritingKeys(content.body ?? '');
    const pageInkKeys = workspaceBinderMode
      ? collectNotebookPageInkKeys(content.pages)
      : [PAGE_INK_BLOCK_KEY];
    const hwKeys = [...new Set([...fromBlocks, ...fromBody, ...pageInkKeys])];
    const timer = window.setTimeout(() => {
      void gcOrphanHandwritingKeys(objectId, hwKeys);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [objectId, blocks, content.body, content.pages, workspaceBinderMode]);

  useEffect(() => {
    if (!sessionRestoreBlockId || !isDeskPresentation || sessionRestoreAppliedRef.current) return;
    const refs = blocksToExamRefs(blocks);
    const focusId =
      findSectionBlockIdForOwningBlock(refs, sessionRestoreBlockId) ?? sessionRestoreBlockId;
    if (!blocks.some(b => b.id === focusId)) return;
    sessionRestoreAppliedRef.current = true;
    setSurfaceFocusBlockId(focusId);
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-nb-surface-block][data-block-id="${focusId}"]`,
      );
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [sessionRestoreBlockId, isDeskPresentation, blocks]);

  useEffect(() => {
    if (!isDeskPresentation || studyFocusQuestionNumber == null) return;
    const refs = blocksToExamRefs(blocks);
    const sectionId = findSectionBlockIdForQuestionNumber(refs, studyFocusQuestionNumber);
    if (!sectionId) return;
    sessionRestoreAppliedRef.current = true;
    setSurfaceFocusBlockId(sectionId);
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-nb-surface-block][data-block-id="${sectionId}"]`,
      );
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [studyFocusQuestionNumber, studyFocusQuestionToken, isDeskPresentation, blocks]);

  useEffect(() => {
    if (!onActiveQuestionNumber) return;
    const n = findOwningQuestionNumber(blocksToExamRefs(blocks), surfaceFocusBlockId);
    onActiveQuestionNumber(n);
  }, [onActiveQuestionNumber, blocks, surfaceFocusBlockId]);
  const [morphPulseId, setMorphPulseId] = useState<string | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  const [selectionToolbar, setSelectionToolbar] = useState<NotebookSelectionState | null>(null);
  const [paperPopoverOpen, setPaperPopoverOpen] = useState(false);
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);

  const flushHandwritingBeforeTransition = useCallback(async () => {
    if (!objectId) return;
    await flushAllHandwritingForObject(objectId);
  }, [objectId]);

  const closeFocusMode = useCallback(async () => {
    await flushHandwritingBeforeTransition();
    setIsFocusModeOpen(false);
  }, [flushHandwritingBeforeTransition]);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [focusAnnouncement, setFocusAnnouncement] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [focusToolbarHovered, setFocusToolbarHovered] = useState(false);
  const [deskChecks, setDeskChecks] = useState<Record<string, DeskCheckRowState>>({});
  const deskChecksRef = useRef(deskChecks);
  deskChecksRef.current = deskChecks;

  const shellRef = useRef<HTMLDivElement>(null);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const focusEditorRootRef = useRef<HTMLDivElement>(null);
  const writingColumnRef = useRef<HTMLDivElement>(null);
  const focusWritingColumnRef = useRef<HTMLDivElement>(null);
  const notebookBodyHostRef = useRef<HTMLDivElement>(null);
  const [writingColumnEl, setWritingColumnEl] = useState<HTMLElement | null>(null);
  const [focusWritingColumnEl, setFocusWritingColumnEl] = useState<HTMLElement | null>(null);
  const [notebookBodyHostEl, setNotebookBodyHostEl] = useState<HTMLElement | null>(null);
  const lastFocusedMathBlockIdRef = useRef<string | null>(null);
  const notebookBodyScrollRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const focusIndexRef = useRef(0);
  const pendingCaretRef = useRef<PendingCaretIntent | null>(null);
  const onChangeRef = useRef(persistNotebookContent);
  onChangeRef.current = persistNotebookContent;
  // Stable ref so onEditingChange reference churn never fires the editing effect
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const notebookPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poseRestoreAttemptedRef = useRef(false);
  /** User scrolled the notebook body — suppress caret-follow until explicit focus/navigation. */
  const userControlledScrollRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const pendingNotebookContentRef = useRef<{
    objectId: string;
    content: NotebookContent;
    commit: (c: NotebookContent) => void;
  } | null>(null);
  const persistObjectIdRef = useRef(objectId ?? '');
  persistObjectIdRef.current = objectId ?? '';
  const notebookEditCountRef = useRef(0);
  const selectionSnapshotRef = useRef<StoredNotebookSelection | null>(null);
  const toolbarInteractingRef = useRef(false);
  const ignoreDomInputBlockIdRef = useRef<string | null>(null);
  /** Timestamp (ms) until which DOM-derived text commits are rejected (toolbar/mark apply). */
  const domCommitLockUntilRef = useRef(0);
  /** While set, RichEditableLine rejects every onInput commit for this block id. */
  const toolbarActiveBlockIdRef = useRef<string | null>(null);
  const frozenRichElsRef = useRef<HTMLElement[]>([]);

  const syncFreezeRichEditables = useCallback(() => {
    const root =
      isFocusModeOpen && focusEditorRootRef.current
        ? focusEditorRootRef.current
        : editorRootRef.current;
    if (!root) return;
    frozenRichElsRef.current = [];
    root.querySelectorAll<HTMLElement>('[data-rich-editable="1"]').forEach(el => {
      frozenRichElsRef.current.push(el);
      el.dataset.nbPrevPe = el.style.pointerEvents;
      el.style.pointerEvents = 'none';
      el.contentEditable = 'false';
    });
    // #region agent log
    nbAgentLog(
      'ProjectNotebookBlock:syncFreezeRichEditables',
      'sync-dom-freeze',
      { count: frozenRichElsRef.current.length },
      'H',
      'post-fix',
    );
    // #endregion
  }, [isFocusModeOpen]);

  const syncUnfreezeRichEditables = useCallback(() => {
    for (const el of frozenRichElsRef.current) {
      el.contentEditable = 'true';
      el.style.pointerEvents = el.dataset.nbPrevPe ?? '';
      delete el.dataset.nbPrevPe;
    }
    frozenRichElsRef.current = [];
  }, []);

  const lockDomTextCommits = useCallback((durationMs = 480) => {
    domCommitLockUntilRef.current = Math.max(
      domCommitLockUntilRef.current,
      Date.now() + durationMs,
    );
    toolbarInteractingRef.current = true;
  }, []);

  const isDomTextCommitLocked = useCallback((): boolean => {
    return Date.now() < domCommitLockUntilRef.current || toolbarInteractingRef.current;
  }, []);

  const releaseDomTextCommitLock = useCallback((delayMs = 0) => {
    const attempt = () => {
      if (Date.now() >= domCommitLockUntilRef.current) {
        toolbarInteractingRef.current = false;
        ignoreDomInputBlockIdRef.current = null;
      }
    };
    if (delayMs <= 0) attempt();
    else window.setTimeout(attempt, delayMs);
  }, []);

  const EditableLineGuarded = useCallback(
    (props: Omit<
      EditableLineProps,
      'suppressInputRef' | 'ignoreDomInputBlockIdRef' | 'domCommitLockUntilRef' | 'toolbarActiveBlockIdRef'
    >) => {
      const { onUpdate, ...rest } = props;
      return (
        <EditableLine
          {...rest}
          suppressInputRef={toolbarInteractingRef}
          ignoreDomInputBlockIdRef={ignoreDomInputBlockIdRef}
          domCommitLockUntilRef={domCommitLockUntilRef}
          toolbarActiveBlockIdRef={toolbarActiveBlockIdRef}
          onUpdate={(id, raw, marks) => {
            if (ignoreDomInputBlockIdRef.current === id) {
              // #region agent log
              nbAgentLog(
                'ProjectNotebookBlock:EditableLineGuarded',
                'onUpdate-blocked-mark-apply',
                { id, raw },
                'D',
              );
              // #endregion
              return;
            }
            const snap = selectionSnapshotRef.current;
            if (snap?.blockId === id && raw !== snap.plain) {
              // #region agent log
              nbAgentLog(
                'ProjectNotebookBlock:EditableLineGuarded',
                'onUpdate-blocked-snapshot-mismatch',
                { id, raw, snapshotPlain: snap.plain, lockUntil: domCommitLockUntilRef.current },
                'D',
                'post-fix',
              );
              // #endregion
              return;
            }
            onUpdate(id, raw, marks);
          }}
        />
      );
    },
    [],
  );

  const flushNotebookPersist = useCallback(() => {
    if (notebookPersistTimerRef.current) {
      clearTimeout(notebookPersistTimerRef.current);
      notebookPersistTimerRef.current = null;
    }
    const pending = pendingNotebookContentRef.current;
    if (!pending) return;
    pendingNotebookContentRef.current = null;
    pending.commit(pending.content);
  }, []);

  const schedulePosePersist = useCallback(
    (scrollTop: number, blockId: string | null) => {
      if (context !== 'free-space' || !freeSpaceSectionId || !objectId) return;
      if (posePersistTimerRef.current) clearTimeout(posePersistTimerRef.current);
      posePersistTimerRef.current = setTimeout(() => {
        saveNotebookPose(freeSpaceSectionId, freeSpaceBoardId, objectId, { scrollTop, blockId });
      }, 400);
    },
    [context, freeSpaceSectionId, freeSpaceBoardId, objectId],
  );

  useEffect(() => {
    poseRestoreAttemptedRef.current = false;
    userControlledScrollRef.current = false;
  }, [freeSpaceSectionId, freeSpaceBoardId, objectId]);

  useEffect(() => {
    if (context !== 'free-space' || !freeSpaceSectionId || !objectId || poseRestoreAttemptedRef.current) {
      return;
    }
    if (blocks.length === 0) return;
    const sc = notebookBodyScrollRef.current;
    if (!sc) return;

    const pose = loadNotebookPose(freeSpaceSectionId, freeSpaceBoardId, objectId);
    poseRestoreAttemptedRef.current = true;

    if (pose) {
      userControlledScrollRef.current = false;
      const applyScroll = () => {
        isProgrammaticScrollRef.current = true;
        sc.scrollTop = pose.scrollTop;
        isProgrammaticScrollRef.current = false;
      };
      requestAnimationFrame(() => requestAnimationFrame(applyScroll));
      if (pose.blockId && blocks.some(b => b.id === pose.blockId)) {
        setSurfaceFocusBlockId(pose.blockId);
      }
    }
  }, [context, freeSpaceSectionId, freeSpaceBoardId, objectId, blocks.length]);

  useEffect(() => {
    if (context !== 'free-space') return;
    const sc = notebookBodyScrollRef.current;
    if (!sc) return;
    const onScroll = () => {
      if (!isProgrammaticScrollRef.current) {
        userControlledScrollRef.current = true;
      }
      schedulePosePersist(sc.scrollTop, surfaceFocusBlockId);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [context, schedulePosePersist, surfaceFocusBlockId]);

  const pushContent = useCallback(
    (next: NotebookContent) => {
      if (next.body === content.body) {
        flushNotebookPersist();
        onChangeRef.current(next);
        return;
      }
      notebookEditCountRef.current += 1;
      if (freeSpaceSectionId && objectId) {
        void import('../../lib/knowledge/notebookSnapshotStore').then(({ scheduleNotebookSnapshot }) => {
          scheduleNotebookSnapshot({
            sectionId: freeSpaceSectionId,
            boardId: freeSpaceBoardId,
            objectId,
            objectTitle: objectTitle ?? 'Notebook',
            body: next.body ?? '',
            editGeneration: notebookEditCountRef.current,
          });
        });
      }
      pendingNotebookContentRef.current = {
        objectId: persistObjectIdRef.current,
        content: next,
        commit: onChangeRef.current,
      };
      if (notebookPersistTimerRef.current) clearTimeout(notebookPersistTimerRef.current);
      notebookPersistTimerRef.current = setTimeout(flushNotebookPersist, 420);
    },
    [content.body, flushNotebookPersist, freeSpaceSectionId, freeSpaceBoardId, objectId, objectTitle],
  );

  useEffect(() => () => flushNotebookPersist(), [flushNotebookPersist]);

  useEffect(() => {
    return () => flushNotebookPersist();
  }, [objectId, freeSpaceSectionId, freeSpaceBoardId, flushNotebookPersist]);

  const applyShellMutation = useCallback(
    (mutate: (current: NotebookContent, body: string) => NotebookContent) => {
      void (async () => {
        await flushHandwritingBeforeTransition();
        flushNotebookPersist();
        const body = serializeBlocks(blocksRef.current);
        persistNotebookContent(applyNotebookPersist(mutate(contentRef.current, body)));
      })();
    },
    [flushHandwritingBeforeTransition, flushNotebookPersist, persistNotebookContent],
  );

  const handleShellSwitchPage = useCallback(
    (pageId: string) => {
      if (pageId === contentRef.current.activePageId) return;
      applyShellMutation((current, body) => switchNotebookPage(current, pageId, body));
    },
    [applyShellMutation],
  );

  const handleShellSwitchSection = useCallback(
    (sectionId: string) => {
      if (sectionId === contentRef.current.activeSectionId) return;
      applyShellMutation((current, body) => setActiveNotebookSection(current, sectionId, body));
    },
    [applyShellMutation],
  );

  const handleShellAddSection = useCallback(() => {
    applyShellMutation((current, body) => addNotebookSection(current, body));
  }, [applyShellMutation]);

  const handleShellAddPage = useCallback(
    (kind: NotebookPageKind) => {
      const sectionId = contentRef.current.activeSectionId;
      if (!sectionId) return;
      applyShellMutation((current, body) => addNotebookPage(current, sectionId, body, undefined, kind));
    },
    [applyShellMutation],
  );

  const handleShellRenameSection = useCallback(
    (sectionId: string, title: string) => {
      applyShellMutation((current, body) =>
        renameNotebookSection(saveNotebookPageBody(current, body), sectionId, title),
      );
    },
    [applyShellMutation],
  );

  const handleShellRenamePage = useCallback(
    (pageId: string, title: string) => {
      applyShellMutation((current, body) =>
        renameNotebookPage(saveNotebookPageBody(current, body), pageId, title),
      );
    },
    [applyShellMutation],
  );

  const contextData = useMemo(
    () => deriveNotebookContextData(objectId, allObjects),
    [objectId, allObjects],
  );
  const activeNotebookBlock = useMemo(
    () => (surfaceFocusBlockId ? blocks.find((b) => b.id === surfaceFocusBlockId) ?? null : null),
    [blocks, surfaceFocusBlockId],
  );

  useEffect(() => {
    if (!isDeskPresentation || !onDeskFocusedLine) return;
    if (
      activeNotebookBlock &&
      (activeNotebookBlock.kind === 'paragraph' || activeNotebookBlock.kind === 'step')
    ) {
      onDeskFocusedLine({ blockId: activeNotebookBlock.id, text: activeNotebookBlock.text });
    } else {
      onDeskFocusedLine({ blockId: null, text: '' });
    }
  }, [isDeskPresentation, onDeskFocusedLine, activeNotebookBlock]);

  const activeRecallPrompt = useMemo(() => {
    const focused = activeNotebookBlock && activeNotebookBlock.kind !== 'divider' && activeNotebookBlock.kind !== 'image-ref' && activeNotebookBlock.kind !== 'handwriting'
      ? activeNotebookBlock
      : null;
    const fallback = blocks[focusIndexRef.current];
    const source = focused ?? (fallback && fallback.kind !== 'divider' && fallback.kind !== 'image-ref' && fallback.kind !== 'handwriting' ? fallback : null);
    if (!source) return '';
    return normalizeRecallPromptText(source.text);
  }, [activeNotebookBlock, blocks]);
  const hasNotebookContext = contextData.totalCount > 0;
  const canDockContext = surfaceWidth >= 640;
  const showNotebookContext =
    !isDeskPresentation && context === 'free-space' && hasNotebookContext && contextPanelOpen;

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

  const commitBlocks = useCallback((next: Block[]) => {
    const normalized = normalizeOrderedSequences(next);
    const serialized = serializeBlocks(normalized);
    setBlocks(normalized);
    pushContent({ ...contentRef.current, body: serialized });
  }, [pushContent]);

  const insertImageBlock = useCallback((key: string, alt: string) => {
    const focusedId = surfaceFocusBlockId ?? (blocksRef.current.length > 0 ? blocksRef.current[blocksRef.current.length - 1]!.id : null);
    const newBlock: Block = { id: newBlockId(), kind: 'image-ref', key, alt };
    const prev = blocksRef.current;
    const idx = focusedId ? prev.findIndex(b => b.id === focusedId) : prev.length - 1;
    const insertIdx = idx < 0 ? prev.length : idx + 1;
    const next = [...prev];
    next.splice(insertIdx, 0, newBlock);
    commitBlocks(next);
  }, [surfaceFocusBlockId, commitBlocks]);

  const handleNotebookPaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items ?? []);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const dataUrl = reader.result as string;
        const key = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const saved = await nbImageSet(key, dataUrl);
        if (!saved) {
          toast.error('Could not save image — storage may be full.');
          return;
        }
        insertImageBlock(key, '');
      })();
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
      void (async () => {
        const dataUrl = reader.result as string;
        const key = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const saved = await nbImageSet(key, dataUrl);
        if (!saved) {
          toast.error('Could not save image — storage may be full.');
          return;
        }
        const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        insertImageBlock(key, cleanName);
      })();
    };
    reader.readAsDataURL(file);
  }, [insertImageBlock]);

  const persist = useCallback(
    (next: Block[]) => {
      commitBlocks(next);
    },
    [commitBlocks],
  );

  const getEditorRoot = useCallback((): HTMLElement | null => {
    if (isFocusModeOpen && focusEditorRootRef.current) return focusEditorRootRef.current;
    return editorRootRef.current;
  }, [isFocusModeOpen]);

  const isNotebookEditorFocused = useCallback((): boolean => {
    if (isDomTextCommitLocked()) return true;
    const active = document.activeElement;
    if (!active) return false;
    if (active.closest('.nb-selection-toolbar')) return true;
    return !!(
      editorRootRef.current?.contains(active) ||
      focusEditorRootRef.current?.contains(active)
    );
  }, [isDomTextCommitLocked]);

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

  const scheduleCaret = useCallback(
    (block: Block, offset: number, scroll: CaretScrollPolicy = 'never') => {
      pendingCaretRef.current = {
        id: block.id,
        offset: clampCaretOffset(block, offset),
        scroll,
      };
    },
    [],
  );

  const applyBlockLevel = useCallback(
    (blockId: string, level: 1 | 2 | 3 | 4 | 5) => {
      const caretBefore = captureCaretForBlock(blockId);
      const prev = blocksRef.current;
      const i = prev.findIndex((b) => b.id === blockId);
      if (i === -1) return;
      const cur = prev[i]!;
      if (cur.kind === 'divider' || cur.kind === 'image-ref' || cur.kind === 'handwriting') return;
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
      if (isDomTextCommitLocked()) return prev;
      return parseBodyToBlocks(body, prev);
    });
  }, [content.body, isNotebookEditorFocused, isDomTextCommitLocked]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void closeFocusMode();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [isFocusModeOpen, closeFocusMode]);

  const paperStyle = content.paperStyle ?? 'ruled';
  const notebookSurface = content.notebookSurface ?? 'spatial';
  const isPaperSurface = notebookSurface === 'paper';
  const notebookMode = content.notebookMode ?? 'normal';
  const writingMode: NotebookWritingMode = content.writingMode ?? 'text';
  const showInkMode = workspaceBinderMode
    ? activePageKind === 'write' && !isFocusModeOpen && editorMode === 'edit'
    : writingMode === 'ink' && !isFocusModeOpen && editorMode === 'edit';
  const isMathNotebook = notebookMode === 'math' || notebookMode === 'math-workspace';
  const compositionActive =
    isMathNotebook &&
    editorMode === 'edit' &&
    !compositionChromeSuppressed &&
    !workspaceBinderMode;
  const compositionUiVisible = useMemo(() => {
    if (!compositionActive) return false;
    if (!surfaceFocusBlockId) return true;
    const kind = blocks.find(b => b.id === surfaceFocusBlockId)?.kind;
    return kind !== 'handwriting';
  }, [compositionActive, surfaceFocusBlockId, blocks]);
  const compositionChrome = useCompositionChromeState(notebookMode);
  const mathDiscoverabilityLabel = getMathNotebookDiscoverabilityLabel(notebookMode);
  const showMathStartGuide =
    !isDeskPresentation &&
    isMathNotebook &&
    editorMode === 'edit' &&
    !isFocusModeOpen &&
    isMathNotebookStarterContent(content.body ?? '');

  const displayBlocks = useMemo(() => {
    if (!isDeskPresentation) return blocks;
    return blocks.filter(b => {
      if (b.kind !== 'title') return true;
      const t = b.text.trim().replace(/^#+\s*/, '');
      return t !== '' && t.toLowerCase() !== 'math' && t.toLowerCase() !== 'untitled';
    });
  }, [blocks, isDeskPresentation]);

  const deskFirstEmptyParaId = useMemo(() => {
    if (!isDeskPresentation) return null;
    const p = displayBlocks.find(
      b => b.kind === 'paragraph' && !b.variant && b.text.trim() === '',
    );
    return p?.id ?? null;
  }, [displayBlocks, isDeskPresentation]);

  const runDeskCheckForBlockId = useCallback((blockId: string) => {
    const blk = blocksRef.current.find(b => b.id === blockId);
    if (!blk || (blk.kind !== 'paragraph' && blk.kind !== 'step')) return;
    const display = computeDeskCheck(blk.text);
    setDeskChecks(prev => {
      const next: Record<string, DeskCheckRowState> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k !== blockId) next[k] = { ...v, stale: true };
      }
      next[blockId] = { display, stale: false };
      return next;
    });
  }, []);

  const wrapDeskCheck = useCallback(
    (block: Block, inner: ReactNode) => {
      if (!isDeskPresentation) return inner;
      if (block.kind !== 'paragraph' && block.kind !== 'step') return inner;
      return (
        <DeskCheckRow
          key={block.id}
          blockId={block.id}
          isFocused={surfaceFocusBlockId === block.id}
          state={deskChecks[block.id]}
          onRequestCheck={() => runDeskCheckForBlockId(block.id)}
        >
          {inner}
        </DeskCheckRow>
      );
    },
    [
      isDeskPresentation,
      deskChecks,
      surfaceFocusBlockId,
      runDeskCheckForBlockId,
    ],
  );

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
          linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px),
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
          rgba(255,255,255,0.022) 37px,
          rgba(255,255,255,0.022) 38px
        ),
        ${edge}
      `,
      size: `${paperSize}, 100% 100%`,
    };
  }, [paperStyle, paperSize, isPaperSurface]);

  /** Editorial ink — spatial (light on dark) vs document (dark on paper). */
  const notebookInk = useMemo(
    () => {
      if (isDeskPresentation) {
        return {
          headline: '#2c2824',
          primary: '#2c2824',
          section: '#44403c',
          secondary: '#57534e',
          muted: '#78716c',
          ghost: '#a8a29e',
        };
      }
      return isPaperSurface
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
          };
    },
    [isDeskPresentation, isPaperSurface, tokens.textPrimary, tokens.textSecondary, tokens.textMuted, tokens.textGhost],
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
    const editable = t?.closest?.('[data-editable-id]') as HTMLElement | null;
    const bid = wrap?.dataset?.blockId ?? editable?.getAttribute('data-editable-id');
    if (bid) {
      setSurfaceFocusBlockId(bid);
      const blk = blocksRef.current.find(b => b.id === bid);
      if (blk && isMathCapableBlockKind(blk.kind)) {
        lastFocusedMathBlockIdRef.current = bid;
      }
    }
  }, []);

  const handleSurfaceBlur = useCallback(
    (e: ReactFocusEvent<HTMLDivElement>) => {
      const rt = e.relatedTarget as Node | null;
      if (rt instanceof HTMLElement) {
        if (e.currentTarget.contains(rt)) return;
        if (rt.closest('[data-nb-slash-menu]')) return;
        if (rt.closest('[data-nb-typo-rail]')) return;
        if (rt.closest('[data-math-input-toolbar]')) return;
        if (rt.closest('.desk-math-palette')) return;
        if (rt.closest('[data-composition-bubble]')) return;
        if (rt.closest('[data-composition-more]')) return;
        if (rt.closest('[data-composition-gutter]')) return;
        if (rt.closest('[data-composition-gutter-menu]')) return;
        if (rt.closest('[data-composition-sheet]')) return;
        if (rt.closest('[data-composition-chip]')) return;
      }
      // Keep pendingCaretRef — popover unmount / toolbar focus can race caret restore after insert.
      if (context === 'free-space') {
        const sc = notebookBodyScrollRef.current;
        if (sc) schedulePosePersist(sc.scrollTop, surfaceFocusBlockId);
      }
      setSurfaceFocusBlockId(null);
    },
    [context, schedulePosePersist, surfaceFocusBlockId],
  );

  const handlePreviewActivate = useCallback((lineIndex: number) => {
    const block = blocksRef.current[lineIndex];
    if (!block || block.kind === 'divider' || block.kind === 'image-ref' || block.kind === 'handwriting') return;
    pendingCaretRef.current = {
      id: block.id,
      offset: 0,
      scroll: 'never',
    };
    setSurfaceFocusBlockId(block.id);
    setEditorMode('edit');
  }, []);

  const handlePreviewMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const line = (e.target as HTMLElement).closest('[data-nb-preview-line]');
      if (!line) return;
      const idx = Number(line.getAttribute('data-nb-preview-line'));
      if (!Number.isFinite(idx)) return;
      e.preventDefault();
      e.stopPropagation();
      handlePreviewActivate(idx);
    },
    [handlePreviewActivate],
  );

  const previewLineActivateProps = useCallback(
    (lineIndex: number, kind: string): { 'data-nb-preview-line'?: number } => {
      if (kind === 'blank' || kind === 'divider' || kind === 'image-ref' || kind === 'handwriting') return {};
      return { 'data-nb-preview-line': lineIndex };
    },
    [],
  );

  const blockSurfaceChrome = useCallback(
    (blockId: string): CSSProperties => {
      const has = surfaceFocusBlockId !== null;
      const active = surfaceFocusBlockId === blockId;
      const soften = has && !active;
      return {
        opacity: soften ? 0.985 : 1,
        filter: active ? 'brightness(1.012)' : 'none',
        transition: isDeskPresentation
          ? 'opacity 0.12s ease, filter 0.12s ease'
          : 'opacity 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.22s ease',
      };
    },
    [surfaceFocusBlockId, isDeskPresentation],
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
    (host: HTMLElement, opts?: { force?: boolean }) => {
      const sc = notebookBodyScrollRef.current;
      if (context !== 'free-space' || !sc?.contains(host)) return;
      if (!opts?.force && userControlledScrollRef.current) return;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const sr = sc.getBoundingClientRect();
      const pad = 28;
      let adjusted = false;
      if (r.bottom > sr.bottom - pad) {
        isProgrammaticScrollRef.current = true;
        sc.scrollTop += Math.max(1, r.bottom - sr.bottom + pad);
        isProgrammaticScrollRef.current = false;
        adjusted = true;
      } else if (r.top < sr.top + pad) {
        isProgrammaticScrollRef.current = true;
        sc.scrollTop -= Math.max(1, sr.top + pad - r.top);
        isProgrammaticScrollRef.current = false;
        adjusted = true;
      }
      if (adjusted) schedulePosePersist(sc.scrollTop, surfaceFocusBlockId);
    },
    [context, schedulePosePersist, surfaceFocusBlockId],
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
    if (!root) {
      pendingCaretRef.current = null;
      return;
    }
    if (pending.scroll === 'force') {
      userControlledScrollRef.current = false;
    }
    const row = root.querySelector<HTMLElement>(
      `[data-divider-row][data-block-id="${pending.id}"]`,
    );
    if (row) {
      row.focus({ preventScroll: true });
      pendingCaretRef.current = null;
      if (pending.scroll !== 'never') {
        requestAnimationFrame(() => {
          ensureNotebookBodyCaretVisible(row, { force: pending.scroll === 'force' });
        });
      }
      return;
    }
    const host = root.querySelector<HTMLElement>(`[data-editable-id="${pending.id}"]`);
    if (!host) {
      pendingCaretRef.current = null;
      return;
    }
    host.focus({ preventScroll: true });
    setCaretOffsetIn(host, pending.offset);
    pendingCaretRef.current = null;
    if (pending.scroll === 'never') return;
    requestAnimationFrame(() => {
      ensureNotebookBodyCaretVisible(host, { force: pending.scroll === 'force' });
    });
  }, [blocks, editorMode, ensureNotebookBodyCaretVisible]);

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
          pendingCaretRef.current = { id: pid, offset: rest.length, scroll: 'ifNeeded' };
          return;
        }
        case 'handwriting': {
          const pid = newBlockId();
          const hwKey = newHandwritingKey();
          next = [
            ...prev.slice(0, i),
            { id, kind: 'handwriting', key: hwKey },
            { id: pid, kind: 'paragraph', text: rest },
            ...prev.slice(i + 1),
          ];
          setSlashMenu(null);
          setMorphPulseId(blockId);
          setBlocks(next);
          pushContent({ ...content, body: serializeBlocks(next) });
          pendingCaretRef.current = { id: pid, offset: rest.length, scroll: 'ifNeeded' };
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
      pendingCaretRef.current = { id: nb.id, offset: rest.length, scroll: 'ifNeeded' };
    },
    [content, pushContent],
  );

  useLayoutEffect(() => {
    if (editorMode !== 'edit') {
      setSelectionToolbar(null);
      selectionSnapshotRef.current = null;
      pendingCaretRef.current = null;
    }
  }, [editorMode]);

  const dismissSelectionToolbar = useCallback(() => {
    setSelectionToolbar(null);
    selectionSnapshotRef.current = null;
    toolbarActiveBlockIdRef.current = null;
    toolbarInteractingRef.current = false;
    ignoreDomInputBlockIdRef.current = null;
    domCommitLockUntilRef.current = 0;
    syncUnfreezeRichEditables();
  }, [syncUnfreezeRichEditables]);

  const dismissNotebookTextEditing = useCallback(() => {
    dismissSelectionToolbar();
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (
      active.isContentEditable ||
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT'
    ) {
      active.blur();
    }
  }, [dismissSelectionToolbar]);

  const handlePageInkDrawingChange = useCallback(
    (drawing: boolean) => {
      if (drawing) dismissNotebookTextEditing();
      if (context === 'free-space') onEditingChange?.(drawing);
    },
    [context, dismissNotebookTextEditing, onEditingChange],
  );

  const sectionPdfObjects = useMemo(
    () => (allObjects ?? []).filter(o => o.type === 'pdf'),
    [allObjects],
  );

  const handleLinkActivePagePdf = useCallback(
    (pdfObjectId: string) => {
      const pageId = contentRef.current.activePageId;
      if (!pageId) return;
      applyShellMutation((current, body) =>
        setNotebookPageLinkedPdf(saveNotebookPageBody(current, body), pageId, pdfObjectId),
      );
    },
    [applyShellMutation],
  );

  const handleOpenActivePageBinderStudy = useCallback(() => {
    if (!objectId || !activeInkBlockKey || !activeNotebookPage?.linkedPdfObjectId) return;
    const pdf = sectionPdfObjects.find(o => o.id === activeNotebookPage.linkedPdfObjectId);
    onOpenBinderStudy?.({
      pdfObjectId: activeNotebookPage.linkedPdfObjectId,
      inkObjectId: objectId,
      inkBlockKey: activeInkBlockKey,
      surfaceTitle: pdf?.title?.trim() || pageDisplayTitle(activeNotebookPage, 1),
    });
  }, [
    objectId,
    activeInkBlockKey,
    activeNotebookPage,
    sectionPdfObjects,
    onOpenBinderStudy,
  ]);

  const handleNotebookTextPenGuard = useCallback(
    (e: ReactPointerEvent) => {
      if (showInkMode) return;
      noteNotebookPointerDown(e.nativeEvent);
      const target = e.target;
      const el = target instanceof Element ? target : null;
      const hitsRich = el?.closest('[data-rich-editable="1"]') !== null;
      const hitsCe = el instanceof HTMLElement && el.isContentEditable;
      const hitsBrokenDescendant =
        el?.closest('[data-nb-editor-root="1"] [contenteditable]') !== null;
      const hitsText = hitsRich || hitsCe || hitsBrokenDescendant;
      inkPenTrace('pointerdown', 'H2', 'nb editor pen guard', {
        surface: hitsRich ? 'RichEditableLine' : hitsCe ? 'contenteditable' : 'editor-shell',
        pointerType: e.nativeEvent.pointerType,
        inNbRoot: true,
        detail: `hitsText=${hitsText} rich=${hitsRich} ce=${hitsCe} desc=${hitsBrokenDescendant} pen=${isPenPointer(e.nativeEvent)}`,
      });
      if (!isPenPointer(e.nativeEvent)) return;
      if (!el) return;
      if (el.closest('[data-hw-ink-canvas="1"]')) return;
      if (!hitsText) return;
      e.preventDefault();
      e.stopPropagation();
      dismissNotebookTextEditing();
    },
    [showInkMode, dismissNotebookTextEditing],
  );

  const handleNotebookTextPenUp = useCallback((e: ReactPointerEvent) => {
    if (showInkMode) return;
    noteNotebookPointerUp(e.nativeEvent);
  }, [showInkMode]);

  useEffect(() => {
    if (showInkMode || editorMode !== 'edit') return;
    const onBeforeInput = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('[data-nb-editor-root="1"]')) return;
      if (t.closest('[data-hw-ink-canvas="1"]')) return;
      if (!t.closest('[data-rich-editable="1"]') && !t.closest('[contenteditable]')) return;
      const ie = e as InputEvent;
      const reject = shouldRejectPenTextBeforeInput(ie);
      const rich = t.closest('[data-rich-editable="1"]');
      inkPenTrace('beforeinput', reject ? 'D' : 'E', reject ? 'doc reject' : 'doc allow', {
        surface: rich
          ? `RichEditableLine:${rich.getAttribute('data-block-id') ?? '?'}`
          : 'NotebookEditorOtherCE',
        inputType: ie.inputType,
        rejected: reject,
        inNbRoot: true,
      });
      if (reject) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('beforeinput', onBeforeInput, { capture: true });
    return () => document.removeEventListener('beforeinput', onBeforeInput, { capture: true });
  }, [showInkMode, editorMode]);

  useEffect(() => {
    if (!isInkPenTraceEnabled()) return;
    installInkPenTraceGlobal();
    inkPenTraceSetSurface({
      presentation,
      v1Enabled: isNotebookV1PagesEnabled(),
      v1PagesRaw: String(import.meta.env.VITE_NOTEBOOK_V1_PAGES ?? ''),
      showInkMode,
      pageKind: activePageKind,
      workspaceBinderMode,
      context,
    });
  }, [
    presentation,
    showInkMode,
    activePageKind,
    workspaceBinderMode,
    context,
  ]);

  const handleWritingModeChange = useCallback(
    (next: NotebookWritingMode) => {
      if (next === writingMode) return;
      void (async () => {
        await flushHandwritingBeforeTransition();
        dismissNotebookTextEditing();
        persistNotebookContent({ ...content, writingMode: next });
      })();
    },
    [writingMode, flushHandwritingBeforeTransition, dismissNotebookTextEditing, persistNotebookContent, content],
  );

  useEffect(() => {
    if (!showInkMode || !objectId) return;
    const keys = activeInkBlockKey ? [activeInkBlockKey] : [PAGE_INK_BLOCK_KEY];
    void hydrateHandwritingBlocks(objectId, keys);
  }, [showInkMode, objectId, activeInkBlockKey]);

  const restoreRichSelection = useCallback(
    (blockId: string, start: number, end: number) => {
      const root = getEditorRoot();
      if (!root) return;
      const el = findRichEditable(root, blockId);
      if (!el) return;
      el.focus({ preventScroll: true });
      setSelectionOffsetsIn(el, start, end);
    },
    [getEditorRoot],
  );

  const refreshToolbarFromSnapshot = useCallback(
    (snapshot: StoredNotebookSelection) => {
      const blk = blocksRef.current.find(b => b.id === snapshot.blockId);
      const marks =
        blk && blk.kind !== 'divider' && blk.kind !== 'image-ref' && blk.kind !== 'handwriting'
          ? (blk.marks ?? [])
          : snapshot.marks;
      selectionSnapshotRef.current = { ...snapshot, marks };
      toolbarActiveBlockIdRef.current =
        isDeskPresentation && deskFormattingV1 ? null : snapshot.blockId;
      setSelectionToolbar(prev =>
        prev
          ? { ...prev, marks, plain: snapshot.plain, start: snapshot.start, end: snapshot.end }
          : prev,
      );
    },
    [isDeskPresentation, deskFormattingV1],
  );

  const syncSelectionToolbar = useCallback(() => {
    const deskFmtOn = isDeskPresentation && readDeskFormattingV1();
    const sel = window.getSelection();
    // #region agent log
    nbAgentLog(
      'ProjectNotebookBlock:syncSelectionToolbar',
      'selectionchange',
      {
        collapsed: sel?.isCollapsed ?? true,
        text: sel?.toString().slice(0, 40) ?? '',
        editorMode,
        hasSlashMenu: Boolean(slashMenu),
        toolbarInteracting: toolbarInteractingRef.current,
        inMathEditor: isSelectionInMathEditor(),
      },
      'trace',
    );
    // #endregion
    if (isDeskPresentation && !deskFmtOn) {
      recordDeskFormatSyncEvent('dismiss', { reason: 'flag-off', deskFmtOn });
      dismissSelectionToolbar();
      return;
    }
    if (editorMode !== 'edit' || slashMenu) {
      dismissSelectionToolbar();
      return;
    }
    if (isSelectionInMathEditor()) {
      dismissSelectionToolbar();
      return;
    }
    const root = getEditorRoot();
    if (!root) {
      dismissSelectionToolbar();
      return;
    }
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (toolbarInteractingRef.current) return;
      dismissSelectionToolbar();
      return;
    }
    const editable = sel.anchorNode instanceof Node
      ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE
          ? (sel.anchorNode as Element).closest('[data-rich-editable="1"]')
          : sel.anchorNode.parentElement?.closest('[data-rich-editable="1"]'))
      : null;
    if (!editable || !root.contains(editable)) {
      recordDeskFormatSyncEvent('dismiss', { reason: 'no-rich-editable', deskFmtOn });
      nbToolbarDebug('syncSelectionToolbar:dismiss', { reason: 'no-rich-editable', deskFmtOn });
      if (toolbarInteractingRef.current) return;
      dismissSelectionToolbar();
      return;
    }
    const blockId = editable.getAttribute('data-block-id');
    if (!blockId) {
      dismissSelectionToolbar();
      return;
    }
    const offsets = getSelectionOffsetsIn(editable as HTMLElement);
    if (!offsets || offsets.collapsed) {
      if (toolbarInteractingRef.current) return;
      dismissSelectionToolbar();
      return;
    }
    const blk = blocksRef.current.find(b => b.id === blockId);
    if (!blk || blk.kind === 'divider' || blk.kind === 'image-ref' || blk.kind === 'handwriting') {
      dismissSelectionToolbar();
      return;
    }
    const plain = blk.text;
    let anchor = anchorFromSelection();
    if (deskFmtOn) {
      const selRect = getSelectionClientRect();
      const editableRect = (editable as HTMLElement).getBoundingClientRect();
      const rect =
        selRect && (selRect.width > 0 || selRect.height > 0)
          ? selRect
          : editableRect.width > 0 || editableRect.height > 0
            ? editableRect
            : null;
      anchor = rect ? computeToolbarAnchor(rect, 200) : { top: 12, left: 12, width: 200 };
    } else if (!anchor) {
      recordDeskFormatSyncEvent('dismiss', { reason: 'no-anchor', blockId });
      nbToolbarDebug('syncSelectionToolbar:dismiss', { reason: 'no-anchor', blockId });
      if (toolbarInteractingRef.current) return;
      dismissSelectionToolbar();
      return;
    }
    const snapshot: StoredNotebookSelection = {
      blockId,
      start: offsets.start,
      end: offsets.end,
      plain,
      marks: blk.marks ?? [],
    };
    selectionSnapshotRef.current = snapshot;
    toolbarActiveBlockIdRef.current = deskFmtOn ? null : blockId;
    setSelectionToolbar({ ...snapshot, anchor });
    recordDeskFormatSyncEvent('visible', {
      blockId,
      start: offsets.start,
      end: offsets.end,
      deskFmtOn,
    });
    nbToolbarDebug('syncSelectionToolbar:visible', {
      blockId,
      start: offsets.start,
      end: offsets.end,
      deskFmtOn,
    });
  }, [editorMode, slashMenu, getEditorRoot, dismissSelectionToolbar, isDeskPresentation]);

  const canvasRichSelectionToolbarActive = selectionToolbar != null && !isDeskPresentation;

  useEffect(() => {
    if (!canvasRichSelectionToolbarActive) return;
    const allowNativeTyping = (inputType?: string | null) =>
      inputType === 'insertText'
      || inputType === 'insertCompositionText'
      || inputType === 'insertFromComposition'
      || inputType === 'insertParagraph'
      || inputType === 'deleteContentBackward'
      || inputType === 'deleteContentForward'
      || inputType === 'deleteByCut'
      || inputType === 'deleteByDrag';
    const onBeforeInput = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('[data-rich-editable="1"]')) return;
      const ie = e as InputEvent;
      if (allowNativeTyping(ie.inputType)) return;
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:toolbarOpenGuard',
        'beforeinput-blocked',
        { inputType: ie.inputType, data: ie.data ?? null },
        'B',
        'post-fix',
      );
      // #endregion
      e.preventDefault();
    };
    const onInputCapture = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('[data-rich-editable="1"]')) return;
      const ie = e as InputEvent;
      if (allowNativeTyping(ie.inputType)) return;
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:toolbarOpenGuard',
        'input-blocked-capture',
        {
          inputType: ie.inputType,
          data: ie.data ?? null,
          domText: t.textContent?.slice(0, 60) ?? '',
        },
        'C',
        'post-fix',
      );
      // #endregion
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('beforeinput', onBeforeInput, { capture: true });
    document.addEventListener('input', onInputCapture, { capture: true });
    return () => {
      document.removeEventListener('beforeinput', onBeforeInput, { capture: true });
      document.removeEventListener('input', onInputCapture, { capture: true });
    };
  }, [canvasRichSelectionToolbarActive]);

  /** Freeze rich editables while canvas floating toolbar is open (not desk). */
  useLayoutEffect(() => {
    if (!canvasRichSelectionToolbarActive) {
      syncUnfreezeRichEditables();
      return;
    }
    syncFreezeRichEditables();
    lockDomTextCommits(800);
  }, [
    canvasRichSelectionToolbarActive,
    syncFreezeRichEditables,
    syncUnfreezeRichEditables,
    lockDomTextCommits,
  ]);

  useEffect(() => {
    if (isDeskPresentation && !deskFormattingV1) dismissSelectionToolbar();
  }, [isDeskPresentation, deskFormattingV1, dismissSelectionToolbar]);

  useEffect(() => {
    // #region agent log
    nbAgentLog(
      'ProjectNotebookBlock',
      'mounted',
      { editorMode, hasBody: Boolean(content.body?.length) },
      'init',
    );
    // #endregion
  }, []);

  useEffect(() => {
    if (editorMode !== 'edit') return;
    const onSel = () => syncSelectionToolbar();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [editorMode, syncSelectionToolbar]);

  const applyMarksToBlock = useCallback(
    (blockId: string, start: number, end: number, updater: (marks: InlineMark[]) => InlineMark[]) => {
      const prev = blocksRef.current;
      const i = prev.findIndex(b => b.id === blockId);
      if (i === -1) return;
      const block = prev[i]!;
      if (block.kind === 'divider' || block.kind === 'image-ref' || block.kind === 'handwriting') return;
      const snapshot = selectionSnapshotRef.current;
      const plainText =
        snapshot?.blockId === blockId ? snapshot.plain : block.text;
      nbToolbarDebug('applyMarksToBlock before', {
        blockId,
        text: block.text,
        snapshotPlain: snapshot?.plain,
        marks: block.marks,
      });
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:applyMarksToBlock',
        'apply-marks',
        { blockId, start, end, plainText, blockText: block.text },
        'D',
      );
      // #endregion
      const marks = updater(block.marks ?? []);
      const nextBlock = {
        ...block,
        text: plainText,
        marks: marks.length ? marks : undefined,
      } as Block;
      nbToolbarDebug('applyMarksToBlock after', {
        text: plainText,
        marks,
      });
      const next = [...prev.slice(0, i), nextBlock, ...prev.slice(i + 1)];
      lockDomTextCommits(520);
      ignoreDomInputBlockIdRef.current = blockId;
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:applyMarksToBlock',
        'flushSync-start',
        { blockId, plainText, markCount: marks.length },
        'D',
        'post-fix',
      );
      // #endregion
      flushSync(() => {
        setBlocks(next);
      });
      const nextContent = { ...content, body: serializeBlocks(next) };
      pushContent(nextContent);
      flushNotebookPersist();
      if (snapshot?.blockId === blockId) {
        const nextMarks =
          nextBlock.kind !== 'divider' && nextBlock.kind !== 'image-ref' && nextBlock.kind !== 'handwriting'
            ? (nextBlock.marks ?? [])
            : [];
        selectionSnapshotRef.current = { ...snapshot, plain: plainText, marks: nextMarks };
        refreshToolbarFromSnapshot(selectionSnapshotRef.current);
      }
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:applyMarksToBlock',
        'flushSync-done',
        { blockId, plainText, persistedBody: nextContent.body?.slice(0, 80) ?? '' },
        'D',
        'post-fix',
      );
      // #endregion
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          restoreRichSelection(blockId, start, end);
          releaseDomTextCommitLock(600);
        });
      });
    },
    [
      content,
      pushContent,
      flushNotebookPersist,
      restoreRichSelection,
      refreshToolbarFromSnapshot,
      lockDomTextCommits,
      releaseDomTextCommitLock,
      syncUnfreezeRichEditables,
    ],
  );

  const toggleInlineMarkFromSnapshot = useCallback(
    (markKey: 'b' | 'i' | 'u' | 's' | InlineMark['t'], value?: string) => {
      const snapshot = selectionSnapshotRef.current;
      if (!snapshot) {
        // #region agent log
        nbAgentLog(
          'ProjectNotebookBlock:toggleInlineMarkFromSnapshot',
          'no-snapshot',
          { markKey },
          'E',
        );
        // #endregion
        return;
      }
      const { blockId, start, end } = snapshot;
      applyMarksToBlock(blockId, start, end, m =>
        applyMarkToggle(m, start, end, markKey, value),
      );
    },
    [applyMarksToBlock],
  );

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

  const isMathWorkspaceMode = notebookMode === 'math-workspace';
  const isScratch = notebookMode === 'scratch';
  const writingColumnStyle = useMemo(
    (): CSSProperties => ({
      ...(isDeskPresentation
        ? {
            flex: 1,
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
          }
        : {}),
      maxWidth: isDeskPresentation
        ? '100%'
        : isMathNotebook
          ? 'min(760px, 100%)'
          : isPaperSurface
            ? 'min(640px, 100%)'
            : 'min(700px, 100%)',
      margin: isDeskPresentation ? 0 : '0 auto',
      width: '100%',
      paddingLeft: isDeskPresentation
        ? 4
        : isPaperSurface
          ? 'clamp(32px, 6vw, 56px)'
          : isMathWorkspaceMode
            ? 'clamp(8px, 1.5vw, 16px)'
            : 'clamp(20px, 4vw, 44px)',
      paddingRight: isDeskPresentation
        ? 4
        : isPaperSurface
          ? 'clamp(32px, 6vw, 56px)'
          : isMathWorkspaceMode
            ? 'clamp(8px, 1.5vw, 16px)'
            : 'clamp(20px, 4vw, 44px)',
    }),
    [isDeskPresentation, isMathNotebook, isPaperSurface, isMathWorkspaceMode],
  );

  const editorSurfaceStyle = useMemo((): CSSProperties => {
    if (isDeskPresentation) {
      return {
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100%',
        flex: 1,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        backgroundColor: '#ece6d9',
        backgroundAttachment: 'local',
        color: ink.primary,
        fontSize: '16px',
        lineHeight: 1.75,
        letterSpacing: '0.01em',
        fontFamily: 'Georgia, "Times New Roman", serif',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        paddingTop: 4,
        paddingBottom: 14,
        outline: 'none',
        WebkitFontSmoothing: 'antialiased',
      };
    }
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
      backgroundColor: isMathWorkspaceMode ? 'rgba(129,140,248,0.008)' : isScratch ? 'rgba(255,255,255,0.006)' : 'rgba(255,255,255,0.018)',
      backgroundImage: writingSurfaceBackground.image,
      backgroundSize: writingSurfaceBackground.size,
      color: ink.primary,
      fontSize: `${typeScale.l3}px`,
      lineHeight: 1.96,
      letterSpacing: '0.005em',
      fontFamily: fontStack,
      fontFeatureSettings: '"kern" 1, "liga" 1',
      // Use explicit longhand border properties to avoid shorthand/longhand conflict warning
      // scratch: very faint, no accent — margin paper feeling
      borderTop: isScratch ? '1px solid rgba(255,255,255,0.022)' : '1px solid rgba(255,255,255,0.055)',
      borderRight: isScratch ? '1px solid rgba(255,255,255,0.022)' : '1px solid rgba(255,255,255,0.055)',
      borderBottom: isScratch ? '1px solid rgba(255,255,255,0.022)' : '1px solid rgba(255,255,255,0.055)',
      borderLeft: isMathWorkspaceMode ? '2px solid rgba(129,140,248,0.38)' : isScratch ? '1px solid rgba(255,255,255,0.022)' : (isMathNotebook ? '2px solid rgba(129,140,248,0.20)' : '1px solid rgba(255,255,255,0.055)'),
      borderRadius: 22,
      boxShadow: isScratch
        ? 'inset 0 1px 0 rgba(255,255,255,0.02), 0 12px 32px rgba(0,0,0,0.10)'
        : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 20px 54px rgba(0,0,0,0.18)',
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
    isMathWorkspaceMode,
    isScratch,
    isPaperSurface,
    isDeskPresentation,
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
    (id: string, rawText: string, marksOverride?: InlineMark[]) => {
      const snap = selectionSnapshotRef.current;
      if (snap?.blockId === id && rawText !== snap.plain && isDomTextCommitLocked()) {
        return;
      }
      nbToolbarDebug('updateBlockText', { id, rawText, marksOverride });
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:updateBlockText',
        'update-block-text',
        { id, rawText, marksOverrideLen: marksOverride?.length ?? null },
        'D',
      );
      // #endregion
      const caretBefore = captureCaretForBlock(id);
      const prev = blocksRef.current;
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return;
      const block = prev[i]!;
      if (block.kind === 'divider' || block.kind === 'image-ref' || block.kind === 'handwriting') return;

      if (isDeskPresentation && (block.kind === 'paragraph' || block.kind === 'step')) {
        setDeskChecks(prev => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }

      let text = rawText.replace(/\r\n/g, '\n');
      if (isMathNotebook && block.kind === 'step') {
        text = normalizeToLinearMath(text);
      }
      const nextMarks = resolveBlockMarksAfterEdit(
        block.text,
        text,
        block.marks,
        marksOverride,
      );

      if (block.kind === 'paragraph') {
        const transformed = morphParagraphLine(text, block.id);
        if (Array.isArray(transformed)) {
          const next = [...prev.slice(0, i), ...transformed, ...prev.slice(i + 1)];
          setBlocks(next);
          pushContent({ ...content, body: serializeBlocks(next) });
          const last = transformed[transformed.length - 1]!;
          if (caretBefore !== null && last.kind !== 'divider' && last.kind !== 'image-ref' && last.kind !== 'handwriting') {
            scheduleCaret(last, caretBefore);
          }
          const firstMorphed = transformed.find(b => b.kind !== 'divider' && b.kind !== 'paragraph');
          if (firstMorphed) setMorphPulseId(firstMorphed.id);
          return;
        }
        const variantMatch =
          transformed.kind !== 'paragraph' || block.kind !== 'paragraph'
            ? true
            : (transformed.variant ?? undefined) === (block.variant ?? undefined);
        const transformedText = (transformed as { text?: string }).text ?? '';
        const blockText = block.text ?? '';
        const sameShape =
          transformed.kind === block.kind &&
          transformedText === blockText &&
          transformed.id === block.id &&
          variantMatch &&
          JSON.stringify(nextMarks ?? []) === JSON.stringify(block.marks ?? []);
        if (sameShape && text === blockText) return;
        const withMarks = {
          ...transformed,
          ...(nextMarks?.length ? { marks: nextMarks } : {}),
        } as Block;
        const next = [...prev.slice(0, i), withMarks, ...prev.slice(i + 1)];
        setBlocks(next);
        pushContent({ ...content, body: serializeBlocks(next) });
        if (caretBefore !== null && withMarks.kind !== 'divider' && withMarks.kind !== 'image-ref' && withMarks.kind !== 'handwriting') {
          scheduleCaret(withMarks, caretBefore);
        }
        if (withMarks.kind !== 'paragraph') setMorphPulseId(withMarks.id);
        return;
      }

      const singleLine = text.includes('\n') ? (text.split('\n')[0] ?? '') : text;
      const edited: Block = applyVisualEditToStructuredBlock(block, singleLine);
      const editedText = (edited as { text?: string }).text ?? '';
      const blockText2 = block.text ?? '';
      const same =
        edited.kind === block.kind &&
        editedText === blockText2 &&
        JSON.stringify(nextMarks ?? []) === JSON.stringify(block.marks ?? []) &&
        (block.kind !== 'task' || (edited.kind === 'task' && edited.checked === block.checked)) &&
        (block.kind !== 'ordered' || (edited.kind === 'ordered' && edited.number === block.number));
      if (same && text === blockText2) return;
      const withMarks = {
        ...edited,
        ...(nextMarks?.length ? { marks: nextMarks } : {}),
      } as Block;
      const next = [...prev.slice(0, i), withMarks, ...prev.slice(i + 1)];
      setBlocks(next);
      pushContent({ ...content, body: serializeBlocks(next) });
      if (caretBefore !== null) scheduleCaret(withMarks, caretBefore);
    },
    [content, pushContent, captureCaretForBlock, scheduleCaret, isDomTextCommitLocked, isDeskPresentation, isMathNotebook],
  );

  const handleToolbarCommand = useCallback(
    (cmd: ToolbarCommand) => {
      if (deskFormattingActive) recordDeskFormattingMetric(cmd);
      const snapshot = selectionSnapshotRef.current;
      nbToolbarDebug('handleToolbarCommand', { cmd, snapshot });
      const active = document.activeElement;
      const toolbarRoot = document.querySelector('[data-nb-format-toolbar="1"]');
      const beforeBlock = snapshot
        ? blocksRef.current.find(b => b.id === snapshot.blockId)
        : undefined;
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:handleToolbarCommand',
        'command-assert-start',
        {
          cmd,
          activeElement: active instanceof HTMLElement ? active.tagName : String(active),
          activeInContentEditable:
            active instanceof HTMLElement &&
            (active.isContentEditable || !!active.closest('[contenteditable="true"]')),
          toolbarPortaledToBody: toolbarRoot?.parentElement === document.body,
          toolbarInsideContentEditable:
            toolbarRoot instanceof Element &&
            !!toolbarRoot.closest('[contenteditable="true"]'),
          snapshot,
          beforeText: beforeBlock && 'text' in beforeBlock ? beforeBlock.text : null,
          beforeMarks: beforeBlock && 'marks' in beforeBlock ? beforeBlock.marks ?? [] : null,
        },
        'E',
        'post-fix',
      );
      // #endregion
      if (!snapshot) return;
      const { blockId, start, end, plain, marks } = snapshot;
      switch (cmd.type) {
        case 'toggleMark':
          toggleInlineMarkFromSnapshot(cmd.mark, cmd.value);
          break;
        case 'setFontSize':
          toggleInlineMarkFromSnapshot('fs', String(cmd.px));
          break;
        case 'setTextColor':
          toggleInlineMarkFromSnapshot('fg', cmd.color);
          break;
        case 'setHighlight':
          toggleInlineMarkFromSnapshot('hl', cmd.color);
          break;
        case 'morphBlock': {
          const prev = blocksRef.current;
          const i = prev.findIndex(b => b.id === blockId);
          if (i === -1) break;
          const morphed = morphBlockKind(prev[i]! as Parameters<typeof morphBlockKind>[0], cmd.target) as Block;
          const next = [...prev.slice(0, i), morphed, ...prev.slice(i + 1)];
          setBlocks(next);
          pushContent({ ...content, body: serializeBlocks(next) });
          setMorphPulseId(blockId);
          requestAnimationFrame(() => restoreRichSelection(blockId, start, end));
          break;
        }
        case 'copy':
          void copyRichSlice(plain, start, end);
          toast.success('Copied');
          requestAnimationFrame(() => restoreRichSelection(blockId, start, end));
          break;
        case 'duplicate': {
          const dup = duplicateRange(plain, marks, start, end);
          selectionSnapshotRef.current = {
            blockId,
            start: dup.selectionStart,
            end: dup.selectionEnd,
            plain: dup.plain,
            marks: dup.marks,
          };
          toolbarActiveBlockIdRef.current = blockId;
          updateBlockText(blockId, dup.plain, dup.marks);
          requestAnimationFrame(() => {
            restoreRichSelection(blockId, dup.selectionStart, dup.selectionEnd);
            if (selectionSnapshotRef.current) refreshToolbarFromSnapshot(selectionSnapshotRef.current);
          });
          break;
        }
        case 'clearFormatting':
          applyMarksToBlock(blockId, start, end, m => clearAllMarksInRange(m, start, end));
          break;
      }
      const afterBlock = blocksRef.current.find(b => b.id === blockId);
      // #region agent log
      nbAgentLog(
        'ProjectNotebookBlock:handleToolbarCommand',
        'command-assert-done',
        {
          cmd,
          afterText: afterBlock && 'text' in afterBlock ? afterBlock.text : null,
          afterMarks: afterBlock && 'marks' in afterBlock ? afterBlock.marks ?? [] : null,
        },
        'E',
        'post-fix',
      );
      // #endregion
    },
    [
      applyMarksToBlock,
      content,
      pushContent,
      updateBlockText,
      restoreRichSelection,
      refreshToolbarFromSnapshot,
      getEditorRoot,
      toggleInlineMarkFromSnapshot,
      deskFormattingActive,
    ],
  );

  const handleToolbarPointerDown = useCallback(() => {
    lockDomTextCommits(deskFormattingActive ? 320 : 520);
    if (!deskFormattingActive) syncFreezeRichEditables();
  }, [lockDomTextCommits, syncFreezeRichEditables, deskFormattingActive]);

  const handleToolbarPointerUp = useCallback(() => {
    releaseDomTextCommitLock(400);
  }, [releaseDomTextCommitLock]);

  const handleRichSelectionChange = useCallback(
    (_blockId: string, _el: HTMLDivElement) => {
      syncSelectionToolbar();
    },
    [syncSelectionToolbar],
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
      const removed = prev[index];
      if (freeSpaceSectionId && objectId && removed) {
        void import('../../lib/knowledge/tombstoneStore').then(({ writeNotebookBlockTombstone }) =>
          writeNotebookBlockTombstone({
            sectionId: freeSpaceSectionId,
            boardId: freeSpaceBoardId,
            objectId,
            objectTitle: objectTitle ?? 'Notebook',
            blockIndex: index,
            block: { ...removed } as import('../../lib/knowledge/knowledgeTypes').NotebookBlockSnapshot,
          }),
        );
      }
      if (removed?.kind === 'handwriting' && objectId) {
        void hwDelete(objectId, removed.key);
      }
      const next = [...prev.slice(0, index), ...prev.slice(index + 1)];
      const filled = next.length === 0 ? parseBodyToBlocks('') : next;
      const nextBody = serializeBlocks(filled);
      setBlocks(filled);
      pushContent({ ...content, body: nextBody });
      if (objectId) void gcOrphanHandwriting(objectId, nextBody);
      const focusIdx = Math.max(0, index - 1);
      const focusBlock = filled[focusIdx];
      if (focusBlock && focusBlock.kind !== 'divider' && focusBlock.kind !== 'image-ref' && focusBlock.kind !== 'handwriting') {
        pendingCaretRef.current = {
          id: focusBlock.id,
          offset: focusBlock.text.length,
          scroll: 'ifNeeded',
        };
      }
    },
    [content, pushContent, freeSpaceSectionId, freeSpaceBoardId, objectId, objectTitle],
  );

  const focusEditableBlock = useCallback((root: HTMLElement, block: Block, offset: number) => {
    if (block.kind === 'divider') {
      (root.querySelector(`[data-divider-row][data-block-id="${block.id}"]`) as HTMLElement | null)?.focus({
        preventScroll: true,
      });
      return;
    }
    if (block.kind === 'image-ref' || block.kind === 'handwriting') return;
    const o = clampCaretOffset(block, offset);
    userControlledScrollRef.current = false;
    pendingCaretRef.current = { id: block.id, offset: o, scroll: 'ifNeeded' };
    requestAnimationFrame(() => {
      const el = root.querySelector<HTMLElement>(`[data-editable-id="${block.id}"]`);
      el?.focus({ preventScroll: true });
    });
  }, []);

  const scheduleMathLineFocus = useCallback(
    (blockId: string, offset: number) => {
      const blk = blocksRef.current.find(b => b.id === blockId);
      if (!blk || blk.kind === 'divider' || blk.kind === 'image-ref' || blk.kind === 'handwriting') return;
      setSurfaceFocusBlockId(blockId);
      const o = clampCaretOffset(blk, offset);
      pendingCaretRef.current = { id: blockId, offset: o, scroll: 'never' };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const root = getEditorRoot();
          if (!root) return;
          const el = root.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`);
          if (!el) return;
          el.focus({ preventScroll: true });
          setCaretOffsetIn(el, o);
          pendingCaretRef.current = null;
        });
      });
    },
    [getEditorRoot],
  );

  const insertMathSnippet = useCallback(
    (snippet: string, blockIdOverride?: string | null) => {
      const blockId = blockIdOverride ?? surfaceFocusBlockId ?? lastFocusedMathBlockIdRef.current;
      if (!blockId) return;
      const blk = blocksRef.current.find(b => b.id === blockId);
      if (!blk || blk.kind === 'divider' || blk.kind === 'image-ref' || blk.kind === 'handwriting') return;
      if (blk.kind === 'math') {
        const latex = plainMathToLatex(snippet);
        updateBlockText(blockId, latex);
        scheduleMathLineFocus(blockId, latex.length);
        return;
      }
      const root = getEditorRoot();
      const el = root?.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`);
      const offset = el ? getCaretOffsetIn(el) : blk.text.length;
      const insert = snippet.endsWith(' ') ? snippet : `${snippet} `;
      const newText = blk.text.slice(0, offset) + insert + blk.text.slice(offset);
      updateBlockText(blockId, newText);
      scheduleMathLineFocus(blockId, offset + insert.length);
    },
    [surfaceFocusBlockId, updateBlockText, getEditorRoot, scheduleMathLineFocus],
  );

  const applyMathTemplate = useCallback(
    (templateId: MathTemplateId, values: Record<string, string>, blockIdOverride?: string | null) => {
      const template = getMathTemplate(templateId);
      if (!template) return;
      const blockId = blockIdOverride ?? surfaceFocusBlockId ?? lastFocusedMathBlockIdRef.current;
      if (!blockId) return;
      const blk = blocksRef.current.find(b => b.id === blockId);
      if (!blk || blk.kind === 'divider' || blk.kind === 'image-ref' || blk.kind === 'handwriting') return;
      if (blk.kind === 'math') {
        const latex = template.buildLatex(values);
        updateBlockText(blockId, latex);
        scheduleMathLineFocus(blockId, latex.length);
        return;
      }
      insertMathSnippet(template.buildSimple(values), blockId);
    },
    [insertMathSnippet, surfaceFocusBlockId, updateBlockText, scheduleMathLineFocus],
  );

  const insertBlockAfter = useCallback(
    (afterIndex: number, newBlock: Block) => {
      const b = blocksRef.current;
      const next = [...b.slice(0, afterIndex + 1), newBlock, ...b.slice(afterIndex + 1)];
      persist(next);
      if (newBlock.kind !== 'handwriting' && 'text' in newBlock) {
        pendingCaretRef.current = { id: newBlock.id, offset: 0, scroll: 'force' };
        setSurfaceFocusBlockId(newBlock.id);
        lastFocusedMathBlockIdRef.current = newBlock.id;
      }
      if (newBlock.kind === 'handwriting' && objectId) {
        void hydrateHandwritingBlocks(objectId, [newBlock.key]);
      }
    },
    [persist, objectId],
  );

  const handleGutterStep = useCallback(
    (afterIndex: number) => {
      const fresh: Block = { id: newBlockId(), kind: 'step', text: '' };
      insertBlockAfter(afterIndex, fresh);
      compositionChrome.markCompositionSuccess();
    },
    [insertBlockAfter, compositionChrome],
  );

  const handleGutterEquation = useCallback(
    (afterIndex: number) => {
      const fresh: Block = { id: newBlockId(), kind: 'math', text: '' };
      insertBlockAfter(afterIndex, fresh);
      compositionChrome.markCompositionSuccess();
    },
    [insertBlockAfter, compositionChrome],
  );

  const handleGutterHandwriting = useCallback(
    (afterIndex: number) => {
      const hwKey = newHandwritingKey();
      const fresh: Block = { id: newBlockId(), kind: 'handwriting', key: hwKey };
      insertBlockAfter(afterIndex, fresh);
      compositionChrome.markCompositionSuccess();
    },
    [insertBlockAfter, compositionChrome],
  );

  const handleCompositionEquationBlock = useCallback(
    (afterIndex: number) => {
      handleGutterEquation(afterIndex);
    },
    [handleGutterEquation],
  );

  const findFirstEditableBlockId = useCallback((): string | null => {
    const b = blocksRef.current;
    const hit = b.find(blk => isMathCapableBlockKind(blk.kind));
    return hit?.id ?? null;
  }, []);

  const handleCompositionFocusBlock = useCallback(
    (blockId: string) => {
      const blk = blocksRef.current.find(b => b.id === blockId);
      if (!blk || !isMathCapableBlockKind(blk.kind)) return;
      setSurfaceFocusBlockId(blockId);
      lastFocusedMathBlockIdRef.current = blockId;
      pendingCaretRef.current = { id: blockId, offset: 0, scroll: 'ifNeeded' };
      requestAnimationFrame(() => {
        const root = getEditorRoot();
        const el = root?.querySelector<HTMLElement>(`[data-editable-id="${blockId}"]`);
        el?.focus({ preventScroll: true });
      });
    },
    [getEditorRoot],
  );

  const blockIndexById = useCallback((id: string) => blocksRef.current.findIndex(b => b.id === id), []);

  const focusedBlockKind = useMemo(() => {
    if (!surfaceFocusBlockId) return null;
    return blocks.find(b => b.id === surfaceFocusBlockId)?.kind ?? null;
  }, [blocks, surfaceFocusBlockId]);

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
      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
        noteNotebookKeyboardTyping();
      }

      const root = getEditorRoot();
      if (!root) return;
      const blocks = blocksRef.current;
      const sm = slashMenuRef.current;

      if (isDeskPresentation && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        let blockId = surfaceFocusBlockId;
        if (!blockId && focusIndexRef.current >= 0) {
          blockId = blocks[focusIndexRef.current]?.id ?? null;
        }
        if (blockId) {
          runDeskCheckForBlockId(blockId);
        }
        return;
      }

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
                pendingCaretRef.current = { id: blockId, offset: expanded.caret, scroll: 'never' };
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
                  pendingCaretRef.current = { id: blockId, offset: 0, scroll: 'never' };
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
                  tb.kind === 'divider' || tb.kind === 'image-ref' || tb.kind === 'handwriting'
                    ? 0
                    : e.key === 'ArrowUp'
                      ? tb.text.length
                      : 0;
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
      if (block.kind === 'image-ref' || block.kind === 'handwriting') return;

      if (
        editable.getAttribute('data-rich-editable') === '1' &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey
      ) {
        const k = e.key.toLowerCase();
        const markKey: 'b' | 'i' | 'u' | null =
          k === 'b' ? 'b' : k === 'i' ? 'i' : k === 'u' ? 'u' : null;
        if (markKey) {
          const offsets = getSelectionOffsetsIn(editable);
          if (offsets && !offsets.collapsed && block.kind !== 'divider') {
            e.preventDefault();
            const plainText = block.text;
            const blockMarks = block.marks ?? [];
            selectionSnapshotRef.current = {
              blockId: id,
              start: offsets.start,
              end: offsets.end,
              plain: plainText,
              marks: blockMarks,
            };
            // #region agent log
            nbAgentLog(
              'ProjectNotebookBlock:handleEditorKeyCapture',
              'keyboard-toggle-mark',
              { markKey, blockId: id, start: offsets.start, end: offsets.end, plainText },
              'keyboard',
            );
            // #endregion
            applyMarksToBlock(id, offsets.start, offsets.end, m =>
              applyMarkToggle(m, offsets.start, offsets.end, markKey),
            );
            return;
          }
        }
      }

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
          const col =
            pb.kind === 'divider' || pb.kind === 'image-ref' || pb.kind === 'handwriting'
              ? 0
              : Math.min(offset, pb.text.length);
          focusEditableBlock(root, pb, col);
          return;
        }

        const ni = nextNavBlockIndex(blocks, index);
        if (ni === -1) return;
        e.preventDefault();
        const nb = blocks[ni]!;
        const col =
          nb.kind === 'divider' || nb.kind === 'image-ref' || nb.kind === 'handwriting'
            ? 0
            : Math.min(offset, nb.text.length);
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
        pendingCaretRef.current = { id: block.id, offset: offset + 1, scroll: 'never' };
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
          pendingCaretRef.current = { id: nb.id, offset: 0, scroll: 'force' };
          return;
        }

        e.preventDefault();

        if (block.kind === 'divider') {
          const fresh: Block = { id: newBlockId(), kind: 'paragraph', text: '' };
          const next = [...blocks.slice(0, index + 1), fresh, ...blocks.slice(index + 1)];
          persist(next);
          pendingCaretRef.current = { id: fresh.id, offset: 0, scroll: 'force' };
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
          pendingCaretRef.current = { id: nextBlock.id, offset: 0, scroll: 'force' };
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
            pendingCaretRef.current = { id, offset: transform.body.length, scroll: 'ifNeeded' };
            return;
          }
        }

        const before = text.slice(0, offset);
        const after = autoCapitalizeParagraphStart(text.slice(offset));
        const updated: Block = { ...block, text: before };
        const nextBlock: Block = { id: newBlockId(), kind: 'paragraph', text: after };
        const next = [...blocks.slice(0, index), updated, nextBlock, ...blocks.slice(index + 1)];
        persist(next);
        pendingCaretRef.current = { id: nextBlock.id, offset: 0, scroll: 'force' };
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
        pendingCaretRef.current = { id: merged.id, offset: blockTextLen(block), scroll: 'ifNeeded' };
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
              scroll: 'never',
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
          pendingCaretRef.current = { id: nextBlock.id, offset: 0, scroll: 'force' };
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
          pendingCaretRef.current = { id: nextBlock.id, offset: 0, scroll: 'force' };
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
          pendingCaretRef.current = {
            id: merged.id,
            offset:
              prev.kind === 'image-ref' || prev.kind === 'handwriting' ? 0 : prev.text.length,
            scroll: 'ifNeeded',
          };
        }
      }
    },
    [
      editorMode,
      isMathNotebook,
      isDeskPresentation,
      surfaceFocusBlockId,
      runDeskCheckForBlockId,
      persist,
      removeBlockAt,
      applySlashCommand,
      applyBlockLevel,
      updateBlockText,
      content,
      persistNotebookContent,
      onCreateRecallItem,
      focusEditableBlock,
      getEditorRoot,
      scheduleCaret,
      applyMarksToBlock,
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
    return blocks.map((block, index) => {
      const listKey = blockListKey(block, index);
      if (block.kind === 'divider') {
        return (
          <div key={listKey} style={{ display: 'flex', alignItems: 'center', margin: '28px 0' }}>
            <div style={{ flex: 1, height: '1px', background: isPaperSurface ? 'rgba(28,25,23,0.12)' : 'rgba(255,248,235,0.12)' }} />
          </div>
        );
      }
      if (block.kind === 'title') {
        return (
          <EditableLineGuarded
            key={listKey}
            id={block.id}
            text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
          <div key={listKey} style={{
            borderBottom: `1px solid ${isPaperSurface ? 'rgba(180,83,9,0.35)' : 'rgba(245,158,11,0.18)'}`,
            paddingBottom: 6, marginBottom: 24,
          }}>
            <EditableLineGuarded
              id={block.id}
              text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
          <div key={listKey} style={{
            borderLeft: `3px solid ${ct.bar}`,
            background: ct.bg,
            padding: '16px 18px 16px 20px',
            borderRadius: '0 8px 8px 0',
            marginBottom: 10,
          }}>
            <EditableLineGuarded
              id={block.id}
              text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
          <div key={listKey} style={{ margin: '12px 0', userSelect: 'none' }}>
            <img src={src} alt={block.alt} style={{ width: '100%', display: 'block', maxHeight: 480, objectFit: 'contain', borderRadius: 8 }} />
          </div>
        ) : null;
      }
      if (block.kind === 'handwriting') {
        return (
          <HandwritingBlock
            key={listKey}
            blockId={block.id}
            objectId={objectId ?? ''}
            blockKey={block.key}
            tokens={tokens}
            readOnly
          />
        );
      }
      // Step block — continuous derivation flow (no card, no counter, faint left rail)
      if (block.kind === 'step') {
        let stepIndex = 1;
        for (let si = index - 1; si >= 0; si--) {
          if (blocks[si]!.kind !== 'step') break;
          stepIndex++;
        }
        const isFirstStep = stepIndex === 1;
        const isLastStep = index >= blocks.length - 1 || blocks[index + 1]?.kind !== 'step';
        return (
          <StepBlockRenderer
            key={listKey}
            block={block}
            stepIndex={stepIndex}
            isFirst={isFirstStep}
            isLast={isLastStep}
            isFocused={surfaceFocusBlockId === block.id}
            tokens={tokens}
            ink={ink}
            typeScale={typeScale}
            blockSurfaceChrome={{}}
            EditableLine={EditableLineGuarded}
            onUpdate={updateBlockText}
            onFocusIndex={setFocusIndexById}
            onAfterInput={(el) => onEditableAfterInput(block.id, el)}
            onSelectionChange={handleRichSelectionChange}
          />
        );
      }

      // Math/equation block — render with KaTeX preview and simple input
      if (block.kind === 'math') {
        return (
          <EquationBlockEditor
            key={listKey}
            blockId={block.id}
            text={block.text}
                     tokens={tokens}
            notebookInk={notebookInk}
            typeScale={typeScale}
            marginStyle={{ margin: '12px 0' }}
            surfaceChrome={{}}
            isFocused={surfaceFocusBlockId === block.id}
            isMathNotebook={isMathNotebook}
            isMathWorkspace={notebookMode === 'math-workspace'}
            EditableLine={EditableLineGuarded}
            onUpdate={updateBlockText}
            onFocusIndex={setFocusIndexById}
            onAfterInput={(el) => onEditableAfterInput(block.id, el)}
            onDelete={() => removeBlockAt(index)}
          />
        );
      }

      // Paragraph in a math notebook — use MathEditableParagraph so inline/display
      // math renders correctly (MathRichText on blur, EditableLine while editing).
      // Without this, y=x^2 or lim x->0 stays as raw text in fullscreen.
      if (block.kind === 'paragraph' && isMathNotebook) {
        return (
          <MathEditableParagraph
            key={listKey}
            id={block.id}
            text={block.text}
            marks={block.marks}
            tokens={tokens}
            placeholder="Write…"
            textColor={ink.primary}
            mutedColor={tokens.textMuted}
            onUpdate={updateBlockText}
            onFocusIndex={setFocusIndexById}
            onAfterInput={(el) => onEditableAfterInput(block.id, el)}
            onSelectionChange={handleRichSelectionChange}
            deskFormattingKeepEditable={deskFormattingActive}
            EditableLine={EditableLineGuarded}
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              color: ink.primary, fontSize: `${typeScale.l3}px`, fontWeight: 400,
              lineHeight: 1.84, marginBottom: '10px',
              caretColor: isPaperSurface ? '#b45309' : tokens.accent,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          />
        );
      }

      // Default: paragraph (non-math) and other block kinds (quote, bullet, etc.)
      return (
        <EditableLineGuarded
          key={listKey}
          id={block.id}
          text={block.text}
                    tokens={tokens}
          placeholder="Write…"
          onUpdate={updateBlockText}
          onFocusIndex={setFocusIndexById}
          onAfterInput={(el) => onEditableAfterInput(block.id, el)}
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            color: ink.primary, fontSize: `${typeScale.l3}px`, fontWeight: 400,
            lineHeight: 1.84, marginBottom: '10px', caretColor: isPaperSurface ? '#b45309' : tokens.accent,
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
          padding: isDeskPresentation || isWorkspacePresentation
            ? 0
            : context === 'free-space'
              ? (isMathWorkspaceMode ? '12px 10px 10px' : '18px 18px 18px')
              : '18px 24px 28px',
          ...(context === 'free-space'
            ? {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
                boxSizing: 'border-box',
                ...((isDeskPresentation || isWorkspacePresentation) ? { flex: 1 } : {}),
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
      {showCardChrome ? (
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
                persistNotebookContent({ ...content, icon: next });
              }}
              title="Change icon"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, padding: '0 2px',
                opacity: content.icon ? 1 : 0.28, transition: 'opacity 0.15s',
                color: tokens.textSecondary,
              }}
            >{content.icon ?? '◈'}</button>

            {context === 'free-space' && mathDiscoverabilityLabel ? (
              <span
                title="This notebook supports formulas, steps, and derivations"
                style={{
                  fontSize: 9.5,
                  fontWeight: 650,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(129,140,248,0.55)',
                  padding: '2px 7px',
                  borderRadius: 999,
                  border: '1px solid rgba(129,140,248,0.2)',
                  background: 'rgba(129,140,248,0.06)',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {mathDiscoverabilityLabel}
              </span>
            ) : null}

            <div
              contentEditable
              suppressContentEditableWarning
              onPointerDownCapture={e => {
                if (e.pointerType === 'pen') {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).blur();
                }
              }}
              onBeforeInput={e => {
                if (shouldRejectPenTextBeforeInput(e.nativeEvent)) e.preventDefault();
              }}
              onBlur={e => {
                const text = e.currentTarget.textContent?.trim() ?? '';
                if (text !== (content.subtitle ?? '')) persistNotebookContent({ ...content, subtitle: text || undefined });
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
            {!isWorkspacePresentation ? (
            <button
              type="button"
              title="Focus mode"
              onClick={() => {
                void (async () => {
                  await flushHandwritingBeforeTransition();
                  setIsFocusModeOpen(true);
                })();
              }}
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
            ) : null}
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
          {editorMode === 'edit' && !isFocusModeOpen ? (
            <NotebookWritingModeToggle
              mode={writingMode}
              onChange={handleWritingModeChange}
              tokens={tokens}
            />
          ) : null}
          {notebookMode !== 'math-workspace' && (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (editorMode === 'edit') {
                    await flushHandwritingBeforeTransition();
                  }
                  setEditorMode(editorMode === 'edit' ? 'preview' : 'edit');
                })();
              }}
              title={editorMode === 'edit' ? 'Switch to preview' : 'Switch to edit'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
                borderRadius: 4, color: editorMode === 'edit' ? tokens.accent : 'rgba(255,248,235,0.30)',
                fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', transition: 'color 0.15s',
              }}
            >{editorMode === 'edit' ? 'Preview' : 'Edit'}</button>
          )}
          <NotebookModeSelect
            mode={notebookMode}
            paperStyle={paperStyle}
            body={content.body ?? ''}
            onChange={patch => persistNotebookContent({ ...content, ...patch })}
          />
          {notebookMode !== 'math-workspace' && (
            <button
              type="button"
              onClick={() => {
                const next: 'spatial' | 'paper' = notebookSurface === 'paper' ? 'spatial' : 'paper';
                persistNotebookContent({ ...content, notebookSurface: next });
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
                  <button key={s} type="button" onClick={() => { persistNotebookContent({ ...content, paperStyle: s }); setPaperPopoverOpen(false); }}
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
      ) : null}

      <NotebookWorkspaceLayout
        enabled={v1PagesShell && isWorkspacePresentation}
        tokens={tokens}
        breadcrumb={getNotebookWorkspaceBreadcrumb(content)}
        navigator={
          (content.sections?.length ?? 0) > 0 ? (
            <NotebookWorkspaceNavigator
              content={content}
              tokens={tokens}
              onSwitchSection={handleShellSwitchSection}
              onSwitchPage={handleShellSwitchPage}
              onAddSection={handleShellAddSection}
              onAddPage={handleShellAddPage}
              onRenameSection={handleShellRenameSection}
              onRenamePage={handleShellRenamePage}
            />
          ) : null
        }
      >
      {workspaceBinderMode && showInkMode && activeNotebookPage ? (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderBottom: `1px solid ${tokens.cardBorder}`,
            background: tokens.wellBg,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: tokens.textGhost, textTransform: 'uppercase' }}>
            Ink page
          </span>
          {sectionPdfObjects.length > 0 ? (
            <select
              value={activeNotebookPage.linkedPdfObjectId ?? ''}
              onChange={e => {
                const next = e.target.value;
                if (next) handleLinkActivePagePdf(next);
              }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 8px',
                borderRadius: 8,
                border: `1px solid ${tokens.cardBorder}`,
                background: tokens.cardBg,
                color: tokens.textSecondary,
                maxWidth: 200,
              }}
            >
              <option value="">Link past exam PDF…</option>
              {sectionPdfObjects.map(pdf => (
                <option key={pdf.id} value={pdf.id}>
                  {pdf.title?.trim() || 'PDF'}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: tokens.textGhost }}>Add a PDF to the canvas to link</span>
          )}
          {activeNotebookPage.linkedPdfObjectId && onOpenBinderStudy ? (
            <button
              type="button"
              onClick={handleOpenActivePageBinderStudy}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${tokens.accent}55`,
                background: `${tokens.accent}14`,
                color: tokens.accent,
                cursor: 'pointer',
              }}
            >
              Open past exam
            </button>
          ) : null}
        </div>
      ) : null}
      {editorMode === 'edit' && selectionToolbar && !isDeskPresentation ? (
        <NotebookSelectionToolbar
          tokens={tokens}
          selection={selectionToolbar}
          onCommand={handleToolbarCommand}
          onDismiss={dismissSelectionToolbar}
          onToolbarPointerDown={handleToolbarPointerDown}
          onToolbarPointerUp={handleToolbarPointerUp}
        />
      ) : null}

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

      {isMathNotebook && !isDeskPresentation ? (
        <MathNotebookQuickRefStrip prominent={showMathStartGuide} />
      ) : null}

      <NotebookBodyScroll
        enabled={context === 'free-space'}
        scrollRef={notebookBodyScrollRef}
        hostRef={notebookBodyHostRef}
        onHostReady={setNotebookBodyHostEl}
      >
      {isDeskPresentation && !isFocusModeOpen ? (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          {editorMode === 'edit' ? (
            <button
              type="button"
              title="Focus mode"
              onClick={() => {
                void (async () => {
                  await flushHandwritingBeforeTransition();
                  setIsFocusModeOpen(true);
                })();
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                color: 'rgba(255,248,235,0.45)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 5V1h4M9 1h4v4M1 9v4h4M9 13h4V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : null}
          {editorMode === 'edit' && !isFocusModeOpen ? (
            <NotebookWritingModeToggle
              mode={writingMode}
              onChange={handleWritingModeChange}
              tokens={tokens}
            />
          ) : null}
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (editorMode === 'edit') {
                  await flushHandwritingBeforeTransition();
                }
                setEditorMode(editorMode === 'edit' ? 'preview' : 'edit');
              })();
            }}
            title={editorMode === 'edit' ? 'Switch to preview' : 'Switch to edit'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '3px 5px',
              borderRadius: 4,
              color: editorMode === 'edit' ? tokens.accent : 'rgba(255,248,235,0.30)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {editorMode === 'edit' ? 'Preview' : 'Edit'}
          </button>
        </div>
      ) : null}
      {deskFormattingActive &&
      selectionToolbar &&
      context === 'free-space' &&
      typeof document !== 'undefined' &&
      notebookBodyScrollRef.current
        ? createPortal(
            <DeskFormattingToolbar
              tokens={tokens}
              selection={selectionToolbar}
              onCommand={handleToolbarCommand}
              onDismiss={dismissSelectionToolbar}
              onToolbarPointerDown={handleToolbarPointerDown}
              onToolbarPointerUp={handleToolbarPointerUp}
            />,
            notebookBodyScrollRef.current,
          )
        : null}
      <div
        onDrop={handleWritingAreaDrop}
        onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }}
        style={{
          position: 'relative',
          display: showNotebookContext && canDockContext ? 'grid' : 'flex',
          flexDirection: showNotebookContext && canDockContext ? undefined : 'column',
          flex: isDeskPresentation && context === 'free-space' ? 1 : undefined,
          minHeight: context === 'free-space' ? '100%' : undefined,
          gridTemplateColumns: showNotebookContext && canDockContext ? 'minmax(0, 1fr) 232px' : undefined,
          gap: showNotebookContext && canDockContext ? '16px' : undefined,
        }}
      >
      {editorMode === 'edit' && !isFocusModeOpen ? (
        <div
          ref={editorRootRef}
          data-nb-editor-root="1"
          data-fw-cmd-ignore="1"
          role="textbox"
          aria-multiline
          aria-label={isDeskPresentation ? 'Math work surface' : 'Notebook'}
          tabIndex={-1}
          onKeyDownCapture={handleEditorKeyCapture}
          onFocusCapture={handleSurfaceFocusIn}
          onBlur={handleSurfaceBlur}
          onPointerDownCapture={handleNotebookTextPenGuard}
          onPointerUpCapture={handleNotebookTextPenUp}
          className="nb-document-surface"
          data-nb-surface={notebookSurface}
          data-nb-block-pen-text={!showInkMode ? '1' : undefined}
          data-nb-v1-document={workspaceBinderMode && activePageKind === 'document' ? '1' : undefined}
          data-desk-surface={isDeskPresentation ? '1' : undefined}
          style={{
            ...editorSurfaceStyle,
            ...(isDeskPresentation
              ? {
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column' as const,
                  position: 'relative' as const,
                }
              : {}),
          }}
        >
          <div
            ref={el => {
              writingColumnRef.current = el;
              setWritingColumnEl(el);
            }}
            style={{ ...writingColumnStyle, position: 'relative' }}
          >
          {showInkMode ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                minHeight: isDeskPresentation ? 480 : PAGE_INK_INITIAL_HEIGHT,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {objectId && activeInkBlockKey ? (
                <HandwritingBlock
                  key={activeInkBlockKey}
                  blockId={`__page-ink-${activeInkBlockKey}__`}
                  objectId={objectId}
                  blockKey={activeInkBlockKey}
                  tokens={tokens}
                  pageLayout
                  surfaceChrome={{
                    margin: 0,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                  }}
                  onDismissTextEditing={dismissNotebookTextEditing}
                  onDrawingChange={handlePageInkDrawingChange}
                />
              ) : objectId ? (
                <HandwritingBlock
                  blockId="__page-ink__"
                  objectId={objectId}
                  blockKey={PAGE_INK_BLOCK_KEY}
                  tokens={tokens}
                  pageLayout
                  surfaceChrome={{
                    margin: 0,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                  }}
                  onDismissTextEditing={dismissNotebookTextEditing}
                  onDrawingChange={handlePageInkDrawingChange}
                />
              ) : (
                <p style={{ fontSize: 12, color: tokens.textMuted, padding: 16 }}>
                  Ink mode unavailable — notebook is still loading.
                </p>
              )}
              {!workspaceBinderMode ? (
              <p
                style={{
                  margin: '10px 0 4px',
                  fontSize: 10,
                  color: tokens.textGhost,
                  letterSpacing: '0.03em',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                Switch to Text mode to edit typed notes.
              </p>
              ) : null}
            </div>
          ) : (
          <>
          {isMathNotebook && !isDeskPresentation ? (
            <MathStudyInsight body={content.body ?? ''} tokens={tokens} />
          ) : null}
          {compositionUiVisible ? (
            <CompositionCoachSlot
              tokens={tokens}
              showStarterCoach={showMathStartGuide}
              coachDismissed={compositionChrome.coachState.coachDismissed}
              onDismiss={compositionChrome.dismissCoach}
            />
          ) : null}
          {displayBlocks.map((block, displayIndex) => {
            const index = blocks.findIndex(b => b.id === block.id);
            const listKey = blockListKey(block, index >= 0 ? index : displayIndex);
            const prevKind = index > 0 ? blocks[index - 1]!.kind : undefined;
            const gutterBefore =
              compositionUiVisible && index > 0 ? (
                <CompositionGutter
                  key={`gutter-${listKey}`}
                  tokens={tokens}
                  afterIndex={index - 1}
                  onGutterStep={handleGutterStep}
                  onGutterEquation={handleGutterEquation}
                  onGutterHandwriting={handleGutterHandwriting}
                />
              ) : null;
            const row = (el: React.ReactNode) => (
              <Fragment key={`row-${listKey}`}>
                {gutterBefore}
                {el}
              </Fragment>
            );
            if (block.kind === 'divider') {
              return row(
                <div
                  key={listKey}
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
                      pendingCaretRef.current = { id: fresh.id, offset: 0, scroll: 'force' };
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
              return row(
                <div
                  key={listKey}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={blockSurfaceChrome(block.id)}
                >
                  <EditableLineGuarded
                    id={block.id}
                    text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
              const secTop = isDeskPresentation
                ? (index === 0 ? 6 : prevKind === 'section' ? 8 : 10)
                : (index === 0 ? typeScale.s5 : prevKind === 'title' ? typeScale.s3 : prevKind === 'section' ? typeScale.s4 : typeScale.s2 + 4);
              return row(
                <div
                  key={listKey}
                  data-nb-surface-block
                  data-block-id={block.id}
                  data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                  style={{ ...blockSurfaceChrome(block.id), marginTop: `${secTop}px` }}
                >
                  <div style={{
                    paddingBottom: isDeskPresentation ? '3px' : '7px',
                    marginBottom: isDeskPresentation ? '8px' : '20px',
                    borderBottom: isDeskPresentation
                      ? '1px solid rgba(68,64,60,0.18)'
                      : `1px solid ${tokens.accent}28`,
                  }}>
                    <EditableLineGuarded
                      id={block.id}
                      text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
                        color: isDeskPresentation ? 'rgba(68,64,60,0.72)' : ink.section,
                        fontSize: isDeskPresentation ? '11px' : `${typeScale.l2}px`,
                        fontWeight: isDeskPresentation ? 600 : 600,
                        letterSpacing: isDeskPresentation ? '0.08em' : '-0.02em',
                        textTransform: isDeskPresentation ? 'uppercase' : 'none',
                        lineHeight: isDeskPresentation ? 1.25 : 1.35,
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
              return row(
                <div
                  key={listKey}
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
                    <EditableLineGuarded
                      id={block.id}
                      text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
              return row(
                <div
                  key={listKey}
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
                    <EditableLineGuarded
                      id={block.id}
                      text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
              return row(
                <div
                  key={listKey}
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
                    <EditableLineGuarded
                      id={block.id}
                      text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
              return row(
                <div
                  key={listKey}
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
                  <EditableLineGuarded
                    id={block.id}
                    text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
              const isFirstStep = stepIndex === 1;
              const isLastStep = index >= blocks.length - 1 || blocks[index + 1]?.kind !== 'step';
              return row(wrapDeskCheck(
                block,
                <StepBlockRenderer
                  key={listKey}
                  block={block}
                  stepIndex={stepIndex}
                  isFirst={isFirstStep}
                  isLast={isLastStep}
                  isFocused={surfaceFocusBlockId === block.id}
                  tokens={tokens}
                  ink={ink}
                  typeScale={typeScale}
                  morphPulse={morphPulseId === block.id}
                  blockSurfaceChrome={blockSurfaceChrome(block.id)}
                  EditableLine={EditableLineGuarded}
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  onAfterInput={(el) => onEditableAfterInput(block.id, el)}
                  onSelectionChange={handleRichSelectionChange}
                />,
              ));
            }

            if (block.kind === 'callout') {
              const ct = calloutToneTokens(block.tone);
              return row(
                <div
                  key={listKey}
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
                  <EditableLineGuarded
                    id={block.id}
                    text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
              return row(
                <EquationBlockEditor
                  key={listKey}
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
                  EditableLine={EditableLineGuarded}
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  onAfterInput={el => onEditableAfterInput(block.id, el)}
                  onDelete={() => removeBlockAt(index)}
                  morphPulse={morphPulseId === block.id}
                />
              );
            }

            if (block.kind === 'handwriting') {
              return row(
                <HandwritingBlock
                  key={listKey}
                  blockId={block.id}
                  objectId={objectId ?? ''}
                  blockKey={block.key}
                  tokens={tokens}
                  surfaceChrome={blockSurfaceChrome(block.id)}
                  onFocus={() => setSurfaceFocusBlockId(block.id)}
                  onDismissTextEditing={dismissNotebookTextEditing}
                  onDelete={() => removeBlockAt(index)}
                  onDrawingChange={drawing => {
                    if (drawing) dismissNotebookTextEditing();
                    if (context === 'free-space') onEditingChange?.(drawing);
                  }}
                />
              );
            }

            if (block.kind === 'image-ref') {
              const src = nbImageGet(block.key);
              return row(
                <div key={listKey} style={{ margin: '20px 0', userSelect: 'none' }}>
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
            const deskShowPlaceholder =
              isDeskPresentation && block.id === deskFirstEmptyParaId && block.text.trim() === '';
            const paragraphPlaceholder = isDeskPresentation
              ? ''
              : notebookMode === 'scratch'
                ? '…'
                : useStartWritingPlaceholder
                  ? 'Start writing...'
                  : paraFine
                    ? 'Fine print…'
                    : paraMuted
                      ? 'Softer emphasis…'
                      : 'Write…';
            return row(wrapDeskCheck(
              block,
              <div
                key={listKey}
                data-nb-surface-block
                data-block-id={block.id}
                data-nb-pulse={morphPulseId === block.id ? '1' : undefined}
                style={blockSurfaceChrome(block.id)}
              >
                {deskShowPlaceholder ? (
                  <p className="desk-empty-guide" role="note" style={{ marginTop: paraTop }}>
                    Write a numeric step, then press <kbd>⌘↵</kbd> to check it.
                  </p>
                ) : null}
                {(isMathNotebook || isLikelyMathLine(block.text)) && !paraFine && !paraMuted ? (
                  <MathEditableParagraph
                    id={block.id}
                    text={block.text}
                    marks={block.marks}
                    tokens={tokens}
                    placeholder={paragraphPlaceholder}
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    onAfterInput={el => onEditableAfterInput(block.id, el)}
                    onSelectionChange={handleRichSelectionChange}
                    deskFormattingKeepEditable={deskFormattingActive}
                    EditableLine={EditableLineGuarded}
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
                      lineHeight: isDeskPresentation ? 1.75 : 1.84,
                      letterSpacing: '0.004em',
                      margin: isDeskPresentation
                        ? deskShowPlaceholder
                          ? '0 0 8px'
                          : `${paraTop}px 0 8px`
                        : `${paraTop}px 0 10px`,
                      opacity: 1,
                      caretColor: isDeskPresentation ? '#92400e' : tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                ) : (
                  <EditableLineGuarded
                    id={block.id}
                    text={block.text}
                    marks={block.marks}
                    onSelectionChange={handleRichSelectionChange}
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
                      color: paraFine ? ink.muted : paraMuted ? ink.secondary : notebookMode === 'scratch' ? ink.secondary : ink.primary,
                      fontSize: paraFine ? `${typeScale.l5}px` : paraMuted ? `${typeScale.l4}px` : `${typeScale.l3}px`,
                      fontWeight: paraMuted ? 500 : 400,
                      lineHeight: isDeskPresentation ? 1.75 : paraFine ? 1.7 : notebookMode === 'scratch' ? 1.76 : 1.96,
                      letterSpacing: paraFine ? '0.024em' : '0.004em',
                      margin: isDeskPresentation
                        ? deskShowPlaceholder
                          ? '0 0 8px'
                          : `${paraTop}px 0 8px`
                        : `${paraTop}px 0 10px`,
                      opacity: paraFine ? 0.9 : paraMuted ? 0.94 : 1,
                      caretColor: isDeskPresentation ? '#92400e' : tokens.accent,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                )}
              </div>,
            ));
          })}
          {isDeskPresentation ? (
            <div aria-hidden style={{ flex: 1, minHeight: 'min(48vh, 420px)' }} />
          ) : null}
          </>
          )}
          </div>
        </div>
      ) : (
        <div
          role="document"
          aria-label="Notebook preview"
          style={editorSurfaceStyle}
          onMouseDown={handlePreviewMouseDown}
        >
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
                    : line.kind === 'handwriting'
                      ? `handwriting-${index}-${line.key}`
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
                  {...previewLineActivateProps(index, line.kind)}
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
                    previewInlineContent(line.text)
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
                  {...previewLineActivateProps(index, line.kind)}
                  style={{
                    fontSize: `${typeScale.l2}px`,
                    fontWeight: 600,
                    lineHeight: 1.32,
                    letterSpacing: '-0.02em',
                    margin: `${secTop}px 0 ${typeScale.s3}px`,
                    color: ink.section,
                  }}
                >
                  {previewInlineContent(line.text)}
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
                  {...previewLineActivateProps(index, line.kind)}
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
                    {previewInlineContent(line.text)}
                  </span>
                </div>
              );
            }
            if (line.kind === 'task') {
              return (
                <div
                  key={lineKey}
                  {...previewLineActivateProps(index, line.kind)}
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
                    {previewInlineContent(line.text)}
                  </span>
                </div>
              );
            }
            if (line.kind === 'bullet') {
              const bulletGlyph = line.depth === 0 ? '•' : line.depth === 1 ? '◦' : '▸';
              return (
                <div
                  key={lineKey}
                  {...previewLineActivateProps(index, line.kind)}
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
                    {line.text
                      ? previewInlineContent(line.text)
                      : <span style={{ color: ink.ghost, fontStyle: 'italic' }}>Empty</span>}
                  </div>
                </div>
              );
            }
            if (line.kind === 'quote') {
              return (
                <blockquote
                  key={lineKey}
                  {...previewLineActivateProps(index, line.kind)}
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
                  {previewInlineContent(line.text)}
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
                  {...previewLineActivateProps(index, line.kind)}
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
                    text={previewPlainForMath(line.text)}
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
                  {...previewLineActivateProps(index, line.kind)}
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
                    {previewInlineContent(line.text)}
                  </div>
                </div>
              );
            }
            if (line.kind === 'math') {
              return (
                <div
                  key={lineKey}
                  {...previewLineActivateProps(index, line.kind)}
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
                      latex={plainMathToLatex(previewPlainForMath(line.text))}
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
            if (line.kind === 'handwriting') {
              return (
                <HandwritingBlock
                  key={lineKey}
                  blockId={`preview-hw-${line.key}`}
                  objectId={objectId ?? ''}
                  blockKey={line.key}
                  tokens={tokens}
                  readOnly
                />
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
                  {...previewLineActivateProps(index, line.kind)}
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
                      text={previewPlainForMath(line.text)}
                    autoPlainMath={isMathNotebook}
                      textColor={fine ? ink.muted : muted ? ink.secondary : ink.primary}
                      mutedColor={tokens.textMuted}
                    />
                  ) : (
                    previewInlineContent(line.text)
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
      </NotebookWorkspaceLayout>
    </div>

    {isFocusModeOpen && typeof document !== 'undefined' ? createPortal(
      <>
        <div
          onClick={() => void closeFocusMode()}
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
            data-nb-block-pen-text={!showInkMode ? '1' : undefined}
            onKeyDownCapture={handleEditorKeyCapture}
            onFocusCapture={handleSurfaceFocusIn}
            onBlur={handleSurfaceBlur}
            onPointerDownCapture={handleNotebookTextPenGuard}
            onPointerUpCapture={handleNotebookTextPenUp}
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
                : {
                    maxWidth: notebookMode === 'math-workspace' ? 820 : 680,
                    margin: '0 auto',
                    padding: notebookMode === 'math-workspace' ? '80px 32px 160px' : '80px 48px 140px',
                    minHeight: '100%',
                    // Carry the canvas grid texture into fullscreen so the surface feels continuous
                    ...(notebookMode === 'math-workspace' ? {
                      backgroundImage: writingSurfaceBackground.image,
                      backgroundSize: writingSurfaceBackground.size,
                    } : {}),
                  }
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
              {/* Paper/Spatial toggle — hidden for math-workspace (derivation zone is always spatial) */}
              {notebookMode !== 'math-workspace' && (
                <button
                  type="button"
                  title={notebookSurface === 'paper' ? 'Spatial notebook' : 'Paper page'}
                  onClick={() => {
                    const next: 'spatial' | 'paper' = notebookSurface === 'paper' ? 'spatial' : 'paper';
                    persistNotebookContent({ ...content, notebookSurface: next });
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                    color: isPaperSurface ? ink.secondary : 'rgba(255,248,235,0.80)',
                    fontSize: 11, letterSpacing: '0.06em',
                  }}
                >{notebookSurface === 'paper' ? 'Paper' : 'Spatial'}</button>
              )}
              <NotebookModeSelect
                mode={notebookMode}
                paperStyle={paperStyle}
                body={content.body ?? ''}
                onChange={patch => persistNotebookContent({ ...content, ...patch })}
              />

              {/* Paper style cycle */}
              <button
                type="button"
                title={`Paper: ${paperStyle}`}
                onClick={() => {
                  const styles: ('blank' | 'ruled' | 'grid')[] = ['blank', 'ruled', 'grid'];
                  const next = styles[(styles.indexOf(paperStyle as 'blank' | 'ruled' | 'grid') + 1) % styles.length];
                  persistNotebookContent({ ...content, paperStyle: next });
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  color: 'rgba(255,248,235,0.80)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'capitalize',
                }}
              >{paperStyle}</button>

              <button
                type="button"
                title="Done (Esc)"
                aria-label="Done"
                onClick={() => void closeFocusMode()}
                style={{
                  minWidth: TOUCH_TARGET_MIN_PX,
                  minHeight: TOUCH_TARGET_MIN_PX,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: isPaperSurface
                    ? '1px solid rgba(28,25,23,0.12)'
                    : '1px solid rgba(255,255,255,0.14)',
                  background: isPaperSurface ? 'rgba(28,25,23,0.05)' : 'rgba(255,255,255,0.08)',
                  cursor: 'pointer',
                  color: isPaperSurface ? ink.primary : 'rgba(255,248,235,0.92)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  touchAction: 'manipulation',
                }}
              >
                Done
              </button>
            </div>
            {/* Title: hidden in derivation fullscreen — mode badge carries identity */}
            {!isPaperSurface && notebookMode !== 'math-workspace' ? (
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
            {mathDiscoverabilityLabel ? (
              <p style={{
                fontSize: 10, color: 'rgba(129,140,248,0.55)',
                letterSpacing: '0.12em', textTransform: 'uppercase',
                marginBottom: 20,
              }}>{mathDiscoverabilityLabel}</p>
            ) : null}
            <div
              ref={el => {
                focusWritingColumnRef.current = el;
                setFocusWritingColumnEl(el);
              }}
              style={{ position: 'relative' }}
            >
              {renderFocusModeBlocks()}
            </div>
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
    {compositionUiVisible && editorMode === 'edit' ? (
      <CompositionOverlays
        props={{
          tokens,
          notebookMode,
          active: compositionUiVisible,
          editorMode,
          editorRoot: getEditorRoot(),
          writingColumnEl: isFocusModeOpen ? focusWritingColumnEl : writingColumnEl,
          chipAnchorEl: isFocusModeOpen ? null : notebookBodyHostEl,
          surfaceFocusBlockId,
          lastFocusedMathBlockId: lastFocusedMathBlockIdRef.current,
          focusedBlockKind,
          showStarterCoach: showMathStartGuide,
          onInsertSnippet: insertMathSnippet,
          onApplyTemplate: applyMathTemplate,
          onInsertEquationBlock: handleCompositionEquationBlock,
          onGutterStep: handleGutterStep,
          onGutterEquation: handleGutterEquation,
          onGutterHandwriting: handleGutterHandwriting,
          onFocusBlock: handleCompositionFocusBlock,
          onFindFirstEditableBlock: findFirstEditableBlockId,
          blockIndexById,
          onCompositionSuccess: compositionChrome.markCompositionSuccess,
        }}
        favoriteId={compositionChrome.favoriteId}
        pinFavorite={compositionChrome.pinFavorite}
        recents={compositionChrome.recents}
        recordInsert={compositionChrome.recordInsert}
        chipOpacity={compositionChrome.chipOpacity}
        sheetOpen={compositionChrome.sheetOpen}
        setSheetOpen={compositionChrome.setSheetOpen}
      />
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
    <InkPenTraceHud />
    </Fragment>
  );
}
