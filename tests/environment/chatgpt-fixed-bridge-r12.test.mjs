import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,validChatGPTBridgeSource}
  from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {verifyChatGPTFixedDurableResult,formatChatGPTFixedResult,
  FIXED_TASK_SOURCE_HASH,FIXED_TASK_MANIFEST_HASH,FIXED_TASK_VERSION,
  createChatGPTFixedBridgeHost} from '../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {bridgePrompt} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const source={tabId:7,documentId:'document-123',url:'https://chatgpt.com/c/actual-session-123'};
const idA='11111111-1111-4111-8111-111111111111';
const idB='22222222-2222-4222-8222-222222222222';
function fakeStorage(){
  let saved={};
  return {
    async get(key){return {[key]:structuredClone(saved[key])};},
    async set(data){saved={...saved,...structuredClone(data)};},
    dump(){return structuredClone(saved);}
  };
}
function ledger(storage,ids,clock=()=>1000){
  let n=0;
  return createChatGPTBridgeTriggerLedger({storage,clock,generateId:()=>ids[n++]});
}
test('trusted trigger source has exact top-frame source identity and conversation',()=>{
  assert.equal(validChatGPTBridgeSource(source),true);
  for(const bad of [{...source,url:'https://evil.example/c/test'},
    {...source,url:'https://chatgpt.com/'},{...source,extra:true},
    {...source,documentId:''},{...source,tabId:-1}])
    assert.equal(validChatGPTBridgeSource(bad),false);
});
test('prepared nonce is worker-minted; auto approval is consumed exactly once and survives restart',async()=>{
  const storage=fakeStorage(),first=ledger(storage,[idA]);
  const prepared=await first.prepare(source);
  assert.equal(prepared.requestId,idA);
  await assert.rejects(first.reserve({source,requestId:idA,mode:'auto',turnKey:'turn-1',answerKey:'answer-1:0'}),
    {code:'E_BRIDGE_REPLAY'});
  await first.authorize({source,requestId:idA,mode:'auto'});
  await assert.rejects(first.reserve({source,requestId:idA,mode:'manual',turnKey:'turn-1',answerKey:'answer-1:0'}),
    {code:'E_BRIDGE_REPLAY'});
  assert.equal((await first.reserve({source,requestId:idA,mode:'auto',turnKey:'turn-1',answerKey:'answer-1:0'})).consumed,true);
  const restarted=ledger(storage,[]);
  await assert.rejects(restarted.reserve({source,requestId:idA,mode:'auto',turnKey:'turn-1',answerKey:'answer-1:0'}),
    {code:'E_BRIDGE_REPLAY'});
  await assert.rejects(restarted.authorize({source,requestId:idA,mode:'manual'}),{code:'E_BRIDGE_APPROVAL'});
});
test('a new request invalidates older approvals for the same document',async()=>{
  const storage=fakeStorage(),a=ledger(storage,[idA,idB]);
  await a.prepare(source);await a.authorize({source,requestId:idA,mode:'manual'});
  await a.prepare(source);
  await assert.rejects(a.reserve({source,requestId:idA,mode:'manual',turnKey:'x',answerKey:'y'}),
    {code:'E_BRIDGE_REPLAY'});
  await a.authorize({source,requestId:idB,mode:'manual'});
  await a.revokeSource(7);
  await assert.rejects(a.reserve({source,requestId:idB,mode:'manual',turnKey:'x',answerKey:'y'}),
    {code:'E_BRIDGE_REPLAY'});
});
test('auto approval expires and permission removal revokes unconsumed approvals',async()=>{
  let now=1000;const a=ledger(fakeStorage(),[idA],()=>now);
  await a.prepare(source);await a.authorize({source,requestId:idA,mode:'auto'});
  now+=300001;
  await assert.rejects(a.reserve({source,requestId:idA,mode:'auto',turnKey:'x',answerKey:'y'}),
    {code:'E_BRIDGE_REPLAY'});
  now=1000;await a.revokeApprovals();
  await assert.rejects(a.reserve({source,requestId:idA,mode:'auto',turnKey:'x',answerKey:'y'}),
    {code:'E_BRIDGE_REPLAY'});
});
const result={kind:'page.read.fixed.result',version:1,sourceUrl:'https://httpbingo.org/html',
  title:'Herman Melville - Moby-Dick',heading:'Herman Melville - Moby-Dick',
  excerpt:'Call me Ishmael.',observedAt:'2026-10-25T12:30:00.000Z'};
function fixture(){
  const runId='run-123',resultId='result-123',scriptId='task:page.read.fixed:1.0.0';
  const revision={scriptId,revision:1,sourceHash:FIXED_TASK_SOURCE_HASH};
  return {runId,resolved:{scriptId,revision:1},
    snapshot:{
      run:{runId,resultId,scriptId,state:'completed',sourceKind:'saved',
        contentHash:FIXED_TASK_SOURCE_HASH,revision},
      results:[{tag:'controller-result',runId,resultId,state:'completed',
        sourceKind:'saved',revision,outcome:{ok:true,valueWire:encodeValue(result)}}],
      resultDeliveryDenied:[]}};
}
test('fixed durable result requires actual matching run, revision, resultId and trusted decode',()=>{
  const {snapshot,resolved,runId}=fixture();
  const durable=verifyChatGPTFixedDurableResult(snapshot,runId,resolved);
  assert.equal(durable.value.excerpt,result.excerpt);
  assert.equal(durable.resultId,'result-123');
  assert.match(formatChatGPTFixedResult(idA,durable),/Call me Ishmael/);
  assert.match(formatChatGPTFixedResult(idA,durable),/未经信任/);
  const changed=[
    {...snapshot,run:{...snapshot.run,state:'paused_unknown'}},
    {...snapshot,run:{...snapshot.run,contentHash:'0'.repeat(64)}},
    {...snapshot,run:{...snapshot.run,resultId:'changed'}},
    {...snapshot,results:[...snapshot.results,...snapshot.results]},
    {...snapshot,resultDeliveryDenied:[runId]},
    {...snapshot,results:[{...snapshot.results[0],outcome:{ok:false}}]},
    {...snapshot,results:[{...snapshot.results[0],revision:{...snapshot.results[0].revision,sourceHash:'f'.repeat(64)}}]}
  ];
  for(const tampered of changed)assert.throws(()=>verifyChatGPTFixedDurableResult(tampered,runId,resolved));
});
test('fixed request prompt preserves issued identity, empty args and no claimed MCP',()=>{
  const prompt=bridgePrompt(idA);
  assert.ok(prompt.includes(idA));
  assert.ok(prompt.includes('page.read.fixed'));
  assert.ok(prompt.includes('httpbingo.org/html'));
  assert.ok(prompt.includes('"args": {}'));
  assert.ok(prompt.includes('不是你已注册的 MCP 工具'));
});

function hostHarness({override={},readReply=null}={}){
  const src=source;
  const request={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',
    version:1,requestId:idA,taskId:'page.read.fixed',args:{}};
  const candidateText=JSON.stringify(request),fx=fixture();
  const installed={taskId:'page.read.fixed',version:FIXED_TASK_VERSION,
    manifestHash:FIXED_TASK_MANIFEST_HASH,enabled:true,generation:4,
    installationId:'installation-1',scriptId:fx.resolved.scriptId};
  const manifest={taskId:'page.read.fixed',version:FIXED_TASK_VERSION,
    program:{sourceHash:FIXED_TASK_SOURCE_HASH,revision:1},
    siteOrigins:['https://httpbingo.org']};
  const catalog={installed:[installed],catalog:[{taskId:installed.taskId,
    version:installed.version,manifestHash:installed.manifestHash,
    stage:'available',manifest}]};
  const resolved={...fx.resolved,taskId:installed.taskId,version:FIXED_TASK_VERSION,
    manifestHash:FIXED_TASK_MANIFEST_HASH,contentHash:FIXED_TASK_SOURCE_HASH,
    generation:installed.generation,installationId:installed.installationId,manifest};
  const events={reserve:0,start:0,send:0};
  const api={runtime:{id:'extid',async sendMessage(message){
    assert.equal(message.kind,'reserve');events.reserve++;
    return {ok:true,data:{consumed:true}};}},tabs:{
      async get(tabId){return {id:tabId,url:src.url,windowId:2,incognito:false};},
      async sendMessage(tabId,message,opt){events.send++;
        assert.equal(tabId,src.tabId);
        assert.equal(opt.documentId,src.documentId);
        if(override.sendThrows)throw new Error('lost receipt');
        return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};
      }
    },permissions:{async contains(){return override.grants!==false;}}};
  const client={request:async method=>{
      if(method==='listTaskCatalog')return override.catalog||catalog;
      if(method==='resolveInstalledTask')return override.resolved||resolved;
      throw new Error('Unexpected '+method);
    },controller:{async snapshotControllerRun(){
      return override.snapshot||fx.snapshot;
    }}};
  const host={get currentRun(){return null;},
    async start(input){events.start++;events.lastStart=input;
      return {runId:fx.runId};},
    get completion(){return Promise.resolve(override.completion||{
      runId:fx.runId,state:'completed',result:{resultId:fx.snapshot.run.resultId}});}};
  const sender={id:'extid',frameId:0,url:src.url,documentId:src.documentId,
    tab:{id:src.tabId,windowId:2,incognito:false,url:src.url}};
  const message={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'execute',
    requestId:idA,mode:'manual',candidateText,sourceUrl:src.url,source:src,
    turnKey:'turn-1',answerKey:'answer-1:0'};
  const bridge=createChatGPTFixedBridgeHost({api,client,host,
    currentPageTarget:{snapshot:{windowId:2}},
    isVerifiedSidePanel:()=>true,checkTarget:async()=>{},
    readReply:readReply||(async()=>({
      turnKey:'turn-1',answerKey:'answer-1:0',blocks:[candidateText]}))});
  return {bridge,events,sender,message,fx,api};
}
test('trusted Side Panel uses one Foundation-owned target and one read-back verified chat send',async()=>{
  const h=hostHarness();
  const receipt=await h.bridge.handle(h.message,h.sender);
  assert.equal(receipt.sent,true);
  assert.equal(receipt.aiReplyObserved,true);
  assert.equal(h.events.reserve,1);
  assert.equal(h.events.start,1);
  assert.equal(h.events.send,1);
  assert.equal(h.events.lastStart.target.mode,'owned');
  assert.equal(h.events.lastStart.target.url,'https://httpbingo.org/html');
  assert.equal(h.events.lastStart.requestId,idA);
  assert.equal(h.events.lastStart.expectedTaskGeneration,4);
});
test('wrong document or re-generated assistant blocks admission without a run',async()=>{
  const bad=hostHarness();
  await assert.rejects(bad.bridge.handle(bad.message,{...bad.sender,documentId:'old'}),
    {code:'E_BRIDGE_SENDER'});
  assert.equal(bad.events.reserve,0);assert.equal(bad.events.start,0);
  const stale=hostHarness({readReply:async()=>({
    turnKey:'turn-1',answerKey:'changed',blocks:[bad.message.candidateText]})});
  await assert.rejects(stale.bridge.handle(stale.message,stale.sender),
    {code:'E_BRIDGE_ANSWER'});
  assert.equal(stale.events.reserve,0);assert.equal(stale.events.start,0);
});
test('uninstalled, unavailable, permission-revoked and stopped/unknown runs cannot be sent',async()=>{
  const disabled=hostHarness({override:{catalog:{installed:[],catalog:[]}}});
  await assert.rejects(disabled.bridge.handle(disabled.message,disabled.sender),{code:'E_BRIDGE_INSTALL'});
  assert.equal(disabled.events.reserve,0);
  const denied=hostHarness({override:{grants:false}});
  await assert.rejects(denied.bridge.handle(denied.message,denied.sender),{code:'E_BRIDGE_PERMISSION'});
  assert.equal(denied.events.start,0);
  const interrupted=hostHarness({override:{completion:{runId:'run-123',state:'paused_unknown'}}});
  await assert.rejects(interrupted.bridge.handle(interrupted.message,interrupted.sender),{code:'E_BRIDGE_RUN_UNKNOWN'});
  assert.equal(interrupted.events.reserve,1);assert.equal(interrupted.events.send,0);
  const revoked=hostHarness({override:{snapshot:{
    ...fixture().snapshot,resultDeliveryDenied:['run-123']}}});
  await assert.rejects(revoked.bridge.handle(revoked.message,revoked.sender),{code:'E_BRIDGE_DURABLE'});
  assert.equal(revoked.events.send,0);
});
test('send transport ambiguity performs no second send or run',async()=>{
  const h=hostHarness({override:{sendThrows:true}});
  await assert.rejects(h.bridge.handle(h.message,h.sender),{code:'E_BRIDGE_SEND_UNKNOWN'});
  assert.equal(h.events.reserve,1);assert.equal(h.events.start,1);assert.equal(h.events.send,1);
});
