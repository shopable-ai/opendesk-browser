import assert from 'node:assert/strict';

const AX_SELECTED_MARKER = 'ID: menuItemSelected:';

function requireObject(value, name) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value;
}

function requireString(value, name) {
  assert.equal(typeof value, 'string', `${name} must be a string`);
  assert.notEqual(value, '', `${name} must be non-empty`);
  return value;
}

function requireBooleanTrue(value, name) {
  assert.equal(value, true, `${name} must be true`);
  return value;
}

function requireTime(value, name) {
  assert.equal(typeof value, 'number', `${name} must be a number`);
  assert(Number.isFinite(value), `${name} must be finite`);
  assert(value > 0, `${name} must be a positive unix millisecond timestamp`);
  return value;
}

function requireIsoTime(value, name) {
  requireString(value, name);
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed), `${name} must parse as an ISO timestamp`);
  return parsed;
}

function uniqueByRequestId(rows, requestId, name) {
  const matches = rows.filter(row => row?.requestId === requestId);
  assert.equal(matches.length, 1, `${name} must contain exactly one matching requestId`);
  return matches[0];
}

function desiredOption(request) {
  const before = requireObject(request.before, 'request.before');
  assert(Array.isArray(before.options), 'request.before.options must be an array');
  assert(Number.isInteger(request.optionIndex), 'request.optionIndex must be an integer');
  assert(request.optionIndex >= 0 && request.optionIndex < before.options.length, 'request.optionIndex must select one option');
  const option = requireObject(before.options[request.optionIndex], 'request.before.options[optionIndex]');
  assert.equal(option.disabled, false, 'desired option must not be disabled');
  assert.equal(String(option.value), String(request.desired), 'desired option value must match request.desired');
  return {value: option.value, text: requireString(option.text, 'desired option text')};
}

function actualObservedOption(readback, name) {
  const actual = requireObject(readback, name);
  assert(Array.isArray(actual.options), `${name}.options must be an array`);
  assert(Number.isInteger(actual.selectedIndex), `${name}.selectedIndex must be an integer`);
  assert(actual.selectedIndex >= 0 && actual.selectedIndex < actual.options.length, `${name}.selectedIndex must select one option`);
  const option = requireObject(actual.options[actual.selectedIndex], `${name}.options[selectedIndex]`);
  return {value: actual.value, text: requireString(option.text, `${name} selected option text`)};
}

function textIncludes(haystack, needle, name) {
  requireString(haystack, name);
  assert(haystack.includes(needle), `${name} must include ${needle}`);
}

function nativeNotObserved(cause) {
  const error = new Error(`Native selection completion receipt was not observed: ${cause.message}`);
  error.code = 'E_NATIVE_NOT_OBSERVED';
  error.cause = cause;
  return error;
}

function requireMatchingReceipt({request, ack, witness, observation, finalDom}) {
  requireObject(request, 'request');
  requireObject(ack, 'ack');
  requireObject(witness, 'witness');
  requireObject(observation, 'observation');
  requireObject(finalDom, 'finalDom');

  assert.equal(request.state, 'native-selection-assist', 'request.state must be native-selection-assist');
  const requestId = requireString(request.requestId, 'request.requestId');
  const selector = requireString(request.selector, 'request.selector');
  const targetId = requireString(request.targetId, 'request.targetId');
  const desired = requireString(String(request.desired), 'request.desired');
  const uiLabel = requireString(request.uiLabel, 'request.uiLabel');
  const requestCreatedAt = requireTime(request.createdAt, 'request.createdAt');
  const option = desiredOption(request);

  for (const [name, artifact] of [['ack', ack], ['witness', witness], ['observation', observation]]) {
    assert.equal(artifact.requestId, requestId, `${name}.requestId must match request.requestId`);
  }
  assert.equal(ack.pid, request.pid, 'ack.pid must match request.pid');
  assert.equal(ack.targetId, targetId, 'ack.targetId must match request.targetId');
  assert.equal(ack.selector, selector, 'ack.selector must match request.selector');
  assert.equal(String(ack.desired), desired, 'ack.desired must match request.desired');
  if (Object.hasOwn(request, 'toolId')) assert.equal(ack.toolId, request.toolId, 'ack.toolId must match request.toolId');

  assert.equal(witness.pid, request.pid, 'witness.pid must match request.pid');
  assert.equal(witness.targetId, targetId, 'witness.targetId must match request.targetId');
  assert.equal(witness.selector, selector, 'witness.selector must match request.selector');
  assert.equal(String(witness.desired), desired, 'witness.desired must match request.desired');

  assert.equal(observation.targetId, targetId, 'observation.targetId must match request.targetId');
  assert.equal(observation.selector, selector, 'observation.selector must match request.selector');
  assert.equal(String(observation.desired), desired, 'observation.desired must match request.desired');

  requireBooleanTrue(ack.nativeInputComplete, 'ack.nativeInputComplete');
  requireBooleanTrue(ack.noDomAssignment, 'ack.noDomAssignment');
  requireBooleanTrue(ack.noSyntheticEvent, 'ack.noSyntheticEvent');
  const ackCompletedAt = requireIsoTime(ack.completedAt, 'ack.completedAt');
  const witnessCompletedAt = requireIsoTime(witness.completedAt, 'witness.completedAt');
  assert(ackCompletedAt >= requestCreatedAt, 'ack.completedAt must be at or after request.createdAt');
  assert(witnessCompletedAt >= requestCreatedAt, 'witness.completedAt must be at or after request.createdAt');
  assert(witnessCompletedAt <= ackCompletedAt, 'witness.completedAt must not be after ack.completedAt');
  requireString(ack.witnessPath, 'ack.witnessPath');
  if (Object.hasOwn(witness, 'path')) assert.equal(ack.witnessPath, witness.path, 'ack.witnessPath must match witness.path');

  assert(Array.isArray(witness.actualActions), 'witness.actualActions must be an array');
  assert(witness.actualActions.some(action => Number.isInteger(action?.clickMenuItem)), 'witness.actualActions must include clickMenuItem');
  textIncludes(witness.beforeAX, uiLabel, 'witness.beforeAX');
  textIncludes(witness.menuAX, AX_SELECTED_MARKER, 'witness.menuAX');
  textIncludes(witness.menuAX, option.text, 'witness.menuAX');
  textIncludes(witness.afterAX, uiLabel, 'witness.afterAX');
  textIncludes(witness.afterAX, option.text, 'witness.afterAX');
  textIncludes(ack.actualNativeAX, uiLabel, 'ack.actualNativeAX');
  textIncludes(ack.actualNativeAX, option.text, 'ack.actualNativeAX');

  const observedAt = requireTime(observation.at, 'observation.at');
  assert(observedAt >= ackCompletedAt, 'observation.at must be at or after ack.completedAt');
  const observed = actualObservedOption(observation.after, 'observation.after');
  assert.equal(String(observed.value), desired, 'observation.after.value must equal request.desired');
  assert.equal(observed.text, option.text, 'observation.after selected option label must match requested option label');

  const finalObserved = actualObservedOption(finalDom, 'finalDom');
  assert.equal(String(finalObserved.value), desired, 'finalDom.value must equal request.desired');
  assert.equal(finalObserved.text, option.text, 'finalDom selected option label must match requested option label');

  return {requestId, targetId, selector, desired, observedOptionLabel: observed.text, completedAt: ack.completedAt, observedAt};
}

export function validateNativeSelectionReceipt(input) {
  try {
    const candidate = requireObject(input, 'input');
    const request = requireObject(candidate.request, 'input.request');
    const requestId = requireString(request.requestId, 'input.request.requestId');
    const ack = candidate.acknowledgements ? uniqueByRequestId(candidate.acknowledgements, requestId, 'input.acknowledgements') : candidate.ack;
    const witness = candidate.witnesses ? uniqueByRequestId(candidate.witnesses, requestId, 'input.witnesses') : candidate.witness;
    const observation = candidate.observations ? uniqueByRequestId(candidate.observations, requestId, 'input.observations') : candidate.observation;
    const finalDom = candidate.finalDom;
    return requireMatchingReceipt({request, ack, witness, observation, finalDom});
  } catch (error) {
    throw nativeNotObserved(error);
  }
}
