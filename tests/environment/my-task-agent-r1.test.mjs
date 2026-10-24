import test from 'node:test';
import assert from 'node:assert/strict';
import {createMyTaskAgent,validateMyTaskAgentProposal} from '../../src/ui/my-task-agent.js';
import {taskInstructions} from '../../src/ui/conversation/my-task-instructions.js';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';

const schema={type:'object',properties:{},required:[],additionalProperties:false};
const installed=()=>({taskId:'search',version:'1.0.0',enabled:true,manifestHash:'pinned',
  installationId:'00000000-0000-0000-0000-000000000001',generation:1,
  scriptId:'task:search:1.0.0'});
const candidate=()=>({taskId:'search',version:'1.0.0',manifestHash:'pinned',
  stage:'available',manifest:{title:'网页搜索',description:'搜索当前网页',
    siteOrigins:['https://example.com'],paramsSchema:schema}});
const trusted={isTrusted:true};
function rig(proposals,{hasTask=true,provider:realProvider,api:realAPI}={}){
  let executions=0,changes=0,planned=0,paused=false,generation=1,scheduleGeneration=1,pinned=null;
  let providerGeneration=1;const providerListeners=new Set();
  const client={
    async request(name,payload){
      if(name==='listTaskCatalog')return {installed:hasTask?[{...installed(),generation}]:[],
        catalog:hasTask?[candidate()]:[]};
      if(name==='listSchedules')return {schedules:[{
        scheduleId:'plan1',title:'早间计划',taskId:'search',paused,generation:scheduleGeneration
      }]};
      if(name==='changeSchedule'){changes++;scheduleGeneration++;paused=payload.action==='pause';return {scheduleId:payload.scheduleId};}
      throw new Error('Unexpected Host operation '+name);
    },
    controller:{async snapshotControllerRun(){return {
      runs:[{runId:'run1',revision:{scriptId:'task:search:1.0.0'},state:'completed'}],
      results:[{runId:'run1',outcome:{ok:false,error:{code:'E_SAMPLE',message:'测试结果'}},
        revision:{scriptId:'task:search:1.0.0'}}]
    };}}
  };
  const taskWorkbench={runInstalledForAgent:async({expected})=>{executions++;pinned=expected;return {runId:'run1'};},
    stopAgentTask:async()=>{},myView:{field:()=>({value:'search'})}};
  const provider={source:()=>({provider:'local_codex'}),
    providerGeneration:()=>providerGeneration,
    subscribeProviderChanges(listener){providerListeners.add(listener);
      return ()=>providerListeners.delete(listener);},
    request:async()=>({proposal:proposals[Math.min(planned++,proposals.length-1)],
      authorization:{release(){}}}),cancel:async()=>{}};
  const target={snapshot:{status:'available',origin:'https://example.com',url:'https://example.com/'}};
  const agent=createMyTaskAgent({client,taskWorkbench,provider:realProvider||provider,currentPageTarget:target,
    api:realAPI||{permissions:{contains:async()=>true}}});
  return {agent,client,taskWorkbench,get executions(){return executions;},get changes(){return changes;},
    get pinned(){return pinned;},bumpGeneration(){generation++;},
    changeProvider(){providerGeneration++;for(const listener of [...providerListeners])listener();},
    get planned(){return planned;}};
}

test('My task provider receives readable newline-separated instructions',()=>{
  assert.ok(taskInstructions.includes('\nAllowed action types:'));
  assert.equal(taskInstructions.includes('\\nAllowed action types:'),false);
});
test('strict whitelist prevents fabricated Chrome methods, unexpected fields and multiple writes',()=>{
  assert.throws(()=>validateMyTaskAgentProposal({actions:[{type:'chrome.eval'}]}),
    /不受支持/);
  assert.throws(()=>validateMyTaskAgentProposal({actions:[{type:'run_task',taskId:'search',params:{},
    chromePermissions:['tabs']}]}),/额外参数/);
  assert.throws(()=>validateMyTaskAgentProposal({actions:[
    {type:'run_task',taskId:'search',params:{}},
    {type:'change_schedule',scheduleId:'plan1',operation:'delete'}]}),/最多确认一项/);
  assert.throws(()=>validateMyTaskAgentProposal({actions:[{type:'run_task',params:{}}]}),
    /任务 ID/);
  assert.deepEqual(validateMyTaskAgentProposal({actions:[{type:'recent_runs',limit:3}]}).actions,
    [{type:'recent_runs',limit:3}]);
  assert.throws(()=>validateMyTaskAgentProposal({actions:[{type:'recent_runs',taskId:'invented'}]}),
    /额外参数/);
  assert.throws(()=>validateMyTaskAgentProposal({actions:[
    {type:'create_schedule',taskId:'search',title:'x',params:{},timezone:'Asia\/Tokyo',
      targetUrl:'https://example.com/',triggerKind:'daily',triggerSpec:{hour:9,minute:0}}]}),
    /暂停状态/);
});

test('read-only AI turns use Host list and do not enter RunHost',async()=>{
  const rigged=rig([{actions:[{type:'list_tasks',currentPageOnly:true}]},
    {question:'已找到网页搜索任务'}]);
  await rigged.agent.send('查找当前网页的任务',trusted);
  assert.equal(rigged.executions,0);
  assert.equal(rigged.agent.getSnapshot().pending,null);
  assert.match(rigged.agent.getSnapshot().rows.map(x=>x.message).join(' '),/已检查 1 个已安装任务/);
  rigged.agent.dispose();
});

test('recent task query reads Controller run journal without task execution',async()=>{
  const fixture=rig([{actions:[{type:'recent_runs',limit:3}]},
    {question:'最近运行的是网页搜索任务'}]);
  await fixture.agent.send('查看我最近执行的任务',trusted);
  assert.equal(fixture.executions,0);
  assert.equal(fixture.agent.getSnapshot().pending,null);
  const transcript=fixture.agent.getSnapshot().rows.map(row=>row.message).join(' ');
  assert.match(transcript,/已读取 1 条最近任务的真实运行记录/);
  assert.match(transcript,/网页搜索 · completed · 运行编号 run1 · 测试结果/,
    'verified task name, run identity, terminal state and journal outcome must be visible');
  assert.match(fixture.agent.getSnapshot().technical,/"taskId":"search"/);
  assert.match(fixture.agent.getSnapshot().technical,/"runId":"run1"/);
  fixture.agent.dispose();
});

test('confirmation is consumed before await and cannot double-run',async()=>{
  const rigged=rig([{actions:[{type:'run_task',taskId:'search',params:{}}]},
    {question:'已完成'}]);
  await rigged.agent.send('运行网页搜索任务',trusted);
  assert.equal(rigged.agent.getSnapshot().status,'review');
  const pending=rigged.agent.confirm(trusted);
  await rigged.agent.confirm(trusted);
  await pending;
  assert.equal(rigged.executions,1);
  assert.equal(rigged.pinned.version,'1.0.0');
  assert.equal(rigged.pinned.generation,1);
  assert.equal(rigged.agent.getSnapshot().pending,null);
  assert.match(rigged.agent.getSnapshot().rows.map(x=>x.message).join(' '),/任务「search」执行返回错误/);
  assert.doesNotMatch(rigged.agent.getSnapshot().rows.map(x=>x.message).join(' '),/状态：成功/);
  assert.doesNotMatch(rigged.agent.getSnapshot().rows.map(x=>x.message).join(' '),/已读取真实回执：\\{/);
  rigged.agent.dispose();
});

test('unknown task is rejected before RunHost, without inventing success',async()=>{
  const rigged=rig([{actions:[{type:'run_task',taskId:'missing',params:{}}]}],{hasTask:false});
  await rigged.agent.send('运行不存在的任务',trusted);
  assert.equal(rigged.executions,0);
  assert.equal(rigged.agent.getSnapshot().pending,null);
  assert.ok(rigged.agent.getSnapshot().rows.some(row=>/没有找到已安装任务/.test(row.message)));
  rigged.agent.dispose();
});

test('schedule pause uses existing changeSchedule then re-reads Host',async()=>{
  const rigged=rig([{actions:[{type:'change_schedule',scheduleId:'plan1',operation:'pause'}]},
    {question:'计划已暂停'}]);
  await rigged.agent.send('暂停已有的计划',trusted);
  await rigged.agent.confirm(trusted);
  assert.equal(rigged.changes,1);
  assert.equal(rigged.agent.getSnapshot().pending,null);
  rigged.agent.dispose();
});

test('untrusted synthetic event cannot initiate a modifying AI turn',async()=>{
  const rigged=rig([{actions:[{type:'run_task',taskId:'search',params:{}}]}]);
  await assert.rejects(rigged.agent.send('run',{isTrusted:false}),/可信对话/);
  assert.equal(rigged.planned,0);
  assert.equal(rigged.executions,0);
  rigged.agent.dispose();
});

test('Provider generation switch retires pending My task approvals before Host writes',async()=>{
  const rigged=rig([{actions:[{type:'run_task',taskId:'search',params:{}}]}]);
  await rigged.agent.send('运行网页搜索任务',trusted);
  assert.equal(rigged.agent.getSnapshot().status,'review');
  rigged.changeProvider();
  assert.equal(rigged.agent.getSnapshot().pending,null);
  await rigged.agent.confirm(trusted);
  assert.equal(rigged.executions,0,'an old model proposal must never start RunHost');
  assert.ok(rigged.agent.getSnapshot().rows.some(row=>/设置已切换/.test(row.message)));
  rigged.agent.dispose();
});

test('task generation change between review and confirmation fails closed',async()=>{
  const rigged=rig([{actions:[{type:'set_task_enabled',taskId:'search',enabled:false}]}]);
  await rigged.agent.send('停用网页搜索任务',trusted);
  assert.equal(rigged.agent.getSnapshot().status,'review');
  rigged.bumpGeneration();
  await rigged.agent.confirm(trusted);
  assert.equal(rigged.executions,0);
  assert.ok(rigged.agent.getSnapshot().rows.some(row=>/确认期间已变化/.test(row.message)));
  rigged.agent.dispose();
});

const planHash='a'.repeat(64),sourceHash='b'.repeat(64);
const installId='00000000-0000-0000-0000-000000000001';
const editSchema={type:'object',properties:{
  query:{type:'string',title:'关键词',maxLength:200},
  limit:{type:'integer',title:'数量',minimum:1,maximum:100}
},required:['query'],additionalProperties:false};
const initialPlan=()=>({
  scheduleId:'plan1',generation:3,title:'每日搜索',taskId:'search',version:'1.0.0',
  manifestHash:planHash,sourceHash,installationId:installId,taskGeneration:1,
  revision:1,params:{query:'PRIVATE_VALUE_DO_NOT_SEND',limit:2},
  targetUrl:'https://example.com/',openIfMissing:false,timezone:'Asia/Tokyo',
  triggerKind:'daily',triggerSpec:{hour:9,minute:0},misfirePolicy:'skip',
  startDeadlineMs:300000,paused:false,owner:null,
  // The real Schedule Repository persists the Scheduler-computed nextDueAt.
  nextDueAt:Date.UTC(2030,0,1,0,0)
});
function editRig(proposals,{permission=true,uncertain=false,staleReadback=false,
  missingNextDueAt=false,staleNextDueAt=false,holdSave=false}={}){
  let plan=initialPlan(),installedGeneration=1,saveCount=0,proposalCount=0,latestInput=null;
   let refreshCount=0;
  let grant=permission,unclear=uncertain,readStale=false,releaseSave=()=>{},enteredSave=()=>{};
  const gate=holdSave?new Promise(resolve=>{releaseSave=resolve;}):Promise.resolve();
  const saveEntered=new Promise(resolve=>{enteredSave=resolve;});
  const observations=[];
  const client={
    async request(name,payload){
      if(name==='listSchedules')return {schedules:[structuredClone(
        staleReadback&&readStale?initialPlan():plan)]};
      if(name==='listTaskCatalog')return {
        installed:[{taskId:'search',version:'1.0.0',enabled:true,
          manifestHash:planHash,installationId:installId,generation:installedGeneration}],
        catalog:[{taskId:'search',version:'1.0.0',manifestHash:planHash,stage:'available',
          manifest:{title:'网页搜索',siteOrigins:['https://example.com'],paramsSchema:editSchema}}]
      };
      if(name==='resolveInstalledTask')return {
        taskId:'search',version:'1.0.0',manifestHash:planHash,contentHash:sourceHash,
        installationId:installId,generation:installedGeneration
      };
      if(name==='saveSchedule'){
        saveCount++;latestInput=structuredClone(payload);enteredSave();
        await gate;
        if(payload.scheduleId!==plan.scheduleId||payload.expectedGeneration!==plan.generation)
          throw Object.assign(new Error('version conflict'),{code:'E_REVISION'});
        plan={...plan,...structuredClone(payload),generation:plan.generation+1};
        delete plan.expectedGeneration;
        // Host fixture emulates a fresh persisted Scheduler read, not a model
        // prediction. Daily 09:00 Japan = 00:00 UTC for the fixed sample date.
        plan.nextDueAt=missingNextDueAt?null:staleNextDueAt?Date.UTC(2030,0,1,0,0):
          plan.paused?null:plan.triggerKind==='daily'?Date.UTC(2030,0,1,
            plan.triggerSpec.hour-9,plan.triggerSpec.minute):Date.UTC(2030,0,1,0,0);
        readStale=true;
        if(unclear)throw Object.assign(new Error('Host disconnected after submit'),{code:'E_DISCONNECTED'});
        return {scheduleId:plan.scheduleId};
      }
      throw new Error('Unexpected Host operation '+name);
    },
    controller:{async snapshotControllerRun(){return {runs:[],results:[]};}}
  };
  const taskWorkbench={myView:{field:()=>({value:'search'})},
    runInstalledForAgent:async()=>{throw Error('RunHost must not run for an edit');},
    stopAgentTask:async()=>{}};
  const provider={request:async({context})=>{
    observations.push(structuredClone(context));
    return {proposal:proposals[Math.min(proposalCount++,proposals.length-1)],
      authorization:{release(){}}};
  },cancel:async()=>{}};
  const agent=createMyTaskAgent({client,taskWorkbench,provider,
    currentPageTarget:{snapshot:{status:'available',origin:'https://example.com',
      url:'https://example.com/'}},
    api:{permissions:{contains:async()=>grant}},
    onScheduleChange:()=>{refreshCount++;}});
  return {agent,observations,get plan(){return plan;},get saveCount(){return saveCount;},
    get refreshCount(){return refreshCount;},
    get latestInput(){return latestInput;},
    bumpPlan(){plan={...plan,generation:plan.generation+1};},
    bumpInstallation(){installedGeneration++;},revoke(){grant=false;},
    waitSave:()=>saveEntered,releaseSave:()=>releaseSave()};
}

test('schedule editing schema is allowlisted and cannot replace task installation',()=>{
  for(const changes of [{taskId:'another'}, {generation:999}, {}, {triggerSpec:[]},
    {params:null},{paused:'yes'},{startDeadlineMs:1},{misfirePolicy:'replay'}]){
    assert.throws(()=>validateMyTaskAgentProposal({actions:[
      {type:'edit_schedule',scheduleId:'plan1',changes}]}),/计划|参数|规则|布尔|截止/);
  }
  assert.throws(()=>validateMyTaskAgentProposal({actions:[
    {type:'edit_schedule',scheduleId:'plan1',changes:{title:'A'}},
    {type:'change_schedule',scheduleId:'plan1',operation:'delete'}]}),/最多确认一项/);
});

test('AI edits an existing plan by CAS saveSchedule, preserving immutable identity and private params',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{title:'新的早间搜索',triggerSpec:{hour:10,minute:30},params:{limit:4}}}]},
    {question:'计划更新完成'}]);
  await x.agent.send('将计划改成每天10:30，结果数量设为4',trusted);
  assert.equal(x.agent.getSnapshot().status,'review');
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  assert.equal(x.plan.generation,4);
  assert.deepEqual(x.plan.triggerSpec,{hour:10,minute:30});
  assert.equal(x.plan.params.query,'PRIVATE_VALUE_DO_NOT_SEND');
  assert.equal(x.plan.params.limit,4);
  assert.equal(x.latestInput.scheduleId,'plan1');
  assert.equal(x.latestInput.expectedGeneration,3);
  assert.equal(x.latestInput.version,'1.0.0');
  assert.equal(x.latestInput.manifestHash,planHash);
  assert.equal(x.latestInput.sourceHash,sourceHash);
  assert.equal(x.latestInput.installationId,installId);
  assert.equal(x.latestInput.taskGeneration,1);
  assert.equal(x.plan.nextDueAt,Date.UTC(2030,0,1,1,30));
  const message=x.agent.getSnapshot().rows.map(v=>v.message).join(' ');
  assert.match(message,/已更新并重新读取验证/);
  assert.match(message,/下次触发：.*10:30.*Asia\/Tokyo/);
  x.agent.dispose();
});

test('editing daily 09:00 to 10:00 reports the independently read Scheduler next due',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:10,minute:0}}}]},
    {question:'已核对新的时间'}]);
  await x.agent.send('把每天上午9点执行的计划改到10点',trusted);
  assert.equal(x.agent.getSnapshot().status,'review');
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  assert.equal(x.plan.generation,4);
  assert.equal(x.plan.nextDueAt,Date.UTC(2030,0,1,1,0));
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),
    /下次触发：.*10:00.*Asia\/Tokyo/);
  x.agent.dispose();
});

test('daily edit with missing Scheduler nextDueAt remains unknown, not successful',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:10,minute:0}}}]}],{missingNextDueAt:true});
  await x.agent.send('把早上九点改到十点',trusted);
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  const message=x.agent.getSnapshot().rows.map(v=>v.message).join(' ');
  assert.match(message,/下次触发时间无法独立核实/);
  assert.doesNotMatch(message,/已更新并重新读取验证/);
  x.agent.dispose();
});

test('daily edit rejects a stale 09:00 next due for a verified new 10:00 rule',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:10,minute:0}}}]}],{staleNextDueAt:true});
  await x.agent.send('把早上九点改到十点',trusted);
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  const message=x.agent.getSnapshot().rows.map(v=>v.message).join(' ');
  assert.match(message,/下次触发时间无法独立核实/);
  assert.doesNotMatch(message,/已更新并重新读取验证/);
  x.agent.dispose();
});

test('plan detail read minimizes sensitive provider observations',async()=>{
  const x=editRig([{actions:[{type:'get_schedule',scheduleId:'plan1'}]},
    {question:'已核对每日计划'}]);
  await x.agent.send('这个计划每天什么时候运行',trusted);
  assert.equal(x.observations.length,2);
  assert.doesNotMatch(JSON.stringify(x.observations[1]),/PRIVATE_VALUE_DO_NOT_SEND|installationId|manifestHash/);
  assert.doesNotMatch(x.agent.getSnapshot().technical,/PRIVATE_VALUE_DO_NOT_SEND/);
  assert.match(JSON.stringify(x.observations[1]),/hour/);
  x.agent.dispose();
});

test('concurrent plan change after review rejects update without a write',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:11,minute:0}}}]}]);
  await x.agent.send('改到11点',trusted);
  x.bumpPlan();
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,0);
  assert.equal(x.refreshCount,0,'original page refresh follows submitted write, not model success');
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/确认期间已变化/);
  x.agent.dispose();
});

test('task reinstallation is never silently substituted into the existing plan',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{title:'新名称'}}]}]);
  await x.agent.send('改计划名称',trusted);
  x.bumpInstallation();
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,0);
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/安装身份已变化/);
  x.agent.dispose();
});

test('invalid parameters and out-of-scope target fail in preflight',async()=>{
  for(const changes of [{params:{limit:1000}},{targetUrl:'https://untrusted.example/'}]){
    const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',changes}]},
      {question:'计划未修改'}]);
    await x.agent.send('修改计划',trusted);
    assert.equal(x.agent.getSnapshot().pending,null);
    assert.equal(x.saveCount,0);
    assert.ok(x.agent.getSnapshot().rows.some(v=>/核查失败/.test(v.message)));
    x.agent.dispose();
  }
});

test('revoked website permission blocks plan editing; duplicate confirm does not replay',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{timezone:'UTC'}}]}]);
  await x.agent.send('改用UTC时区',trusted);
  x.revoke();
  const first=x.agent.confirm(trusted);
  await x.agent.confirm(trusted);
  await first;
  assert.equal(x.saveCount,0);
  assert.equal(x.refreshCount,0,'original page refresh follows submitted write, not model success');
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/访问权限不足/);
  x.agent.dispose();
});

test('uncertain Host receipt never triggers a second schedule write',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:12,minute:0}}}]}],{uncertain:true});
  await x.agent.send('改到12点',trusted);
  await x.agent.confirm(trusted);
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/操作结果未知，禁止自动重试/);
  x.agent.dispose();
});

test('readback mismatch after schedule edit is reported unknown, never as success',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:8,minute:0}}}]}],{staleReadback:true});
  await x.agent.send('改到8点',trusted);
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  assert.doesNotMatch(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/已更新并重新读取验证/);
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/编辑结果无法读回核对/);
  x.agent.dispose();
});

test('stopping AI while an edit is submitted does not cancel or misreport the real write',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:15,minute:0}}}]}],{holdSave:true});
  await x.agent.send('下午3点运行',trusted);
  const confirmation=x.agent.confirm(trusted);
  await x.waitSave();
  x.agent.stop();
  x.releaseSave();
  await confirmation;
  assert.equal(x.saveCount,1);
  assert.equal(x.refreshCount,1,'original page refresh follows submitted write, not model success');
  assert.equal(x.plan.triggerSpec.hour,15);
  const messages=x.agent.getSnapshot().rows.map(v=>v.message).join(' ');
  assert.match(messages,/可能已经提交；请先核对/);
  assert.doesNotMatch(messages,/已更新并重新读取验证/);
  x.agent.dispose();
});

// Real Runtime + Consumer authorization/cancellation; only Chrome, Native
// transport and the business Host are in-memory substitutes.
function authorizedRig({source='custom_https',holdInference=false,unknownCancel=false,
  syncCancel=false,cancelGate=null}={}){
  let permitted=true,requestInGesture=false,inGesture=false,planned=0;
  const removed=new Set(),cancelled=[],native=[];
  let resolveInference,enteredInference;
  const inference=new Promise(resolve=>{resolveInference=resolve;});
  const inferenceEntered=new Promise(resolve=>{enteredInference=resolve;});
  const api={permissions:{
    request(){requestInGesture=inGesture;return Promise.resolve(permitted);},
    contains:async()=>permitted,
    onRemoved:{addListener:fn=>removed.add(fn),removeListener:fn=>removed.delete(fn)}
  }};
  const runtime=createSharedAIProviderRuntime({
    client:{requestWorkflowAI:async()=>({})},hostInstanceId:'my-agent-test',
    plannerFactory:()=>{
      const id='native-'+(native.length+1);native.push(id);
      return {
        probe:async()=>({state:'READY_FOR_TURN',readyForTurn:true}),
        async planStructured({request}){
          if(request==='other lease')return {question:'other lease alive'};
          enteredInference();
          if(holdInference)return inference;
          return planned++===0?{actions:[{type:'change_schedule',scheduleId:'plan1',operation:'pause'}]}:
            {question:'已完成'};
        },
        cancel(){cancelled.push(id);
          const error=Object.assign(new Error('Native receipt missing'),{code:'E_AI_OUTCOME_UNKNOWN'});
          if(syncCancel)throw error;
          return Promise.resolve(cancelGate).then(()=>{
            if(unknownCancel)throw error;
            return {state:'CANCELLED'};
          });
        },snapshot:()=>({sessionId:id}),dispose(){}
      };
    },
    facadeFactory:({localPlanner})=>({
      generateStructured:async args=>({proposal:await localPlanner.planStructured(args)})
    })
  });
  runtime.updateSettings({source,endpoint:'https://model.example/v1/responses',
    model:'test-model',apiKey:'memory-only'});
  const provider=createBusinessConversation({api,providerRuntime:runtime,
    hostInstanceId:'my-agent-test',consumerId:'tasks',instanceId:'tasks-one'});
  const x=rig([],{provider,api});
  return {agent:x.agent,client:x.client,runtime,provider,api,cancelled,inferenceEntered,resolveInference,
    get changes(){return x.changes;},
    get requestInGesture(){return requestInGesture;},
    send(){inGesture=true;try{return x.agent.send('暂停计划',trusted);}finally{inGesture=false;}},
    revoke(notify=true){permitted=false;if(notify)for(const fn of [...removed])fn(
      source==='local_codex'?{permissions:['nativeMessaging']}:{origins:['https://model.example/*']});},
    restore(){permitted=true;},
    dispose(){x.agent.dispose();provider.dispose();runtime.dispose();}
  };
}

test('real task Consumer revocation invalidates pending approval without a Provider generation change',async t=>{
  for(const source of ['custom_https','local_codex']){
    const x=authorizedRig({source});t.after(()=>x.dispose());
    const generation=x.runtime.configuration().generation;
    await x.send();
    assert.equal(x.agent.getSnapshot().status,'review');
    if(source==='custom_https')assert.equal(x.requestInGesture,true,'request starts before Send yields');
    x.revoke();
    assert.equal(x.runtime.configuration().generation,generation);
    assert.equal(x.agent.getSnapshot().pending,null);
    assert.match(x.agent.getSnapshot().rows.map(row=>row.message).join(' '),/模型权限已撤销/);
    x.restore();
    await x.agent.confirm(trusted);
    assert.equal(x.changes,0,'regrant must not revive an old approval');
  }
});

test('real Consumer assertWrite rechecks model grant after asynchronous schedule preflight',async t=>{
  const x=authorizedRig();t.after(()=>x.dispose());
  await x.send();
  const request=x.client.request;
  x.client.request=async(name,payload)=>{
    const response=await request(name,payload);
    if(name==='listSchedules')x.revoke(false); // No onRemoved or generation bump.
    return response;
  };
  await x.agent.confirm(trusted);
  await x.agent.confirm(trusted);
  assert.equal(x.changes,0);
  assert.equal(x.agent.getSnapshot().pending,null);
  assert.match(x.agent.getSnapshot().rows.map(row=>row.message).join(' '),/模型.*权限.*失效/);
});

test('real task Consumer releases completed authorization before the next model decision',async t=>{
  const x=authorizedRig();t.after(()=>x.dispose());
  await x.send();
  await x.agent.confirm(trusted);
  assert.equal(x.changes,1);
  assert.equal(x.agent.getSnapshot().status,'idle');
  assert.equal(x.agent.getSnapshot().pending,null);
  assert.match(x.agent.getSnapshot().rows.map(row=>row.message).join(' '),/已完成/);
  // A completed authorization must not retain the Consumer's busy slot.
  await x.send();
  assert.match(x.agent.getSnapshot().rows.at(-1).message,/已完成/);
});

test('real Consumer Stop during submitted schedule write preserves the business effect',async t=>{
  const x=authorizedRig({source:'local_codex',unknownCancel:true});t.after(()=>x.dispose());
  await x.send();
  let entered,release;
  const submitted=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const request=x.client.request;
  x.client.request=async(name,payload)=>{
    if(name==='changeSchedule'){entered();await gate;}
    return request(name,payload);
  };
  const confirming=x.agent.confirm(trusted);
  await submitted;
  x.agent.stop();release();
  await confirming;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(x.changes,1,'AI Stop must not cancel or repeat the submitted Host write');
  assert.equal(x.agent.getSnapshot().pending,null);
  const messages=x.agent.getSnapshot().rows.map(row=>row.message).join(' ');
  assert.match(messages,/可能已经提交；请先核对/);
  assert.match(messages,/停止结果未知/);
  assert.doesNotMatch(messages,/已暂停.*已重新读取计划列表验证/);
  assert.deepEqual(x.cancelled,['native-1']);
});

test('real Native Consumer Stop exposes UNKNOWN, never replays or cancels another lease',async t=>{
  const x=authorizedRig({source:'local_codex',holdInference:true,unknownCancel:true});
  t.after(()=>x.dispose());
  const other=x.runtime.acquire({consumerId:'bookmark',instanceId:'other-one'});
  const first=await other.requestStructured({request:'other lease'});
  const sending=x.send();
  await x.inferenceEntered;
  x.agent.stop();
  await sending;
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(x.cancelled,['native-2']);
  const transcript=x.agent.getSnapshot().rows.map(row=>row.message).join(' ');
  assert.match(transcript,/停止结果未知.*E_AI_OUTCOME_UNKNOWN/);
  assert.match(transcript,/禁止自动重放/);
  assert.doesNotMatch(transcript,/Native 已停止成功|已成功停止/);
  const again=await other.requestStructured({request:'other lease'});
  assert.deepEqual(again.proposal,first.proposal);
  x.resolveInference({actions:[{type:'change_schedule',scheduleId:'plan1',operation:'pause'}]});
  await new Promise(resolve=>setImmediate(resolve));
  await x.agent.confirm(trusted);
  assert.equal(x.changes,0);
  assert.equal(x.agent.getSnapshot().pending,null,'late inference cannot restore approval');
  assert.deepEqual(x.cancelled,['native-2']);
});

test('synchronous Native cancel failure still retires approval and reports UNKNOWN',async t=>{
  const x=authorizedRig({source:'local_codex',syncCancel:true});t.after(()=>x.dispose());
  await x.send();
  let cleanup;
  assert.doesNotThrow(()=>{cleanup=x.agent.stop();});
  assert.equal(x.agent.getSnapshot().pending,null);
  await cleanup;
  assert.equal(x.agent.getSnapshot().busy,false);
  assert.match(x.agent.getSnapshot().rows.at(-1).message,/停止结果未知.*E_AI_OUTCOME_UNKNOWN/);
  await x.agent.confirm(trusted);
  assert.equal(x.changes,0);
});

test('Native cleanup keeps agent busy until UNKNOWN settles before admitting a new session',async t=>{
  let settle;
  const cancelGate=new Promise(resolve=>{settle=resolve;});
  const x=authorizedRig({source:'local_codex',holdInference:true,unknownCancel:true,cancelGate});
  t.after(()=>x.dispose());
  const sending=x.send();await x.inferenceEntered;
  const cleanup=x.agent.stop();
  await sending; // The old inference catch must not clear cleanup busy state.
  assert.equal(x.agent.getSnapshot().busy,true);
  assert.equal(x.agent.getSnapshot().status,'stopping');
  await assert.rejects(x.send(),{code:'E_AI_BUSY'});
  assert.equal(x.agent.stop(),cleanup,'repeated Stop shares the original cleanup');
  assert.deepEqual(x.cancelled,['native-1']);
  settle();await cleanup;
  assert.equal(x.agent.getSnapshot().busy,false);
  assert.match(x.agent.getSnapshot().rows.at(-1).message,/停止结果未知/);
  x.resolveInference({question:'新会话结果'});
  await x.send();
  assert.equal(x.agent.getSnapshot().rows.at(-1).message,'新会话结果');
  assert.equal(x.agent.getSnapshot().rows.filter(row=>/停止结果未知/.test(row.message)).length,1);
});

test('disposed agent ignores late Native UNKNOWN cleanup without publishing',async()=>{
  let settle;
  const cancelGate=new Promise(resolve=>{settle=resolve;});
  const x=authorizedRig({source:'local_codex',unknownCancel:true,cancelGate});
  try{
    await x.send();
    const cleanup=x.agent.stop();
    let published=0;x.agent.subscribe(()=>{published++;});
    x.agent.dispose();
    const snapshot=x.agent.getSnapshot();
    settle();await cleanup;
    assert.equal(x.agent.getSnapshot(),snapshot);
    assert.equal(published,0);
    assert.doesNotMatch(snapshot.rows.map(row=>row.message).join(' '),/停止结果未知/);
  }finally{x.dispose();}
});
