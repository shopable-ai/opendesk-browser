import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeValue} from '../../src/framework/control/value.js';
import {requireResourceCounts} from './k5-controller-native-campaigns.mjs';

export const SCRIPT_FENCE_ID = 'AUTH-API16-FENCE';

const STAGES = Object.freeze(['before', 'after']);
const TRIGGERS = Object.freeze(['navigation', 'revocation', 'stop', 'deadline', 'host-close']);
const EXPECTED_ERRORS = Object.freeze({
  navigation: 'E_DOCUMENT_REPLACED',
  revocation: 'E_PERMISSION',
  stop: 'E_CANCELLED',
  deadline: 'E_TIMEOUT',
  'host-close': 'E_HOST_CLOSED'
});
const AFTER_OPERATION_STATES = Object.freeze({
  navigation: 'effect_unknown',
  revocation: 'effect_unknown',
  stop: 'cancelled',
  deadline: 'cancelled',
  'host-close': 'effect_unknown'
});
const sha = text => createHash('sha256').update(text).digest('hex');

function assertURL(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a URL string`);
  const url = new URL(value);
  assert(/^https?:$/.test(url.protocol), `${label} must be an HTTP(S) URL`);
  return url.href;
}

function triggerTime(triggerAt) {
  assert.equal(typeof triggerAt, 'object', 'triggerAt must carry stage/trigger/runId/at');
  assert.equal(Number.isSafeInteger(triggerAt.at), true);
  return triggerAt.at;
}

function assertIdentityRevision(run, result, revision, sourceSha256, admittedRun) {
  assert.equal(run.tag, 'controller-run');
  assert.equal(typeof run.runId, 'string');
  assert.equal(typeof run.resultId, 'string');
  assert.equal(run.workerRetired, true);
  assert.equal(run.retirementState, 'released');
  assert.equal(result.tag, 'controller-result');
  assert.equal(result.runId, run.runId);
  assert.equal(result.resultId, run.resultId);
  assert.deepEqual(result.revision, run.revision, 'Result must expose its own admitted revision');
  assert.equal(run.revision?.scriptId, revision.scriptId);
  assert.equal(run.revision?.revision, revision.revision);
  assert.equal(run.revision?.sourceHash, sourceSha256);
  assert.equal(result.revision?.sourceHash, sourceSha256);
  assert.equal(run.identity?.runId, run.runId);
  assert.equal(admittedRun?.runId, run.runId);
  assert.deepEqual(run.identity, admittedRun.identity);
  assert.equal(run.identity?.ownerEpoch, admittedRun.ownerEpoch);
  assert(run.ownerEpoch > admittedRun.ownerEpoch, 'Terminal owner epoch must fence the admitted epoch');
}

function assertTarget(selected, run) {
  for (const key of ['tabId', 'frameId', 'documentId']) assert.equal(run.target?.[key], selected[key]);
  assert.equal(run.identity?.target?.tabId, selected.tabId);
  assert.equal(run.identity?.target?.frameId, selected.frameId);
  assert.equal(run.identity?.target?.documentId, selected.documentId);
}

function assertBUnchanged({bBefore, bAfter, bActive}) {
  assert(Number.isSafeInteger(bActive?.at), 'Actual focused-B observation time is required');
  assert.equal(bActive.activeTab?.id, bBefore.tabId);
  assert.equal(bActive.activeTab.url, bBefore.url);
  assert.equal(bActive.activeTab.active, true);
  assert.equal(bActive.focusedB, true);
  assert.equal(bBefore.url, bAfter.url);
  assert.deepEqual(bAfter, bBefore, 'The focused B document must remain unchanged');
  assert.equal(bBefore.dom?.markerText ?? bBefore.markerText, 'B');
  assert.equal(bAfter.dom?.markerText ?? bAfter.markerText, 'B');
}

function assertBeforeBarrier(plan, {run, beforeBarrier}) {
  assert(beforeBarrier?.request && beforeBarrier.pendingOperation, 'Actual Worker HTTP admission barrier is missing');
  assert.equal(beforeBarrier.request.method, 'GET');
  const beforeURL = new URL(plan.beforeURL);
  assert.equal(beforeBarrier.request.url, beforeURL.pathname + beforeURL.search);
  const pending = beforeBarrier.pendingOperation;
  assert.equal(pending.tag, 'controller-operation');
  assert.equal(pending.runId, run.runId);
  assert.equal(pending.state, 'dispatched');
  assert.equal(pending.submissionCount, 1);
  assert.equal(pending.envelope?.operation?.kind, 'service');
  assert.equal(pending.envelope.operation.method, 'AXIOS_GET');
  assert.equal(pending.envelope.identity.runId, run.runId);
  assert.deepEqual(pending.envelope.identity, run.identity);
  assert.deepEqual(decodeValue(pending.envelope.operation.args), [{url: plan.beforeURL, config: undefined}]);
}

function assertAfterBarrier(plan, {afterBarrier, aDuring, selected}) {
  assert(afterBarrier?.request && afterBarrier.operation, 'Actual MAIN post-dispatch GET barrier is missing');
  assert.equal(afterBarrier.request.method, 'GET');
  const afterURL = new URL(plan.afterURL);
  assert.equal(afterBarrier.request.url, afterURL.pathname + afterURL.search);
  if (afterBarrier.documentId !== undefined) assert.equal(afterBarrier.documentId, selected.documentId);
  assert.equal(aDuring?.documentId, selected.documentId);
  assert.deepEqual(aDuring?.proof, {token: plan.token, started: true});
}

function assertPageOperation(plan, observation) {
  const operation = observation.pageOperations[0];
  assert.equal(operation.tag, 'controller-operation');
  assert.equal(operation.runId, observation.run.runId);
  assert.equal(operation.submissionCount, 1);
  assert.equal(operation.envelope.identity.runId, observation.run.runId);
  assert.deepEqual(operation.envelope.identity, observation.admittedRun.identity);
  assert.equal(operation.envelope.operation.kind, 'user-script');
  assert.equal(operation.envelope.operation.method, 'eval');
  assert.deepEqual(decodeValue(operation.envelope.operation.args), [plan.content, {mode: 'statement'}]);
  assert.equal(operation.envelope.revision.sourceHash, plan.sourceSha256);
  for (const key of ['tabId', 'frameId', 'documentId']) assert.equal(operation.envelope.target[key], observation.selected[key]);
  assert(operation.dispatchAt >= observation.beforeBarrier.release.at, 'MAIN dispatch must follow Worker release');
  assert(operation.dispatchAt <= observation.afterBarrier.request.at, 'MAIN dispatch must precede its actual request barrier');
  if (plan.trigger === 'host-close') {
    assert(['effect_unknown','cancelled'].includes(operation.state));
  } else {
    assert.equal(operation.state, AFTER_OPERATION_STATES[plan.trigger]);
  }
  if (operation.state === 'effect_unknown') {
    assert.equal(operation.deliveryState, 'fenced');
    assert.equal(operation.failure?.code, plan.expectedError);
  } else {
    assert(['E_CANCELLED', 'E_TIMEOUT'].includes(operation.failure?.code));
    assert.equal(operation.failure.code, plan.trigger === 'host-close' ? 'E_CANCELLED' : plan.expectedError);
  }
  const receipts = operation.nativeReceipts ?? [];
  assert(receipts.every(receipt => receipt.requestId === operation.envelope.requestId));
  assert.equal(receipts.filter(receipt => receipt.stage === 'userScripts.execute').length <= 1, true);
}

function assertHostReopened(hostReopened) {
  assert.equal(typeof hostReopened?.closedTargetId, 'string');
  assert.equal(typeof hostReopened?.targetId, 'string');
  assert.notEqual(hostReopened.closedTargetId, hostReopened.targetId);
}

export function scriptFencePlan(definition, {stage, trigger, token, beforeURL, afterURL}) {
  assert.equal(definition?.id, SCRIPT_FENCE_ID);
  assert.equal(definition.required, true);
  assert.equal(definition.source?.symbol, 'ChromePage.addScriptTag');
  assert(STAGES.includes(stage), 'Unknown script fence stage');
  assert(TRIGGERS.includes(trigger), 'Unknown script fence trigger');
  assert.match(token, /^[A-Za-z0-9._:-]{1,64}$/);
  beforeURL = assertURL(beforeURL, 'beforeURL');
  afterURL = assertURL(afterURL, 'afterURL');
  assert.notEqual(beforeURL, afterURL);
  const content = [
    `globalThis.__opendeskFenceProof=${JSON.stringify({token, started: true})};`,
    `await fetch(${JSON.stringify(afterURL)});`,
    'globalThis.__opendeskFenceProof.finished=true;',
    `document.querySelector('#marker').textContent=${JSON.stringify(`effect:${token}`)};`
  ].join('');
  const source = [
    'await axiosx.get(params.beforeURL);',
    ...(stage === 'before' && trigger === 'deadline' ? ['await new Promise(()=>{});'] : []),
    'await page.addScriptTag({content:params.content});',
    `return {caseId:${JSON.stringify(SCRIPT_FENCE_ID)},unexpectedContinuation:true};`
  ].join('');
  return {
    caseId: SCRIPT_FENCE_ID,
    definition,
    contractSha256: sha(JSON.stringify(definition)),
    stage,
    trigger,
    token,
    beforeURL,
    afterURL,
    source,
    sourceSha256: sha(source),
    content,
    contentSha256: sha(content),
    params: {beforeURL, afterURL, content, token},
    expectedError: EXPECTED_ERRORS[trigger],
    expectedOperationState: stage === 'after' ? AFTER_OPERATION_STATES[trigger] : null,
    nativePass: false
  };
}

export function validateScriptFenceOracle(plan, o) {
  assert.equal(plan?.caseId, SCRIPT_FENCE_ID);
  assert(STAGES.includes(plan.stage));
  assert(TRIGGERS.includes(plan.trigger));
  assert.equal(plan.expectedError, EXPECTED_ERRORS[plan.trigger]);
  const {selected, revision, run, result, beforeResources, afterResources, bBefore, bAfter, bActive, beforeBarrier, pageOperations = []} = o;
  assertIdentityRevision(run, result, revision, plan.sourceSha256, o.admittedRun);
  assertTarget(selected, run);
  assert.equal(result.outcome?.ok, false, 'Fence case must not become a successful continuation');
  assert.equal(result.outcome.error?.code, plan.expectedError);
  assert.equal(run.terminalReason?.code ?? run.terminalReason, plan.expectedError);
  if (plan.trigger === 'deadline') {
    assert(['stopped','failed'].includes(result.state), 'Deadline must have a failed terminal outcome');
    assert.equal(o.triggerAt.at, o.admittedRun.deadlineAt);
    assert(result.committedAt >= o.admittedRun.deadlineAt, 'Timeout result cannot precede the controller deadline');
  } else {
    assert.equal(result.state, plan.trigger === 'host-close' ? 'interrupted' : 'stopped');
  }
  assert.deepEqual(requireResourceCounts(afterResources), requireResourceCounts(beforeResources));
  assertBUnchanged({bBefore, bAfter, bActive});
  assertBeforeBarrier(plan, {run, beforeBarrier});
  const at = triggerTime(o.triggerAt);
  assert.equal(o.triggerAt.trigger, plan.trigger);
  assert.equal(o.triggerAt.stage, plan.stage);
  assert.equal(o.triggerAt.runId, run.runId);
  assert.equal(o.selected.documentId, o.bBefore.selectedA?.documentId ?? o.selected.documentId);
  if (plan.stage === 'before') {
    assert(beforeBarrier.request.at <= at, 'Before-stage trigger must follow the Worker request');
    if (plan.trigger === 'deadline') {
      assert.equal(at, o.admittedRun.deadlineAt, 'Deadline trigger must use the admitted controller deadline');
      assert(beforeBarrier.release?.at < at, 'Short HTTP service must complete before the controller deadline');
      const completed = beforeBarrier.completedOperation;
      assert.equal(completed?.requestId, beforeBarrier.pendingOperation.requestId);
      assert.equal(completed?.state, 'durable');
      assert.equal(completed?.submissionCount, 1);
      assert.equal(completed.reply?.error, undefined);
      assert(completed.receiptAt >= beforeBarrier.release.at && completed.receiptAt < at);
      assert(result.committedAt >= at, 'Short-service timeout cannot stand in for the controller deadline');
    } else {
      assert(beforeBarrier.release?.at >= at, 'Before-stage Worker release must happen after the trigger');
    }
    assert.equal(pageOperations.length, 0, 'Before-stage fence must have zero page operations');
    assert.equal(o.afterBarrier, undefined);
    assert.equal(o.aDuring, undefined);
    assert.equal(o.aAfter?.proof, undefined);
  } else {
    assert(beforeBarrier.release?.at <= at, 'After-stage trigger must follow Worker release');
    assert.equal(pageOperations.length, 1, 'After-stage fence must have one page operation');
    assertAfterBarrier(plan, o);
    assertPageOperation(plan, {...o, pageOperations});
    assert(o.afterBarrier.request.at <= at, 'After-stage trigger must follow MAIN request barrier');
    assert.equal(o.aDuring.documentId, selected.documentId);
    assert.equal(o.aDuring.proof.token, plan.token);
    assert.equal(o.aDuring.proof.started, true);
    if (o.aAfter?.proof?.finished === true || o.aAfter?.markerText === `effect:${plan.token}`) {
      assert.equal(o.aAfter.conservativeEffectRecorded, true, 'Observed MAIN side effect must come from actual conservative effect accounting');
    }
  }
  if (plan.trigger === 'host-close') assertHostReopened(o.hostReopened);
  return {
    formalAccepted: false,
    caseId: SCRIPT_FENCE_ID,
    stage: plan.stage,
    trigger: plan.trigger,
    expectedError: plan.expectedError,
    pageDispatches: pageOperations.length,
    effectState: pageOperations[0]?.state ?? 'none',
    resourcesReleased: true,
    bUnchanged: true,
    blindReplayPrevented: true
  };
}
