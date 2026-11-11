import { PILOT_FRONTEND, PILOT_SUPABASE, PILOT_HEADER, pilotFingerprint, parsePilotReceipt } from '../../../../supabase/functions/_shared/ai/tutorPilotEvidence';
import type { ZikukAiAskCourseRequest, ZikukAiResponse, AskCourseSourceRef } from '../gatewayClient/types';

export type PilotRenderEvidence = { requestId: string; expiresAt: number; verified: boolean };

/** Explicit per-page opt-in; no local/session storage, globals, or background calls. */
export function beginTutorPilot(input: { supabaseUrl: string; origin: string; search: string; surface?: string }): { key: string; headers: Record<string, string> } | undefined {
  if (input.supabaseUrl !== PILOT_SUPABASE || input.origin !== PILOT_FRONTEND || input.surface !== 'tutor' || new URLSearchParams(input.search).get('tutorEvidence') !== '1') return;
  const key = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { key, headers: { [PILOT_HEADER]: key } };
}

export async function verifyTutorPilot(key: string, request: ZikukAiAskCourseRequest, response: ZikukAiResponse): Promise<PilotRenderEvidence | undefined> {
  if (!response.ok || response.result.type !== 'ask_course' || response.meta?.capability !== 'ask_course') return;
  const receipt = parsePilotReceipt(response.meta.pilotEvidence);
  if (!receipt) return;
  const capture = request.version === 3 ? request.capture : undefined;
  // Visual pilot requires separate image evidence; never label it verified here.
  const visual = capture && 'attachmentType' in capture && capture.attachmentType === 'visual_selection';
  const text = capture && 'text' in capture ? capture.text : '';
  const checks = await Promise.all([
    pilotFingerprint(key, 'question', request.question).then(fp => fp === receipt.questionFingerprint),
    pilotFingerprint(key, 'capture', text).then(fp => fp === receipt.capture.fingerprint && text.length === receipt.capture.chars && (capture?.pageNumber ?? null) === receipt.capture.pageNumber),
    pilotFingerprint(key, 'answer', response.result.text).then(fp => fp === receipt.answerFingerprint),
    pilotFingerprint(key, 'sources', response.result.sources).then(fp => fp === receipt.sourcesFingerprint),
  ]);
  return { requestId: receipt.requestId, expiresAt: receipt.expiresAt, verified: !visual && Boolean(receipt.providerRequestId) && checks.every(Boolean) && receipt.knowledgeTier === response.result.knowledgeTier && receipt.chunks.every(chunk => chunk.included) };
}

/** Never jump within the open PDF using a page number from a different PDF. */
export function citationPageForOpenPdf(source: AskCourseSourceRef, openPdfId: string | null): number | undefined {
  return source.sourceKind === 'free_space_pdf' && source.sourceObjectId === openPdfId && Number.isInteger(source.pageNumber) && source.pageNumber >= 1 ? source.pageNumber : undefined;
}
