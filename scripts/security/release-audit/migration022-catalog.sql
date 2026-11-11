-- PREPARATION ONLY. Later authorized operator must independently confirm project.
-- Catalog metadata only; no user/application/Storage rows or helper invocation.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT jsonb_build_object(
 'execution', jsonb_build_object('role',current_user,'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation')),
 'tables', (SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'constraints',(SELECT jsonb_agg(pg_get_constraintdef(x.oid)) FROM pg_constraint x WHERE x.conrelid=c.oid))), '[]'::jsonb)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('ai_project_usage_counters','ai_project_usage_reservations','ai_usage_events')),
 'functions', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'settings',p.proconfig,'acl',p.proacl)), '[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('ai_gateway_project_begin','ai_gateway_project_dispatch','ai_gateway_project_settle','ai_gateway_project_release','ai_gateway_project_cleanup_expired'))
);
ROLLBACK;
