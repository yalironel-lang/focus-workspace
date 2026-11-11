import type { ProjectGuardDecision } from './projectLevelSpendingGuard.ts';
type Allowed = Extract<ProjectGuardDecision, {allowed:true}>;
function confirmed(value: unknown): void {
  try {
    if (!value || typeof value!=='object' || Array.isArray(value)
        || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw Error();
    const ok=Object.getOwnPropertyDescriptor(value,'ok');
    const error=Object.getOwnPropertyDescriptor(value,'error');
    if (!ok || !('value' in ok) || ok.value!==true
        || error && (!('value' in error) || error.value!==undefined)) throw Error();
  } catch { throw new Error('ACCOUNTING_UNCONFIRMED'); }
}
/** Awaited before every provider dispatch; failures never dispatch or retry. */
export async function confirmProjectDispatch(decision: Allowed): Promise<void> {
  if (!decision.dispatchReservation) throw new Error('ACCOUNTING_UNCONFIRMED');
  confirmed(await decision.dispatchReservation());
}
/** Failed or ambiguous finalization must not return a successful paid response. */
export async function finalizeProjectAccounting(decision: Allowed, actualTokens: number | undefined, estimatedTokens: number, usageComplete = false): Promise<void> {
  const known=typeof actualTokens==='number' && Number.isSafeInteger(actualTokens) && actualTokens>0;
  const result=known && usageComplete
    ? await decision.settleReservation(actualTokens)
    : decision.isDispatched?.()
      ? await decision.settleReservation(Math.max(estimatedTokens,known?actualTokens:0))
      : await decision.releaseReservation();
  confirmed(result);
}
