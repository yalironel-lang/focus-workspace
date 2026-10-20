import type { KnowledgeTier } from '../gatewayClient';

/**
 * Display-only citation hygiene.
 * The server remains authoritative for knowledgeTier. Numbered markers are hidden
 * when the answer is not attributed to indexed course material, so a marker cannot
 * look like verified grounding.
 */
export function presentAnswerTextForProvenance(text: string, tier?: KnowledgeTier): string {
  if (tier !== 'general_academic' && tier !== 'pdf_selection') return text;
  let next = text.replace(/\s*\[\s*\d+\s*\]/g, '');
  if (tier === 'general_academic') {
    next = next.replace(/\s*\[\s*pdf selection\s*\]/gi, '');
  }
  return next.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}
