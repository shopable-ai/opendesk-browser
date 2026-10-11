import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {loadPackagedJquery,JQUERY_371} from '../../src/scripting/user-scripts/packaged-dependencies.js';
globalThis.crypto ||= webcrypto;
const fail=code=>error=>error?.code===code;
const runtime={id:'fixture',getURL:path=>'chrome-extension://fixture/'+path};
test('R15.5 packaged jQuery is opt-in, pinned and fetched only from the current extension',async()=>{
  const code=await readFile('src/libs/vendor/jquery/3.7.1/jquery.min.js','utf8');
  const url=runtime.getURL(JQUERY_371.path);
  let requested;
  const loaded=await loadPackagedJquery({runtime,fetchImpl:async(href,options)=>{
    requested={href,options};return {ok:true,url:href,redirected:false,text:async()=>code};
  }});
  assert.equal(requested.href,url);
  assert.deepEqual(requested.options,{cache:'no-store',credentials:'omit'});
  assert.equal(loaded.code,code);
  assert.equal(loaded.descriptor.version,'3.7.1');
});
test('R15.5 optional loader fails closed on foreign roots, redirects and modified bytes',async()=>{
  const code=await readFile('src/libs/vendor/jquery/3.7.1/jquery.min.js','utf8');
  const ok=async url=>({ok:true,url,redirected:false,text:async()=>code});
  await assert.rejects(loadPackagedJquery({runtime:{...runtime,id:'another'},fetchImpl:ok}),
    fail('E_RESOURCE_IDENTITY'));
  await assert.rejects(loadPackagedJquery({runtime:{getURL:path=>
    path?'chrome-extension://other/'+path:'chrome-extension://fixture/'},fetchImpl:ok}),
    fail('E_RESOURCE_IDENTITY'));
  await assert.rejects(loadPackagedJquery({runtime,fetchImpl:async url=>({
    ok:true,url,redirected:true,text:async()=>code})}),fail('E_RESOURCE_UNAVAILABLE'));
  await assert.rejects(loadPackagedJquery({runtime,fetchImpl:async url=>({
    ok:true,url:'chrome-extension://another/'+JQUERY_371.path,
    text:async()=>code})}),fail('E_RESOURCE_UNAVAILABLE'));
  await assert.rejects(loadPackagedJquery({runtime,fetchImpl:async url=>({
    ok:true,url,text:async()=>code+'\\n'})}),fail('E_DEPENDENCY_HASH'));
  await assert.rejects(loadPackagedJquery({runtime,fetchImpl:async()=>{throw Error('offline');}}),
    fail('E_RESOURCE_UNAVAILABLE'));
});
