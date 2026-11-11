import {defineConfig} from 'playwright/test';
export default defineConfig({testDir:'.',testMatch:'offline.spec.mjs',timeout:20000,retries:0,workers:1,
  reporter:[['line']],outputDir:'/tmp/zikuk-offline-browser-results',
  use:{baseURL:'http://127.0.0.1:4179',trace:'off',screenshot:'off',video:'off',serviceWorkers:'block'},
  projects:[{name:'chromium',use:{browserName:'chromium',channel:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
  webServer:{command:'node server.mjs',url:'http://127.0.0.1:4179/scripts/security/release-audit/browser/index.html',reuseExistingServer:false,timeout:20000}});
