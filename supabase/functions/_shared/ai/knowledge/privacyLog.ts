/**
 * Privacy-safe operational logging for knowledge ingest.
 * NEVER accepts or logs extracted text / PDF bytes / JWT / keys.
 */

import type { KnowledgeIngestLogLine } from './types.ts';

export function formatKnowledgeIngestLogLine(line: KnowledgeIngestLogLine): string {
  return JSON.stringify({
    event: line.event,
    requestId: line.requestId,
    outcome: line.outcome,
    ...(line.code ? { code: line.code } : {}),
    hasUser: line.hasUser,
    hasSection: line.hasSection,
    hasObject: line.hasObject,
    ...(typeof line.byteLength === 'number' ? { byteLength: line.byteLength } : {}),
    ...(typeof line.pageCount === 'number' ? { pageCount: line.pageCount } : {}),
    ...(typeof line.chunkCount === 'number' ? { chunkCount: line.chunkCount } : {}),
    latencyMs: line.latencyMs,
  });
}

/** Assert a candidate log payload never contains forbidden keys/content. */
export function assertSafeKnowledgeLogPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  const forbidden = [
    'text',
    'chunks',
    'chunkText',
    'extracted',
    'pdf',
    'bytes',
    'jwt',
    'authorization',
    'service_role',
    'apiKey',
    'prompt',
    'embedding',
  ];
  for (const key of Object.keys(o)) {
    if (forbidden.includes(key.toLowerCase())) return false;
  }
  const s = JSON.stringify(o);
  if (/Authorization:\s*Bearer/i.test(s)) return false;
  return true;
}
