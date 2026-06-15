/**
 * Local-only Pencil→text diagnostics. Enable: localStorage.setItem('inkPenTrace','1'); reload
 * Do NOT commit. Do not log secrets or full text bodies.
 */

import {
  isPenTextBlockActive,
  wasLastPointerPen,
} from './notebookInputPolicy';

export type InkPenTraceEntry = {
  t: number;
  kind: 'pointerdown' | 'beforeinput' | 'input' | 'policy' | 'focus';
  hypothesisId: string;
  surface: string;
  pointerType?: string;
  inputType?: string;
  dataLen?: number;
  inNbRoot: boolean;
  penBlock: boolean;
  rejected?: boolean;
  detail: string;
};

const MAX = 24;
const BUILD = 'c53ff75';

let surfaceSnap: Record<string, string | boolean> = {
  build: BUILD,
};

const buf: InkPenTraceEntry[] = [];

export function isInkPenTraceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem('inkPenTrace') === '1' ||
      new URLSearchParams(window.location.search).get('inkPenTrace') === '1'
    );
  } catch {
    return false;
  }
}

export function inkPenTraceSetSurface(patch: Record<string, string | boolean>): void {
  surfaceSnap = { ...surfaceSnap, build: BUILD, ...patch };
}

export function inkPenTraceGetSurface(): Record<string, string | boolean> {
  return { ...surfaceSnap };
}

export function inkPenTraceEntries(): InkPenTraceEntry[] {
  return [...buf];
}

function classifyTarget(el: Element): string {
  const rich = el.closest('[data-rich-editable="1"]');
  if (rich) {
    const bid = rich.getAttribute('data-block-id') ?? '?';
    return `RichEditableLine:${bid}`;
  }
  if (el.closest('[data-math-editor]')) return 'MathZone';
  if (el.closest('[data-nb-card-preview]')) return 'NotebookCardPreview';
  if (el.closest('[data-nb-editor-root="1"]')) return 'NotebookEditorOtherCE';
  if (el.closest('textarea')) return 'textarea';
  if (el.closest('input')) return 'input';
  const tag = el.tagName.toLowerCase();
  if (el instanceof HTMLElement && el.isContentEditable) return `contenteditable:${tag}`;
  if (el.getAttribute('contenteditable') !== null) return `contenteditable:${tag}`;
  return `element:${tag}`;
}

function inNotebookRoot(el: Element): boolean {
  return el.closest('[data-nb-editor-root="1"]') !== null;
}

function push(entry: InkPenTraceEntry): void {
  buf.push(entry);
  if (buf.length > MAX) buf.shift();
  if (typeof window !== 'undefined') {
    (window as unknown as { __inkPenTrace?: InkPenTraceEntry[] }).__inkPenTrace = [...buf];
  }
  // #region agent log
  if (typeof fetch !== 'undefined') {
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7407da' },
      body: JSON.stringify({
        sessionId: '7407da',
        hypothesisId: entry.hypothesisId,
        location: 'inkPenTrace',
        message: entry.kind,
        data: { ...entry, surfaceSnap },
        timestamp: entry.t,
      }),
    }).catch(() => {});
  }
  // #endregion
}

export function inkPenTrace(
  kind: InkPenTraceEntry['kind'],
  hypothesisId: string,
  detail: string,
  extra: Partial<InkPenTraceEntry> = {},
): void {
  if (!isInkPenTraceEnabled()) return;
  push({
    t: Date.now(),
    kind,
    hypothesisId,
    surface: extra.surface ?? '—',
    detail,
    inNbRoot: extra.inNbRoot ?? false,
    penBlock: isPenTextBlockActive(),
    ...extra,
  });
}

export function inkPenTracePolicy(
  inputType: string,
  rejected: boolean,
  surface: string,
): void {
  if (!isInkPenTraceEnabled()) return;
  inkPenTrace('policy', rejected ? 'D' : 'E', rejected ? 'rejected' : 'allowed', {
    surface,
    inputType,
    rejected,
    penBlock: isPenTextBlockActive(),
    detail: `lastPen=${wasLastPointerPen()} block=${isPenTextBlockActive()}`,
  });
}

let installed = false;

/** Document-wide capture — catches targets outside ProjectNotebookBlock. */
export function installInkPenTraceGlobal(): void {
  if (!isInkPenTraceEnabled() || installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener(
    'pointerdown',
    e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const ce = t.closest('[contenteditable], textarea, input');
      if (!ce) return;
      inkPenTrace('pointerdown', 'H1', 'pointer on text surface', {
        surface: classifyTarget(ce),
        pointerType: e.pointerType,
        inNbRoot: inNotebookRoot(ce),
      });
    },
    true,
  );

  document.addEventListener(
    'beforeinput',
    e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[contenteditable], textarea, input')) return;
      const ie = e as InputEvent;
      inkPenTrace('beforeinput', 'H3', 'beforeinput on text surface', {
        surface: classifyTarget(t),
        inputType: ie.inputType,
        dataLen: typeof ie.data === 'string' ? ie.data.length : undefined,
        inNbRoot: inNotebookRoot(t),
      });
    },
    true,
  );

  document.addEventListener(
    'input',
    e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[contenteditable], textarea, input')) return;
      const ie = e as InputEvent;
      inkPenTrace('input', 'H3', 'input committed on text surface', {
        surface: classifyTarget(t),
        inputType: ie.inputType,
        inNbRoot: inNotebookRoot(t),
      });
    },
    true,
  );

  document.addEventListener(
    'focusin',
    e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('[contenteditable], textarea, input')) return;
      inkPenTrace('focus', 'H6', 'focusin text surface', {
        surface: classifyTarget(t),
        inNbRoot: inNotebookRoot(t),
      });
    },
    true,
  );
}
