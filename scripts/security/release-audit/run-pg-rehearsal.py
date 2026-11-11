"""Approved synthetic rehearsal only. Fixed local engine/image; no host DB/network."""
import concurrent.futures, hashlib, json, os, pathlib, re, selectors, subprocess, time, uuid
ROOT = pathlib.Path(__file__).resolve().parents[3]
DOCKER = '/Users/ylyrwnl/.orbstack/bin/docker'
HOST = 'unix:///Users/ylyrwnl/.orbstack/run/docker.sock'
IMAGE = 'sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe'
DB = 'zikuk_022_rehearsal'
OUT = ROOT / 'docs/release/G285-PG-REHEARSAL-RESULT.json'
ENV = {'PATH':'/usr/bin:/bin','DOCKER_CONFIG':'/tmp/zikuk-g285-docker-config'}
TOKEN = 'g285-' + uuid.uuid4().hex[:16]
CID = None
RESULT = {'scope':'new cached-image, network-none, synthetic-only PostgreSQL','candidate':'local-34b07e1319c641c1','image':IMAGE,'checks':[], 'status':'UNKNOWN','cleanup':'UNKNOWN','remoteDatabaseAccess':False}
class Stop(Exception): pass

def docker(args, data=None, timeout=20, check=True):
    r = subprocess.run([DOCKER,'--host',HOST]+args,input=data,text=True,capture_output=True,env=ENV,timeout=timeout)
    if check and r.returncode: raise Stop('DOCKER_OPERATION_FAILED')
    return r

def inspect():
    # Only the newly returned CID. Do not inspect other containers or environment.
    fmt='{{json .Id}}\n{{json .Image}}\n{{json .Config.Labels}}\n{{json .HostConfig.NetworkMode}}\n{{json .HostConfig.PortBindings}}\n{{json .Mounts}}\n{{json .HostConfig.ReadonlyRootfs}}\n{{json .HostConfig.Binds}}\n{{json .NetworkSettings.Ports}}'
    rows=docker(['inspect','--format',fmt,CID]).stdout.splitlines()
    return [json.loads(v) for v in rows]

def isolated():
    v=inspect()
    return (v[0]==CID and v[1]==IMAGE and v[2].get('zikuk.scope')==TOKEN and v[3]=='none'
            and not v[4] and all(m['Type']=='tmpfs' for m in (v[5] or [])) and v[6] is True
            and not v[7] and all(not p for p in (v[8] or {}).values()))

def psql_args(): return ['exec','-i',CID,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U','postgres','-d',DB]
PREFIX="""\\set VERBOSITY sqlstate
SET statement_timeout='5s'; SET lock_timeout='1500ms'; SET idle_in_transaction_session_timeout='15s';
SET zikuk.isolated_rehearsal='G285_TOKEN_LEDGER_REVIEW';
DO $identity$ BEGIN
 IF current_database()<>'zikuk_022_rehearsal' OR current_user<>'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 THEN RAISE EXCEPTION 'STOP target mismatch'; END IF;
END $identity$;
"""
def sql(body, expected=None, timeout=20):
    r=docker(psql_args(),PREFIX+body,timeout=timeout,check=False)
    if expected:
        if r.returncode==0 or not re.search(r'\b'+expected+r'\b',r.stderr): raise Stop('EXPECTED_FAILURE_NOT_ESTABLISHED')
        return None
    if r.returncode: raise Stop('SQL_FAILED_'+(re.search(r'ERROR:\s*([A-Z0-9]{5})',r.stderr).group(1) if re.search(r'ERROR:\s*([A-Z0-9]{5})',r.stderr) else 'UNCLASSIFIED'))
    return [s for s in r.stdout.splitlines() if s.strip()]
def value(body):
    rows=sql(body)
    if not rows: raise Stop('MISSING_QUERY_RESULT')
    return json.loads(rows[-1])
def check(name, ok, **evidence):
    RESULT['checks'].append({'case':name,'status':'PASS' if ok else 'FAIL',**evidence})
    print(json.dumps({'case':name,'status':'PASS' if ok else 'FAIL'}),flush=True)
    if not ok: raise Stop('ASSERTION_FAILED_'+name)
def snapshot():
    return value("SELECT json_build_object('canary',md5((SELECT jsonb_agg(t ORDER BY id)::text FROM public.release_canary t)), 'rows',(SELECT count(*) FROM public.release_canary),'storage',(SELECT count(*) FROM storage.objects),'storageDigest',md5((SELECT jsonb_agg(t ORDER BY id)::text FROM storage.objects t)),'authDigest',md5((SELECT jsonb_agg(t ORDER BY id)::text FROM auth.users t)));")
def ledger(): return value("SELECT json_build_object('r',(SELECT coalesce(jsonb_agg(t ORDER BY id),'[]') FROM public.ai_project_usage_reservations t),'c',(SELECT coalesce(jsonb_agg(t ORDER BY window_kind,window_start),'[]') FROM public.ai_project_usage_counters t));")
def functions(): return value("SELECT jsonb_agg(jsonb_build_object('name',p.proname,'def',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ai_gateway_project_%';")
def reset(): sql('TRUNCATE public.ai_project_usage_reservations, public.ai_project_usage_counters;')
DAY="(date_trunc('day',now() at time zone 'utc') at time zone 'utc')"
USER='(SELECT id FROM auth.users LIMIT 1)'
def begin(requests=10,tokens=1000,estimate=100): return f"SELECT public.ai_gateway_project_begin({USER},'synthetic_review',false,{requests},{tokens},{estimate});"
def reserve(**args):
    r=value(begin(**args))
    if not r.get('ok') or not re.fullmatch('[0-9a-f-]{36}',r.get('reservation_id','')): raise Stop('RESERVATION_NOT_CONFIRMED')
    return r['reservation_id']
def rpc(name,rid,tail=''): return value(f"SELECT public.ai_gateway_project_{name}('{rid}'::uuid{tail});")
def counter(kind,day='today'):
    when=DAY if day=='today' else DAY+"-interval '1 day'"
    return value(f"SELECT coalesce((SELECT count FROM public.ai_project_usage_counters WHERE window_kind='{kind}' AND window_start={when}),0);")
def seed_expired():
    sql(f"INSERT INTO public.ai_project_usage_counters VALUES ('daily_requests',{DAY},1),('daily_tokens',{DAY},0); INSERT INTO public.ai_project_usage_reservations(user_id,capability,reserved_tokens,status,expires_at) VALUES ({USER},'synthetic_expiry',100,'dispatched',now()-interval '1 second');")
def hold():
    p=subprocess.Popen([DOCKER,'--host',HOST]+psql_args(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
    p.stdin.write(PREFIX+"BEGIN; DO $lock$ BEGIN PERFORM id FROM public.ai_project_usage_reservations WHERE capability='synthetic_expiry' FOR UPDATE; END $lock$;\n\\echo LOCK_READY\n");p.stdin.flush()
    selector=selectors.DefaultSelector();selector.register(p.stdout,selectors.EVENT_READ)
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        if selector.select(.25):
            line=p.stdout.readline()
            if 'LOCK_READY' in line: selector.close();return p
            if not line: break
    p.kill();p.communicate();raise Stop('LOCK_BARRIER_UNAVAILABLE')
def release(p):
    try:p.communicate('ROLLBACK;\n',timeout=5)
    except subprocess.TimeoutExpired:p.kill();p.communicate();raise Stop('SESSION_SHUTDOWN_FAILED')

def main():
    global CID
    pathlib.Path(ENV['DOCKER_CONFIG']).mkdir(exist_ok=True)
    image=json.loads(docker(['image','inspect',IMAGE,'--format','{{json .RepoDigests}}']).stdout)
    check('cached_official_image', any(d=='postgres@'+IMAGE for d in image))
    r=docker(['run','--detach','--rm','--pull','never','--name',TOKEN,'--label','zikuk.scope='+TOKEN,'--network','none','--read-only','--memory','1g','--cpus','2','--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw','--tmpfs','/tmp:rw','--env','PGDATA=/var/lib/postgresql/data/pgdata','--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB='+DB,IMAGE],timeout=30)
    cid=r.stdout.strip()
    if not re.fullmatch('[a-f0-9]{64}',cid): raise Stop('UNCERTAIN_START_OUTCOME')
    CID=cid
    check('isolation_before_sql',isolated())
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        if docker(['exec',CID,'pg_isready','-h','/var/run/postgresql','-U','postgres','-d',DB],check=False).returncode==0:break
        time.sleep(.2) # bounded readiness-only polling, never a SQL/migration retry
    else:raise Stop('STARTUP_DEADLINE')
    identity=value('SELECT json_build_object(\'database\',current_database(),\'major\',current_setting(\'server_version_num\')::int/10000,\'unixSocket\',inet_server_addr() IS NULL);')
    check('database_identity',identity=={'database':DB,'major':17,'unixSocket':True})
    RESULT['postgresVersion']=value("SELECT to_json(current_setting('server_version'));")
    sql("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid()); INSERT INTO auth.users DEFAULT VALUES; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA storage; CREATE TABLE public.release_canary(id int PRIMARY KEY,payload jsonb NOT NULL); INSERT INTO public.release_canary VALUES (1,'{\"notebook\":\"SYNTHETIC_A\"}'),(2,'{\"pdf\":\"SYNTHETIC_B\"}'); CREATE TABLE storage.objects(id text PRIMARY KEY,bytes bytea); INSERT INTO storage.objects VALUES ('synthetic-object',decode('000102','hex'));")
    canary=snapshot()
    original=(ROOT/'supabase/migrations/022_ai_project_spending_guard.sql').read_text()
    corrected=(ROOT/'scripts/security/release-audit/migration022-corrected-rehearsal.sql').read_text()
    RESULT['sqlSha256']={'original':hashlib.sha256(original.encode()).hexdigest(),'corrected':hashlib.sha256(corrected.encode()).hexdigest()}
    sql(original);base_functions=functions();check('original_migration_compatibility',snapshot()==canary)
    reset();seed_expired();p=hold()
    try:
        r=value('BEGIN;'+begin(tokens=100)+'ROLLBACK;')
        check('baseline_expired_liability_defect_reproduced',r.get('ok') is True,meaning='unsafe admission reproduced; NOT security acceptance')
    finally:release(p)
    reset()
    sql(f"INSERT INTO public.ai_project_usage_counters VALUES ('daily_requests',{DAY}-interval '1 day',1),('daily_requests',{DAY},5),('daily_tokens',{DAY},0); INSERT INTO public.ai_project_usage_reservations(user_id,capability,reserved_tokens,status,created_at,expires_at) VALUES ({USER},'synthetic_yesterday',100,'pending',{DAY}-interval '2 hours',{DAY}-interval '1 hour');")
    r=value('BEGIN;'+begin(requests=5)+'ROLLBACK;');check('baseline_wrong_day_defect_reproduced',r.get('ok') is True,meaning='unsafe refund reproduced; NOT security acceptance')
    reset()
    guard=corrected[corrected.index('do $rehearsal_guard$'):corrected.index('$rehearsal_guard$;')+len('$rehearsal_guard$;')]
    before=functions()
    sql("SET zikuk.isolated_rehearsal='INVALID';"+guard,expected='P0001');check('wrong_marker_stops_before_ddl',functions()==before)
    sql(f"BEGIN; INSERT INTO public.ai_project_usage_reservations(user_id,capability,reserved_tokens,status,created_at,expires_at,settled_at) VALUES ({USER},'synthetic_legacy',100,'settled',{DAY}-interval '2 hours',{DAY}-interval '1 hour',now());"+guard,expected='P0001')
    check('legacy_cross_day_stops_before_ddl',functions()==before and snapshot()==canary and not ledger()['r'])
    sql(corrected);check('corrected_migration_compatibility',snapshot()==canary)
    rid=reserve();rpc('dispatch',rid);rpc('settle',rid,',70');saved=ledger()
    sql(original);check('rollback_restores_definitions_preserves_data',functions()==base_functions and ledger()==saved and snapshot()==canary)
    sql(corrected);check('planned_corrected_restore_preserves_data',ledger()==saved and snapshot()==canary)
    reset();seed_expired();p=hold()
    try:sql(begin(tokens=100),expected='55P03');check('locked_expired_liability_fails_closed',counter('daily_requests')==1)
    finally:release(p)
    r=value(begin(tokens=100));check('expired_dispatched_liability_is_charged',r.get('ok') is False and counter('daily_tokens')==100)
    reset()
    sql(f"INSERT INTO public.ai_project_usage_counters VALUES ('daily_requests',{DAY}-interval '1 day',1),('daily_requests',{DAY},5),('daily_tokens',{DAY},0); INSERT INTO public.ai_project_usage_reservations(user_id,capability,reserved_tokens,status,created_at,expires_at) VALUES ({USER},'synthetic_yesterday',100,'pending',{DAY}-interval '2 hours',{DAY}-interval '1 hour');")
    r=value(begin(requests=5));check('wrong_day_refund_fixed',r.get('ok') is False and counter('daily_requests')==5 and counter('daily_requests','yesterday')==0)
    reset()
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool: results=list(pool.map(lambda _:value(begin(requests=2,tokens=200)),range(20)))
    check('concurrent_admission_exact_capacity',sum(r.get('ok') is True for r in results)==2 and counter('daily_requests')==2,admitted=sum(r.get('ok') is True for r in results),denied=sum(r.get('ok') is False for r in results))
    reset();rid=reserve();check('dispatch_confirmed',rpc('dispatch',rid).get('dispatched') is True)
    check('dispatched_release_denied',rpc('release',rid).get('ok') is False)
    sql(f"UPDATE public.ai_project_usage_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE id='{rid}'::uuid;")
    value('SELECT public.ai_gateway_project_cleanup_expired();')
    check('conservative_charge_cannot_be_released',counter('daily_tokens')==100 and rpc('release',rid).get('ok') is False and counter('daily_tokens')==100)
    check('delayed_settlement_reconciles',rpc('settle',rid,',60').get('ok') is True and counter('daily_tokens')==60)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: duplicates=list(pool.map(lambda _:rpc('settle',rid,',60'),range(8)))
    check('duplicate_concurrent_settlement_no_double_charge',all(r.get('ok') is True for r in duplicates) and counter('daily_tokens')==60)
    check('conflicting_settlement_denied',rpc('settle',rid,',61').get('ok') is False and counter('daily_tokens')==60)
    reset();rid=reserve();rpc('dispatch',rid);r=rpc('settle',rid,',120');check('above_reservation_spend_recorded_but_fails',r.get('ok') is False and counter('daily_tokens')==120)
    reset();rid=reserve();sql(f"UPDATE public.ai_project_usage_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE id='{rid}'::uuid;");check('expired_pending_cannot_dispatch',rpc('dispatch',rid).get('ok') is False)
    for role in ['anon','authenticated']:
        sql('SET ROLE '+role+'; SELECT * FROM public.ai_project_usage_counters;',expected='42501')
        sql('SET ROLE '+role+"; SELECT public.ai_gateway_project_cleanup_expired();",expected='42501')
    check('ordinary_role_acl_denials',True)
    sql("SET ROLE service_role; SELECT public.ai_gateway_project_cleanup_expired();")
    check('service_role_execution',True)
    sql("BEGIN; INSERT INTO public.release_canary VALUES (3,'{}'); ROLLBACK;")
    check('rollback_canaries_unchanged',snapshot()==canary)
    check('final_isolation',isolated())
    RESULT['status']='PASS'

try:main()
except Exception as e:
    RESULT['status']='FAIL';RESULT['failure']=str(e) if isinstance(e,Stop) else type(e).__name__
    print(json.dumps({'status':'FAIL','failure':RESULT['failure']}),flush=True)
finally:
    if CID:
        try:
            if isolated():docker(['stop','--time','5',CID]);RESULT['cleanup']='PASS'
            else:RESULT['cleanup']='UNKNOWN_OWNERSHIP_OR_ISOLATION'
        except Exception:RESULT['cleanup']='UNKNOWN'
    OUT.write_text(json.dumps(RESULT,indent=2)+'\n')
    print(json.dumps({'status':RESULT['status'],'cleanup':RESULT['cleanup'],'checks':len(RESULT['checks'])}),flush=True)
if RESULT['status']!='PASS' or RESULT['cleanup']!='PASS':raise SystemExit(1)
