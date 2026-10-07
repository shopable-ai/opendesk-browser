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
