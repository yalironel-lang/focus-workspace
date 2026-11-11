// No login, environment files, application server, remote endpoints or paid calls.
import {chromium,webkit} from 'playwright';
import {classifyBrowserLaunchError} from './launch-diagnostics.mjs';
import fs from 'node:fs';
import {setup,scenarios} from './scenarios.mjs';
let failed=false;
let server;
const deadline=setTimeout(()=>{console.log('OFFLINE_BROWSER_DEADLINE_FAIL');process.exit(1)},60000);
try {
  ({server}=await import('./server.mjs'));
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    if(!fs.existsSync(engine.executablePath())) {failed=true;console.log(JSON.stringify({engine:name,status:'BLOCKED',reason:'BROWSER_NOT_INSTALLED'}));continue;}
    let browser;
    try {
      browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chromium'}:{}),timeout:10000});
      for(let i=0;i<scenarios.length;i++) {
        const context=await browser.newContext({baseURL:'http://127.0.0.1:4179',serviceWorkers:'block'});
        try {
          const page=await context.newPage();page.setDefaultTimeout(10000);
          await setup({context,page});await scenarios[i].run({context,page});
          console.log(JSON.stringify({engine:name,case:i+1,status:'PASS'}));
        } catch {failed=true;console.log(JSON.stringify({engine:name,case:i+1,status:'FAIL'}));}
        finally{await context.close();}
      }
    } catch (error) {failed=true;console.log(JSON.stringify({engine:name,status:'FAIL',reason:'BROWSER_UNAVAILABLE',launchKind:classifyBrowserLaunchError(error)}));}
    finally{await browser?.close();}
  }
} catch {failed=true;console.log(JSON.stringify({status:'BLOCKED',reason:'LOCAL_HARNESS_UNAVAILABLE'}));}
finally {await server?.close();clearTimeout(deadline);}
if(failed)process.exitCode=1;
