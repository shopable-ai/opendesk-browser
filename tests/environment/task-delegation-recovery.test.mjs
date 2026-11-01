import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskDelegationHost} from '../../src/platform/host/task-delegation.js';

const err=code=>Object.assign(new Error(code),{code});
const sha='a'.repeat(64);
const pin={taskId:'demo.search',version:'1.0.0',manifestHash:sha,contentHash:sha,
  installationId:'00000000-0000-4000-8000-000000000000',generation:1};
const app={appId:'demo-flow',packageHash:'b'.repeat(64),generation:'epoch-1',
  tasks:[Object.fromEntries(['taskId','version','manifestHash','contentHash'].map(k=>[k,pin[k]]))]};
const resolved={...pin,scriptId:'task:demo.search',revision:1,manifest:{deadlineMs:30000}};
const taskInput={...pin};
const page={tabId:7,frameId:0,documentId:'document-a',
  url:'https://example.com/search',windowId:2};

function fixture(){
  const ledger=new Map();
  let starts=0,inspects=0,stops=0,revoked=false;
  const client={async request(method,value){
    if(method==='resolveInstalledTask')return structuredClone(resolved);
    if(method==='prepareDelegatedStep'){
      const id=value.clientRequestId,previous=ledger.get(id);
      if(previous){
        if(previous.cancelled)throw err('E_CANCELLED');
        if(previous.paramsDigest!==value.paramsDigest)throw err('E_REQUEST_CONFLICT');
        return {operationRef:previous.operationRef,state:previous.state,
          runId:previous.runId,deadlineAt:previous.deadlineAt};
      }
      const row={operationRef:'op-'+id,paramsDigest:value.paramsDigest,
        state:'prepared',runId:null,resultId:null,deadlineAt:value.deadlineAt,cancelled:false};
      ledger.set(id,row);
      return {operationRef:row.operationRef,state:row.state,runId:null,deadlineAt:row.deadlineAt};
    }
    if(method==='cancelDelegatedStep'){
      const row=ledger.get(value.clientRequestId)??{operationRef:'op-'+value.clientRequestId,
        state:'cancelled',runId:null,cancelled:true,prepared:false};
      row.cancelled=true;row.state=row.runId?'stopping':'cancelled';ledger.set(value.clientRequestId,row);
      return {operationRef:row.operationRef,state:row.state,runId:row.runId,
        semantic:row.runId?'FOUND_RUNNING':'UNKNOWN'};
    }
    if(method==='inspectDelegatedStep'){
      inspects++;
      const row=ledger.get(value.clientRequestId);
      if(!row)return {semantic:'UNKNOWN',state:'unknown',runId:null,resultId:null,
        operationRef:null,result:null,retirementState:null};
      return {semantic:row.runId?'FOUND_RESULT':'UNKNOWN',
        state:row.runId?'completed':row.state,runId:row.runId,resultId:row.resultId,
        operationRef:row.operationRef,retirementState:row.runId?'released':null,
        result:row.runId?{resultId:row.resultId,runId:row.runId,
          outcome:{ok:false,error:{code:'E_DEMO'}}}:null};
    }
    throw err('E_SCHEMA');
  }};
  const host={
    async start(request){
      starts++;
      assert.equal(request.taskDelegationStep.operationRef,'op-'+request.taskDelegationStep.clientRequestId);
      const row=ledger.get(request.taskDelegationStep.clientRequestId);
      assert.equal(row.state,'prepared');
      row.state='submitted';row.runId='run-'+starts;row.resultId='result-'+starts;
      return {runId:row.runId,resultId:row.resultId};
    },
    async stop(){stops++;},
    cancelStart(){return true;},
    controller:{async snapshotControllerRun(){throw err('E_OWNER');}}
  };
  const create=instanceId=>createTaskDelegationHost({api:{},client,host,
    appId:app.appId,instanceId,assertInstance:()=>{},
    readApp:async()=>{if(revoked)throw err('E_TOOL_DISABLED');return structuredClone(app);},
    assertApp:async binding=>{
      if(revoked||binding.appId!==app.appId||binding.generation!==app.generation)
        throw err('E_PERMISSION');
    },
    currentPageTarget:{capture:()=>structuredClone(page),revalidate:async()=>{}},
    clock:()=>1000});
  return {create,ledger,get starts(){return starts;},get inspects(){return inspects;},
    get stops(){return stops;},revoke(){revoked=true;}};
}
const startInput=(clientRequestId,params={query:'OpenDesk'})=>({
  clientRequestId,task:structuredClone(taskInput),params
});

test('J06: after a new iframe opens, read the original result without calling start',async()=>{
  const f=fixture(),old=f.create('iframe-1');
  const started=await old.request('tasks.start',startInput('step-a'),{verifiedUserActivation:true});
  assert.equal(started.runId,'run-1');
  await old.dispose();
  const newer=f.create('iframe-2');
  const found=await newer.request('tasks.read',{clientRequestId:'step-a'});
  assert.equal(found.semantic,'FOUND_RESULT');
  assert.equal(found.runId,'run-1');
  assert.equal(found.resultId,'result-1');
  assert.equal(found.retirementState,'released');
  assert.equal(f.starts,1);
  assert.equal(f.inspects,1);
});


test('J06: original iframe preserves six-field pin for read and stop compatibility',async()=>{
  const f=fixture(),one=f.create('iframe-live');
  const started=await one.request('tasks.start',startInput('step-live'),{verifiedUserActivation:true});
  assert.equal(started.runId,'run-1');
  const read=await one.request('tasks.read',{clientRequestId:'step-live'});
  assert.equal(read.semantic,'FOUND_RESULT');
  const stopped=await one.request('tasks.stop',{clientRequestId:'step-live'});
  assert.equal(stopped.runId,'run-1');
  assert.equal(stopped.state,'stopping');
  assert.equal(f.starts,1);
  assert.equal(f.stops,1);
});

test('J06: new Host manual start with the same step cannot submit a second Run',async()=>{
  const f=fixture(),old=f.create('iframe-1');
  await old.request('tasks.start',startInput('step-b'),{verifiedUserActivation:true});
  const newer=f.create('iframe-2');
  const result=await newer.request('tasks.start',startInput('step-b'),{verifiedUserActivation:true});
  assert.equal(result.runId,'run-1');
  assert.equal(f.starts,1);
});

test('J06: stop before prepare installs a persistent future-submit fence',async()=>{
  const f=fixture(),one=f.create('iframe-1');
  const stop=await one.request('tasks.stop',{clientRequestId:'step-c'});
  assert.equal(stop.state,'cancelled');
  await assert.rejects(one.request('tasks.start',startInput('step-c'),{verifiedUserActivation:true}),
    error=>error.code==='E_CANCELLED');
  const two=f.create('iframe-2');
  await assert.rejects(two.request('tasks.start',startInput('step-c'),{verifiedUserActivation:true}),
    error=>error.code==='E_CANCELLED');
  assert.equal(f.starts,0);
});

test('J06: same logical step with conflicting parameters is never re-admitted',async()=>{
  const f=fixture(),one=f.create('iframe-1');
  await one.request('tasks.start',startInput('step-d'),{verifiedUserActivation:true});
  const two=f.create('iframe-2');
  await assert.rejects(two.request('tasks.start',startInput('step-d',{query:'different'}),{verifiedUserActivation:true}),
    error=>error.code==='E_REQUEST_CONFLICT');
  assert.equal(f.starts,1);
});

test('J06: removed App authorization prevents cross-Host result disclosure',async()=>{
  const f=fixture(),old=f.create('iframe-1');
  await old.request('tasks.start',startInput('step-e'),{verifiedUserActivation:true});
  f.revoke();
  const newer=f.create('iframe-2');
  await assert.rejects(newer.request('tasks.read',{clientRequestId:'step-e'}),
    error=>error.code==='E_TOOL_DISABLED');
  assert.equal(f.inspects,0);
});

test('J06: missing history is UNKNOWN and never triggers a new prepare or start',async()=>{
  const f=fixture(),fresh=f.create('iframe-2');
  const result=await fresh.request('tasks.read',{clientRequestId:'missing'});
  assert.equal(result.semantic,'UNKNOWN');
  assert.equal(result.runId,null);
  assert.equal(f.starts,0);
  assert.equal(f.ledger.size,0);
});
