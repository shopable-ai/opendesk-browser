import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {AI_ID,LEGACY_AI_ID,AI_STORE,LEGACY_AI_STORE,AI_ALARM,LEGACY_AI_ALARM,
  AI_PROTOCOL,AI_CAPABILITY,desiredAiProxy} from '../../src/ai-smart-access/policy.js';
import {EMPTY_AI_STATE,stopAiAccessForTool,cleanupUninstalledAiAccess}
  from '../../src/ai-smart-access/lifecycle.js';
import {createAiAccessService} from '../../src/ai-smart-access/service.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';

const endpoint={scheme:'socks5',host:'proxy.example.com',port:1080};
const secondEndpoint={...endpoint,host:'second.example.com'};
const provider={activateUrl:'https://license.example.com/api/activate',
  verifyUrl:'https://license.example.com/api/verify'};
const tool={format:'opendesk.sidebar-tool.v1',id:AI_ID,version:'1.0.0',
  title:'AI VIP Share',description:'fixture',capabilities:[AI_CAPABILITY],
  html:'<main>AI</main>',css:'',js:'void 0;'};
const origin='chrome-extension://'+'a'.repeat(32);
const sender={id:'a'.repeat(32),url:origin+'/ui/tool.html?hostInstanceId='+randomUUID(),
  documentId:'doc-1',frameId:0,documentLifecycle:'active'};
const keyFor=id=>id===AI_ID?AI_STORE:LEGACY_AI_STORE;
// Deterministic test-only implementation of the named, FIFO Web Locks contract.
// This fixture intentionally serializes cross-context requests and exposes
// pending owners for race assertions. It is NOT a production lock fallback.
function fixtureLocks(){
  const tails=new Map(),held=new Map(),pending=new Map();
  let serial=0;
  return Object.freeze({
    request(name,work){
      const id=++serial;
      const previous=tails.get(name)??Promise.resolve();
      let unlock;
      const gate=new Promise(resolve=>{unlock=resolve;});
      const tail=previous.catch(()=>{}).then(()=>gate);
      // A pending request must be observable before it acquires the lock.
      if(tails.has(name))pending.set(id,{name});
      tails.set(name,tail);
      return previous.catch(()=>{}).then(async()=>{
        pending.delete(id);
        held.set(id,{name});
        try{return await work({name,mode:'exclusive'});}
        finally{
          held.delete(id);
          unlock();
          if(tails.get(name)===tail)tails.delete(name);
        }
      });
    },
    async query(){
      return {held:[...held.values()],pending:[...pending.values()]};
    }
  });
}
function active({endpoint:target=endpoint,owner,desired=true,releasePending=false}={}){
  return {...EMPTY_AI_STATE,desired,releasePending,deviceId:randomUUID(),
    lease:{leaseId:'lease-verified-123',expiresAt:Date.now()+3600000,endpoint:target},
    ...(owner?{proxyOwner:owner}:{})};
}
async function fixture(){
  const packageHash=await sidebarToolPackageHash(tool);
  const owner={toolId:AI_ID,packageHash,installEpoch:'epoch-1'};
  const local={[SIDEBAR_TOOL_STORE]:[tool],
    [SIDEBAR_TOOL_ENABLE_STORE]:{[AI_ID]:true},
    [TOOL_REVOCATION_EPOCHS_STORE]:{[AI_ID]:'epoch-1'}};
  const effects={clear:[],set:[],alarms:[],removed:[],fetch:[],storage:[]};
  const faults={permission:true};
  const locks=fixtureLocks();
  let value=null,level='controllable_by_this_extension';
  const api={
    runtime:{id:sender.id,getURL:path=>origin+'/'+path,
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
        documentId:sender.documentId,frameId:0,incognito:false}]},
    storage:{local:{
      get:async keys=>{
        if(faults.storageRead)throw Error('storage read failed');
        return Object.fromEntries((Array.isArray(keys)?keys:[keys])
          .filter(key=>Object.hasOwn(local,key)).map(key=>[key,structuredClone(local[key])]));
      },
      set:async rows=>{
        if(faults.storageWrite)throw Error('storage write failed');
        effects.storage.push(structuredClone(rows));
        Object.assign(local,structuredClone(rows));
        if(faults.storageAck)throw Error('storage acknowledgement lost');
      }
    }},
    permissions:{contains:async()=>faults.permission},
    proxy:{settings:{
      get:async()=>{
        if(faults.proxyRead||faults.afterClearRead&&effects.clear.length)throw Error('proxy read failed');
        return {value:structuredClone(value),levelOfControl:level};
      },
      set:async row=>{
        effects.set.push(structuredClone(row));value=structuredClone(row.value);
        level='controlled_by_this_extension';
        if(faults.setAck)throw Error('set acknowledgement lost');
      },
      clear:async row=>{
        effects.clear.push(row);
        if(faults.clearBefore)throw Error('clear failed');
        value=null;level='controllable_by_this_extension';
        if(faults.revealOther){value={mode:'fixed_servers',rules:{singleProxy:endpoint}};
          level='controlled_by_other_extensions';}
        if(faults.clearAck)throw Error('clear acknowledgement lost');
      }
    }},
    alarms:{create:async(...args)=>effects.alarms.push(['create',...args]),
      clear:async name=>{effects.alarms.push(['clear',name]);return true;}}
  };
  const fetcher=async(url,options)=>{
    effects.fetch.push(url);
    if(url.endsWith('/activate')&&faults.activateGate){
      faults.activateEnter();await faults.activateGate;
    }
    if(url.endsWith('/verify')&&faults.verifyGate){
      faults.verifyEnter();await faults.verifyGate;
    }
    const lease={leaseId:'lease-verified-123',expiresAt:Date.now()+3600000,
      endpoint:faults.verifiedEndpoint||endpoint};
    return new Response(JSON.stringify(url.endsWith('/activate')?lease:{active:!faults.revoked,lease}));
  };
  const svc=createAiAccessService({api,provider,fetcher,
    lockManager:locks});
  return {api,svc,owner,local,effects,faults,locks,fetcher,
    stop:id=>stopAiAccessForTool(api,id,{lockManager:locks}),
    cleanup:id=>cleanupUninstalledAiAccess(api,id,async(_api,key)=>{
      effects.removed.push(key);delete local[key];
    },{lockManager:locks}),
    use:(state)=>{value=desiredAiProxy(state.lease.endpoint,state.proxyOwner);
      level='controlled_by_this_extension';},
    foreign:()=>{value={mode:'pac_script',pacScript:{data:'function FindProxyForURL(){return "HTTPS other.example.com:443";}',mandatory:true}};
      level='controlled_by_this_extension';},
    level:next=>{level=next;},
    snapshot:()=>structuredClone({value,level}),
    remove:async(_api,key)=>{effects.removed.push(key);delete local[key];},
    rpc:(operation,payload={})=>svc.dispatch({protocol:AI_PROTOCOL,toolId:AI_ID,
      operation,payload,packageHash,installEpoch:'epoch-1'},sender)};
}

test('R2.1 wake preserves active legacy PAC with new ID absent or merely activated',async()=>{
  for(const newState of [undefined,active({desired:false})]){
    const h=await fixture(),old=active();
    h.local[LEGACY_AI_STORE]=old;h.use(old);
    if(newState)h.local[AI_STORE]=newState;
    const before=h.snapshot();
    await h.svc.reconcile();
    assert.deepEqual(h.snapshot(),before);
    assert.equal(h.effects.clear.length,0);
    assert.deepEqual(h.local[LEGACY_AI_STORE],old);
    assert.deepEqual(h.local[AI_STORE],newState);
    const status=await h.rpc('aiAccess.status');
    assert.equal(status.state,'conflict');assert.equal(status.canStop,false);
    assert.match(status.reason,/旧|迁移/);
    await assert.rejects(h.rpc('aiAccess.enable'));
    assert.equal(h.effects.set.length,0);
  }
});

test('R5.3 accepted STOP cancels an in-flight verify before any proxy apply',async()=>{
  const h=await fixture();
  h.local[AI_STORE]=active({owner:h.owner,desired:false});
  let entered,release;
  const waiting=new Promise(resolve=>{entered=resolve;});
  h.faults.verifyEnter=entered;
  h.faults.verifyGate=new Promise(resolve=>{release=resolve;});
  const enabling=h.rpc('aiAccess.enable');
  const rejected=assert.rejects(enabling,{code:'E_AI_STOPPED'});
  await waiting;
  const stopping=h.rpc('aiAccess.disable');
  // Allow sender/package verification to accept STOP while verify is blocked.
  await setImmediate();await setImmediate();
  release();await rejected;await stopping;
  assert.equal(h.effects.set.length,0);
  assert.equal(h.local[AI_STORE].desired,false);
  assert.equal(h.local[AI_STORE].releasePending,false);
});

test('R5.3 accepted STOP cancels late activation without storing a lease',async()=>{
  const h=await fixture();let entered,release;
  const waiting=new Promise(resolve=>{entered=resolve;});
  h.faults.activateEnter=entered;
  h.faults.activateGate=new Promise(resolve=>{release=resolve;});
  const activating=h.rpc('aiAccess.activate',{code:'TEST-CODE'});
  const rejected=assert.rejects(activating,{code:'E_AI_STOPPED'});
  await waiting;
  const stopping=h.rpc('aiAccess.disable');
  await setImmediate();await setImmediate();release();
  await rejected;await stopping;
  assert.equal(h.local[AI_STORE],undefined,'Cancelled activation creates no receipt');
  assert.equal(h.effects.set.length,0);
});

test('R5.3 STOP settles when clear reveals another extension without touching it',async()=>{
  const h=await fixture(),state=active({owner:h.owner});
  h.local[AI_STORE]=state;h.use(state);h.faults.revealOther=true;
  await h.rpc('aiAccess.disable');
  assert.equal(h.effects.clear.length,1);
  assert.equal(h.snapshot().level,'controlled_by_other_extensions');
  assert.equal(h.local[AI_STORE].releasePending,false);
  assert.equal(h.local[AI_STORE].desired,false);
  assert.deepEqual(h.local[AI_STORE].lease,state.lease);
});

test('R2.1 explicit legacy STOP and uninstall release proven old PAC before deleting evidence',async()=>{
  for(const uninstall of [false,true]){
    const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
    if(uninstall)await h.cleanup(LEGACY_AI_ID);
    else await h.stop(LEGACY_AI_ID);
    assert.equal(h.effects.clear.length,1);
    assert(h.effects.alarms.some(row=>row[0]==='clear'&&row[1]===LEGACY_AI_ALARM));
    if(uninstall)assert.equal(h.local[LEGACY_AI_STORE],undefined);
    else assert.equal(h.local[LEGACY_AI_STORE].releasePending,false);
    assert.equal(h.local[AI_STORE],undefined);
  }
});

test('R2.1 old STOP/uninstall cannot clear new owned PAC even on the same endpoint',async()=>{
  for(const uninstall of [false,true]){
    const h=await fixture();h.local[LEGACY_AI_STORE]=active();
    const current=active({owner:h.owner});h.local[AI_STORE]=current;h.use(current);
    const before=h.snapshot();
    if(uninstall)await h.cleanup(LEGACY_AI_ID);
    else await h.stop(LEGACY_AI_ID);
    assert.deepEqual(h.snapshot(),before);
    assert.deepEqual(h.local[AI_STORE],current);
    assert.equal(h.effects.clear.length,0);
    assert(!h.effects.alarms.some(row=>row[0]==='clear'&&row[1]===AI_ALARM));
  }
});

test('R2.1 shared non-AI extension PAC and missing owner evidence prevent cleanup',async()=>{
  for(const id of [AI_ID,LEGACY_AI_ID])for(const missing of [false,true]){
    const h=await fixture();if(!missing)h.local[keyFor(id)]=active();h.foreign();
    const before=h.snapshot();
    await assert.rejects(h.cleanup(id));
    assert.equal(h.effects.clear.length,0);assert.deepEqual(h.effects.removed,[]);
    assert.deepEqual(h.snapshot(),before);
    assert.equal(h.local[keyFor(id)].releasePending,true);
  }
});

test('R2.1 duplicate unmarked ownership and corrupt peer state fail closed',async()=>{
  for(const peer of [active(),{schema:99}]){
    const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;
    h.local[AI_STORE]=peer;h.use(old);
    await assert.rejects(h.cleanup(LEGACY_AI_ID));
    assert.equal(h.effects.clear.length,0);assert.deepEqual(h.effects.removed,[]);
    assert.equal(h.local[LEGACY_AI_STORE].releasePending,true);
    assert.deepEqual(h.local[AI_STORE],peer);
  }
});

test('R2.1 pending legacy release is retried on wake without touching new identity',async()=>{
  const h=await fixture(),old=active({desired:false,releasePending:true});
  h.local[LEGACY_AI_STORE]=old;h.use(old);
  await h.svc.reconcile();
  assert.equal(h.effects.clear.length,1);
  assert.equal(h.local[LEGACY_AI_STORE].releasePending,false);
  assert.equal(h.local[AI_STORE],undefined);
});

test('R2.1 failed explicit legacy STOP schedules recovery even without an earlier alarm',async()=>{
  const h=await fixture(),old=active();
  h.local[LEGACY_AI_STORE]=old;h.use(old);h.faults.clearBefore=true;
  await assert.rejects(h.stop(LEGACY_AI_ID));
  assert.equal(h.local[LEGACY_AI_STORE].releasePending,true);
  assert(h.effects.alarms.some(([operation,name,options])=>
    operation==='create'&&name===LEGACY_AI_ALARM&&options.periodInMinutes===1));
  h.faults.clearBefore=false;
  await h.svc.reconcile();
  assert.equal(h.local[LEGACY_AI_STORE].releasePending,false);
  assert.equal(h.effects.clear.length,2);
  assert(h.effects.alarms.some(([operation,name])=>operation==='clear'&&name===LEGACY_AI_ALARM));
});

test('R2.1 unavailable permissions, ownership read or hidden control keep retry evidence',async()=>{
  for(const fault of ['permission','proxyRead','clearBefore','masked','unknown']){
    const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
    if(fault==='permission')h.faults.permission=false;
    else if(fault==='masked')h.level('controlled_by_other_extensions');
    else if(fault==='unknown')h.level('unexpected');
    else h.faults[fault]=true;
    await assert.rejects(h.cleanup(LEGACY_AI_ID));
    assert.equal(h.local[LEGACY_AI_STORE].releasePending,true,fault);
    assert.deepEqual(h.local[LEGACY_AI_STORE].lease,old.lease);
    assert.deepEqual(h.effects.removed,[]);
    assert.equal(h.effects.clear.length,fault==='clearBefore'?1:0);
    h.faults.permission=true;h.faults.proxyRead=false;h.faults.clearBefore=false;
    h.level('controlled_by_this_extension');
    await h.svc.reconcile();
    assert.equal(h.local[LEGACY_AI_STORE].releasePending,false);
  }
});

test('R2.1 storage failure precedes effects; lost storage acknowledgement uses verified readback',async()=>{
  for(const fault of ['storageRead','storageWrite','storageAck']){
    const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
    h.faults[fault]=true;
    const stop=h.stop(LEGACY_AI_ID);
    if(fault==='storageAck')await stop;
    else await assert.rejects(stop);
    assert.equal(h.effects.clear.length,fault==='storageAck'?1:0);
    if(fault!=='storageAck')assert.deepEqual(h.local[LEGACY_AI_STORE],old);
  }
});

test('R2.1 lost native clear acknowledgement/readback preserves lease until retry',async()=>{
  for(const fault of ['clearAck','afterClearRead']){
    const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
    h.faults[fault]=true;
    await assert.rejects(h.cleanup(LEGACY_AI_ID));
    assert.equal(h.local[LEGACY_AI_STORE].releasePending,true);
    assert.deepEqual(h.local[LEGACY_AI_STORE].lease,old.lease);
    assert.equal(h.effects.clear.length,1);assert.deepEqual(h.effects.removed,[]);
    h.faults[fault]=false;
    await h.cleanup(LEGACY_AI_ID);
    assert.equal(h.effects.clear.length,1,'confirmed prior release must not be replayed');
    assert.equal(h.local[LEGACY_AI_STORE],undefined);
  }
});

test('R2.1 new installation cannot resume prior install activation or overwrite foreign PAC',async()=>{
  const h=await fixture();
  await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
  const activated=structuredClone(h.local[AI_STORE]);
  assert.deepEqual(activated.proxyOwner,h.owner);
  h.local[TOOL_REVOCATION_EPOCHS_STORE][AI_ID]='epoch-2';
  await h.svc.reconcile();
  assert.equal(h.effects.set.length,0);
  assert.notEqual((await h.svc.status()).state,'enabled');
  h.local[TOOL_REVOCATION_EPOCHS_STORE][AI_ID]='epoch-1';h.foreign();
  await assert.rejects(h.rpc('aiAccess.enable'));
  assert.equal(h.effects.set.length,0);assert.equal(h.effects.clear.length,0);
});

test('R2.1 interrupted apply preserves PAC until explicit STOP, without altering legacy data',async()=>{
  const h=await fixture();await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
  h.local[LEGACY_AI_STORE]=active({desired:false,endpoint:secondEndpoint});
  const old=structuredClone(h.local[LEGACY_AI_STORE]);
  h.faults.setAck=true;h.faults.clearBefore=true;
  await assert.rejects(h.rpc('aiAccess.enable'));
  assert.equal(h.local[AI_STORE].releasePending,true);
  h.faults.setAck=false;h.faults.clearBefore=false;
  await h.svc.reconcile();
  assert.equal(h.local[AI_STORE].releasePending,true);
  assert.equal(h.effects.clear.length,0);
  await h.stop(AI_ID);
  assert.equal(h.local[AI_STORE].releasePending,false);
  assert.deepEqual(h.local[LEGACY_AI_STORE],old);
});

test('R2.1 expiry, revoked authorization, missing provider and permission never auto-clear active PAC',async()=>{
  for(const fault of ['expired','revoked','provider','permission']){
    const h=await fixture();await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
    await h.rpc('aiAccess.enable');
    if(fault==='expired')h.local[AI_STORE].lease.expiresAt=Date.now()-1000;
    else if(fault==='permission')h.faults.permission=false;
    else if(fault==='revoked')h.faults.revoked=true;
    const original=structuredClone(h.local[AI_STORE]),before=h.snapshot();
    const svc=fault==='provider'?createAiAccessService({api:h.api,lockManager:h.locks,
      provider:{activateUrl:null,verifyUrl:null}}):h.svc;
    await svc.reconcile();
    assert.equal(h.effects.clear.length,0,fault);assert.deepEqual(h.snapshot(),before);
    assert.deepEqual(h.local[AI_STORE],original);
    assert.notEqual((await svc.status()).state,'enabled');
    h.faults.permission=true;
    await h.stop(AI_ID);
    assert.equal(h.effects.clear.length,1,'explicit STOP still releases expired/revoked PAC');
  }
});

test('R2.1 lost receipt and installation replacement cannot adopt or clear existing PAC',async()=>{
  for(const fault of ['receipt','epoch','package']){
    const h=await fixture();await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
    await h.rpc('aiAccess.enable');
    if(fault==='receipt')delete h.local[AI_STORE].proxyOwner;
    if(fault==='epoch')h.local[TOOL_REVOCATION_EPOCHS_STORE][AI_ID]='epoch-2';
    if(fault==='package')h.local[SIDEBAR_TOOL_STORE][0]={...tool,js:'void 1;'};
    const before=h.snapshot(),sets=h.effects.set.length;
    await h.svc.reconcile();
    assert.notEqual((await h.svc.status()).state,'enabled');
    assert.deepEqual(h.snapshot(),before);assert.equal(h.effects.set.length,sets);
    assert.equal(h.effects.clear.length,0);
    if(fault==='receipt'){
      await assert.rejects(h.stop(AI_ID));
      assert.equal(h.local[AI_STORE].releasePending,true);
      assert.equal(h.effects.clear.length,0);
    }
  }
});

test('R2.1 without a global Web Lock even explicit STOP must fail before effects',async()=>{
  const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
  await assert.rejects(stopAiAccessForTool(h.api,LEGACY_AI_ID,{lockManager:null}),
    error=>error.code==='E_TOOL_LOCK');
  assert.deepEqual(h.local[LEGACY_AI_STORE],old);assert.equal(h.effects.clear.length,0);
});

test('R2.1 separate UI/SW API objects serialize proof and clear on the same Web Lock',async()=>{
  const h=await fixture();
  await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
  let verifyEnter,verifyProceed;
  const verifying=new Promise(resolve=>{verifyEnter=resolve;});
  h.faults.verifyGate=new Promise(resolve=>{verifyProceed=resolve;});
  h.faults.verifyEnter=verifyEnter;
  // New enable passed preflight; its provider request is still in flight when
  // the legacy installation acquires the proxy and the user explicitly stops it.
  const enabling=h.rpc('aiAccess.enable');await verifying;
  const old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
  const originalClear=h.api.proxy.settings.clear;
  let enter,proceed;
  const entered=new Promise(resolve=>{enter=resolve;});
  const gate=new Promise(resolve=>{proceed=resolve;});
  // Different API objects represent the UI installation world and the SW.
  // Pause native clear after proof; SW set must wait on the real Web Lock.
  const uiApi={...h.api,proxy:{settings:{...h.api.proxy.settings,clear:async row=>{
    enter();await gate;return originalClear(row);
  }}}};
  const stopping=stopAiAccessForTool(uiApi,LEGACY_AI_ID,{lockManager:h.locks});
  await entered;
  verifyProceed();
  let waiting=false;
  for(let turn=0;turn<30&&!waiting;turn++){
    waiting=(await h.locks.query()).pending.some(row=>row.name==='opendesk.ai-access:proxy');
    if(!waiting)await setImmediate();
  }
  assert(waiting,'the new apply must actually contend for the global native lock');
  assert.equal(h.effects.set.length,0,'SW mutation must wait for the UI proof/clear transaction');
  proceed();
  await stopping;await enabling;
  assert.equal(h.effects.clear.length,1);assert.equal(h.effects.set.length,1);
  assert.equal((await h.svc.status()).state,'enabled');
  assert.deepEqual(h.snapshot().value,desiredAiProxy(endpoint,h.owner));
  await h.stop(LEGACY_AI_ID);
  assert.equal(h.effects.clear.length,1,'later legacy STOP cannot clear the new PAC');
});

async function waitForPendingLock(locks,name){
  // Installation digest verification is asynchronous on a busy CI runner.
  // Still require real lock queue contention, bounded at 1.5 seconds.
  for(let turn=0;turn<150;turn++){
    if((await locks.query()).pending.some(row=>row.name===name))return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('request did not queue on '+name);
}

test('R2.1 race: a validated old disable queued on the tool lock cannot stop a replacement installation',async()=>{
  for(const change of ['epoch','package']){
    const h=await fixture();await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});
    await h.rpc('aiAccess.enable');
    let enter,proceed;
    const entered=new Promise(resolve=>{enter=resolve;});
    const gate=new Promise(resolve=>{proceed=resolve;});
    const name='opendesk.sidebar-tools:tool:'+AI_ID;
    const installation=h.locks.request(name,async()=>{enter();await gate;});
    await entered;
    const stale=h.rpc('aiAccess.disable');stale.catch(()=>{});
    try{
      await waitForPendingLock(h.locks,name);
      const replacement=change==='package'?{...tool,js:'void 2;'}:tool;
      const epoch=change==='epoch'?'epoch-2':'epoch-1';
      const owner={toolId:AI_ID,installEpoch:epoch,
        packageHash:await sidebarToolPackageHash(replacement)};
      h.local[SIDEBAR_TOOL_STORE]=[replacement];
      h.local[TOOL_REVOCATION_EPOCHS_STORE][AI_ID]=epoch;
      const current=active({owner});h.local[AI_STORE]=current;h.use(current);
      const before=h.snapshot(),effects=structuredClone(h.effects);
      proceed();await installation;
      await assert.rejects(stale,error=>error.code==='E_TOOL_CHANGED');
      assert.deepEqual(h.local[AI_STORE],current,change);
      assert.deepEqual(h.snapshot(),before,change);
      assert.deepEqual(h.effects,effects,'stale disable must have no mutation effects');
    }finally{proceed();await installation;await stale.catch(()=>{});}
  }
});

test('R2.1 race: queued legacy recovery cannot resurrect state after verified uninstall deletion',async()=>{
  const h=await fixture(),old=active();h.local[LEGACY_AI_STORE]=old;h.use(old);
  let clearEnter,clearProceed,deleted;
  const entered=new Promise(resolve=>{clearEnter=resolve;});
  const clearGate=new Promise(resolve=>{clearProceed=resolve;});
  const deletion=new Promise(resolve=>{deleted=resolve;});
  const originalGet=h.api.storage.local.get,originalClear=h.api.proxy.settings.clear;
  // A separate UI API object uses the original storage reader. The worker's
  // queued STOP reader is delayed until uninstall has verified absence.
  const uiApi={...h.api,storage:{local:{...h.api.storage.local}},
    proxy:{settings:{...h.api.proxy.settings,clear:async row=>{
      clearEnter();await clearGate;return originalClear(row);
    }}}};
  h.api.storage.local.get=async keys=>{
    if(keys===LEGACY_AI_STORE)await deletion;
    return originalGet(keys);
  };
  let afterDeletion;
  const cleanup=cleanupUninstalledAiAccess(uiApi,LEGACY_AI_ID,async(api,key)=>{
    await h.remove(api,key);
    assert.equal((await originalGet(key))[key],undefined);
    afterDeletion=structuredClone(h.effects);deleted();
  },{lockManager:h.locks});
  await entered;
  const recovery=h.svc.reconcile();recovery.catch(()=>{});
  try{
    await waitForPendingLock(h.locks,'opendesk.ai-access:proxy');
    clearProceed();await cleanup;await recovery;
    assert.equal(h.local[LEGACY_AI_STORE],undefined);
    assert.deepEqual(h.effects,afterDeletion,
      'stale recovery must not write state, arm alarms, or touch the native preference');
  }finally{clearProceed();deleted();await cleanup;await recovery.catch(()=>{});}
});

test('R2.1 request guards reject identity or document changes after proxy/network waits',async()=>{
  for(const stage of ['proxy','activation'])for(const change of ['document','epoch']){
    const h=await fixture();
    let enter,proceed;
    const entered=new Promise(resolve=>{enter=resolve;});
    const gate=new Promise(resolve=>{proceed=resolve;});
    let held=Promise.resolve(),request;
    if(stage==='proxy'){
      await h.rpc('aiAccess.activate',{code:'GOOD-CODE'});await h.rpc('aiAccess.enable');
      held=h.locks.request('opendesk.ai-access:proxy',async()=>{enter();await gate;});
      await entered;
      request=h.rpc('aiAccess.disable');request.catch(()=>{});
      await waitForPendingLock(h.locks,'opendesk.ai-access:proxy');
    }else{
      h.faults.activateEnter=enter;h.faults.activateGate=gate;
      request=h.rpc('aiAccess.activate',{code:'GOOD-CODE'});request.catch(()=>{});
      await entered;
    }
    try{
      const before=structuredClone(h.local),effects=structuredClone(h.effects),native=h.snapshot();
      if(change==='document')h.api.runtime.getContexts=async()=>[];
      else h.local[TOOL_REVOCATION_EPOCHS_STORE][AI_ID]='epoch-replaced';
      // Expected identity drift is an external event, not an RPC mutation.
      before[TOOL_REVOCATION_EPOCHS_STORE]=structuredClone(h.local[TOOL_REVOCATION_EPOCHS_STORE]);
      proceed();await held;
      await assert.rejects(request,error=>error.code===(change==='document'?'E_AI_SENDER':'E_TOOL_CHANGED'));
      assert.deepEqual(h.local,before,stage+' '+change);
      assert.deepEqual(h.effects,effects,'invalid request must not produce effects after its wait');
      assert.deepEqual(h.snapshot(),native);
    }finally{proceed();await held;await request.catch(()=>{});}
  }
});
