import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTrustedPromptHost,PROMPT_AI_RECOVERY_KEY} from '../../src/ui/conversation/prompt-host.js';
import {createPromptReconciliationAdapter} from '../../src/ui/conversation/prompt-controller.js';
import {SIDEBAR_TOOL_DATA_LIMITS,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {stableStorageString,writeVerifiedLocalValue} from '../../src/ui/sidebar-tools/storage-state.js';
import '../../examples/sidebar-tools/prompt-shortcuts/trusted/model.js';

const model=globalThis.OpenDeskPromptShortcutsModel;
const hash=value=>createHash('sha256').update(stableStorageString(value)).digest('hex');
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const fail=code=>Object.assign(new Error(code),{code});
// Node lacks Chrome navigator.locks. Model its FIFO exclusive semantics only
// for deterministic Host interleaving regressions; the production Host still
// rejects missing real Web Locks, covered separately by the source-bound gate.
function testExclusiveLocks(){
  const tails=new Map();
  return {request(name,options,callback){
    const work=typeof options==='function'?options:callback;
    const signal=typeof options==='function'?null:options?.signal;
    const prior=tails.get(name)||Promise.resolve();
    const pending=prior.then(()=>{
      if(signal?.aborted)throw Object.assign(new Error('Lock request aborted'),{name:'AbortError'});
      return work({name,mode:'exclusive'});
    });
    const settled=pending.then(()=>{},()=>{});
    tails.set(name,settled);
    void settled.then(()=>{if(tails.get(name)===settled)tails.delete(name);});
    return pending;
  }};
}
// Execute the production dispatcher's storage branch verbatim, not a fake
// E_TOOL_DATA_LIMIT throw. Session/Chrome/Provider boundaries remain local fixtures.
const source=readFileSync(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
const start=source.indexOf("      if(operation!=='storage.get'&&operation!=='storage.set')");
const end=source.indexOf('\n    });\n  }',start);
assert.ok(start>=0&&end>start,'production storage branch must be found');
const storageBranch=new (Object.getPrototypeOf(async()=>{}).constructor)(
  'operation','payload','tool','source','token','api','sidebarToolStorageKey',
  'SIDEBAR_TOOL_DATA_LIMITS','sameInstance','assertSession','writeVerifiedLocalValue',
  'etagFor','reportAnalytics','assertWrite',source.slice(start,end));

function fixture({quota=false,mode='normal'}={}){
  const locks=testExclusiveLocks();
  const tool={id:'prompt-shortcuts',version:'1.1.13'},namespace=sidebarToolStorageKey(tool.id);
  const initial={library:model.defaults()};
  if(quota){
    for(let i=0;i<4;i++)initial['filler'+i]='x'.repeat(8000);
    initial.filler3+='x'.repeat(32768-bytes(initial));
    assert.equal(bytes(initial),32768);
  }
  const rows=new Map([[namespace,structuredClone(initial)]]),frame={},messages=[];
  let writes=0,attempts=0,readLost=false,host;
  const api={storage:{local:{
    async get(key){
      if(key===namespace&&readLost)throw fail('E_ACK_LOST');
      return {[key]:structuredClone(rows.get(key))};
    },
    async set(values){
      for(const [key,value] of Object.entries(values)){
        rows.set(key,structuredClone(value));
        if(key===namespace){writes++;if(mode==='ack-lost'){readLost=true;throw fail('E_ACK_LOST');}}
      }
    },
    async remove(key){rows.delete(key);}
  }}};
  const dispatch=async(operation,payload)=>{
    if(operation==='storage.set'){
      attempts++;
      if(mode==='conflict'){
        const current=rows.get(namespace);
        current.library={...model.defaults(),items:[model.draft({body:'另一窗口写入'})]};
      }
    }
    return storageBranch(operation,payload,tool,frame,'instance',api,sidebarToolStorageKey,
      SIDEBAR_TOOL_DATA_LIMITS,()=>true,()=>{},writeVerifiedLocalValue,async value=>hash(value),()=>{});
  };
  host=createTrustedPromptHost({api,tool,token:'instance',epoch:'epoch',model,
    lockManager:locks,assertIdentity:async()=>{},frameSource:()=>frame,guardBlocked:()=>false,
    dispatch,etagFor:async value=>hash(value),confirm:async()=>true,
    conversation:{source:()=>({provider:'fixture'}),cancel:async()=>{},
      request:async({request})=>({proposal:{action:{type:'create',body:request}},
        authorization:{assertWrite:async()=>{},release(){}}})},
    sendToFrame:message=>{
      messages.push(message);
      if(message.kind==='ai-guard')queueMicrotask(()=>host.onGuardResponse({
        guardId:message.guardId,granted:true},frame));
    }});
  return {host,rows,namespace,dispatch,messages,initial,
    run:body=>host.request({request:body,event:{isTrusted:true}}),
    restoreReads(){readLost=false;},get writes(){return writes;},get attempts(){return attempts;}};
}

for(const waitAt of ['recovery','tool'])for(const mode of ['stop','grant-revoked','dispose']){
  test('R1.7 '+mode+' while queued for '+waitAt+' lock forbids the pending write',async t=>{
    const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
    const held=deferred(),release=deferred(),queued=deferred();
    const tool={id:'prompt-shortcuts',version:'1.1.14'},namespace=sidebarToolStorageKey(tool.id);
    const frame={},rows=new Map([[namespace,{library:model.defaults()}]]);
    const controller=new AbortController();let host,revoked=false,writes=0,blocker;
    const api={storage:{local:{
      async get(key){return {[key]:structuredClone(rows.get(key))};},
      async set(values){for(const [key,value] of Object.entries(values)){
        rows.set(key,structuredClone(value));if(key===namespace)writes++;
      }},async remove(key){rows.delete(key);}
    }}};
    const locks=testExclusiveLocks();
    const receiptLock='opendesk.sidebar-tools:prompt-ai-recovery';
    const toolLock='opendesk.sidebar-tools:tool:'+tool.id;
    const block=name=>locks.request(name,async()=>{held.resolve();await release.promise;});
    if(waitAt==='recovery'){blocker=block(receiptLock);await held.promise;}
    const dispatch=async(operation,payload,controls)=>{
      if(waitAt==='tool'&&operation==='storage.set'){
        blocker=block(toolLock);await held.promise;
      }
      const pending=locks.request(toolLock,()=>storageBranch(operation,payload,
        tool,frame,'queued',api,sidebarToolStorageKey,SIDEBAR_TOOL_DATA_LIMITS,
        ()=>true,()=>{},writeVerifiedLocalValue,async value=>hash(value),()=>{},controls?.beforeWrite));
      if(waitAt==='tool'&&operation==='storage.set')queued.resolve();
      return pending;
    };
    host=createTrustedPromptHost({api,tool,token:'queued',epoch:'epoch',model,
      lockManager:{request(name,...args){const pending=locks.request(name,...args);
        if(waitAt==='recovery')queued.resolve();return pending;}},
      assertIdentity:async()=>{},frameSource:()=>frame,dispatch,etagFor:async value=>hash(value),
      confirm:async()=>true,conversation:{source:()=>({provider:'fixture'}),cancel:async()=>{},
        request:async()=>({proposal:{action:{type:'create',body:'不得保存'}},
          authorization:{assertWrite:async()=>{if(revoked)throw fail('E_MODEL_GRANT_REVOKED');},release(){}}})},
      sendToFrame:message=>{if(message.kind==='ai-guard')queueMicrotask(()=>
        host.onGuardResponse({guardId:message.guardId,granted:true},frame));}});
    t.after(()=>{release.resolve();host.dispose();});
    const result=host.request({request:'创建',event:{isTrusted:true},signal:controller.signal})
      .then(value=>({value}),error=>({error}));
    await queued.promise;
    if(mode==='stop')controller.abort();else if(mode==='dispose')host.dispose();else revoked=true;
    release.resolve();await blocker;
    const outcome=await result;
    assert.equal(writes,0,'no effect may start after cancellation or revocation while waiting');
    assert.equal(outcome.error?.code,mode==='stop'?'E_CANCELLED':
      mode==='dispose'?'E_TOOL_CHANGED':'E_MODEL_GRANT_REVOKED');
    assert.equal(rows.has(PROMPT_AI_RECOVERY_KEY),false,'definitively unissued writes need no UNKNOWN receipt');
  });
}

test('R1.7 real pre-write total quota refusal leaves no false UNKNOWN and permits the next explicit write',async t=>{
  const f=fixture({quota:true});t.after(()=>f.host.dispose());
  await assert.rejects(f.run('创建中文翻译提示词'),{code:'E_TOOL_DATA_LIMIT'});
  assert.equal(f.attempts,1);assert.equal(f.writes,0);
  assert.deepEqual(f.rows.get(f.namespace),f.initial);
  const pending=await f.host.recovery();
  delete f.rows.get(f.namespace).filler3;
  let nextError;
  try{await f.run('新的显式请求');}catch(error){nextError=error;}
  assert.equal(pending,null,'definitive refusal must not leave a false recovery receipt; next error: '+nextError?.code);
  assert.equal(nextError,undefined);
  assert.equal(f.attempts,2);assert.equal(f.writes,1);
  assert.equal(f.rows.get(f.namespace).library.items.length,1);
  assert.equal(await f.host.recovery(),null);
});

test('R1.7 production item limit counts UTF-8: exactly 8192 bytes saves, 8193 rejects without mutation',async t=>{
  const f=fixture();t.after(()=>f.host.dispose());
  const value={body:'汉'.repeat(2700)};
  value.body+='x'.repeat(8192-bytes(value));
  assert.equal(bytes(value),8192);assert.ok(JSON.stringify(value).length<8192);
  await f.dispatch('storage.set',{key:'library',value,ifMatch:hash(f.initial.library)});
  await assert.rejects(f.dispatch('storage.set',{key:'library',value:{body:value.body+'x'},
    ifMatch:hash(value)}),{code:'E_TOOL_DATA_LIMIT'});
  assert.equal(f.writes,1);assert.deepEqual(f.rows.get(f.namespace).library,value);
});

test('R1.7 ETag refusal preserves the other writer and clears only the rejected intent',async t=>{
  const f=fixture({mode:'conflict'});t.after(()=>f.host.dispose());
  await assert.rejects(f.run('创建提示词'),{code:'E_STORAGE_CONFLICT'});
  assert.equal(f.writes,0);assert.equal(f.attempts,1);
  assert.equal(f.rows.get(f.namespace).library.items[0].body,'另一窗口写入');
  assert.equal(await f.host.recovery(),null);
});

test('R1.7 applied write with lost ACK and readback retains UNKNOWN, blocks new writes and reconciles without replay',async t=>{
  const f=fixture({mode:'ack-lost'});t.after(()=>f.host.dispose());
  await assert.rejects(f.run('已写入但回执丢失'),{code:'E_OUTCOME_UNKNOWN',writeIssued:true});
  const pending=await f.host.recovery();assert.ok(pending);
  assert.equal(f.writes,1);assert.equal(f.attempts,1);
  f.restoreReads();
  await assert.rejects(f.run('禁止覆盖未知结果'),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(await f.host.recovery(),pending);
  assert.equal(f.attempts,1);assert.equal(f.writes,1);
  assert.equal((await f.host.reconcile()).status,'applied');
  assert.equal(await f.host.recovery(),null);
  assert.equal(f.attempts,1);assert.equal(f.writes,1);
});

// Pause a real storage.remove after its preceding receipt read. Without the
// shared Web Lock, another Host can reconcile that old intent and persist a
// new UNKNOWN before the paused old remove resumes and erases it.
for(const phase of ['quota','conflict','notify','reconcile']){
  test('R1.7 '+phase+' cleanup cannot erase a newer Host UNKNOWN receipt',async t=>{
    const tool={id:'prompt-shortcuts',version:'1.1.14'};
    const namespace=sidebarToolStorageKey(tool.id),rows=new Map();
    const initial={library:model.defaults()};
    if(phase==='quota'){
      for(let i=0;i<4;i++)initial['filler'+i]='x'.repeat(8000);
      initial.filler3+='x'.repeat(32768-bytes(initial));
    }
    rows.set(namespace,initial);
    let resumeRemove,removeReached,paused=false,writes=0;
    const reached=new Promise(resolve=>{removeReached=resolve;});
    const pause=new Promise(resolve=>{resumeRemove=resolve;});
    const api={storage:{local:{
      async get(key){return {[key]:structuredClone(rows.get(key))};},
      async set(values){for(const [key,value] of Object.entries(values)){
        rows.set(key,structuredClone(value));if(key===namespace)writes++;
      }},
      async remove(key){
        if(key===PROMPT_AI_RECOVERY_KEY&&!paused){
          paused=true;removeReached();await pause;
        }
        rows.delete(key);
      }
    }}};
    const locks=testExclusiveLocks();
    const makeHost=(token,isNew=false)=>{
      const frame={};let host,lost=false;
      const dispatch=async(operation,payload)=>{
        if(lost&&operation==='storage.get')throw fail('E_ACK_LOST');
        if(!isNew&&phase==='conflict'&&operation==='storage.set')
          rows.get(namespace).library={...model.defaults(),items:[model.draft({body:'并发写入'})]};
        const result=await storageBranch(operation,payload,tool,frame,token,api,
          sidebarToolStorageKey,SIDEBAR_TOOL_DATA_LIMITS,()=>true,()=>{},
          writeVerifiedLocalValue,async value=>hash(value),()=>{});
        if(isNew&&operation==='storage.set'){lost=true;throw fail('E_ACK_LOST');}
        return result;
      };
      host=createTrustedPromptHost({api,tool,token,epoch:token,model,
        lockManager:locks,assertIdentity:async()=>{},frameSource:()=>frame,dispatch,
        etagFor:async value=>hash(value),confirm:async()=>true,
        conversation:{source:()=>({provider:'fixture'}),cancel:async()=>{},
          request:async({request})=>({proposal:{action:{type:'create',body:request}},
            authorization:{assertWrite:async()=>{},release(){}}})},
        sendToFrame:message=>{if(message.kind==='ai-guard')queueMicrotask(()=>
          host.onGuardResponse({guardId:message.guardId,granted:true},frame));}});
      t.after(()=>host.dispose());return host;
    };
    const old=makeHost('old'),next=makeHost('new',true);
    if(phase==='reconcile')rows.set(PROMPT_AI_RECOVERY_KEY,{
      toolId:tool.id,instance:'retired',beforeEtag:hash(initial.library),
      expectedEtag:'a'.repeat(64),createdAt:1});
    const oldResult=(phase==='reconcile'?old.reconcile():old.request({
      request:'旧操作',event:{isTrusted:true}})).then(value=>({value}),error=>({error}));
    await reached;
    if(phase==='quota')delete rows.get(namespace).filler3;
    const newResult=(async()=>{
      await next.reconcile({acknowledgeEtag:hash(rows.get(namespace).library)});
      await assert.rejects(next.request({request:'新的未知写入',event:{isTrusted:true}}),
        {code:'E_OUTCOME_UNKNOWN',writeIssued:true});
    })();
    // Allow the unlocked implementation to complete the dangerous interleave.
    await new Promise(resolve=>setImmediate(resolve));
    resumeRemove();
    const previous=await oldResult;await newResult;
    if(['quota','conflict'].includes(phase))assert.equal(previous.error?.code,
      phase==='quota'?'E_TOOL_DATA_LIMIT':'E_STORAGE_CONFLICT');
    else assert.equal(previous.error,undefined);
    const receipt=await next.recovery();
    assert.equal(receipt?.instance,'new','late old cleanup erased the newer UNKNOWN');
    assert.equal(receipt.expectedEtag,hash(rows.get(namespace).library));
    assert.equal(writes,phase==='notify'?2:1,'reconciliation must never replay a write');
  });
}


test('R2.4 Prompt adapter owns ETag challenge, shared Dock does not',async()=>{
 const etag='c'.repeat(64),calls=[];
 const adapter=createPromptReconciliationAdapter(async options=>{
  calls.push(options);
  return calls.length===1?{verified:false,status:'uncertain',currentEtag:etag,
   message:'请核对原提示词列表'}:{verified:true,status:'acknowledged',
   message:'已确认，不曾重放写入'};
 });
 const first=await adapter.reconcile();
 assert.equal(first.verified,false);
 assert.equal(first.nextActionLabel,'我已检查当前列表，解除阻止');
 assert.deepEqual(calls,[{}]);
 const second=await adapter.reconcile();
 assert.equal(second.verified,true);
 assert.deepEqual(calls,[{},{acknowledgeEtag:etag}]);
 adapter.dispose();
 await assert.rejects(adapter.reconcile(),{code:'E_TOOL_CHANGED'});
 const dock=readFileSync(new URL('../../src/ui/react/components/conversation.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(dock,/unverifiedEtag|acknowledgeEtag|currentEtag/,
  'shared Frame cannot own Prompt storage or recovery challenge');
});

test('R2.4 changed library invalidates old review and forces a fresh read',async()=>{
 const first='a'.repeat(64),next='b'.repeat(64),calls=[];
 const adapter=createPromptReconciliationAdapter(async options=>{
  calls.push(options);
  if(calls.length===1)return {verified:false,status:'uncertain',currentEtag:first};
  if(calls.length===2)return {verified:false,status:'uncertain',currentEtag:next};
  if(calls.length===3)return {verified:false,status:'uncertain',currentEtag:next};
  return {verified:true,status:'acknowledged'};
 });
 await adapter.reconcile();
 const stale=await adapter.reconcile();
 assert.equal(stale.nextActionLabel,'重新读取提示词库并核对');
 const reread=await adapter.reconcile();
 assert.equal(reread.nextActionLabel,'我已检查当前列表，解除阻止');
 assert.equal((await adapter.reconcile()).verified,true);
 assert.deepEqual(calls,[{},{acknowledgeEtag:first},{},{acknowledgeEtag:next}]);
 adapter.dispose();
});

test('R2.4 pending recovery cannot acknowledge from retired tool instance',async()=>{
 let release;
 const inFlight=new Promise(resolve=>{release=resolve;});
 const adapter=createPromptReconciliationAdapter(()=>inFlight);
 const pending=adapter.reconcile();
 await assert.rejects(adapter.reconcile(),{code:'E_PROMPT_BUSY'});
 adapter.dispose();
 release({verified:false,status:'uncertain',currentEtag:'a'.repeat(64)});
 await assert.rejects(pending,{code:'E_TOOL_CHANGED'});
});
