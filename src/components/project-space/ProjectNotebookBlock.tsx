import {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
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

function parseNotebookLine(raw: string): NotebookLine {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'blank' };
  if (trimmed === '---') return { kind: 'divider' };
  if (trimmed.startsWith('## ')) return { kind: 'section', text: trimmed.slice(3) };
  if (trimmed.startsWith('# ')) return { kind: 'title', text: trimmed.slice(2) };
  const taskMatch = trimmed.match(/^- \[([ xX])\]\s*(.*)$/);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === 'x';
    return { kind: 'task', checked, text: taskMatch[2] };
  }
  if (trimmed.startsWith('> ')) return { kind: 'quote', text: trimmed.slice(2) };
  if (trimmed.startsWith('>')) return { kind: 'quote', text: trimmed.slice(1).trimStart() };
  return { kind: 'paragraph', text: raw };
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
  return body.split('\n').map(lineToBlock);
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
  const normalized = text.replace(/\r\n/g, '\n');
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
  return normalized.split('\n').map((ln) => lineToBlock(ln));
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

interface EditableLineProps {
  id: string;
  text: string;
  tokens: AtmosphereTokens;
  placeholder: string;
  style: CSSProperties;
  onUpdate: (id: string, raw: string) => void;
  onFocusIndex: (id: string) => void;
}

function EditableLine({ id, text, tokens, placeholder, style, onUpdate, onFocusIndex }: EditableLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showPlaceholder, setShowPlaceholder] = useState(text.length === 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== text) el.textContent = text;
    setShowPlaceholder(text.length === 0);
  }, [text, id]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {showPlaceholder ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            pointerEvents: 'none',
            color: tokens.textGhost,
            opacity: 0.42,
            fontWeight: 500,
            transition: 'opacity 0.16s ease',
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
          setShowPlaceholder(raw.length === 0);
          onUpdate(id, raw);
        }}
        onFocus={() => {
          setShowPlaceholder(false);
          onFocusIndex(id);
        }}
        onBlur={(ev) => {
          if (ev.currentTarget.textContent?.length === 0) setShowPlaceholder(true);
        }}
        style={style}
      />
    </div>
  );
}

interface Props {
  content: NotebookContent;
  tokens: AtmosphereTokens;
  onChange: (content: NotebookContent) => void;
}

type HelperSpec =
  | { label: string; kind: 'title'; text: string }
  | { label: string; kind: 'section'; text: string }
  | { label: string; kind: 'task'; text: string; checked: boolean }
  | { label: string; kind: 'quote'; text: string }
  | { label: string; kind: 'divider' };

const HELPER_SPECS: HelperSpec[] = [
  { label: 'Title', kind: 'title', text: 'Title' },
  { label: 'Section', kind: 'section', text: 'Section' },
  { label: 'Task', kind: 'task', text: 'Task', checked: false },
  { label: 'Quote', kind: 'quote', text: 'Quote' },
  { label: 'Line', kind: 'divider' },
];

export function ProjectNotebookBlock({ content, tokens, onChange }: Props) {
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [blocks, setBlocks] = useState<Block[]>(() => parseBodyToBlocks(content.body ?? ''));

  const editorRootRef = useRef<HTMLDivElement>(null);
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

  const paperBackground = useMemo(() => {
    if (paperStyle === 'blank') return 'none';

    if (paperStyle === 'grid') {
      return `
        linear-gradient(${tokens.cardBorder}20 1px, transparent 1px),
        linear-gradient(90deg, ${tokens.cardBorder}20 1px, transparent 1px)
      `;
    }

    return `
      repeating-linear-gradient(
        180deg,
        transparent,
        transparent 31px,
        ${tokens.cardBorder}35 31px,
        ${tokens.cardBorder}35 32px
      )
    `;
  }, [paperStyle, tokens.cardBorder]);

  const paperSize = paperStyle === 'grid' ? '28px 28px' : '100% 32px';

  const setFocusIndexById = useCallback(
    (id: string) => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx !== -1) focusIndexRef.current = idx;
    },
    [blocks],
  );

  const insertHelperBlock = useCallback(
    (spec: HelperSpec) => {
      setBlocks((prev) => {
        const focus = Math.min(Math.max(focusIndexRef.current, 0), Math.max(prev.length - 1, 0));
        const insertAt = Math.min(focus + 1, prev.length);
        let insert: Block;
        if (spec.kind === 'divider') insert = { id: newBlockId(), kind: 'divider' };
        else if (spec.kind === 'task')
          insert = { id: newBlockId(), kind: 'task', text: spec.text, checked: spec.checked };
        else insert = { id: newBlockId(), kind: spec.kind, text: spec.text };
        const next = [...prev.slice(0, insertAt), insert, ...prev.slice(insertAt)];
        const serialized = serializeBlocks(next);
        onChange({ ...content, body: serialized });
        if (insert.kind === 'divider') pendingCaretRef.current = { id: insert.id, offset: 0 };
        else if (spec.kind !== 'divider') {
          pendingCaretRef.current = { id: insert.id, offset: spec.text.length };
        }
        return next;
      });
    },
    [content, onChange],
  );

  const previewLines = useMemo(() => {
    const body = content.body ?? '';
    return body.split('\n').map(parseNotebookLine);
  }, [content.body]);

  const fontStack = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

  const editorSurfaceStyle = useMemo(
    (): CSSProperties => ({
      width: '100%',
      minHeight: '420px',
      boxSizing: 'border-box',
      backgroundColor: 'transparent',
      backgroundImage: paperBackground,
      backgroundSize: paperSize,
      color: tokens.textPrimary,
      fontSize: '16px',
      lineHeight: 1.75,
      letterSpacing: '0.01em',
      fontFamily: fontStack,
      paddingBottom: '80px',
      outline: 'none',
      transition: 'color 0.18s ease, background-image 0.22s ease',
    }),
    [fontStack, paperBackground, paperSize, tokens.textPrimary],
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
        if (singleLine === block.text) return prev;
        const next = [...prev.slice(0, i), { ...block, text: singleLine } as Block, ...prev.slice(i + 1)];
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

  const handleRootKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editorMode !== 'edit') return;
      const root = editorRootRef.current;
      if (!root) return;

      if (e.key === 'Backspace' && e.target instanceof HTMLElement) {
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
      if (!editable) return;
      const id = editable.dataset.editableId;
      if (!id) return;
      const index = blocks.findIndex((b) => b.id === id);
      if (index === -1) return;
      const block = blocks[index]!;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';

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

      if (e.key === 'Backspace') {
        const offset = getCaretOffsetIn(editable);
        const text = editable.textContent ?? '';

        if (block.kind === 'title' || block.kind === 'section') {
          if (offset === 0 && text.length === 0) {
            e.preventDefault();
            const nextBlock: Block = { id: block.id, kind: 'paragraph', text: '' };
            const next = [...blocks.slice(0, index), nextBlock, ...blocks.slice(index + 1)];
            persist(next);
            pendingCaretRef.current = { id: nextBlock.id, offset: 0 };
            return;
          }
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
    [blocks, editorMode, persist, removeBlockAt],
  );

  return (
    <div
      style={{
        padding: '22px 24px 28px',
        minHeight: '420px',
        background: `linear-gradient(180deg, ${tokens.cardBg}, ${tokens.wellBg})`,
        borderRadius: '22px',
        position: 'relative',
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
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
              marginBottom: '6px',
            }}
          >
            Notebook
          </div>

          <div
            style={{
              fontSize: '13px',
              color: tokens.textMuted,
            }}
          >
            Write, divide, collect, return.
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

      {editorMode === 'edit' ? (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            marginBottom: '14px',
            opacity: 0.9,
          }}
        >
          {HELPER_SPECS.map((button) => (
            <button
              key={button.label}
              type="button"
              onClick={() => insertHelperBlock(button)}
              style={{
                border: `1px solid ${tokens.cardBorder}`,
                background: `${tokens.wellBg}80`,
                color: tokens.textMuted,
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
                padding: '6px 10px',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
            >
              + {button.label}
            </button>
          ))}
        </div>
      ) : null}

      {editorMode === 'edit' ? (
        <div
          ref={editorRootRef}
          role="textbox"
          aria-multiline
          aria-label="Notebook"
          tabIndex={-1}
          onKeyDown={handleRootKeyDown}
          style={editorSurfaceStyle}
        >
          {blocks.map((block, index) => {
            if (block.kind === 'divider') {
              return (
                <div
                  key={block.id}
                  data-block-id={block.id}
                  data-divider-row
                  tabIndex={0}
                  role="separator"
                  aria-label="Section divider"
                  onFocus={() => {
                    focusIndexRef.current = index;
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      const fresh: Block = { id: newBlockId(), kind: 'paragraph', text: '' };
                      persist([...blocks.slice(0, index + 1), fresh, ...blocks.slice(index + 1)]);
                      pendingCaretRef.current = { id: fresh.id, offset: 0 };
                      return;
                    }
                    if (ev.key === 'Backspace' || ev.key === 'Delete') {
                      ev.preventDefault();
                      removeBlockAt(index);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    margin: '22px 0',
                    outline: 'none',
                    borderRadius: '8px',
                    transition: 'opacity 0.18s ease',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: '1px',
                      background: tokens.cardBorder,
                      opacity: 0.88,
                    }}
                  />
                </div>
              );
            }

            if (block.kind === 'title') {
              return (
                <div key={block.id} data-block-id={block.id}>
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Title"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '28px',
                      fontWeight: 800,
                      letterSpacing: '-0.025em',
                      lineHeight: 1.2,
                      margin: '10px 0 12px',
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
                <div key={block.id} data-block-id={block.id}>
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Section"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '19px',
                      fontWeight: 700,
                      letterSpacing: '-0.015em',
                      lineHeight: 1.35,
                      margin: '22px 0 10px',
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
                  data-block-id={block.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    margin: '8px 0',
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={block.checked}
                    onClick={() => toggleTask(block.id)}
                    style={{
                      flexShrink: 0,
                      width: '20px',
                      height: '20px',
                      marginTop: '5px',
                      borderRadius: '6px',
                      border: `2px solid ${block.checked ? tokens.accent : tokens.cardBorder}`,
                      background: block.checked ? `${tokens.accent}20` : 'transparent',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: tokens.accent,
                      lineHeight: 1,
                      transition: 'border-color 0.16s ease, background 0.16s ease',
                    }}
                  >
                    {block.checked ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EditableLine
                      id={block.id}
                      text={block.text}
                      tokens={tokens}
                      placeholder="Task"
                      onUpdate={updateBlockText}
                      onFocusIndex={setFocusIndexById}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: tokens.textPrimary,
                        fontSize: '16px',
                        fontWeight: 500,
                        lineHeight: 1.75,
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
                  data-block-id={block.id}
                  style={{
                    margin: '12px 0',
                    paddingLeft: '14px',
                    borderLeft: `3px solid ${tokens.accent}55`,
                    transition: 'border-color 0.18s ease',
                  }}
                >
                  <EditableLine
                    id={block.id}
                    text={block.text}
                    tokens={tokens}
                    placeholder="Quote"
                    onUpdate={updateBlockText}
                    onFocusIndex={setFocusIndexById}
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: tokens.textMuted,
                      fontSize: '16px',
                      fontStyle: 'italic',
                      fontWeight: 500,
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
              <div key={block.id} data-block-id={block.id}>
                <EditableLine
                  id={block.id}
                  text={block.text}
                  tokens={tokens}
                  placeholder="Write…"
                  onUpdate={updateBlockText}
                  onFocusIndex={setFocusIndexById}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: tokens.textPrimary,
                    fontSize: '16px',
                    fontWeight: 400,
                    lineHeight: 1.75,
                    margin: '6px 0',
                    caretColor: tokens.accent,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div role="document" aria-label="Notebook preview" style={editorSurfaceStyle}>
          {previewLines.map((line, index) => {
            if (line.kind === 'blank') {
              return <div key={index} style={{ height: '16px' }} />;
            }
            if (line.kind === 'title') {
              return (
                <div
                  key={index}
                  style={{
                    fontSize: '26px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.25,
                    margin: '8px 0 10px',
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
                    fontSize: '18px',
                    fontWeight: 700,
                    lineHeight: 1.35,
                    margin: '22px 0 8px',
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
                    margin: '18px 0',
                    background: tokens.cardBorder,
                    opacity: 0.85,
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
                    alignItems: 'flex-start',
                    gap: '12px',
                    margin: '6px 0',
                    color: tokens.textPrimary,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: '18px',
                      height: '18px',
                      marginTop: '5px',
                      borderRadius: '5px',
                      border: `2px solid ${line.checked ? tokens.accent : tokens.cardBorder}`,
                      background: line.checked ? `${tokens.accent}22` : 'transparent',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: tokens.accent,
                      lineHeight: 1,
                    }}
                  >
                    {line.checked ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{line.text}</span>
                </div>
              );
            }
            if (line.kind === 'quote') {
              return (
                <blockquote
                  key={index}
                  style={{
                    margin: '10px 0',
                    paddingLeft: '16px',
                    borderLeft: `3px solid ${tokens.accent}66`,
                    color: tokens.textMuted,
                    fontStyle: 'italic',
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
                  margin: '4px 0',
                  color: tokens.textPrimary,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {line.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
