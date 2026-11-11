import {describe,it,expect,vi} from 'vitest';
import {createPostgresProjectSpendingStore} from './projectLevelSpendingGuard.ts';
import {confirmProjectDispatch,finalizeProjectAccounting} from './projectAccounting.ts';
const input={userId:'synthetic-user',capability:'ask_course',config:{maxDailyRequests:2,maxDailyTokens:1000},estimatedTokens:100};
function client(lifecycle?:unknown) {
  return {rpc:vi.fn(async(fn:string,args?:Record<string,unknown>)=>fn==='ai_gateway_project_begin'?{data:{ok:true,reservation_id:'synthetic-reservation'},error:null}:lifecycle===undefined?{data:fn==='ai_gateway_project_dispatch'?{ok:true,dispatched:true}:fn==='ai_gateway_project_settle'?{ok:true,settled_tokens:args?.p_actual_tokens}:{ok:true,released:true},error:null}:lifecycle)};
}
const allowed=async(c:ReturnType<typeof client>)=>{
 const d=await createPostgresProjectSpendingStore(c).begin(input);
 if(!d.allowed)throw Error('unexpected fixture denial');return d;
};
describe('authoritative project accounting fail closed',()=>{
 for(const cap of [1,100000]) it(`concurrent dollar-cap requests cannot dispatch without atomic ledger (cap=${cap})`,async()=>{
  const c=client();const s=createPostgresProjectSpendingStore(c);
  const results=await Promise.all(Array.from({length:32},()=>s.begin({...input,config:{...input.config,maxDailyCostMicros:cap}})));
  expect(results.every(x=>!x.allowed)).toBe(true);expect(c.rpc).not.toHaveBeenCalled();
 });
 for(const value of [NaN,Infinity,-1,1.5])it(`malformed configured cap rejects before RPC (${String(value)})`,async()=>{
  const c=client();expect((await createPostgresProjectSpendingStore(c).begin({...input,config:{maxDailyRequests:value}})).allowed).toBe(false);expect(c.rpc).not.toHaveBeenCalled();
 });
 for(const bad of [null,{},[],{data:null,error:null},{data:{ok:false},error:null},{data:{ok:true},error:null},{data:{ok:'true'},error:null},{data:{ok:true,code:'not_found'},error:null},{data:{ok:true},error:{}},{data:{ok:true}},{data:Object.create({ok:true}),error:null}]){
  it('malformed/rejected dispatch prevents the paid provider call',async()=>{
   const c=client(bad),d=await allowed(c),provider=vi.fn();
   await expect((async()=>{await confirmProjectDispatch(d);provider();})()).rejects.toThrow('ACCOUNTING_UNCONFIRMED');expect(provider).not.toHaveBeenCalled();
   await expect(confirmProjectDispatch(d)).rejects.toThrow();expect(c.rpc).toHaveBeenCalledTimes(2);
  });
  it('malformed/rejected settlement never reports successful finalization',async()=>{
   const c=client(bad),d=await allowed(c);await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');
   await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow();expect(c.rpc).toHaveBeenCalledTimes(2);
  });
 }
 it('valid calls coalesce concurrent dispatch/settlement without double charging',async()=>{
  const c=client(),d=await allowed(c);
  await Promise.all([confirmProjectDispatch(d),confirmProjectDispatch(d)]);
  await Promise.all([finalizeProjectAccounting(d,80,100,true),finalizeProjectAccounting(d,80,100,true)]);
  expect(c.rpc.mock.calls.map(x=>x[0])).toEqual(['ai_gateway_project_begin','ai_gateway_project_dispatch','ai_gateway_project_settle']);
  await expect(finalizeProjectAccounting(d,90,100,true)).rejects.toThrow();
  expect((await d.releaseReservation())?.ok).toBe(false);expect(c.rpc).toHaveBeenCalledTimes(3);
 });
 it('uncapped no-reservation response cannot enable unaccounted paid inference',async()=>{
  const c={rpc:vi.fn(async()=>({data:{ok:true,reservation_id:null},error:null}))};
  expect((await createPostgresProjectSpendingStore(c).begin({...input,config:{}})).allowed).toBe(false);
 });
 it('late dispatch confirmation cannot reopen a finalized reservation',async()=>{
  let resolve!:(v:{data:{ok:true};error:null})=>void;
  const c={rpc:vi.fn((fn:string)=>fn==='ai_gateway_project_dispatch'?new Promise<{data:{ok:true};error:null}>(r=>{resolve=r}):Promise.resolve({data:{ok:true,reservation_id:'synthetic-reservation'},error:null}))};
  const d=await createPostgresProjectSpendingStore(c).begin(input);if(!d.allowed)throw Error('fixture');
  const dispatch=confirmProjectDispatch(d);await d.releaseReservation();resolve({data:{ok:true},error:null});await expect(dispatch).rejects.toThrow();
 });
 it('authoritative atomic admission result preserves the shared request cap across clients',async()=>{
  let admitted=0;
  const c={rpc:vi.fn(async(fn:string)=>fn==='ai_gateway_project_begin'
   ? ++admitted<=2?{data:{ok:true,reservation_id:'synthetic-'+admitted},error:null}:{data:{ok:false,code:'quota_exceeded',reason:'project_daily_request_limit_exceeded'},error:null}
   :{data:{ok:true},error:null})};
  const results=await Promise.all(Array.from({length:20},()=>createPostgresProjectSpendingStore(c).begin(input)));
  expect(results.filter(x=>x.allowed)).toHaveLength(2);
 });
 it('error details/identifiers never enter accounting diagnostics',async()=>{
  const spy=vi.spyOn(console,'error');const c=client({data:null,error:{message:'PRIVATE_SENTINEL'}}),d=await allowed(c);
  try { const result=await d.settleReservation(80);expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');expect(spy).not.toHaveBeenCalled(); }finally{spy.mockRestore()}
 });
});

it('incomplete paid usage retains the conservative token charge rather than only partial usage',async()=>{
 const c=client(),d=await allowed(c);await confirmProjectDispatch(d);await finalizeProjectAccounting(d,20,100,false);
 expect(c.rpc).toHaveBeenCalledWith('ai_gateway_project_settle',{p_reservation_id:'synthetic-reservation',p_actual_tokens:100});
});
it('thrown settlement preserves failure without a release or retry',async()=>{
 const c=client(),d=await allowed(c);await confirmProjectDispatch(d);
 c.rpc.mockImplementation(async()=>{throw Error('PRIVATE_SENTINEL')});
 await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');
 await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');
 expect(c.rpc).toHaveBeenCalledTimes(3);
});

it('settlement confirmation must match the requested token amount',async()=>{
 const c=client({data:{ok:true,settled_tokens:1},error:null}),d=await allowed(c);
 await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');
});

it('inherited and accessor success cannot confirm accounting or execute getters',async()=>{
 let reads=0;
 const c=client({data:Object.defineProperty({},'ok',{get(){reads++;return true}}),error:null}),d=await allowed(c);
 await expect(confirmProjectDispatch(d)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');expect(reads).toBe(0);
});

it('accessor contradiction fields are not mistaken for absent optional fields',async()=>{
 let reads=0;
 const data=Object.defineProperty({ok:true,dispatched:true,settled_tokens:80},'code',{get(){reads++;return 'not_found'}});
 const c=client({data,error:null}),d=await allowed(c);
 await expect(confirmProjectDispatch(d)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');
 await expect(finalizeProjectAccounting(d,80,100,true)).rejects.toThrow('ACCOUNTING_UNCONFIRMED');expect(reads).toBe(0);
});

it('success-shaped partial usage cannot reduce reservation without verified completeness',async()=>{
 const c=client(),d=await allowed(c);await confirmProjectDispatch(d);
 // Gateway now deliberately omits usageComplete: HTTP/model success is insufficient.
 await finalizeProjectAccounting(d,20,100);
 expect(c.rpc).toHaveBeenCalledWith('ai_gateway_project_settle',{p_reservation_id:'synthetic-reservation',p_actual_tokens:100});
});
