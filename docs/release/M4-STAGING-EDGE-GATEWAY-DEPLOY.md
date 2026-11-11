# M4 — Staging-only `ai-gateway` Edge Deploy (Prepared, Not Executed)

**Status:** Procedure only. Do **not** run until a later message explicitly authorizes staging Edge deployment.  
**RC:** `/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023`  
**Staging project ref:** `lmgrhmyurhjlwwdedojk`  
**Production project ref (FORBIDDEN):** `comxmviofnotfwzbupxg`

---

## Why an Edge update is required

The M4 Preview frontend (`dpl_BnFSbC9yzsPhxd7GxK9YdSf6u2ZF`) embeds Tutor / Ask Course clients that expect:

| Capability | RC location |
|---|---|
| PDF selection grounding (`capture` v3) | `askCourse` + `evaluateGroundingProvenance.ts` (**includes local SKE1.1 fix**) |
| Document-window retrieval | `documentWindow.ts` + `admin.rpc('ai_knowledge_document_window')` |
| PDF-source search | `admin.rpc('ai_knowledge_search_pdf_source')` |
| Strong attribution / citations | `applyClaimLevelGrounding` / provenance gates |
| Contextual follow-ups | `recentTurns` + client conversation storage |
| Conversation continuity | Mostly client (`tutorSessionStorage`); Edge must accept `recentTurns` |

Staging `ai-gateway` **exists** (auth-gated JSON envelope), but the **deployed revision hash cannot be determined** via anon probes → treat as **unknown vs M4 RC**. Deploying the RC Edge bundle to staging is required before tutor acceptance.

Staging DB RPCs 020/021 and search **exist** (anon → `42501`, service_role-only) — schema gate is OK for Edge deploy.

---

## Exact files / dependency surface

Deploy function **`ai-gateway`** from this worktree (bundles `_shared` automatically):

- `supabase/functions/ai-gateway/index.ts`
- `supabase/functions/_shared/ai/**` (askCourse, knowledge, enforcement, providers, requestTypes, …)
- `supabase/config.toml` → `[functions.ai-gateway] verify_jwt = true`

Do **not** deploy unrelated functions unless separately authorized.

---

## Required staging secrets (names only — never print values)

Already expected on staging Edge (platform-injected + project secrets):

| Name | Role |
|---|---|
| `SUPABASE_URL` | Staging URL |
| `SUPABASE_ANON_KEY` | Staging anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role (RPC grants) |
| `AI_PROVIDER_API_KEY` | Provider |
| `AI_PROVIDER_BASE_URL` | Optional |
| `AI_MODEL` | Chat model |
| `AI_EMBEDDING_MODEL` / `AI_EMBEDDING_DIMENSIONS` | Embeddings |

Confirm secrets target **staging** project only before deploy.

---

## Safe staging-only command (when authorized)

```bash
cd /Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023

# Fail-closed helper (refuses production ref)
export ZIKUK_ALLOW_STAGING_EDGE_DEPLOY=1
bash scripts/deploy-staging-ai-gateway.sh
```

Equivalent manual shape (operator must still use the helper or identical guards):

```bash
npx supabase functions deploy ai-gateway \
  --project-ref lmgrhmyurhjlwwdedojk
```

**STOP if** `--project-ref` is `comxmviofnotfwzbupxg` or any non-staging ref.

---

## Rollback / recovery

1. Keep the previous staging deployment in Supabase Dashboard → Edge Functions → `ai-gateway` history (if available) and redeploy prior artifact, **or**
2. Redeploy the last known-good staging commit’s `ai-gateway` with the same staging `--project-ref`.
3. Do **not** “fix” staging by deploying production’s function to staging without an intentional staging pin.
4. Frontend Preview remains usable for non-AI smoke even if Edge rolls back.

---

## Post-deploy smoke (staging only, after authorization)

1. Authenticated Ask Course with PDF capture → expect `pdf_selection` or `mixed` (not silent `general_academic` for quoted short formulas).
2. Open-PDF document-window / pdf-source route questions.
3. Follow-up turn with `recentTurns`.
4. Confirm Network host remains `lmgrhmyurhjlwwdedojk.supabase.co`.
