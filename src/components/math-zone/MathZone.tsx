/**
 * MathZone — math notebook workspace.
 *
 * READING (default):
 *   Content split line-by-line. Each line independently classified:
 *     isLikelyMathLine → centered KaTeX (display mode)
 *     else             → readable prose, with $…$ inline KaTeX
 *     list prefix      → rendered as bullet/numbered item
 *   Empty lines → breathing space only.
 *
 * WRITING (click anywhere, or when empty):
 *   Tiptap editor (ProseMirror-based). Blur → reading mode.
 *   Serializes to/from plain text for storage.
 *   Supports: bullet lists, numbered lists, Tab/Shift-Tab indent, undo/redo.
 *   Zero toolbar chrome. Invisible editor feel.
 *
 * LAYOUT:
 *   Notebook page always occupies full width (minus 16px ghost edge tabs).
 *   Side panels are overlay drawers (CSS transform). The notebook center is
 *   position:absolute inset and is never reflowed when a drawer opens.
 *
 * NOTEBOOK MANAGEMENT:
 *   Multiple named notebooks per sectionId, all in localStorage.
 *   Legacy fw_math_v1_${sectionId} migrated on first load (not deleted).
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { renderKatexHtml } from '../../lib/notebookMath';
import { plainMathToLatex, isLikelyMathLine } from '../../lib/mathInputAssistant';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefCard      { id: string; content: string }
interface ScratchBlock { id: string; content: string }

interface MathZoneData {
  content:   string;
  refs:      RefCard[];
  scratches: ScratchBlock[];
}

interface Notebook {
  id:        string;
  title:     string;
  createdAt: number;
  updatedAt: number;
}

interface NotebooksIndex {
  notebooks: Notebook[];
  activeId:  string;
}

export interface MathZoneProps {
  tokens:       AtmosphereTokens;
  sectionId:    string;
  sectionTitle: string;
  paddingTop?:  number;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const legacyKey = (sid: string)            => `fw_math_v1_${sid}`;
const indexKey  = (sid: string)            => `fw_math_index_${sid}`;
const nbDataKey = (sid: string, id: string) => `fw_math_nb_${sid}_${id}`;

function defaultData(): MathZoneData {
  return { content: '', refs: [], scratches: [] };
}

function loadIndex(sectionId: string): NotebooksIndex {
  try {
    const raw = localStorage.getItem(indexKey(sectionId));
    if (raw) {
      const p = JSON.parse(raw) as NotebooksIndex;
      if (Array.isArray(p.notebooks) && p.notebooks.length > 0 && p.activeId) return p;
    }
  } catch { /* ignore */ }

  const id  = 'nb-legacy';
  const now = Date.now();
  let data  = defaultData();

  try {
    const legacyRaw = localStorage.getItem(legacyKey(sectionId));
    if (legacyRaw) {
      const p = JSON.parse(legacyRaw) as Record<string, unknown>;
      let content = '';
      if (typeof p.content === 'string') {
        content = p.content;
      } else if (Array.isArray(p.blocks)) {
        content = (p.blocks as Array<{ text?: string }>)
          .map(b => b.text ?? '').filter(Boolean).join('\n\n');
      } else if (Array.isArray(p.steps)) {
        content = (p.steps as Array<{ text?: string }>)
          .map(s => s.text ?? '').filter(Boolean).join('\n\n');
      }
      data = {
        content,
        refs:      Array.isArray(p.refs)      ? (p.refs as RefCard[])           : [],
        scratches: Array.isArray(p.scratches) ? (p.scratches as ScratchBlock[]) : [],
      };
    }
  } catch { /* ignore */ }

  const idx: NotebooksIndex = {
    notebooks: [{ id, title: 'Notes', createdAt: now, updatedAt: now }],
    activeId:  id,
  };
  try {
    localStorage.setItem(nbDataKey(sectionId, id), JSON.stringify(data));
    localStorage.setItem(indexKey(sectionId), JSON.stringify(idx));
  } catch { /* quota */ }
  return idx;
}

function loadNbData(sectionId: string, nbId: string): MathZoneData {
  try {
    const raw = localStorage.getItem(nbDataKey(sectionId, nbId));
    if (raw) return JSON.parse(raw) as MathZoneData;
  } catch { /* ignore */ }
  return defaultData();
}

function saveIndex(sectionId: string, idx: NotebooksIndex) {
  try { localStorage.setItem(indexKey(sectionId), JSON.stringify(idx)); } catch { /* quota */ }
}

function saveNbData(sectionId: string, nbId: string, data: MathZoneData) {
  try { localStorage.setItem(nbDataKey(sectionId, nbId), JSON.stringify(data)); } catch { /* quota */ }
}

// ── useNotebooks ──────────────────────────────────────────────────────────────

function useNotebooks(sectionId: string) {
  const [index, setIndex] = useState<NotebooksIndex>(() => loadIndex(sectionId));
  const [data,  setData]  = useState<MathZoneData>(() => {
    const idx = loadIndex(sectionId);
    return loadNbData(sectionId, idx.activeId);
  });

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef      = useRef<MathZoneData>(data);
  dataRef.current    = data;

  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveNbData(sectionId, index.activeId, data);
    }, 300);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [data, sectionId, index.activeId]);

  const createNotebook = () => {
    const id  = `nb-${Date.now()}`;
    const now = Date.now();
    const nb: Notebook = { id, title: 'Untitled', createdAt: now, updatedAt: now };
    const newData = defaultData();
    saveNbData(sectionId, id, newData);
    const newIndex: NotebooksIndex = { notebooks: [...index.notebooks, nb], activeId: id };
    saveIndex(sectionId, newIndex);
    setIndex(newIndex);
    setData(newData);
  };

  const switchNotebook = (id: string) => {
    if (id === index.activeId) return;
    if (persistTimer.current) { clearTimeout(persistTimer.current); persistTimer.current = null; }
    saveNbData(sectionId, index.activeId, dataRef.current);
    const newData  = loadNbData(sectionId, id);
    const newIndex = { ...index, activeId: id };
    saveIndex(sectionId, newIndex);
    setIndex(newIndex);
    setData(newData);
  };

  const renameNotebook = (id: string, title: string) => {
    const newIndex: NotebooksIndex = {
      ...index,
      notebooks: index.notebooks.map(nb =>
        nb.id === id ? { ...nb, title, updatedAt: Date.now() } : nb
      ),
    };
    saveIndex(sectionId, newIndex);
    setIndex(newIndex);
  };

  const deleteNotebook = (id: string) => {
    if (index.notebooks.length <= 1) return;
    try { localStorage.removeItem(nbDataKey(sectionId, id)); } catch { /* ignore */ }
    const remaining   = index.notebooks.filter(nb => nb.id !== id);
    const newActiveId = id === index.activeId ? remaining[0]!.id : index.activeId;
    const newIndex: NotebooksIndex = { notebooks: remaining, activeId: newActiveId };
    saveIndex(sectionId, newIndex);
    setIndex(newIndex);
    if (id === index.activeId) setData(loadNbData(sectionId, newActiveId));
  };

  const activeNotebook = index.notebooks.find(nb => nb.id === index.activeId)
    ?? index.notebooks[0]!;

  return { index, data, activeNotebook, setData, createNotebook, switchNotebook, renameNotebook, deleteNotebook };
}

// ── Plain text ↔ Tiptap JSON converters ──────────────────────────────────────
//
// Content is stored as plain text (same format as before).
// These functions translate between that format and Tiptap's JSON document.
//
// Plain text format:
//   - Empty lines    → blank paragraph (spacing in render)
//   - "- text"       → top-level bullet item
//   - "  - text"     → nested bullet item (2-space indent)
//   - "1. text"      → numbered item
//   - other          → prose paragraph

function plainTextToTiptapDoc(text: string): JSONContent {
  if (!text) return { type: 'doc', content: [{ type: 'paragraph' }] };

  const lines = text.split('\n');
  const nodes: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line → blank paragraph
    if (!line) {
      nodes.push({ type: 'paragraph', content: [] });
      i++;
      continue;
    }

    // Top-level bullet list item (no leading spaces)
    const topBullet = /^([-*]) (.*)$/.exec(line);
    if (topBullet) {
      const listItems: JSONContent[] = [];
      while (i < lines.length) {
        const tbm = /^([-*]) (.*)$/.exec(lines[i]);
        if (!tbm) break;
        const itemText = tbm[2];
        i++;
        const itemContent: JSONContent[] = [
          { type: 'paragraph', content: itemText ? [{ type: 'text', text: itemText }] : [] },
        ];
        // Consume nested items (exactly 2-space indent)
        const nestedItems = consumeNestedList(lines, i);
        if (nestedItems !== null) {
          itemContent.push(nestedItems.node);
          i = nestedItems.nextIdx;
        }
        listItems.push({ type: 'listItem', content: itemContent });
      }
      if (listItems.length > 0) nodes.push({ type: 'bulletList', content: listItems });
      continue;
    }

    // Top-level ordered list item (no leading spaces)
    const topNumbered = /^(\d+)\. (.*)$/.exec(line);
    if (topNumbered) {
      const startNum = parseInt(topNumbered[1], 10);
      const listItems: JSONContent[] = [];
      while (i < lines.length) {
        const tnm = /^(\d+)\. (.*)$/.exec(lines[i]);
        if (!tnm) break;
        const itemText = tnm[2];
        i++;
        const itemContent: JSONContent[] = [
          { type: 'paragraph', content: itemText ? [{ type: 'text', text: itemText }] : [] },
        ];
        const nestedItems = consumeNestedList(lines, i);
        if (nestedItems !== null) {
          itemContent.push(nestedItems.node);
          i = nestedItems.nextIdx;
        }
        listItems.push({ type: 'listItem', content: itemContent });
      }
      if (listItems.length > 0) nodes.push({ type: 'orderedList', attrs: { start: startNum }, content: listItems });
      continue;
    }

    // Normal prose paragraph
    nodes.push({ type: 'paragraph', content: [{ type: 'text', text: line }] });
    i++;
  }

  return { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] };
}

/** Consume consecutive 2-space-indented list items as a nested list node. */
function consumeNestedList(
  lines: string[], startIdx: number
): { node: JSONContent; nextIdx: number } | null {
  if (startIdx >= lines.length) return null;
  const firstLine = lines[startIdx];
  const nestedBullet   = /^ {2}([-*]) (.*)$/.exec(firstLine);
  const nestedNumbered = /^ {2}(\d+)\. (.*)$/.exec(firstLine);
  if (!nestedBullet && !nestedNumbered) return null;

  const isBullet = !!nestedBullet;
  const startNum = nestedNumbered ? parseInt(nestedNumbered[1], 10) : 1;
  const items: JSONContent[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const nbm = /^ {2}([-*]) (.*)$/.exec(lines[i]);
    const nnm = /^ {2}(\d+)\. (.*)$/.exec(lines[i]);
    if (!nbm && !nnm) break;
    const childText = nbm ? nbm[2] : nnm![2];
    items.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: childText ? [{ type: 'text', text: childText }] : [] }],
    });
    i++;
  }

  if (items.length === 0) return null;
  return {
    node: {
      type: isBullet ? 'bulletList' : 'orderedList',
      ...(isBullet ? {} : { attrs: { start: startNum } }),
      content: items,
    },
    nextIdx: i,
  };
}

function tiptapDocToPlainText(json: JSONContent): string {
  function serialize(node: JSONContent, listIndent = 0): string {
    switch (node.type) {
      case 'doc':
        return (node.content ?? []).map(n => serialize(n, 0)).join('\n');

      case 'paragraph':
        return (node.content ?? []).map(n => serialize(n, listIndent)).join('');

      case 'text':
        return node.text ?? '';

      case 'hardBreak':
        return '\n';

      case 'bulletList': {
        return (node.content ?? []).map(item => {
          const firstPara  = item.content?.[0];
          const text       = (firstPara?.content ?? []).map(n => serialize(n)).join('');
          const prefix     = '  '.repeat(listIndent) + '- ';
          const parts: string[] = [prefix + text];
          // Nested lists (content[1], content[2], …)
          for (let j = 1; j < (item.content ?? []).length; j++) {
            parts.push(serialize(item.content![j], listIndent + 1));
          }
          return parts.join('\n');
        }).join('\n');
      }

      case 'orderedList': {
        const start = (node.attrs?.start ?? 1) as number;
        return (node.content ?? []).map((item, idx) => {
          const firstPara  = item.content?.[0];
          const text       = (firstPara?.content ?? []).map(n => serialize(n)).join('');
          const prefix     = '  '.repeat(listIndent) + `${start + idx}. `;
          const parts: string[] = [prefix + text];
          for (let j = 1; j < (item.content ?? []).length; j++) {
            parts.push(serialize(item.content![j], listIndent + 1));
          }
          return parts.join('\n');
        }).join('\n');
      }

      case 'listItem':
        // Called for free-standing listItem — fall through to content
        return (node.content ?? []).map(n => serialize(n, listIndent)).join('\n');

      default:
        if (node.text) return node.text;
        return (node.content ?? []).map(n => serialize(n, listIndent)).join('');
    }
  }
  return serialize(json);
}

// ── Dollar-marker parser ──────────────────────────────────────────────────────

type DollarSeg = { type: 'text' | 'math'; value: string };

function parseDollarMath(text: string): DollarSeg[] {
  const out: DollarSeg[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'math', value: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out.length ? out : [{ type: 'text', value: text }];
}

// ── InlineMath ────────────────────────────────────────────────────────────────

function InlineMath({ text, tokens }: { text: string; tokens: AtmosphereTokens }) {
  const parts = useMemo(() => {
    if (!text.includes('$')) return null;
    return parseDollarMath(text);
  }, [text]);

  if (!parts) return <>{text}</>;

  return (
    <>
      {parts.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        const latex = plainMathToLatex(seg.value);
        const { html, error } = renderKatexHtml(latex, false);
        if (error || !html) {
          return (
            <span key={i} style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '0.88em' }}>
              ${seg.value}$
            </span>
          );
        }
        return (
          <span key={i} dangerouslySetInnerHTML={{ __html: html }}
            style={{ color: tokens.textPrimary }} />
        );
      })}
    </>
  );
}

// ── LineEquation ──────────────────────────────────────────────────────────────

function LineEquation({ text, tokens }: { text: string; tokens: AtmosphereTokens }) {
  const latex           = useMemo(() => plainMathToLatex(text), [text]);
  const { html, error } = useMemo(() => renderKatexHtml(latex, true), [latex]);

  return (
    <div style={{
      textAlign: 'center', padding: '14px 0',
      overflowX: 'auto', overflowY: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {error
        ? <code style={{ fontSize: 13, color: '#f87171', fontFamily: 'monospace', opacity: 0.8 }}>{text}</code>
        : <div dangerouslySetInnerHTML={{ __html: html }} style={{ color: tokens.textPrimary }} />
      }
    </div>
  );
}

// ── RenderedDocument ──────────────────────────────────────────────────────────

const proseStyle = {
  fontSize: 15.5, lineHeight: 1.85, letterSpacing: '0.01em',
  fontFamily: 'var(--fw-font-body)', minHeight: '1.2em',
} as const;

function RenderedDocument({ content, tokens, onClick }: {
  content: string;
  tokens:  AtmosphereTokens;
  onClick: () => void;
}) {
  const lines = useMemo(() => content.split('\n'), [content]);

  if (!content.trim()) {
    return (
      <div onClick={onClick} style={{
        cursor: 'text', color: tokens.textGhost, opacity: 0.3,
        ...proseStyle, fontStyle: 'italic', userSelect: 'none',
      }}>
        Write your solution here.
      </div>
    );
  }

  return (
    <div onClick={onClick} style={{ cursor: 'text' }}>
      {lines.map((line, i) => {
        const t = line.trim();

        // Empty line → spacing
        if (!t) return <div key={i} style={{ height: '1.2em' }} />;

        // Bullet list item (check BEFORE isLikelyMathLine — "- f(x) = sin(x)" must not become KaTeX)
        const bulletM = /^( *)([-*]) (.*)$/.exec(t);
        if (bulletM) {
          const indent  = (line.length - line.trimStart().length) * 6;
          const content = bulletM[3];
          return (
            <div key={i} dir="auto" style={{
              ...proseStyle, color: tokens.textPrimary,
              paddingLeft: 18 + indent, position: 'relative',
            }}>
              <span aria-hidden style={{ position: 'absolute', left: indent, opacity: 0.45 }}>•</span>
              <InlineMath text={content} tokens={tokens} />
            </div>
          );
        }

        // Numbered list item
        const numberedM = /^( *)(\d+)\. (.*)$/.exec(t);
        if (numberedM) {
          const indent  = (line.length - line.trimStart().length) * 6;
          const num     = numberedM[2];
          const content = numberedM[3];
          return (
            <div key={i} dir="auto" style={{
              ...proseStyle, color: tokens.textPrimary,
              paddingLeft: 26 + indent, position: 'relative',
            }}>
              <span aria-hidden style={{
                position: 'absolute', left: indent, opacity: 0.4,
                fontSize: 13, fontVariantNumeric: 'tabular-nums',
              }}>{num}.</span>
              <InlineMath text={content} tokens={tokens} />
            </div>
          );
        }

        // Math line
        if (isLikelyMathLine(t)) return <LineEquation key={i} text={t} tokens={tokens} />;

        // Prose line
        return (
          <div key={i} dir="auto" style={{ ...proseStyle, color: tokens.textPrimary }}>
            <InlineMath text={line} tokens={tokens} />
          </div>
        );
      })}
    </div>
  );
}

// ── TiptapWritingArea ─────────────────────────────────────────────────────────
// Replaces the plain <textarea> with a Tiptap/ProseMirror editor.
// Zero visible chrome: no toolbar, no bubble menu, no formatting controls.
// Keyboard behaviors handled natively by ProseMirror extensions:
//   - "- " + space  → bullet list
//   - "1. " + space → numbered list
//   - Enter          → continue list / new paragraph
//   - Enter on empty list item → exits list
//   - Tab            → indent list item
//   - Shift+Tab      → dedent list item
//   - Backspace at list start → exits list (to paragraph)
//   - Cmd/Ctrl+Z     → undo (native ProseMirror stack)

const PLACEHOLDER = 'Write normally. Put equations on their own line.';

// CSS injected once into <head>, scoped to [data-math-editor]
const EDITOR_STYLES = `
  [data-math-editor] .ProseMirror { outline: none; }
  [data-math-editor] .ProseMirror:focus { outline: none; }
  [data-math-editor] [contenteditable] { outline: none; -webkit-tap-highlight-color: transparent; }
  [data-math-editor] .ProseMirror > p { margin: 0; }
  [data-math-editor] .ProseMirror > p + p { margin-top: 0; }
  [data-math-editor] .ProseMirror ul,
  [data-math-editor] .ProseMirror ol { margin: 0; padding-left: 20px; }
  [data-math-editor] .ProseMirror li > p { margin: 0; }
  [data-math-editor] .ProseMirror [data-placeholder]::before {
    content: attr(data-placeholder);
    float: left;
    pointer-events: none;
    height: 0;
    opacity: 0.3;
    font-style: italic;
  }
`;

function TiptapWritingArea({ content, tokens, onChange, onBlur }: {
  content:  string;
  tokens:   AtmosphereTokens;
  onChange: (s: string) => void;
  onBlur:   () => void;
}) {
  // Inject editor styles once — scoped, idempotent, never removed
  useEffect(() => {
    const id = 'fw-math-editor-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = EDITOR_STYLES;
    document.head.appendChild(el);
  }, []);

  // Debounce timer stored in a ref — timer ops never trigger re-renders
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold:           false,
        italic:         false,
        strike:         false,
        code:           false,
        codeBlock:      false,
        blockquote:     false,
        heading:        false,
        horizontalRule: false,
        dropcursor:     false,
        gapcursor:      false,
        link:           false,
      }),
      Placeholder.configure({ placeholder: PLACEHOLDER }),
    ],
    content: plainTextToTiptapDoc(content),
    autofocus: 'end',
    textDirection: 'auto',
    onUpdate: ({ editor }) => {
      // 16ms debounce — one animation frame; never blocks input,
      // yet flushes well before the user can click the notebook switcher.
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        onChange(tiptapDocToPlainText(editor.getJSON()));
      }, 16);
    },
    onBlur: ({ editor }) => {
      // Always flush immediately on blur — guarantees no data loss.
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      onChange(tiptapDocToPlainText(editor.getJSON()));
      onBlur();
    },
    editorProps: {
      attributes: {
        style: [
          'font-size: 15.5px',
          'line-height: 1.85',
          'letter-spacing: 0.01em',
          `color: ${tokens.textPrimary}`,
          'font-family: var(--fw-font-body)',
          `caret-color: ${tokens.accent}`,
        ].join('; '),
      },
      transformPastedText(text: string): string {
        // Normalize non-breaking spaces and Windows/Mac line endings
        // from Word, PDF, and web-copy pastes.
        return text
          .replace(/ /g, ' ')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
      },
    },
  });

  return (
    <div data-math-editor="">
      <EditorContent editor={editor} />
    </div>
  );
}

// ── PageTitle ─────────────────────────────────────────────────────────────────

function PageTitle({ notebook, allNotebooks, tokens, onRename, onSwitch, onCreate }: {
  notebook:     Notebook;
  allNotebooks: Notebook[];
  tokens:       AtmosphereTokens;
  onRename:     (id: string, title: string) => void;
  onSwitch:     (id: string) => void;
  onCreate:     () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draft,        setDraft]        = useState(notebook.title);
  const [hovering,     setHovering]     = useState(false);
  const [showList,     setShowList]     = useState(false);
  const [listPos,      setListPos]      = useState({ top: 0, left: 0 });
  const switchRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setDraft(notebook.title);
    setEditingTitle(false);
    setShowList(false);
  }, [notebook.id, notebook.title]);

  const commitRename = () => {
    const t = draft.trim() || 'Untitled';
    setDraft(t);
    onRename(notebook.id, t);
    setEditingTitle(false);
  };

  const openList = () => {
    if (switchRef.current) {
      const r = switchRef.current.getBoundingClientRect();
      setListPos({ top: r.bottom + 6, left: r.left });
    }
    setShowList(v => !v);
  };

  return (
    <div
      style={{ marginBottom: 36 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {editingTitle ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
            if (e.key === 'Escape') { setDraft(notebook.title); setEditingTitle(false); }
          }}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            borderBottom: `1px solid ${tokens.accent}44`,
            fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em',
            color: tokens.textPrimary, opacity: 0.82,
            fontFamily: 'var(--fw-font-body)', caretColor: tokens.accent,
            width: '100%', padding: '1px 0', display: 'block',
          }}
        />
      ) : (
        <div
          onClick={() => setEditingTitle(true)}
          style={{
            fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em',
            color: tokens.textPrimary, opacity: 0.82,
            fontFamily: 'var(--fw-font-body)', cursor: 'text', lineHeight: 1.2,
          }}
        >
          {notebook.title || 'Untitled'}
        </div>
      )}

      <div style={{
        height: 18, marginTop: 6,
        display: 'flex', alignItems: 'center', gap: 10,
        opacity: (hovering && !editingTitle) ? 1 : 0,
        transition: 'opacity 0.18s',
        pointerEvents: (hovering && !editingTitle) ? 'auto' : 'none',
        userSelect: 'none',
      }}>
        {allNotebooks.length > 1 && (
          <span ref={switchRef} onClick={openList} style={{
            fontSize: 11, color: tokens.textGhost, opacity: 0.45,
            cursor: 'pointer', fontFamily: 'var(--fw-font-body)',
          }}>▾ switch</span>
        )}
        <span onClick={onCreate} style={{
          fontSize: 11, color: tokens.textGhost, opacity: 0.45,
          cursor: 'pointer', fontFamily: 'var(--fw-font-body)',
        }}>· new</span>
      </div>

      {showList && (
        <>
          <div onClick={() => setShowList(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: listPos.top, left: listPos.left,
            zIndex: 9999, minWidth: 180,
            background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`,
            borderRadius: 10, padding: '5px 0',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          }}>
            {allNotebooks.map(nb => (
              <button key={nb.id} type="button"
                onClick={() => { onSwitch(nb.id); setShowList(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: nb.id === notebook.id ? `${tokens.accent}14` : 'none',
                  border: 'none', cursor: 'pointer',
                  fontSize: 12, padding: '7px 14px',
                  color: nb.id === notebook.id ? tokens.accent : tokens.textMuted,
                  fontFamily: 'var(--fw-font-body)',
                  fontWeight: nb.id === notebook.id ? 600 : 400,
                }}
                onMouseEnter={e => {
                  if (nb.id !== notebook.id)
                    (e.currentTarget as HTMLButtonElement).style.background = `${tokens.accent}0a`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    nb.id === notebook.id ? `${tokens.accent}14` : 'none';
                }}>
                {nb.title || 'Untitled'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── HelpPanel ─────────────────────────────────────────────────────────────────

function HelpPanel({ tokens, onClose }: { tokens: AtmosphereTokens; onClose: () => void }) {
  const mono: React.CSSProperties = {
    fontFamily: "ui-monospace, 'JetBrains Mono', 'Courier New', monospace",
    fontSize: 11, color: tokens.textMuted,
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase',
    color: tokens.textGhost, opacity: 0.7, marginBottom: 8, marginTop: 14,
    fontFamily: 'var(--fw-font-label)',
  };
  const rule: React.CSSProperties = {
    fontSize: 13, lineHeight: 1.7, color: tokens.textMuted,
    fontFamily: 'var(--fw-font-body)', marginBottom: 3,
  };
  const shortRow: React.CSSProperties = {
    display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 5,
  };

  return (
    <div style={{
      position: 'absolute', top: 40, right: 16, width: 320, zIndex: 30,
      background: tokens.cardBg, border: `1px solid ${tokens.cardBorder}`,
      borderRadius: 12, padding: '14px 16px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      overflowY: 'auto', maxHeight: 'calc(100vh - 120px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: tokens.textMuted, fontFamily: 'var(--fw-font-body)' }}>
          How to write here
        </span>
        <button type="button" onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, lineHeight: 1, color: tokens.textGhost, padding: '0 2px', opacity: 0.6,
        }}>×</button>
      </div>

      <div style={rule}>Write naturally.</div>
      <div style={rule}>Equations on their own line render automatically.</div>
      <div style={rule}>Lists: start a line with <span style={mono}>- </span> or <span style={mono}>1. </span></div>

      <div style={{ borderTop: `1px solid ${tokens.divider}`, margin: '12px 0 0', opacity: 0.5 }} />
      <div style={sectionLabel}>Examples</div>
      <div style={{ ...mono, background: `${tokens.wellBg}88`, borderRadius: 6,
        padding: '8px 10px', lineHeight: 1.9, whiteSpace: 'pre' }}>
        {'y = x^2\nf(x) = 2x\nint 0 to 1 x^2 dx'}
      </div>
      <div style={{ fontSize: 11, color: tokens.textGhost, opacity: 0.5,
        fontFamily: 'var(--fw-font-body)', lineHeight: 1.6, marginTop: 10 }}>
        You can also use inline math inside a sentence — wrap it in $…$
      </div>

      <div style={{ borderTop: `1px solid ${tokens.divider}`, margin: '12px 0 0', opacity: 0.5 }} />
      <div style={sectionLabel}>Shortcuts</div>
      {([
        ['sqrt x',             '√x'],
        ['1/2',                'fraction'],
        ['x^2',                'power'],
        ['int 0 to 1 x^2 dx', 'integral'],
        ['lim x->0',           'limit'],
        ['Tab',                'indent list'],
        ['Shift+Tab',          'dedent list'],
      ] as [string, string][]).map(([from, to]) => (
        <div key={from} style={shortRow}>
          <span style={{ ...mono, flex: 1 }}>{from}</span>
          <span style={{ fontSize: 10, color: tokens.textGhost, opacity: 0.5 }}>→</span>
          <span style={{ fontSize: 11, color: tokens.textGhost, opacity: 0.7,
            fontFamily: 'var(--fw-font-body)' }}>{to}</span>
        </div>
      ))}
    </div>
  );
}

// ── ZoneHeader ────────────────────────────────────────────────────────────────

function ZoneHeader({ label, description, tokens }: {
  label: string; description: string; tokens: AtmosphereTokens;
}) {
  return (
    <div style={{ padding: '14px 14px 6px', flexShrink: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.8px',
        textTransform: 'uppercase', color: tokens.textGhost,
        fontFamily: 'var(--fw-font-label)', userSelect: 'none', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 10, fontStyle: 'italic', color: tokens.textGhost, opacity: 0.6,
        fontFamily: 'var(--fw-font-body)', lineHeight: 1.4, userSelect: 'none' }}>
        {description}
      </div>
    </div>
  );
}

// ── PanelAddButton ────────────────────────────────────────────────────────────

function PanelAddButton({ label, tokens, onClick }: {
  label: string; tokens: AtmosphereTokens; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
        padding: '8px 14px', color: hover ? tokens.textMuted : tokens.textGhost,
        transition: 'color 0.12s', textAlign: 'left', flexShrink: 0,
        fontFamily: 'var(--fw-font-label)', letterSpacing: '0.02em',
      }}>
      {label}
    </button>
  );
}

// ── PanelEmptyHint ────────────────────────────────────────────────────────────

function PanelEmptyHint({ lines, tokens }: { lines: string[]; tokens: AtmosphereTokens }) {
  return (
    <div style={{ padding: '8px 14px 12px' }}>
      {lines.map((line, i) => (
        <div key={i} style={{ fontSize: 11, fontStyle: 'italic', color: tokens.textGhost,
          opacity: 0.55, lineHeight: 1.65, fontFamily: 'var(--fw-font-body)', userSelect: 'none' }}>
          {line}
        </div>
      ))}
    </div>
  );
}

// ── RefCardView ───────────────────────────────────────────────────────────────

function RefCardView({ card, tokens, onChange, onRemove }: {
  card: RefCard; tokens: AtmosphereTokens;
  onChange: (c: string) => void; onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      position: 'relative', backgroundColor: tokens.cardBg,
      borderRadius: Math.round(tokens.radius * 0.5),
      border: `1px solid ${hover ? tokens.cardBorderHover : tokens.cardBorder}`,
      boxShadow: tokens.shadowSm, marginBottom: 6, transition: 'border-color 0.12s',
    }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" onClick={onRemove} style={{
        position: 'absolute', top: 5, right: 7, background: 'none', border: 'none',
        cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '1px 3px',
        color: hover ? tokens.textMuted : 'transparent', transition: 'color 0.12s',
      }}>×</button>
      <textarea value={card.content} onChange={e => onChange(e.target.value)}
        placeholder="Theorem, formula, or hint…"
        style={{
          display: 'block', width: '100%', minHeight: 80,
          padding: '10px 22px 10px 12px', resize: 'none', border: 'none', outline: 'none',
          fontSize: 12, lineHeight: 1.65, color: tokens.textSecondary,
          background: 'transparent', fontFamily: 'var(--fw-font-body)', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

// ── ScratchBlockView ──────────────────────────────────────────────────────────

function ScratchBlockView({ block, tokens, onChange, onRemove }: {
  block: ScratchBlock; tokens: AtmosphereTokens;
  onChange: (c: string) => void; onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      position: 'relative', backgroundColor: tokens.cardBg,
      backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
      backgroundSize: '18px 18px',
      borderRadius: Math.round(tokens.radius * 0.5),
      border: `1px solid ${hover ? tokens.cardBorderHover : tokens.cardBorder}`,
      boxShadow: tokens.shadowSm, marginBottom: 6, transition: 'border-color 0.12s',
    }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" onClick={onRemove} style={{
        position: 'absolute', top: 5, right: 7, background: 'none', border: 'none',
        cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '1px 3px',
        color: hover ? tokens.textMuted : 'transparent', transition: 'color 0.12s',
      }}>×</button>
      <textarea value={block.content} onChange={e => onChange(e.target.value)}
        placeholder="Try something…"
        style={{
          display: 'block', width: '100%', minHeight: 80,
          padding: '10px 22px 10px 12px', resize: 'none', border: 'none', outline: 'none',
          fontSize: 12, lineHeight: 1.7, color: tokens.textSecondary,
          background: 'transparent',
          fontFamily: "ui-monospace, 'Courier New', monospace", boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

// ── EdgeTab ───────────────────────────────────────────────────────────────────

function EdgeTab({ side, label, open, tokens, onClick }: {
  side:    'left' | 'right';
  label:   string;
  open:    boolean;
  tokens:  AtmosphereTokens;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const edgeStyle = side === 'left' ? { left: 0 } : { right: 0 };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={open ? `Close ${label}` : `Open ${label}`}
      style={{
        position: 'absolute', ...edgeStyle,
        top: 0, bottom: 0, width: 16,
        cursor: 'pointer', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: tokens.textGhost,
        opacity: open ? 0.55 : (hover ? 0.3 : 0),
        transition: 'opacity 0.18s',
        userSelect: 'none', pointerEvents: 'none',
        fontFamily: 'var(--fw-font-label)',
      }}>
        {label}
      </span>
    </div>
  );
}

// ── MathZone ──────────────────────────────────────────────────────────────────

export function MathZone({
  tokens, sectionId, sectionTitle: _st, paddingTop = 52,
}: MathZoneProps) {
  const {
    index, data, activeNotebook,
    setData, createNotebook, switchNotebook, renameNotebook,
  } = useNotebooks(sectionId);

  const [editing,   setEditing]   = useState(() => data.content.trim() === '');
  const [leftOpen,  setLeftOpen]  = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [showHelp,  setShowHelp]  = useState(false);

  useEffect(() => {
    setEditing(data.content.trim() === '');
  }, [activeNotebook.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = () => {
    if (data.content.trim()) setEditing(false);
  };

  // Atomically exit editing mode when switching notebooks — prevents a one-frame
  // window where the editor is still visible but data has already changed.
  const handleSwitchNotebook = (id: string) => {
    setEditing(false);
    switchNotebook(id);
  };

  const toggleLeft  = () => setLeftOpen(v  => { const next = !v;  if (next) setRightOpen(false); return next; });
  const toggleRight = () => setRightOpen(v => { const next = !v; if (next) setLeftOpen(false);  return next; });

  const addRef      = () => setData(d => ({ ...d, refs: [...d.refs, { id: `ref-${Date.now()}`, content: '' }] }));
  const updateRef   = (id: string, c: string) => setData(d => ({ ...d, refs: d.refs.map(r => r.id === id ? { ...r, content: c } : r) }));
  const removeRef   = (id: string) => setData(d => ({ ...d, refs: d.refs.filter(r => r.id !== id) }));

  const addScratch    = () => setData(d => ({ ...d, scratches: [...d.scratches, { id: `scratch-${Date.now()}`, content: '' }] }));
  const updateScratch = (id: string, c: string) => setData(d => ({ ...d, scratches: d.scratches.map(s => s.id === id ? { ...s, content: c } : s) }));
  const removeScratch = (id: string) => setData(d => ({ ...d, scratches: d.scratches.filter(s => s.id !== id) }));

  const refsContent = (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {data.refs.length === 0 && (
          <PanelEmptyHint
            lines={['Add a theorem,', 'formula, or hint.', '', 'Stays visible', 'while you work.']}
            tokens={tokens}
          />
        )}
        {data.refs.map(r => (
          <RefCardView key={r.id} card={r} tokens={tokens}
            onChange={c => updateRef(r.id, c)} onRemove={() => removeRef(r.id)} />
        ))}
      </div>
      <PanelAddButton label="+ reference" tokens={tokens} onClick={addRef} />
    </>
  );

  const scratchContent = (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
        {data.scratches.length === 0 && (
          <PanelEmptyHint
            lines={['Side calculations,', 'rough attempts,', 'discarded ideas —', '', 'all welcome here.']}
            tokens={tokens}
          />
        )}
        {data.scratches.map(s => (
          <ScratchBlockView key={s.id} block={s} tokens={tokens}
            onChange={c => updateScratch(s.id, c)} onRemove={() => removeScratch(s.id)} />
        ))}
      </div>
      <PanelAddButton label="+ scratch" tokens={tokens} onClick={addScratch} />
    </>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      backgroundColor: tokens.pageBg, paddingTop, overflow: 'hidden',
    }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

        <EdgeTab side="left"  label="REFS"    open={leftOpen}  tokens={tokens} onClick={toggleLeft}  />
        <EdgeTab side="right" label="SCRATCH" open={rightOpen} tokens={tokens} onClick={toggleRight} />

        {/* Notebook page — anchored, never reflowed */}
        <div style={{
          position: 'absolute', inset: '0 16px',
          display: 'flex', flexDirection: 'column',
          backgroundColor: tokens.pageBg,
          overflow: 'hidden', zIndex: 1,
        }}>
          {/* "?" help button */}
          <button type="button"
            onClick={() => setShowHelp(v => !v)}
            title="Math writing guide"
            onMouseEnter={e => { if (!showHelp) (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onMouseLeave={e => { if (!showHelp) (e.currentTarget as HTMLButtonElement).style.opacity = '0.35'; }}
            style={{
              position: 'absolute', top: 12, right: 16, zIndex: 20,
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: showHelp ? `${tokens.accent}22` : 'rgba(0,0,0,0.22)',
              border: showHelp ? `1px solid ${tokens.accent}55` : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, cursor: 'pointer',
              color: showHelp ? tokens.accent : tokens.textGhost,
              opacity: showHelp ? 1 : 0.35,
              fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0,
              transition: 'opacity 0.15s, color 0.15s, background 0.15s, border-color 0.15s',
              fontFamily: 'var(--fw-font-label)', backdropFilter: 'blur(4px)',
            }}>?</button>

          {showHelp && <HelpPanel tokens={tokens} onClose={() => setShowHelp(false)} />}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '44px 52px 64px' }}>

              <PageTitle
                notebook={activeNotebook}
                allNotebooks={index.notebooks}
                tokens={tokens}
                onRename={renameNotebook}
                onSwitch={handleSwitchNotebook}
                onCreate={createNotebook}
              />

              {editing ? (
                <TiptapWritingArea
                  content={data.content}
                  tokens={tokens}
                  onChange={c => setData(d => ({ ...d, content: c }))}
                  onBlur={handleBlur}
                />
              ) : (
                <RenderedDocument
                  content={data.content}
                  tokens={tokens}
                  onClick={() => setEditing(true)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Scrim */}
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 35,
            opacity: (leftOpen || rightOpen) ? 1 : 0,
            pointerEvents: (leftOpen || rightOpen) ? 'auto' : 'none',
            background: 'rgba(0,0,0,0.22)',
            transition: 'opacity 0.22s',
          }}
          onClick={() => { setLeftOpen(false); setRightOpen(false); }}
        />

        {/* Left drawer */}
        <div style={{
          position: 'absolute', left: 16, top: 0, bottom: 0, width: 280, zIndex: 40,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: tokens.cardBg, borderRight: `1px solid ${tokens.cardBorder}`,
          transform: leftOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        }}>
          <ZoneHeader label="References" description="Theorem · Formula · Hint" tokens={tokens} />
          {refsContent}
        </div>

        {/* Right drawer */}
        <div style={{
          position: 'absolute', right: 16, top: 0, bottom: 0, width: 260, zIndex: 40,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: tokens.cardBg, borderLeft: `1px solid ${tokens.cardBorder}`,
          transform: rightOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        }}>
          <ZoneHeader label="Scratch" description="Explore freely." tokens={tokens} />
          {scratchContent}
        </div>

      </div>
    </div>
  );
}
