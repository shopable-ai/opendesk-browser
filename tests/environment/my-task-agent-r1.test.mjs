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
  let executions=0,changes=0,planned=0,paused=false;
  const client={
    async request(name,payload){
      if(name==='listTaskCatalog')return {installed:hasTask?[installed()]:[],
        catalog:hasTask?[candidate()]:[]};
      if(name==='listSchedules')return {schedules:[{
        scheduleId:'plan1',title:'早间计划',taskId:'search',paused,generation:1
      }]};
      if(name==='changeSchedule'){changes++;paused=payload.action==='pause';return {scheduleId:payload.scheduleId};}
      throw new Error('Unexpected Host operation '+name);
    },
    controller:{async snapshotControllerRun(){return {
      runs:[{runId:'run1',revision:{scriptId:'task:search:1.0.0'},state:'completed'}],
      results:[{runId:'run1',outcome:{ok:false,error:{code:'E_SAMPLE',message:'测试结果'}},
        revision:{scriptId:'task:search:1.0.0'}}]
    };}}
  };
  const taskWorkbench={runInstalledForAgent:async()=>{executions++;return {runId:'run1'};},
    stopAgentTask:async()=>{},myView:{field:()=>({value:'search'})}};
  const provider={source:()=>({provider:'local_codex'}),
    request:async()=>({proposal:proposals[Math.min(planned++,proposals.length-1)],
      authorization:{release(){}}}),cancel:async()=>{}};
  const target={snapshot:{status:'available',origin:'https://example.com',url:'https://example.com/'}};
  const agent=createMyTaskAgent({client,taskWorkbench,provider,currentPageTarget:target,
    api:{permissions:{contains:async()=>true}}});
  return {agent,get executions(){return executions;},get changes(){return changes;},
    get planned(){return planned;}};
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
  assert.equal(rigged.agent.getSnapshot().pending,null);
  rigged.agent.dispose();
});

test('unknown task is rejected before RunHost, without inventing success',async()=>{
  const rigged=rig([{actions:[{type:'run_task',taskId:'missing',params:{}}]}],{hasTask:false});
  await rigged.agent.send('运行不存在的任务',trusted);
  await rigged.agent.confirm(trusted);
  assert.equal(rigged.executions,0);
  assert.match(rigged.agent.getSnapshot().rows.at(-1).message,/没有找到已安装任务/);
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
