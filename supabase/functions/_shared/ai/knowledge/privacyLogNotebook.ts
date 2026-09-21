/**
 * Privacy-safe logging for Notebook knowledge ingest.
 * NEVER logs body / extracted text / chunks / math / tables / hashes.
 */

import type { NotebookKnowledgeLogLine } from './notebookTypes.ts';

export function formatNotebookKnowledgeLogLine(line: NotebookKnowledgeLogLine): string {
  return JSON.stringify({
    event: line.event,
    requestId: line.requestId,
    outcome: line.outcome,
    ...(line.code ? { code: line.code } : {}),
    hasUser: line.hasUser,
    hasSection: line.hasSection,
    hasNotebook: line.hasNotebook,
    hasPage: line.hasPage,
    ...(typeof line.chunkCount === 'number' ? { chunkCount: line.chunkCount } : {}),
    ...(typeof line.segmentCount === 'number' ? { segmentCount: line.segmentCount } : {}),
    latencyMs: line.latencyMs,
  });
}

export function assertSafeNotebookKnowledgeLogPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  const forbidden = [
    'text',
    'chunks',
    'chunktext',
    'extracted',
    'documentbody',
    'normalizedtext',
    'body',
    'math',
    'table',
    'hash',
    'contenthash',
    'jwt',
    'authorization',
    'apiKey',
    'embedding',
    'handwriting',
  ];
  for (const key of Object.keys(o)) {
    if (forbidden.includes(key.toLowerCase())) return false;
  }
  const s = JSON.stringify(o);
  if (/Authorization:\s*Bearer/i.test(s)) return false;
  return true;
}
