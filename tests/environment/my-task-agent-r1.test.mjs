import test from 'node:test';
import assert from 'node:assert/strict';
import {createMyTaskAgent,validateMyTaskAgentProposal} from '../../src/ui/my-task-agent.js';

const schema={type:'object',properties:{},required:[],additionalProperties:false};
const installed=()=>({taskId:'search',version:'1.0.0',enabled:true,manifestHash:'pinned',
  installationId:'00000000-0000-0000-0000-000000000001',generation:1,
  scriptId:'task:search:1.0.0'});
const candidate=()=>({taskId:'search',version:'1.0.0',manifestHash:'pinned',
  stage:'available',manifest:{title:'网页搜索',description:'搜索当前网页',
    siteOrigins:['https://example.com'],paramsSchema:schema}});
const trusted={isTrusted:true};
function rig(proposals,{hasTask=true}={}){
  let executions=0,changes=0,planned=0,paused=false,generation=1,scheduleGeneration=1,pinned=null;
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
    request:async()=>({proposal:proposals[Math.min(planned++,proposals.length-1)],
      authorization:{release(){}}}),cancel:async()=>{}};
  const target={snapshot:{status:'available',origin:'https://example.com',url:'https://example.com/'}};
  const agent=createMyTaskAgent({client,taskWorkbench,provider,currentPageTarget:target,
    api:{permissions:{contains:async()=>true}}});
  return {agent,get executions(){return executions;},get changes(){return changes;},
    get pinned(){return pinned;},bumpGeneration(){generation++;},get planned(){return planned;}};
}

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
  assert.match(rigged.agent.getSnapshot().rows.map(x=>x.message).join(' '),/任务「search」已结束本次执行/);
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
  startDeadlineMs:300000,paused:false,owner:null
});
function editRig(proposals,{permission=true,uncertain=false,staleReadback=false,holdSave=false}={}){
  let plan=initialPlan(),installedGeneration=1,saveCount=0,proposalCount=0,latestInput=null;
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
    api:{permissions:{contains:async()=>grant}}});
  return {agent,observations,get plan(){return plan;},get saveCount(){return saveCount;},
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
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/已更新并重新读取验证/);
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
  assert.match(x.agent.getSnapshot().rows.map(v=>v.message).join(' '),/操作结果未知，禁止自动重试/);
  x.agent.dispose();
});

test('readback mismatch after schedule edit is reported unknown, never as success',async()=>{
  const x=editRig([{actions:[{type:'edit_schedule',scheduleId:'plan1',
    changes:{triggerSpec:{hour:8,minute:0}}}]}],{staleReadback:true});
  await x.agent.send('改到8点',trusted);
  await x.agent.confirm(trusted);
  assert.equal(x.saveCount,1);
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
  assert.equal(x.plan.triggerSpec.hour,15);
  const messages=x.agent.getSnapshot().rows.map(v=>v.message).join(' ');
  assert.match(messages,/可能已经提交；请先核对/);
  assert.doesNotMatch(messages,/已更新并重新读取验证/);
  x.agent.dispose();
});
