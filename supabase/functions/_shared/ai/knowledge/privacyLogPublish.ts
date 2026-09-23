/**
 * Privacy-safe operational logging for B3.3B atomic publication.
 * NEVER logs PDF/OCR/canonical text, embeddings, or secrets.
 */

export type PublishRecoveredCorpusLogEvent =
  | {
      event: 'publish_recovered_corpus_begin';
      expectedSourceVersion: number;
      hasSourceId: boolean;
    }
  | {
      event: 'publish_recovered_corpus_ok';
      sourceVersion: number;
      retrievalSourceVersion: number;
      previousRetrievalSourceVersion: number | null;
      alreadyPublished: boolean;
      chunkCount?: number;
      pageCount?: number;
    }
  | {
      event: 'publish_recovered_corpus_failed';
      code: string;
    };

export type PublishRecoveredCorpusLogLine = PublishRecoveredCorpusLogEvent & {
  requestId: string;
  latencyMs?: number;
};

export function formatPublishRecoveredCorpusLogLine(
  line: PublishRecoveredCorpusLogLine,
): string {
  const base: Record<string, unknown> = {
    event: line.event,
    requestId: line.requestId,
  };
  if (typeof line.latencyMs === 'number') base.latencyMs = line.latencyMs;

  switch (line.event) {
    case 'publish_recovered_corpus_begin':
      return JSON.stringify({
        ...base,
        expectedSourceVersion: line.expectedSourceVersion,
        hasSourceId: line.hasSourceId,
      });
    case 'publish_recovered_corpus_ok':
      return JSON.stringify({
        ...base,
        sourceVersion: line.sourceVersion,
        retrievalSourceVersion: line.retrievalSourceVersion,
        previousRetrievalSourceVersion: line.previousRetrievalSourceVersion,
        alreadyPublished: line.alreadyPublished,
        ...(typeof line.chunkCount === 'number' ? { chunkCount: line.chunkCount } : {}),
        ...(typeof line.pageCount === 'number' ? { pageCount: line.pageCount } : {}),
      });
    case 'publish_recovered_corpus_failed':
      return JSON.stringify({
        ...base,
        code: line.code,
      });
  }
}

export function assertPublishLogIsPrivacySafe(serialized: string): boolean {
  const banned = [
    /"canonicalText"\s*:/i,
    /"canonical_text"\s*:/i,
    /"ocrText"\s*:/i,
    /"recovered_text"\s*:/i,
    /"embeddings?"\s*:\s*\[/i,
    /"text"\s*:\s*"[^"]{20,}/i,
    /"Authorization"\s*:/i,
    /"service_role"\s*:/i,
  ];
  return !banned.some((re) => re.test(serialized));
}
