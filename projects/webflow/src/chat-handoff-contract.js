// Data-only ChatGPT -> ChatGPT handoff. Neither parsing nor storing grants execution.
// A separate version protects the existing Codex-only handoff.v1 contract.
export const CHAT_HANDOFF_PROTOCOL = 'opendesk.workflow.handoff.v2';
const SCHEMA = 'E_CHAT_HANDOFF_SCHEMA';
const SCOPE = 'E_CHAT_HANDOFF_SCOPE';
const EXPIRED = 'E_CHAT_HANDOFF_EXPIRED';
const MAX_BYTES = 32768;
const TOKEN = /^[A-Za-z0-9._:-]{8,128}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const ROOT = ['protocol', 'workflowId', 'stepId', 'handoffId', 'attemptId',
  'idempotencyKey', 'source', 'target', 'returnTo', 'objective', 'summary',
  'inputRefs', 'expectedResult', 'authorizationRef', 'stopConditions',
  'limits', 'createdAt', 'expiresAt'];
const SOURCE = ['adapter', 'profileId', 'conversationId', 'turnId'];
const TARGET = ['adapter', 'profileId', 'mode', 'conversationId'];
const REF = ['kind', 'id', 'sha256'];
const LIMITS = ['maxSteps', 'maxHandoffs', 'maxNewConversations', 'deadlineAt'];
const RESULT = ['kind', 'mustIncludeEvidence'];
const OPTIONS = ['now', 'expectedSource', 'expectedTarget',
  'expectedInputRefs', 'expectedAuthorizationRef'];

function fail(code = SCHEMA) {
  const messages = {[SCHEMA]: 'Chat handoff schema is invalid',
    [SCOPE]: 'Chat handoff is outside trusted source or destination scope',
    [EXPIRED]: 'Chat handoff is outside its time window'};
  throw Object.assign(new Error(messages[code]), {code});
}
function record(value, fields, code = SCHEMA) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))
    || fields.some(key => !Object.hasOwn(value, key))) fail(code);
}
function word(value, max = 256, code = SCHEMA) {
  if (typeof value !== 'string' || !value.length || value.length > max
    || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) fail(code);
}
function token(value) { if (typeof value !== 'string' || !TOKEN.test(value)) fail(); }
function time(value) { if (!Number.isSafeInteger(value) || value <= 0) fail(); }
function source(value, code = SCHEMA) {
  record(value, SOURCE, code);
  if (value.adapter !== 'chatgpt-web') fail(code);
  for (const name of ['profileId', 'conversationId', 'turnId']) word(value[name], 256, code);
}
function target(value, code = SCHEMA) {
  record(value, TARGET, code);
  if (value.adapter !== 'chatgpt-web' || value.mode !== 'create-new'
    || value.conversationId !== null) fail(code);
  word(value.profileId, 256, code);
}
function evidence(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) fail();
  const seen = new Set();
  for (const ref of value) {
    record(ref, REF);
    if (!['durable-result', 'artifact', 'conversation-turn', 'github-issue'].includes(ref.kind)) fail();
    word(ref.id, 512);
    if (typeof ref.sha256 !== 'string' || !HEX64.test(ref.sha256)) fail();
    const key = JSON.stringify([ref.kind, ref.id, ref.sha256]);
    if (seen.has(key)) fail();
    seen.add(key);
  }
}
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function createChatHandoffKey(value) {
  record(value, ['protocol', 'workflowId', 'stepId', 'handoffId']);
  if (value.protocol !== CHAT_HANDOFF_PROTOCOL) fail();
  for (const field of ['workflowId', 'stepId', 'handoffId']) token(value[field]);
  return JSON.stringify([value.protocol, value.workflowId, value.stepId, value.handoffId]);
}
export function parseChatHandoff(json, options) {
  if (typeof json !== 'string' || json.length > MAX_BYTES ||
    new TextEncoder().encode(json).length > MAX_BYTES) fail();
  let value;
  try { value = JSON.parse(json); } catch { fail(); }
  record(value, ROOT);
  const key = createChatHandoffKey({protocol:value.protocol,
    workflowId:value.workflowId, stepId:value.stepId, handoffId:value.handoffId});
  token(value.attemptId);
  token(value.authorizationRef); // Untrusted reference: downstream Host MUST verify.
  if (value.idempotencyKey !== key) fail();
  source(value.source);
  source(value.returnTo);
  target(value.target);
  if (SOURCE.some(field => value.returnTo[field] !== value.source[field])) fail(SCOPE);
  if (value.source.profileId !== value.target.profileId) fail(SCOPE);
  word(value.objective, 4096);
  word(value.summary, 4096);
  evidence(value.inputRefs);
  record(value.expectedResult, RESULT);
  if (value.expectedResult.kind !== 'assistant-reply' || value.expectedResult.mustIncludeEvidence !== true) fail();
  if (!Array.isArray(value.stopConditions) || !value.stopConditions.length || value.stopConditions.length > 8) fail();
  for (const item of value.stopConditions) word(item, 512);
  if (new Set(value.stopConditions).size !== value.stopConditions.length) fail();
  record(value.limits, LIMITS);
  if (value.limits.maxSteps !== 2 || value.limits.maxHandoffs !== 1
    || value.limits.maxNewConversations !== 1) fail();
  time(value.createdAt);time(value.expiresAt);time(value.limits.deadlineAt);
  if (value.expiresAt > value.limits.deadlineAt) fail();

  record(options, OPTIONS, SCOPE);
  time(options.now);
  source(options.expectedSource, SCOPE);
  target(options.expectedTarget, SCOPE);
  if (!Array.isArray(options.expectedInputRefs)) fail(SCOPE);
  try { evidence(options.expectedInputRefs); } catch { fail(SCOPE); }
  word(options.expectedAuthorizationRef, 128, SCOPE);
  if (SOURCE.some(field => value.source[field] !== options.expectedSource[field])
    || TARGET.some(field => value.target[field] !== options.expectedTarget[field])
    || value.authorizationRef !== options.expectedAuthorizationRef
    || value.inputRefs.length !== options.expectedInputRefs.length
    || value.inputRefs.some((ref, index) => REF.some(field =>
      ref[field] !== options.expectedInputRefs[index][field]))) fail(SCOPE);
  if (value.createdAt > options.now || value.expiresAt <= options.now) fail(EXPIRED);
  return freeze(value);
}
