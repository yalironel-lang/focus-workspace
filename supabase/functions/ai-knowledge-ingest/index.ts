/**
 * ZIKUK AI — ai-knowledge-ingest (M0.5B)
 *
 * Private Free Space PDF → hash → begin_ingest → extract → chunk → finalize.
 * No embeddings. No provider calls. No Notebook mutation.
 *
 * DO NOT deploy in the M0.5B implementation phase until explicitly approved.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import {
  KNOWLEDGE_MAX_PDF_BYTES,
  KNOWLEDGE_MAX_REQUEST_BODY_BYTES,
  USER_CONTENT_BUCKET,
} from '../_shared/ai/knowledge/bounds.ts';
import {
  EDGE_PROBE_PAGE1,
  EDGE_PROBE_PAGE2,
  fixturePdfEdgeProbe,
} from '../_shared/ai/knowledge/edgeProbeFixture.ts';
import { extractPdfTextFromBytes } from '../_shared/ai/knowledge/extractPdfText.ts';
import {
  installPdfJsEdgeCompatGlobals,
  loadPdfJsModule,
  pdfJsLoaderKind,
} from '../_shared/ai/knowledge/loadPdfJs.ts';
import { formatKnowledgeIngestLogLine } from '../_shared/ai/knowledge/privacyLog.ts';
import {
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from '../_shared/ai/knowledge/runKnowledgeIngest.ts';
import type {
  KnowledgeIngestErrorCode,
  KnowledgeIngestResponse,
} from '../_shared/ai/knowledge/types.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: KnowledgeIngestResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function httpStatusFor(code: KnowledgeIngestErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'auth_mismatch':
      return 403;
    case 'invalid_request':
    case 'not_pdf':
      return 400;
    case 'not_found':
      return 404;
    case 'too_large':
    case 'too_many_pages':
      return 413;
    case 'no_extractable_text':
    case 'extract_failed':
      return 422;
    default:
      return 500;
  }
}

function newRequestId(): string {
  return crypto.randomUUID();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const started = Date.now();
  const requestId = newRequestId();

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: { code: 'invalid_request', message: 'POST required.' },
      },
      405,
    );
  }

  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > KNOWLEDGE_MAX_REQUEST_BODY_BYTES) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Request body too large.' },
        },
        413,
      );
    }

    const rawText = await req.text();
    if (rawText.length > KNOWLEDGE_MAX_REQUEST_BODY_BYTES) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Request body too large.' },
        },
        413,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText || 'null');
    } catch {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'invalid_request', message: 'Invalid JSON body.' },
        },
        400,
      );
    }

    // ------------------------------------------------------------------
    // Synthetic Edge PDF text probe (no Storage, no DB, no real PDF).
    // Body: { "version": 1, "probe": "edge_pdf_text" }
    // ------------------------------------------------------------------
    if (
      body &&
      typeof body === 'object' &&
      (body as { probe?: unknown }).probe === 'edge_pdf_text'
    ) {
      const compat = installPdfJsEdgeCompatGlobals();
      const loader = pdfJsLoaderKind();
      let pdfjs;
      try {
        pdfjs = await loadPdfJsModule();
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message.replace(/\s+/g, ' ').slice(0, 240)
            : 'pdfjs_load_failed';
        return new Response(
          JSON.stringify({
            version: 1,
            ok: false,
            probe: 'edge_pdf_text',
            error: { code: 'internal_error', message: `pdfjs_unavailable: ${msg}` },
            compat,
            loader,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const bytes = fixturePdfEdgeProbe();
      let extracted;
      try {
        extracted = await extractPdfTextFromBytes(bytes, pdfjs);
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message.replace(/\s+/g, ' ').slice(0, 240)
            : 'extract_threw';
        return new Response(
          JSON.stringify({
            version: 1,
            ok: false,
            probe: 'edge_pdf_text',
            error: { code: 'extract_failed', message: `extract_threw: ${msg}` },
            compat,
            loader,
            pdfBytes: bytes.byteLength,
            hasGetDocument: typeof pdfjs?.getDocument === 'function',
          }),
          {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
      if (!extracted.ok) {
        return new Response(
          JSON.stringify({
            version: 1,
            ok: false,
            probe: 'edge_pdf_text',
            error: {
              code: extracted.code,
              message: 'Synthetic extract failed.',
              detail: extracted.detail ?? null,
            },
            compat,
            loader,
            pdfBytes: bytes.byteLength,
            hasGetDocument: typeof pdfjs?.getDocument === 'function',
          }),
          {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const pageTexts = extracted.pages.map((p) => p.text);
      const pageBoundaryOk =
        extracted.pageCount === 2 &&
        pageTexts[0]?.includes(EDGE_PROBE_PAGE1) === true &&
        pageTexts[1]?.includes(EDGE_PROBE_PAGE2) === true &&
        !pageTexts[0]?.includes(EDGE_PROBE_PAGE2) &&
        !pageTexts[1]?.includes(EDGE_PROBE_PAGE1);

      console.log(
        formatKnowledgeIngestLogLine({
          event: 'ai_knowledge_ingest',
          requestId,
          outcome: pageBoundaryOk ? 'ok' : 'error',
          code: pageBoundaryOk ? 'ok' : 'extract_failed',
          hasUser: false,
          hasSection: false,
          hasObject: false,
          byteLength: bytes.byteLength,
          pageCount: extracted.pageCount,
          chunkCount: 0,
          latencyMs: Date.now() - started,
        }),
      );

      return new Response(
        JSON.stringify({
          version: 1,
          ok: pageBoundaryOk,
          probe: 'edge_pdf_text',
          compat,
          loader,
          pdfBytes: bytes.byteLength,
          pageCount: extracted.pageCount,
          pagesWithText: extracted.pagesWithText,
          expectedTextMatch: pageBoundaryOk,
          pageBoundaryOk,
          // Synthetic markers only — not real course content.
          pages: extracted.pages.map((p) => ({
            pageNumber: p.pageNumber,
            text: p.text,
          })),
          latencyMs: Date.now() - started,
        }),
        {
          status: pageBoundaryOk ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'internal_error', message: 'Server configuration error.' },
        },
        500,
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const authUserId = userError || !userData?.user?.id ? null : userData.user.id;

    if (!serviceKey) {
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: { code: 'internal_error', message: 'Server configuration error.' },
        },
        500,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let pdfjs;
    try {
      pdfjs = await loadPdfJsModule();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message.replace(/\s+/g, ' ').slice(0, 240)
          : 'pdfjs_load_failed';
      console.log(
        formatKnowledgeIngestLogLine({
          event: 'ai_knowledge_ingest',
          requestId,
          outcome: 'error',
          code: 'internal_error',
          hasUser: Boolean(authUserId),
          hasSection: false,
          hasObject: false,
          latencyMs: Date.now() - started,
        }),
      );
      console.log(
        JSON.stringify({
          event: 'ai_knowledge_ingest_pdfjs_load',
          ok: false,
          message: msg,
        }),
      );
      return jsonResponse(
        {
          version: 1,
          ok: false,
          error: {
            code: 'internal_error',
            message: `pdfjs_unavailable: ${msg}`,
          },
        },
        500,
      );
    }

    let lastByteLength: number | undefined;
    let lastPageCount: number | undefined;
    let lastChunkCount: number | undefined;

    const deps: KnowledgeIngestDeps = {
      async loadOwnedPdfObject({ userId, sectionId, sourceObjectId }) {
        const { data: section, error: secErr } = await admin
          .from('sections')
          .select('id, user_id')
          .eq('id', sectionId)
          .maybeSingle();
        if (secErr || !section) return { ok: false, code: 'not_found' };
        if (section.user_id !== userId) return { ok: false, code: 'auth_mismatch' };

        const { data: fso, error: fsoErr } = await admin
          .from('free_space_objects')
          .select('id, user_id, section_id, object')
          .eq('id', sourceObjectId)
          .maybeSingle();
        if (fsoErr || !fso) return { ok: false, code: 'not_found' };
        if (fso.user_id !== userId || fso.section_id !== sectionId) {
          return { ok: false, code: 'auth_mismatch' };
        }
        const obj = fso.object as { type?: string } | null;
        if (!obj || obj.type !== 'pdf') return { ok: false, code: 'not_pdf' };
        return { ok: true, objectType: 'pdf' };
      },

      async downloadPdfBytes({ bucket, storagePath }) {
        if (bucket !== USER_CONTENT_BUCKET) {
          return { ok: false, code: 'internal_error' };
        }
        const { data, error } = await admin.storage.from(bucket).download(storagePath);
        if (error || !data) {
          const msg = error?.message ?? '';
          if (/not found|404/i.test(msg)) return { ok: false, code: 'not_found' };
          return { ok: false, code: 'internal_error' };
        }
        const buf = new Uint8Array(await data.arrayBuffer());
        lastByteLength = buf.byteLength;
        if (buf.byteLength > KNOWLEDGE_MAX_PDF_BYTES) {
          return { ok: false, code: 'too_large' };
        }
        return { ok: true, bytes: buf };
      },

      async beginIngest({ userId, sectionId, sourceObjectId, contentHash }) {
        const { data, error } = await admin.rpc('ai_knowledge_begin_ingest', {
          p_user_id: userId,
          p_section_id: sectionId,
          p_source_object_id: sourceObjectId,
          p_content_hash: contentHash,
        });
        if (error) return { ok: false, code: 'internal_error' };
        return (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          source_id?: string;
          source_version?: number;
          status?: string;
          idempotent?: boolean;
        };
      },

      async finalizeIngest({ sourceId, sourceVersion, status, errorCode, chunks }) {
        const { data, error } = await admin.rpc('ai_knowledge_finalize_ingest', {
          p_source_id: sourceId,
          p_source_version: sourceVersion,
          p_status: status,
          p_error_code: errorCode ?? null,
          p_chunks: chunks ?? null,
        });
        if (error) return { ok: false, code: 'internal_error' };
        const result = (data ?? { ok: false, code: 'internal_error' }) as {
          ok: boolean;
          code?: string;
          source_id?: string;
          source_version?: number;
          status?: string;
          chunk_count?: number;
          preserved_corpus?: boolean;
        };
        if (result.ok && typeof result.chunk_count === 'number') {
          lastChunkCount = result.chunk_count;
        }
        return result;
      },

      pdfjs,
    };

    const response = await runKnowledgeIngest({
      authUserId,
      body,
      deps,
    });

    if (response.ok) {
      lastPageCount = response.result.pageCount;
      lastChunkCount = response.result.chunkCount;
    }

    console.log(
      formatKnowledgeIngestLogLine({
        event: 'ai_knowledge_ingest',
        requestId,
        outcome: response.ok ? 'ok' : 'error',
        code: response.ok ? 'ok' : response.error.code,
        hasUser: Boolean(authUserId),
        hasSection: true,
        hasObject: true,
        byteLength: lastByteLength,
        pageCount: lastPageCount,
        chunkCount: lastChunkCount,
        latencyMs: Date.now() - started,
      }),
    );

    if (!response.ok) {
      return jsonResponse(response, httpStatusFor(response.error.code));
    }
    return jsonResponse(response, 200);
  } catch {
    console.log(
      formatKnowledgeIngestLogLine({
        event: 'ai_knowledge_ingest',
        requestId,
        outcome: 'error',
        code: 'internal_error',
        hasUser: false,
        hasSection: false,
        hasObject: false,
        latencyMs: Date.now() - started,
      }),
    );
    return jsonResponse(
      {
        version: 1,
        ok: false,
        error: { code: 'internal_error', message: 'Unexpected server error.' },
      },
      500,
    );
  }
});
