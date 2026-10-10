import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowAIService} from '../../src/native-agent/workflow-ai-service.js';
import {createWorkflowAIClient} from '../../src/native-agent/workflow-ai-client.js';
import {WORKFLOW_AI_PROTOCOL} from '../../src/native-agent/workflow-ai-protocol.js';
import {createNativeAgentService} from '../../src/native-agent/service-worker.js';
import {AGENT_ENABLED_KEY} from '../../src/native-agent/protocol.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate){for(let i=0;i<50&&!predicate();i++)await tick();assert.ok(predicate());}
function fixture({version=1,timeoutMs=30000}={}) {
  const sent=[],responses=[],hosts=new Map();let granted=true;
  const host={registrationId:'reg-one',postMessage:m=>responses.push(m)};hosts.set('document-one',host);
  const connection={port:{postMessage:m=>sent.push(m)},enabled:true,ready:true,generation:1,workflowAiVersion:version};
  const service=createWorkflowAIService({api:{permissions:{contains:async()=>granted}},hostPorts:hosts,
    connection:()=>connection,enable:async()=>{},refresh:async()=>{},timeoutMs});
  let serial=0;
  function request(method,params={},sessionId,from=host){const requestId='request-'+(++serial);
    service.acceptHostRequest(from,{type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId,
      clientGeneration:1,registrationId:from.registrationId,method,params,...(sessionId?{sessionId}:{})});return requestId;}
  function reply(wire,result,extra={}){service.receive({...wire,kind:'ai.response',result,...extra});}
  return {sent,responses,hosts,host,connection,service,request,reply,revoke(){granted=false;}};
}

test('old Node capability absence rejects AI without sending an unknown Native frame',async t=>{
  const f=fixture({version:undefined});f.connection.workflowAiVersion=undefined;t.after(()=>f.service.disconnected());
  const id=f.request('ai.capabilities.read');await until(()=>f.responses.some(m=>m.requestId===id));
  assert.equal(f.responses.at(-1).result.state,'CODEX_UNSUPPORTED');assert.equal(f.sent.length,0);
  f.request('ai.session.open',{consent:{model:true,workflow:true,observation:false}});
  await until(()=>f.responses.length===2);assert.equal(f.responses.at(-1).error.code,'E_AI_UNSUPPORTED');assert.equal(f.sent.length,0);
});

test('unregistered and forged Host identities cannot start the provider',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  const other={registrationId:'reg-one',postMessage(){throw Error('untrusted Host must not receive data');}};
  f.request('ai.capabilities.read',{},undefined,other);await tick();assert.equal(f.sent.length,0);
  f.service.acceptHostRequest(f.host,{type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId:'forged',
    clientGeneration:1,registrationId:'wrong',method:'ai.capabilities.read',params:{}});
  await until(()=>f.responses.length);assert.equal(f.responses.at(-1).error.code,'E_OWNER');assert.equal(f.sent.length,0);
});

test('SW owns identity and prevents a different registered window from reading session events',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{consent:{model:true,workflow:true,observation:false}});await until(()=>f.sent.length===1);
  const first=f.sent[0];assert.ok(first.ownerId);assert.equal(first.generation,1);
  f.reply(first,{sessionId:'session-one',threadId:'thread-one'});await until(()=>f.responses.length===1);
  const otherResponses=[],other={registrationId:'reg-two',postMessage:m=>otherResponses.push(m)};f.hosts.set('document-two',other);
  f.request('ai.events.read',{cursor:0},'session-one',other);await until(()=>otherResponses.length===1);
  assert.equal(otherResponses[0].error.code,'E_OWNER');assert.equal(f.sent.length,1);
  f.request('ai.events.read',{cursor:0},'session-one');await until(()=>f.sent.length===2);
  assert.equal(f.sent[1].ownerId,first.ownerId);f.reply(f.sent[1],{events:[],cursor:0});await tick();
});

for(const field of ['ownerId','registrationId','generation','sessionId'])test('response rejects mismatched '+field,async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);f.reply(f.sent[0],{sessionId:'session-one'});await until(()=>f.responses.length===1);
  f.request('ai.events.read',{cursor:0},'session-one');await until(()=>f.sent.length===2);
  f.reply(f.sent[1],{events:[{text:'private'}],cursor:1},{[field]:field==='generation'?2:'other'});
  await until(()=>f.responses.length===2);assert.equal(f.responses[1].error.code,'E_AI_PROTOCOL');assert.equal(f.responses[1].result,undefined);
});

test('permission revocation after dispatch prevents delivery and closes the owner',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.capabilities.read');await until(()=>f.sent.length===1);f.revoke();f.reply(f.sent[0],{authState:'chatgpt'});
  await until(()=>f.responses.length===1);assert.equal(f.responses[0].error.code,'E_PERMISSION');
  assert.equal(f.sent.at(-1).method,'ai.session.close');assert.equal(f.sent.at(-1).sessionId,undefined);
});

test('Host closes while session.open is pending: owner cleanup and late response never deliver',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);const first=f.sent[0];
  f.hosts.delete('document-one');f.service.dropHost(f.host);
  assert.equal(f.sent.at(-1).method,'ai.session.close');assert.equal(f.sent.at(-1).ownerId,first.ownerId);
  f.reply(first,{sessionId:'orphan'});await tick();assert.equal(f.responses.length,0);
});

test('disconnect invalidates native generations and does not replay start',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);const first=f.sent[0];
  f.connection.ready=false;f.connection.generation++;f.service.disconnected();
  f.connection.ready=true;f.reply(first,{sessionId:'old'});await tick();
  assert.equal(f.responses[0].error.code,'E_AI_DISCONNECTED');assert.equal(f.sent.length,1);
});

test('UTF-8 frame budget rejects oversized requests before launching Codex',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{model:'汉'.repeat(21000)});await until(()=>f.responses.length===1);
  assert.equal(f.responses[0].error.code,'E_AI_LIMIT');assert.equal(f.sent.length,0);
});

test('timeout closes all owned sessions without re-sending a potentially accepted open',async t=>{
  const f=fixture({timeoutMs:10});t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.responses.length===1);
  assert.equal(f.responses[0].error.code,'E_AI_OUTCOME_UNKNOWN');
  assert.deepEqual(f.sent.map(m=>m.method),['ai.session.open','ai.session.close']);
});

test('repeated Host mutation ID cannot be remapped into a second Native request',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  const message={type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId:'same-mutation',
    clientGeneration:1,registrationId:'reg-one',method:'ai.session.open',params:{}};
  f.service.acceptHostRequest(f.host,message);await until(()=>f.sent.length===1);
  f.service.acceptHostRequest(f.host,message);await until(()=>f.responses.length===1);
  assert.equal(f.responses[0].error.code,'E_AI_REQUEST_REPLAY');assert.equal(f.sent.length,1);
  f.reply(f.sent[0],{sessionId:'one'});await tick();
});

test('protocol failure retires the owner and rejects its other pending event reads',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);f.reply(f.sent[0],{sessionId:'session-one'});await until(()=>f.responses.length===1);
  f.request('ai.events.read',{cursor:0},'session-one');f.request('ai.events.read',{cursor:1},'session-one');await until(()=>f.sent.length===3);
  f.reply(f.sent[1],{events:[]},{ownerId:'forged'});await until(()=>f.responses.length===3);
  assert.equal(f.responses[1].error.code,'E_AI_PROTOCOL');assert.equal(f.responses[2].error.code,'E_AI_PROTOCOL');
  f.reply(f.sent[2],{events:[{text:'late-secret'}]});await tick();assert.equal(f.responses.length,3);
  f.request('ai.plan.start',{input:'stale'},'session-one');await until(()=>f.responses.length===4);
  assert.equal(f.responses[3].error.code,'E_OWNER');
});

test('Native reconnect does not clear mutation replay protection for the same Host',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  const message={type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId:'before-reconnect',
    clientGeneration:1,registrationId:'reg-one',method:'ai.session.open',params:{}};
  f.service.acceptHostRequest(f.host,message);await until(()=>f.sent.length===1);
  f.connection.ready=false;f.connection.generation++;f.service.disconnected();f.connection.ready=true;
  f.service.acceptHostRequest(f.host,message);await until(()=>f.responses.some(m=>m.error?.code==='E_AI_REQUEST_REPLAY'));
  assert.equal(f.sent.length,1);
});

test('cancel and close keep independent bounded slots when ordinary requests are pending',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);f.reply(f.sent[0],{sessionId:'session-one'});await until(()=>f.responses.length===1);
  for(let i=0;i<4;i++)f.request('ai.events.read',{cursor:i},'session-one');
  await until(()=>f.sent.length===5);
  f.request('ai.plan.cancel',{},'session-one');f.request('ai.session.close',{},'session-one');
  await until(()=>f.sent.length===7);
  assert.deepEqual(f.sent.slice(-2).map(m=>m.method),['ai.plan.cancel','ai.session.close']);
  const id=f.request('ai.plan.cancel',{},'session-one');
  await until(()=>f.responses.some(m=>m.requestId===id));
  assert.equal(f.responses.find(m=>m.requestId===id).error.code,'E_AI_LIMIT');
});

test('close all fences pending opens and mints a new owner only for a fresh user request',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);const opening=f.sent[0];
  f.request('ai.session.close',{});await until(()=>f.sent.length===2);f.reply(f.sent[1],{state:'CLOSED'});
  await until(()=>f.responses.filter(m=>m.type==='native-agent.ai.response').length===2);
  f.reply(opening,{sessionId:'late-session'});await tick();
  assert.equal(f.responses.some(m=>m.result?.sessionId==='late-session'),false);
  f.request('ai.session.open',{});await until(()=>f.sent.length===3);
  assert.notEqual(f.sent[2].ownerId,opening.ownerId);
});

test('full mutation ledger still terminates its owner and does not allocate or replay a turn',async t=>{
  const f=fixture();t.after(()=>f.service.disconnected());
  f.request('ai.session.open',{});await until(()=>f.sent.length===1);
  const opening=f.sent[0];f.reply(opening,{sessionId:'session-one'});await until(()=>f.responses.length===1);
  for(let i=0;i<511;i++)f.request('ai.connection.enable');
  await until(()=>f.responses.length===512);
  const stop=f.request('ai.plan.cancel',{},'session-one');
  await until(()=>f.responses.some(m=>m.requestId===stop));
  assert.equal(f.responses.find(m=>m.requestId===stop).error.code,'E_AI_OUTCOME_UNKNOWN');
  assert.deepEqual(f.sent.map(m=>m.method),['ai.session.open','ai.session.close']);
  assert.equal(f.sent[1].ownerId,opening.ownerId);assert.equal(f.sent[1].sessionId,undefined);
  const close=f.request('ai.session.close');await until(()=>f.responses.some(m=>m.requestId===close));
  assert.equal(f.sent.length,2,'retired owner must not spawn another cleanup or process');
  const another=f.request('ai.session.open',{});await until(()=>f.responses.some(m=>m.requestId===another));
  assert.equal(f.responses.find(m=>m.requestId===another).error.code,'E_AI_LIMIT');
});

test('an open delayed before dispatch cannot outlive a completed owner close',async t=>{
  const sent=[],responses=[],host={registrationId:'reg-one',postMessage:m=>responses.push(m)};
  const connection={enabled:true,ready:true,workflowAiVersion:1,generation:1,port:{postMessage:m=>sent.push(m)}};
  let release,first=true;
  const service=createWorkflowAIService({api:{permissions:{contains:()=>{
    if(first){first=false;return new Promise(resolve=>{release=resolve;});}return Promise.resolve(true);
  }}},hostPorts:new Map([['doc',host]]),connection:()=>connection,enable:async()=>{},refresh:async()=>{}});
  t.after(()=>service.disconnected());
  const request=(id,method)=>service.acceptHostRequest(host,{type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,
    requestId:id,clientGeneration:1,registrationId:'reg-one',method,params:{}});
  request('delayed-open','ai.session.open');await until(()=>release);
  request('close-owner','ai.session.close');await until(()=>sent.length===1);
  service.receive({...sent[0],kind:'ai.response',result:{state:'CLOSED'}});
  await until(()=>responses.some(m=>m.requestId==='close-owner'));
  release(true);await until(()=>responses.some(m=>m.requestId==='delayed-open'));
  assert.equal(responses.find(m=>m.requestId==='delayed-open').error.code,'E_AI_DISCONNECTED');
  assert.deepEqual(sent.map(m=>m.method),['ai.session.close']);
});

test('client waits for exact host-bound, correlates registration and drops old responses after reconnect',async t=>{
  const client=createWorkflowAIClient(),sent=[];t.after(()=>client.dispose());
  client.connect({postMessage:m=>sent.push(m)},'reg-one');
  const first=client.request('ai.capabilities.read');const rejected=assert.rejects(first,{code:'E_AI_DISCONNECTED'});
  client.receive({type:'host-bound',registrationId:'wrong'});assert.equal(sent.length,0);
  client.receive({type:'host-bound',registrationId:'reg-one'});assert.equal(sent.length,1);
  client.disconnect();await rejected;client.connect({postMessage:m=>sent.push(m)},'reg-one');
  client.receive({type:'host-bound',registrationId:'reg-one'});const next=client.request('ai.capabilities.read');
  const [old,current]=sent;
  client.receive({...old,type:'native-agent.ai.response',result:{state:'OLD'}});
  client.receive({...current,type:'native-agent.ai.response',result:{state:'READY_FOR_TURN'}});
  assert.equal((await next).state,'READY_FOR_TURN');assert.equal(client.snapshot().pending,0);
});

test('client preserves two bounded stop/close slots after ordinary request capacity is full',async t=>{
  const client=createWorkflowAIClient(),sent=[];t.after(()=>client.dispose());
  client.connect({postMessage:m=>sent.push(m)},'reg-one');
  client.receive({type:'host-bound',registrationId:'reg-one'});
  const reads=Array.from({length:8},()=>client.request('ai.events.read',{cursor:0},'session-one').catch(e=>e));
  await assert.rejects(client.request('ai.events.read',{cursor:0},'session-one'),{code:'E_AI_LIMIT'});
  const stop=client.request('ai.plan.cancel',{},'session-one').catch(e=>e);
  const close=client.request('ai.session.close',{},'session-one').catch(e=>e);
  assert.deepEqual(sent.slice(-2).map(m=>m.method),['ai.plan.cancel','ai.session.close']);
  await assert.rejects(client.request('ai.plan.cancel',{},'session-one'),{code:'E_AI_LIMIT'});
  assert.equal(client.snapshot().pending,10);
  client.disconnect();await Promise.all([...reads,stop,close]);
  assert.equal(client.snapshot().pending,0);
});

test('native integration preserves legacy bridge.status and capability negotiation',async t=>{
  const listeners=()=>{const all=new Set();return {addListener:l=>all.add(l),removeListener:l=>all.delete(l),fire:m=>{for(const l of all)l(m);}};};
  const sent=[],returned=[];const native={onMessage:listeners(),onDisconnect:listeners(),postMessage:m=>sent.push(m),disconnect(){this.onDisconnect.fire();}};
  const host={registrationId:'reg-one',postMessage:m=>returned.push(m)};
  const api={runtime:{id:'a'.repeat(32),getManifest:()=>({version:'1'}),connectNative:()=>native},permissions:{contains:async()=>true,onRemoved:listeners()},
    storage:{local:{get:async()=>({[AGENT_ENABLED_KEY]:true}),set:async()=>{}}}};
  const service=createNativeAgentService({api,hostPorts:new Map([['doc',host]])});t.after(()=>service.dispose());
  await service.ready;native.onMessage.fire({v:1,kind:'hello'});
  service.acceptHostRequest(host,{type:'native-agent.ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId:'ai-old',clientGeneration:1,
    registrationId:'reg-one',method:'ai.capabilities.read',params:{}});
  await until(()=>returned.some(m=>m.requestId==='ai-old'));
  assert.equal(returned.find(m=>m.requestId==='ai-old').result.state,'CODEX_UNSUPPORTED');
  native.onMessage.fire({v:1,kind:'request',requestId:'old-status',method:'bridge.status',params:{}});
  await until(()=>sent.some(m=>m.requestId==='old-status'));
  assert.equal(sent.find(m=>m.requestId==='old-status').result.nativeConnected,true);assert.equal(sent.filter(m=>m.kind==='ai.request').length,0);
});
