import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createControllerResultsView} from '../../src/ui/controller-results-view.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const reload=()=>Object.assign(new Error('Update refused before dispatch'),{code:'E_DEV_RELOADING'});
function fixture(t,snapshotControllerRun){
  const view=createDeveloperView();let disposed=false,text='';
  t.after(()=>view.dispose());
  const owner=createControllerResultsView({
    host:{currentRun:null,controller:{snapshotControllerRun}},view,
    resultDownloads:{showResults(){}},isDisposed:()=>disposed,isRunning:()=>false,
    getOwnedRunId:()=>'',isLocalPageResultCurrent:()=>false,onUpdate(){},onStatus(){},
    setResultText(value){text=value;},setResultKind(){},displayCopyResult(){},showRecovery(){},hideRecovery(){}
  });
  return {owner,view,dispose(){disposed=true;},get text(){return text;}};
}
function snapshot(runId){
  const run={runId,state:'completed',retirementState:'released',sourceKind:'draft'};
  return {run,runs:[run],results:[{runId,resultId:'original-result',state:'completed',
    outcome:{ok:true,valueWire:encodeValue({matched:true,value:'cloud value'})}}],downloads:[]};
}

test('history read waits through reload refusals and displays the same durable run',async t=>{
  const calls=[];
  const f=fixture(t,async request=>{calls.push(request);if(calls.length<3)throw reload();return snapshot(request.runId);});
  await f.owner.read('cloud-run',{reveal:true});
  assert.deepEqual(calls,Array.from({length:3},()=>({runId:'cloud-run'})));
  assert.equal(f.view.fields['script-task-id'].textContent,'runId：cloud-run');
  assert.match(f.text,/cloud value/);
  assert.equal(f.owner.projection.results[0].resultId,'original-result');
});

for(const code of ['E_OWNER','E_EFFECT_UNKNOWN','E_PERMISSION']){
  test(`history read never retries ${code}`,async t=>{
    let calls=0;const error=Object.assign(new Error(code),{code});
    const f=fixture(t,async()=>{calls++;throw error;});
    await assert.rejects(f.owner.read('cloud-run'),error);
    assert.equal(calls,1);
  });
}

test('disposed history read stops waiting without another request',async t=>{
  let calls=0;const f=fixture(t,async()=>{calls++;throw reload();});
  const read=f.owner.read('cloud-run');await Promise.resolve();f.dispose();await read;
  assert.equal(calls,1);
});

test('newer history selection cancels the waiting older read',async t=>{
  const calls=[];const f=fixture(t,async request=>{
    calls.push(request.runId);if(request.runId==='old-run')throw reload();return snapshot(request.runId);
  });
  const old=f.owner.read('old-run');await Promise.resolve();
  await f.owner.read('new-run');await old;
  assert.deepEqual(calls,['old-run','new-run']);
  assert.equal(f.view.fields['script-task-id'].textContent,'runId：new-run');
});

test('persistent development refusal has a finite read budget',async t=>{
  let calls=0;const f=fixture(t,async()=>{calls++;throw reload();});
  await assert.rejects(f.owner.read('cloud-run'),{code:'E_DEV_RELOADING'});
  assert.equal(calls,40);
});
