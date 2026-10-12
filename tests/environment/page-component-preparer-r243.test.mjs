import test from 'node:test';
import assert from 'node:assert/strict';
import {digestUtf8} from '../../src/platform/protocol.js';
import {PAGE_BROWSER_UI_HELPER} from '../../src/libs/page-frameworks/contract.js';
import {createBrowserPageComponentPreparer} from '../../src/ui/page-component-preparer.js';
const api={runtime:{getURL:resource=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+resource}};
const source='var __opendeskPageUIR243={createPageUI(){}}';
const response=()=>({ok:true,redirected:false,url:api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output),
  text:async()=>source});
class FakeWorker{
  static latest;static count=0;
  constructor(url,{type}){assert.equal(type,'classic');assert.match(url,/ui\/page-component-compiler-worker.js$/);
    FakeWorker.latest=this;FakeWorker.count++;this.terminated=false;}
  terminate(){this.terminated=true;}
  postMessage(payload){
    this.payload=payload;
    queueMicrotask(()=>this.onmessage?.({data:{requestId:payload.requestId,ok:true,
      result:{entryFormat:'async-main',framework:payload.framework,projectId:payload.projectId,
        sourceUtf8:'// @opendesk-lib '+payload.framework+'\nasync function main(){}'}}}));
  }
}
const helper=async()=>source;
const fixtures={componentSource:"import {useState} from 'react';export default function App(){}",
  framework:'react',projectId:'sample.browser-react',pageRules:{
    matches:['http://127.0.0.1:43111/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'
  }};
test('R24.3 browser compiler refuses a resource whose sha differs from pinned bytes',async()=>{
  const compiler=createBrowserPageComponentPreparer({api,WorkerClass:FakeWorker,fetchImpl:async()=>response()});
  await assert.rejects(compiler.prepare(fixtures),{code:'E_PAGE_COMPILER_HASH'});
  assert.equal(FakeWorker.count,0,'No Worker starts on unverified compiler inputs');
});
test('R24.3 compiler client verifies immutable UI helper and uses only a dedicated Worker',async()=>{
  // The real helper's pinned byte identity is what can unlock worker creation.
  const {readFile}=await import('node:fs/promises');
  const real=await readFile(PAGE_BROWSER_UI_HELPER.source,'utf8');
  assert.equal(await digestUtf8(real),PAGE_BROWSER_UI_HELPER.sha256);
  const compiler=createBrowserPageComponentPreparer({api,WorkerClass:FakeWorker,
    fetchImpl:async()=>({ok:true,redirected:false,
      url:api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output),text:async()=>real})});
  const value=await compiler.prepare(fixtures);
  assert.equal(value.framework,'react');
  assert.equal(value.sourceHash,await digestUtf8(value.sourceUtf8));
  assert.equal(FakeWorker.latest.terminated,true);
  assert.equal(FakeWorker.latest.payload.componentSource,fixtures.componentSource);
  compiler.dispose();
  await assert.rejects(compiler.prepare(fixtures),{code:'E_PAGE_COMPILER_CLOSED'});
});
test('R24.3 stale worker result is rejected and Worker terminated on component edits',async()=>{
  class DelayedWorker extends FakeWorker{postMessage(payload){this.payload=payload;}}
  const {readFile}=await import('node:fs/promises');
  const real=await readFile(PAGE_BROWSER_UI_HELPER.source,'utf8');
  const compiler=createBrowserPageComponentPreparer({api,WorkerClass:DelayedWorker,
    fetchImpl:async()=>({ok:true,redirected:false,
      url:api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output),text:async()=>real})});
  const pending=compiler.prepare(fixtures);
  await new Promise(resolve=>setImmediate(resolve));
  const worker=FakeWorker.latest;
  compiler.cancel();
  await assert.rejects(pending,{code:'E_PAGE_COMPILER_STALE'});
  assert.equal(worker.terminated,true);
  compiler.dispose();
});

test('R24.3 Worker compilation failure terminates worker and never returns stale code',async()=>{
  const {readFile}=await import('node:fs/promises');
  const real=await readFile(PAGE_BROWSER_UI_HELPER.source,'utf8');
  class RejectedWorker extends FakeWorker {
    postMessage(payload){
      this.payload=payload;
      queueMicrotask(()=>this.onmessage?.({data:{requestId:payload.requestId,ok:false,
        error:{code:'E_PAGE_COMPONENT_SYNTAX',message:'App.jsx: unknown component'}}}));
    }
  }
  const compiler=createBrowserPageComponentPreparer({api,WorkerClass:RejectedWorker,
    fetchImpl:async()=>({ok:true,redirected:false,
      url:api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output),text:async()=>real})});
  await assert.rejects(compiler.prepare(fixtures),{code:'E_PAGE_COMPONENT_SYNTAX'});
  assert.equal(FakeWorker.latest.terminated,true);
  compiler.dispose();
});

test('R24.3 exact input and compiler identities reuse only an immutable successful artifact',async()=>{
  const {readFile}=await import('node:fs/promises');
  const trusted=await readFile(PAGE_BROWSER_UI_HELPER.source,'utf8');
  const originalCount=FakeWorker.count;
  const compiler=createBrowserPageComponentPreparer({api,WorkerClass:FakeWorker,
    fetchImpl:async()=>({ok:true,redirected:false,
      url:api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output),text:async()=>trusted})});
  const first=await compiler.prepare(fixtures);
  assert.equal(first.cacheHit,false);
  assert.equal(FakeWorker.count,originalCount+1);
  const hit=await compiler.prepare({...fixtures,pageRules:{...fixtures.pageRules}});
  assert.equal(hit.cacheHit,true);
  assert.equal(hit.sourceHash,first.sourceHash);
  assert.equal(FakeWorker.count,originalCount+1);
  const change=await compiler.prepare({...fixtures,componentSource:fixtures.componentSource+'\n// changed'});
  assert.equal(change.cacheHit,false);
  assert.equal(FakeWorker.count,originalCount+2,'changed source must construct a fresh worker');
  const differentFramework=await compiler.prepare({...fixtures,framework:'vue'});
  assert.equal(differentFramework.cacheHit,false);
  assert.equal(FakeWorker.count,originalCount+3,'framework switch must not reuse React output');
  const changedRule=await compiler.prepare({...fixtures,pageRules:{
    ...fixtures.pageRules,matches:['https://example.test/*']
  }});
  assert.equal(changedRule.cacheHit,false);
  assert.equal(FakeWorker.count,originalCount+4,'website scope change invalidates preparation');
  compiler.dispose();
});

test('browser dependency inspection uses only a fixed Worker and never even fetches the trusted UI helper',async()=>{
  let requests=0;
  class InspectionWorker extends FakeWorker{
    postMessage(payload){
      this.payload=payload;
      assert.equal(payload.action,'inspect');assert.equal(payload.uiHelperSource,undefined);
      digestUtf8(payload.componentSource).then(sourceHash=>this.onmessage?.({data:{requestId:payload.requestId,ok:true,
        result:{sourceHash,framework:payload.framework,projectId:payload.projectId,remoteRoots:['https://example.org/module.js'],missingUrls:['https://example.org/module.js'],modules:[],complete:false}}}));
    }
  }
  const preparer=createBrowserPageComponentPreparer({api,WorkerClass:InspectionWorker,fetchImpl:async()=>{requests++;throw Error('no network');}});
  const report=await preparer.inspect(fixtures);
  assert.equal(report.sourceHash,await digestUtf8(fixtures.componentSource));assert.equal(report.complete,false);
  assert.equal(requests,0);assert.equal(FakeWorker.latest.terminated,true);preparer.dispose();
});

test('an immutable compiled-cache hit cannot hide deleted or corrupt remote raw bytes',async()=>{
  const {readFile}=await import('node:fs/promises'),trusted=await readFile(PAGE_BROWSER_UI_HELPER.source,'utf8');
  let fetched=0;
  const preparer=createBrowserPageComponentPreparer({api,WorkerClass:FakeWorker,fetchImpl:async()=>{
    fetched++;return {ok:true,redirected:false,url:api.runtime.getURL(PAGE_BROWSER_UI_HELPER.output),text:async()=>trusted};}});
  const url='https://example.org/module.js',code='export default 2;',sha256=await digestUtf8(code),size=new TextEncoder().encode(code).length;
  const remoteSnapshot={lock:{format:'opendesk.remote-lock.v1',modules:{[url]:{sha256,bytes:size}}},modules:[{url,code,sha256,bytes:size}]};
  await preparer.prepare({...fixtures,remoteSnapshot});
  const workers=FakeWorker.count,hit=await preparer.prepare({...fixtures,remoteSnapshot});
  assert.equal(hit.cacheHit,true);assert.equal(FakeWorker.count,workers);
  await assert.rejects(preparer.prepare({...fixtures,remoteSnapshot:{...remoteSnapshot,modules:[]}}),{code:'E_REMOTE_CACHE'});
  await assert.rejects(preparer.prepare({...fixtures,remoteSnapshot:{...remoteSnapshot,modules:[{...remoteSnapshot.modules[0],code:'export default 3;'}]}}),{code:'E_REMOTE_HASH'});
  assert.equal(FakeWorker.count,workers,'invalid raw graph fails before any new Worker');
  assert.equal(fetched,1,'only the fixed internal helper was fetched; no repair download');preparer.dispose();
});
