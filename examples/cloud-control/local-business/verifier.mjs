const LIMIT = 32768;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const taskKeys = ['taskId', 'version', 'manifestHash', 'sourceHash'];
const validTask = task => exact(task, taskKeys) && typeof task.taskId === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(task.taskId) && typeof task.version === 'string' &&
  task.version.length <= 24 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(task.version) &&
  hash(task.manifestHash) && hash(task.sourceHash);
const validParams = value => exact(value, ['recordKey', 'name', 'status']) &&
  text(value.recordKey, 150) && text(value.name, 200) && text(value.status, 80);
const sameParams = (left, right) => ['recordKey', 'name', 'status'].every(k => left[k] === right[k]);
const row = value => ({recordKey:value.recordKey, name:value.name, status:value.status});

/** Independent read-only evidence. sessionFetch must be a caller-owned, fixed-subject
 * Fetch-compatible wrapper; this module never obtains or refreshes a login.
 * VERIFIED means current state matches the stored intent, never Run causation.
 */
export async function verifyBusinessResult({recordsOrigin, jobId, sessionFetch, allowResult = false, expectedTask} = {}) {
  const checks = {};
  let taskPin;
  const safeJobId = text(jobId, 200) ? jobId : undefined;
  const result = (status, details) => ({status, causation:'NOT_PROVEN', checks:{...checks},
    ...(safeJobId ? {jobId:safeJobId} : {}), ...(taskPin ? {taskPin} : {}),
    ...(allowResult === true && details ? details : {})});
  let origin;
  try {
    const url = new URL(recordsOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error();
    // Plain HTTP is allowed only for this local fixture's loopback origins.
    if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error();
    origin = url.origin;
  } catch { checks.input = 'INVALID_ORIGIN'; return result('NOT_RUN'); }
  if (!safeJobId || typeof sessionFetch !== 'function' ||
      (expectedTask !== undefined && !validTask(expectedTask))) {
    checks.input = 'INVALID_INPUT'; return result('NOT_RUN');
  }
  // Snapshot caller-owned trusted pins before any asynchronous work.
  const trustedTask = expectedTask === undefined ? undefined : {...expectedTask};
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error()); }, 8000);
  });
  const get = async (path, key, value) => {
    if (controller.signal.aborted) throw new Error();
    const url = new URL(path, origin);
    url.searchParams.set(key, value);
    const response = await sessionFetch(url.href, {method:'GET', redirect:'error',
      cache:'no-store', signal:controller.signal});
    if (controller.signal.aborted) throw new Error();
    if (!response || response.redirected || (response.url && response.url !== url.href) ||
        response.status !== 200) throw new Error();
    const contentType = response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase();
    const length = response.headers?.get('content-length');
    if (contentType !== 'application/json' || (length !== null && length !== undefined &&
        (!/^\d+$/.test(length) || Number(length) > LIMIT))) throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancel, {once:true});
    const chunks = []; let size = 0, complete = false;
    try {
      for (;;) {
        const {done, value:chunk} = await reader.read();
        if (controller.signal.aborted) throw new Error();
        if (done) { complete = true; break; }
        size += chunk.byteLength;
        if (size > LIMIT) throw new Error();
        chunks.push(chunk);
      }
    } finally {
      controller.signal.removeEventListener('abort', cancel);
      if (!complete) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  };
  const verify = async () => {
    checks.context = 'UNAVAILABLE';
    const context = await get('/api/verification-context', 'jobId', safeJobId);
    if (!exact(context, ['requestKey', 'jobId', 'executionKey', 'task', 'action', 'params'])) {
      checks.context = 'INVALID'; return result('INCONCLUSIVE');
    }
    checks.job = context.jobId === safeJobId && text(context.requestKey, 150) && hash(context.executionKey) ? 'PASS' : 'MISMATCH';
    checks.task = validTask(context.task) ? 'PASS' : 'MISMATCH';
    if (checks.task === 'PASS') {
      taskPin = {...context.task};
      if (trustedTask && !taskKeys.every(k => trustedTask[k] === taskPin[k])) checks.task = 'MISMATCH';
    }
    checks.context = validParams(context.params) && ['create', 'update'].includes(context.action) ? 'PASS' : 'MISMATCH';
    if (Object.values(checks).includes('MISMATCH')) return result('MISMATCH');
    checks.execution = 'UNAVAILABLE';
    const execution = await get('/api/execution', 'executionKey', context.executionKey);
    checks.execution = exact(execution, ['action', 'params']) && validParams(execution.params) &&
      execution.action === context.action && sameParams(execution.params, context.params) ? 'PASS' : 'MISMATCH';
    if (checks.execution !== 'PASS') return result('MISMATCH');
    checks.record = 'UNAVAILABLE';
    const observed = await get('/api/records', 'recordKey', context.params.recordKey);
    if (!exact(observed, ['records']) || !Array.isArray(observed.records)) {
      checks.record = 'INVALID'; return result('INCONCLUSIVE');
    }
    const records = observed.records;
    checks.record = records.length === 1 && exact(records[0], ['recordKey', 'name', 'status', 'updatedAt']) &&
      validParams(row(records[0])) && typeof records[0].updatedAt === 'string' &&
      Number.isFinite(Date.parse(records[0].updatedAt)) && sameParams(records[0], context.params) ? 'PASS' : 'MISMATCH';
    // Only project approved business fields. Never forward arbitrary response fields.
    const details = {expected:row(context.params), observed:records.filter(value => object(value) &&
      validParams(row(value))).map(value => row(value))};
    return result(checks.record === 'PASS' ? 'VERIFIED' : 'MISMATCH', details);
  };
  try { return await Promise.race([verify(), deadline]); }
  catch { return result('INCONCLUSIVE'); }
  finally { clearTimeout(timer); controller.abort(); }
}
