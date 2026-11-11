import test from 'node:test';import assert from 'node:assert/strict';
import {classifyBrowserLaunchError as classify} from './launch-diagnostics.mjs';
for(const [message,expected] of [["Executable doesn't exist at PRIVATE_PATH",'missing_browser'],['Library not loaded PRIVATE_PATH','missing_library'],['EPERM PRIVATE_PATH','permission_denied'],['Target page, context or browser has been closed PRIVATE_PATH','engine_exited'],['PRIVATE_PASSWORD_SENTINEL','unknown']])test(expected,()=>{assert.equal(classify(Error(message)),expected);assert.ok(!classify(Error(message)).includes('PRIVATE'))});
test('malformed fields and getter exceptions are not inspected',()=>{
 let reads=0;const error=Object.defineProperty({},'message',{get(){reads++;throw Error('PRIVATE')}});
 assert.equal(classify(error),'unknown');assert.equal(reads,0);assert.equal(classify(null),'unknown');assert.equal(classify({message:{}}),'unknown');
});
