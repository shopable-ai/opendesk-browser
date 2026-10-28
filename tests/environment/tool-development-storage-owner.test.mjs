import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createToolDevelopmentStorageOwner,TOOL_DEVELOPMENT_STORAGE_PORT} from '../../src/native-agent/tool-development-storage.js';
import {createDevelopmentStorageSession} from '../../src/ui/sidebar-tools/development-session.js';

const extensionId='a'.repeat(32);
const previewId='11111111-1111-4111-8111-111111111111';
const instance='22222222-2222-4222-8222-222222222222';
const sourceId='source-'+'a'.repeat(24);
const sha256='a'.repeat(64);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function event(){
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit(...args){for(const fn of [...listeners])fn(...args);}};
}
function locks(){
  const tails=new Map();
  return {request(name,callback){
    const next=(tails.get(name)??Promise.resolve()).then(callback);
    tails.set(name,next.catch(()=>{}));return next;
  }};
}

// Both ends clone and asynchronously deliver messages, as runtime.Port does.
// No production handler, admission check, storage executor or client is stubbed.
function fixture(t,{senderPatch={},name,timeoutMs=10000,panel=false}={}){
  const data={},pairs=[],sent=[],reads=[],sets=[],states=[];
  const controls={assertHook:async()=>{},verifyHook:async()=>{},setHook:async()=>{},beforePost:()=>{},contextHook:async()=>{},windowId:1};
  let current={previewId,tabId:7,sourceId,tool:{id:'quick-notes',capabilities:['storage.local']},
    sha256,available:true,nativeAuthority:{devLeaseEpoch:1,sessionId:'native-session',leaseEpoch:'lease-3'}};
  if(panel)current={...current,surface:'sidepanel',windowId:1,tool:{...current.tool,capabilities:['storage.local','currentPage.read']}};
  let clock=Date.now(),localAccesses=0,nativeCalls=0,snapshotCalls=0;
  const sender={id:extensionId,url:`chrome-extension://${extensionId}/sidepanel.html?hostInstanceId=host-1&previewId=${previewId}`,
    tab:{id:7,windowId:1,incognito:false},documentId:'33333333-3333-4333-8333-333333333333',
    frameId:0,documentLifecycle:'active',...senderPatch};
  if(panel){delete sender.tab;sender.url=`chrome-extension://${extensionId}/sidepanel.html?hostInstanceId=host-1`;
    Object.assign(sender,senderPatch);}
  const contexts=[{contextType:'SIDE_PANEL',documentUrl:sender.url,frameId:0,incognito:false,
    documentId:sender.documentId,contextId:'context-1',windowId:-1,tabId:-1}];
  const onConnect=event();
  const api={runtime:{id:extensionId,getURL:path=>`chrome-extension://${extensionId}/${path}`,onConnect,
    async getContexts(filter){assert.deepEqual(filter,{contextTypes:['SIDE_PANEL'],documentUrls:[sender.url]});
      await controls.contextHook();return structuredClone(contexts);},
    connect(options){
      const pair={closed:false},portName=name??options.name;
      function endpoint(side){return {name:portName,...(side==='owner'?{sender:structuredClone(sender)}:{}),
        onMessage:event(),onDisconnect:event(),
        postMessage(message){
          if(pair.closed)throw Error('Port disconnected');
          const copy=structuredClone(message);controls.beforePost(side,copy);sent.push({side,message:copy});
          queueMicrotask(()=>{if(!pair.closed)pair[side==='owner'?'client':'owner'].onMessage.emit(copy);});
        },
        disconnect(){if(pair.closed)return;pair.closed=true;
          queueMicrotask(()=>{pair.owner.onDisconnect.emit();pair.client.onDisconnect.emit();});}
      };}
      pair.owner=endpoint('owner');pair.client=endpoint('client');pairs.push(pair);
      queueMicrotask(()=>onConnect.emit(pair.owner));return pair.client;
    }},windows:{async getCurrent(){return {id:controls.windowId,incognito:false};}},storage:{session:{
      async get(key){reads.push(key);return Object.hasOwn(data,key)?{[key]:structuredClone(data[key])}:{};},
      async set(rows){sets.push(structuredClone(rows));Object.assign(data,structuredClone(rows));await controls.setHook();}
    },get local(){localAccesses++;assert.fail('development grants must never access storage.local');}}};
  const options={api,getCurrent:()=>current,now:()=>clock,lockManager:locks(),
    assertCurrent:async()=>{nativeCalls++;await controls.assertHook();},
    verifySnapshot:async digest=>{snapshotCalls++;assert.equal(digest,current.sha256);await controls.verifyHook();}};
  let owner=createToolDevelopmentStorageOwner(options);
  const clients=[];
  function client(){
    const value=createDevelopmentStorageSession({api,session:{previewId,sha256:current.sha256,...(panel?{surface:'sidepanel',windowId:1}:{})},timeoutMs,documentUrl:sender.url,
      onState:(...args)=>states.push(args)});clients.push(value);return value;
  }
  t.after(()=>{for(const value of clients)value.revoke();owner.dispose();});
  return {api,data,pairs,sent,reads,sets,states,controls,client,contexts,
    get current(){return current;},set current(value){current=value;},
    get owner(){return owner;},get localAccesses(){return localAccesses;},
    get nativeCalls(){return nativeCalls;},get snapshotCalls(){return snapshotCalls;},
    advance(ms){clock+=ms;},reopen(){owner.dispose();owner=createToolDevelopmentStorageOwner(options);}};
}
const read=client=>client.request('storage.get',{key:'draft',withEtag:true},instance);
const write=(client,etag,value='你好')=>client.request('storage.set',{key:'draft',value,ifMatch:etag},instance);
async function approved(t,options){const f=fixture(t,options),client=f.client();await client.start(instance);return {f,client};}
function rawRequest(port,message){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{port.onMessage.removeListener(listener);reject(Error('owner result timed out'));},1000);
    const listener=row=>{if(row.type==='result'&&row.requestId===message.requestId){
      clearTimeout(timer);port.onMessage.removeListener(listener);resolve(row);
    }};
    port.onMessage.addListener(listener);port.postMessage(message);
  });
}

test('approval binds the exact preview port and round-trips 你好 using the returned real ETag',async t=>{
  const {f,client}=await approved(t);
  assert.equal(f.pairs[0].owner.name,TOOL_DEVELOPMENT_STORAGE_PORT+previewId);
  assert.ok(f.nativeCalls>0,'approval must assert Native authority');assert.equal(f.snapshotCalls,1);
  const initial=await read(client);assert.deepEqual(initial,{value:null,etag:hash(null)});
  assert.deepEqual(await write(client,initial.etag),{saved:true,etag:hash('你好')});
  assert.deepEqual(await read(client),{value:'你好',etag:hash('你好')});
  assert.equal(f.sets.length,1);
  assert.deepEqual(Object.keys(f.data),[`opendesk.sidebar-tools.development-data.v1:${sourceId}:quick-notes`]);
});

test('replacement owner requires new approval while preserving same-namespace session data',async t=>{
  const {f,client}=await approved(t);await write(client,(await read(client)).etag);
  f.reopen();await flush();assert.equal(client.approved,false);
  const replacement=f.client();await assert.rejects(read(replacement),{code:'E_PREVIEW_GRANT'});
  const port=f.api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+previewId});await flush();
  const response=await rawRequest(port,{type:'storage',requestId:1,sha256,instance,operation:'storage.get',payload:{key:'draft'}});
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_PREVIEW_GRANT');
  await replacement.start(instance);assert.equal((await read(replacement)).value,'你好');
  assert.equal(f.snapshotCalls,2);assert.equal(f.sets.length,1);
});

for(const [label,patch] of [
  ['source',{sourceId:'source-'+'b'.repeat(24)}],
  ['tool',{tool:{id:'other-tool',capabilities:['storage.local']}}]
])test(`independent ${label} namespace cannot read another namespace's data`,async t=>{
  const {f,client}=await approved(t);await write(client,(await read(client)).etag);
  client.revoke();f.current={...f.current,...patch};
  const other=f.client();await other.start(instance);const empty=await read(other);
  assert.equal(empty.value,null);await write(other,empty.etag,'other');
  assert.equal(Object.keys(f.data).length,2);
});

for(const [label,senderPatch] of [
  ['wrong tab',{tab:{id:8,incognito:false}}],['missing document',{documentId:undefined}],
  ['inactive document',{documentLifecycle:'cached'}],['child frame',{frameId:1}],
  ['foreign extension',{id:'b'.repeat(32)}],
  ['foreign URL',{url:`chrome-extension://${'b'.repeat(32)}/sidepanel.html?hostInstanceId=host-1&previewId=${previewId}`}],
  ['wrong preview URL',{url:`chrome-extension://${extensionId}/sidepanel.html?hostInstanceId=host-1&previewId=${instance}`}],
  ['tool locator',{url:`chrome-extension://${extensionId}/sidepanel.html?hostInstanceId=host-1&toolId=quick-notes`}],
  ['missing host instance',{url:`chrome-extension://${extensionId}/sidepanel.html?previewId=${previewId}`}]
])test(`rejects ${label} before Native admission or session storage access`,async t=>{
  const f=fixture(t,{senderPatch}),client=f.client();
  await assert.rejects(client.start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.nativeCalls,0);assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

test('a wrong port name cannot approve or dispatch storage',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(t,{name:TOOL_DEVELOPMENT_STORAGE_PORT+instance,timeoutMs:50}),client=f.client();
  const pending=assert.rejects(client.start(instance),{code:'E_PREVIEW_GRANT'});
  await flush();t.mock.timers.tick(50);await pending;
  assert.equal(f.nativeCalls,0);assert.equal(f.sets.length,0);
});

for(const [label,patch] of [['old instance',{instance:previewId}],['old SHA',{sha256:'b'.repeat(64)}]])
  test(`owner rejects ${label} sent over an otherwise approved port`,async t=>{
    const {f}=await approved(t);
    const response=await rawRequest(f.pairs[0].client,{type:'storage',requestId:100,instance,sha256,
      operation:'storage.set',payload:{key:'draft',value:'你好',ifMatch:hash(null)},...patch});
    assert.equal(response.ok,false);assert.equal(response.error.code,'E_PREVIEW_GRANT');
    assert.equal(f.sets.length,0);
  });

test('owner rejects an expired grant even before the client expiry timer runs',async t=>{
  const {f,client}=await approved(t);f.advance(5*60*1000);
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});assert.equal(f.reads.length,0);
});

test('source snapshot SHA changes invalidate an approved grant',async t=>{
  const {f,client}=await approved(t);f.current={...f.current,sha256:'b'.repeat(64)};
  await assert.rejects(write(client,hash(null)),{code:'E_PREVIEW_GRANT'});assert.equal(f.sets.length,0);
});

for(const [label,patch] of [
  ['source identity',{sourceId:'source-'+'b'.repeat(24)}],
  ['tool identity',{tool:{id:'other-tool',capabilities:['storage.local']}}]
])test(`changing current ${label} cannot retain approval for the old namespace`,async t=>{
  const {f,client}=await approved(t);f.current={...f.current,...patch};
  const outcome=await write(client,hash(null)).then(result=>({result}),error=>({code:error.code}));
  assert.equal(outcome.code,'E_PREVIEW_GRANT',`identity changed: ${JSON.stringify(outcome)}; sets=${f.sets.length}`);
  assert.equal(f.sets.length,0);
});

test('Native assertion failure retires approval without dispatching a write',async t=>{
  const {f,client}=await approved(t);
  f.controls.assertHook=async()=>{throw Object.assign(Error('Native offline'),{code:'E_NATIVE_DISCONNECTED'});};
  await assert.rejects(write(client,hash(null)),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(client.approved,false);assert.equal(f.sets.length,0);
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});
});

test('snapshot verification failure never grants storage access',async t=>{
  const f=fixture(t),client=f.client();
  f.controls.verifyHook=async()=>{throw Object.assign(Error('source changed'),{code:'E_SNAPSHOT_CHANGED'});};
  await assert.rejects(client.start(instance),{code:'E_SNAPSHOT_CHANGED'});
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});assert.equal(f.reads.length,0);
});

for(const [label,patch] of [
  ['missing leaseEpoch',{leaseEpoch:undefined}],
  ['zero leaseEpoch',{leaseEpoch:0}],

  ['numeric leaseEpoch',{leaseEpoch:3}],
  ['missing sessionId',{sessionId:undefined}],
  ['zero sessionId',{sessionId:0}],
  ['empty sessionId',{sessionId:''}],
  ['numeric sessionId',{sessionId:3}],
  ['missing devLeaseEpoch',{devLeaseEpoch:undefined}],
  ['zero devLeaseEpoch',{devLeaseEpoch:0}],
  ['wrong devLeaseEpoch',{devLeaseEpoch:2}]
])test(`approval rejects ${label} before Native admission or storage access`,async t=>{
  const f=fixture(t),client=f.client();
  f.current={...f.current,nativeAuthority:{...f.current.nativeAuthority,...patch}};
  await assert.rejects(client.start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(client.approved,false);assert.equal(f.nativeCalls,0);assert.equal(f.snapshotCalls,0);
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

test('losing the Native lease after approval prevents a storage write',async t=>{
  const {f,client}=await approved(t);
  f.current={...f.current,nativeAuthority:{...f.current.nativeAuthority,leaseEpoch:undefined}};
  await assert.rejects(write(client,hash(null)),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

for(const phase of ['assertHook','verifyHook'])for(const [label,patch] of [
  ['source identity',{sourceId:'source-'+'b'.repeat(24)}],
  ['tool identity',{tool:{id:'other-tool',capabilities:['storage.local']}}]
])test(`approval rejects changing ${label} while asynchronous ${phase} is pending`,async t=>{
  const f=fixture(t),client=f.client(),entered=deferred(),release=deferred();
  t.after(()=>release.resolve());
  // Replace the source snapshot only after the real owner reaches its await.
  // getCurrent otherwise returns the same stable object throughout approval.
  f.controls[phase]=async()=>{entered.resolve();await release.promise;};
  const rejected=assert.rejects(client.start(instance),{code:'E_PREVIEW_GRANT'});
  await entered.promise;f.current={...f.current,...patch};release.resolve();await rejected;
  assert.equal(client.approved,false);
  assert.equal(f.sent.some(row=>row.side==='owner'&&row.message.result?.approved===true),false);
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

for(const [label,stop] of [
  ['Stop',f=>f.owner.dispose()],['port disconnection',f=>f.pairs[0].owner.disconnect()]
])test(`${label} revokes client access without any further storage dispatch`,async t=>{
  const {f,client}=await approved(t);stop(f);await flush();
  assert.equal(client.approved,false);
  await assert.rejects(write(client,hash(null)),{code:'E_PREVIEW_GRANT'});assert.equal(f.sets.length,0);
});

test('replacement browser document cannot inherit the previous document grant',async t=>{
  const {f,client}=await approved(t);
  const port=f.api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+previewId});
  // MessageSender is immutable for each port; a new connection has a new document.
  f.pairs[1].owner.sender.documentId='44444444-4444-4444-8444-444444444444';
  await flush();assert.equal(client.approved,false);
  const response=await rawRequest(port,{type:'storage',requestId:1,sha256,instance,
    operation:'storage.get',payload:{key:'draft'}});
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_PREVIEW_GRANT');
  assert.equal(f.reads.length,0);
});

test('revocation during asynchronous Native assertion prevents all sets',async t=>{
  const {f,client}=await approved(t),entered=deferred(),release=deferred();
  f.controls.assertHook=async()=>{entered.resolve();await release.promise;};
  const rejected=assert.rejects(write(client,hash(null)),{code:'E_OUTCOME_UNKNOWN'});
  await entered.promise;f.owner.revoke();release.resolve();await rejected;await flush();
  assert.equal(f.sets.length,0);assert.equal(f.reads.length,0);
});

test('revocation after set dispatch returns unknown and permits read-only reconciliation without replay',async t=>{
  const {f,client}=await approved(t),entered=deferred(),release=deferred();
  const initial=await read(client);
  f.controls.setHook=async()=>{entered.resolve();await release.promise;};
  const rejected=assert.rejects(write(client,initial.etag),{code:'E_OUTCOME_UNKNOWN'});
  await entered.promise;f.owner.revoke();release.resolve();await rejected;await flush();
  assert.equal(f.sets.length,1);assert.equal(client.approved,false);
  const replacement=f.client();await replacement.start(instance);
  assert.deepEqual(await read(replacement),{value:'你好',etag:hash('你好')});
  assert.equal(f.sets.length,1);
  assert.equal(f.sent.filter(row=>row.side==='client'&&row.message.operation==='storage.set').length,1);
});

test('owner returns E_OUTCOME_UNKNOWN when a dispatched write is read back after revocation',async t=>{
  const f=fixture(t),entered=deferred(),release=deferred();t.after(()=>release.resolve());
  const port=f.api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+previewId});await flush();
  let sequence=0;
  const send=message=>rawRequest(port,{requestId:++sequence,sha256,instance,...message});
  assert.equal((await send({type:'approve'})).ok,true);
  const initial=await send({type:'storage',operation:'storage.get',payload:{key:'draft',withEtag:true}});
  assert.equal(initial.ok,true);
  f.controls.setHook=async()=>{entered.resolve();await release.promise;};
  const pending=send({type:'storage',operation:'storage.set',
    payload:{key:'draft',value:'你好',ifMatch:initial.result.etag}});
  await entered.promise;f.owner.revoke();release.resolve();
  const response=await pending;
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_OUTCOME_UNKNOWN');
  assert.equal(f.reads.length,3,'initial read, CAS read and post-dispatch readback');
  assert.equal(f.sets.length,1);
  const client=f.client();await client.start(instance);
  assert.equal((await read(client)).value,'你好');assert.equal(f.sets.length,1);
});

test('client timeout reports an in-flight write as unknown and never replays it',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {f,client}=await approved(t,{timeoutMs:50}),entered=deferred(),release=deferred();
  const initial=await read(client);
  f.controls.setHook=async()=>{entered.resolve();await release.promise;};
  const rejected=assert.rejects(write(client,initial.etag),{code:'E_OUTCOME_UNKNOWN'});
  await entered.promise;t.mock.timers.tick(50);await rejected;
  release.resolve();await flush();assert.equal(client.approved,false);
  assert.equal(f.sets.length,1);
  const replacement=f.client();await replacement.start(instance);assert.equal((await read(replacement)).value,'你好');
  assert.equal(f.sent.filter(row=>row.side==='client'&&row.message.operation==='storage.set').length,1);
  assert.equal(f.sets.length,1);
});

test('grant approval never reads installed local storage or even session data',async t=>{
  const {f}=await approved(t);assert.equal(f.localAccesses,0);
  assert.deepEqual(f.reads,[]);assert.deepEqual(f.sets,[]);
});

test('Stop before iframe load rejects its late start without connecting',async t=>{
  const f=fixture(t),client=f.client();
  // Capture the same callback an iframe.onload would retain before Stop.
  const onload=()=>client.start(instance);
  client.revoke('Stop before iframe load');
  await assert.rejects(onload(),{code:'E_PREVIEW_GRANT'});
  assert.equal(client.approved,false);assert.equal(f.pairs.length,0);
  assert.equal(f.sent.length,0);assert.equal(f.nativeCalls,0);
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

test('a session that already started rejects another start without reconnecting',async t=>{
  const {f,client}=await approved(t);
  await assert.rejects(client.start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.pairs.length,1);
  assert.equal(f.sent.filter(row=>row.side==='client'&&row.message.type==='approve').length,1);
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

test('owner revocation before approval result delivery rejects the stale generation without storage access',async t=>{
  const f=fixture(t),client=f.client();let approval,revocation;
  f.controls.beforePost=(side,message)=>{
    if(side!=='owner')return;
    if(message.type==='revoked')revocation=message;
    if(message.type==='result'&&message.result?.approved===true){
      approval=message.result;
      // At this boundary the owner has produced its result but has not posted
      // it yet. Revoke posts first; fake transport preserves that FIFO order.
      f.owner.revoke('Stop before approval result delivery');
    }
  };
  await assert.rejects(client.start(instance),{code:'E_PREVIEW_GRANT'});
  assert.ok(Number.isSafeInteger(approval.generation));
  assert.ok(Number.isSafeInteger(revocation.generation));
  assert.ok(revocation.generation>approval.generation);
  assert.equal(client.approved,false);
  assert.equal(f.states.some(([approved])=>approved),false);
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.sent.some(row=>row.side==='client'&&row.message.type==='storage'),false);
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});


test('Side Panel native -1 context binds trusted Host window proof and round-trips storage',async t=>{
  const {f,client}=await approved(t,{panel:true});
  const admission=f.sent.find(row=>row.side==='client'&&row.message.type==='approve').message;
  assert.equal(admission.windowId,1);assert.equal(admission.contextId,'context-1');
  assert.equal(f.pairs[0].owner.sender.tab,undefined);
  assert.equal(new URL(f.pairs[0].owner.sender.url).searchParams.has('previewId'),false);
  await write(client,(await read(client)).etag);assert.equal((await read(client)).value,'你好');
  const reads=f.reads.length,calls=f.nativeCalls;
  assert.deepEqual(await client.assertCurrent(instance),{authorized:true});
  assert.deepEqual(await client.request('currentPage.info',{},instance),{authorized:true});
  assert.equal(f.reads.length,reads);assert.ok(f.nativeCalls>calls);
  assert.equal(f.sets.length,1);
});

for(const [label,patch] of [
  ['wrong native window',{windowId:2}],['native tab',{tabId:7}],
  ['child context',{frameId:1}],['incognito',{incognito:true}],
  ['inactive context',{documentLifecycle:'cached'}],['wrong URL',{documentUrl:'https://example.com'}],
  ['missing context id',{contextId:''}],['wrong document',{documentId:'replacement'}]
])test(`Side Panel rejects ${label} before Native/storage admission`,async t=>{
  const f=fixture(t,{panel:true});Object.assign(f.contexts[0],patch);
  await assert.rejects(f.client().start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.nativeCalls,0);assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

for(const count of [0,2])test(`Side Panel rejects ${count} exact contexts`,async t=>{
  const f=fixture(t,{panel:true});if(count===0)f.contexts.length=0;else f.contexts.push({...f.contexts[0]});
  await assert.rejects(f.client().start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.nativeCalls,0);assert.equal(f.sets.length,0);
});

test('Side Panel requires actual Host window to match shell session window',async t=>{
  const f=fixture(t,{panel:true});f.controls.windowId=2;
  await assert.rejects(f.client().start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.pairs.length,0);assert.equal(f.nativeCalls,0);
});

for(const patch of [
  {tab:{id:7,windowId:1}},
  {url:`chrome-extension://${extensionId}/sidepanel.html?hostInstanceId=host-1&previewId=${previewId}`}
])test('Side Panel rejects sender tab or locator even when context matches',async t=>{
  const f=fixture(t,{panel:true,senderPatch:patch});
  await assert.rejects(f.client().start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.nativeCalls,0);assert.equal(f.sets.length,0);
});

for(const field of ['documentId','contextId'])test(`Side Panel async ${field} replacement blocks commit`,async t=>{
  const {f,client}=await approved(t,{panel:true});let changed=false;
  f.controls.assertHook=async()=>{if(!changed){changed=true;f.contexts[0][field]='replacement';}};
  await assert.rejects(write(client,hash(null)),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.sets.length,0);assert.equal(f.reads.length,0);assert.equal(client.approved,false);
});

test('Side Panel context replacement during approval rejects late approval',async t=>{
  const f=fixture(t,{panel:true});f.controls.verifyHook=async()=>{f.contexts[0].contextId='replacement';};
  await assert.rejects(f.client().start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.sets.length,0);
});

test('Side Panel async context lookup cannot survive owner revocation',async t=>{
  const {f,client}=await approved(t,{panel:true}),entered=deferred(),release=deferred();
  t.after(()=>release.resolve());
  f.controls.contextHook=async()=>{entered.resolve();await release.promise;};
  const rejected=assert.rejects(write(client,hash(null)),{code:'E_OUTCOME_UNKNOWN'});
  await entered.promise;f.owner.revoke();release.resolve();await rejected;await flush();
  assert.equal(f.sets.length,0);assert.equal(f.reads.length,0);
});

test('Side Panel in-place Native lease changes invalidate grant',async t=>{
  const {f,client}=await approved(t,{panel:true});
  f.current.nativeAuthority.leaseEpoch='new-lease';
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});


test('Side Panel missing sender documentId resolves only through exact native context',async t=>{
  const f=fixture(t,{panel:true,senderPatch:{documentId:undefined}});
  f.contexts[0].documentId='native-document';
  const client=f.client();await client.start(instance);
  assert.equal((await read(client)).value,null);
});

for(const field of ['documentId','contextId','windowId','hostInstanceId'])
  test(`Side Panel owner independently rejects forged transport ${field}`,async t=>{
    const f=fixture(t,{panel:true});
    const port=f.api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+previewId});await flush();
    const response=await rawRequest(port,{type:'approve',requestId:1,sha256,instance,
      surface:'sidepanel',windowId:1,documentId:f.contexts[0].documentId,contextId:'context-1',
      hostInstanceId:'host-1',[field]:field==='windowId'?2:'forged'});
    assert.equal(response.ok,false);assert.equal(response.error.code,'E_PREVIEW_GRANT');
    assert.equal(f.nativeCalls,0);assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
  });

test('Side Panel owner independently rejects ambiguous native contexts',async t=>{
  const f=fixture(t,{panel:true});f.contexts.push({...f.contexts[0]});
  const port=f.api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+previewId});await flush();
  const response=await rawRequest(port,{type:'approve',requestId:1,sha256,instance,
    surface:'sidepanel',windowId:1,documentId:f.contexts[0].documentId,contextId:'context-1',hostInstanceId:'host-1'});
  assert.equal(response.ok,false);assert.equal(f.nativeCalls,0);assert.equal(f.sets.length,0);
});

test('Side Panel owner window change invalidates approval synchronously',async t=>{
  const {f,client}=await approved(t,{panel:true});f.current={...f.current,windowId:2};
  await assert.rejects(write(client,hash(null)),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

test('Side Panel owner assertion rechecks Workspace and panel pointer before each authorization',async t=>{
  const {f,client}=await approved(t,{panel:true});let calls=0;
  f.controls.assertHook=async()=>{if(++calls===2)throw Object.assign(Error('panel pointer replaced'),{code:'E_OWNER'});};
  await assert.rejects(write(client,hash(null)),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(calls,2);assert.equal(f.sets.length,0);assert.equal(client.approved,false);
});

test('Side Panel approval rejects in-place Native lease replacement during snapshot await',async t=>{
  const f=fixture(t,{panel:true});
  f.controls.verifyHook=async()=>{f.current.nativeAuthority.leaseEpoch='replacement';};
  await assert.rejects(f.client().start(instance),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.sets.length,0);
});


test('Side Panel currentPage.info requires matching approved instance and rechecks Native owner',async t=>{
  const f=fixture(t,{panel:true}),client=f.client();
  await assert.rejects(client.request('currentPage.info',{},instance),{code:'E_PREVIEW_GRANT'});
  await client.start(instance);
  await assert.rejects(client.request('currentPage.info',{},previewId),{code:'E_PREVIEW_GRANT'});
  f.controls.assertHook=async()=>{throw Object.assign(Error('Native disconnected'),{code:'E_NATIVE_DISCONNECTED'});};
  await assert.rejects(client.request('currentPage.info',{},instance));
  assert.equal(client.approved,false);assert.equal(f.reads.length,0);assert.equal(f.sets.length,0);
});

test('Side Panel replacement after write dispatch reports unknown without replay',async t=>{
  const {f,client}=await approved(t,{panel:true});
  f.controls.setHook=async()=>{f.contexts[0].documentId='replacement';};
  await assert.rejects(write(client,hash(null)),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.sets.length,1);assert.equal(client.approved,false);
  await assert.rejects(write(client,hash(null)),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.sent.filter(row=>row.side==='client'&&row.message.operation==='storage.set').length,1);
});


test('currentPage.info denies undeclared capability without reading a page',async t=>{
  const {f,client}=await approved(t,{panel:true});
  f.current.tool.capabilities=['storage.local'];
  await assert.rejects(client.request('currentPage.info',{},instance),{code:'E_CAPABILITY'});
  assert.equal(f.sets.length,0);
});

test('snapshot revocation may rebind consent, but an in-flight write always forbids replay',async t=>{
  for(const writing of [false,true]){
    const {f,client}=await approved(t,{panel:true});
    const entered=deferred(),release=deferred();
    t.after(()=>release.resolve());
    let saving;
    if(writing){
      const first=await read(client);
      f.controls.setHook=async()=>{entered.resolve();await release.promise;};
      saving=assert.rejects(write(client,first.etag),{code:'E_OUTCOME_UNKNOWN'});await entered.promise;
    }
    f.owner.revoke('new snapshot',true);await new Promise(resolve=>setImmediate(resolve));
    if(saving)await saving;
    assert.equal(f.states.at(-1)[2].canRebind,!writing);
    release.resolve();
  }
});


test('durable read-only source binds explicit empty CLI lease and rejects a later CLI lease',async t=>{
  const f=fixture(t,{panel:true});f.current.nativeAuthority.leaseEpoch='';
  const client=f.client();await client.start(instance);
  assert.equal((await read(client)).value,null);assert.ok(f.nativeCalls>=3);
  f.current.nativeAuthority={...f.current.nativeAuthority,leaseEpoch:'new-cli-lease'};
  await assert.rejects(read(client),{code:'E_PREVIEW_GRANT'});
  assert.equal(f.sets.length,0);
});
