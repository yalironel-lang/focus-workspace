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
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { renderKatexHtml } from '../../lib/notebookMath';
import { plainMathToLatex, isLikelyMathLine } from '../../lib/mathInputAssistant';
import {
  parseInlineForTiptap,
  serializeTiptapInline,
  renderInlineFormatted,
} from '../../lib/mathZoneInlineFormat';
import { TiptapFormatBubbleMenu, tiptapToolbarBusyRef } from './TiptapFormatBubbleMenu';
import '../notebook/notebookToolbar.css';
import { touchMathZoneActivity } from '../../lib/mathZoneActivity';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefCard      { id: string; content: string }
interface ScratchBlock { id: string; content: string }
interface NotebookPageResume {
  scrollTop: number;
  lastEditing: boolean;
}
interface NotebookPage {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface MathZoneData {
  schemaVersion: 2;
  content:   string;
  pages:     NotebookPage[];
  activePageId: string;
  pageResume: Record<string, NotebookPageResume>;
  refs:      RefCard[];
  scratches: ScratchBlock[];
}

type PageBackground = 'dots' | 'grid' | 'ruled' | 'blank';
type PageDensity = 'light' | 'medium' | 'dense';
type NotebookWidth = 'narrow' | 'comfortable' | 'wide';
type PageSpacing = 'compact' | 'balanced' | 'spacious';
type EquationSize = 'small' | 'medium' | 'large';
type EquationAlignment = 'center' | 'left';

interface NotebookControlsState {
  pageBackground: PageBackground;
  pageDensity: PageDensity;
  notebookWidth: NotebookWidth;
  pageSpacing: PageSpacing;
  fontSize: number;
  lineHeight: number;
  writingWidth: number;
  keepListsVisibleWhileTyping: boolean;
  rtlAssist: boolean;
  equationSize: EquationSize;
  equationAlignment: EquationAlignment;
  hideReferences: boolean;
  hideScratch: boolean;
  dimEnvironment: boolean;
  deepFocus: boolean;
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
  controlsOpen?: boolean;
  onControlsOpenChange?: (open: boolean) => void;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const legacyKey = (sid: string)            => `fw_math_v1_${sid}`;
const indexKey  = (sid: string)            => `fw_math_index_${sid}`;
const nbDataKey = (sid: string, id: string) => `fw_math_nb_${sid}_${id}`;
const nbControlsKey = (sid: string, id: string) => `fw_math_controls_v1_${sid}_${id}`;

function defaultControls(): NotebookControlsState {
  return {
    pageBackground: 'dots',
    pageDensity: 'medium',
    notebookWidth: 'comfortable',
    pageSpacing: 'balanced',
    fontSize: 15.5,
    lineHeight: 1.85,
    writingWidth: 640,
    keepListsVisibleWhileTyping: true,
    rtlAssist: false,
    equationSize: 'medium',
    equationAlignment: 'center',
    hideReferences: false,
    hideScratch: false,
    dimEnvironment: false,
    deepFocus: false,
  };
}

function loadControls(sectionId: string, notebookId: string): NotebookControlsState {
  try {
    const raw = localStorage.getItem(nbControlsKey(sectionId, notebookId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotebookControlsState>;
      return { ...defaultControls(), ...parsed };
    }
  } catch {
    /* ignore */
  }
  return defaultControls();
}

function saveControls(sectionId: string, notebookId: string, controls: NotebookControlsState) {
  try {
    localStorage.setItem(nbControlsKey(sectionId, notebookId), JSON.stringify(controls));
  } catch {
    /* quota */
  }
}

function defaultData(): MathZoneData {
  const id = `page-${Date.now()}`;
  return {
    schemaVersion: 2,
    content: '',
    pages: [{ id, title: 'Page 1', content: '', createdAt: Date.now(), updatedAt: Date.now() }],
    activePageId: id,
    pageResume: {},
    refs: [],
    scratches: [],
  };
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
        ...defaultData(),
        content,
        pages: [{
          id: `page-${now}`,
          title: 'Page 1',
          content,
          createdAt: now,
          updatedAt: now,
        }],
        activePageId: `page-${now}`,
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
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MathZoneData>;
      const now = Date.now();
      if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        const pages = parsed.pages.map((p, idx) => ({
          id: typeof p.id === 'string' ? p.id : `page-${now}-${idx}`,
          title: typeof p.title === 'string' && p.title.trim() ? p.title : `Page ${idx + 1}`,
          content: typeof p.content === 'string' ? p.content : '',
          createdAt: typeof p.createdAt === 'number' ? p.createdAt : now,
          updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now,
        }));
        const activePageId = pages.some(p => p.id === parsed.activePageId) ? parsed.activePageId! : pages[0]!.id;
        return {
          schemaVersion: 2,
          content: typeof parsed.content === 'string' ? parsed.content : pages.find(p => p.id === activePageId)?.content ?? '',
          pages,
          activePageId,
          pageResume: parsed.pageResume && typeof parsed.pageResume === 'object' ? parsed.pageResume : {},
          refs: Array.isArray(parsed.refs) ? parsed.refs as RefCard[] : [],
          scratches: Array.isArray(parsed.scratches) ? parsed.scratches as ScratchBlock[] : [],
        };
      }
      // Legacy single-document compatibility adapter -> Page 1.
      const legacyContent = typeof parsed.content === 'string' ? parsed.content : '';
      const pageId = `page-${now}`;
      return {
        schemaVersion: 2,
        content: legacyContent,
        pages: [{ id: pageId, title: 'Page 1', content: legacyContent, createdAt: now, updatedAt: now }],
        activePageId: pageId,
        pageResume: {},
        refs: Array.isArray(parsed.refs) ? parsed.refs as RefCard[] : [],
        scratches: Array.isArray(parsed.scratches) ? parsed.scratches as ScratchBlock[] : [],
      };
    }
  } catch { /* ignore */ }
  return defaultData();
}

function saveIndex(sectionId: string, idx: NotebooksIndex) {
  try { localStorage.setItem(indexKey(sectionId), JSON.stringify(idx)); } catch { /* quota */ }
}

function saveNbData(sectionId: string, nbId: string, data: MathZoneData) {
  touchMathZoneActivity(sectionId);
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
      const now = Date.now();
      const updatedIndex: NotebooksIndex = {
        ...index,
        notebooks: index.notebooks.map(nb => nb.id === index.activeId ? { ...nb, updatedAt: now } : nb),
      };
      saveIndex(sectionId, updatedIndex);
      setIndex(updatedIndex);
    }, 300);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [data, sectionId, index.activeId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const duplicateNotebook = (id: string) => {
    const source = index.notebooks.find(nb => nb.id === id);
    if (!source) return null;
    const sourceData = loadNbData(sectionId, id);
    const newId = `nb-${Date.now()}`;
    const now = Date.now();
    const duplicate: Notebook = {
      id: newId,
      title: `${source.title || 'Untitled'} copy`,
      createdAt: now,
      updatedAt: now,
    };
    saveNbData(sectionId, newId, sourceData);
    const newIndex: NotebooksIndex = { notebooks: [...index.notebooks, duplicate], activeId: newId };
    saveIndex(sectionId, newIndex);
    setIndex(newIndex);
    setData(sourceData);
    return newId;
  };

  const updateNotebookData = (
    updater: (current: MathZoneData) => MathZoneData,
  ) => {
    setData(current => updater(current));
  };

  return {
    index,
    data,
    activeNotebook,
    setData,
    updateNotebookData,
    createNotebook,
    switchNotebook,
    renameNotebook,
    deleteNotebook,
    duplicateNotebook,
  };
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
          { type: 'paragraph', content: itemText ? parseInlineForTiptap(itemText) : [] },
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
          { type: 'paragraph', content: itemText ? parseInlineForTiptap(itemText) : [] },
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
    nodes.push({ type: 'paragraph', content: parseInlineForTiptap(line) });
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
      content: [{ type: 'paragraph', content: childText ? parseInlineForTiptap(childText) : [] }],
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
        return serializeTiptapInline(node.content ?? []);

      case 'text':
        return node.text ?? '';

      case 'hardBreak':
        return '\n';

      case 'bulletList': {
        return (node.content ?? []).map(item => {
          const firstPara  = item.content?.[0];
          const text       = serializeTiptapInline(firstPara?.content ?? []);
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
          const text       = serializeTiptapInline(firstPara?.content ?? []);
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

  if (!parts) return <>{renderInlineFormatted(text)}</>;

  return (
    <>
      {parts.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{renderInlineFormatted(seg.value)}</span>;
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

function LineEquation({
  text,
  tokens,
  equationSize,
  equationAlignment,
}: {
  text: string;
  tokens: AtmosphereTokens;
  equationSize: EquationSize;
  equationAlignment: EquationAlignment;
}) {
  const latex           = useMemo(() => plainMathToLatex(text), [text]);
  const { html, error } = useMemo(() => renderKatexHtml(latex, true), [latex]);
  const scale = equationSize === 'small' ? 0.92 : equationSize === 'large' ? 1.12 : 1;
  const justifyContent = equationAlignment === 'left' ? 'flex-start' : 'center';
  const textAlign = equationAlignment === 'left' ? 'left' : 'center';

  return (
    <div style={{
      textAlign, padding: '14px 0',
      overflowX: 'auto', overflowY: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent,
    }}>
      {error
        ? <code style={{ fontSize: 13, color: '#f87171', fontFamily: 'monospace', opacity: 0.8 }}>{text}</code>
        : <div
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ color: tokens.textPrimary, transform: `scale(${scale})`, transformOrigin: equationAlignment === 'left' ? 'left center' : 'center center' }}
          />
      }
    </div>
  );
}

// ── RenderedDocument ──────────────────────────────────────────────────────────

const proseStyle = {
  fontSize: 15.5, lineHeight: 1.85, letterSpacing: '0.01em',
  fontFamily: 'var(--fw-font-body)', minHeight: '1.2em',
} as const;

function RenderedDocument({ content, tokens, onClick, proseStyleOverride, equationSize, equationAlignment }: {
  content: string;
  tokens:  AtmosphereTokens;
  onClick: () => void;
  proseStyleOverride?: React.CSSProperties;
  equationSize?: EquationSize;
  equationAlignment?: EquationAlignment;
}) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const prose = proseStyleOverride ? { ...proseStyle, ...proseStyleOverride } : proseStyle;

  if (!content.trim()) {
    return (
      <div onClick={onClick} style={{
        cursor: 'text', color: tokens.textGhost, opacity: 0.3,
        ...prose, fontStyle: 'italic', userSelect: 'none',
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
              ...prose, color: tokens.textPrimary,
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
              ...prose, color: tokens.textPrimary,
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
        if (isLikelyMathLine(t)) {
          return (
            <LineEquation
              key={i}
              text={t}
              tokens={tokens}
              equationSize={equationSize ?? 'medium'}
              equationAlignment={equationAlignment ?? 'center'}
            />
          );
        }

        // Prose line
        return (
          <div key={i} dir="auto" style={{ ...prose, color: tokens.textPrimary }}>
            <InlineMath text={line} tokens={tokens} />
          </div>
        );
      })}
    </div>
  );
}

// ── TiptapWritingArea ─────────────────────────────────────────────────────────
// Tiptap/ProseMirror editor with selection bubble formatting toolbar.

const PLACEHOLDER = 'Write normally. Put equations on their own line.';

function isTiptapFormatToolbarNode(node: EventTarget | null | undefined): boolean {
  return (
    node instanceof Element &&
    Boolean(
      node.closest('[data-nb-tiptap-bubble-menu="1"]') ||
        node.closest('[data-nb-format-toolbar="1"]'),
    )
  );
}

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
  [data-math-editor][data-list-visible="on"] .ProseMirror ul,
  [data-math-editor][data-list-visible="on"] .ProseMirror ol {
    list-style-position: outside;
    padding-left: 24px;
  }
  [data-math-editor][data-list-visible="on"] .ProseMirror li::marker {
    color: rgba(255,255,255,0.62);
    font-size: 0.9em;
  }
  [data-math-editor][data-list-visible="off"] .ProseMirror ul,
  [data-math-editor][data-list-visible="off"] .ProseMirror ol {
    list-style: none;
    padding-left: 0;
  }
  [data-math-editor][data-list-visible="off"] .ProseMirror li > p {
    margin-left: 0;
  }
  [data-math-editor] .ProseMirror [data-placeholder]::before {
    content: attr(data-placeholder);
    float: left;
    pointer-events: none;
    height: 0;
    opacity: 0.3;
    font-style: italic;
  }
  [data-math-editor] .ProseMirror strong { font-weight: 650; }
  [data-math-editor] .ProseMirror em {
    font-style: italic;
    font-synthesis: style;
  }
  [data-math-editor] .ProseMirror u {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  [data-math-editor] .ProseMirror mark {
    border-radius: 2px;
    padding: 0 1px;
  }
`;

function TiptapWritingArea({ content, tokens, onChange, controls, flushRef }: {
  content:   string;
  tokens:    AtmosphereTokens;
  onChange:  (s: string) => void;
  controls:  NotebookControlsState;
  flushRef?: React.MutableRefObject<(() => void) | null>;
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
      Underline,
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
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
      // Flush on blur — exit edit mode is handled by the writing-surface wrapper.
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      onChange(tiptapDocToPlainText(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        style: [
          `font-size: ${controls.fontSize}px`,
          `line-height: ${controls.lineHeight}`,
          'letter-spacing: 0.01em',
          `color: ${tokens.textPrimary}`,
          'font-family: var(--fw-font-body)',
          `caret-color: ${tokens.accent}`,
          `direction: ${controls.rtlAssist ? 'rtl' : 'ltr'}`,
          `text-align: ${controls.rtlAssist ? 'right' : 'left'}`,
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

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = () => {
      if (!editor) return;
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      onChange(tiptapDocToPlainText(editor.getJSON()));
    };
    return () => { flushRef.current = null; };
  }, [editor, onChange, flushRef]);

  return (
    <div data-math-editor="" data-list-visible={controls.keepListsVisibleWhileTyping ? 'on' : 'off'}>
      <EditorContent editor={editor} />
      {editor ? <TiptapFormatBubbleMenu editor={editor} tokens={tokens} /> : null}
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

function NotebookShelf({
  tokens,
  notebooks,
  activeNotebookId,
  onClose,
  onSwitch,
  onCreate,
  onRename,
}: {
  tokens: AtmosphereTokens;
  notebooks: Notebook[];
  activeNotebookId: string;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
}) {
  const ordered = [...notebooks].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div
        style={{
          position: 'absolute',
          top: 52,
          left: 24,
          right: 24,
          zIndex: 81,
          borderRadius: 14,
          border: `1px solid ${tokens.cardBorder}`,
          background: `${tokens.cardBg}f3`,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.52)',
          padding: 14,
        }}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: tokens.textGhost, fontFamily: 'var(--fw-font-label)' }}>
            Notebooks
          </span>
          <button type="button" onClick={onCreate} style={{ background: 'none', border: `1px solid ${tokens.cardBorder}`, color: tokens.textMuted, borderRadius: 999, fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
            + New Notebook
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {ordered.map(nb => (
            <button key={nb.id} type="button"
              onClick={() => { onSwitch(nb.id); onClose(); }}
              onDoubleClick={() => {
                const next = window.prompt('Rename notebook', nb.title || 'Untitled');
                if (next != null) onRename(nb.id, next.trim() || 'Untitled');
              }}
              style={{
                textAlign: 'left',
                borderRadius: 12,
                border: `1px solid ${nb.id === activeNotebookId ? `${tokens.accent}66` : tokens.cardBorder}`,
                background: nb.id === activeNotebookId ? `${tokens.accent}1f` : `${tokens.wellBg}80`,
                color: nb.id === activeNotebookId ? tokens.textPrimary : tokens.textMuted,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{nb.title || 'Untitled'}</div>
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>Open Notebook</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

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

function NotebookControlsPanel({
  tokens,
  controls,
  onChange,
  onClose,
  onRename,
  onDuplicate,
  onCopy,
  onExport,
}: {
  tokens: AtmosphereTokens;
  controls: NotebookControlsState;
  onChange: (next: NotebookControlsState) => void;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onExport: () => void;
}) {
  const sectionStyle: React.CSSProperties = {
    borderTop: `1px solid ${tokens.divider}`,
    paddingTop: 10,
    marginTop: 10,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: tokens.textGhost,
    fontFamily: 'var(--fw-font-label)',
    marginBottom: 8,
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  };
  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? `${tokens.accent}66` : tokens.cardBorder}`,
    background: active ? `${tokens.accent}1f` : `${tokens.wellBg}66`,
    color: active ? tokens.accent : tokens.textMuted,
    borderRadius: 999,
    padding: '5px 9px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'var(--fw-font-body)',
  });
  const toggle = (
    k: 'keepListsVisibleWhileTyping' | 'rtlAssist' | 'hideReferences' | 'hideScratch' | 'dimEnvironment' | 'deepFocus',
  ) =>
    onChange({ ...controls, [k]: !controls[k] });

  return (
    <div style={{
      position: 'absolute', top: 52, right: 16, width: 360, zIndex: 80,
      background: `${tokens.cardBg}f2`,
      border: `1px solid ${tokens.cardBorder}`,
      borderRadius: 14,
      padding: '12px 14px 14px',
      boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)',
      pointerEvents: 'auto',
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 120px)',
    }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: tokens.textMuted, fontFamily: 'var(--fw-font-body)' }}>
          Notebook Controls
        </span>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', color: tokens.textGhost, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Page</div>
        <div style={rowStyle}>
          {(['dots', 'grid', 'ruled', 'blank'] as PageBackground[]).map(v => (
            <button key={v} type="button" onClick={() => onChange({ ...controls, pageBackground: v })} style={chip(controls.pageBackground === v)}>{v}</button>
          ))}
        </div>
        <div style={rowStyle}>
          {(['light', 'medium', 'dense'] as PageDensity[]).map(v => (
            <button key={v} type="button" onClick={() => onChange({ ...controls, pageDensity: v })} style={chip(controls.pageDensity === v)}>{v}</button>
          ))}
        </div>
        <div style={rowStyle}>
          {(['narrow', 'comfortable', 'wide'] as NotebookWidth[]).map(v => (
            <button key={v} type="button" onClick={() => onChange({ ...controls, notebookWidth: v })} style={chip(controls.notebookWidth === v)}>{v}</button>
          ))}
        </div>
        <div style={rowStyle}>
          {(['compact', 'balanced', 'spacious'] as PageSpacing[]).map(v => (
            <button key={v} type="button" onClick={() => onChange({ ...controls, pageSpacing: v })} style={chip(controls.pageSpacing === v)}>{v}</button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Writing</div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Font size</span><input type="range" min={13} max={20} step={0.5} value={controls.fontSize} onChange={e => onChange({ ...controls, fontSize: Number(e.target.value) })} /></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Line height</span><input type="range" min={1.4} max={2.3} step={0.05} value={controls.lineHeight} onChange={e => onChange({ ...controls, lineHeight: Number(e.target.value) })} /></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Writing width</span><input type="range" min={520} max={920} step={10} value={controls.writingWidth} onChange={e => onChange({ ...controls, writingWidth: Number(e.target.value) })} /></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Keep lists visible while typing</span><button type="button" onClick={() => toggle('keepListsVisibleWhileTyping')} style={chip(controls.keepListsVisibleWhileTyping)}>{controls.keepListsVisibleWhileTyping ? 'On' : 'Off'}</button></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>RTL/Hebrew assist</span><button type="button" onClick={() => toggle('rtlAssist')} style={chip(controls.rtlAssist)}>{controls.rtlAssist ? 'On' : 'Off'}</button></div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Equations</div>
        <div style={rowStyle}>
          {(['small', 'medium', 'large'] as EquationSize[]).map(v => (
            <button key={v} type="button" onClick={() => onChange({ ...controls, equationSize: v })} style={chip(controls.equationSize === v)}>{v}</button>
          ))}
        </div>
        <div style={rowStyle}>
          {(['center', 'left'] as EquationAlignment[]).map(v => (
            <button key={v} type="button" onClick={() => onChange({ ...controls, equationAlignment: v })} style={chip(controls.equationAlignment === v)}>{v === 'center' ? 'Centered' : 'Left'}</button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Focus</div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Hide References</span><button type="button" onClick={() => toggle('hideReferences')} style={chip(controls.hideReferences)}>{controls.hideReferences ? 'On' : 'Off'}</button></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Hide Scratch</span><button type="button" onClick={() => toggle('hideScratch')} style={chip(controls.hideScratch)}>{controls.hideScratch ? 'On' : 'Off'}</button></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Dim environment</span><button type="button" onClick={() => toggle('dimEnvironment')} style={chip(controls.dimEnvironment)}>{controls.dimEnvironment ? 'On' : 'Off'}</button></div>
        <div style={rowStyle}><span style={{ fontSize: 12, color: tokens.textMuted }}>Deep Focus mode</span><button type="button" onClick={() => toggle('deepFocus')} style={chip(controls.deepFocus)}>{controls.deepFocus ? 'On' : 'Off'}</button></div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Notebook Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={onRename} style={chip(false)}>Rename</button>
          <button type="button" onClick={onDuplicate} style={chip(false)}>Duplicate</button>
          <button type="button" onClick={onCopy} style={chip(false)}>Copy</button>
          <button type="button" onClick={onExport} style={chip(false)}>Export .txt</button>
        </div>
      </div>
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
  tokens, sectionId, sectionTitle: _st, paddingTop = 52, controlsOpen = false, onControlsOpenChange,
}: MathZoneProps) {
  const {
    index, data, activeNotebook,
    updateNotebookData, createNotebook, switchNotebook, renameNotebook, duplicateNotebook,
  } = useNotebooks(sectionId);
  const [showShelf, setShowShelf] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const writingSurfaceRef = useRef<HTMLDivElement>(null);
  const flushEditorRef = useRef<(() => void) | null>(null);

  const activePage = useMemo(() => {
    return data.pages.find(p => p.id === data.activePageId) ?? data.pages[0];
  }, [data.pages, data.activePageId]);
  const activePageId = activePage?.id ?? '';
  const activePageContent = activePage?.content ?? '';

  const [editing,   setEditing]   = useState(false);
  const [leftOpen,  setLeftOpen]  = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [showHelp,  setShowHelp]  = useState(false);
  const [controls, setControls] = useState<NotebookControlsState>(() => loadControls(sectionId, activeNotebook.id));

  useEffect(() => {
    setControls(loadControls(sectionId, activeNotebook.id));
  }, [sectionId, activeNotebook.id]);

  useEffect(() => {
    saveControls(sectionId, activeNotebook.id, controls);
  }, [sectionId, activeNotebook.id, controls]);

  const persistPageResume = (pageId: string, patch: Partial<NotebookPageResume>) => {
    updateNotebookData(current => ({
      ...current,
      pageResume: {
        ...current.pageResume,
        [pageId]: {
          scrollTop: current.pageResume[pageId]?.scrollTop ?? 0,
          lastEditing: current.pageResume[pageId]?.lastEditing ?? false,
          ...patch,
        },
      },
    }));
  };

  // Restore edit mode only on notebook/page navigation — never from content changes.
  useEffect(() => {
    if (!activePageId) return;
    setEditing(Boolean(data.pageResume[activePageId]?.lastEditing));
  }, [activeNotebook.id, activePageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !activePageId) return;
    const nextTop = data.pageResume[activePageId]?.scrollTop ?? 0;
    node.scrollTo({ top: nextTop, behavior: 'auto' });
  }, [activePageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterEdit = () => {
    setEditing(true);
    if (activePageId) persistPageResume(activePageId, { lastEditing: true });
  };

  const exitEdit = () => {
    setEditing(false);
    if (activePageId) persistPageResume(activePageId, { lastEditing: false });
  };

  const handleWritingSurfaceBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const related = e.relatedTarget;
    // Defer past toolbar mousedown/command so exitEdit does not unmount the editor mid-command.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (tiptapToolbarBusyRef.current) return;
        const active = document.activeElement;
        if (active && writingSurfaceRef.current?.contains(active)) return;
        if (related instanceof Node && writingSurfaceRef.current?.contains(related)) return;
        const prose = writingSurfaceRef.current?.querySelector('.ProseMirror');
        if (prose && document.activeElement === prose) return;
        if (isTiptapFormatToolbarNode(active) || isTiptapFormatToolbarNode(related)) return;
        exitEdit();
      });
    });
  };

  const flushActiveEditor = () => {
    flushEditorRef.current?.();
  };

  const handleSwitchNotebook = (id: string) => {
    if (editing) flushActiveEditor();
    const currentScroll = scrollRef.current?.scrollTop ?? 0;
    if (activePageId) persistPageResume(activePageId, { scrollTop: currentScroll, lastEditing: false });
    switchNotebook(id);
    setShowShelf(false);
  };

  const setActivePage = (pageId: string) => {
    if (!pageId || pageId === activePageId) return;
    if (editing) flushActiveEditor();
    const currentScroll = scrollRef.current?.scrollTop ?? 0;
    if (activePageId) persistPageResume(activePageId, { scrollTop: currentScroll, lastEditing: false });
    updateNotebookData(current => ({
      ...current,
      activePageId: pageId,
      content: current.pages.find(p => p.id === pageId)?.content ?? '',
    }));
  };

  const createPage = () => {
    const id = `page-${Date.now()}`;
    const now = Date.now();
    updateNotebookData(current => {
      const activeIdx = current.pages.findIndex(p => p.id === current.activePageId);
      const nextTitle = `Page ${current.pages.length + 1}`;
      const nextPage: NotebookPage = { id, title: nextTitle, content: '', createdAt: now, updatedAt: now };
      const pages = [...current.pages];
      if (activeIdx >= 0) pages.splice(activeIdx + 1, 0, nextPage);
      else pages.push(nextPage);
      return {
        ...current,
        pages,
        activePageId: id,
        content: '',
        pageResume: {
          ...current.pageResume,
          [id]: { scrollTop: 0, lastEditing: true },
        },
      };
    });
    setEditing(true);
  };

  const renamePage = (pageId: string, title: string) => {
    updateNotebookData(current => ({
      ...current,
      pages: current.pages.map(p => p.id === pageId ? { ...p, title: title.trim() || 'Untitled page', updatedAt: Date.now() } : p),
    }));
  };

  const toggleLeft  = () => setLeftOpen(v  => { const next = !v;  if (next) setRightOpen(false); return next; });
  const toggleRight = () => setRightOpen(v => { const next = !v; if (next) setLeftOpen(false);  return next; });

  const shouldHideRefs = controls.hideReferences || controls.deepFocus;
  const shouldHideScratch = controls.hideScratch || controls.deepFocus;
  const effectiveLeftOpen = shouldHideRefs ? false : leftOpen;
  const effectiveRightOpen = shouldHideScratch ? false : rightOpen;

  useEffect(() => {
    if (shouldHideRefs) setLeftOpen(false);
    if (shouldHideScratch) setRightOpen(false);
  }, [shouldHideRefs, shouldHideScratch]);

  const addRef      = () => updateNotebookData(d => ({ ...d, refs: [...d.refs, { id: `ref-${Date.now()}`, content: '' }] }));
  const updateRef   = (id: string, c: string) => updateNotebookData(d => ({ ...d, refs: d.refs.map(r => r.id === id ? { ...r, content: c } : r) }));
  const removeRef   = (id: string) => updateNotebookData(d => ({ ...d, refs: d.refs.filter(r => r.id !== id) }));

  const addScratch    = () => updateNotebookData(d => ({ ...d, scratches: [...d.scratches, { id: `scratch-${Date.now()}`, content: '' }] }));
  const updateScratch = (id: string, c: string) => updateNotebookData(d => ({ ...d, scratches: d.scratches.map(s => s.id === id ? { ...s, content: c } : s) }));
  const removeScratch = (id: string) => updateNotebookData(d => ({ ...d, scratches: d.scratches.filter(s => s.id !== id) }));

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

  const densityOpacity = controls.pageDensity === 'light' ? 0.06 : controls.pageDensity === 'dense' ? 0.14 : 0.1;
  const densityStep = controls.pageDensity === 'light' ? 24 : controls.pageDensity === 'dense' ? 14 : 18;
  const pageBackgroundImage =
    controls.pageBackground === 'blank'
      ? undefined
      : controls.pageBackground === 'grid'
        ? `linear-gradient(rgba(255,255,255,${densityOpacity}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,${densityOpacity}) 1px, transparent 1px)`
        : controls.pageBackground === 'ruled'
          ? `linear-gradient(rgba(255,255,255,${densityOpacity}) 1px, transparent 1px)`
          : `radial-gradient(circle, rgba(255,255,255,${densityOpacity}) 1px, transparent 1px)`;
  const pageBackgroundSize =
    controls.pageBackground === 'grid'
      ? `${densityStep}px ${densityStep}px`
      : controls.pageBackground === 'ruled'
        ? `100% ${Math.max(18, densityStep)}px`
        : `${densityStep}px ${densityStep}px`;
  const notebookMaxWidth = controls.notebookWidth === 'narrow' ? 560 : controls.notebookWidth === 'wide' ? 860 : 700;
  const pagePaddingY = controls.pageSpacing === 'compact' ? '26px 40px 30px' : controls.pageSpacing === 'spacious' ? '78px 64px 112px' : '44px 52px 64px';
  const notebookOpacity = controls.deepFocus ? 1 : controls.dimEnvironment ? 0.98 : 1;
  const notebookScale = controls.deepFocus ? 1.01 : 1;
  const helpButtonOpacity = controls.deepFocus ? 0.08 : undefined;
  const pageTitleOpacity = controls.deepFocus ? 0.82 : 1;
  const pageTitleFilter = controls.deepFocus ? 'drop-shadow(0 0 20px rgba(0,0,0,0.45))' : undefined;
  const proseStyleOverride: React.CSSProperties = {
    fontSize: controls.fontSize,
    lineHeight: controls.lineHeight,
  };
  const handleRenameNotebook = () => {
    const next = window.prompt('Rename notebook', activeNotebook.title || 'Untitled');
    if (next == null) return;
    renameNotebook(activeNotebook.id, next.trim() || 'Untitled');
  };
  const handleDuplicateNotebook = () => {
    duplicateNotebook(activeNotebook.id);
  };
  const handleCopyNotebook = async () => {
    try { await navigator.clipboard.writeText(activePageContent); } catch { /* ignore */ }
  };
  const handleExportNotebook = () => {
    const flattened = data.pages.map(p => `# ${p.title}\n\n${p.content}`).join('\n\n');
    const blob = new Blob([flattened], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(activeNotebook.title || 'notebook').replace(/[^a-z0-9-_]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      backgroundColor: tokens.pageBg, paddingTop, overflow: 'hidden',
    }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

        {!shouldHideRefs && <EdgeTab side="left"  label="REFS"    open={effectiveLeftOpen}  tokens={tokens} onClick={toggleLeft}  />}
        {!shouldHideScratch && <EdgeTab side="right" label="SCRATCH" open={effectiveRightOpen} tokens={tokens} onClick={toggleRight} />}

        {/* Notebook page — anchored, never reflowed */}
        <div style={{
          position: 'absolute', inset: '0 16px',
          display: 'flex', flexDirection: 'column',
          backgroundColor: tokens.pageBg,
          backgroundImage: pageBackgroundImage,
          backgroundSize: pageBackgroundImage ? pageBackgroundSize : undefined,
          opacity: notebookOpacity,
          transform: `scale(${notebookScale})`,
          transformOrigin: '50% 52%',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          overflow: 'hidden', zIndex: 1,
        }}>
          {/* "?" help button */}
          <button type="button"
            onClick={() => setShowHelp(v => !v)}
            title="Notebook writing guide"
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
              ...(helpButtonOpacity != null ? { opacity: helpButtonOpacity } : {}),
            }}>?</button>

          {showHelp && <HelpPanel tokens={tokens} onClose={() => setShowHelp(false)} />}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: 'auto' }}
            onScroll={() => {
              if (!activePageId) return;
              const top = scrollRef.current?.scrollTop ?? 0;
              persistPageResume(activePageId, { scrollTop: top });
            }}
          >
            <div style={{ maxWidth: notebookMaxWidth, margin: '0 auto', padding: pagePaddingY, width: '100%', opacity: pageTitleOpacity, filter: pageTitleFilter }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setShowShelf(v => !v)}
                  style={{
                    border: `1px solid ${tokens.cardBorder}`,
                    borderRadius: 999,
                    background: `${tokens.wellBg}88`,
                    color: tokens.textMuted,
                    fontSize: 11,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontFamily: 'var(--fw-font-body)',
                  }}
                >
                  Open Notebook
                </button>
                <button
                  type="button"
                  onClick={createPage}
                  style={{
                    border: `1px solid ${tokens.cardBorder}`,
                    borderRadius: 999,
                    background: `${tokens.wellBg}88`,
                    color: tokens.textMuted,
                    fontSize: 11,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontFamily: 'var(--fw-font-body)',
                  }}
                >
                  + Page
                </button>
              </div>

              <PageTitle
                notebook={activeNotebook}
                allNotebooks={index.notebooks}
                tokens={tokens}
                onRename={renameNotebook}
                onSwitch={handleSwitchNotebook}
                onCreate={createNotebook}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: -18, marginBottom: 28 }}>
                {data.pages.map(page => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setActivePage(page.id)}
                    onDoubleClick={() => {
                      const next = window.prompt('Rename page', page.title);
                      if (next != null) renamePage(page.id, next);
                    }}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${page.id === activePageId ? `${tokens.accent}66` : tokens.cardBorder}`,
                      background: page.id === activePageId ? `${tokens.accent}1c` : `${tokens.wellBg}70`,
                      color: page.id === activePageId ? tokens.accent : tokens.textMuted,
                      fontSize: 11,
                      padding: '5px 10px',
                      cursor: 'pointer',
                      fontFamily: 'var(--fw-font-body)',
                    }}
                    title="Double-click to rename page"
                  >
                    {page.title}
                  </button>
                ))}
              </div>

              {editing ? (
                <div
                  ref={writingSurfaceRef}
                  onBlur={handleWritingSurfaceBlur}
                  style={{ maxWidth: controls.writingWidth, margin: '0 auto' }}
                >
                  <TiptapWritingArea
                    key={activePageId}
                    content={activePageContent}
                    tokens={tokens}
                    flushRef={flushEditorRef}
                    onChange={c => updateNotebookData(d => ({
                      ...d,
                      content: c,
                      pages: d.pages.map(p => p.id === activePageId ? { ...p, content: c, updatedAt: Date.now() } : p),
                    }))}
                    controls={controls}
                  />
                </div>
              ) : (
                <div style={{ maxWidth: controls.writingWidth, margin: '0 auto', direction: controls.rtlAssist ? 'rtl' : 'ltr' }}>
                  <RenderedDocument
                    content={activePageContent}
                    tokens={tokens}
                    onClick={enterEdit}
                    proseStyleOverride={proseStyleOverride}
                    equationSize={controls.equationSize}
                    equationAlignment={controls.equationAlignment}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrim */}
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 35,
            opacity: (effectiveLeftOpen || effectiveRightOpen || controlsOpen || controls.dimEnvironment || controls.deepFocus) ? 1 : 0,
            pointerEvents: (effectiveLeftOpen || effectiveRightOpen || controlsOpen) ? 'auto' : 'none',
            background: controls.deepFocus ? 'rgba(2,4,9,0.64)' : controls.dimEnvironment ? 'rgba(2,4,9,0.38)' : 'rgba(0,0,0,0.22)',
            transition: 'opacity 0.22s',
          }}
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
            if (controlsOpen) onControlsOpenChange?.(false);
          }}
        />

        {controlsOpen && (
          <NotebookControlsPanel
            tokens={tokens}
            controls={controls}
            onChange={setControls}
            onClose={() => onControlsOpenChange?.(false)}
            onRename={handleRenameNotebook}
            onDuplicate={handleDuplicateNotebook}
            onCopy={handleCopyNotebook}
            onExport={handleExportNotebook}
          />
        )}
        {showShelf && (
          <NotebookShelf
            tokens={tokens}
            notebooks={index.notebooks}
            activeNotebookId={activeNotebook.id}
            onClose={() => setShowShelf(false)}
            onSwitch={handleSwitchNotebook}
            onCreate={createNotebook}
            onRename={renameNotebook}
          />
        )}

        {/* Left drawer */}
        {!shouldHideRefs && <div style={{
          position: 'absolute', left: 16, top: 0, bottom: 0, width: 280, zIndex: 40,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: tokens.cardBg, borderRight: `1px solid ${tokens.cardBorder}`,
          transform: effectiveLeftOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        }}>
          <ZoneHeader label="References" description="Theorem · Formula · Hint" tokens={tokens} />
          {refsContent}
        </div>}

        {/* Right drawer */}
        {!shouldHideScratch && <div style={{
          position: 'absolute', right: 16, top: 0, bottom: 0, width: 260, zIndex: 40,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: tokens.cardBg, borderLeft: `1px solid ${tokens.cardBorder}`,
          transform: effectiveRightOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        }}>
          <ZoneHeader label="Scratch" description="Explore freely." tokens={tokens} />
          {scratchContent}
        </div>}

      </div>
    </div>
  );
}
