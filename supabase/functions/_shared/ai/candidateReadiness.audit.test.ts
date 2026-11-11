import { describe, it, expect, vi } from 'vitest';
import { checkProjectSpendingGuard, createPostgresProjectSpendingStore } from './projectLevelSpendingGuard';

// Regression tests assert that the previously reproduced defects are blocked.
describe('candidate readiness: durable spending contract evidence', () => {
  it('cost-only cap fails closed until an atomic dollar ledger exists', async () => {
    const rpc = vi.fn(async () => ({data:{ok:true,reservation_id:null},error:null}));
    const loadDayUsage = vi.fn(async () => ({requestCount:0,totalTokens:0,totalCostMicros:999999,unpricedRequestCount:0}));
    const result = await checkProjectSpendingGuard({
      config:{maxDailyCostMicros:1},loadDayUsage,userId:'synthetic-user',capability:'ask_course',estimatedRequestTokens:100,
      store:createPostgresProjectSpendingStore({rpc}),
    });
    expect(result.allowed).toBe(false);
    expect(loadDayUsage).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('missing begin RPC denies admission rather than allowing provider dispatch', async () => {
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      const rpc=vi.fn(async()=>({data:null,error:{message:'synthetic_missing_rpc'}}));
      const result=await createPostgresProjectSpendingStore({rpc}).begin({userId:'synthetic-user',capability:'ask_course',config:{},estimatedTokens:100});
      expect(result.allowed).toBe(false);
    } finally { log.mockRestore(); }
  });

  it('application-level settlement rejection fails closed', async () => {
    const rpc=vi.fn(async(fn:string)=>fn==='ai_gateway_project_begin'
      ? {data:{ok:true,reservation_id:'synthetic-reservation'},error:null}
      : {data:{ok:false,code:'not_found'},error:null});
    const decision=await createPostgresProjectSpendingStore({rpc}).begin({userId:'synthetic-user',capability:'ask_course',config:{maxDailyRequests:1},estimatedTokens:100});
    expect(decision.allowed).toBe(true);
    const settlement=await decision.settleReservation(80);
    expect(settlement).toEqual({ok:false,error:'ACCOUNTING_UNCONFIRMED'});
    expect(rpc).toHaveBeenCalledWith('ai_gateway_project_settle',{p_reservation_id:'synthetic-reservation',p_actual_tokens:80});
  });
});
