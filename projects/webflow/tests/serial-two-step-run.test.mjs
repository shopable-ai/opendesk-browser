import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSerialTwoStepRun} from '../trusted/serial-two-step-run.js';

const SHA='a'.repeat(64);
const input=()=>({workflowId:'wf-workflow-0001',operationKey:'wf-task-0001',deliveryKey:'wf-delivery-0001',
  authorizationRef:'grant-00000001',source:{origin:'https://example.test',tabId:7,documentId:'doc-11111111'},
  task:{taskId:'example.process',version:'1.0.0'},inputRefs:[{kind:'artifact',id:'ref-11111111',sha256:SHA}],
  deadlineAt:Date.now()+600000});
function storage(){
  const map=new Map();let queue=Promise.resolve();
  return {map,transaction(_stores,mode,fn){
    const tx={get:async(_store,key)=>structuredClone(map.get(key)),put:async(_store,key,value)=>{map.set(key,structuredClone(value));}};
    if(mode==='readonly')return fn(tx);
    const done=queue.then(()=>fn(tx));queue=done.catch(()=>{});return done;
  }};
}
function harness(options={}){
  const data=storage(),stats={dispatch:0,deliver:0,readB:0,readA:0};
  let authorized=true,owner=true,completedB=true,completedA=true;
  const make=()=>createSerialTwoStepRun({storage:data,namespace:'webflow-chat-01',
    assertOwner:()=>owner,authorize:()=>authorized,
    dispatchB:async()=>{stats.dispatch++;if(options.dispatchUnknown)throw Error('lost ack');return {runId:'run-00000001'};},
    readB:async()=>{stats.readB++;return completedB?{verified:true,operationKey:'wf-task-0001',
      runId:'run-00000001',resultId:'result-000001',resultRef:{kind:'durable-result',id:'result-000001',sha256:SHA}}:null;},
    deliverA:async()=>{stats.deliver++;if(options.deliveryUnknown)throw Error('lost ack');},
    readA:async()=>{stats.readA++;return completedA?{verified:true,deliveryKey:'wf-delivery-0001',
      messageId:'message-00001',deliveryRef:{kind:'message',id:'message-00001',sha256:SHA},aiReplyObserved:false}:null;}});
  return {data,stats,make,setAuthorized:v=>{authorized=v},setOwner:v=>{owner=v},
    setCompletedB:v=>{completedB=v},setCompletedA:v=>{completedA=v}};
}

async function toBVerified(flow,id){
  await flow.advance(id);await flow.advance(id);
}

test('two real-effect slots are fenced by durable intent; completion is observation-only',async()=>{
  const h=harness(),w=h.make(),i=input();await w.start(i);
  assert.equal((await w.advance(i.workflowId)).phase,'B_ADMITTED');
  assert.equal((await w.advance(i.workflowId)).phase,'B_VERIFIED');
  assert.equal((await w.advance(i.workflowId)).phase,'A_INTENT_RECORDED');
  assert.equal((await w.advance(i.workflowId)).phase,'DONE');
  assert.equal(h.stats.dispatch,1);assert.equal(h.stats.deliver,1);
  const run=await w.get(i.workflowId);
  assert.equal(run.bProof.resultId,'result-000001');
  assert.equal(run.aProof.messageId,'message-00001');
  assert.equal((await w.advance(i.workflowId)).phase,'DONE');
  assert.equal(h.stats.dispatch,1);assert.equal(h.stats.deliver,1);
});

test('repeated start same canonical snapshot preserves original identity',async()=>{
  const h=harness(),w=h.make(),i=input(),a=await w.start(i);
  const reordered=Object.fromEntries(Object.entries(i).reverse());
  const b=await w.start(reordered);
  assert.equal(a.revision,1);assert.equal(b.revision,1);
  assert.equal(h.stats.dispatch,0);
});

test('same workflowId with drifted source or authority fails closed',async()=>{
  const w=harness().make(),i=input();await w.start(i);
  await assert.rejects(w.start({...i,authorizationRef:'grant-00000002'}),{code:'E_SERIAL_WORKFLOW_CONFLICT'});
  await assert.rejects(w.start({...i,source:{...i.source,tabId:8}}),{code:'E_SERIAL_WORKFLOW_CONFLICT'});
});

test('B lost ACK and restart never resubmit; query only uses original key',async()=>{
  const h=harness({dispatchUnknown:true}),i=input(),a=h.make();await a.start(i);
  assert.equal((await a.advance(i.workflowId)).phase,'B_INTENT_RECORDED');
  const afterRestart=h.make();
  assert.equal((await afterRestart.advance(i.workflowId)).phase,'B_VERIFIED');
  assert.equal(h.stats.dispatch,1);
});

test('B incomplete holds delivery with zero A effects',async()=>{
  const h=harness(),w=h.make(),i=input();h.setCompletedB(false);await w.start(i);
  await w.advance(i.workflowId);
  assert.equal((await w.advance(i.workflowId)).reason,'WAIT_B_VERIFIED');
  assert.equal(h.stats.deliver,0);
});

test('A lost ACK and restart cannot resend',async()=>{
  const h=harness({deliveryUnknown:true}),i=input(),w=h.make();await w.start(i);
  await toBVerified(w,i.workflowId);
  assert.equal((await w.advance(i.workflowId)).reason,'E_SERIAL_A_UNKNOWN');
  const restart=h.make();
  assert.equal((await restart.advance(i.workflowId)).phase,'DONE');
  assert.equal(h.stats.deliver,1);
});

test('A absent after original attempt stays unknown on repeated recovery',async()=>{
  const h=harness({deliveryUnknown:true}),i=input(),w=h.make();h.setCompletedA(false);await w.start(i);
  await toBVerified(w,i.workflowId);await w.advance(i.workflowId);
  assert.equal((await w.advance(i.workflowId)).phase,'A_INTENT_RECORDED');
  assert.equal((await w.advance(i.workflowId)).phase,'A_INTENT_RECORDED');
  assert.equal(h.stats.deliver,1);
});

test('no dispatch or delivery after revoke/expiry',async()=>{
  const h=harness(),w=h.make(),i=input();await w.start(i);h.setAuthorized(false);
  assert.equal((await w.advance(i.workflowId)).reason,'E_SERIAL_WORKFLOW_AUTH');
  assert.equal(h.stats.dispatch,0);h.setAuthorized(true);
  await toBVerified(w,i.workflowId);h.setAuthorized(false);
  assert.equal((await w.advance(i.workflowId)).reason,'E_SERIAL_WORKFLOW_AUTH');
  assert.equal(h.stats.deliver,0);
});

test('owner boundary rejects read on changed session',async()=>{
  const h=harness(),w=h.make(),i=input();await w.start(i);h.setOwner(false);
  await assert.rejects(w.get(i.workflowId),{code:'E_SERIAL_WORKFLOW_OWNER'});
  await assert.rejects(w.advance(i.workflowId),{code:'E_SERIAL_WORKFLOW_OWNER'});
  assert.equal(h.stats.dispatch,0);
});

test('concurrent advancement can dispatch B once only',async()=>{
  const h=harness(),w=h.make(),i=input();await w.start(i);
  await Promise.all([w.advance(i.workflowId),w.advance(i.workflowId),w.advance(i.workflowId)]);
  assert.equal(h.stats.dispatch,1);
});

test('generic coordinator has no hard-coded site routing, DOM or external send',()=>{
  const src=readFileSync(new URL('../trusted/serial-two-step-run.js',import.meta.url),'utf8');
  assert.doesNotMatch(src,/chatgpt\.com|github\.com|querySelector|page\.locator|\.click\(/iu);
  assert.doesNotMatch(src,/if\s*\(\s*taskId\s*===|if\s*\(\s*site\s*===/iu);
});
