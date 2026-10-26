import test from 'node:test';
import {readFileSync} from 'node:fs';
import {verifyManifest,SDK_AUTOMATIC_CONTENT_SCRIPTS,CHATGPT_FIXED_BRIDGE_CONTENT_SCRIPT}
  from '../../scripts/verify-package.mjs';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,validChatGPTBridgeSource,installChatGPTBridgeTriggerGate,CHATGPT_BRIDGE_LEDGER_KEY}
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
test('consumed source approval remains revoked across re-grant, navigation and Worker restart',async()=>{
  for(const revoke of ['permission','source']){
    const storage=fakeStorage(),a=ledger(storage,[idA]);
    await a.prepare(source);await a.authorize({source,requestId:idA,mode:'manual'});
    const context={source,requestId:idA,mode:'manual',turnKey:'turn-1',answerKey:'answer-1:0'};
    await a.reserve(context);assert.equal((await a.assertConsumed(context)).allowed,true);
    if(revoke==='permission')await a.revokeApprovals();else await a.revokeSource(source.tabId);
    const restarted=ledger(storage,[]);
    await assert.rejects(restarted.assertConsumed(context),{code:'E_BRIDGE_REVOKED'});
    await assert.rejects(restarted.reserve(context),{code:'E_BRIDGE_REPLAY'});
  }
});

test('navigation fences are scoped to the bound source while permission revocation remains global',async()=>{
  for(const change of ['unrelated-navigation','source-navigation','permission']){
    const events={};
    const event=name=>({addListener(listener){events[name]=listener;}});
    const frame=Promise.withResolvers();
    const api={storage:{local:fakeStorage()},runtime:{id:'extid',getURL:()=> 'chrome-extension://extid/',
      onMessage:event('message')},webNavigation:{getFrame:()=>frame.promise,
      onCommitted:event('navigate'),onHistoryStateUpdated:event('history')},
      tabs:{get:async()=>({id:source.tabId,url:source.url}),onRemoved:event('close')},
      permissions:{onRemoved:event('permission')}};
    const gate=installChatGPTBridgeTriggerGate({api});
    const issued=await gate.prepare(source);
    const context={source,requestId:issued.requestId,mode:'manual',turnKey:'turn',answerKey:'answer'};
    await gate.authorize(context);await gate.reserve(context);
    const reply=Promise.withResolvers();
    assert.equal(events.message({protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'check-consumed',...context},
      {id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=host'},reply.resolve),true);
    await Promise.resolve(); // suspended inside the real source identity check
    if(change==='permission')events.permission();
    else events.navigate({tabId:change==='source-navigation'?source.tabId:999,frameId:0});
    frame.resolve({documentId:source.documentId,url:source.url,documentLifecycle:'active'});
    const response=await reply.promise;
    assert.equal(response.ok,change==='unrelated-navigation',change);
    if(response.ok)assert.equal(response.data.allowed,true);
  }
});
function gateHarness(){
  const events={},event=name=>({addListener(listener){events[name]=listener;}});
  const frame={documentId:source.documentId,url:source.url,documentLifecycle:'active',errorOccurred:false};
  const tab={id:source.tabId,url:source.url,windowId:2,incognito:false};
  const sender={id:'extid',frameId:0,documentId:source.documentId,
    documentLifecycle:'active',url:'https://chatgpt.com/c/initial-injection',tab:{...tab}};
  const api={storage:{local:fakeStorage()},runtime:{id:'extid',getURL:()=> 'chrome-extension://extid/',onMessage:event('message')},
    webNavigation:{getFrame:async()=>({...frame}),onCommitted:event('committed'),onHistoryStateUpdated:event('history')},
    tabs:{get:async()=>({...tab}),onRemoved:event('close')},permissions:{onRemoved:event('permission')}};
  installChatGPTBridgeTriggerGate({api});
  const send=message=>new Promise(resolve=>{
    assert.equal(events.message({protocol:'opendesk.chatgpt.bridge.r12.v1',...message},sender,resolve),true);
  });
  return {events,frame,tab,sender,send};
}
test('request revocation fences prepared, approved and consumed identities durably and idempotently',async()=>{
  for(const status of ['prepared','approved','consumed','expired']){
    let now=1000;
    const storage=fakeStorage(),a=ledger(storage,[idA],()=>now);
    const context={source,requestId:idA,mode:'manual',turnKey:'turn',answerKey:'answer'};
    await a.prepare(source);
    if(status!=='prepared')await a.authorize(context);
    if(status==='consumed')await a.reserve(context);
    if(status==='expired')now+=600001;
    assert.deepEqual(await a.revokeRequest(context),{requestId:idA,revoked:true});
    assert.deepEqual(await a.revokeRequest(context),{requestId:idA,revoked:true});
    const row=storage.dump()[CHATGPT_BRIDGE_LEDGER_KEY][idA];
    assert.equal(row.status,'revoked');
    if(status==='consumed')assert.equal(row.consumedAt,1000);
    const restarted=ledger(storage,[idA],()=>1000);
    await assert.rejects(restarted.authorize(context),{code:'E_BRIDGE_APPROVAL'});
    await assert.rejects(restarted.reserve(context),{code:'E_BRIDGE_REPLAY'});
    await assert.rejects(restarted.assertConsumed(context),{code:'E_BRIDGE_REVOKED'});
    await assert.rejects(restarted.prepare(source),{code:'E_BRIDGE_REPLAY'});
  }
});
test('request revocation rejects wrong identities and preserves other requests including the same source',async()=>{
  const storage=fakeStorage(),a=ledger(storage,[idA,idB]);
  const context={source,requestId:idA,mode:'manual',turnKey:'turn',answerKey:'answer'};
  await a.prepare(source);await a.authorize(context);await a.reserve(context);
  await a.prepare(source);await a.authorize({...context,requestId:idB});
  const before=storage.dump();
  for(const changed of [{tabId:8},{documentId:'other'},{url:'https://chatgpt.com/c/other'}])
    await assert.rejects(a.revokeRequest({...context,source:{...source,...changed}}),{code:'E_BRIDGE_REQUEST'});
  await assert.rejects(a.revokeRequest({...context,requestId:'33333333-3333-4333-8333-333333333333'}),
    {code:'E_BRIDGE_REQUEST'});
  assert.throws(()=>a.revokeRequest({...context,requestId:'invalid'}),{code:'E_BRIDGE_REQUEST'});
  assert.throws(()=>a.revokeRequest({...context,source:{...source,tabId:-1}}),{code:'E_BRIDGE_SOURCE'});
  assert.deepEqual(storage.dump(),before);
  await a.revokeRequest(context);
  assert.deepEqual(storage.dump()[CHATGPT_BRIDGE_LEDGER_KEY][idB],before[CHATGPT_BRIDGE_LEDGER_KEY][idB]);
  assert.equal((await a.reserve({...context,requestId:idB})).consumed,true);
});
test('request revocation serializes admission and acknowledges only after persistent write',async()=>{
  const storage=fakeStorage(),a=ledger(storage,[idA]);
  const context={source,requestId:idA,mode:'manual',turnKey:'turn',answerKey:'answer'};
  await a.prepare(source);await a.authorize(context);
  const entered=Promise.withResolvers(),release=Promise.withResolvers(),set=storage.set.bind(storage);
  storage.set=async data=>{entered.resolve();await release.promise;await set(data);};
  let acknowledged=false;
  const revoked=a.revokeRequest(context).then(value=>{acknowledged=true;return value;});
  await entered.promise;
  assert.equal(acknowledged,false);
  const reserved=assert.rejects(a.reserve(context),{code:'E_BRIDGE_REPLAY'});
  release.resolve();await revoked;await reserved;
  assert.equal(storage.dump()[CHATGPT_BRIDGE_LEDGER_KEY][idA].status,'revoked');
});
test('request revocation never acknowledges a failed persistent write and allows a durable retry',async()=>{
  const storage=fakeStorage(),a=ledger(storage,[idA]);
  const context={source,requestId:idA,mode:'manual',turnKey:'turn',answerKey:'answer'};
  await a.prepare(source);await a.authorize(context);
  const set=storage.set.bind(storage);
  storage.set=async()=>{throw new Error('storage unavailable');};
  await assert.rejects(a.revokeRequest(context),/storage unavailable/);
  assert.equal(storage.dump()[CHATGPT_BRIDGE_LEDGER_KEY][idA].status,'approved');
  storage.set=set;
  assert.deepEqual(await a.revokeRequest(context),{requestId:idA,revoked:true});
  await assert.rejects(ledger(storage,[]).reserve(context),{code:'E_BRIDGE_REPLAY'});
});
test('content revoke-request uses real sender and current source instead of supplied source',async()=>{
  const changes={
    'foreign extension':h=>{h.sender.id='foreign';},
    'subframe':h=>{h.sender.frameId=1;},
    'foreign sender':h=>{h.sender.url='https://evil.example/c/test';},
    'credential sender':h=>{h.sender.url='https://user:pass@chatgpt.com/c/test';},
    'legacy sender':h=>{h.sender.url='https://chat.openai.com/c/test';},
    'replacement document':h=>{h.frame.documentId='replacement';},
    'inactive document':h=>{h.frame.documentLifecycle='cached';},
    'pending navigation':h=>{h.tab.pendingUrl=source.url;},
    'mismatched tab':h=>{h.tab.id++;},
    'incognito':h=>{h.tab.incognito=true;},
    'current URL mismatch':h=>{h.tab.url='https://chatgpt.com/c/other';},
    'different current source':h=>{h.tab.url=h.frame.url='https://chatgpt.com/c/other';},
    'sidepanel':h=>{delete h.sender.tab;h.sender.url='chrome-extension://extid/sidepanel.html?hostInstanceId=host';}
  };
  for(const [name,change] of Object.entries(changes)){
    const h=gateHarness(),prepared=await h.send({kind:'prepare'}),requestId=prepared.data.requestId;
    const original=structuredClone({frame:h.frame,tab:h.tab,sender:h.sender});
    change(h);
    const response=await h.send({kind:'revoke-request',requestId,source});
    assert.equal(response.ok,false,name);
    assert.match(response.error.code,/^E_BRIDGE_(SOURCE|SENDER|REQUEST)$/,name);
    for(const key of ['frame','tab','sender']){
      for(const field of Object.keys(h[key]))delete h[key][field];
      Object.assign(h[key],original[key]);
    }
    assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).ok,true,name);
  }
  const h=gateHarness(),prepared=await h.send({kind:'prepare'}),requestId=prepared.data.requestId;
  const response=await h.send({kind:'revoke-request',requestId,source:{...source,tabId:999}});
  assert.deepEqual(response,{ok:true,data:{requestId,revoked:true}});
  assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).error.code,'E_BRIDGE_APPROVAL');
  assert.equal(h.events.message({protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'cancel'},h.sender,()=>{}),false);
});
test('gate accepts exact project conversation path and rejects unfamiliar route prefixes',async()=>{
  const projectURL='https://chatgpt.com/g/g-p-6ac53d2f7814819191ac41eeec7cac11-opendesk-brower/c/6addf87f-9b78-83e8-8678-929e9e52ac3e';
  for(const url of [source.url,projectURL,projectURL+'/']){
    const h=gateHarness();h.tab.url=h.frame.url=url;
    const prepared=await h.send({kind:'prepare'});
    assert.equal(prepared.ok,true,url);
    assert.equal(prepared.data.source.url,url);
    const requestId=prepared.data.requestId;
    assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).ok,true,url);
    h.events.history({tabId:source.tabId,frameId:0});
    assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).ok,false,url);
  }
  for(const url of ['https://chatgpt.com/foo/c/id','https://chatgpt.com/g/random/c/id',
    'https://chatgpt.com/g/g-p-/c/id','https://chatgpt.com/g/g-p-中文/c/id',
    'https://chatgpt.com/g/g-p-valid/extra/c/id','https://chatgpt.com/g/g-p-valid/c/',
    'https://chatgpt.com/c/','https://chat.openai.com/c/id',
    projectURL.replace('https://','https://user:pass@')]){
    for(const kind of ['prepare','authorize']){
      const h=gateHarness(),prepared=kind==='authorize'?await h.send({kind:'prepare'}):null;
      h.tab.url=h.frame.url=url;
      const response=await h.send({kind,requestId:prepared?.data.requestId,mode:'manual'});
      assert.equal(response.ok,false,url+' '+kind);
      assert.equal(response.error.code,'E_BRIDGE_SOURCE',url);
    }
  }
});
test('prepare freezes current browser source and authorize accepts the same document with an old injection URL',async()=>{
  for(const initial of ['https://chatgpt.com/','https://chatgpt.com/c/initial-injection']){
    const h=gateHarness();h.sender.url=initial;
    const prepared=await h.send({kind:'prepare'});
    assert.equal(prepared.ok,true);assert.deepEqual(prepared.data.source,source);
    const approved=await h.send({kind:'authorize',requestId:prepared.data.requestId,mode:'manual'});
    assert.equal(approved.ok,true);
  }
});
test('prepare and authorize reject unsafe document, lifecycle, origin and current URL observations',async()=>{
  const changes={
    'foreign sender':h=>{h.sender.url='https://evil.example/c/test';},
    'legacy origin':h=>{h.sender.url='https://chat.openai.com/c/test';},
    'credential sender':h=>{h.sender.url='https://user:pass@chatgpt.com/c/test';},
    'wrong sender id':h=>{h.sender.id='foreign';},
    'subframe':h=>{h.sender.frameId=1;},
    'new document':h=>{h.frame.documentId='replacement';},
    'inactive':h=>{h.frame.documentLifecycle='cached';},
    'missing lifecycle':h=>{delete h.frame.documentLifecycle;},
    'frame error':h=>{h.frame.errorOccurred=true;},
    'pending':h=>{h.tab.pendingUrl='https://chatgpt.com/c/next';},
    'tab id':h=>{h.tab.id++;},
    'incognito':h=>{h.tab.incognito=true;},
    'frame/tab mismatch':h=>{h.tab.url='https://chatgpt.com/c/other';},
    'foreign current':h=>{h.frame.url=h.tab.url='https://evil.example/c/test';},
    'credential current':h=>{h.frame.url=h.tab.url='https://user:pass@chatgpt.com/c/test';},
    'root current':h=>{h.frame.url=h.tab.url='https://chatgpt.com/';}
  };
  for(const [name,change] of Object.entries(changes))for(const kind of ['prepare','authorize']){
    const h=gateHarness(),prepared=kind==='authorize'?await h.send({kind:'prepare'}):null;
    change(h);
    const response=await h.send({kind,requestId:prepared?.data.requestId,mode:'manual'});
    assert.equal(response.ok,false,name+' '+kind);
    assert.match(response.error.code,/^E_BRIDGE_(SOURCE|SENDER)$/);
  }
});
test('authorize never rebinds an old request, and history revocation cannot revive approval on return',async()=>{
  for(const approved of [false,true]){
    const h=gateHarness(),prepared=await h.send({kind:'prepare'}),requestId=prepared.data.requestId;
    const sidepanel=message=>new Promise(resolve=>h.events.message({protocol:'opendesk.chatgpt.bridge.r12.v1',...message},
      {id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=host'},resolve));
    const context={source,requestId,mode:'manual',turnKey:'turn',answerKey:'answer'};
    if(approved){
      assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).ok,true);
      assert.equal((await sidepanel({kind:'reserve',...context})).ok,true);
      assert.equal((await sidepanel({kind:'check-consumed',...context})).ok,true);
    }
    h.frame.url=h.tab.url='https://chatgpt.com/c/new-route';
    // Even without a history event, the old ledger source is an exact match.
    assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).error.code,'E_BRIDGE_APPROVAL');
    h.events.history({tabId:source.tabId,frameId:0});
    h.frame.url=h.tab.url=source.url;
    assert.equal((await h.send({kind:'authorize',requestId,mode:'manual'})).error.code,'E_BRIDGE_APPROVAL');
    const response=await sidepanel({kind:'check-consumed',...context});
    assert.equal(response.ok,false);assert.equal(response.error.code,'E_BRIDGE_REVOKED');
    // Only a fresh request on the observed current source can be approved.
    const fresh=await h.send({kind:'prepare'});assert.notEqual(fresh.data.requestId,requestId);
    assert.equal((await h.send({kind:'authorize',requestId:fresh.data.requestId,mode:'manual'})).ok,true);
  }
});
const result={kind:'page.read.fixed.result',version:1,sourceUrl:'https://httpbingo.org/html',
  title:'Herman Melville - Moby-Dick',heading:'Herman Melville - Moby-Dick',
  excerpt:'Call me Ishmael.',observedAt:'2026-10-25T12:30:00.000Z'};
function fixture(){
  const runId='run-123',resultId='result-123',scriptId='task:page.read.fixed:1.0.0';
  const revision={scriptId,revision:1,sourceHash:FIXED_TASK_SOURCE_HASH};
  return {runId,resolved:{scriptId,revision:1},
    snapshot:{
      run:{runId,resultId,scriptId,state:'completed',retirementState:'released',sourceKind:'saved',
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
    {...snapshot,run:{...snapshot.run,retirementState:'fenced'}},
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
  assert.ok(prompt.includes('httpbingo HTML'));
  assert.ok(prompt.includes('"args":{}'));
  assert.ok(prompt.includes('不是你已注册的 MCP 工具'));
  assert.doesNotMatch(prompt, /\n|https?:\/\/| {2,}/);
  assert.deepEqual(JSON.parse(prompt.slice(prompt.indexOf('{'))),{
    protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',
    version:1,requestId:idA,taskId:'page.read.fixed',args:{}});
});

test('plain result paragraph round trips exact data while avoiding editor link and whitespace conversion',()=>{
  const durable={runId:'run',resultId:'result',revision:1,sourceHash:'hash',
    value:{...result,excerpt:'two  spaces\nhttps://example.com/a/b'}};
  const text=formatChatGPTFixedResult(idA,durable);
  assert.doesNotMatch(text,/\n|https?:\/\/| {2,}/);
  const payload=JSON.parse(text.slice(text.indexOf('{')));
  assert.deepEqual(payload.data,durable.value);
  assert.equal(payload.requestId,idA);
  assert.equal(payload.runId,durable.runId);
  assert.equal(payload.resultId,durable.resultId);
});

test('a real fixed page with an empty head keeps an empty title without substituting its heading',()=>{
  const {snapshot,resolved,runId}=fixture();
  snapshot.results[0].outcome.valueWire=encodeValue({...result,title:''});
  const durable=verifyChatGPTFixedDurableResult(snapshot,runId,resolved);
  assert.equal(durable.value.title,'');assert.equal(durable.value.heading,result.heading);
  for(const title of [null,undefined,200,{},'x'.repeat(201),'\u0000']){
    snapshot.results[0].outcome.valueWire=encodeValue({...result,title});
    assert.throws(()=>verifyChatGPTFixedDurableResult(snapshot,runId,resolved),{code:'E_BRIDGE_RESULT'});
  }
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
  const events={reserve:0,start:0,send:0,checks:0};
  const api={runtime:{id:'extid',async sendMessage(message){
    if(message.kind==='check-consumed'){
      events.checks++;
      return {ok:true,data:{allowed:override.revoked!==true}};
    }
    assert.equal(message.kind,'reserve');events.reserve++;
    return {ok:true,data:{consumed:true}};}},tabs:{
      async get(tabId){return {id:tabId,url:src.url,windowId:2,incognito:false};},
      async sendMessage(tabId,message,opt){events.send++;
        assert.equal(tabId,src.tabId);
        assert.equal(opt.documentId,src.documentId);
        if(override.sendThrows)throw new Error('lost receipt');
        return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};
      }
    },webNavigation:{async getFrame(){return {documentId:src.documentId,url:src.url,documentLifecycle:'active'};}},
    permissions:{async contains(){return override.grants!==false;},onRemoved:{
      addListener(listener){events.permissionRemoved=listener;},removeListener(){events.permissionRemoved=null;}}}};
  const client={request:async method=>{
      if(method==='listTaskCatalog')return override.catalog||catalog;
      if(method==='resolveInstalledTask')return override.resolved||resolved;
      throw new Error('Unexpected '+method);
    },subscribeInstalledTasks(listener){events.installChanged=listener;return()=>{events.installChanged=null;};},
    subscribeConnection(listener){events.connectionChanged=listener;return()=>{events.connectionChanged=null;};},
    controller:{async snapshotControllerRun(){
      override.onSnapshot?.();
      return override.snapshot||fx.snapshot;
    }}};
  const host={get currentRun(){return null;},
    async start(input){events.start++;events.lastStart=input;
      return {runId:fx.runId};},
    get completion(){return Promise.resolve(override.completion||{
      runId:fx.runId,state:'completed',retirement:{state:'released'},result:{resultId:fx.snapshot.run.resultId}});}};
  const sender={id:'extid',frameId:0,url:src.url,documentId:src.documentId,
    tab:{id:src.tabId,windowId:2,incognito:false,url:src.url}};
  const message={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'execute',
    requestId:idA,mode:'manual',candidateText,sourceUrl:src.url,source:src,
    turnKey:'turn-1',answerKey:'answer-1:0'};
  const bridge=createChatGPTFixedBridgeHost({api,client,host,
    currentPageTarget:{snapshot:{windowId:2}},
    isVerifiedSidePanel:()=>true,
    readReply:readReply||(async()=>{
      await override.onReadReply?.();
      return {turnKey:'turn-1',answerKey:'answer-1:0',blocks:[candidateText]};})});
  return {bridge,events,sender,message,fx,api,installed,catalog,resolved};
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
test('Host accepts stale same-origin injection URL with exact current source and live target',async()=>{
  const h=hostHarness();h.sender.url='https://chatgpt.com/c/old-injection';
  assert.equal((await h.bridge.handle(h.message,h.sender)).sent,true);
  assert.equal(h.events.start,1);assert.equal(h.events.send,1);
});
test('Host refuses unsafe sender or live document before reservation or execution',async()=>{
  const changes={
    'foreign sender':h=>{h.sender.url='https://evil.example/c/test';},
    'credential sender':h=>{h.sender.url='https://user:pass@chatgpt.com/c/test';},
    'legacy origin':h=>{h.sender.url='https://chat.openai.com/c/test';},
    'wrong extension':h=>{h.sender.id='foreign';},
    'subframe':h=>{h.sender.frameId=1;},
    'sender document':h=>{h.sender.documentId='replacement';},
    'sender tab URL':h=>{h.sender.tab.url='https://chatgpt.com/c/other';},
    'sender pending':h=>{h.sender.tab.pendingUrl=source.url;},
    'sender window':h=>{h.sender.tab.windowId=3;},
    'source mismatch':h=>{h.message.source={...source,url:'https://chatgpt.com/c/other'};},
    'new document':h=>{h.api.webNavigation.getFrame=async()=>({documentId:'replacement',url:source.url,documentLifecycle:'active'});},
    'inactive':h=>{h.api.webNavigation.getFrame=async()=>({...source,documentLifecycle:'cached'});},
    'missing lifecycle':h=>{h.api.webNavigation.getFrame=async()=>({...source});},
    'frame error':h=>{h.api.webNavigation.getFrame=async()=>({...source,documentLifecycle:'active',errorOccurred:true});},
    'frame/tab mismatch':h=>{h.api.webNavigation.getFrame=async()=>({...source,url:'https://chatgpt.com/c/other',documentLifecycle:'active'});},
    'pending':h=>{h.api.tabs.get=async()=>({...h.sender.tab,pendingUrl:source.url});},
    'incognito':h=>{h.api.tabs.get=async()=>({...h.sender.tab,incognito:true});},
    'tab id':h=>{h.api.tabs.get=async()=>({...h.sender.tab,id:999});}
  };
  for(const [name,change] of Object.entries(changes)){
    const h=hostHarness();change(h);
    await assert.rejects(h.bridge.handle(h.message,h.sender),undefined,name);
    assert.equal(h.events.reserve,0,name);assert.equal(h.events.start,0,name);assert.equal(h.events.send,0,name);
  }
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

test('completed runs with unknown or pending retirement never reach the chat',async()=>{
  for(const retirement of [undefined,{state:'fenced'},{state:'pending'}]){
    const h=hostHarness({override:{completion:{runId:'run-123',state:'completed',retirement,
      result:{resultId:'result-123'}}}});
    await assert.rejects(h.bridge.handle(h.message,h.sender),{code:'E_BRIDGE_RUN_UNKNOWN'});
    assert.equal(h.events.start,1);assert.equal(h.events.send,0);
  }
});

test('final send boundary refuses revocation, changed installation, denied result and changed document',async()=>{
  for(const change of ['permission','generation','disabled','uninstalled','result','document']){
    const override={},h=hostHarness({override});
    let clicks=0,checks=0;
    h.api.tabs.sendMessage=async(_tabId,message)=>{
      if(change==='permission')override.grants=false;
      if(change==='generation')h.installed.generation++;
      if(change==='disabled')h.installed.enabled=false;
      if(change==='uninstalled')h.catalog.installed=[];
      if(change==='result')override.snapshot={...h.fx.snapshot,resultDeliveryDenied:[h.fx.runId]};
      const sender=change==='document'?{...h.sender,documentId:'changed-document'}:h.sender;
      try{
        checks++;
        await h.bridge.checkDelivery({...message,kind:'check-delivery'},sender);
        clicks++;
        return {ok:true,data:{sent:true,userObserved:true}};
      }catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
    };
    await assert.rejects(h.bridge.handle(h.message,h.sender));
    assert.equal(checks,1,change);assert.equal(clicks,0,change);
    assert.equal(h.events.start,1,change);assert.equal(h.events.reserve,1,change);
    await assert.rejects(h.bridge.checkDelivery({...h.message,runId:h.fx.runId,resultId:'result-123'},h.sender),
      {code:'E_BRIDGE_DELIVERY'});
  }
});

test('revocation during async final reply or durable reads cannot produce a delivery permit',async()=>{
  for(const change of ['disabled-during-reply','install-event','permission-regrant','worker-restart']){
    const override={},h=hostHarness({override});
    let clicks=0;
    h.api.tabs.sendMessage=async(_tab,message)=>{
      if(change==='disabled-during-reply')override.onReadReply=()=>{h.installed.enabled=false;};
      else override.onSnapshot=()=>{
        if(change==='install-event')h.events.installChanged({taskId:'page.read.fixed'});
        if(change==='permission-regrant'){h.events.permissionRemoved();override.grants=true;override.revoked=true;}
        if(change==='worker-restart')h.events.connectionChanged({connected:false});
      };
      try{
        await h.bridge.checkDelivery({...message,kind:'check-delivery'},h.sender);
        clicks++;return {ok:true,data:{sent:true,userObserved:true}};
      }catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
    };
    await assert.rejects(h.bridge.handle(h.message,h.sender));
    assert.equal(clicks,0,change);assert.equal(h.events.start,1,change);
    h.bridge.dispose();assert.equal(h.events.installChanged,null);assert.equal(h.events.permissionRemoved,null);
  }
});

test('root manifest retains two independent SDK scripts and one exact isolated ChatGPT bridge',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../manifest.json',import.meta.url),'utf8'));
  assert.equal(SDK_AUTOMATIC_CONTENT_SCRIPTS.length,2);
  assert.deepEqual(manifest.content_scripts,
    [CHATGPT_FIXED_BRIDGE_CONTENT_SCRIPT,...SDK_AUTOMATIC_CONTENT_SCRIPTS]);
  assert.doesNotThrow(()=>verifyManifest(manifest,{source:true}));
  const badPath=structuredClone(manifest);
  badPath.content_scripts[0].js=['agents/page-relay.js'];
  assert.throws(()=>verifyManifest(badPath,{source:true}),/Only the origin-limited/);
  const badScope=structuredClone(manifest);
  badScope.content_scripts[0].matches=['<all_urls>'];
  assert.throws(()=>verifyManifest(badScope,{source:true}),/Only the origin-limited/);
  const badWorld=structuredClone(manifest);
  badWorld.content_scripts[0].world='MAIN';
  assert.throws(()=>verifyManifest(badWorld,{source:true}),/Only the origin-limited/);
});
