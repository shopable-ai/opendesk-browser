import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {executeDevelopmentStorage} from '../../src/ui/sidebar-tools/development-storage.js';
import {stableStorageString,writeVerifiedLocalValue,writeVerifiedStorageValue} from '../../src/ui/sidebar-tools/storage-state.js';

const sourceId='source-'+ 'a'.repeat(24),toolId='quick-notes';
const hash=value=>createHash('sha256').update(stableStorageString(value)).digest('hex');
const error=code=>Object.assign(new Error(code),{code});
function locks(){
  const tails=new Map(),names=[];
  return {names,request(name,callback){
    names.push(name);
    const next=(tails.get(name)??Promise.resolve()).then(callback);
    tails.set(name,next.catch(()=>{}));
    return next;
  }};
}
function fixture(){
  const values={},events=[],lockManager=locks();
  let reads=0,writes=0,authorizations=0;
  const controls={lostAck:false,unreadable:false,refuse:false,revokeAt:0};
  const session={
    async get(key){events.push('get');reads++;
      if(controls.unreadable&&writes)throw Error('read unavailable');
      return Object.hasOwn(values,key)?{[key]:structuredClone(values[key])}:{};
    },
    async set(rows){events.push('set');writes++;
      if(controls.refuse)throw Error('QUOTA_BYTES quota exceeded');
      Object.assign(values,structuredClone(rows));
      if(controls.lostAck)throw Error('ACK lost');
    }
  };
  const api={storage:{session,get local(){assert.fail('local must never be accessed');}}};
  const authorize=async()=>{events.push('authorize');authorizations++;
    await Promise.resolve(); // Native assertion precedes synchronous generation recheck.
    if(authorizations===controls.revokeAt)throw error('E_REVOKED');
  };
  const options={api,sourceId,toolId,authorize,lockManager};
  const request=(operation,payload,extra={})=>executeDevelopmentStorage({...options,operation,payload,...extra});
  return {api,values,events,controls,options,lockManager,request,
    get reads(){return reads;},get writes(){return writes;}};
}
const get=(f,extra={})=>f.request('storage.get',{key:'draft',withEtag:true},extra);
const save=(f,value,ifMatch=hash(null),extra={})=>f.request('storage.set',{key:'draft',value,ifMatch},extra);

test('empty session read never copies local data, allocates nothing, and hashes JSON null',async()=>{
  const f=fixture();
  assert.deepEqual(await get(f),{value:null,etag:hash(null)});
  assert.deepEqual(await f.request('storage.get',{key:'draft'}),{value:null});
  assert.equal(f.writes,0);assert.deepEqual(f.values,{});
  assert.deepEqual(f.events.slice(0,3),['authorize','get','authorize']);
});

test('session data survives independent owner/import replacement; source and tool namespaces isolate',async()=>{
  const f=fixture(),value={z:[{b:2,a:1}],a:'hello'};
  assert.deepEqual(await save(f,value),{saved:true,etag:hash(value)});
  const {executeDevelopmentStorage:otherOwner}=await import('../../src/ui/sidebar-tools/development-storage.js?owner=second');
  assert.deepEqual(await otherOwner({...f.options,operation:'storage.get',payload:{key:'draft',withEtag:true}}),
    {value,etag:hash({a:'hello',z:[{a:1,b:2}]})});
  assert.equal((await get(f,{sourceId:'source-'+'b'.repeat(24)})).value,null);
  assert.equal((await get(f,{toolId:'other-tool'})).value,null);
  assert.equal(new Set(f.lockManager.names).size,3);
  assert.equal(Object.keys(f.values).length,1);
});

test('stable etags ignore nested property ordering and CAS is mandatory',async()=>{
  const f=fixture();await save(f,{z:2,a:{y:1,b:3}});
  const key=Object.keys(f.values)[0];f.values[key]={draft:{a:{b:3,y:1},z:2}};
  assert.equal((await get(f)).etag,hash({z:2,a:{y:1,b:3}}));
  await assert.rejects(save(f,'bad'),{code:'E_STORAGE_CONFLICT'});
  for(const ifMatch of [undefined,null,'',123,'g'.repeat(64)])
    await assert.rejects(save(f,'bad',ifMatch===undefined?null:ifMatch),{code:'E_SCHEMA'});
  await assert.rejects(f.request('storage.set',{key:'draft',value:1}),{code:'E_SCHEMA'});
  assert.equal(f.writes,1);
});

test('rejects invalid identities, operations, keys and payload fields',async()=>{
  const f=fixture();
  for(const patch of [{sourceId:'../source'},{sourceId:sourceId+':x'},{toolId:'../tool'},{toolId:'Xx'}])
    await assert.rejects(get(f,patch),{code:'E_SCHEMA'});
  await assert.rejects(f.request('storage.clear',{}),{code:'E_SERVICE_UNSUPPORTED'});
  for(const key of ['__proto__','constructor','prototype','a:b','', 'x'.repeat(61)])
    await assert.rejects(f.request('storage.get',{key}),{code:'E_SCHEMA'});
  await assert.rejects(f.request('storage.get',{key:'draft',unknown:true}),{code:'E_SCHEMA'});
  await assert.rejects(get(f,{lockManager:null}),{code:'E_CONTEXT'});
  assert.equal(f.writes,0);
});

test('refuses lossy, cyclic, non-JSON and accessor values without writing',async()=>{
  const f=fixture(),cycle={};cycle.self=cycle;
  const sparse=[];sparse.length=1;
  for(const value of [undefined,()=>{},Symbol('x'),1n,NaN,Infinity,{x:undefined},[undefined],
    {x:()=>{}},cycle,sparse,new Date(),new Map(),{get x(){assert.fail('getter executed');}}])
    await assert.rejects(save(f,value),{code:'E_VALUE_SERIALIZATION'});
  assert.equal(f.writes,0);
});

test('enforces UTF-8 8 KiB item, 32 KiB total and 32 key budgets',async()=>{
  const f=fixture();
  await assert.rejects(save(f,'中'.repeat(2731)),{code:'E_TOOL_DATA_LIMIT'});
  await save(f,'x'.repeat(8190)); // quotes count toward exactly 8192 bytes
  for(let i=0;i<2;i++)await f.request('storage.set',{key:'item'+i,value:'x'.repeat(8190),ifMatch:hash(null)});
  await assert.rejects(f.request('storage.set',{key:'item2',value:'x'.repeat(8190),ifMatch:hash(null)}),{code:'E_TOOL_DATA_LIMIT'});
  const g=fixture();
  for(let i=0;i<32;i++)await g.request('storage.set',{key:'item'+i,value:i,ifMatch:hash(null)});
  await assert.rejects(save(g,'extra'),{code:'E_TOOL_DATA_LIMIT'});
  assert.equal(g.writes,32);
});

test('invalid stored schema, items or budgets fail closed',async()=>{
  const f=fixture();await save(f,1);const key=Object.keys(f.values)[0];
  for(const value of [null,[],{constructor:1},{draft:'x'.repeat(8191)},
    Object.fromEntries(Array.from({length:33},(_,i)=>['k'+i,i]))]){
    f.values[key]=value;
    await assert.rejects(get(f),{code:'E_STORAGE_CORRUPT'});
  }
  assert.equal(f.writes,1);
});

test('authorization is checked under lock, immediately before dispatch, and after readback',async()=>{
  for(const revokeAt of [1,2,3]){
    const f=fixture();f.controls.revokeAt=revokeAt;
    await assert.rejects(save(f,'new'),{code:revokeAt===3?'E_OUTCOME_UNKNOWN':'E_REVOKED'});
    assert.equal(f.writes,revokeAt===3?1:0);
    if(revokeAt===3){
      assert.deepEqual(f.events,['authorize','get','authorize','set','get','authorize']);
      assert.equal((await get(f)).value,'new');
    }
  }
  const f=fixture();f.controls.revokeAt=2;
  await assert.rejects(get(f),{code:'E_REVOKED'});
});

test('same source/tool requests serialize across owners and stale concurrent CAS writes only once',async()=>{
  const f=fixture();let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const first=save(f,'first',hash(null),{authorize:async()=>{entered();await gate;}});
  await started;
  const second=save(f,'second');
  const independent=await get(f,{sourceId:'source-'+'c'.repeat(24)});
  assert.equal(independent.value,null);
  assert.equal(f.reads,1,'blocked requests have not read storage');
  release();await first;
  await assert.rejects(second,{code:'E_STORAGE_CONFLICT'});
  assert.equal(f.writes,1);assert.equal((await get(f)).value,'first');
});

test('lost ACK is confirmed by readback with exactly one set; metadata does not report analytics',async()=>{
  const f=fixture();f.controls.lostAck=true;
  const result=await f.request('storage.set',{key:'draft',value:'new',ifMatch:hash(null),
    analyticsIntent:'save_prompt',itemId:'item-1'});
  assert.deepEqual(result,{saved:true,etag:hash('new')});
  assert.equal(f.writes,1);assert.equal(f.reads,2);
  assert.deepEqual(Object.values(f.values),[{draft:'new'}]);
});

test('authorization invalidated while waiting for the lock fails before reading or writing',async()=>{
  const f=fixture();let release,entered,valid=true;
  const started=new Promise(resolve=>{entered=resolve;});
  const blocker=f.lockManager.request('opendesk.sidebar-tools.development-data.v1:'+sourceId+':'+toolId,
    ()=>{entered();return new Promise(resolve=>{release=resolve;});});
  await started;
  const pending=save(f,'new',hash(null),{authorize:async()=>{if(!valid)throw error('E_REVOKED');}});
  valid=false;release();await blocker;
  await assert.rejects(pending,{code:'E_REVOKED'});
  assert.equal(f.reads,0);assert.equal(f.writes,0);
});

test('synchronous assertCommit rejects revocation in the final authorize microtask gap with zero sets',async()=>{
  const f=fixture(),events=[];let calls=0,valid=true;
  const authorize=async()=>{
    if(!valid)throw error('E_REVOKED');
    if(++calls===2)return new Promise(resolve=>{
      resolve();events.push('resolved');
      queueMicrotask(()=>{valid=false;events.push('revoked');});
    });
  };
  await assert.rejects(save(f,'new',hash(null),{authorize,assertCommit:()=>{
    events.push('commit');if(!valid)throw error('E_REVOKED');
  }}),{code:'E_REVOKED'});
  assert.deepEqual(events,['resolved','revoked','commit']);
  assert.equal(calls,2);assert.equal(f.writes,0);assert.deepEqual(f.values,{});
});

test('assertCommit executes synchronously immediately before the single set',async()=>{
  const f=fixture();
  const result=await save(f,'new',hash(null),{assertCommit:()=>{f.events.push('commit');}});
  assert.deepEqual(result,{saved:true,etag:hash('new')});
  assert.deepEqual(f.events,['authorize','get','authorize','commit','set','get','authorize']);
  assert.equal(f.writes,1);
});

test('payload is a detached JSON snapshot before entering the lock queue',async()=>{
  const f=fixture();let release;
  const namespace='opendesk.sidebar-tools.development-data.v1:'+sourceId+':'+toolId;
  const blocker=f.lockManager.request(namespace,()=>new Promise(resolve=>{release=resolve;}));
  await Promise.resolve();
  const payload={key:'draft',value:{items:[{text:'original'}]},ifMatch:hash(null)};
  const pending=f.request('storage.set',payload);
  payload.key='other';payload.ifMatch='0'.repeat(64);
  payload.value.items[0].text='mutated';payload.value.items.push({text:'extra'});
  release();await blocker;
  assert.deepEqual(await pending,{saved:true,etag:hash({items:[{text:'original'}]})});
  assert.deepEqual((await get(f)).value,{items:[{text:'original'}]});
  assert.deepEqual(Object.values(f.values),[{draft:{items:[{text:'original'}]}}]);
  assert.equal(Object.isFrozen(payload),false,'caller object is not frozen');
});

test('read failures and refused quota writes are classified without replay',async()=>{
  const f=fixture();f.api.storage.session.get=async()=>{throw Error('unavailable');};
  await assert.rejects(get(f),{code:'E_HOST_STORAGE_READ'});
  assert.equal(f.writes,0);
  const g=fixture();g.controls.refuse=true;
  await assert.rejects(save(g,'new'),{code:'E_HOST_STORAGE_QUOTA'});
  assert.equal(g.writes,1);assert.deepEqual(g.values,{});
});

test('an acknowledged but mismatched write remains unknown and is never replayed',async()=>{
  const f=fixture();let writes=0;
  f.api.storage.session.set=async()=>{writes++;};
  await assert.rejects(save(f,'new'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(writes,1);
  assert.equal((await get(f)).value,null);
  assert.equal(writes,1);
});

test('unknown outcome never retries and can be reconciled by a read',async()=>{
  const f=fixture();f.controls.lostAck=true;f.controls.unreadable=true;
  await assert.rejects(save(f,'new'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.writes,1);
  f.controls.unreadable=false;
  assert.deepEqual(await get(f),{value:'new',etag:hash('new')});
  assert.equal(f.writes,1);
  await assert.rejects(save(f,'new'),{code:'E_STORAGE_CONFLICT'});
  assert.equal(f.writes,1);
});

test('verified local wrapper retains prior result, quota classification and single-write semantics',async()=>{
  for(const wrapper of [true,false]){
    let value={old:1},writes=0,mode='lost';
    const area={async set(row){writes++;if(mode==='quota')throw Error('QUOTA_BYTES');
      value=row.key;throw Error('ACK lost');},async get(){return {key:value};}};
    const write=(next,previous)=>wrapper?writeVerifiedLocalValue({storage:{local:area}},'key',next,previous):
      writeVerifiedStorageValue(area,'key',next,previous);
    assert.deepEqual(await write({new:1},value),{confirmed:true,acknowledgementLost:true});
    mode='quota';await assert.rejects(write({bad:1},value),{code:'E_HOST_STORAGE_QUOTA'});
    assert.deepEqual(value,{new:1});assert.equal(writes,2);
  }
});
