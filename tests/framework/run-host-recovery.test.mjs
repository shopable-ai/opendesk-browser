import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunHost} from '../../src/run-host.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const ready = Promise.resolve({registrationId: 'registration-one'});
const noopSet = () => ({addListener() {}, removeListener() {}});
const api = {runtime: {getURL: path => `chrome-extension://extension/${path}`}, tabs: {}, permissions: {}};

function clientWithController(controller) {
  return {
    ready,
    storage: {}, pagePort: {}, exportBridge: {}, entitlement: {},
    runCommands: {},
    subscribeRun() { return () => {}; },
    resourceSnapshot: () => ({pending: 0, subscriptions: 0, ports: 1}),
    controller
  };
}

for (const cancelled of [true, false]) test(`RunHost ${cancelled ? 'cancels' : 'closes'} a pending admission without creating or replaying its Worker`, async () => {
  let releaseClaim, entered, workers = 0;
  const admissionEntered = new Promise(resolve => { entered = resolve; });
  const events = [];
  const controller = {
    startControllerRun: () => { entered(); return new Promise(resolve => { releaseClaim = resolve; }); },
    stopControllerRun: async request => { events.push(['stop', request.reason]); return {state: 'stopping'}; },
    finishControllerRun: async request => {
      events.push(['finish', request.status, request.error.code, request.workerRetired]);
      return {run: {runId: request.runId, state: cancelled ? 'stopped' : 'interrupted'}, result: {runId: request.runId}};
    },
    retireControllerTarget: async request => { events.push(['retire', request.runId]); return {state: 'released'}; }
  };
  const host = createRunHost({api, client: clientWithController(controller), document: undefined,
    controllerFactory: () => { workers++; throw new Error('Cancelled source must never execute'); }, templateModuleFactory: null});
  const pending = host.start({requestId: 'pending-start', source: {kind: 'draft', sourceUtf8: 'return false;'},
    params: {}, target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}});
  await admissionEntered;
  if (cancelled) assert.equal(host.cancelStart('pending-start'), true);
  else host.dispose();
  releaseClaim({runId: 'pending-run', resultId: 'pending-result'});
  await assert.rejects(pending, error => {
    assert.equal(error.code, cancelled ? 'E_CANCELLED' : 'E_HOST_CLOSED');
    assert.equal(error.runId, 'pending-run'); assert.equal(error.resultId, 'pending-result'); return true;
  });
  await host.completion;
  assert.equal(workers, 0);
  assert.equal(host.currentRun, null);
  assert.deepEqual(events, [['stop', cancelled ? 'E_CANCELLED' : 'E_HOST_CLOSED'],
    ['finish', cancelled ? 'stopped' : 'host-closed', cancelled ? 'E_CANCELLED' : 'E_HOST_CLOSED', true], ['retire', 'pending-run']]);
});

test('lost manual admission retires the original accepted run without launching a Worker', async t => {
  const events=[];
  let observedRun=null;
  const controller={
    async startControllerRun({requestId}){
      events.push(['start',requestId]);
      throw Object.assign(new Error('response dropped'),{code:'E_EFFECT_UNKNOWN'});
    },
    async fenceControllerAdmission({requestId}){
      events.push(['fence',requestId]);
      return observedRun?{requestId,state:'admitted',run:observedRun}:null;
    },
    async finishControllerRun(input){
      events.push(['finish',input.runId,input.status,input.workerRetired]);
      return {run:{...observedRun,state:'stopped'},result:{runId:input.runId}};
    },
    async retireControllerTarget({runId}){events.push(['retire',runId]);return {state:'released'};},
  };
  const host=createRunHost({api,client:clientWithController(controller),document:undefined,templateModuleFactory:null,
    controllerFactory(){assert.fail('An unobserved claim must not execute');}});
  t.after(()=>host.dispose());
  const start={requestId:'original',reconcileAdmission:true,source:{kind:'draft',sourceUtf8:'return false;'},params:{},
    target:{mode:'borrowed',tabId:1,frameId:0,documentId:'doc'}};
  await assert.rejects(host.start(start),{code:'E_EFFECT_UNKNOWN',admissionRequestId:'original'});
  await assert.rejects(host.start({...start,requestId:'new'}),{code:'E_OWNER'});
  assert.equal(await host.reconcileControllerAdmission('different'),null);
  assert.equal(await host.reconcileControllerAdmission('original'),null);
  assert.equal(host.executionPending,true);
  observedRun={requestId:'original',runId:'durable-run',state:'running'};
  const [first,second]=await Promise.all([host.reconcileControllerAdmission('original'),host.reconcileControllerAdmission('original')]);
  assert.deepEqual(first,second);
  assert.equal(first.retirement.state,'released');
  assert.equal(host.executionPending,false);
  assert.deepEqual(events,[['start','original'],['fence','original'],['fence','original'],['finish','durable-run','stopped',true],['retire','durable-run']]);
});

test('lost manual admission releases only on a matching durable not-admitted receipt', async t => {
  const starts=[],fences=[];
  let receipt={requestId:'different',state:'not-admitted'};
  const controller={
    async startControllerRun({requestId}){
      starts.push(requestId);
      throw Object.assign(new Error('response dropped'),{code:'E_EFFECT_UNKNOWN'});
    },
    async fenceControllerAdmission({requestId}){
      fences.push(requestId);
      if(!receipt)throw new Error('fence response dropped');
      return receipt;
    },
  };
  const host=createRunHost({api,client:clientWithController(controller),document:undefined,templateModuleFactory:null,
    controllerFactory(){assert.fail('No Worker was admitted');}});
  t.after(()=>host.dispose());
  const start={requestId:'original',reconcileAdmission:true,source:{kind:'draft',sourceUtf8:'return false;'},params:{},
    target:{mode:'borrowed',tabId:1,frameId:0,documentId:'doc'}};
  await assert.rejects(host.start(start),{admissionRequestId:'original'});
  assert.equal(await host.reconcileControllerAdmission('original'),null);
  receipt=null;
  await assert.rejects(host.reconcileControllerAdmission('original'),/response dropped/);
  await assert.rejects(host.start({...start,requestId:'second'}),{code:'E_OWNER'});
  receipt={requestId:'original',state:'not-admitted'};
  assert.deepEqual(await host.reconcileControllerAdmission('original'),receipt);
  assert.deepEqual(starts,['original']);
  assert.equal(host.executionPending,false);
  await assert.rejects(host.start({...start,requestId:'second'}),{admissionRequestId:'second'});
  assert.deepEqual(starts,['original','second']);
  assert.deepEqual(fences,['original','original','original']);
});

test('lost admission releases its own local slot after revocation, without recovering or delivering the result', async t => {
  const starts=[],retired=[];
  let releaseReceipt={state:'pending',releaseCount:0},finishCalls=0,fenceRequest='original';
  const revoked=Object.assign(new Error('Grant revoked'),{code:'E_PERMISSION'});
  const controller={
    async startControllerRun({requestId}){
      starts.push(requestId);
      if(requestId==='original')throw Object.assign(new Error('Admission reply lost'),{code:'E_EFFECT_UNKNOWN'});
      if(requestId==='blocked-by-permission')throw revoked;
      throw Object.assign(new Error('New request receipt lost'),{code:'E_EFFECT_UNKNOWN'});
    },
    async fenceControllerAdmission(){return {requestId:fenceRequest,state:'admitted',
      run:{requestId:fenceRequest,runId:'original-run',state:'paused_unknown',outcomeUncertain:true}};},
    async finishControllerRun(request){
      finishCalls++;assert.equal(request.runId,'original-run');assert.equal(request.workerRetired,true);throw revoked;
    },
    async snapshotControllerRun(){throw revoked;},
    async retireControllerTarget({runId}){retired.push(runId);return releaseReceipt;},
  };
  const host=createRunHost({api,client:clientWithController(controller),document:undefined,templateModuleFactory:null,
    controllerFactory(){assert.fail('No unchecked Worker may execute');}});
  t.after(()=>host.dispose());
  const start={requestId:'original',reconcileAdmission:true,source:{kind:'draft',sourceUtf8:'return false;'},
    params:{},target:{mode:'borrowed',tabId:1,frameId:0,documentId:'doc'}};
  await assert.rejects(host.start(start),{admissionRequestId:'original'});
  fenceRequest='unrelated';
  assert.equal(await host.reconcileControllerAdmission('original'),null);
  assert.equal(finishCalls,0);
  fenceRequest='original';
  await assert.rejects(host.reconcileControllerAdmission('original'),{code:'E_PERMISSION'});
  await assert.rejects(host.start({...start,requestId:'too-early'}),{code:'E_OWNER'});
  releaseReceipt={state:'released',releaseCount:1};
  const recovery=await host.reconcileControllerAdmission('original');
  assert.deepEqual(recovery,{requestId:'original',runId:'original-run',admissionState:'admitted',
    retirement:releaseReceipt,outcomeUncertain:true});
  assert.deepEqual(starts,['original']);
  assert.deepEqual(retired,['original-run','original-run']);assert.equal(finishCalls,1);
  assert.equal(host.executionPending,false);
  await assert.rejects(host.start({...start,requestId:'blocked-by-permission'}),{code:'E_PERMISSION'});
  await assert.rejects(host.start({...start,requestId:'next'}),{admissionRequestId:'next'});
  assert.equal(await host.reconcileControllerAdmission('original'),null);
  assert.equal(host.executionPending,true);
  assert.deepEqual(starts,['original','blocked-by-permission','next']);
});

test('RunHost recovers a durable finish result after the finish response is lost, then retires once', async () => {
  const events = [];
  const result = {tag: 'controller-result', runId: 'run-one', resultId: 'result-one', state: 'completed',
    outcome: {ok: true, valueWire: {type: 'boolean', value: false}}};
  const controller = {
    commitControllerScript: async () => ({scriptId: 'script', revision: 1, contentHash: 'a'.repeat(64), sourceUtf8: 'return false;'}),
    startControllerRun: async () => ({runId: 'run-one', state: 'running', deadlineAt: Date.now() + 30000,
      sourceUtf8: 'return false;', paramsWire: encodeValue(undefined),
      revision: {scriptId: 'script', revision: 1, sourceHash: 'a'.repeat(64)},
      identity: {runId: 'run-one', ownerEpoch: 1}, target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}}),
    controllerOperation: async () => { throw new Error('not used'); },
    async finishControllerRun(request) {
      events.push(['finish', request.requestId, request.workerRetired]);
      throw Object.assign(new Error('response lost after durable commit'), {code: 'E_TRANSPORT'});
    },
    async snapshotControllerRun(request) {
      events.push(['snapshot', request.runId]);
      return {run: {runId: request.runId, state: 'completed'}, results: [result], slotAvailable: false};
    },
    async retireControllerTarget(request) {
      events.push(['retire', request.runId]);
      return {state: 'released', releaseCount: 1, retirementId: 'retirement-one'};
    },
    stopControllerRun: async () => ({runId: 'run-one', state: 'stopping'})
  };
  const host = createRunHost({api, client: clientWithController(controller), document: undefined,
    controllerFactory: () => ({execute: async () => ({status: 'succeeded', value: controlEncode(false)}),
      get retired() { return Promise.resolve({acknowledged: true}); },
      stop() {}, close() {}}),
    templateModuleFactory: null});
  const claim = await host.start({scriptId: 'script', revision: 1, contentHash: 'a'.repeat(64), params: undefined,
    target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}});
  assert.equal(claim.runId, 'run-one');
  const outcome = await host.completion;
  assert.equal(outcome.state, 'completed');
  assert.deepEqual(outcome.result, result);
  assert.deepEqual(outcome.retirement, {state: 'released', releaseCount: 1, retirementId: 'retirement-one'});
  assert.deepEqual(events, [['finish', 'run-one:finish', true], ['snapshot', 'run-one'], ['retire', 'run-one']]);
});

test('RunHost clears currentRun before notifying a released controller terminal state', async () => {
  const observed = [];
  const result = {tag: 'controller-result', runId: 'run-release', resultId: 'result-release', state: 'completed',
    outcome: {ok: true, valueWire: {type: 'boolean', value: false}}};
  const controller = {
    startControllerRun: async () => ({runId: 'run-release', state: 'running', deadlineAt: Date.now() + 30000,
      sourceUtf8: 'return false;', paramsWire: encodeValue(undefined),
      revision: {scriptId: 'script', revision: 1, sourceHash: 'd'.repeat(64)},
      identity: {runId: 'run-release', ownerEpoch: 1}, target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}}),
    controllerOperation: async () => { throw new Error('not used'); },
    finishControllerRun: async () => ({run: {runId: 'run-release', state: 'completed'}, result}),
    snapshotControllerRun: async request => ({run: {runId: request.runId, state: 'completed'}, results: [result], slotAvailable: false}),
    retireControllerTarget: async () => ({state: 'released', releaseCount: 1}),
    stopControllerRun: async () => ({runId: 'run-release', state: 'stopping'})
  };
  const host = createRunHost({api, client: clientWithController(controller), document: undefined,
    controllerFactory: () => ({execute: async () => ({status: 'succeeded', value: controlEncode(false)}),
      get retired() { return Promise.resolve({acknowledged: true}); },
      stop() {}, close() {}}),
    templateModuleFactory: null});
  host.subscribe(event => observed.push({event, currentRun: host.currentRun}));
  await host.start({scriptId: 'script', revision: 1, contentHash: 'd'.repeat(64), params: undefined,
    target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}});
  const outcome = await host.completion;
  assert.equal(outcome.retirement.state, 'released');
  assert.equal(host.currentRun, null);
  assert.deepEqual(observed.map(row => [row.event.runId, row.event.state, row.currentRun]),
    [['run-release', 'running', 'run-release'], ['run-release', 'completed', null]]);
});

test('RunHost keeps currentRun during a pending retirement notification', async () => {
  const observed = [];
  const result = {tag: 'controller-result', runId: 'run-retiring', resultId: 'result-retiring', state: 'completed',
    outcome: {ok: true, valueWire: {type: 'boolean', value: false}}};
  const controller = {
    startControllerRun: async () => ({runId: 'run-retiring', state: 'running', deadlineAt: Date.now() + 30000,
      sourceUtf8: 'return false;', paramsWire: encodeValue(undefined),
      revision: {scriptId: 'script', revision: 1, sourceHash: 'e'.repeat(64)},
      identity: {runId: 'run-retiring', ownerEpoch: 1}, target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}}),
    controllerOperation: async () => { throw new Error('not used'); },
    finishControllerRun: async () => ({run: {runId: 'run-retiring', state: 'completed'}, result}),
    snapshotControllerRun: async request => ({run: {runId: request.runId, state: 'completed'}, results: [result], slotAvailable: false}),
    retireControllerTarget: async () => ({state: 'pending', releaseCount: 0}),
    stopControllerRun: async () => ({runId: 'run-retiring', state: 'stopping'})
  };
  const host = createRunHost({api, client: clientWithController(controller), document: undefined,
    controllerFactory: () => ({execute: async () => ({status: 'succeeded', value: controlEncode(false)}),
      get retired() { return Promise.resolve({acknowledged: true}); },
      stop() {}, close() {}}),
    templateModuleFactory: null});
  host.subscribe(event => observed.push({event, currentRun: host.currentRun}));
  await host.start({scriptId: 'script', revision: 1, contentHash: 'e'.repeat(64), params: undefined,
    target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}});
  const outcome = await host.completion;
  assert.equal(outcome.retirement.state, 'pending');
  assert.equal(host.currentRun, 'run-retiring');
  assert.deepEqual(observed.map(row => [row.event.runId, row.event.state, row.currentRun]),
    [['run-retiring', 'running', 'run-retiring'], ['run-retiring', 'completed', 'run-retiring']]);
});

test('RunHost stop immediately stops the local controller before waiting for durable stop', async () => {
  const events = [];
  let releaseStop;
  const controller = {
    startControllerRun: async () => ({runId: 'run-stop', state: 'running', deadlineAt: Date.now() + 30000,
      sourceUtf8: 'await never;', paramsWire: encodeValue(undefined),
      revision: {scriptId: 'script', revision: 1, sourceHash: 'b'.repeat(64)},
      identity: {runId: 'run-stop', ownerEpoch: 1}, target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}}),
    controllerOperation: async () => { throw new Error('not used'); },
    stopControllerRun: () => new Promise(resolve => { events.push('durable-stop-start'); releaseStop = () => { events.push('durable-stop-end'); resolve({runId: 'run-stop', state: 'stopping'}); }; }),
    finishControllerRun: async () => ({run: {runId: 'run-stop', state: 'stopped'}, result: {runId: 'run-stop', state: 'stopped'}}),
    snapshotControllerRun: async () => ({run: {runId: 'run-stop'}, results: [], slotAvailable: false}),
    retireControllerTarget: async () => ({state: 'released', releaseCount: 1})
  };
  const host = createRunHost({api, client: clientWithController(controller), document: {defaultView: {addEventListener() {}, removeEventListener() {}}},
    controllerFactory: ({context}) => ({execute: () => new Promise(resolve => {
      context.signal.addEventListener('abort', () => { events.push('local-stop'); resolve({status: 'stopped'}); }, {once: true});
    }), retired: Promise.resolve({acknowledged: true}), stop() { events.push('controller-stop'); }, close() {}}),
    templateModuleFactory: null});
  await host.start({scriptId: 'script', revision: 1, contentHash: 'b'.repeat(64), params: undefined,
    target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}});
  const stopPromise = host.stop({runId: 'run-stop'});
  await Promise.resolve();
  assert.deepEqual(events, ['controller-stop', 'local-stop', 'durable-stop-start']);
  releaseStop();
  await stopPromise;
  await host.completion;
});

test('RunHost keeps pending settlement after finish failure and retries it without re-executing', async () => {
  const events = [];
  let executes = 0, finishes = 0;
  const result = {tag: 'controller-result', runId: 'run-pending', resultId: 'result-pending', state: 'completed',
    outcome: {ok: true, valueWire: {type: 'boolean', value: false}}};
  const controller = {
    startControllerRun: async () => ({runId: 'run-pending', state: 'running', deadlineAt: Date.now() + 30000,
      sourceUtf8: 'return false;', paramsWire: encodeValue(undefined),
      revision: {scriptId: 'script', revision: 1, sourceHash: 'c'.repeat(64)},
      identity: {runId: 'run-pending', ownerEpoch: 1}, target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}}),
    controllerOperation: async () => { throw new Error('not used'); },
    async finishControllerRun(request) {
      finishes++;
      events.push(['finish', request.requestId]);
      if (finishes === 1) throw Object.assign(new Error('durable store unavailable'), {code: 'E_IDB'});
      return {run: {runId: 'run-pending', state: 'completed'}, result};
    },
    async snapshotControllerRun(request) {
      events.push(['snapshot', request.runId]);
      return {run: {runId: request.runId, state: 'running'}, results: [], slotAvailable: false};
    },
    async retireControllerTarget(request) {
      events.push(['retire', request.runId]);
      return {state: finishes===1 ? 'pending' : 'released', releaseCount: finishes===1 ? 0 : 1};
    },
    stopControllerRun: async () => {events.push(['stop-fence']);return {state:'stopping'};}
  };
  const host = createRunHost({api, client: clientWithController(controller), document: undefined,
    controllerFactory: () => ({execute: async () => { executes++; return {status: 'succeeded', value: controlEncode(false)}; },
      get retired() { return Promise.resolve({acknowledged: true}); },
      stop() { events.push(['local-stop']); }, close() {}}),
    templateModuleFactory: null});
  await host.start({scriptId: 'script', revision: 1, contentHash: 'c'.repeat(64), params: undefined,
    target: {mode: 'borrowed', tabId: 1, frameId: 0, documentId: 'doc'}});
  assert.deepEqual(await host.completion, {runId: 'run-pending', state: 'paused_unknown', pendingSettlement: true,
    error: {code: 'E_IDB', message: 'durable store unavailable'}});
  assert.equal(host.currentRun, 'run-pending');
  const settled = await host.stop({runId: 'run-pending'});
  assert.equal(settled.state, 'completed');
  assert.equal(executes, 1);
  assert.deepEqual(events, [['finish','run-pending:finish'],['snapshot','run-pending'],['retire','run-pending'],['local-stop'],['snapshot','run-pending'],['stop-fence'],['snapshot','run-pending'],['finish','run-pending:finish'],['retire','run-pending']]);
  assert.equal(host.currentRun, null);
});

test('an authenticated durable Controller fence aborts a waiting Worker and unsubscribes on disposal',async()=>{
  let listener,unsubscribed=0,signal,stops=0,retired=0;
  const controller={startControllerRun:async()=>({runId:'fenced-run',state:'running',deadlineAt:Date.now()+30000,
    sourceUtf8:'return undefined;',paramsWire:encodeValue({}),revision:{revision:1,sourceHash:'a'.repeat(64)},
    identity:{runId:'fenced-run',ownerEpoch:1},target:{mode:'borrowed',tabId:1,frameId:0,documentId:'doc'}}),
    finishControllerRun:async request=>({run:{runId:'fenced-run',state:'stopped'},result:{state:'stopped',outcome:{ok:false,error:{code:'E_DOCUMENT_REPLACED'}}}}),
    retireControllerTarget:async()=>{retired++;return{state:'released',releaseCount:1};},
    stopControllerRun:async()=>{stops++;return{state:'stopping'};}};
  const client=clientWithController(controller);client.subscribeRun=fn=>{listener=fn;return()=>{unsubscribed++;};};
  const host=createRunHost({api,client,document:undefined,controllerFactory:({context})=>{
    signal=context.signal;const result=new Promise(resolve=>signal.addEventListener('abort',()=>resolve({status:'stopped',error:{code:signal.reason.code,message:signal.reason.message}}),{once:true}));
    return{execute:()=>result,result,retired:Promise.resolve({acknowledged:true}),stop(){},close(){}};
  }});
  await host.start({source:{kind:'draft',sourceUtf8:'return undefined;'},params:{},target:{mode:'borrowed',tabId:1,frameId:0,documentId:'doc'}});
  listener({type:'controller-fenced',runId:'another-run',reasonCode:'E_DOCUMENT_REPLACED'});assert.equal(signal.aborted,false);
  listener({type:'controller-fenced',runId:'fenced-run',reasonCode:'E_DOCUMENT_REPLACED'});
  assert.equal(signal.aborted,true);assert.equal(signal.reason.code,'E_DOCUMENT_REPLACED');
  assert.equal((await host.completion).state,'stopped');assert.equal(retired,1);assert.equal(stops,0);
  host.dispose();assert.equal(unsubscribed,1);
});
