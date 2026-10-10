import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDownloadEvents} from '../../src/platform/downloads/events.js';

function event() {
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit:value=>{for(const listener of listeners)listener(value);},get size(){return listeners.size;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cold-start downloads are captured synchronously and reconcile once after the broker opens',async()=>{
  let ready;
  const brokerReady=new Promise(resolve=>{ready=resolve;});
  const api={downloads:{onCreated:event(),onChanged:event()}},calls=[];
  const detach=registerDownloadEvents(api,brokerReady);
  assert.equal(api.downloads.onCreated.size,1);
  assert.equal(api.downloads.onChanged.size,1);
  const created={id:1},changed={id:1,state:{current:'complete'}};
  api.downloads.onCreated.emit(created);api.downloads.onChanged.emit(changed);
  await tick();assert.deepEqual(calls,[]);
  ready({downloads:{handleCreated:value=>calls.push(['created',value]),
    handleChanged:value=>calls.push(['changed',value]),dispatchDownload:()=>assert.fail('Events never redispatch a download')}});
  await tick();
  assert.deepEqual(calls,[['created',created],['changed',changed]]);
  assert.equal(calls[0][1],created,'the original Chrome observation is retained');
  api.downloads.onChanged.emit({id:2});await tick();assert.equal(calls.length,3);
  detach();assert.equal(api.downloads.onCreated.size,0);assert.equal(api.downloads.onChanged.size,0);
});
test('startup and reconciliation failures are observed without unhandled rejection or retry',async t=>{
  const errors=[];t.mock.method(console,'error',message=>errors.push(message));
  for(const createBroker of [()=>Promise.reject(new Error('startup failed')),
    ()=>Promise.resolve({downloads:{handleChanged:async()=>{throw new Error('reconcile failed');}}}),()=>Promise.reject(null)]){
    const api={downloads:{onCreated:event(),onChanged:event()}};
    registerDownloadEvents(api,createBroker());api.downloads.onChanged.emit({id:1});
    await tick();
  }
  assert.equal(errors.length,3);assert.match(errors[0],/startup failed/);assert.match(errors[1],/reconcile failed/);
  assert.match(errors[2],/E_EFFECT_UNKNOWN.*null/);
});
