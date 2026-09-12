/** M5.1 only: deterministic, side-effect-free checks. Never schedules a write. */
import type { JSONContent } from '@tiptap/core';
import { normalizeOrderedSequences } from '../notebookDialect';
import { bodyToTiptapDoc } from './blocksToTiptapDoc';
import { tiptapDocToBlocks, tiptapDocToBody } from './tiptapDocToBody';
import { summarizeBodyDiff } from './shadowDiff';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key, v]) => key !== 'id' && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)]));
  }
  return value;
}

function semanticBlocks(doc: JSONContent, codecVersion?: number): string {
  const blocks = codecVersion === 1 ? tiptapDocToBlocks(doc) : normalizeOrderedSequences(tiptapDocToBlocks(doc));
  // The legacy empty-document sentinel and a lone empty paragraph are equivalent.
  if (codecVersion === undefined && blocks.length === 1 && blocks[0].kind === 'paragraph' && blocks[0].text === ''
    && !blocks[0].variant && !blocks[0].marks?.length) {
    return semanticBlocks(bodyToTiptapDoc(''));
  }
  if (codecVersion === 1 && (blocks.length === 0 || (blocks.length === 1 && blocks[0].kind === 'paragraph' && blocks[0].text === ''
    && !blocks[0].variant && !blocks[0].marks?.length))) {
    return JSON.stringify([{ kind: 'paragraph', text: '' }]);
  }
  return JSON.stringify(stable(blocks));
}

export function inspectCandidatePersistence(sourceBody: string, candidateDoc: JSONContent, codecVersion?: number) {
  try {
    const sourceDoc = bodyToTiptapDoc(sourceBody, codecVersion);
    const sourceCanonicalBody = tiptapDocToBody(sourceDoc, codecVersion);
    const candidateBody = tiptapDocToBody(candidateDoc, codecVersion);
    const restoredDoc = bodyToTiptapDoc(candidateBody, codecVersion);
    return {
      status: 'serializable' as const,
      sourceCanonicalBody,
      candidateBody,
      canonicalEqual: candidateBody === sourceCanonicalBody,
      sourceRoundTripSafe: semanticBlocks(sourceDoc, codecVersion) === semanticBlocks(bodyToTiptapDoc(sourceCanonicalBody, codecVersion), codecVersion)
        && !(codecVersion === undefined && sourceBody.trim() === '' && sourceBody.split(/\r?\n/).length !== sourceCanonicalBody.split('\n').length),
      candidateRoundTripSafe: semanticBlocks(candidateDoc, codecVersion) === semanticBlocks(restoredDoc, codecVersion),
      diff: summarizeBodyDiff(sourceBody, candidateBody),
    };
  } catch (error) {
    return { status: 'unserializable' as const, error: error instanceof Error ? error.message : String(error) };
  }
}
