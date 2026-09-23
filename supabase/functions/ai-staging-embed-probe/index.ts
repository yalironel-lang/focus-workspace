/**
 * Staging-only embed probe for B4/B4.1 ranking diagnostics.
 * Uses Edge secrets; returns embedding vectors for input texts.
 *
 * TEST / STAGING ONLY — do not deploy to Production.
 * Product Edge functions must not import or call this.
 * Undeploy from staging after acceptance measurements.
 */
import { createOpenAICompatibleEmbeddingProvider } from '../_shared/ai/knowledge/providerEmbeddings.ts';
import {
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
} from '../_shared/ai/knowledge/bounds.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  try {
    const apiKey = Deno.env.get('AI_PROVIDER_API_KEY') ?? '';
    const baseUrl = Deno.env.get('AI_PROVIDER_BASE_URL') ?? 'https://api.openai.com/v1';
    if (!apiKey) {
      return Response.json({ ok: false, error: 'missing_ai_key' }, { status: 500 });
    }
    const body = await req.json();
    const texts = Array.isArray(body?.texts) ? body.texts.map(String) : [];
    if (texts.length < 1 || texts.length > 8) {
      return Response.json({ ok: false, error: 'bad_texts' }, { status: 400 });
    }
    const provider = createOpenAICompatibleEmbeddingProvider({ apiKey, baseUrl });
    const embedded = await provider.embed({
      model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      inputs: texts,
    });
    if (!embedded.ok) {
      return Response.json(
        { ok: false, error: embedded.code, message: embedded.message },
        { status: 502 },
      );
    }
    return Response.json({
      ok: true,
      model: KNOWLEDGE_EMBEDDING_MODEL_DEFAULT,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      embeddings: embedded.embeddings,
      latencyMs: embedded.latencyMs,
    });
  } catch {
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
});
