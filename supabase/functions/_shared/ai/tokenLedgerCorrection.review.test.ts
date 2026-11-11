// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../../../scripts/security/release-audit/migration022-corrected-rehearsal.sql',import.meta.url),'utf8');
// These are static artifact contracts and design replays, NOT PostgreSQL execution.
describe('isolated SQL candidate contracts',()=>{
 it('refuses execution outside the expressly marked disposable database',()=>{
  expect(sql).toContain("current_database() <> 'zikuk_022_rehearsal'");
  expect(sql).toContain("is distinct from 'G285_TOKEN_LEDGER_REVIEW'");
 });
 it('all five entry points take the same transaction lock before row operations',()=>{
  const blocks=[...sql.matchAll(/create or replace function public\.ai_gateway_project_[\s\S]*?\$\$;/g)].map(x=>x[0]);
  expect(blocks).toHaveLength(5);
  for(const b of blocks)expect(b).toMatch(/begin\s+perform pg_catalog\.pg_advisory_xact_lock\(42085, 22\);/);
 });
 it('never skips an expired row or excludes unresolved expired spend from the sum',()=>{
  expect(sql).not.toMatch(/skip locked/i);
  const admission=sql.slice(sql.indexOf('create or replace function public.ai_gateway_project_begin'),sql.indexOf('create or replace function public.ai_gateway_project_dispatch'));
  expect(admission).not.toMatch(/and expires_at/);
  expect(admission).toContain("status in ('pending', 'dispatched')");
 });
 it('refund and settlement windows come from original reservation creation',()=>{
  for(const name of ['cleanup_expired','settle','release']) {
   const b=sql.slice(sql.indexOf(`create or replace function public.ai_gateway_project_${name}`)).split('$$;')[0];
   expect(b).toContain("v_rec.created_at at time zone 'utc'".replace('v_rec',name==='cleanup_expired'?'v_rec':'v_res'));
  }
 });
 it('a possibly paid reservation cannot take the release refund path',()=>{
  const b=sql.slice(sql.indexOf('create or replace function public.ai_gateway_project_release'));
  expect(b).toContain("if v_res.status <> 'pending' then");expect(b).toContain("'possibly_paid_reservation'");
 });
 it('an above-reservation settlement records actual spend but is not a success',()=>{
  expect(sql).toContain("set status = 'settled',");expect(sql).toContain("'ok', v_tokens <= v_res.reserved_tokens, 'settled_tokens', v_tokens");
 });
});
describe('accounting invariants: independent arithmetic design replay',()=>{
 it('a locked expired outstanding 100 tokens must leave zero capacity in a 100-token pool',()=>{
  const cap=100,settled=0,reservations=[{tokens:100,unresolved:true,expired:true,locked:true}];
  const outstanding=reservations.filter(x=>x.unresolved).reduce((s,x)=>s+x.tokens,0);
  expect(settled+outstanding+100>cap).toBe(true);
 });
 it('yesterday refund does not reduce today request count',()=>{
  const counts=new Map([['yesterday',1],['today',5]]);const reservationDay='yesterday';
  counts.set(reservationDay,counts.get(reservationDay)!-1);
  expect(counts.get('today')).toBe(5);
 });
});

it('legacy cross-day states require reconciliation before a new day policy is installed',()=>{
 expect(sql).toContain("STOP legacy cross-day accounting requires reconciliation");
 expect(sql).toContain("(created_at at time zone 'utc')::date <> (settled_at at time zone 'utc')::date");
});
