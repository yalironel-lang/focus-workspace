# ZIKUK AI Gateway — Supabase Edge Function secrets (server-only)
#
# Set via Supabase Dashboard → Edge Functions → Secrets, or:
#   supabase secrets set AI_PROVIDER_API_KEY=...
#   supabase secrets set AI_PROVIDER_BASE_URL=https://api.openai.com/v1
#   supabase secrets set AI_MODEL=gpt-4o-mini
#
# Never use VITE_ for these. Never commit values.
# SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically to Edge Functions.
#
# Launch requirement (not implemented in M0.2): durable per-user rate limiting
# (Edge isolate memory is not sufficient across instances).
