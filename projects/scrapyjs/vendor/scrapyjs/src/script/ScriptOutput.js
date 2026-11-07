'use strict';

const Item = require('../item/Item');
const { validateValue } = require('../../packages/recipe-contract');
const CAPS = Object.freeze({ maxDepth: 32, maxBytes: 1048576 });
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fault(code, message, stage = 'output') {
  return Object.assign(new Error(message || code), { code, errorCode: code, stage });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function plain(value) {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
// Clone descriptors rather than stringify user objects: getters and toJSON must never run.
function snapshot(value, limits = CAPS) {
  let bytes = 0;
  const ancestors = new Set();
  const encoder = new TextEncoder();
  function charge(text) {
    bytes += encoder.encode(text).byteLength;
    if (bytes > limits.maxBytes) throw fault('E_OUTPUT_SIZE', 'Output exceeds the byte limit');
  }
  function visit(input, depth) {
    if (depth > limits.maxDepth) throw fault('E_OUTPUT_DEPTH', 'Output exceeds the depth limit');
    if (input === null || typeof input === 'boolean' || typeof input === 'string' ||
        (typeof input === 'number' && Number.isFinite(input))) {
      charge(JSON.stringify(input)); return Object.is(input, -0) ? 0 : input;
    }
    const array = Array.isArray(input);
    if (!input || (!array && !plain(input)) || (array && Object.getPrototypeOf(input) !== Array.prototype))
      throw fault('E_OUTPUT_TYPE', 'Output must be plain JSON data');
    if (ancestors.has(input)) throw fault('E_OUTPUT_TYPE', 'Output contains a cycle');
    ancestors.add(input);
    const keys = Reflect.ownKeys(input);
    const length = array ? Object.getOwnPropertyDescriptor(input, 'length')?.value : null;
    if (array && (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1 || !keys.includes('length')))
      throw fault('E_OUTPUT_TYPE', 'Arrays must be dense and have no extra properties');
    const result = array ? [] : {};
    charge(array ? '[]' : '{}');
    let count = 0;
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== 'string' || forbidden.has(key) || !descriptor || !own(descriptor, 'value') || !descriptor.enumerable ||
          (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)))
        throw fault('E_OUTPUT_TYPE', 'Output contains unsupported properties');
      if (count++) charge(',');
      if (!array) charge(JSON.stringify(key) + ':');
      result[key] = visit(descriptor.value, depth + 1);
    }
    ancestors.delete(input);
    return result;
  }
  return freeze(visit(value, 0));
}
function checkSchema(schema) {
  const keys = ['type', 'properties', 'required', 'additionalProperties', 'minimum', 'maximum', 'format', 'enum', 'items', 'minItems', 'maxItems'];
  if (!plain(schema) || Object.keys(schema).some(key => !keys.includes(key))) throw fault('E_OUTPUT_CONTRACT', 'Unsupported result schema', 'load');
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.length || types.some(type => !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type)))
    throw fault('E_OUTPUT_CONTRACT', 'Invalid schema type', 'load');
  if (own(schema, 'properties')) {
    if (!plain(schema.properties)) throw fault('E_OUTPUT_CONTRACT', 'Invalid schema properties', 'load');
    Object.values(schema.properties).forEach(checkSchema);
  }
  if (own(schema, 'required') && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string' || !own(schema.properties || {}, key))))
    throw fault('E_OUTPUT_CONTRACT', 'Invalid schema required fields', 'load');
  if (own(schema, 'items')) checkSchema(schema.items);
  if (own(schema, 'additionalProperties') && typeof schema.additionalProperties !== 'boolean') throw fault('E_OUTPUT_CONTRACT', 'Invalid additionalProperties', 'load');
  if (own(schema, 'format') && schema.format !== 'uri') throw fault('E_OUTPUT_CONTRACT', 'Unsupported schema format', 'load');
  if (own(schema, 'enum') && (!Array.isArray(schema.enum) || !schema.enum.length)) throw fault('E_OUTPUT_CONTRACT', 'Invalid schema enum', 'load');
  for (const key of ['minimum', 'maximum', 'minItems', 'maxItems']) {
    if (own(schema, key) && (!Number.isFinite(schema[key]) || (key.endsWith('Items') && (!Number.isSafeInteger(schema[key]) || schema[key] < 0))))
      throw fault('E_OUTPUT_CONTRACT', 'Invalid schema bound', 'load');
  }
  if (schema.minimum > schema.maximum || schema.minItems > schema.maxItems) throw fault('E_OUTPUT_CONTRACT', 'Inverted schema bounds', 'load');
}
function validateDescriptor(input) {
  let descriptor;
  try { descriptor = snapshot(input); }
  catch (error) { throw fault('E_OUTPUT_CONTRACT', error.message, 'load'); }
  const allowed = ['schemaVersion', 'resultContract', 'consumer', 'resultSchema', 'limits'];
  if (!plain(descriptor) || Object.keys(descriptor).some(key => !allowed.includes(key)) || descriptor.schemaVersion !== 1 ||
      !['slot-v1', 'legacy-return'].includes(descriptor.resultContract) || !['ui-json', 'callback-items'].includes(descriptor.consumer))
    throw fault('E_OUTPUT_CONTRACT', 'Explicit version, result contract and consumer are required', 'load');
  if (descriptor.resultSchema != null) checkSchema(descriptor.resultSchema);
  if (own(descriptor, 'limits')) {
    if (!plain(descriptor.limits) || Object.keys(descriptor.limits).some(key => !own(CAPS, key)) ||
        Object.values(descriptor.limits).some(value => !Number.isSafeInteger(value) || value < 1))
      throw fault('E_OUTPUT_CONTRACT', 'Output limits must be positive integers', 'load');
  }
  return descriptor;
}
function limitsFor(descriptor, options) {
  const limits = {};
  for (const key of Object.keys(CAPS)) {
    const cap = options[key] ?? CAPS[key];
    if (!Number.isSafeInteger(cap) || cap < 1) throw fault('E_OUTPUT_CONTRACT', 'Invalid host output limit', 'load');
    limits[key] = Math.min(CAPS[key], cap, descriptor.limits?.[key] ?? CAPS[key]);
  }
  return limits;
}
function checkOutput(data, descriptor) {
  if (descriptor.resultSchema != null) {
    try { validateValue(descriptor.resultSchema, data, 'result'); }
    catch (error) { throw fault('E_OUTPUT_SCHEMA', error.message); }
  }
  if (descriptor.consumer === 'callback-items' && data !== null &&
      !(plain(data) || (Array.isArray(data) && data.every(plain))))
    throw fault('E_OUTPUT_CONSUMER', 'Callback output must be null, an object, or an array of objects');
}
function errorData(error, fallbackCode = 'E_SCRIPT_EXECUTION', stage = 'script') {
  const read = key => {
    try { const descriptor = Object.getOwnPropertyDescriptor(Object(error), key); return descriptor && own(descriptor, 'value') ? descriptor.value : undefined; }
    catch { return undefined; }
  };
  const code = read('errorCode') ?? read('code');
  const ownMessage = read('message');
  const value = ownMessage === undefined ? error : ownMessage;
  // Diagnostics must never call user getters/toString or return non-JSON values.
  const message = value === null || ['string', 'number', 'boolean', 'undefined', 'bigint', 'symbol'].includes(typeof value)
    ? String(value).slice(0, 4096) : 'Execution failed; exception details are unavailable';
  const ownStage = read('stage');
  return {
    errorCode: typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : fallbackCode,
    error: message,
    stage: typeof ownStage === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(ownStage) ? ownStage : stage,
  };
}
async function run(step, context = {}, options = {}) {
  const requestId = typeof options.requestId === 'string' ? options.requestId : null;
  let descriptor, limits, signal;
  try {
    if (options.requestId != null && (typeof options.requestId !== 'string' || !options.requestId.length || options.requestId.length > 256))
      throw fault('E_OUTPUT_CONTRACT', 'Invalid request identity', 'load');
    descriptor = validateDescriptor(step?.descriptor); limits = limitsFor(descriptor, options);
    if (typeof step.execute !== 'function' || (descriptor.resultContract === 'legacy-return' && descriptor.consumer === 'callback-items'))
      throw fault('E_OUTPUT_CONTRACT', 'Use callback() for legacy callback modules', 'load');
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2147483647))
      throw fault('E_OUTPUT_CONTRACT', 'Invalid execution timeout', 'load');
    if (options.cleanup !== undefined && typeof options.cleanup !== 'function') throw fault('E_OUTPUT_CONTRACT', 'Invalid cleanup', 'load');
    signal = options.signal ?? context.ctx?.signal;
    if (signal !== undefined && (!signal || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'))
      throw fault('E_OUTPUT_CONTRACT', 'Invalid cancellation signal', 'load');
  } catch (error) { return { success: false, requestId, ...errorData(error, 'E_OUTPUT_CONTRACT', 'load') }; }

  // 是否赋值单独记录，null、[]、false 都是有效输出，不能按真假判断。
  let closed = false, finalized = false, hasOutput = false, hasPrimaryError = false, data, terminal, primary, cleanupError, timer;
  const closedErrors = new WeakSet();
  const deadline = options.timeoutMs === undefined ? Infinity : performance.now() + options.timeoutMs;
  const controller = new AbortController();
  // 每次调用独立提供结果槽；赋值只保存快照，不结束正文。
  const sys = Object.freeze(Object.defineProperty({}, 'result', {
    enumerable: true,
    get() { return data; },
    set(value) {
      if (closed) {
        const error = fault('E_OUTPUT_CLOSED', 'This invocation has ended'); closedErrors.add(error); throw error;
      }
      const next = snapshot(value, limits);
      checkOutput(next, descriptor);
      data = next; hasOutput = true;
    },
  }));
  const invocation = { ...context, ctx: Object.freeze({ ...context.ctx, signal: controller.signal }), __sys: sys };
  function terminate(code, message) {
    if (finalized || terminal) return;
    terminal = fault(code, message, 'script'); closed = true;
    controller.abort(terminal);
  }
  const cancel = () => terminate('E_SCRIPT_CANCELLED', 'Execution was cancelled');
  const checkDeadline = () => { if (performance.now() >= deadline) terminate('E_SCRIPT_TIMEOUT', 'Execution deadline expired'); };
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  if (!closed && options.timeoutMs !== undefined) timer = setTimeout(() => terminate('E_SCRIPT_TIMEOUT', 'Execution deadline expired'), options.timeoutMs);
  try {
    if (!terminal) {
      const returned = await step.execute(invocation);
      // 只有显式 legacy-return 才接收旧 return；新正文必须写结果槽。
      if (descriptor.resultContract === 'legacy-return') {
        if (returned !== undefined) sys.result = returned;
      } else if (returned !== undefined) throw fault('E_OUTPUT_RETURN', 'slot-v1 steps assign __sys.result instead of returning a value');
    }
  } catch (error) {
    // Attribute only errors emitted by this invocation. A business error merely named AbortError stays primary.
    if (!(terminal && (error === terminal || closedErrors.has(error)))) { primary = error; hasPrimaryError = true; }
  } finally {
    closed = true;
    checkDeadline();
  }
  // 取消后也等正文与清理排空，再交付结果，避免宿主提前释放共享页面。
  try { if (options.cleanup) await options.cleanup(invocation, hasPrimaryError ? primary : terminal || null); }
  catch (error) { cleanupError = errorData(error, 'E_SCRIPT_CLEANUP', 'cleanup'); }
  finally {
    checkDeadline(); finalized = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  if (hasPrimaryError || terminal || cleanupError) {
    // 正文、取消/超时或清理任一失败，都不交付已暂存的数据。
    const result = { success: false, requestId, ...(hasPrimaryError ? errorData(primary) : terminal ? errorData(terminal) : cleanupError) };
    if (cleanupError && (hasPrimaryError || terminal)) result.cleanupError = cleanupError;
    return result;
  }
  const result = { success: true, requestId, resultMeta: { resultContract: descriptor.resultContract, consumer: descriptor.consumer, hasOutput } };
  if (hasOutput) result.data = data;
  return result;
}
async function callback(step, context = {}, options = {}) {
  const descriptor = validateDescriptor(step?.descriptor);
  if (descriptor.consumer !== 'callback-items' || typeof step.execute !== 'function') throw fault('E_OUTPUT_CONTRACT', 'Expected callback-items module', 'load');
  // 旧 callback 继续返回 Item/Request/迭代器，生命周期仍由原宿主管理。
  if (descriptor.resultContract === 'legacy-return') return step.execute(context);
  const result = await run(step, context, options);
  if (!result.success) {
    const error = fault(result.errorCode, result.error, result.stage);
    if (result.cleanupError) error.cleanupError = result.cleanupError;
    throw error;
  }
  if (!result.resultMeta.hasOutput) return undefined;
  if (result.data === null) return null;
  // Item must come from this SDK instance, the same instance used by Scheduler's instanceof check.
  return Array.isArray(result.data) ? result.data.map(record => new Item(record)) : new Item(result.data);
}
module.exports = Object.freeze({ validateDescriptor, run, callback });
