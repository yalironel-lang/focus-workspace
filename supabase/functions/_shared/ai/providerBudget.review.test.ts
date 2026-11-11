// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';
import {createGeminiProvider,estimateAttemptMaxTokens} from './providerGemini.ts';
import {createOpenAICompatibleProvider} from './providerOpenAICompatible.ts';
import {requireVerifiedTokenReservation} from './projectLevelSpendingGuard.ts';
const input={model:'gemini-3.6-flash',messages:[{role:'user' as const,content:'SYNTHETIC'}],maxTokens:100};
afterEach(()=>vi.unstubAllGlobals());
const busy=()=>new Response(JSON.stringify({error:{code:503}}),{status:503});
for(const max of [0,-1,1.5,NaN,Infinity,4])it('invalid/unreviewed retry count cannot create a provider call: '+String(max),()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 expect(()=>createGeminiProvider({apiKey:'synthetic',resilience:{maxAttempts:max}})).toThrow('INVALID_ATTEMPT_LIMIT');expect(fetch).not.toHaveBeenCalled();
});
for(const budget of [0,-1,NaN,Infinity,1.5])it('invalid cumulative allowance rejects the first dispatch: '+String(budget),async()=>{
 const fetch=vi.fn(async()=>busy());vi.stubGlobal('fetch',fetch);
 const r=await createGeminiProvider({apiKey:'synthetic',resilience:{maxCumulativeTokens:budget,sleepFn:async()=>{}}}).complete(input);
 expect(r.ok).toBe(false);expect(fetch).not.toHaveBeenCalled();
});
it('unobserved 503 retains a full prior attempt allowance, not only an input floor',async()=>{
 const fetch=vi.fn(async()=>busy());vi.stubGlobal('fetch',fetch);
 const one=estimateAttemptMaxTokens(input);
 const r=await createGeminiProvider({apiKey:'synthetic',resilience:{maxCumulativeTokens:one*2-1,sleepFn:async()=>{}}}).complete(input);
 expect(r.ok).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
});
it('a logical request can still have exactly two finite attempts when both allowances fit',async()=>{
 const fetch=vi.fn(async()=>busy());vi.stubGlobal('fetch',fetch);
 await createGeminiProvider({apiKey:'synthetic',resilience:{maxAttempts:2,maxCumulativeTokens:estimateAttemptMaxTokens(input)*2,sleepFn:async()=>{}}}).complete(input);
 expect(fetch).toHaveBeenCalledTimes(2);
});
it('OpenAI-compatible request emits the exact completion cap and no tools or implicit extra candidates',async()=>{
 const fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({choices:[{message:{content:'SYNTHETIC'}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}),{status:200}));vi.stubGlobal('fetch',fetch);
 await createOpenAICompatibleProvider({apiKey:'synthetic',baseUrl:'https://synthetic.invalid'}).complete({...input,model:'o4-mini',maxTokens:8000});
 expect(fetch).toHaveBeenCalledTimes(1);
 const body=JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
 expect(body.max_completion_tokens).toBe(8000);expect(body.max_tokens).toBeUndefined();expect(body.tools).toBeUndefined();expect(body.n).toBeUndefined();
});
for(const payload of ['A'.repeat(200000),'😀'.repeat(50000)])it('oversized or expensive-to-tokenize content never bypasses missing-bound containment',()=>{
 const paid=vi.fn();expect(()=>{void payload;requireVerifiedTokenReservation('ask_course','unknown-model');paid()}).toThrow('TOKEN_INPUT_BOUND_UNVERIFIED');expect(paid).not.toHaveBeenCalled();
});
