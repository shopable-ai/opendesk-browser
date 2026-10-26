import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatGPTTaskRequest} from '../../src/native-agent/chatgpt-task-request.js';
import {createChatGPTBridgeTriggerLedger,installChatGPTBridgeTriggerGate,
  CHATGPT_BRIDGE_LEDGER_KEY,CHATGPT_BRIDGE_PROTOCOL} from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';

const requestId='11111111-1111-4111-8111-111111111111';
const source={tabId:7,documentId:'document-123',url:'https://chatgpt.com/c/session-123'};
const installation={version:'1.2.3',manifestHash:'a'.repeat(64),scriptId:'task:third.task:1.2.3',
  revision:1,contentHash:'b'.repeat(64),installationId:requestId,generation:2};
const scope={taskId:'third.task',args:{z:3,a:'hello',enabled:true},
  targetUrl:'https://example.com/read?q=1',installation};
const request={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,requestId,...scope};
const check=value=>validateChatGPTTaskRequest(JSON.stringify(value));
const reverse=value=>Object.fromEntries(Object.entries(value).reverse());
function storage(){
  let rows={};
  return {async get(key){return {[key]:structuredClone(rows[key])};},
    async set(value){rows={...rows,...structuredClone(value)};}};
}
const ledger=store=>createChatGPTBridgeTriggerLedger({storage:store,clock:()=>1000,generateId:()=>requestId});
const context={source,requestId,mode:'manual',turnKey:'turn-1',answerKey:'answer-1',...scope};
const mutations=[{targetUrl:'https://example.com/other'},{taskId:'other.task',
  installation:{...installation,scriptId:'task:other.task:1.2.3'}},{args:{a:'different'}},
  ...Object.keys(installation).map(key=>({installation:{...installation,
    [key]:key==='version'?'2.0.0':key==='scriptId'?'task:third.task:2.0.0':
      typeof installation[key]==='number'?installation[key]+1:
        key.endsWith('Hash')?'c'.repeat(64):'22222222-2222-4222-8222-222222222222',
    ...(key==='version'?{scriptId:'task:third.task:2.0.0'}:{})}}))];

test('generic third task uses canonical frozen args and exact installation key order',()=>{
  const parsed=check(reverse({...request,args:reverse(scope.args),installation:reverse(installation)}));
  assert.deepEqual(parsed,check(request));
  assert.deepEqual(Object.keys(parsed.args),['a','enabled','z']);
  assert.deepEqual(Object.keys(parsed.installation),Object.keys(installation));
  for(const value of [parsed,parsed.args,parsed.installation])assert.ok(Object.isFrozen(value));
  assert.equal(check({...request,args:{}}).taskId,'third.task');
  assert.equal(check({...request,taskId:'Z_1-foo.bar',installation:{...installation,
    scriptId:'task:Z_1-foo.bar:1.2.3'}}).taskId,'Z_1-foo.bar');
});
test('legacy requests retain their exact shapes without installation fields',()=>{
  for(const [taskId,args] of [['page.read.fixed',{}],['baidu.search.top3',{query:'test',limit:3}]]){
    const old={protocol:request.protocol,kind:request.kind,version:1,requestId,taskId,args};
    assert.deepEqual(check(old),old);
  }
  const {targetUrl,installation:unused,...bare}=request;
  assert.throws(()=>check(bare),{code:'E_BRIDGE_SCHEMA'});
});
test('generic parser rejects partial pins, invalid targets, identity and nonprimitive params',()=>{
  for(const value of [
    {...request,targetUrl:undefined},{...request,installation:undefined},
    ...['file:///tmp/x','javascript:alert(1)','https://u:p@example.com/',
      'https://example.com/#x','https://example.com/#','https://',' https://example.com/',
      'https://example.com/\npath','https://example.com/'+ 'x'.repeat(2048)].map(targetUrl=>({...request,targetUrl})),
    ...['bad:id','-bad','x'.repeat(61),''].map(taskId=>({...request,taskId})),
    ...[null,[],{nested:{}},{list:[]},{value:null},{bad_name$:1},
      Object.fromEntries(Array.from({length:17},(_,i)=>['p'+i,i]))].map(args=>({...request,args})),
    {...request,installation:{...installation,extra:true}},
    {...request,installation:{...installation,revision:0}},
    {...request,installation:{...installation,generation:1.5}},
    {...request,installation:{...installation,manifestHash:'a'}},
    {...request,installation:{...installation,installationId:''}},
    {...request,extra:true}
  ])assert.throws(()=>check(value),{code:'E_BRIDGE_SCHEMA'});
  assert.equal(check({...request,targetUrl:'http://127.0.0.1:43111/demo-form.html'}).targetUrl,
    'http://127.0.0.1:43111/demo-form.html'); // Host, not parser, enforces approved origins.
  assert.throws(()=>validateChatGPTTaskRequest(' '.repeat(4097)),{code:'E_BRIDGE_LIMIT'});
});
test('all scope mutations fail before consume; reordered persisted keys remain stable, once only',async()=>{
  const store=storage(),first=ledger(store);
  const prepared=await first.prepare(source,scope);
  assert.deepEqual(prepared.installation,installation);
  await first.authorize(context);
  for(const changed of mutations){
    await assert.rejects(first.reserve({...context,...changed}));
    assert.equal((await store.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY][requestId].status,'approved');
  }
  const rows=(await store.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY];
  rows[requestId].scope=reverse({...scope,args:reverse(scope.args),installation:reverse(installation)});
  await store.set({[CHATGPT_BRIDGE_LEDGER_KEY]:rows});
  const restarted=ledger(store),reordered={...context,args:reverse(scope.args),installation:reverse(installation)};
  assert.equal((await restarted.reserve(reordered)).consumed,true);
  assert.equal((await ledger(store).assertConsumed(reordered)).allowed,true);
  for(const changed of mutations)await assert.rejects(restarted.assertConsumed({...context,...changed}));
  await assert.rejects(ledger(store).reserve(context),{code:'E_BRIDGE_REPLAY'});
  await assert.rejects(restarted.assertConsumed({...context,source:{...source,documentId:'other'}}),{code:'E_BRIDGE_REVOKED'});
  await restarted.revokeRequest(context);
  await assert.rejects(ledger(store).assertConsumed(context),{code:'E_BRIDGE_REVOKED'});
});
test('old unscoped rows remain fixed-task only',async()=>{
  const store=storage(),first=ledger(store);
  await first.prepare(source);await first.authorize(context);
  const rows=(await store.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY];
  delete rows[requestId].scope;await store.set({[CHATGPT_BRIDGE_LEDGER_KEY]:rows});
  await assert.rejects(first.reserve(context),{code:'E_BRIDGE_CONTEXT'});
  const {taskId,args,targetUrl,installation:unused,...oldContext}=context;
  assert.equal((await first.reserve(oldContext)).consumed,true);
  assert.equal((await ledger(store).assertConsumed(oldContext)).allowed,true);
});
test('SW prepare forwards target and installation into durable scope',async()=>{
  let listener;
  const event={addListener(){}};
  const store=storage();
  installChatGPTBridgeTriggerGate({clock:()=>1000,api:{storage:{local:store},
    runtime:{id:'extension',onMessage:{addListener(fn){listener=fn;}},getURL:()=> 'chrome-extension://extension/'},
    webNavigation:{getFrame:async()=>({...source,documentLifecycle:'active'}),
      onCommitted:event,onHistoryStateUpdated:event},
    tabs:{get:async()=>({id:source.tabId,url:source.url}),onRemoved:event},permissions:{onRemoved:event}}});
  const response=await new Promise(resolve=>listener({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'prepare',...scope},
    {id:'extension',frameId:0,tab:{id:source.tabId},documentId:source.documentId,url:source.url},resolve));
  assert.equal(response.ok,true);
  const saved=(await store.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY][response.data.requestId];
  assert.deepEqual(saved.scope,{...scope,args:{a:'hello',enabled:true,z:3}});
});
