import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../src/environment.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'esm'
});
const { configureEnvironment } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ save = async () => 'saved' } = {}) {
  const states = [];
  const env = configureEnvironment({ setState: value => states.push(value) }, null, {
    trusted: true, preview: { service: {
      async load() { return { etag: 'initial', config: {
        managed: false, schemaVersion: 2, selection: { mode: 'system' },
        endpoints: [], profiles: [], rules: [], sources: [], defaultTarget: { action: 'direct' }
      } }; },
      save,
      async status() { return { state: 'disabled', canStop: false, control: 'controllable_by_this_extension', reason: null }; }
    } }
  });
  return { env, states };
}

test('clean confirmation publishes busy until accept or cancel without changing dirty', async () => {
  for (const accepted of [true, false]) {
    const { env, states } = fixture();
    const answer = deferred();
    try {
      env.setConfirmHandler(text => {
        assert.equal(text, 'Delete?');
        assert.deepEqual(states.at(-1), { dirty: false, busy: true });
        return answer.promise;
      });
      const confirmation = env.confirm('Delete?');
      assert.deepEqual(states.at(-1), { dirty: false, busy: true });
      env.setState({ busy: false });
      assert.equal(states.at(-1).busy, true);
      answer.resolve(accepted);
      assert.equal(await confirmation, accepted);
      assert.deepEqual(states.at(-1), { dirty: false, busy: false });
    } finally { env.dispose(); }
  }
});

test('confirmation finally releases busy on synchronous throw or asynchronous rejection', async () => {
  for (const asynchronous of [false, true]) {
    const { env, states } = fixture();
    const failure = Error('confirmation failed');
    try {
      env.setDraftDirty(true, 'proxy');
      env.setConfirmHandler(() => {
        assert.deepEqual(states.at(-1), { dirty: true, busy: true });
        if (asynchronous) return Promise.reject(failure);
        throw failure;
      });
      await assert.rejects(async () => env.confirm('Delete?'), error => error === failure);
      assert.deepEqual(states.at(-1), { dirty: true, busy: false });
    } finally { env.dispose(); }
  }
});

test('missing confirmation handler returns false without publishing busy', async () => {
  const { env, states } = fixture();
  try {
    assert.equal(await env.confirm('Delete?'), false);
    assert.deepEqual(states, []);
  } finally { env.dispose(); }
});

test('confirmation and mutation release only their own pending count in either completion order', async () => {
  for (const confirmFirst of [true, false]) {
    const saving = deferred(), started = deferred(), answer = deferred();
    const { env, states } = fixture({ save: () => { started.resolve(); return saving.promise; } });
    try {
      const request = env.request({ type: 'SELECT', selection: { mode: 'direct' } });
      await started.promise;
      env.setConfirmHandler(() => answer.promise);
      const confirmation = env.confirm('Delete?');
      if (confirmFirst) {
        answer.resolve(false);
        assert.equal(await confirmation, false);
      } else {
        saving.resolve('saved');
        assert.equal((await request).ok, true);
      }
      env.setState({ busy: false });
      assert.deepEqual(states.at(-1), { dirty: false, busy: true });
      if (confirmFirst) {
        saving.resolve('saved');
        assert.equal((await request).ok, true);
      } else {
        answer.resolve(true);
        assert.equal(await confirmation, true);
      }
      assert.deepEqual(states.at(-1), { dirty: false, busy: false });
    } finally { env.dispose(); }
  }
});

test('overlapping confirmations keep busy until both settle', async () => {
  const { env, states } = fixture();
  const first = deferred(), second = deferred();
  try {
    env.setConfirmHandler(() => first.promise);
    const one = env.confirm('First?');
    env.setConfirmHandler(() => second.promise);
    const two = env.confirm('Second?');
    first.resolve(false);
    await one;
    assert.equal(states.at(-1).busy, true);
    second.resolve(true);
    await two;
    assert.equal(states.at(-1).busy, false);
  } finally { env.dispose(); }
});

test('disposed confirmation cannot approve or publish into a replacement environment', async () => {
  const old = fixture(), answer = deferred();
  old.env.setConfirmHandler(() => answer.promise);
  const confirmation = old.env.confirm('Delete?');
  old.env.dispose();
  const published = old.states.length;
  const replacement = fixture();
  try {
    answer.resolve(true);
    await assert.rejects(confirmation, { code: 'E_TOOL_CHANGED' });
    let invoked = false;
    old.env.setConfirmHandler(() => { invoked = true; return true; });
    await assert.rejects(async () => old.env.confirm('Retry?'), { code: 'E_TOOL_CHANGED' });
    assert.equal(invoked, false);
    assert.equal(old.states.length, published);
    assert.deepEqual(replacement.states, []);
    assert.equal(await replacement.env.confirm('Delete?'), false);
  } finally { replacement.env.dispose(); }
});
