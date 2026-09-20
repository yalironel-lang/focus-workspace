/**
 * Privacy-safe operational logging for knowledge index (M0.5C).
 * NEVER logs chunk text, vectors, query text, JWT, or provider bodies.
 */

export type KnowledgeIndexLogLine = {
  event: 'ai_knowledge_index';
  requestId: string;
  outcome: 'ok' | 'error';
  code?: string;
  hasUser: boolean;
  hasSection: boolean;
  hasObject: boolean;
  chunkCount?: number;
  batchCount?: number;
  latencyMs: number;
};

export function formatKnowledgeIndexLogLine(line: KnowledgeIndexLogLine): string {
  return JSON.stringify({
    event: line.event,
    requestId: line.requestId,
    outcome: line.outcome,
    ...(line.code ? { code: line.code } : {}),
    hasUser: line.hasUser,
    hasSection: line.hasSection,
    hasObject: line.hasObject,
    ...(typeof line.chunkCount === 'number' ? { chunkCount: line.chunkCount } : {}),
    ...(typeof line.batchCount === 'number' ? { batchCount: line.batchCount } : {}),
    latencyMs: line.latencyMs,
  });
}
