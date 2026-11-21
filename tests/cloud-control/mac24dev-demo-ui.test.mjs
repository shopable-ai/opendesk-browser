import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';

// COMPONENT: real HTML and event handlers; synthetic HTTP/storage only.
// No Provider, Chrome Worker, live account or task execution is used here.
const base = new URL('../../examples/cloud-control/mac24dev-demo/', import.meta.url);
const html = readFileSync(new URL('index.html', base), 'utf8');
const script = readFileSync(new URL('app.js', base), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json', import.meta.url), 'utf8'));
const upgrade = JSON.parse(readFileSync(new URL('form-fill.v1.0.1.opendesk-task.json', base), 'utf8'));
const upgrades = [upgrade, JSON.parse(readFileSync(new URL('form-fill.v1.0.2.opendesk-task.json', base), 'utf8'))];
const key = '11111111-1111-4111-8111-111111111111';
const otherKey = '22222222-2222-4222-8222-222222222222';
const storedKey = 'opendesk.mac24dev-demo.request.v1.569';
const catalog = {
  providerId: '9c4f182d-7a5f-403d-9b4d-c2144ef35e5b',
  task: {taskId: 'sample.form-fill', version: '1.0.0',
    manifestHash: '57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a',
    sourceHash: '1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63',
    paramsSchema: pkg.manifest.paramsSchema},
  devices: [{id: 1288, nickname: 'Component device', readiness: 'READY'}],
};
const row = (overrides = {}) => ({requestKey: key, deviceId: 1288, taskId: 'sample.form-fill', version: '1.0.0',
  jobId: '33333333-3333-4333-8333-333333333333', state: 'queued', receiptConfirmed: false, cancelRequested: false, ...overrides});

for (const upgrade of upgrades) test(`reviewed fixed ${upgrade.manifest.version} submits its own version while old keys retain their original version`, async () => {
  const data = structuredClone(catalog);
  Object.assign(data.task, {version: upgrade.manifest.version, manifestHash: upgrade.manifestHash,
    sourceHash: upgrade.manifest.program.sourceHash});
  const f = fixture({catalogData: data, handle: (path, input) => path.endsWith('/submit')
    ? ok(row({requestKey: input.requestKey, version: input.version})) : undefined});
  await f.draft();
  assert.equal(f.$('submit').disabled, false);
  await f.submit('submit-form');
  const submits = f.calls.filter(c => c.path.endsWith('/submit'));
  assert.equal(submits.length, 1);
  assert.equal(submits[0].input.version, upgrade.manifest.version);
  assert.ok(f.$('request-details').textContent.includes(upgrade.manifest.version));

  const historical = fixture({catalogData: data});
  await historical.login(); await historical.lookup();
  assert.match(historical.$('request-details').textContent, /1\.0\.0/);
  assert.equal(historical.calls.some(c => c.path.endsWith('/submit')), false);
});

for (const upgrade of upgrades) test(`fixed ${upgrade.manifest.version} source and manifest remain exact; unknown versions cannot submit`, async () => {
  for (const change of [
    task => {task.sourceHash = 'e'.repeat(64);},
    task => {task.manifestHash = 'f'.repeat(64);},
    task => {task.version = '1.0.3';},
    task => {task.version = upgrade.manifest.version === '1.0.2' ? '1.0.1' : '1.0.2';},
  ]) {
    const data = structuredClone(catalog);
    Object.assign(data.task, {version: upgrade.manifest.version, manifestHash: upgrade.manifestHash,
      sourceHash: upgrade.manifest.program.sourceHash});
    change(data.task);
    const f = fixture({catalogData: data}); await f.draft();
    assert.equal(f.$('submit').disabled, true);
    await f.submit('submit-form');
    assert.equal(f.calls.some(c => c.path.endsWith('/submit')), false);
  }
});

test('an original request cannot switch to another allowed version during status recovery', async () => {
  const f = fixture({handle: path => path.endsWith('/status') ? ok(row({version: '1.0.1'})) : undefined});
  await f.draft(); await f.submit('submit-form');
  await f.click('status-refresh');
  assert.match(f.$('notice').textContent, /接口数据与约定不一致/);
  assert.equal(f.$('state').textContent, 'UNKNOWN');
  assert.equal(f.calls.filter(c => c.path.endsWith('/submit')).length, 1);
});
const ok = data => ({code: 1000, data});
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };

function fixture({storage = new Map(), catalogData = structuredClone(catalog), handle = () => undefined} = {}) {
  const {window, document} = parseHTML(html);
  const $ = id => document.getElementById(id);
  // linkedom lacks native select setters, form reset and Option constructor.
  // Model only those DOM boundaries; app business handlers are never replaced.
  Object.defineProperty($('device'), 'value', {writable: true, value: ''});
  $('device').add = option => $('device').append(option);
  $('login-form').reset = () => { $('username').value = ''; $('password').value = ''; };
  function Option(label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; }
  const calls = [];
  runInNewContext(script, {document, Option, URL, crypto: webcrypto, AbortController,
    setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)},
    fetch: async (path, options) => {
      const input = options.body ? JSON.parse(options.body) : undefined;
      calls.push({path, input, options});
      let answer = await handle(path, input, options);
      if (answer === undefined) {
        if (path.endsWith('/loginSimple')) answer = ok({token: 'component-access-token'});
        else if (path.endsWith('/person')) answer = ok({id: 569, username: 'component-user'});
        else if (path.endsWith('/catalog')) answer = ok(catalogData);
        else if (path.endsWith('/status')) answer = ok(row({requestKey: input.requestKey}));
        else if (path.endsWith('/history')) answer = ok([]);
        else if (path.endsWith('/submit')) answer = ok(row({requestKey: input.requestKey}));
        else if (path.endsWith('/cancel')) answer = ok(row({requestKey: input.requestKey, cancelRequested: true}));
        else throw Error('Unexpected test route');
      }
      if (answer instanceof Error) throw answer;
      return {ok: (answer.httpStatus ?? 200) < 400, status: answer.httpStatus ?? 200, json: async () => answer};
    },
  }, {filename: 'mac24dev-demo/app.js'});
  const event = (id, type) => $(id).dispatchEvent(new window.Event(type, {bubbles: true, cancelable: true}));
  const flush = async () => { await tick(); await tick(); };
  const click = async id => { assert.equal(Boolean($(id).disabled), false, `${id} must be enabled`); event(id, 'click'); await flush(); };
  const submit = async id => { event(id, 'submit'); await flush(); };
  const input = (id, value) => { $(id).value = value; event(id, id === 'device' ? 'change' : 'input'); };
  const login = async () => { input('username', 'component-user'); input('password', 'fixture-password'); await submit('login-form'); };
  const lookup = async (lookupKey = key) => { input('lookup-key', lookupKey); await submit('lookup-form'); };
  const draft = async () => { await login(); input('device', '1288'); await click('new-request'); input('name', 'Alice'); };
  return {$, calls, storage, event, flush, click, submit, input, login, lookup, draft};
}

test('missing original request gives a recovery instruction and cannot be cancelled or resubmitted', async () => {
  const f = fixture({handle: path => path.endsWith('/status') ? {code: 1001, message: 'E_REQUEST'} : undefined});
  await f.login(); await f.lookup();
  assert.match(f.$('notice').textContent, /未找到.*原请求/);
  assert.match(f.$('notice').textContent, /不要.*重新/);
  assert.equal(f.$('cancel').disabled, true);
  assert.equal(f.$('submit').disabled, true);
  assert.equal(f.calls.some(c => c.path.endsWith('/submit') || c.path.endsWith('/cancel')), false);
  assert.equal(f.storage.has(storedKey), false, 'unconfirmed lookup does not persist its key');
});

test('known conflicts and binding errors explain next action; unknown server content stays private', async () => {
  for (const [message, expected] of [
    ['E_CONFLICT', /内容不一致/], ['E_BINDING_CHANGED', /绑定已变化/],
    ['E_SCOPE', /授权范围/], ['E_DEVICE', /本人设备/], ['E_CONFIG', /维护者/],
    ['E_REQUEST secret-password <script>bad()</script>', /业务接口/],
  ]) {
    const f = fixture({handle: path => path.endsWith('/status') ? {code: 1001, message} : undefined});
    await f.login(); await f.lookup();
    assert.match(f.$('notice').textContent, expected);
    assert.doesNotMatch(f.$('notice').textContent, /secret-password|<script>|bad\(\)/);
  }
});

test('both hashes and exact parameter schema gate submission, not just task name/version', async () => {
  for (const change of [
    c => {c.task.manifestHash = 'a'.repeat(64);},
    c => {c.task.sourceHash = 'b'.repeat(64);},
    c => {c.task.paramsSchema.properties.name.maxLength = 100;},
    c => {c.task.paramsSchema.additionalProperties = true;},
  ]) {
    const data = structuredClone(catalog); change(data);
    const f = fixture({catalogData: data}); await f.draft();
    assert.equal(f.$('submit').disabled, true);
    await f.submit('submit-form');
    assert.equal(f.calls.some(c => c.path.endsWith('/submit')), false);
    assert.match(f.$('notice').textContent + f.$('task-label').textContent + f.$('device-status').textContent, /不一致|无法提交/);
  }
});

test('the fixed schema uses the same UTF-16 length as Task/BFF and preserves input bytes', async () => {
  const data = structuredClone(catalog);
  data.task.paramsSchema = Object.fromEntries(Object.entries(data.task.paramsSchema).reverse());
  const f = fixture({catalogData: data}); await f.draft();
  f.input('name', '😀'.repeat(20)); assert.equal(f.$('submit').disabled, false);
  f.input('name', '😀'.repeat(21)); assert.equal(f.$('submit').disabled, true);
  f.input('name', ' Alice '); await f.submit('submit-form');
  assert.equal(f.calls.find(c => c.path.endsWith('/submit')).input.params.name, ' Alice ');
  const blank = fixture(); await blank.draft(); blank.input('name', ' ');
  assert.equal(blank.$('submit').disabled, false, 'the frozen schema permits one space; do not invent a new restriction');
});

test('a fresh status read hides old result immediately, and a failed read keeps original-key recovery', async () => {
  const pending = deferred(); let count = 0;
  const f = fixture({handle: path => path.endsWith('/status') ? ++count === 1
    ? ok(row({state: 'completed', receiptConfirmed: true, retirementState: 'released', result: {state: 'completed', valueWire: 'prior-private-result'}}))
    : pending.promise : undefined});
  await f.login(); await f.lookup();
  assert.match(f.$('request-details').textContent, /prior-private-result/);
  f.event('status-refresh', 'click');
  assert.doesNotMatch(f.$('request-details').textContent, /prior-private-result/);
  pending.resolve(new Error('network lost')); await f.flush();
  assert.equal(f.$('state').textContent, 'UNKNOWN');
  assert.equal(f.$('request-key').textContent, key);
  assert.equal(f.$('cancel').disabled, true);
  assert.equal(f.storage.get(storedKey), key);
  assert.equal(f.calls.filter(c => c.path.endsWith('/status')).length, 2);
  assert.equal(f.calls.some(c => c.path.endsWith('/submit')), false);
});

test('cloud authorization rejection clears displayed data without confusing it with business logout', async () => {
  let revoked = false;
  const f = fixture({handle: path => path.endsWith('/status') ? revoked ? {code: 1001, message: 'E_AUTH'}
    : ok(row({result: {state: 'completed', valueWire: 'old-result'}})) : path.endsWith('/history') ? ok([row()]) : undefined});
  await f.login(); await f.lookup(); await f.click('history-refresh');
  revoked = true; await f.click('status-refresh');
  assert.doesNotMatch(f.$('request-details').textContent, /old-result/);
  assert.equal(f.$('history').children.length, 0);
  assert.match(f.$('notice').textContent, /授权/);
  assert.equal(f.$('login-form').hidden, true, 'Provider authorization failure is not an expired business JWT');
  assert.equal(f.storage.get(storedKey), key);
});

test('business session expiry clears private UI and keeps the original recovery key', async () => {
  const f = fixture({storage: new Map([[storedKey, key]]), handle: path => path.endsWith('/status') ? {httpStatus: 401} : undefined});
  await f.login(); await f.click('status-refresh');
  assert.equal(f.$('workspace').hidden, true);
  assert.equal(f.$('login-form').hidden, false);
  assert.equal(f.storage.get(storedKey), key);
  assert.doesNotMatch(f.$('request-details').textContent, /component-access-token/);
});

test('a successful catalog reporting revoked authorization hides prior result and history', async () => {
  const data = structuredClone(catalog);
  const f = fixture({catalogData: data, handle: path => path.endsWith('/status')
    ? ok(row({state: 'completed', receiptConfirmed: true, result: {valueWire: 'previous-result'}}))
    : path.endsWith('/history') ? ok([row()]) : undefined});
  await f.login(); await f.lookup(); await f.click('history-refresh');
  data.devices[0].readiness = 'NOT_AUTHORIZED'; data.devices[0].message = 'E_SCOPE';
  await f.click('catalog-refresh');
  assert.doesNotMatch(f.$('request-details').textContent, /previous-result/);
  assert.equal(f.$('history').children.length, 0);
  assert.equal(f.$('request-key').textContent, key);
  assert.match(f.$('device-status').textContent, /授权范围/);
  assert.equal(f.$('cancel').disabled, true);
});

test('unknown submit response freezes input and only queries the same key after reload', async () => {
  const storage = new Map();
  const f = fixture({storage, handle: path => path.endsWith('/submit') ? new Error('lost response') : undefined});
  await f.draft(); const original = f.$('request-key').textContent;
  await f.submit('submit-form'); await f.submit('submit-form');
  assert.equal(f.calls.filter(c => c.path.endsWith('/submit')).length, 1);
  assert.equal(f.$('device').disabled, true); assert.equal(f.$('name').disabled, true);
  assert.match(f.$('notice').textContent, /不会重试/);
  const reloaded = fixture({storage}); await reloaded.login(); await reloaded.click('status-refresh');
  assert.equal(reloaded.$('request-key').textContent, original);
  assert.equal(reloaded.calls.some(c => c.path.endsWith('/submit')), false);
  assert.equal(reloaded.calls.find(c => c.path.endsWith('/status')).input.requestKey, original);
  assert.deepEqual([...storage], [[storedKey, original]], 'only account-scoped UUID is stored');
});

test('lost cancellation acknowledgement remains unknown and does not retry cancel or submit', async () => {
  const f = fixture({handle: path => path.endsWith('/cancel') ? new Error('lost cancel response') : undefined});
  await f.login(); await f.lookup(); await f.click('cancel'); await f.click('cancel-yes');
  assert.equal(f.$('cancel').disabled, true);
  assert.equal(f.$('state').textContent, 'UNKNOWN');
  await f.click('status-refresh');
  assert.equal(f.$('cancel').disabled, true);
  assert.equal(f.calls.filter(c => c.path.endsWith('/cancel')).length, 1);
  assert.equal(f.calls.some(c => c.path.endsWith('/submit')), false);
});

test('stale or denied history is removed before refresh, and late responses after logout are ignored', async () => {
  let failed = false;
  const f = fixture({handle: path => path.endsWith('/history') ? failed ? new Error('offline') : ok([row()]) : undefined});
  await f.login(); await f.click('history-refresh'); assert.equal(f.$('history').children.length, 1);
  failed = true; await f.click('history-refresh'); assert.equal(f.$('history').children.length, 0);
  const pending = deferred();
  const late = fixture({handle: path => path.endsWith('/status') ? pending.promise : undefined});
  await late.login(); late.input('lookup-key', otherKey); late.event('lookup-form', 'submit');
  await late.click('logout'); pending.resolve(ok(row({requestKey: otherKey, result: {valueWire: 'late-private-data'}}))); await late.flush();
  assert.equal(late.$('workspace').hidden, true);
  assert.doesNotMatch(late.$('request-details').textContent, /late-private-data/);
});

test('status projections with another task or changed device are rejected and cannot cancel', async () => {
  let changed = false;
  const f = fixture({handle: path => path.endsWith('/status') ? ok(row(changed ? {deviceId: 999} : {})) : undefined});
  await f.login(); await f.lookup(); changed = true; await f.click('status-refresh');
  assert.match(f.$('notice').textContent, /接口数据/); assert.equal(f.$('cancel').disabled, true);
  const task = fixture({handle: path => path.endsWith('/status') ? ok(row({taskId: 'other-task'})) : undefined});
  await task.login(); await task.lookup(); assert.match(task.$('notice').textContent, /接口数据/);
});

test('a successful UNKNOWN observation translates safe reason codes without claiming cancellation or release', async () => {
  const f = fixture({handle: path => path.endsWith('/status') ? ok(row({state: 'UNKNOWN', message: 'E_PROVIDER', cancelRequested: true})) : undefined});
  await f.login(); await f.lookup();
  assert.match(f.$('notice').textContent, /连接|服务/);
  assert.match(f.$('notice').textContent, /原请求/);
  assert.equal(f.$('state').textContent, 'UNKNOWN');
  assert.equal(f.$('retirement').textContent, '未提供释放事实');
  assert.equal(f.$('receipt').textContent, '未确认（false）');
});


test('READY catalog never advertises submission for a recovered original key with locked inputs', async () => {
  const data = structuredClone(catalog);
  data.devices[0].nickname = '当前 Mac Chrome（待配对）';
  for (const restoreFromStorage of [true, false]) {
    const storage = new Map(restoreFromStorage ? [[storedKey, key]] : []);
    const f = fixture({storage, catalogData: data});
    await f.login();
    if (restoreFromStorage) await f.click('status-refresh');
    else await f.lookup();
    await f.click('catalog-refresh');
    assert.equal(f.$('device').value, '1288');
    assert.equal(f.$('device').disabled, true);
    assert.equal(f.$('name').disabled, true);
    assert.equal(f.$('submit').disabled, true);
    assert.match(f.$('device-status').textContent, /READY/);
    for (const id of ['device-status', 'request-hint']) {
      assert.match(f.$(id).textContent, /设备和姓名已锁定.*只查询原键/);
      assert.doesNotMatch(f.$(id).textContent, /可以明确提交一次/);
    }
    assert.match(f.$('catalog-hint').textContent, /只读取当前业务账号的设备.*不会自动配对或绑定/);
    assert.match(f.$('catalog-hint').textContent, /昵称仅作备注.*不能用于判断真实配对/);
    await f.submit('submit-form');
    assert.equal(f.calls.some(c => c.path.endsWith('/submit') || c.path.endsWith('/cancel')), false);
    assert.deepEqual(f.calls.filter(c => c.path.endsWith('/status')).map(c => c.input.requestKey), [key]);
    assert.equal(storage.get(storedKey), key);
  }
});

test('device guidance distinguishes no new request, an empty catalog and a failed read', async () => {
  let failed = false;
  const data = structuredClone(catalog);
  const f = fixture({catalogData: data, handle: path => path.endsWith('/catalog') && failed ? new Error('offline') : undefined});
  await f.login();
  f.input('device', '1288');
  assert.match(f.$('device-status').textContent, /尚未新建请求，不能提交.*READY/);
  data.devices = [];
  await f.click('catalog-refresh');
  assert.match(f.$('device-status').textContent, /设备目录为空/);
  failed = true;
  await f.click('catalog-refresh');
  assert.match(f.$('device-status').textContent, /设备目录读取失败/);
  assert.match(f.$('task-label').textContent, /读取失败/);
  assert.doesNotMatch(f.$('device-status').textContent, /READY|可以明确提交一次/);
  assert.equal(f.$('submit').disabled, true);
});

const custody = {
  source: 'provider-client-scope', bindingState: 'bound', bindingReason: 'BOUND', executorSuffix: 'f686',
  transport: 'wss', readinessReason: 'CONNECTED', checkedAt: '2026-11-19T09:00:00.000Z',
  tasks: [{ taskId: 'sample.form-fill', version: '1.0.2', siteOrigins: ['http://127.0.0.1:43111'], resultAccess: 'status-only' }],
};
const triggerFor = f => f.$('device-directory').querySelector('button');

test('custody is independently readable when the original request is locked, including with an older directory', async () => {
  for (const detail of [undefined, custody]) {
    const data = structuredClone(catalog);
    data.devices[0].detail = detail;
    const f = fixture({catalogData:data, storage:new Map([[storedKey,key]])});
    await f.login();
    await f.click('status-refresh');
    await f.click('catalog-refresh');
    const trigger = triggerFor(f);
    assert.equal(trigger.disabled, false);
    trigger.click();
    const panel = f.$('custody-1288');
    assert.equal(panel.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    if (detail) {
      assert.match(panel.textContent, /f686.*sample\.form-fill@1\.0\.2.*127\.0\.0\.1:43111.*正文不回传.*WSS.*本机准入待确认/s);
      assert.match(panel.textContent, /2026-11-19T09:00:00.000Z/);
    } else {
      assert.match(panel.textContent, /关联详情未提供/);
      assert.doesNotMatch(panel.textContent, /WSS|f686/);
    }
    assert.match(panel.textContent, /OpenDesk 侧栏 → 云控/);
    panel.querySelector('.custody-close').click();
    assert.equal(panel.hidden, true);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(f.$('device').value, '1288');
    assert.equal(f.$('device').disabled, true);
    assert.equal(f.$('name').disabled, true);
    assert.equal(f.$('request-key').textContent, key);
    assert.deepEqual(f.calls.filter(c => c.path.startsWith('/app/operate/')).map(c => c.path.split('/').at(-1)),
      ['catalog', 'status', 'catalog']);
  }
});

test('custody displays bounded states and drops old facts on read failure', async () => {
  for (const [extra, label] of [
    [{readinessReason:'OFFLINE', transport:'none'}, /未连接/],
    [{readinessReason:'PAUSED', transport:'none'}, /已暂停/],
    [{readinessReason:'UNCONFIRMED', transport:null}, /连接状态待确认/],
    [{bindingState:'unbound', bindingReason:'UNBOUND'}, /尚未关联执行端/],
    [{bindingState:'unknown', bindingReason:'CONFIG_UNAVAILABLE'}, /关联配置读取失败/],
    [{bindingState:'unknown', bindingReason:'SCOPE_UNVERIFIED'}, /当前委托范围未能确认/],
  ]) {
    let fail = false;
    const data = structuredClone(catalog);
    data.devices[0].detail = {...custody, ...extra, result: 'private-result', token: 'secret-token'};
    if (extra.readinessReason === 'OFFLINE') data.devices[0].readiness = 'NOT_CONNECTED';
    if (extra.readinessReason === 'PAUSED') data.devices[0].readiness = 'NOT_AUTHORIZED';
    const f = fixture({catalogData:data, handle: path => path.endsWith('/catalog') && fail ? Error('private-error') : undefined});
    await f.login();
    triggerFor(f).click();
    const panel = f.$('custody-1288');
    assert.match(panel.textContent, label);
    assert.doesNotMatch(panel.textContent, /已连接|私密|private-result|secret-token|可以执行/);
    if (extra.bindingState) assert.doesNotMatch(panel.textContent, /f686|sample\.form-fill/);
    fail = true;
    await f.click('catalog-refresh');
    assert.equal(f.$('custody-1288'), null);
    assert.equal(triggerFor(f), null);
    assert.match(f.$('device-directory-status').textContent, /读取失败/);
    assert.doesNotMatch(f.$('notice').textContent, /private-error/);
  }
});

test('a late catalog from the previous account cannot restore its device or open details', async () => {
  const previous = deferred();
  const original = structuredClone(catalog);
  original.devices[0].detail = custody;
  let read = 0, account = 569;
  const f = fixture({handle: path => {
    if (path.endsWith('/person')) return ok({id:account, username:'fixture'});
    if (path.endsWith('/catalog')) {
      read += 1;
      return read === 1 ? ok(original) : read === 2 ? previous.promise : ok({...catalog, devices:[]});
    }
  }});
  await f.login();
  triggerFor(f).click();
  assert.equal(f.$('custody-1288').hidden, false);
  await f.click('catalog-refresh');
  assert.equal(f.$('custody-1288'), null);
  await f.click('logout');
  account = 570;
  await f.login();
  previous.resolve(ok(original));
  await f.flush();
  assert.equal(f.$('custody-1288'), null);
  assert.match(f.$('device-directory-status').textContent, /没有设备/);
});
