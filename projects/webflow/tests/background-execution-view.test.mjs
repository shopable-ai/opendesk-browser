import test from 'node:test';
import assert from 'node:assert/strict';
import {activateWebFlowExecutionTarget} from '../../../src/native-agent/webflow-execution-view.js';

const event=()=>{
  const callbacks=new Set();
  return {addListener:fn=>callbacks.add(fn),removeListener:fn=>callbacks.delete(fn),
    emit:(...args)=>{for(const callback of [...callbacks])callback(...args);},
    get size(){return callbacks.size;}};
};
const fixture=()=>{
  const target={mode:'owned',tabId:42,frameId:0,documentId:'original-document',
    targetSessionId:'target-session',targetVersion:1,allowedOrigin:'https://www.baidu.com'};
  const run={runId:'run-original-123',state:'running',target},slot={currentRunId:run.runId};
  let activations=0,reservations=0,authChecks=0,readChecks=0;
  const api={webNavigation:{onBeforeNavigate:event(),onCommitted:event()},
    tabs:{onRemoved:event(),onDetached:event(),onReplaced:event(),
      update:async(id,payload)=>{
        activations++;assert.equal(id,target.tabId);assert.deepEqual(payload,{active:true});
        return {id,active:true,url:'https://www.baidu.com/',incognito:false,pendingUrl:null};
      }}};
  let current=run;let reserved=false,authorized=true;
  const call=(options={})=>activateWebFlowExecutionTarget({
    api,runId:run.runId,
    readRun:async()=>{readChecks++;return {run:structuredClone(current),slot:structuredClone(slot)};},
    assertAuthorized:async()=>{authChecks++;if(!authorized)throw Object.assign(Error('revoked'),{code:'E_PERMISSION'});},
    reserveActivation:async()=>{
      if(reserved)throw Object.assign(Error('repeated'),{code:'E_BRIDGE_REPLAY'});
      reservations++;reserved=true;
    },
    verifyTarget:async()=>({url:'https://www.baidu.com/'}),
    ...options
  });
  return {api,run,slot,call,target,
    get activations(){return activations;},get reservations(){return reservations;},
    get authChecks(){return authChecks;},get readChecks(){return readChecks;},
    stop:()=>{current={...current,state:'completed'};},
    revoke:()=>{authorized=false;},
    afterReserve:()=>{reserved=true;}};
};
test('trusted foreground view activates the exact existing tab, with no run or result creation',async()=>{
  const f=fixture();
  const shown=await f.call();
  assert.deepEqual(shown,{runId:f.run.runId,tabId:f.target.tabId,shown:true});
  assert.equal(f.activations,1);assert.equal(f.reservations,1);
  assert.ok(f.readChecks>=2);assert.ok(f.authChecks>=2);
  assert.equal(f.api.webNavigation.onCommitted.size,0,'navigation watchers must clean up');
});
test('not-running, missing active slot or authorization loss cannot activate',async()=>{
  for(const failure of ['stopped','slot','revoked']){
    const f=fixture();
    if(failure==='stopped')f.stop();
    if(failure==='slot')f.slot.currentRunId='other-run';
    if(failure==='revoked')f.revoke();
    await assert.rejects(f.call());
    assert.equal(f.activations,0);assert.equal(f.reservations,0);
  }
});
test('navigation before final check rejects without changing the viewed tab',async()=>{
  const f=fixture();
  const view=f.call({assertAuthorized:async()=>{
    f.api.webNavigation.onCommitted.emit({tabId:f.target.tabId,frameId:0});
  }});
  await assert.rejects(view,{code:'E_WEB_TASK_VIEW'});
  assert.equal(f.activations,0);assert.equal(f.reservations,0);
});
test('lost activation ACK never causes automatic retry or a second activation',async()=>{
  const f=fixture();
  f.api.tabs.update=async()=>{throw Error('Chrome ACK lost after activation');};
  await assert.rejects(f.call(),/Chrome ACK lost/);
  assert.equal(f.reservations,1);
  await assert.rejects(f.call(),{code:'E_BRIDGE_REPLAY'});
  assert.equal(f.reservations,1,'unknown effect remains one-shot');
});
