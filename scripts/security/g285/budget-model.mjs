// Offline accounting for the actual core runner using its synthetic backend.
import { randomUUID } from 'node:crypto';
import { backend } from './synthetic-backend.mjs';
import { runAcceptance, EXPECTED_CASES } from './core.mjs';
import { boundedFetch, ORIGIN } from './adapter.mjs';

export async function measureBudget(scenario = 'normal', enforcedLimit = null) {
  const b = backend();
  const schedule = [...EXPECTED_CASES.filter(id => id.startsWith('owner-')),
    ...EXPECTED_CASES.filter(id => id.startsWith('cross-'))];
  let active = schedule[0], injected = false, inGuard = false, depth = 0;
  let requests = 0, cleanupStart = null, previous = 0, guardStart = 0;
  const cases = [], guards = [];
  const budget = enforcedLimit === null ? null : boundedFetch(async()=>new Response('{}'),enforcedLimit);
  if(budget)for(let i=0;i<4;i++)await budget(`${ORIGIN}/auth/v1/user`);
  for (const [i,user] of b.clients.entries()) for (const key of Object.keys(user)) {
    if (typeof user[key] !== 'function') continue;
    const original = user[key];
    user[key] = async (...args) => {
      const outer = depth === 0;
      if (outer) requests++;
      depth++;
      try {
        if(outer&&budget)await budget(`${ORIGIN}/rest/v1/groups`);
        const prefix = `cross-${i}-`;
        const resource = active?.includes('user-content') ? 'user-content' : 'pdfs';
        const operation = active?.slice((prefix+resource+'-').length);
        const method = operation === 'delete' ? 'removeObject' : operation === 'update' ? 'updateObject'
          : operation?.startsWith('move-') ? 'move' : operation;
        const cross = typeof args[1] === 'string' && (!args[1].startsWith(user.id+'/')
          || key === 'move' && !args[2].startsWith(user.id+'/'));
        const mutation = ['upload','overwrite','updateObject','move','removeObject'].includes(key);
        const legacy = ['all-storage-ambiguous','unreviewed-storage-ambiguous'].includes(scenario)
          || ['a-storage-mutations','a-unreviewed-storage-mutations'].includes(scenario) && i === 0 && mutation
          || scenario === 'reviewed' && (mutation && key !== 'removeObject' || resource === 'user-content' && ['download','sign'].includes(key));
        if (outer && !inGuard && !injected && legacy && active?.startsWith(prefix+resource+'-')
          && args[0] === resource && key === method && cross) {
          injected = true;
          const logical = scenario === 'reviewed' ? ['move-foreign-source','download','sign'].includes(operation) ? '404' : '403'
            : scenario.includes('unreviewed') && ['upload','overwrite','update','move-owned-to-foreign'].includes(operation) ? '404' : '403';
          return {data:null,error:{name:'StorageApiError',status:400,statusCode:logical},
            transportHttpStatus:400,transportClassification:logical==='404'?'STORAGE_NO_SUCH_KEY':'STORAGE_AUTHORIZATION_ERROR'};
        }
        return await original(...args);
      } finally { depth--; }
    };
  }
  const report = await runAcceptance(b.clients, e => {
    if (e.status === 'PASS' || e.status === 'FAIL') {
      if (schedule.includes(e.case)) {
        cases.push({case:e.case,requests:requests-previous,cumulative:requests,status:e.status});previous=requests;
        if (e.status === 'FAIL') {inGuard=true;guardStart=requests;}
        else {active=schedule[cases.length];injected=false;}
      }
    }
    if (e.event === 'CONTINUATION_GUARD') {
      guards.push({case:e.case,requests:requests-guardStart,cumulative:requests,continued:e.continued});
      previous=requests;inGuard=false;active=schedule[cases.length];injected=false;
    }
  },randomUUID,()=>{},()=>{cleanupStart=requests;budget?.beginCleanup();},{mode:['normal','reviewed'].includes(scenario)?'ACCEPTANCE':'DIAGNOSTIC_COLLECT'});
  if(budget)for(let i=0;i<2;i++)await budget(`${ORIGIN}/auth/v1/logout`,{method:'POST'});
  // Four normal auth requests precede core; two local signouts follow cleanup.
  return {scenario,model:'one SDK request per outer adapter call; no SDK retry',
    casesCompleted:report.cases,status:report.status,cleanup:report.cleanup,
    coreAssertionRequests:cleanupStart,authRequests:4,assertionTotal:cleanupStart+4,
    cleanupCoreRequests:requests-cleanupStart,signoutRequests:2,cleanupTotal:requests-cleanupStart+2,
    cases,guards,requestBudget:budget?.stats()??null,criticalSafetyStop:report.summary?.criticalSafetyStop??false};
}
