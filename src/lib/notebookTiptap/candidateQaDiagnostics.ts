/**
 * DEV-only Notebook QA Diagnostics.
 * Captures in-memory render state and transition trace for the TipTap Candidate.
 * All body strings are strictly prefix-limited (max 30 characters).
 * All full text representations are hashed deterministically and non-reversibly.
 * NO full user content is ever exposed.
 */

import type { NotebookPage, NotebookContentWithPages } from '../notebookPages/types';
import { decodeNotebookTextV1 } from '../notebookTextCodec';

declare const __GIT_COMMIT__: string;

export const QA_SENTINEL_PAGE_1 = 'Page 1 unique content';
export const QA_SENTINEL_PAGE_2 = 'Page 2 unique content';

export function safePrefix(str: string | null | undefined, max = 30): string {
  if (typeof str !== 'string') return '';
  return str.slice(0, max);
}

/**
 * Deterministic, non-reversible 32-bit FNV-1a hash formatted as a safe diagnostic string.
 * Never exposes raw user text.
 */
export function safeDeterministicHash(str: string | null | undefined): string {
  if (typeof str !== 'string') return 'none';
  if (str.length === 0) return 'empty';
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return 'h_' + (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Counts top-level blocks in a Notebook body without exposing text.
 */
export function getBodyBlockCount(body: string | null | undefined): number {
  if (typeof body !== 'string' || body.length === 0) return 0;
  try {
    if (body.includes('~nb1:')) {
      return decodeNotebookTextV1(body).length;
    }
  } catch {
    // If malformed or partial, count non-empty lines as fallback
  }
  return body.split(/\r?\n/).filter(line => line.trim().length > 0).length;
}

/**
 * Safe fixed QA sentinel checks returning booleans only.
 */
export function checkSentinels(str: string | null | undefined): {
  containsQaPage1Sentinel: boolean;
  containsQaPage2Sentinel: boolean;
} {
  if (typeof str !== 'string') {
    return { containsQaPage1Sentinel: false, containsQaPage2Sentinel: false };
  }
  return {
    containsQaPage1Sentinel: str.includes(QA_SENTINEL_PAGE_1),
    containsQaPage2Sentinel: str.includes(QA_SENTINEL_PAGE_2),
  };
}

export interface NotebookBodyDiagMeta {
  bodyLength: number;
  bodyHash: string;
  bodyBlockCount: number;
  containsQaPage1Sentinel: boolean;
  containsQaPage2Sentinel: boolean;
}

export function extractBodyDiagMeta(body: string | null | undefined): NotebookBodyDiagMeta {
  const str = typeof body === 'string' ? body : '';
  const sentinels = checkSentinels(str);
  return {
    bodyLength: str.length,
    bodyHash: safeDeterministicHash(body),
    bodyBlockCount: getBodyBlockCount(body),
    containsQaPage1Sentinel: sentinels.containsQaPage1Sentinel,
    containsQaPage2Sentinel: sentinels.containsQaPage2Sentinel,
  };
}

export interface NotebookQaDiagPageSummary {
  id: string;
  kind: string;
  documentBodyPrefix: string | null;
  documentBodyCodecVersion: number | null;
  documentBodyLength: number;
  documentBodyHash: string;
  documentBodyBlockCount: number;
  containsQaPage1Sentinel: boolean;
  containsQaPage2Sentinel: boolean;
}

export function summarizeDiagPages(pages: NotebookPage[] | undefined): NotebookQaDiagPageSummary[] {
  if (!pages) return [];
  return pages.map(p => {
    const isDoc = p.kind === 'document';
    const body = isDoc ? (p.documentBody ?? '') : null;
    const meta = extractBodyDiagMeta(body);
    return {
      id: p.id,
      kind: p.kind,
      documentBodyPrefix: isDoc ? safePrefix(p.documentBody) : null,
      documentBodyCodecVersion: isDoc ? (p.documentBodyCodecVersion ?? null) : null,
      documentBodyLength: isDoc ? meta.bodyLength : 0,
      documentBodyHash: isDoc ? meta.bodyHash : 'none',
      documentBodyBlockCount: isDoc ? meta.bodyBlockCount : 0,
      containsQaPage1Sentinel: isDoc ? meta.containsQaPage1Sentinel : false,
      containsQaPage2Sentinel: isDoc ? meta.containsQaPage2Sentinel : false,
    };
  });
}

export interface NotebookQaDiagEditorState {
  mounted: boolean;
  editorTextLength: number;
  editorDocHash: string;
  editorBlockCount: number;
  containsQaPage1Sentinel: boolean;
  containsQaPage2Sentinel: boolean;
}

export function extractEditorDiagState(editor?: any): NotebookQaDiagEditorState {
  const isMounted = Boolean(editor && !editor.isDestroyed);
  if (!isMounted) {
    return {
      mounted: false,
      editorTextLength: 0,
      editorDocHash: 'unmounted',
      editorBlockCount: 0,
      containsQaPage1Sentinel: false,
      containsQaPage2Sentinel: false,
    };
  }
  const text = editor.state?.doc?.textContent ?? '';
  const blockCount = editor.state?.doc?.childCount ?? 0;
  let docHash = 'empty';
  try {
    const json = editor.getJSON();
    docHash = safeDeterministicHash(JSON.stringify(json));
  } catch {
    docHash = 'hash-error';
  }
  return {
    mounted: true,
    editorTextLength: text.length,
    editorDocHash: docHash,
    editorBlockCount: blockCount,
    containsQaPage1Sentinel: text.includes(QA_SENTINEL_PAGE_1),
    containsQaPage2Sentinel: text.includes(QA_SENTINEL_PAGE_2),
  };
}

export interface NotebookTransitionTraceEntry {
  timestamp: number;
  stage: string;
  propsBodyCodecVersion: number | null;
  propsPageCodecVersion: number | null;
  overlayBodyCodecVersion: number | null;
  overlayPageCodecVersion: number | null;
  effectiveBodyCodecVersion: number | null;
  effectivePageCodecVersion: number | null;
  propsActivePageId: string | null;
  overlayActivePageId: string | null;
  effectiveActivePageId: string | null;
  pageKey: string;
  sourceBodyCodecVersion: number | null;
  bodyPrefix: string;
  pageBodyPrefix: string;
  propsPageBodyHash: string;
  overlayPageBodyHash: string;
  effectivePageBodyHash: string;
  sourceBodyHash: string;
  editorDocHash: string;
  effectivePageContainsQaPage1Sentinel: boolean;
  effectivePageContainsQaPage2Sentinel: boolean;
  sourceContainsQaPage1Sentinel: boolean;
  sourceContainsQaPage2Sentinel: boolean;
  editorContainsQaPage1Sentinel: boolean;
  editorContainsQaPage2Sentinel: boolean;
}

export interface NotebookQaDiagPropsContent {
  activePageId?: string;
  activeSectionId?: string;
  body?: string;
  bodyCodecVersion?: number;
  pages?: NotebookPage[];
}

export interface NotebookQaDiagOverlay {
  activePageId?: string;
  activeSectionId?: string;
  body?: string;
  bodyCodecVersion?: number;
  _localGen?: number;
  pages?: NotebookPage[];
}

export interface NotebookQaDiagContext {
  objectId: string;
  propsContent: NotebookQaDiagPropsContent;
  migratedContent: NotebookContentWithPages;
  navigationOverlay: NotebookQaDiagOverlay | null;
  effectiveContent: NotebookQaDiagPropsContent;
  resolvedNavigation: {
    activePageId: string | null;
    activeSectionId: string | null;
  };
}

export interface NotebookQaDiagSnapshot {
  build: {
    commit: string;
    env: string;
  };
  object: {
    objectId: string;
  };
  propsContent: {
    activePageId: string | null;
    activeSectionId: string | null;
    bodyPrefix: string;
    bodyCodecVersion: number | null;
    bodyLength: number;
    bodyHash: string;
    bodyBlockCount: number;
    containsQaPage1Sentinel: boolean;
    containsQaPage2Sentinel: boolean;
    pages: NotebookQaDiagPageSummary[];
  };
  migratedContent: {
    activePageId: string | null;
    activeSectionId: string | null;
    bodyPrefix: string;
    bodyCodecVersion: number | null;
    bodyLength: number;
    bodyHash: string;
    bodyBlockCount: number;
    containsQaPage1Sentinel: boolean;
    containsQaPage2Sentinel: boolean;
    pages: NotebookQaDiagPageSummary[];
  };
  navigationOverlay: {
    exists: boolean;
    activePageId: string | null;
    activeSectionId: string | null;
    bodyPrefix: string;
    bodyCodecVersion: number | null;
    localGen: number | null;
    bodyLength: number;
    bodyHash: string;
    bodyBlockCount: number;
    containsQaPage1Sentinel: boolean;
    containsQaPage2Sentinel: boolean;
    pages: NotebookQaDiagPageSummary[];
  };
  effectiveContent: {
    activePageId: string | null;
    activeSectionId: string | null;
    bodyPrefix: string;
    bodyCodecVersion: number | null;
    bodyLength: number;
    bodyHash: string;
    bodyBlockCount: number;
    containsQaPage1Sentinel: boolean;
    containsQaPage2Sentinel: boolean;
    pages: NotebookQaDiagPageSummary[];
  };
  resolvedNavigation: {
    activePageId: string | null;
    activeSectionId: string | null;
  };
  candidate: {
    pageKey: string;
    sourceBodyPrefix: string;
    sourceBodyCodecVersion: number | null;
    sourceBodyLength: number;
    sourceBodyHash: string;
    sourceBodyBlockCount: number;
    containsQaPage1Sentinel: boolean;
    containsQaPage2Sentinel: boolean;
    failClosed: boolean;
    failClosedMessage: string | null;
    editor: NotebookQaDiagEditorState;
  };
  transitionTrace: NotebookTransitionTraceEntry[];
}

// In-memory DEV-only ring buffer per objectId (max 50 entries each)
const MAX_TRACE_ENTRIES = 50;
const traceBuffers = new Map<string, NotebookTransitionTraceEntry[]>();

export function getTraceBuffer(objectId: string): NotebookTransitionTraceEntry[] {
  let buf = traceBuffers.get(objectId);
  if (!buf) {
    buf = [];
    traceBuffers.set(objectId, buf);
  }
  return buf;
}

export function clearTraceBuffer(objectId: string): void {
  traceBuffers.delete(objectId);
}

export function recordTransitionIfNeeded(
  ctx: NotebookQaDiagContext,
  candidate: {
    pageKey: string;
    sourceBody: string;
    sourceBodyCodecVersion?: number;
    failClosed: boolean;
  },
  stage = 'render',
  editor?: any,
): void {
  const buf = getTraceBuffer(ctx.objectId);

  const targetPageId =
    candidate.pageKey !== 'legacy-body'
      ? candidate.pageKey
      : ctx.resolvedNavigation.activePageId ?? 'page-1';

  const propsPage = (ctx.propsContent.pages ?? []).find(p => p.id === targetPageId);
  const overlayPage = (ctx.navigationOverlay?.pages ?? []).find(p => p.id === targetPageId);
  const effectivePage = (ctx.effectiveContent.pages ?? []).find(p => p.id === targetPageId);

  const propsPageBody = propsPage?.kind === 'document' ? propsPage.documentBody : null;
  const overlayPageBody = overlayPage?.kind === 'document' ? overlayPage.documentBody : null;
  const effectivePageBody = effectivePage?.kind === 'document' ? effectivePage.documentBody : (ctx.effectiveContent.body ?? null);

  const propsPageBodyHash = safeDeterministicHash(propsPageBody);
  const overlayPageBodyHash = safeDeterministicHash(overlayPageBody);
  const effectivePageBodyHash = safeDeterministicHash(effectivePageBody);
  const sourceBodyHash = safeDeterministicHash(candidate.sourceBody);

  const editorState = extractEditorDiagState(editor);
  const effectivePageSentinels = checkSentinels(effectivePageBody);
  const sourceSentinels = checkSentinels(candidate.sourceBody);

  const currentEntry: NotebookTransitionTraceEntry = {
    timestamp: Date.now(),
    stage,
    propsBodyCodecVersion: ctx.propsContent.bodyCodecVersion ?? null,
    propsPageCodecVersion: propsPage?.kind === 'document' ? (propsPage.documentBodyCodecVersion ?? null) : null,
    overlayBodyCodecVersion: ctx.navigationOverlay?.bodyCodecVersion ?? null,
    overlayPageCodecVersion: overlayPage?.kind === 'document' ? (overlayPage.documentBodyCodecVersion ?? null) : null,
    effectiveBodyCodecVersion: ctx.effectiveContent.bodyCodecVersion ?? null,
    effectivePageCodecVersion: effectivePage?.kind === 'document' ? (effectivePage.documentBodyCodecVersion ?? null) : null,
    propsActivePageId: ctx.propsContent.activePageId ?? null,
    overlayActivePageId: ctx.navigationOverlay?.activePageId ?? null,
    effectiveActivePageId: ctx.effectiveContent.activePageId ?? null,
    pageKey: candidate.pageKey,
    sourceBodyCodecVersion: candidate.sourceBodyCodecVersion ?? null,
    bodyPrefix: safePrefix(ctx.effectiveContent.body),
    pageBodyPrefix: safePrefix(effectivePageBody),
    propsPageBodyHash,
    overlayPageBodyHash,
    effectivePageBodyHash,
    sourceBodyHash,
    editorDocHash: editorState.editorDocHash,
    effectivePageContainsQaPage1Sentinel: effectivePageSentinels.containsQaPage1Sentinel,
    effectivePageContainsQaPage2Sentinel: effectivePageSentinels.containsQaPage2Sentinel,
    sourceContainsQaPage1Sentinel: sourceSentinels.containsQaPage1Sentinel,
    sourceContainsQaPage2Sentinel: sourceSentinels.containsQaPage2Sentinel,
    editorContainsQaPage1Sentinel: editorState.containsQaPage1Sentinel,
    editorContainsQaPage2Sentinel: editorState.containsQaPage2Sentinel,
  };

  const last = buf[buf.length - 1];
  const changed =
    !last ||
    last.propsBodyCodecVersion !== currentEntry.propsBodyCodecVersion ||
    last.propsActivePageId !== currentEntry.propsActivePageId ||
    last.propsPageCodecVersion !== currentEntry.propsPageCodecVersion ||
    last.overlayBodyCodecVersion !== currentEntry.overlayBodyCodecVersion ||
    last.overlayActivePageId !== currentEntry.overlayActivePageId ||
    last.effectiveBodyCodecVersion !== currentEntry.effectiveBodyCodecVersion ||
    last.effectiveActivePageId !== currentEntry.effectiveActivePageId ||
    last.pageKey !== currentEntry.pageKey ||
    last.sourceBodyCodecVersion !== currentEntry.sourceBodyCodecVersion ||
    last.propsPageBodyHash !== currentEntry.propsPageBodyHash ||
    last.overlayPageBodyHash !== currentEntry.overlayPageBodyHash ||
    last.effectivePageBodyHash !== currentEntry.effectivePageBodyHash ||
    last.sourceBodyHash !== currentEntry.sourceBodyHash ||
    last.editorDocHash !== currentEntry.editorDocHash ||
    (last.stage === 'fail-closed') !== candidate.failClosed;

  if (changed) {
    if (candidate.failClosed && currentEntry.stage === 'render') {
      currentEntry.stage = 'fail-closed';
    }
    buf.push(currentEntry);
    if (buf.length > MAX_TRACE_ENTRIES) {
      buf.shift();
    }
  }
}

export function buildNotebookQaDiagSnapshot(
  ctx: NotebookQaDiagContext,
  candidate: {
    pageKey: string;
    sourceBody: string;
    sourceBodyCodecVersion?: number;
    failClosed: boolean;
    failClosedMessage?: string | null;
  },
  editor?: any,
): NotebookQaDiagSnapshot {
  let commit = 'unknown';
  try {
    if (typeof __GIT_COMMIT__ !== 'undefined' && __GIT_COMMIT__) {
      commit = __GIT_COMMIT__;
    }
  } catch {
    /* ignore */
  }

  const env =
    typeof import.meta !== 'undefined' && import.meta.env?.MODE
      ? import.meta.env.MODE
      : 'development';

  const trace = getTraceBuffer(ctx.objectId);

  const propsBodyMeta = extractBodyDiagMeta(ctx.propsContent.body);
  const migratedBodyMeta = extractBodyDiagMeta(ctx.migratedContent.body);
  const overlayBodyMeta = extractBodyDiagMeta(ctx.navigationOverlay?.body);
  const effectiveBodyMeta = extractBodyDiagMeta(ctx.effectiveContent.body);
  const candidateBodyMeta = extractBodyDiagMeta(candidate.sourceBody);
  const editorState = extractEditorDiagState(editor);

  return {
    build: {
      commit,
      env,
    },
    object: {
      objectId: ctx.objectId,
    },
    propsContent: {
      activePageId: ctx.propsContent.activePageId ?? null,
      activeSectionId: ctx.propsContent.activeSectionId ?? null,
      bodyPrefix: safePrefix(ctx.propsContent.body),
      bodyCodecVersion: ctx.propsContent.bodyCodecVersion ?? null,
      bodyLength: propsBodyMeta.bodyLength,
      bodyHash: propsBodyMeta.bodyHash,
      bodyBlockCount: propsBodyMeta.bodyBlockCount,
      containsQaPage1Sentinel: propsBodyMeta.containsQaPage1Sentinel,
      containsQaPage2Sentinel: propsBodyMeta.containsQaPage2Sentinel,
      pages: summarizeDiagPages(ctx.propsContent.pages),
    },
    migratedContent: {
      activePageId: ctx.migratedContent.activePageId ?? null,
      activeSectionId: ctx.migratedContent.activeSectionId ?? null,
      bodyPrefix: safePrefix(ctx.migratedContent.body),
      bodyCodecVersion: ctx.migratedContent.bodyCodecVersion ?? null,
      bodyLength: migratedBodyMeta.bodyLength,
      bodyHash: migratedBodyMeta.bodyHash,
      bodyBlockCount: migratedBodyMeta.bodyBlockCount,
      containsQaPage1Sentinel: migratedBodyMeta.containsQaPage1Sentinel,
      containsQaPage2Sentinel: migratedBodyMeta.containsQaPage2Sentinel,
      pages: summarizeDiagPages(ctx.migratedContent.pages),
    },
    navigationOverlay: {
      exists: Boolean(ctx.navigationOverlay),
      activePageId: ctx.navigationOverlay?.activePageId ?? null,
      activeSectionId: ctx.navigationOverlay?.activeSectionId ?? null,
      bodyPrefix: safePrefix(ctx.navigationOverlay?.body),
      bodyCodecVersion: ctx.navigationOverlay?.bodyCodecVersion ?? null,
      localGen: ctx.navigationOverlay?._localGen ?? null,
      bodyLength: overlayBodyMeta.bodyLength,
      bodyHash: overlayBodyMeta.bodyHash,
      bodyBlockCount: overlayBodyMeta.bodyBlockCount,
      containsQaPage1Sentinel: overlayBodyMeta.containsQaPage1Sentinel,
      containsQaPage2Sentinel: overlayBodyMeta.containsQaPage2Sentinel,
      pages: summarizeDiagPages(ctx.navigationOverlay?.pages),
    },
    effectiveContent: {
      activePageId: ctx.effectiveContent.activePageId ?? null,
      activeSectionId: ctx.effectiveContent.activeSectionId ?? null,
      bodyPrefix: safePrefix(ctx.effectiveContent.body),
      bodyCodecVersion: ctx.effectiveContent.bodyCodecVersion ?? null,
      bodyLength: effectiveBodyMeta.bodyLength,
      bodyHash: effectiveBodyMeta.bodyHash,
      bodyBlockCount: effectiveBodyMeta.bodyBlockCount,
      containsQaPage1Sentinel: effectiveBodyMeta.containsQaPage1Sentinel,
      containsQaPage2Sentinel: effectiveBodyMeta.containsQaPage2Sentinel,
      pages: summarizeDiagPages(ctx.effectiveContent.pages as NotebookPage[] | undefined),
    },
    resolvedNavigation: {
      activePageId: ctx.resolvedNavigation.activePageId ?? null,
      activeSectionId: ctx.resolvedNavigation.activeSectionId ?? null,
    },
    candidate: {
      pageKey: candidate.pageKey,
      sourceBodyPrefix: safePrefix(candidate.sourceBody),
      sourceBodyCodecVersion: candidate.sourceBodyCodecVersion ?? null,
      sourceBodyLength: candidateBodyMeta.bodyLength,
      sourceBodyHash: candidateBodyMeta.bodyHash,
      sourceBodyBlockCount: candidateBodyMeta.bodyBlockCount,
      containsQaPage1Sentinel: candidateBodyMeta.containsQaPage1Sentinel,
      containsQaPage2Sentinel: candidateBodyMeta.containsQaPage2Sentinel,
      failClosed: candidate.failClosed,
      failClosedMessage: candidate.failClosedMessage ?? null,
      editor: editorState,
    },
    transitionTrace: [...trace],
  };
}
