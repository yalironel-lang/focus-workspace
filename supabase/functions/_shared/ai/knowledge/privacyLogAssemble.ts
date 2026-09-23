/**
 * Privacy-safe operational logging for B3.3A recovered-corpus assembly.
 * NEVER logs PDF/OCR/canonical text, embeddings, secrets, or Storage URLs.
 */

export type AssembleRecoveredCorpusLogEvent =
  | {
      event: 'assemble_recovered_corpus_begin';
      sourceVersion: number;
      hasSourceId: boolean;
      hasSection: boolean;
      hasUser: boolean;
    }
  | {
      event: 'assemble_recovered_corpus_ok';
      sourceVersion: number;
      retrievalSourceVersion: number | null;
      expectedPageCount: number;
      chunkCount: number;
      embeddingCount: number;
      reusedChunks: boolean;
      published: false;
    }
  | {
      event: 'assemble_recovered_corpus_failed';
      code: string;
      retrievalSourceVersion?: number | null;
    };

export type AssembleRecoveredCorpusLogLine = AssembleRecoveredCorpusLogEvent & {
  requestId: string;
  latencyMs?: number;
};

export function formatAssembleRecoveredCorpusLogLine(
  line: AssembleRecoveredCorpusLogLine,
): string {
  const base: Record<string, unknown> = {
    event: line.event,
    requestId: line.requestId,
  };
  if (typeof line.latencyMs === 'number') {
    base.latencyMs = line.latencyMs;
  }

  switch (line.event) {
    case 'assemble_recovered_corpus_begin':
      return JSON.stringify({
        ...base,
        sourceVersion: line.sourceVersion,
        hasSourceId: line.hasSourceId,
        hasSection: line.hasSection,
        hasUser: line.hasUser,
      });
    case 'assemble_recovered_corpus_ok':
      return JSON.stringify({
        ...base,
        sourceVersion: line.sourceVersion,
        retrievalSourceVersion: line.retrievalSourceVersion,
        expectedPageCount: line.expectedPageCount,
        chunkCount: line.chunkCount,
        embeddingCount: line.embeddingCount,
        reusedChunks: line.reusedChunks,
        published: false,
      });
    case 'assemble_recovered_corpus_failed':
      return JSON.stringify({
        ...base,
        code: line.code,
        ...(line.retrievalSourceVersion !== undefined
          ? { retrievalSourceVersion: line.retrievalSourceVersion }
          : {}),
      });
  }
}

/** Reject log payloads that accidentally include content-bearing keys. */
export function assertAssembleLogIsPrivacySafe(serialized: string): boolean {
  // Banned JSON keys / substrings that indicate content leakage (not safe counters).
  const bannedKeyPatterns = [
    /"canonicalText"\s*:/i,
    /"canonical_text"\s*:/i,
    /"ocrText"\s*:/i,
    /"recovered_text"\s*:/i,
    /"native_text"\s*:/i,
    /"embeddings?"\s*:\s*\[/i,
    /"pdfBytes"\s*:/i,
    /"storageUrl"\s*:/i,
    /"signedUrl"\s*:/i,
    /"service_role"\s*:/i,
    /"Authorization"\s*:/i,
    /"text"\s*:\s*"[^"]{20,}/i,
  ];
  for (const re of bannedKeyPatterns) {
    if (re.test(serialized)) return false;
  }
  return true;
}
