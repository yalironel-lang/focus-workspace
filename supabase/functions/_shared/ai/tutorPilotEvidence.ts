/** Phase 7M: opt-in staging receipt. Never log this object or its comparison key. */
export const PILOT_HEADER = 'x-zikuk-pilot-key';
export const PILOT_TTL_MS = 10 * 60_000;
export const PILOT_FRONTEND = 'https://zikuk-staging.vercel.app';
export const PILOT_SUPABASE = 'https://lmgrhmyurhjlwwdedojk.supabase.co';

export type PilotContext = { requestId: string; key: string };
export type PilotReceipt = {
  requestId: string;
  expiresAt: number;
  providerRequestId: string | null;
  questionFingerprint: string;
  capture: { chars: number; fingerprint: string; pageNumber: number | null; kind: string };
  modelInputFingerprint: string;
  recentTurns: number;
  chunks: { index: number; pageNumber: number; sourceFingerprint: string; textFingerprint: string; chars: number; included: boolean }[];
  answerFingerprint: string;
  sourcesFingerprint: string;
  citationIndices: number[];
  knowledgeTier: string;
};

/** Exact origins, not substring matching. Auth/section ownership still run normally. */
export function pilotContext(input: { supabaseUrl: string; origin: string | null; key: string | null }): PilotContext | undefined {
  if (input.supabaseUrl !== PILOT_SUPABASE || input.origin !== PILOT_FRONTEND || !/^[a-f0-9]{64}$/.test(input.key ?? '')) return;
  return { requestId: crypto.randomUUID(), key: input.key! };
}

/** Fresh per-request HMAC key prevents reusable/dictionary-comparable text hashes. */
export async function pilotFingerprint(key: string, domain: string, value: unknown): Promise<string> {
  const bytes = Uint8Array.from(key.match(/../g) ?? [], part => parseInt(part, 16));
  const imported = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(JSON.stringify([domain, value])));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function makePilotReceipt(input: {
  context: PilotContext;
  question: string;
  capture?: { text?: string; textKind?: string; pageNumber: number };
  chunks: { citationIndex: number; sourceObjectId: string; pageNumber: number; text: string }[];
  /** Snapshot taken immediately before the provider call, not a later reconstruction. */
  modelInput: string;
  promptText: string;
  recentTurns: number;
  answer: string;
  sources: unknown;
  knowledgeTier: string;
  providerRequestId?: string;
}): Promise<PilotReceipt> {
  const fp = (domain: string, value: unknown) => pilotFingerprint(input.context.key, domain, value);
  const text = input.capture?.text ?? '';
  return {
    requestId: input.context.requestId,
    expiresAt: Date.now() + PILOT_TTL_MS,
    providerRequestId: input.providerRequestId ?? null,
    questionFingerprint: await fp('question', input.question),
    capture: { chars: text.length, fingerprint: await fp('capture', text), pageNumber: input.capture?.pageNumber ?? null, kind: input.capture?.textKind ?? (input.capture ? 'native_selection' : 'none') },
    modelInputFingerprint: await fp('modelInput', input.modelInput),
    recentTurns: input.recentTurns,
    chunks: await Promise.all(input.chunks.map(async chunk => ({
      index: chunk.citationIndex, pageNumber: chunk.pageNumber,
      sourceFingerprint: await fp('source', chunk.sourceObjectId),
      textFingerprint: await fp('chunk', chunk.text), chars: chunk.text.length,
      included: input.promptText.includes(chunk.text),
    }))),
    answerFingerprint: await fp('answer', input.answer),
    sourcesFingerprint: await fp('sources', input.sources),
    citationIndices: [...new Set([...input.answer.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])))].slice(0, 32),
    knowledgeTier: input.knowledgeTier,
  };
}

/** Rebuild a closed record: no untrusted extra fields reach memory/DOM diagnostics. */
export function parsePilotReceipt(value: unknown): PilotReceipt | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as PilotReceipt;
  const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const count = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 1_000_000;
  if (typeof r.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(r.requestId) || !Number.isFinite(r.expiresAt) || r.expiresAt <= Date.now() || r.expiresAt > Date.now() + PILOT_TTL_MS) return;
  if (r.providerRequestId !== null && (typeof r.providerRequestId !== 'string' || !/^[\w-]{1,160}$/.test(r.providerRequestId))) return;
  if (![r.questionFingerprint, r.modelInputFingerprint, r.answerFingerprint, r.sourcesFingerprint].every(hex)) return;
  if (!r.capture || !hex(r.capture.fingerprint) || !count(r.capture.chars) || !(r.capture.pageNumber === null || count(r.capture.pageNumber)) || !['none', 'native_selection', 'native_page', 'recovered_page', 'visual_selection'].includes(r.capture.kind)) return;
  if (!count(r.recentTurns) || !Array.isArray(r.chunks) || r.chunks.length > 32 || !r.chunks.every(c => c && typeof c === 'object' && count(c.index) && count(c.pageNumber) && count(c.chars) && hex(c.sourceFingerprint) && hex(c.textFingerprint) && typeof c.included === 'boolean')) return;
  if (!Array.isArray(r.citationIndices) || r.citationIndices.length > 32 || !r.citationIndices.every(count) || !['course_material', 'pdf_selection', 'pdf_page_native', 'pdf_page_recovered', 'pdf_selection_visual', 'general_academic', 'mixed'].includes(r.knowledgeTier)) return;
  return {
    requestId: r.requestId, expiresAt: r.expiresAt, providerRequestId: r.providerRequestId,
    questionFingerprint: r.questionFingerprint,
    capture: { chars: r.capture.chars, fingerprint: r.capture.fingerprint, pageNumber: r.capture.pageNumber, kind: r.capture.kind },
    modelInputFingerprint: r.modelInputFingerprint, recentTurns: r.recentTurns,
    chunks: r.chunks.map(c => ({ index: c.index, pageNumber: c.pageNumber, sourceFingerprint: c.sourceFingerprint, textFingerprint: c.textFingerprint, chars: c.chars, included: c.included })),
    answerFingerprint: r.answerFingerprint, sourcesFingerprint: r.sourcesFingerprint,
    citationIndices: [...r.citationIndices], knowledgeTier: r.knowledgeTier,
  };
}
