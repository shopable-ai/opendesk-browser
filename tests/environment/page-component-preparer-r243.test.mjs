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
