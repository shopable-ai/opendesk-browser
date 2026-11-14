import test from 'node:test';
import assert from 'node:assert/strict';
import {controllerMethods} from '../../src/platform/host/controller-methods.js';
import {canonical} from '../../src/platform/protocol.js';
import {fakeBuiltinSource} from '../environment/builtin-support.mjs';

const prefix='page-task-request:';
const requestKey=row=>prefix+canonical([row.namespace,row.requestId]);
const source={namespace:'tool:fixture',programId:'page.fixture',revision:1,manifestHash:'a'.repeat(64),
  sourceHash:'b'.repeat(64),installationId:'installation-original',generation:1,tabId:2,frameId:0,
  documentId:'original-document',url:'https://source.example/page',windowId:1,
  delegatedTasks:[{taskId:'task.fixture',targetUrl:'https://target.example/task'}]};

function fixture({scan=true,authorize=async()=>{},beforeStatus=()=>{},hostCheck=async()=>{}}={}){
  let journal=new Map(),runs=new Map(),failureAt=Infinity;
  const reads=[],writes=[],materialized=[];
  const storage={async transaction(names,mode,work){
    const copies={commandJournal:new Map(journal),runs:new Map(runs)},changes=[];
    const store=name=>{assert.ok(names.includes(name));return copies[name]??new Map();};
    const transaction={
      get:async(name,key)=>structuredClone(store(name).get(key)),
      all:async name=>{
        if(name==='commandJournal'&&scan)throw Error('Unrelated Controller history must not be materialized');
        return [...store(name)].map(([key,value])=>{materialized.push(key);return structuredClone(value);});
      },
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');store(name).set(key,structuredClone(value));changes.push(key);}
    };
    if(scan)transaction.scanEntries=async(name,options)=>{
      assert.equal(name,'commandJournal');assert.equal(options.prefix,prefix);assert.equal(options.limit,256);
      reads.push({...options});if(reads.length===failureAt)throw Error('later cursor page failed');
      return [...store(name)].filter(([key])=>key>=prefix&&key<prefix+'\uffff'&&
        (options.afterKey===undefined||key>options.afterKey)).sort(([a],[b])=>a<b?-1:a>b?1:0)
        .slice(0,options.limit).map(([key,value])=>{materialized.push(key);return {key,value:structuredClone(value)};});
    };
    const result=await work(transaction);
    journal=copies.commandJournal;runs=copies.runs;writes.push(...changes);return result;
  }};
  let statusReads=0,hostChecks=0;
  const hostSender={documentId:'host-document'},host={namespace:source.namespace,principal:'host-principal'};
  const authority=controllerMethods({storage,api:{permissions:{contains:async()=>true}},session:'session',clock:{now:()=>1000},
    assertHost:async sender=>{assert.equal(sender,hostSender);return host;},
    currentHost:async()=>{hostChecks++;await hostCheck();},
    pageTaskSource:{authorize,inTransaction:async()=>{}},loadBuiltin:async()=>{statusReads++;beforeStatus();return fakeBuiltinSource;}});
  const add=(n,changes={})=>{
    const row={tag:'page-task-request',namespace:source.namespace,requestId:'request-'+String(n).padStart(4,'0'),
      preparationId:'preparation-'+n,pageSource:{...structuredClone(source),tabId:3},
      target:{mode:'owned',url:'https://target.example/task'},sourceEpoch:0,sourceFence:{},
      browserSessionIncarnation:'session',params:{},task:{},createdAt:n,...changes};
    const key=requestKey(row);journal.set(key,row);return key;
  };
  const unrelated='controller-op:18MB';journal.set(unrelated,{tag:'controller-operation',payload:'x'.repeat(18*1024*1024)});
  return {authority,reads,writes,materialized,add,unrelated,statusReads:()=>statusReads,hostChecks:()=>hostChecks,
    get:key=>structuredClone(journal.get(key)),put:(key,value)=>journal.set(key,value),
    putRun:run=>runs.set(run.runId,run),getRun:key=>structuredClone(runs.get(key)),
    failScan:at=>{failureAt=at;},restore:(reader=source)=>authority.handlePageTaskRequest({operation:'restore',payload:{}},reader),
    list:()=>authority.listPageTaskRequests({},hostSender)};
}

test('Host request list scans every page and returns the latest 64 scoped requests without unrelated history',async()=>{
  const f=fixture();Array.from({length:520},(_,n)=>f.add(n));
  f.add(900,{namespace:'other'});f.add(901,{tag:'controller-operation'});
  const {requests}=await f.list();
  assert.equal(requests.length,64);assert.deepEqual(requests.map(row=>row.requestId),
    Array.from({length:64},(_,n)=>'request-'+String(519-n).padStart(4,'0')));
  assert.equal(f.reads.length,3);assert.equal(f.hostChecks(),1);
  assert.ok(!f.materialized.includes(f.unrelated));assert.deepEqual(f.writes,[]);
});

test('Host request projection preserves revoked, stale and unknown preparation states',async()=>{
  const f=fixture();f.add(1,{authorizationRevoked:true});f.add(2,{sourceInvalidated:true});
  const key=f.add(3);f.put('task-preparation:'+canonical([source.namespace,'preparation-3']),
    {tag:'task-run-preparation',state:'outcome-unknown'});
  const original=f.get(key),{requests}=await f.list();
  assert.deepEqual(requests.map(row=>row.state),['outcome-unknown','source-stale','revoked']);
  assert.ok(requests.every(row=>row.approvalAllowed===false));assert.deepEqual(f.get(key),original);assert.deepEqual(f.writes,[]);
});

test('expired Host and later cursor failure cannot return a partial request list',async()=>{
  const rejected=fixture({hostCheck:async()=>{throw Object.assign(Error('Host fenced'),{code:'E_OWNER'});}});
  await assert.rejects(rejected.list(),{code:'E_OWNER'});assert.deepEqual(rejected.reads,[]);
  const f=fixture();Array.from({length:520},(_,n)=>f.add(n));f.failScan(3);
  await assert.rejects(f.list(),/later cursor page failed/);assert.equal(f.reads.length,3);assert.deepEqual(f.writes,[]);
});

test('Host request list retains all-reader fallback for storage without cursors',async()=>{
  const f=fixture({scan:false});f.add(1);f.add(2,{namespace:'other'});
  assert.deepEqual((await f.list()).requests.map(row=>row.requestId),['request-0001']);assert.deepEqual(f.reads,[]);
});

test('navigation scans at least three pages, fences only matching tabs and never materializes unrelated 18MB history',async()=>{
  const f=fixture(),keys=Array.from({length:520},(_,n)=>f.add(n,{pageSource:{...source,tabId:n%2?3:2},
    approval:{invalidated:false,source:{...source},sourceEpoch:0}}));
  const wrongTag=f.add(900,{tag:'controller-operation',pageSource:{...source}});
  await f.authority.invalidatePageTaskSource({tabId:2});
  keys.forEach((key,n)=>{assert.equal(f.get(key).sourceInvalidated,n%2?undefined:true);
    assert.equal(f.get(key).approval.invalidated,n%2?false:true);});
  assert.equal(f.get(wrongTag).sourceInvalidated,undefined);assert.equal(f.writes.length,260);
  assert.equal(f.reads.length,3);assert.equal(f.reads[0].afterKey,undefined);
  assert.ok(f.reads[1].afterKey<f.reads[2].afterKey);assert.ok(!f.materialized.includes(f.unrelated));
});

test('permission removal matches either source or target origin without navigation invalidation',async()=>{
  const f=fixture(),a=f.add(1,{pageSource:{...source}}),b=f.add(2,{pageSource:{...source,url:'https://else.example/'},
    target:{url:'https://source.example/target'}}),other=f.add(3,{pageSource:{...source,url:'https://else.example/'}});
  await f.authority.invalidatePageTaskSource({permissionRemoved:true,origins:['https://source.example/*']});
  for(const key of [a,b]){assert.equal(f.get(key).authorizationRevoked,true);assert.equal(f.get(key).sourceInvalidated,undefined);}
  assert.equal(f.get(other).authorizationRevoked,undefined);assert.deepEqual(f.writes.sort(),[a,b].sort());
});

test('subframe and invalid tab events do not scan or invalidate requests',async()=>{
  const f=fixture(),key=f.add(1,{pageSource:{...source}});
  assert.deepEqual(await f.authority.invalidatePageTaskSource({tabId:2,frameId:1}),[]);
  assert.deepEqual(await f.authority.invalidatePageTaskSource({tabId:'2'}),[]);
  assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);assert.equal(f.get(key).sourceInvalidated,undefined);
});

test('later-page failure leaves persisted requests unchanged and cannot unfence a pending original request epoch',async()=>{
  let release,entered;const gate=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{entered=resolve;});
  const f=fixture({authorize:async()=>{entered();await gate;}});
  const keys=Array.from({length:520},(_,n)=>f.add(n,{pageSource:{...source}}));
  const pending=f.authority.handlePageTaskRequest({operation:'request',payload:{requestId:'12345678-1234-4123-8123-123456789abc',
    taskId:'task.fixture',params:{}}},source);
  await waiting;f.failScan(3);
  const failure=await f.authority.invalidatePageTaskSource({tabId:2}).catch(error=>error);
  release();await assert.rejects(pending,{code:'E_DOCUMENT_STALE'});
  assert.match(failure.message,/later cursor page failed/);
  keys.forEach(key=>assert.equal(f.get(key).sourceInvalidated,undefined));assert.deepEqual(f.writes,[]);
  assert.deepEqual(f.writes,[]);
});

test('restore scans all pages and keeps full source slot matching',async()=>{
  const f=fixture();
  Array.from({length:520},(_,n)=>f.add(n,{pageSource:{...source,...[
    {namespace:'other'},{programId:'other'},{tabId:3},{frameId:1},{url:source.url+'#changed'},{windowId:2}][n%6]}}));
  assert.deepEqual(await f.restore(),{requestId:null,state:'idle'});assert.equal(f.reads.length,3);
  assert.ok(!f.materialized.includes(f.unrelated));assert.deepEqual(f.writes,[]);
});

test('restore finds the original slot on the last page and rejects changed installation identity',async()=>{
  for(const field of ['revision','manifestHash','sourceHash','installationId','generation']){
    const f=fixture();Array.from({length:520},(_,n)=>f.add(n));
    const key=f.add(999,{pageSource:{...source},sourceInvalidated:true});
    const before=f.get(key);
    await assert.rejects(f.restore({...source,[field]:typeof source[field]==='number'?source[field]+1:'changed'}),{code:'E_REVISION'});
    assert.equal(f.reads.length,3);assert.deepEqual(f.get(key),before);assert.deepEqual(f.writes,[]);
  }
});

test('restore rejects duplicate original slots without updating recovery or approval',async()=>{
  const f=fixture();Array.from({length:520},(_,n)=>f.add(n));
  f.add(998,{pageSource:{...source},sourceInvalidated:true});f.add(999,{pageSource:{...source}});
  await assert.rejects(f.restore(),{code:'E_OWNER'});assert.equal(f.reads.length,3);assert.deepEqual(f.writes,[]);
});

test('later-page restore failure does not persist recovery or revive approval',async()=>{
  const f=fixture(),key=f.add(0,{pageSource:{...source},sourceInvalidated:true,authorizationRevoked:true});
  Array.from({length:520},(_,n)=>f.add(n+1));const before=f.get(key);f.failScan(3);
  await assert.rejects(f.restore(),/later cursor page failed/);
  assert.deepEqual(f.get(key),before);assert.deepEqual(f.writes,[]);assert.equal(f.statusReads(),0);
});

test('last-page restore preserves original identity and invalidated approval while recording only the current recovery candidate',async()=>{
  // Stop after the selection transaction commits, at the existing status loader
  // boundary. Full installed-task/result projection is covered by the environment suite.
  const boundary=Error('status loader boundary'),f=fixture({beforeStatus:()=>{throw boundary;}});
  Array.from({length:520},(_,n)=>f.add(n));
  const key=f.add(999,{pageSource:{...source},sourceInvalidated:true,
    approval:{source:{...source},sourceEpoch:0,invalidated:true},params:{original:true}}),before=f.get(key);
  const current={...source,documentId:'refreshed-document'};
  await assert.rejects(f.restore(current),error=>error===boundary);
  const {recoveryCandidate,...original}=f.get(key);
  assert.deepEqual(original,before);assert.deepEqual(recoveryCandidate.source,current);
  assert.equal(recoveryCandidate.sourceEpoch,0);assert.equal(f.reads.length,3);assert.deepEqual(f.writes,[key]);
});

test('permission scan preserves unknown run state and identities while revoking only matching result delivery',async()=>{
  const f=fixture(),key=f.add(1,{pageSource:{...source}}),other=f.add(2,{pageSource:{...source,url:'https://other.example/'},
    target:{url:'https://other.example/target'}});
  const original={tag:'controller-run',runId:'original-run',pageRequestId:f.get(key).requestId,
    state:'interrupted',retirementState:'unknown',resultId:'original-result',ownerEpoch:7};
  const unrelated={...original,runId:'other-run',pageRequestId:f.get(other).requestId};
  f.putRun(original);f.putRun(unrelated);
  await f.authority.invalidatePageTaskSource({permissionRemoved:true,origins:['https://source.example/*']});
  assert.deepEqual(f.getRun(original.runId),{...original,resultDeliveryRevoked:true});
  assert.deepEqual(f.getRun(unrelated.runId),unrelated);
});

test('storage without scanEntries retains the original all-reader fallback',async()=>{
  const f=fixture({scan:false}),key=f.add(1,{pageSource:{...source}});
  await f.authority.invalidatePageTaskSource({tabId:2});assert.equal(f.get(key).sourceInvalidated,true);
  assert.deepEqual(await f.restore({...source,tabId:4}),{requestId:null,state:'idle'});assert.deepEqual(f.reads,[]);
});
