import {describe,it,expect,vi} from '/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023/node_modules/vitest/dist/index.js';
import {createPostgresProjectSpendingStore,getSafeTokenReservation} from '/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023/supabase/functions/_shared/ai/projectLevelSpendingGuard.ts';
import {confirmProjectDispatch,finalizeProjectAccounting} from '/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023/supabase/functions/_shared/ai/projectAccounting.ts';
import {resolveServerMaxOutputTokens} from '/Users/ylyrwnl/focus-dev/zikuk-m4-rc-7604708-20261023/supabase/functions/_shared/ai/chatCompletionsRequestPolicy.ts';
const input={userId:'synthetic-review-user',capability:'explain_selection',config:{maxDailyTokens:10000},estimatedTokens:100};
function mock(failure?:string){return {rpc:vi.fn(async(fn:string,args?:Record<string,unknown>)=>{
 if(fn===failure)return {data:{ok:false},error:null};
 if(fn==='ai_gateway_project_begin')return {data:{ok:true,reservation_id:'synthetic-reservation',reserved_tokens:100},error:null};
 if(fn==='ai_gateway_project_dispatch')return {data:{ok:true,dispatched:true},error:null};
 if(fn==='ai_gateway_project_settle')return {data:{ok:true,settled_tokens:args?.p_actual_tokens},error:null};
 return {data:{ok:true,released:true},error:null};
})}}
describe('independent source-based challenges',()=>{
 it('valid token request completes with one durable dispatch and matching settlement',async()=>{
  const c=mock(),d=await createPostgresProjectSpendingStore(c).begin(input);expect(d.allowed).toBe(true);if(!d.allowed)throw Error();
  await Promise.all([confirmProjectDispatch(d),confirmProjectDispatch(d)]);await Promise.all([finalizeProjectAccounting(d,80,100,true),finalizeProjectAccounting(d,80,100,true)]);
  expect(c.rpc.mock.calls.map(x=>x[0])).toEqual(['ai_gateway_project_begin','ai_gateway_project_dispatch','ai_gateway_project_settle']);
 });
 it('failed settlement stays failed on repeated calls and cannot release the reservation',async()=>{
  const c=mock('ai_gateway_project_settle'),d=await createPostgresProjectSpendingStore(c).begin(input);if(!d.allowed)throw Error();await confirmProjectDispatch(d);
  await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow();expect((await d.releaseReservation())?.ok).toBe(false);expect(c.rpc).toHaveBeenCalledTimes(3);
 });
 it('unknown paid usage settles at least its reserved estimate',async()=>{
  const c=mock(),d=await createPostgresProjectSpendingStore(c).begin(input);if(!d.allowed)throw Error();await confirmProjectDispatch(d);await finalizeProjectAccounting(d,20,100,false);
  expect(c.rpc).toHaveBeenCalledWith('ai_gateway_project_settle',{p_reservation_id:'synthetic-reservation',p_actual_tokens:100});
 });
 it('dollar cap cannot dispatch through direct adapter calls',async()=>{
  const c=mock();expect((await createPostgresProjectSpendingStore(c).begin({...input,config:{...input.config,maxDailyCostMicros:1}})).allowed).toBe(false);expect(c.rpc).not.toHaveBeenCalled();
 });
 it('confirmed defect: o4-mini reservation is less than its allowed output alone',()=>{
  expect(getSafeTokenReservation('explain_selection','o4-mini')).toBe(3500);
  expect(resolveServerMaxOutputTokens('o4-mini','explain_selection')).toBe(8000);
  expect(getSafeTokenReservation('explain_selection','o4-mini')).toBeLessThan(resolveServerMaxOutputTokens('o4-mini','explain_selection'));
 });
});
