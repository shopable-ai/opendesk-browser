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

async function fixture({correctReadback=true}={}){
  const calls=[];
  const target={origin,url:origin+'/demo-form.html'};
  const taskCatalog={catalog:[{taskId:manifest.taskId,version:manifest.version,
    stage:'available',manifestHash:pinned.manifestHash,manifest}],installed:[pinned]};
  const resolveTask={...pinned,scriptId,revision:1,contentHash:scriptHash,manifest};
  const f=await workflowFixture({target,taskCatalog,resolveTask,
    taskWorkbench:({host,target:liveTarget})=>({
      refresh:async()=>{},
      runInstalledForAgent:async({taskId,params,expected,event})=>{
        assert.equal(event.isTrusted,true);
        calls.push({taskId,params,expected});
        const claim=await host.start({source:{kind:'saved',scriptId,revision:1,contentHash:scriptHash},
          params,target:{mode:'borrowed',tabId:liveTarget.tabId,frameId:0,
            documentId:liveTarget.documentId,expectedUrl:liveTarget.url,
            expectedWindowId:liveTarget.windowId}});
        const completion=await host.completion;
        return {runId:claim.runId,completion,version:pinned.version,
          installationId:pinned.installationId};
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
