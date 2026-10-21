import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRunnerLifecycle} from '../../src/cloud-control/runner-lifecycle.js';
import {RUN_ADMISSION_LOCK,withRunAdmissionLock} from '../../src/platform/host/run-admission-lock.js';

const path='cloud-control/runner.html';
const url='chrome-extension://fixture/'+path;
function webLocks(){
  let queue=Promise.resolve();
  return {request(name,options,operation){
    assert.equal(name,'opendesk.run-admission.v1');
    assert.deepEqual(options,{mode:'exclusive'});
    const pending=queue.then(()=>operation({name,mode:'exclusive'}));
    queue=pending.catch(()=>{});
    return pending;
  }};
}
function fixture({locks=webLocks()}={}){
  const calls=[],state={enabled:false,slot:null,contexts:[],read:undefined,gate:undefined};
  const api={runtime:{
    getURL:name=>'chrome-extension://fixture/'+name,
    getContexts:async filters=>{
      calls.push('contexts');
      assert.deepEqual(filters,{contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});
      if(state.gate)await state.gate;
      return structuredClone(state.contexts);
    }
  },offscreen:{
    createDocument:async options=>{
      calls.push('create');
      assert.deepEqual(options,{url:path,reasons:['WORKERS'],
        justification:'Execute approved Tasks and installed app services through the shared RunHost'});
      state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url,documentId:'original'}];
    },
    closeDocument:async()=>{
      calls.push('close');
      assert.equal(state.contexts.length,1,'Close only our one native document');
      state.contexts=[];
    }
  }};
  const broker={authority:{cloud:{read:async()=>state.read?state.read():{enabled:state.enabled}}},
    storage:{transaction:async(stores,mode,callback)=>{
      calls.push('slot');
      assert.deepEqual(stores,['runs']);assert.equal(mode,'readonly');
      return callback({get:async(store,key)=>{
        assert.equal(store,'runs');assert.equal(key,'@slot');
        return state.slot;
      }});
    }}};
  return {state,calls,broker,api,locks,lifecycle:createCloudRunnerLifecycle({api,locks})};
}
test('enabled cloud creates only its fixed original Offscreen document',async()=>{
  const f=fixture();f.state.enabled=true;
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'created'});
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'ready'});
  assert.equal(f.calls.filter(x=>x==='create').length,1);
  assert.equal(f.calls.filter(x=>x==='close').length,0);
});
test('STOP retains Offscreen while durable Run still owns @slot, then retires after release',async()=>{
  const f=fixture();f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url,documentId:'original'}];
  f.state.slot={currentRunId:'run-pending',preview:false};
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'retained-pending'});
  assert.equal(f.calls.includes('close'),false);
  f.state.slot={currentRunId:null,preview:false};
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'closed'});
  assert.equal(f.calls.filter(x=>x==='close').length,1);
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'absent'});
});
test('STOP retains Offscreen if the shared native preview slot is busy',async()=>{
  const f=fixture();f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url}];f.state.slot={preview:true};
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'retained-pending'});
  assert.equal(f.calls.includes('close'),false);
});
test('do not close if approval is restored during the durable slot check',async()=>{
  const f=fixture();f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url}];
  let reads=0;f.state.read=()=>({enabled:++reads===2});
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'ready'});
  assert.equal(f.calls.includes('close'),false);
});
test('serialized STOP and subsequent APPROVE do not lose the newer desired state',async()=>{
  const f=fixture();f.state.enabled=true;
  let release;f.state.gate=new Promise(resolve=>{release=resolve;});
  const start=f.lifecycle.reconcile(f.broker);
  const second=f.lifecycle.reconcile(f.broker);
  release();await Promise.all([start,second]);
  assert.equal(f.calls.filter(x=>x==='create').length,1);
  assert.equal(f.calls.includes('close'),false);
});
test('reject a mismatching native Offscreen context instead of closing another owner',async()=>{
  const f=fixture();f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:'chrome-extension://fixture/another.html'}];
  await assert.rejects(f.lifecycle.reconcile(f.broker),/E_CLOUD_RUNNER_CONTEXT/);
  assert.equal(f.calls.includes('close'),false);
});

test('idle-check-close excludes new admission through approval recheck and native close completion',{timeout:3000},async()=>{
  const f=fixture(),checking=Promise.withResolvers(),recheck=Promise.withResolvers();
  const closingNative=Promise.withResolvers(),finishClose=Promise.withResolvers();
  f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url}];
  let reads=0;
  f.state.read=async()=>{
    if(++reads===2){checking.resolve();await recheck.promise;}
    return {enabled:false};
  };
  const close=f.api.offscreen.closeDocument;
  f.api.offscreen.closeDocument=async()=>{closingNative.resolve();await finishClose.promise;return close();};
  const closing=f.lifecycle.reconcile(f.broker);
  await checking.promise;
  const admission=withRunAdmissionLock(()=>{
    f.calls.push('admit');f.state.slot={currentRunId:'new-worker'};
  },{locks:f.locks});
  try{
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.includes('admit'),false,'Admission cannot enter after the empty slot snapshot');
    recheck.resolve();await closingNative.promise;
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.includes('admit'),false,'Lock remains held until closeDocument settles');
  }finally{recheck.resolve();finishClose.resolve();}
  assert.deepEqual(await closing,{state:'closed'});
  await admission;
  assert.deepEqual(f.calls.filter(name=>['slot','close','admit'].includes(name)),['slot','close','admit']);
  assert.equal(f.state.slot.currentRunId,'new-worker');
});

test('admission holding the shared lock completes before lifecycle reads the durable slot',{timeout:3000},async()=>{
  const f=fixture(),entered=Promise.withResolvers(),finishAdmission=Promise.withResolvers();
  f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url}];
  const admission=withRunAdmissionLock(async()=>{
    entered.resolve();await finishAdmission.promise;
    f.state.slot={currentRunId:'admitted-worker'};
  },{locks:f.locks});
  await entered.promise;
  const closing=f.lifecycle.reconcile(f.broker);
  try{
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.includes('slot'),false,'Even the idle slot read must wait for admission');
    assert.equal(f.calls.includes('close'),false);
  }finally{finishAdmission.resolve();}
  await admission;
  assert.deepEqual(await closing,{state:'retained-pending'});
  assert.equal(f.calls.includes('close'),false);
});

test('a failed native close releases the shared admission lock',{timeout:3000},async()=>{
  const f=fixture();f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url}];
  f.api.offscreen.closeDocument=async()=>{throw Error('native close failed');};
  await assert.rejects(f.lifecycle.reconcile(f.broker),/native close failed/);
  await withRunAdmissionLock(()=>{f.state.slot={currentRunId:'next-worker'};},{locks:f.locks});
  assert.deepEqual(await f.lifecycle.reconcile(f.broker),{state:'retained-pending'});
});

test('missing Web Locks cannot close Offscreen; bypass requires an explicit mock opt-in',async()=>{
  const f=fixture({locks:null});f.state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:url}];
  assert.equal(RUN_ADMISSION_LOCK,'opendesk.run-admission.v1');
  await assert.rejects(f.lifecycle.reconcile(f.broker),{code:'E_RUN_ADMISSION_LOCK'});
  assert.equal(f.calls.includes('slot'),false);
  assert.equal(f.calls.includes('close'),false);
  let entered=false;
  await assert.rejects(withRunAdmissionLock(()=>{entered=true;},{locks:null}),{code:'E_RUN_ADMISSION_LOCK'});
  assert.equal(entered,false);
  assert.equal(await withRunAdmissionLock(()=>42,{locks:null,allowWithoutLocks:true}),42);
});
