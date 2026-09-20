/**
 * Privacy-safe operational logging for knowledge process (M0.7A).
 * NEVER logs extracted text, chunk text, vectors, PDF bytes, JWT, or provider bodies.
 */

export type KnowledgeProcessLogEvent =
  | {
      event: 'knowledge_process_begin';
      hasUser: boolean;
      hasSection: boolean;
      hasObject: boolean;
    }
  | {
      event: 'knowledge_process_ingest_ok';
      outcome: 'ready' | 'reused';
      sourceVersion: number;
      pageCount: number;
      chunkCount: number;
    }
  | {
      event: 'knowledge_process_index_ok';
      outcome: 'indexed' | 'reused';
      retrievalSourceVersion: number;
      chunkCount?: number;
      batchCount?: number;
    }
  | {
      event: 'knowledge_process_failed';
      stage: 'request' | 'ingest' | 'index';
      code: string;
    };

export type KnowledgeProcessLogLine = KnowledgeProcessLogEvent & {
  requestId: string;
  latencyMs?: number;
};

export function formatKnowledgeProcessLogLine(line: KnowledgeProcessLogLine): string {
  const base: Record<string, unknown> = {
    event: line.event,
    requestId: line.requestId,
  };
  if (typeof line.latencyMs === 'number') {
    base.latencyMs = line.latencyMs;
  }

  switch (line.event) {
    case 'knowledge_process_begin':
      return JSON.stringify({
        ...base,
        hasUser: line.hasUser,
        hasSection: line.hasSection,
        hasObject: line.hasObject,
      });
    case 'knowledge_process_ingest_ok':
      return JSON.stringify({
        ...base,
        outcome: line.outcome,
        sourceVersion: line.sourceVersion,
        pageCount: line.pageCount,
        chunkCount: line.chunkCount,
      });
    case 'knowledge_process_index_ok':
      return JSON.stringify({
        ...base,
        outcome: line.outcome,
        retrievalSourceVersion: line.retrievalSourceVersion,
        ...(typeof line.chunkCount === 'number' ? { chunkCount: line.chunkCount } : {}),
        ...(typeof line.batchCount === 'number' ? { batchCount: line.batchCount } : {}),
      });
    case 'knowledge_process_failed':
      return JSON.stringify({
        ...base,
        stage: line.stage,
        code: line.code,
      });
  }
}
