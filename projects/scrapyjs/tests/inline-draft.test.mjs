import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const context = vm.createContext({TextEncoder, URL, crypto: webcrypto});
vm.runInContext(await readFile(new URL('../src/app-model.js', import.meta.url), 'utf8'), context);
const {createApp} = context.ScrapyAppModel;
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const page = {status: 'available', url: 'http://127.0.0.1:43111/demo-form.html'};
function setup(overrides = {}, onChange) {
  return createApp({load: async () => ({value: null, etag: '0'}),
    currentPage: async () => page, prepare: async () => {}, ...overrides}, onChange);
}

test('canceling touched inline input restores clean state without changing config and notifies UI', () => {
  let changes = 0;
  const app = setup({}, () => changes++), config = app.state.config;
  const checkpoint = app.checkpointDraft();
  app.touch(); app.touch();
  assert.equal(app.state.dirty, true);
  const before = changes;
  assert.equal(app.cancelDraft(checkpoint), true);
  assert.equal(app.state.dirty, false);
  assert.strictEqual(app.state.config, config);
  assert.equal(changes, before + 1);
});

test('cancel preserves dirty state that existed before inline input', () => {
  const app = setup(); app.edit({...app.state.config, timeoutMs: 42});
  const checkpoint = app.checkpointDraft(), config = app.state.config;
  app.touch(); app.cancelDraft(checkpoint);
  assert.equal(app.state.dirty, true);
  assert.strictEqual(app.state.config, config);
});

test('a real edit invalidates cancellation even when configuration values are identical', () => {
  const app = setup(), checkpoint = app.checkpointDraft();
  app.touch(); app.edit(app.state.config);
  const config = app.state.config;
  assert.equal(app.cancelDraft(checkpoint), false);
  assert.equal(app.state.dirty, true);
  assert.strictEqual(app.state.config, config);
});

for (const identity of ['profileEpoch', 'selectedId']) {
  test(`changed ${identity} prevents old draft cancellation`, () => {
    const app = setup(), checkpoint = app.checkpointDraft();
    app.touch();
    // Isolate identity guards even if a future profile operation reuses config references.
    app.state[identity] = identity === 'profileEpoch' ? 1 : 'other';
    assert.equal(app.cancelDraft(checkpoint), false);
    assert.equal(app.state.dirty, true);
  });
}

test('profile replacement invalidates an old checkpoint after a real profile transition', async () => {
  const app = setup(); await app.load();
  const checkpoint = app.checkpointDraft(); app.touch();
  await app.newProfile(); await app.confirmAction();
  app.touch();
  assert.equal(app.cancelDraft(checkpoint), false);
  assert.equal(app.state.dirty, true);
});

test('keepDirty preserves another unapplied input draft', () => {
  const app = setup(), checkpoint = app.checkpointDraft();
  app.touch(); app.touch();
  assert.equal(app.cancelDraft(checkpoint, {keepDirty: true}), false);
  assert.equal(app.state.dirty, true);
});

test('pending profile confirmation prevents cancellation from clearing dirty', async () => {
  const app = setup(); await app.load();
  const checkpoint = app.checkpointDraft(); app.touch(); await app.newProfile();
  const pending = app.state.pendingAction;
  assert.ok(pending);
  assert.equal(app.cancelDraft(checkpoint), false);
  assert.equal(app.state.dirty, true);
  assert.strictEqual(app.state.pendingAction, pending);
});

test('saving blocks draft cancellation and preserves the conditional save', async () => {
  const write = deferred(); let writes = 0;
  const app = setup({save: async () => {writes++; return write.promise;}});
  await app.load(); const checkpoint = app.checkpointDraft(); app.touch();
  const saving = app.save('Draft');
  assert.equal(app.state.saving, true);
  assert.equal(app.cancelDraft(checkpoint), false);
  assert.equal(app.state.dirty, true);
  write.resolve({saved: true}); await saving;
  assert.equal(writes, 1);
});

for (const outcome of ['active', 'unknown']) {
  test(`${outcome} run blocks cancellation without replay or identity changes`, async () => {
    let starts = 0;
    const app = setup({start: async (_config, _url, clientRequestId) => {
      starts++;
      if (outcome === 'unknown') throw Error('unknown send');
      return {clientRequestId, runId: 'original', status: 'running'};
    }, read: async clientRequestId => ({clientRequestId, runId: 'original', status: 'running', retired: false})});
    await app.refreshTarget(); const checkpoint = app.checkpointDraft(); app.touch();
    await app.start(page.url);
    const identity = app.state.clientRequestId, config = app.state.config;
    assert.equal(app.state.phase, outcome === 'unknown' ? 'unknown' : 'running');
    assert.equal(app.cancelDraft(checkpoint), false);
    assert.equal(app.state.dirty, true);
    assert.strictEqual(app.state.config, config);
    assert.equal(app.state.clientRequestId, identity);
    await app.start(page.url); assert.equal(starts, 1);
  });
}

test('missing and foreign checkpoints and disposed apps cannot clear dirty', () => {
  const app = setup(), other = setup(), checkpoint = app.checkpointDraft();
  app.touch();
  for (const value of [undefined, null, {}, other.checkpointDraft()]) {
    assert.equal(app.cancelDraft(value), false);
    assert.equal(app.state.dirty, true);
  }
  app.dispose();
  assert.equal(app.cancelDraft(checkpoint), false);
  assert.equal(app.state.dirty, true);
});
