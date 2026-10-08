import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {encodeValue} from '../../src/framework/control/value.js';
import {loadOriginalApi48Catalog} from './k5-controller-product-native-original-cases.mjs';
import {SCRIPT_FENCE_ID, scriptFencePlan, validateScriptFenceOracle} from './k5-controller-script-fence.mjs';

const root = new URL('../..', import.meta.url).pathname;
const {cases, binding} = await loadOriginalApi48Catalog(root);
const definition = cases.find(row => row.id === SCRIPT_FENCE_ID);

function basePlan(overrides = {}) {
  return scriptFencePlan(definition, {
    stage: 'after',
    trigger: 'navigation',
    token: 'unit-token',
    beforeURL: 'http://127.0.0.1:3100/fence-before?token=unit-token',
    afterURL: 'http://127.0.0.1:3100/fence-main?token=unit-token',
    ...overrides
  });
}

function operationState(plan) {
  return {
    navigation: 'effect_unknown',
    revocation: 'effect_unknown',
    stop: 'cancelled',
    deadline: 'cancelled',
    'host-close': 'effect_unknown'
  }[plan.trigger];
}

function terminalState(plan) {
  return plan.trigger === 'host-close' ? 'interrupted' : 'stopped';
}

function fixture(plan = basePlan()) {
  const selected = {
    tabId: 11,
    frameId: 0,
    documentId: 'document-A',
    nativeTargetId: 'target-A',
    url: 'http://127.0.0.1:3100/original-api48?role=A#A'
  };
  const bURL = 'http://127.0.0.1:3100/original-api48?role=B#B';
  const revision = {scriptId: 'script-fence', revision: 7, sourceHash: plan.sourceSha256, pinKey: 'pin-fence', params: plan.params};
  const run = {
    tag: 'controller-run',
    runId: 'run-fence',
    resultId: 'result-fence',
    ownerEpoch: 2,
    identity: {tag: 'controller-run', runId: 'run-fence', ownerEpoch: 1, target: selected},
    target: selected,
    revision,
    workerRetired: true,
    retirementState: 'released',
    state: terminalState(plan),
    terminalReason: plan.expectedError
  };
  const result = {
    tag: 'controller-result',
    runId: run.runId,
    resultId: run.resultId,
    revision: {...revision},
    state: terminalState(plan),
    outcome: {ok: false, error: {code: plan.expectedError, name: 'FoundationError', message: 'Controller fenced'}}
  };
  const bBefore = {
    tabId: 12,
    frameId: 0,
    documentId: 'document-B',
    nativeTargetId: 'target-B',
    url: bURL,
    dom: {markerText: 'B'},
    selectedA: {documentId: selected.documentId}
  };
  const resources = {scope: 'extension-tool-document', counts: {pending: 0, timers: 0, subscriptions: 31, ports: 1, workers: 0, blobs: 0}};
  const beforeBarrier = {
    request: {method: 'GET', url: new URL(plan.beforeURL).pathname + new URL(plan.beforeURL).search, at: 10},
    release: {at: plan.stage === 'before' ? 40 : 20},
    pendingOperation: {
      tag: 'controller-operation',
      runId: run.runId,
      state: 'dispatched',
      submissionCount: 1,
      envelope: {
        requestId: 'request-before',
        identity: structuredClone(run.identity),
        revision,
        target: selected,
        operation: {kind: 'service', method: 'AXIOS_GET', args: encodeValue([{url: plan.beforeURL, config: undefined}])}
      }
    }
  };
  const pageOperation = {
    tag: 'controller-operation',
    runId: run.runId,
    state: operationState(plan),
    deliveryState: operationState(plan) === 'effect_unknown' ? 'fenced' : undefined,
    failure: {code: plan.expectedError, name: 'FoundationError', message: plan.expectedError},
    submissionCount: 1,
    dispatchAt: 25,
    envelope: {
      requestId: 'request-script',
      identity: structuredClone(run.identity),
      revision,
      target: selected,
      operation: {kind: 'user-script', method: 'eval', args: encodeValue([plan.content, {mode: 'statement'}])}
    },
    nativeReceipts: [{requestId: 'request-script', stage: 'webNavigation.getAllFrames', receipt: [{frameId: 0, documentId: selected.documentId}]}]
  };
  return {
    selected,
    admittedRun: {...structuredClone(run), ownerEpoch: 1, workerRetired: false, retirementState: 'not-started'},
    revision,
    run,
    result,
    beforeResources: resources,
    afterResources: structuredClone(resources),
    bBefore,
    bAfter: structuredClone(bBefore),
    bActive: {activeTab: {id: bBefore.tabId, url: bBefore.url, active: true}, focusedB: true, at: 18},
    beforeBarrier,
    afterBarrier: {
      request: {method: 'GET', url: new URL(plan.afterURL).pathname + new URL(plan.afterURL).search, at: 30},
      operation: pageOperation,
      release: {at: 45},
      documentId: selected.documentId
    },
    triggerAt: {trigger: plan.trigger, stage: plan.stage, runId: run.runId, at: plan.stage === 'before' ? 30 : 35},
    pageOperations: [pageOperation],
    aDuring: {documentId: selected.documentId, proof: {token: plan.token, started: true}},
    aAfter: {documentId: selected.documentId, proof: {token: plan.token, started: true, finished: true}, markerText: `effect:${plan.token}`, conservativeEffectRecorded: true},
    hostReopened: plan.trigger === 'host-close' ? {closedTargetId: 'tool-old', targetId: 'tool-new'} : undefined
  };
}

test('plan binds the approved AUTH-API16-FENCE definition without changing the 603 denominator', () => {
  assert.equal(binding.denominator, 603);
  assert(definition);
  assert.equal(definition.source.symbol, 'ChromePage.addScriptTag');
  const plan = basePlan();
  assert.equal(SCRIPT_FENCE_ID, 'AUTH-API16-FENCE');
  assert.equal(plan.caseId, SCRIPT_FENCE_ID);
  assert.equal(plan.expectedError, 'E_DOCUMENT_REPLACED');
  assert.equal(plan.params.content, plan.content);
  assert(plan.source.includes('await axiosx.get(params.beforeURL);'));
  assert(plan.source.includes('await page.addScriptTag({content:params.content});'));
  assert(plan.source.includes('return {caseId:"AUTH-API16-FENCE",unexpectedContinuation:true};'));
  assert(!plan.source.includes('return {caseId,unexpectedContinuation:true};'));
  assert(plan.content.includes('__opendeskFenceProof'));
  assert(plan.content.includes('await fetch('));
  assert(plan.content.includes("document.querySelector('#marker').textContent"));
  parse(plan.source, {ecmaVersion: 'latest', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true});
  parse(plan.content, {ecmaVersion: 'latest', allowAwaitOutsideFunction: true});
});

for (const stage of ['before', 'after']) {
  for (const trigger of ['navigation', 'revocation', 'stop', 'deadline', 'host-close']) {
    test(`oracle accepts ${stage} ${trigger} component evidence but does not report native PASS`, () => {
      const plan = basePlan({stage, trigger});
      const f = stage === 'before' && trigger === 'deadline' ? controllerDeadlineFixture().f : fixture(plan);
      if (stage === 'after' && trigger === 'deadline') {
        f.admittedRun.deadlineAt = f.run.deadlineAt = f.triggerAt.at = 40;
        f.result.committedAt = 41;
      }
      if (stage === 'before') {
        f.pageOperations = [];
        delete f.afterBarrier;
        delete f.aDuring;
        delete f.aAfter;
      }
      const accepted = validateScriptFenceOracle(plan, f);
      assert.equal(accepted.formalAccepted, false);
      assert.equal(accepted.expectedError, plan.expectedError);
      assert.equal(accepted.pageDispatches, stage === 'before' ? 0 : 1);
      assert.equal(accepted.effectState, stage === 'before' ? 'none' : operationState(plan));
    });
  }
}

const mutations = [
  ['wrong denominator source', (plan, f) => f.result.revision.sourceHash = '0'.repeat(64)],
  ['successful continuation', (plan, f) => f.result.outcome = {ok: true, valueWire: encodeValue({unexpectedContinuation: true})}],
  ['wrong error', (plan, f) => f.result.outcome.error.code = 'E_CANCELLED'],
  ['unreleased retirement', (plan, f) => f.run.retirementState = 'fenced'],
  ['unretired worker', (plan, f) => f.run.workerRetired = false],
  ['stale target', (plan, f) => f.run.target.documentId = 'other'],
  ['missing service barrier', (plan, f) => delete f.beforeBarrier.pendingOperation],
  ['B compared to MAIN URL', (plan, f) => f.bActive.activeTab.url = plan.afterURL],
  ['B changed', (plan, f) => f.bAfter.dom.markerText = 'effect:unit-token'],
  ['resource leak', (plan, f) => f.afterResources.counts.workers = 1],
  ['blind replay', (plan, f) => f.pageOperations.push(structuredClone(f.pageOperations[0]))],
  ['wrong page method', (plan, f) => f.pageOperations[0].envelope.operation.method = 'evaluate'],
  ['wrong page content', (plan, f) => f.pageOperations[0].envelope.operation.args = encodeValue(['other', {mode: 'statement'}])],
  ['wrong after state', (plan, f) => f.pageOperations[0].state = 'durable'],
  ['unrecorded side effect', (plan, f) => f.aAfter.conservativeEffectRecorded = false],
  ['missing host reopen', (plan, f) => f.hostReopened = {closedTargetId: 'same', targetId: 'same'}]
];

for (const [label, mutate] of mutations) {
  test(`oracle rejects ${label}`, () => {
    const trigger = label === 'missing host reopen' ? 'host-close' : 'navigation';
    const plan = basePlan({stage: 'after', trigger});
    const f = fixture(plan);
    mutate(plan, f);
    assert.throws(() => validateScriptFenceOracle(plan, f));
  });
}

test('before-stage oracle rejects release before trigger', () => {
  const plan = basePlan({stage: 'before'});
  const f = fixture(plan);
  f.pageOperations = [];
  delete f.afterBarrier;
  delete f.aDuring;
  delete f.aAfter;
  f.beforeBarrier.release.at = 20;
  assert.throws(() => validateScriptFenceOracle(plan, f), /release must happen after/);
});

test('before-stage oracle rejects any page dispatch', () => {
  const plan = basePlan({stage: 'before'});
  const f = fixture(plan);
  delete f.afterBarrier;
  delete f.aDuring;
  delete f.aAfter;
  assert.throws(() => validateScriptFenceOracle(plan, f), /zero page operations/);
});

function controllerDeadlineFixture() {
  const plan = basePlan({stage: 'before', trigger: 'deadline'}), f = fixture(plan);
  f.pageOperations = [];
  delete f.afterBarrier; delete f.aDuring; delete f.aAfter;
  f.admittedRun.deadlineAt = f.run.deadlineAt = f.triggerAt.at = 30010;
  f.result.committedAt = 30011;
  f.beforeBarrier.release.at = 20;
  f.beforeBarrier.completedOperation = {...structuredClone(f.beforeBarrier.pendingOperation),
    state: 'durable', receiptAt: 22, reply: {requestId: 'request-before'}};
  return {plan, f};
}

test('before deadline waits in Worker after HTTP completes, preserving the original controller deadline', () => {
  const {plan, f} = controllerDeadlineFixture();
  assert(plan.source.includes('await new Promise(()=>{});'));
  assert.equal(validateScriptFenceOracle(plan, f).pageDispatches, 0);
});

test('before deadline rejects a short-service timeout preceding the controller deadline', () => {
  const {plan, f} = controllerDeadlineFixture();
  f.result.committedAt = 15011;
  assert.throws(() => validateScriptFenceOracle(plan, f), /precede the controller deadline/);
});

test('after deadline accepts actual failed E_TIMEOUT at the admitted deadline with cancelled effect accounting', () => {
  const plan = basePlan({stage:'after',trigger:'deadline'}), f = fixture(plan);
  f.admittedRun.deadlineAt = f.run.deadlineAt = f.triggerAt.at = 40;
  f.result.committedAt = 41; f.result.state = 'failed';
  assert.equal(validateScriptFenceOracle(plan, f).effectState, 'cancelled');
});

test('after deadline rejects failed E_TIMEOUT before the admitted deadline', () => {
  const plan = basePlan({stage:'after',trigger:'deadline'}), f = fixture(plan);
  f.admittedRun.deadlineAt = f.run.deadlineAt = f.triggerAt.at = 40;
  f.result.committedAt = 39; f.result.state = 'failed';
  assert.throws(()=>validateScriptFenceOracle(plan, f), /precede the controller deadline/);
});

test('host closure permits its actual cancelled native operation while preserving E_HOST_CLOSED result', () => {
  const plan = basePlan({stage:'after',trigger:'host-close'}), f = fixture(plan);
  f.pageOperations[0].state = 'cancelled'; f.pageOperations[0].failure.code = 'E_CANCELLED';
  assert.equal(validateScriptFenceOracle(plan,f).effectState,'cancelled');
  f.pageOperations[0].failure.code = 'E_TIMEOUT';
  assert.throws(()=>validateScriptFenceOracle(plan,f));
});

test('after-stage oracle requires Worker release before trigger and MAIN barrier before trigger', () => {
  const plan = basePlan({stage: 'after'});
  const f = fixture(plan);
  f.afterBarrier.request.at = 40;
  assert.throws(() => validateScriptFenceOracle(plan, f), /MAIN request barrier/);
});

test('after-stage oracle requires actual MAIN request barrier and proof', () => {
  const plan = basePlan({stage: 'after'});
  const f = fixture(plan);
  delete f.afterBarrier;
  assert.throws(() => validateScriptFenceOracle(plan, f), /MAIN post-dispatch GET barrier/);
});

test('oracle rejects legacy numeric triggerAt because parent must pass wrapped trigger evidence', () => {
  const plan = basePlan({stage: 'after'});
  const f = fixture(plan);
  f.triggerAt = 35;
  assert.throws(() => validateScriptFenceOracle(plan, f), /triggerAt must carry/);
});
