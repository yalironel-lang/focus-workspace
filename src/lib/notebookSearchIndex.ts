/**
 * Lightweight local notebook search — titles, subtitles, body text only.
 * Reads Free Space objects from localStorage (all boards per section).
 */

import {
  boardScopedFreeSpaceKeys,
  sectionBoardsListKey,
} from './freeSpacePersistence';
import { textMatchesQuery } from '../command/matchCommands';
import { stripInlineMarks } from './notebookInlineMarks';
import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

export interface NotebookSearchHit {
  sectionId: string;
  sectionTitle: string;
  boardId: string;
  boardName: string;
  objectId: string;
  title: string;
  subtitle?: string;
  updatedAt: number;
  bodyPlain: string;
}

export interface NotebookSearchSection {
  id: string;
  title: string;
}

const MAIN_BOARD = { id: 'main', name: 'Main' };

function loadBoards(sectionId: string): { id: string; name: string }[] {
  if (!sectionId) return [MAIN_BOARD];
  try {
    const raw = localStorage.getItem(sectionBoardsListKey(sectionId));
    if (!raw) return [MAIN_BOARD];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [MAIN_BOARD];
    const boards = parsed.filter(
      (b): b is { id: string; name: string } =>
        !!b &&
        typeof b === 'object' &&
        typeof (b as { id?: unknown }).id === 'string' &&
        typeof (b as { name?: unknown }).name === 'string',
    );
    return boards.some(b => b.id === 'main') ? boards : [MAIN_BOARD, ...boards];
  } catch {
    return [MAIN_BOARD];
  }
}

function loadObjects(sectionId: string, boardId: string): ProjectSpaceObject[] {
  if (!sectionId) return [];
  try {
    const raw = localStorage.getItem(boardScopedFreeSpaceKeys(sectionId, boardId).objects);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is ProjectSpaceObject =>
        !!o &&
        typeof o === 'object' &&
        typeof (o as ProjectSpaceObject).id === 'string' &&
        (o as ProjectSpaceObject).type === 'notebook',
    );
  } catch {
    return [];
  }
}

/** Strip markdown-lite / image refs for plain-text search. */
export function notebookBodyPlain(body: string): string {
  return body
    .split(/\r?\n/)
    .map(line => stripInlineMarks(line))
    .join('\n')
    .replace(/::img::[^:\n]+::/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatNotebookEditedAt(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function notebookSearchSnippet(bodyPlain: string, query: string, maxLen = 88): string {
  if (!bodyPlain) return '';
  const q = query.trim().toLowerCase();
  if (!q) return bodyPlain.slice(0, maxLen) + (bodyPlain.length > maxLen ? '…' : '');
  const lower = bodyPlain.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return bodyPlain.slice(0, maxLen) + (bodyPlain.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 24);
  const end = Math.min(bodyPlain.length, idx + q.length + 40);
  let s = bodyPlain.slice(start, end).trim();
  if (start > 0) s = `…${s}`;
  if (end < bodyPlain.length) s = `${s}…`;
  return s;
}

function scoreHit(hit: NotebookSearchHit, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return hit.updatedAt ? -hit.updatedAt : 0;
  const title = hit.title.toLowerCase();
  const sub = (hit.subtitle ?? '').toLowerCase();
  const body = hit.bodyPlain.toLowerCase();
  let score = 0;
  if (title.startsWith(q)) score -= 80;
  else if (title.includes(q)) score -= 50;
  if (sub.includes(q)) score -= 35;
  if (body.includes(q)) score -= 20;
  score -= Math.min(10, hit.updatedAt / 1e12);
  return score;
}

/** Build a flat index of all notebooks (call on search; small enough for sync scan). */
export function buildNotebookSearchIndex(sections: NotebookSearchSection[]): NotebookSearchHit[] {
  const hits: NotebookSearchHit[] = [];
  for (const section of sections) {
    const boards = loadBoards(section.id);
    for (const board of boards) {
      const objects = loadObjects(section.id, board.id);
      for (const obj of objects) {
        const raw = obj.content;
        if (!raw || typeof raw !== 'object' || (raw as { type?: string }).type !== 'notebook') continue;
        const c = raw as {
          type: 'notebook';
          body?: string;
          subtitle?: string;
        };
        const body = typeof c.body === 'string' ? c.body : '';
        const subtitle = typeof c.subtitle === 'string' && c.subtitle.trim() ? c.subtitle.trim() : undefined;
        const bodyPlain = notebookBodyPlain(body);
        hits.push({
          sectionId: section.id,
          sectionTitle: section.title,
          boardId: board.id,
          boardName: board.name,
          objectId: obj.id,
          title: obj.title?.trim() || 'Notebook',
          subtitle,
          updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : obj.createdAt ?? 0,
          bodyPlain,
        });
      }
    }
  }
  return hits;
}

export function searchNotebooks(
  index: NotebookSearchHit[],
  query: string,
  limit = 12,
): NotebookSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const matched = index.filter(hit => {
    const hay = [hit.title, hit.subtitle ?? '', hit.bodyPlain].join(' ');
    return textMatchesQuery(q, hay);
  });
  matched.sort((a, b) => scoreHit(a, q) - scoreHit(b, q));
  return matched.slice(0, limit);
}

export const PENDING_NOTEBOOK_FOCUS_KEY = 'fw_pending_notebook_focus_v1';

export interface PendingNotebookFocus {
  sectionId: string;
  boardId: string;
  objectId: string;
}

export function setPendingNotebookFocus(pending: PendingNotebookFocus): void {
  try {
    sessionStorage.setItem(PENDING_NOTEBOOK_FOCUS_KEY, JSON.stringify(pending));
  } catch { /* quota */ }
}

export function consumePendingNotebookFocus(): PendingNotebookFocus | null {
  try {
    const raw = sessionStorage.getItem(PENDING_NOTEBOOK_FOCUS_KEY);
    sessionStorage.removeItem(PENDING_NOTEBOOK_FOCUS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingNotebookFocus;
    if (
      p &&
      typeof p.sectionId === 'string' &&
      typeof p.boardId === 'string' &&
      typeof p.objectId === 'string'
    ) {
      return p;
    }
  } catch { /* ignore */ }
  return null;
}
