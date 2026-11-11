import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('./deploy-staging.sh', import.meta.url), 'utf8');
test('local evidence and fixture directories are excluded from the deployment upload',()=>{
  const rules=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8').split(/\r?\n/);
  for(const rule of ['scratch','docs/fixtures','security','scripts/security','cross_layout_*.png']) assert.ok(rules.includes(rule));
});
// Execute the actual reviewed script in a disposable checkout, never a live CLI.
function run(response, { exit = 0, alias = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zikuk-deploy-outcome-'));
  try {
    mkdirSync(join(root, 'scripts')); mkdirSync(join(root, '.vercel-staging')); mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'scripts/deploy-staging.sh'), source);
    writeFileSync(join(root, '.vercel-staging/project.json'), JSON.stringify({ projectId: 'synthetic-staging-project', orgId: 'synthetic-org', projectName: 'synthetic-staging' }));
    const shim = `#!${process.execPath}\n` + `
      const fs=require('node:fs');const path=require('node:path');
      const name=path.basename(process.argv[1]);const args=process.argv.slice(2);
      fs.appendFileSync(process.env.CALLS,JSON.stringify({name,args})+'\\n');
      if(name==='git'){console.log('synthetic-source');process.exit(0)}
      if(name==='npx'){
        if(args[0]==='vercel'&&args[1]==='deploy'){process.stdout.write(process.env.RESPONSE);process.exit(Number(process.env.DEPLOY_EXIT))}
        if(args[0]==='vercel'&&args[1]==='alias')process.exit(0);
        process.exit(91);
      }
      if(name==='curl'){
        const dest=args[args.indexOf('-o')+1];
        fs.writeFileSync(dest,args.some(x=>x.includes('/assets/'))?'lmgrhmyurhjlwwdedojk staging-magic-link-form':'<script src="/assets/index-synthetic.js"></script>');process.exit(0);
      }
      process.exit(92);
    `;
    for (const name of ['npx', 'curl', 'git']) writeFileSync(join(root, 'bin', name), shim, { mode: 0o700 });
    const result = spawnSync('/bin/bash', [join(root, 'scripts/deploy-staging.sh')], {
      env: { PATH: `${join(root,'bin')}:${dirname(process.execPath)}:/usr/bin:/bin`, ZIKUK_ALLOW_STAGING_DEPLOY:'1', ZIKUK_UPDATE_STAGING_ALIAS:alias?'1':'0', CALLS:join(root,'calls'), RESPONSE:response, DEPLOY_EXIT:String(exit) },
      encoding:'utf8', timeout:5000,
    });
    const calls = readFileSync(join(root,'calls'),'utf8').trim().split('\n').map(JSON.parse);
    return { ...result, calls };
  } finally { rmSync(root, {recursive:true,force:true}); }
}
const ready = {url:'https://zikuk-staging-synthetic.vercel.app',id:'synthetic-deployment',readyState:'READY'};
for (const [name,response,exit] of [
  ['empty response','',0],['malformed JSON','{not-json',0],['null','null',0],['missing URL','{"readyState":"READY"}',0],
  ['missing readiness',JSON.stringify({url:ready.url}),0],['building',JSON.stringify({...ready,readyState:'BUILDING'}),0],
  ['error state',JSON.stringify({...ready,readyState:'ERROR'}),0],['CLI failed after possible submission',JSON.stringify(ready),1],
  ['malformed URL field',JSON.stringify({...ready,url:{}}),0],['insecure URL',JSON.stringify({...ready,url:'http://zikuk-staging-synthetic.vercel.app'}),0],
  ['unexpected host',JSON.stringify({...ready,url:'https://example.invalid'}),0],['missing deployment ID',JSON.stringify({url:ready.url,readyState:'READY'}),0],
  ['untrusted diagnostic text','PRIVATE_SENTINEL arbitrary output',0],
]) for (const alias of [false,true]) test(`${name}: exactly one deploy, no alias or network verification (alias=${alias})`,()=>{
  const r=run(response,{exit,alias});
  assert.notEqual(r.status,0); assert.equal(r.error,undefined);
  assert.equal(r.calls.filter(x=>x.name==='npx'&&x.args[1]==='deploy').length,1);
  assert.equal(r.calls.filter(x=>x.name==='npx'&&x.args[1]==='alias').length,0);
  assert.equal(r.calls.filter(x=>x.name==='curl').length,0);
  assert.doesNotMatch(r.stdout+r.stderr,/\[deploy:staging\] SUCCESS|PRIVATE_SENTINEL/);
});
for (const alias of [false,true]) test(`complete READY response: one deploy and expected verification (alias=${alias})`,()=>{
  const r=run(JSON.stringify(ready),{alias}); assert.equal(r.status,0,r.stderr);
  assert.equal(r.calls.filter(x=>x.name==='npx'&&x.args[1]==='deploy').length,1);
  assert.equal(r.calls.filter(x=>x.name==='npx'&&x.args[1]==='alias').length,Number(alias));
  assert.equal(r.calls.filter(x=>x.name==='curl').length,2); assert.match(r.stdout,/\[deploy:staging\] SUCCESS/);
});
