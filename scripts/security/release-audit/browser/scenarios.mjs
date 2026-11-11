import assert from 'node:assert/strict';
export const scenarios=[];
export let setup;
const test=(id,run)=>scenarios.push({id,run});
test.beforeEach=fn=>{setup=fn};
const expect=value=>({toBe:expected=>assert.equal(value,expected)});
const route='/scripts/security/release-audit/browser/index.html';
test.beforeEach(async({context,page})=>{
  await context.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.origin!=='http://127.0.0.1:4179')throw Error('OFFLINE_NETWORK_BOUNDARY');
    await r.continue();
  });
  await page.goto(route);await page.waitForFunction(()=>Boolean(window.__releaseModules));
});
test('notebook legacy persistence survives browser reload',async({page})=>{
  expect(await page.evaluate(()=>{
    const n=window.__releaseModules.notebook.migrateLegacyNotebook({type:'notebook',body:'SYNTHETIC_NOTE',paperStyle:'ruled',notebookMode:'normal',notebookSurface:'spatial'});
    localStorage.setItem('synthetic-notebook',JSON.stringify(n));return n.pages.length>0;
  })).toBe(true);
  await page.reload();await page.waitForFunction(()=>window.__releaseModules);
  expect(await page.evaluate(()=>JSON.stringify(window.__releaseModules.notebook.migrateLegacyNotebook(JSON.parse(localStorage.getItem('synthetic-notebook')))).includes('SYNTHETIC_NOTE'))).toBe(true);
});
test('actual IndexedDB sync queue survives reload and remains account scoped',async({page})=>{
  expect(await page.evaluate(async()=>{
    const r=await window.__releaseModules.queue.enqueuePendingOperation({namespace:{userId:'synthetic-a',workspaceId:'synthetic-workspace'},entityType:'note',entityId:'synthetic-note',operationType:'create',payload:{text:'SYNTHETIC_QUEUE'}});return r.ok;
  })).toBe(true);
  await page.reload();await page.waitForFunction(()=>window.__releaseModules);
  expect(await page.evaluate(async()=>{
    const q=window.__releaseModules.queue;
    const a=await q.listPendingOperations({userId:'synthetic-a',workspaceId:'synthetic-workspace'});
    const b=await q.listPendingOperations({userId:'synthetic-b',workspaceId:'synthetic-workspace'});
    return a.ok && b.ok && a.value.length===1 && b.value.length===0 && a.value[0].payload.text==='SYNTHETIC_QUEUE';
  })).toBe(true);
});
test('PDF geometry stays bounded at mobile pixel ratios',async({page})=>{
  expect(await page.evaluate(()=>[1,2,3].every(dpr=>{
    const p=window.__releaseModules.pdf.pdfCanvasRenderPlan(612,792,390,2.5,dpr);
    return p.backingWidth<=4096 && p.backingHeight<=4096 && p.backingWidth*p.backingHeight<=8000000 && p.cssWidth>0;
  }))).toBe(true);
});
test('Study Mode recovery persists and rejects the other owner',async({page})=>{
  expect(await page.evaluate(()=>window.__releaseModules.study.saveAcademicCompositionRecovery('synthetic-a','synthetic-section','main',{pdfObjectId:'synthetic-pdf',notebookObjectId:'synthetic-notebook',secondarySurface:'notebook'},0.62))).toBe(true);
  await page.reload();await page.waitForFunction(()=>window.__releaseModules);
  expect(await page.evaluate(()=>{
    const s=window.__releaseModules.study;
    return s.loadAcademicCompositionRecovery('synthetic-a','synthetic-section','main')?.pdfObjectId==='synthetic-pdf' && s.loadAcademicCompositionRecovery('synthetic-b','synthetic-section','main')===null;
  })).toBe(true);
});
test('Tutor draft persists without crossing owner boundaries',async({page})=>{
  expect(await page.evaluate(()=>window.__releaseModules.tutor.writeTutorSession('synthetic-a','synthetic-section','synthetic-pdf',{intent:null,turns:[],draftQuestion:'SYNTHETIC_QUESTION'}))).toBe(true);
  await page.reload();await page.waitForFunction(()=>window.__releaseModules);
  expect(await page.evaluate(()=>{
    const t=window.__releaseModules.tutor;
    return t.readTutorSession('synthetic-a','synthetic-section','synthetic-pdf')?.draftQuestion==='SYNTHETIC_QUESTION' && t.readTutorSession('synthetic-b','synthetic-section','synthetic-pdf')===null;
  })).toBe(true);
});
