// Web Flow application data only; parsing never grants execution authority.
const PROTOCOL = 'opendesk.workflow.handoff.v1';
const SCHEMA = 'E_HANDOFF_SCHEMA';
const SCOPE = 'E_HANDOFF_SCOPE';
const EXPIRED = 'E_HANDOFF_EXPIRED';

const KEY_FIELDS = ['protocol', 'workflowId', 'stepId', 'handoffId'];
const ROOT_FIELDS = [
  'protocol', 'workflowId', 'stepId', 'handoffId', 'attemptId', 'idempotencyKey',
  'source', 'target', 'returnTo', 'objective', 'summary', 'evidenceRefs',
  'allowedFiles', 'verificationCommands', 'expectedArtifacts', 'authorizationRef',
  'limits', 'stopConditions', 'createdAt', 'expiresAt',
];
const SOURCE_FIELDS = ['adapter', 'conversationId', 'turnId'];
const TARGET_FIELDS = [
  'adapter', 'hostId', 'projectId', 'repoUrl', 'ref', 'baseCommit', 'threadId',
];
const LIMIT_FIELDS = ['maxSteps', 'maxHandoffs', 'deadlineAt'];
const EVIDENCE_FIELDS = ['kind', 'id', 'sha256'];
const OPTION_FIELDS = ['now', 'expectedSource', 'expectedTarget'];

function fail(code = SCHEMA) {
  const message = code === SCOPE
    ? 'Workflow handoff scope is invalid.'
    : code === EXPIRED
      ? 'Workflow handoff is outside its valid time window.'
      : 'Workflow handoff schema is invalid.';
  throw Object.assign(new Error(message), { code });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataField(value, key, code = SCHEMA) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    fail(code);
  }
  return descriptor.value;
}

function closedObject(value, fields, code = SCHEMA) {
  if (!isPlainObject(value)) fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) {
    fail(code);
  }
  for (const field of fields) dataField(value, field, code);
}

function text(value, maximum, code = SCHEMA) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum
      || value.trim() !== value || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    fail(code);
  }
}

function token(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128
      || /[^A-Za-z0-9._:-]/.test(value)) {
    fail();
  }
}

function digest(value, length, code = SCHEMA) {
  if (typeof value !== 'string' || value.length !== length || /[^0-9a-f]/.test(value)) {
    fail(code);
  }
}

function timestamp(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail();
}

function sourceIdentity(value, code = SCHEMA) {
  closedObject(value, SOURCE_FIELDS, code);
  if (value.adapter !== 'chatgpt-web') fail(code);
  text(value.conversationId, 256, code);
  text(value.turnId, 256, code);
}

function repositoryUrl(value, code) {
  text(value, 256, code);
  const prefix = 'https://github.com/';
  if (!value.startsWith(prefix)) fail(code);
  const parts = value.slice(prefix.length).split('/');
  if (parts.length !== 2) fail(code);
  const [owner, repository] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(owner)
      || !/^[A-Za-z0-9._-]+$/.test(repository)
      || repository === '.' || repository === '..'
      || repository.toLowerCase().endsWith('.git')) {
    fail(code);
  }
}

function branchRef(value, code) {
  text(value, 256, code);
  const prefix = 'refs/heads/';
  if (!value.startsWith(prefix)) fail(code);
  const branch = value.slice(prefix.length);
  if (!branch || branch.startsWith('-') || value.includes('..')
      || value.includes('@{') || value.endsWith('.')
      || /[ ~^:?*]/.test(value) || value.includes('[') || value.includes('\\')) {
    fail(code);
  }
  for (const part of branch.split('/')) {
    if (!part || part.startsWith('.') || part.endsWith('.lock')) fail(code);
  }
}

function targetIdentity(value, code = SCHEMA) {
  closedObject(value, TARGET_FIELDS, code);
  if (value.adapter !== 'codex-local' || value.threadId !== null) fail(code);
  text(value.hostId, 256, code);
  text(value.projectId, 256, code);
  repositoryUrl(value.repoUrl, code);
  branchRef(value.ref, code);
  digest(value.baseCommit, 40, code);
}

function arrayBounds(value, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail();
  }
}

function relativePath(value) {
  if (value.startsWith('/') || value.includes('\\') || value.includes(':')) fail();
  for (const part of value.split('/')) {
    if (!part || part === '.' || part === '..') fail();
  }
}

function stringArray(value, minimum, maximum, paths = false) {
  arrayBounds(value, minimum, maximum);
  const seen = new Set();
  for (const item of value) {
    text(item, 512);
    if (paths) relativePath(item);
    if (seen.has(item)) fail();
    seen.add(item);
  }
  return seen;
}

function evidenceArray(value) {
  arrayBounds(value, 1, 16);
  const seen = new Set();
  for (const reference of value) {
    closedObject(reference, EVIDENCE_FIELDS);
    if (!['durable-result', 'artifact', 'conversation-turn'].includes(reference.kind)) {
      fail();
    }
    text(reference.id, 512);
    digest(reference.sha256, 64);
    const key = JSON.stringify([reference.kind, reference.id, reference.sha256]);
    if (seen.has(key)) fail();
    seen.add(key);
  }
}

function matchIdentity(actual, expected, fields) {
  if (fields.some(field => actual[field] !== expected[field])) fail(SCOPE);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createWorkflowHandoffKey(input) {
  closedObject(input, KEY_FIELDS);
  if (input.protocol !== PROTOCOL) fail();
  token(input.workflowId);
  token(input.stepId);
  token(input.handoffId);
  return JSON.stringify([input.protocol, input.workflowId, input.stepId, input.handoffId]);
}

export function parseWorkflowHandoff(json, options) {
  if (typeof json !== 'string' || json.length > 32768
      || new TextEncoder().encode(json).byteLength > 32768) {
    fail();
  }

  let handoff;
  try {
    handoff = JSON.parse(json);
  } catch {
    fail();
  }

  closedObject(handoff, ROOT_FIELDS);
  const key = createWorkflowHandoffKey({
    protocol: handoff.protocol,
    workflowId: handoff.workflowId,
    stepId: handoff.stepId,
    handoffId: handoff.handoffId,
  });
  token(handoff.attemptId);
  token(handoff.authorizationRef);
  if (handoff.idempotencyKey !== key) fail();

  sourceIdentity(handoff.source);
  targetIdentity(handoff.target);
  sourceIdentity(handoff.returnTo);
  text(handoff.objective, 4096);
  text(handoff.summary, 4096);
  evidenceArray(handoff.evidenceRefs);
  const allowedFiles = stringArray(handoff.allowedFiles, 0, 32, true);
  stringArray(handoff.expectedArtifacts, 1, 32, true);
  stringArray(handoff.verificationCommands, 0, 8);
  stringArray(handoff.stopConditions, 1, 16);

  closedObject(handoff.limits, LIMIT_FIELDS);
  if (handoff.limits.maxSteps !== 2 || handoff.limits.maxHandoffs !== 1) fail();
  timestamp(handoff.createdAt);
  timestamp(handoff.expiresAt);
  timestamp(handoff.limits.deadlineAt);
  if (handoff.expiresAt > handoff.limits.deadlineAt) fail();

  if (!isPlainObject(options)) fail(SCOPE);
  const expectedSource = dataField(options, 'expectedSource', SCOPE);
  const expectedTarget = dataField(options, 'expectedTarget', SCOPE);
  sourceIdentity(expectedSource, SCOPE);
  targetIdentity(expectedTarget, SCOPE);
  const now = dataField(options, 'now');
  timestamp(now);
  if (Reflect.ownKeys(options).some(field => !OPTION_FIELDS.includes(field))) fail();

  matchIdentity(handoff.source, expectedSource, SOURCE_FIELDS);
  matchIdentity(handoff.returnTo, expectedSource, SOURCE_FIELDS);
  matchIdentity(handoff.target, expectedTarget, TARGET_FIELDS);
  for (const artifact of handoff.expectedArtifacts) {
    if (!allowedFiles.has(artifact)) fail(SCOPE);
  }
  if (handoff.createdAt > now || handoff.expiresAt <= now) fail(EXPIRED);

  return deepFreeze(handoff);
}
