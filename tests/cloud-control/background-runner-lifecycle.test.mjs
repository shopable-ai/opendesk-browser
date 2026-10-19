import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRunnerLifecycle} from '../../src/cloud-control/runner-lifecycle.js';

const path='cloud-control/runner.html';
const url='chrome-extension://fixture/'+path;
function fixture(){
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
        justification:'Execute already-approved Controller Tasks after closing the Side Panel'});
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
  return {state,calls,broker,lifecycle:createCloudRunnerLifecycle({api})};
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
