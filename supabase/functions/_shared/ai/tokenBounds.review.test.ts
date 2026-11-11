import {describe,it,expect,vi} from 'vitest';
import {getSafeTokenReservation,requireVerifiedTokenReservation} from './projectLevelSpendingGuard.ts';
import {resolveServerMaxOutputTokens} from './chatCompletionsRequestPolicy.ts';
describe('release input-token bound containment',()=>{
 for(const capability of ['ask_course','explain_selection'] as const) for(const model of ['o4-mini','o3-mini','gpt-4o','gpt-5.6-luna','gemini-3.6-flash']) {
  it(`${capability}/${model}: planning allowance cannot be below allowed output`,()=>{
   expect(getSafeTokenReservation(capability,model)).toBeGreaterThanOrEqual(resolveServerMaxOutputTokens(model,capability));
  });
  it(`${capability}/${model}: no paid dispatch without reviewed input proof`,()=>{
   const paid=vi.fn();expect(()=>{requireVerifiedTokenReservation(capability,model);paid()}).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');expect(paid).not.toHaveBeenCalled();
  });
 }
 it('an unknown model cannot bypass the containment',()=>expect(()=>requireVerifiedTokenReservation('ask_course','unknown')).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED'));
});
