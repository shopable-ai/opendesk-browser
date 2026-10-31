import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

// Bundle the real hook and catalogs in memory; replace only React's hook runtime
// and the environment/context boundaries. No browser, storage or proxy is used.
const bundle = await build({
  entryPoints: [new URL('../src/ui/useProxy.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', '../environment', '../i18n/LocaleProvider']
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const success = state => ({ ok: true, state });

async function fixture() {
  const slots = [], effects = [], calls = [];
  let cursor = 0, locale = 'zh-CN', listener, unmounted = false, lateWrites = 0, unsubscribed = 0;
  let request = async () => success({ revision: 1 });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {
        if (unmounted) lateWrites++;
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect) { const index = cursor++; if (!(index in slots)) { slots[index] = true; effects.push(effect); } }
  };
  const env = {
    request(message) { calls.push(message.type); return request(message); },
    service: { subscribe(fn) { listener = fn; return () => { listener = null; unsubscribed++; }; } }
  };
  const module = { exports: {} };
  runInNewContext(bundle.outputFiles[0].text, {
    exports: module.exports, module, Error,
    require(name) {
      if (name === 'react') return react;
      if (name === '../environment') return { getEnvironment: () => env };
      if (name === '../i18n/LocaleProvider') return { useI18n: () => ({ locale }) };
      throw Error(`Unexpected dependency: ${name}`);
    }
  });
  const render = () => { cursor = 0; return module.exports.useProxy(); };
  render();
  const cleanups = effects.map(effect => effect());
  await tick();
  return {
    render, calls, setLocale(value) { locale = value; },
    respond(fn) { request = fn; },
    async notify() { listener?.(); await tick(); },
    unmount() { unmounted = true; cleanups.forEach(cleanup => cleanup?.()); },
    get lateWrites() { return lateWrites; }, get unsubscribed() { return unsubscribed; }
  };
}

test('invalid input keys render localized text and follow locale changes without a request', async () => {
  const f = await fixture();
  f.render().setErrorKey('errInvalidPort');
  for (const [locale, expected] of [
    ['zh-CN', '端口必须在 1–65535'], ['en', 'Port must be between 1 and 65535.'], ['zh-TW', '連線埠必須在 1–65535']
  ]) {
    f.setLocale(locale);
    assert.equal(f.render().error, expected);
  }
  f.setLocale('en');
  f.render().setErrorKey('ruleCount', { count: 3 });
  assert.equal(f.render().error, '3 website rules');
  assert.deepEqual(f.calls, ['GET_STATE']);
  await f.notify();
  assert.equal(f.render().error, '3 website rules');
  f.render().setError('Local explanation');
  await f.notify();
  assert.equal(f.render().error, 'Local explanation');
  f.render().setError('');
  assert.equal(f.render().error, '');
  f.unmount();
});

test('backend codes and legacy errors localize, hide raw details, and transient read errors clear', async () => {
  const f = await fixture();
  f.setLocale('en');
  f.respond(async () => ({ ok: false, error: 'secret@example.com', errorCode: 'errInvalidPort' }));
  await f.render().refresh();
  assert.equal(f.render().error, 'Port must be between 1 and 65535.');
  f.respond(async () => { throw Error('端口必须在 1–65535'); });
  await f.render().refresh();
  assert.equal(f.render().error, 'Port must be between 1 and 65535.');
  f.respond(async () => { throw 'secret@example.com'; });
  await f.render().refresh();
  assert.ok(f.render().error);
  assert.doesNotMatch(f.render().error, /secret|undefined/);
  f.respond(async () => success({ revision: 2 }));
  await f.notify();
  assert.equal(f.render().error, '');
  assert.equal(f.render().state.revision, 2);
  f.unmount();
});

test('failed actions retain their localized error through failed and successful refreshes', async () => {
  for (const thrown of [false, true]) {
    const f = await fixture();
    f.setLocale('en');
    f.respond(async message => {
      if (message.type === 'GET_STATE') return { ok: false, error: '后台处理失败' };
      if (thrown) throw Error('端口必须在 1–65535');
      return { ok: false, error: 'private details', errorCode: 'errInvalidPort' };
    });
    assert.equal(await f.render().act({ type: 'SAVE_ENDPOINT' }), null);
    assert.equal(f.render().error, 'Port must be between 1 and 65535.');
    await f.notify();
    assert.equal(f.render().error, 'Port must be between 1 and 65535.');
    f.respond(async () => { throw Error('read failed'); });
    await f.notify();
    assert.equal(f.render().error, 'Port must be between 1 and 65535.');
    f.respond(async () => success({ revision: 3 }));
    await f.notify();
    assert.equal(f.render().error, 'Port must be between 1 and 65535.');
    assert.equal(f.render().state.revision, 3);
    f.setLocale('zh-CN');
    assert.equal(f.render().error, '端口必须在 1–65535');
    assert.ok(await f.render().act({ type: 'SAVE_ENDPOINT' }));
    assert.equal(f.render().error, '');
    f.unmount();
  }
});

test('single-flight lock, subscription cleanup and alive guards survive pending responses', async () => {
  for (const reject of [false, true]) {
    const f = await fixture();
    let finish;
    f.respond(() => new Promise((resolve, rejectPromise) => {
      finish = () => reject ? rejectPromise(Error('端口必须在 1–65535')) : resolve(success({ revision: 4 }));
    }));
    const action = f.render().act({ type: 'SAVE_ENDPOINT' });
    assert.equal(f.render().busy, true);
    assert.equal(await f.render().act({ type: 'SAVE_ENDPOINT' }), null);
    assert.deepEqual(f.calls, ['GET_STATE', 'SAVE_ENDPOINT']);
    f.unmount();
    finish();
    await action;
    assert.equal(f.lateWrites, 0);
    assert.equal(f.unsubscribed, 1);
  }
  for (const reject of [false, true]) {
    const f = await fixture();
    let finish;
    f.respond(() => new Promise((resolve, rejectPromise) => {
      finish = () => reject ? rejectPromise(Error('read failed')) : resolve({ ok: false, error: '后台处理失败' });
    }));
    const refresh = f.render().refresh();
    f.unmount();
    finish();
    await refresh;
    assert.equal(f.lateWrites, 0);
  }
});

test('denied Apply keeps feedback across status reads and never replays the mutation', async () => {
  const f = await fixture();
  f.respond(async message => message.type === 'APPLY'
    ? {ok:false,errorCode:'E_PERMISSION_DENIED',error:'permission denied'}
    : success({runtime:{applied:false}}));
  assert.equal(await f.render().act({type:'APPLY'}),null);
  const denied = f.render().error;
  assert.ok(denied);
  await f.render().refresh();
  await f.notify();
  assert.equal(f.render().error,denied);
  assert.equal(f.render().state.runtime.applied,false);
  assert.equal(f.calls.filter(type=>type==='APPLY').length,1);
  f.unmount();
});
