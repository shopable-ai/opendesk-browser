import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createControllerResultsView} from '../../src/ui/controller-results-view.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const reload=()=>Object.assign(new Error('Update refused before dispatch'),{code:'E_DEV_RELOADING'});
function fixture(t,snapshotControllerRun){
  const view=createDeveloperView();let disposed=false,text='',running=false;
  const host={currentRun:null,controller:{snapshotControllerRun}};
  t.after(()=>view.dispose());
  const owner=createControllerResultsView({
    host,view,
    resultDownloads:{showResults(){}},isDisposed:()=>disposed,isRunning:()=>running,
    getOwnedRunId:()=>'',isLocalPageResultCurrent:()=>false,onUpdate(){},onStatus(){},
    setResultText(value){text=value;},setResultKind(){},displayCopyResult(){},showRecovery(){},hideRecovery(){}
  });
  return {owner,view,dispose(){disposed=true;},get text(){return text;},
    startRun(run){running=true;host.currentRun=run.runId;owner.renderTask(run);}};
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

test('explicit history query keeps result and technical identity on the requested run',async t=>{
  const written=snapshot('cloud-write'),restored=snapshot('cloud-restore');
  restored.results[0].outcome.valueWire=encodeValue({matched:true,value:''});
  const runs=[written.run,restored.run],results=[...written.results,...restored.results];
  const f=fixture(t,async request=>({run:request.runId==='cloud-write'?written.run:restored.run,
    runs,results,downloads:[]}));
  await f.owner.read('cloud-restore');
  await f.owner.read('cloud-write',{reveal:true});
  assert.match(f.text,/cloud value/);
  assert.equal(f.view.fields['script-task-id'].textContent,'runId：cloud-write');
  assert.equal(f.owner.currentTask.runId,'cloud-write');
  assert.equal(f.view.fields['script-task-status'].textContent,'已完成 · 资源已释放');
});

test('history response started before a new run cannot replace its identity',async t=>{
  let resolve;const response=new Promise(done=>{resolve=done;});
  const f=fixture(t,async()=>response);
  const read=f.owner.read('old-history',{reveal:true});
  const next={runId:'new-run',state:'running'};
  f.startRun(next);
  resolve({...snapshot('old-history'),runs:[snapshot('old-history').run,next]});
  await read;
  assert.equal(f.owner.currentTask.runId,'new-run');
  assert.equal(f.view.fields['script-task-id'].textContent,'runId：new-run');
  assert.equal(f.owner.projection,undefined);
  assert.equal(f.text,'');
});

test('history explicitly selected after a new run starts stays on that selection',async t=>{
  const f=fixture(t,async()=>snapshot('chosen-history'));
  f.startRun({runId:'new-run',state:'running'});
  await f.owner.read('chosen-history',{reveal:true});
  assert.equal(f.owner.currentTask.runId,'chosen-history');
  assert.equal(f.view.fields['script-task-id'].textContent,'runId：chosen-history');
  assert.match(f.text,/cloud value/);
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
