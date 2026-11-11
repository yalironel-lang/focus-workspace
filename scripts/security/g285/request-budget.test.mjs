import test from 'node:test';
import assert from 'node:assert/strict';
import { measureBudget } from './budget-model.mjs';
import { assertionRequestLimit, REQUEST_LIMITS } from './request-budget.mjs';
import { boundedFetch, ORIGIN } from './adapter.mjs';
import { requestFailureFacts } from './request-failure.mjs';

test('exact normal and collection cost models are reproducible without counting mock delegation twice',async()=>{
  for(const [scenario,expected,guards] of [['normal',1306,0],['a-unreviewed-storage-mutations',2158,852],['unreviewed-storage-ambiguous',4234,2928]]){
    const r=await measureBudget(scenario);
    assert.equal(r.casesCompleted,72);assert.equal(r.assertionTotal,expected);assert.equal(r.cleanupTotal,250);
    assert.equal(r.guards.reduce((n,g)=>n+g.requests,0),guards);
    assert(r.guards.every(g=>g.requests<=94));
  }
});
test('old diagnostic cap reproduces group-read precheck exhaustion while derived cap completes with FAILs retained',async()=>{
  const old=await measureBudget('a-unreviewed-storage-mutations',1400);
  assert.equal(old.casesCompleted,30);assert.equal(old.requestBudget.assertion.dispatched,1400);
  assert(old.requestBudget.assertion.blocked>0);assert.equal(old.criticalSafetyStop,true);assert.equal(old.cleanup,'PASS');
  const next=await measureBudget('unreviewed-storage-ambiguous',assertionRequestLimit('DIAGNOSTIC_COLLECT'));
  assert.equal(next.casesCompleted,72);assert.equal(next.criticalSafetyStop,false);assert.equal(next.status,'FAIL');
  assert.equal(next.requestBudget.assertion.dispatched,4234);assert.equal(next.requestBudget.assertion.blocked,0);
  assert.equal(next.requestBudget.cleanup.dispatched,250);
});
test('strict acceptance cap and all time/cleanup bounds stay unchanged; invalid limits fail',()=>{
  assert.equal(assertionRequestLimit('ACCEPTANCE'),1400);assert.equal(assertionRequestLimit('DIAGNOSTIC_COLLECT'),4700);
  assert.equal(REQUEST_LIMITS.cleanup,400);assert.equal(REQUEST_LIMITS.assertionMs,900000);
  assert.equal(REQUEST_LIMITS.cleanupMs,120000);assert.equal(REQUEST_LIMITS.requestMs,10000);
  assert.throws(()=>assertionRequestLimit('other'));
  for(const limit of [Infinity,NaN,0,-1,4701,1.5])assert.throws(()=>boundedFetch(undefined,limit),/INVALID_REQUEST_BUDGET/);
});
test('counter charges once per dispatched failed or successful request; exhaustion never dispatches or retries',async()=>{
  let calls=0;
  const fetcher=boundedFetch(async()=>{calls++;if(calls===1)throw Error('PRIVATE_SENTINEL');return new Response('{}')},2);
  await assert.rejects(()=>fetcher(`${ORIGIN}/rest/v1/groups`));
  await fetcher(`${ORIGIN}/rest/v1/groups`);
  await assert.rejects(()=>fetcher(`${ORIGIN}/rest/v1/groups`),error=>requestFailureFacts(error).kind==='REQUEST_BUDGET');
  assert.equal(calls,2);assert.deepEqual(fetcher.stats().assertion,{dispatched:2,blocked:1,limit:2});
  fetcher.beginCleanup();fetcher.beginCleanup();await fetcher(`${ORIGIN}/rest/v1/groups`);
  assert.equal(fetcher.stats().cleanup.dispatched,1);
  const stats=fetcher.stats();stats.assertion.limit=Infinity;assert.equal(fetcher.stats().assertion.limit,2);
});
test('wall-clock deadline is distinguished from request-count exhaustion and remains enforced',async()=>{
  const original=Date.now;let now=1000;Date.now=()=>now;
  try{
    let calls=0;const fetcher=boundedFetch(async()=>{calls++;return new Response('{}')});
    now+=REQUEST_LIMITS.assertionMs;
    await assert.rejects(()=>fetcher(`${ORIGIN}/rest/v1/groups`),error=>requestFailureFacts(error).kind==='RUN_TIME_BUDGET');
    assert.equal(calls,0);assert.equal(fetcher.stats().assertion.dispatched,0);
    fetcher.beginCleanup();now+=REQUEST_LIMITS.cleanupMs;
    await assert.rejects(()=>fetcher(`${ORIGIN}/rest/v1/groups`),error=>requestFailureFacts(error).kind==='RUN_TIME_BUDGET');
    assert.equal(calls,0);
  }finally{Date.now=original}
});
test('cleanup allowance cannot be renewed and remains separately bounded',async()=>{
  let calls=0;const fetcher=boundedFetch(async()=>{calls++;return new Response('{}')},1);
  await fetcher(`${ORIGIN}/rest/v1/groups`);fetcher.beginCleanup();
  for(let i=0;i<400;i++)await fetcher(`${ORIGIN}/rest/v1/groups`);
  fetcher.beginCleanup();await assert.rejects(()=>fetcher(`${ORIGIN}/rest/v1/groups`));
  assert.equal(calls,401);assert.equal(fetcher.stats().cleanup.dispatched,400);
});
test('entry-point mode caps are actual hard dispatch bounds, never automatic extensions',async()=>{
  for(const mode of ['ACCEPTANCE','DIAGNOSTIC_COLLECT']){
    const cap=assertionRequestLimit(mode);let calls=0;
    const fetcher=boundedFetch(async()=>{calls++;return new Response('{}')},cap);
    for(let i=0;i<cap;i++)await fetcher(`${ORIGIN}/rest/v1/groups`);
    await assert.rejects(()=>fetcher(`${ORIGIN}/rest/v1/groups`),error=>requestFailureFacts(error).kind==='REQUEST_BUDGET');
    assert.equal(calls,cap);assert.equal(fetcher.stats().assertion.dispatched,cap);
    assert.equal(fetcher.stats().assertion.blocked,1);assert.equal(fetcher.stats().assertion.limit,cap);
  }
});
test('reviewed recovered response pattern completes strict ACCEPTANCE within unchanged 1400 cap',async()=>{
  const r=await measureBudget('reviewed',assertionRequestLimit('ACCEPTANCE'));
  assert.equal(r.casesCompleted,72);assert.equal(r.status,'PASS');assert.equal(r.cleanup,'PASS');
  assert.equal(r.requestBudget.assertion.limit,1400);assert.equal(r.requestBudget.assertion.blocked,0);
  assert.equal(r.assertionTotal,1314);assert.equal(r.requestBudget.assertion.dispatched,1314);
  assert.equal(r.requestBudget.cleanup.dispatched,250);
});
