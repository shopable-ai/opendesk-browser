// Integration of the production chat router and its existing Host/RunHost
// interface. Host and DOM receipts are fixtures: NOT a Mac Chrome E2E pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';

const origin='http://127.0.0.1:43111',scriptHash='c'.repeat(64);
const manifest={
  taskId:'fixture.verified-search',version:'1.0.0',title:'已安装的现代搜索',
  description:'使用现代 Locator 填写演示搜索框、等待结果；仅作为待验证候选导入。',
  siteOrigins:[origin],program:{revision:1,sourceHash:scriptHash},
  paramsSchema:{type:'object',additionalProperties:false,
    properties:{keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80,default:'OpenDesk'}},
    required:['keyword']}
};
const pinned={taskId:manifest.taskId,version:manifest.version,enabled:true,
  manifestHash:'b'.repeat(64),installationId:'local-installed-1',generation:1};
const scriptId='task:'+manifest.taskId+':'+manifest.version;

async function fixture({correctReadback=true,versionedIntent=false}={}){
  const calls=[];
  const selectedManifest=versionedIntent?{...manifest,version:'1.0.1',
    description:'普通用户可读的产品简介；不作为路由依据',
    intent:{templates:['在当前演示搜索页搜索 {keyword}，并核对结果'],
      resultTexts:['结果：{keyword}','提交次数：1']}}:manifest;
  const selectedPin=versionedIntent?{...pinned,version:'1.0.1',
    manifestHash:'d'.repeat(64)}:pinned;
  const selectedScriptId='task:'+selectedManifest.taskId+':'+selectedManifest.version;
  const target={origin,url:origin+'/demo-form.html'};
  const taskCatalog={catalog:[{taskId:selectedManifest.taskId,version:selectedManifest.version,
    stage:'available',manifestHash:selectedPin.manifestHash,manifest:selectedManifest}],
    installed:[selectedPin]};
  const resolveTask={...selectedPin,scriptId:selectedScriptId,revision:1,
    contentHash:scriptHash,manifest:selectedManifest};
  const f=await workflowFixture({target,taskCatalog,resolveTask,
    taskWorkbench:({host,target:liveTarget})=>({
      refresh:async()=>{},
      runInstalledForAgent:async({taskId,params,expected,event})=>{
        assert.equal(event.isTrusted,true);
        calls.push({taskId,params,expected});
        const claim=await host.start({source:{kind:'saved',scriptId:selectedScriptId,revision:1,contentHash:scriptHash},
          params,target:{mode:'borrowed',tabId:liveTarget.tabId,frameId:0,
            documentId:liveTarget.documentId,expectedUrl:liveTarget.url,
            expectedWindowId:liveTarget.windowId}});
        const completion=await host.completion;
        return {runId:claim.runId,completion,version:selectedPin.version,
          installationId:selectedPin.installationId};
      },
      stopAgentTask:async()=>{throw Object.assign(new Error('not active'),{code:'E_RUN_NOT_ACTIVE'});}
    }),
    observationResult:({claim})=>({kind:'semantic-dom-summary',
      document:{documentId:claim.target.documentId,url:claim.target.url},
      nodes:[{role:'status',name:'结果：OpenDesk',text:'结果：OpenDesk',
        state:{visible:true},locator:{kind:'css',value:'#results'}},
        {role:'status',name:correctReadback?'提交次数：1':'提交次数：0',
          text:correctReadback?'提交次数：1':'提交次数：0',
          state:{visible:true},locator:{kind:'css',value:'#search-count'}}],
      truncated:false})});
  return {f,calls};
}

test('chat finds installed verified Task, binds keyword, dispatches the same RunHost and independently checks result',async t=>{
  const {f,calls}=await fixture();t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','在当前演示搜索页搜索 OpenDesk，并核对结果。');
  await f.click('workflow-ai-plan');
  assert.equal(f.state().controls['workflow-run-review'].hidden,false,
    'opaque v1 manifest cannot claim risk-free auto permission');
  assert.equal(calls.length,0,'discovery must not execute before approval');
  const reply=await f.click('workflow-run-review-confirm');
  await tick();
  assert.equal(reply.ok,true);
  assert.equal(calls.length,1,'one natural language Send dispatches once');
  assert.deepEqual(calls[0].params,{keyword:'OpenDesk'});
  assert.equal(calls[0].expected.installationId,pinned.installationId);
  assert.equal(f.starts.length,2,'one pinned original source plus one separate RunHost observation');
  assert.deepEqual(f.starts.map(row=>row.source.kind),['saved','draft']);
  assert.equal(f.starts[0].source.contentHash,scriptHash);
  assert.ok(f.state().messages.some(row=>row.speaker==='执行结果'&&/结果：OpenDesk/.test(row.message)));
  assert.ok(!f.state().messages.some(row=>/重新生成.*JavaScript/.test(row.message)));
});

test('durable Task completion without independent submission-count readback cannot claim success',async t=>{
  const {f,calls}=await fixture({correctReadback:false});t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','在当前演示搜索页搜索 OpenDesk，并核对结果');
  await f.click('workflow-ai-plan');
  const reply=await f.click('workflow-run-review-confirm');
  assert.equal(reply.ok,false);
  assert.equal(reply.error?.code,'E_WORKFLOW_EVIDENCE');
  assert.equal(calls.length,1,'unknown DOM result never re-runs the Task');
  assert.equal(f.starts.length,2);
  assert.equal(f.state().controls['workflow-run-review'].hidden,true);
});

test('new versioned Task uses immutable Manifest intent and independent readback, not description',async t=>{
  const {f,calls}=await fixture({versionedIntent:true});t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','在当前演示搜索页搜索 OpenDesk，并核对结果。');
  await f.click('workflow-ai-plan');
  assert.equal(f.state().controls['workflow-run-review'].hidden,false,
    'unproven Task JavaScript still requires execution confirmation');
  assert.equal(calls.length,0);
  const reply=await f.click('workflow-run-review-confirm');
  assert.equal(reply.ok,true);
  assert.equal(reply.effect.kind,'task-visible-readback');
  assert.deepEqual(reply.effect.texts,['结果：OpenDesk','提交次数：1']);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params,{keyword:'OpenDesk'});
  assert.equal(calls[0].expected.version,'1.0.1');
  assert.deepEqual(f.starts.map(row=>row.source.kind),['saved','draft'],
    'Task code is the pinned saved JS and result verification is a separate RunHost read');
  assert.ok(f.state().messages.some(row=>row.speaker==='执行结果'&&
    /提交次数：1/.test(row.message)));
});

test('new versioned Task cannot report success without all independently visible claims',async t=>{
  const {f,calls}=await fixture({versionedIntent:true,correctReadback:false});
  t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','在当前演示搜索页搜索 OpenDesk，并核对结果');
  await f.click('workflow-ai-plan');
  const reply=await f.click('workflow-run-review-confirm');
  assert.equal(reply.ok,false);
  assert.equal(reply.error?.code,'E_WORKFLOW_EVIDENCE');
  assert.equal(calls.length,1,'uncertain effect must not re-execute');
  assert.equal(f.starts.length,2);
});

test('installed Task confirmation is dismissed after a different Document becomes active',async t=>{
  const {f,calls}=await fixture();t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','在当前演示搜索页搜索 OpenDesk，并核对结果。');
  await f.click('workflow-ai-plan');
  assert.equal(f.state().controls['workflow-run-review'].hidden,false);
  await f.setPage({url:origin+'/demo-form.html?changed=1',documentId:'different-document'});
  assert.equal(f.state().controls['workflow-run-review'].hidden,true,
    'an old Document must not retain a usable Task confirmation');
  const reply=await f.click('workflow-run-review-confirm');
  assert.equal(reply?.ok,false);
  assert.equal(calls.length,0,'stale confirmation never dispatches Task or AI');
  assert.equal(f.starts.length,0,'stale confirmation never calls RunHost');
});

test('Chrome site revocation invalidates a pending installed Task confirmation',async t=>{
  const {f,calls}=await fixture();t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','在当前演示搜索页搜索 OpenDesk，并核对结果。');
  await f.click('workflow-ai-plan');
  assert.equal(f.state().controls['workflow-run-review'].hidden,false);
  await f.revoke([origin+'/*']);
  assert.equal(f.state().controls['workflow-run-review'].hidden,true,
    'revocation must dismiss the one-shot approval immediately');
  const reply=await f.click('workflow-run-review-confirm');
  assert.equal(reply?.ok,false);
  assert.equal(calls.length,0);
  assert.equal(f.starts.length,0,'no RunHost start after revoked approval');
});
