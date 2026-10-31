import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform, build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../src/Settings.tsx', import.meta.url), 'utf8');
// Execute the real submit handler without a browser or a second UI implementation.
const handler = source.slice(source.indexOf('  async function saveProxy('), source.indexOf('  async function savePac('));
assert.ok(handler.includes('async function saveProxy('));
const { code } = await transform(handler, { loader: 'tsx' });
const bundled = await build({ entryPoints: [new URL('../src/domain/proxy-entry.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { isValidProxyPort } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function fixture(overrides = {}) {
  const effects = [], errors = [];
  const context = {
    getEnvironment:()=>({getDraftRevision:()=>0,setDraftDirty:()=>true}),
    editingId: '', proxy: { name: 'Draft', scheme: 'https', host: 'proxy.example.com', port: '443' },
    username: '', password: '', endpoints: [], locale: 'zh-CN', emptyEndpoint: {},
    crypto: { randomUUID: () => { effects.push('uuid'); return 'new'; } },
    isValidProxyPort,
    setError: value => errors.push(value), setErrorKey: value => errors.push(value),
    act: async value => { effects.push(structuredClone(value)); return true; },
    closeEditor: () => effects.push('close'),
    ...Object.fromEntries(['setEditingId', 'setProxy', 'setUsername', 'setPassword'].map(key => [key, value => effects.push([key, value])])),
    ...overrides
  };
  return { context, effects, errors, submit: async (another = false) => {
    const fn = runInNewContext(`${code}; saveProxy`, context);
    await fn({ preventDefault() {}, nativeEvent: { submitter: { getAttribute: () => String(another) } } });
  } };
}

test('authenticated add/edit/save-another reject before writes or draft resets in every locale', async () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en']) {
    for (const scheme of ['http', 'https']) {
      for (const editingId of ['', 'existing']) {
        for (const another of [false, true]) {
          const f = fixture({ locale, editingId, username: 'draft-user', password: 'draft-password',
            proxy: { name: 'Keep name', scheme, host: 'keep.example.com', port: '8080' } });
          const before = structuredClone({ proxy: f.context.proxy, username: f.context.username, password: f.context.password, editingId });
          await f.submit(another);
          assert.deepEqual(f.effects, []);
          assert.equal(f.errors.length, 1);
          assert.match(f.errors[0], /未保存|未儲存|not saved/);
          assert.deepEqual({ proxy: f.context.proxy, username: f.context.username, password: f.context.password, editingId: f.context.editingId }, before);
        }
      }
    }
  }
});

test('partial credentials and SOCKS authentication retain existing validation with no effects', async () => {
  for (const overrides of [{ username: 'user' }, { password: 'password' },
    ...['socks4', 'socks5'].map(scheme => ({ username: 'user', password: 'password', proxy: { scheme } }))]) {
    const f = fixture(overrides);
    await f.submit();
    assert.deepEqual(f.effects, []);
    assert.equal(f.errors.length, 1);
  }
});

test('editing an existing HTTP credential reference also rejects before changing the endpoint', async () => {
  const f = fixture({ editingId: 'existing', endpoints: [{ id: 'existing', credentialRef: 'session-existing' }] });
  await f.submit();
  assert.deepEqual(f.effects, []);
  assert.match(f.errors[0], /未保存/);
});

test('unauthenticated add/edit/save-another keep the existing save sequence and payload', async () => {
  for (const scheme of ['http', 'https', 'socks4', 'socks5']) {
    for (const editingId of ['', 'existing']) {
      for (const another of [false, true]) {
        const f = fixture({ editingId, endpoints: editingId ? [{ id: editingId }] : [] });
        f.context.proxy.scheme = scheme;
        await f.submit(another);
        assert.deepEqual(f.errors, []);
        const actions = f.effects.filter(item => item?.type);
        assert.deepEqual(actions.map(item => item.type), editingId ? ['SAVE_ENDPOINT'] : ['SAVE_ENDPOINT', 'SAVE_PROFILE']);
        assert.deepEqual(actions[0].endpoint, { id: editingId || 'new', name: 'Draft', scheme, host: 'proxy.example.com', port: 443, sourceId: 'manual' });
        if (another && !editingId) {
          assert.deepEqual(f.effects.slice(-4), [['setEditingId', ''], ['setProxy', {}], ['setUsername', ''], ['setPassword', '']]);
        } else assert.equal(f.effects.at(-1), 'close');
      }
    }
  }
});

test('failed unauthenticated endpoint write keeps the draft and does not save a profile', async () => {
  const calls = [];
  const f = fixture({ act: async value => { calls.push(value.type); return false; } });
  await f.submit();
  assert.deepEqual(calls, ['SAVE_ENDPOINT']);
  assert.deepEqual(f.effects, ['uuid']);
});
