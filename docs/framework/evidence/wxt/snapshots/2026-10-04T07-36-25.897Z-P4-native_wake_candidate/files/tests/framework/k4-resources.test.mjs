import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SDK_FILES} from '../../src/framework/sdk/registry.js';
import {getFingerprint} from '../../src/framework/sdk/utils.js';

test('RESOURCE fixed SDK allowlist has exactly two files; source entry consumes migrated modules', async () => {
  assert.deepEqual(SDK_FILES, {relay: 'agents/page-relay.js', main: 'framework/sdk-main.js'});
  const entry = await readFile(new URL('../../src/framework/sdk/entry.js', import.meta.url), 'utf8');
  for (const file of ['bridge', 'http', 'storage', 'notifications', 'servers', 'utils', 'transport']) assert.ok(entry.includes(`./${file}.js`));
  const relay = await readFile(new URL('../../src/agents/page-relay.js', import.meta.url), 'utf8');
  assert.ok(relay.includes('api.runtime.sendMessage(message')); assert.equal(relay.includes('registerHost'), false);
  assert.equal(relay.includes('ownGrant:'), false); assert.equal(relay.includes('namespace:'), false); assert.equal(relay.includes('sender:'), false);
});
test('RESOURCE project MIT notice is byte-identical to frozen original; no copied vendor resource', async () => {
  const license = await readFile(new URL('../../docs/contracts/licenses/todo-user-vue-MIT.txt', import.meta.url));
  assert.equal(license.length, 1096); assert.equal(createHash('sha256').update(license).digest('hex'), 'e301f131f52747f87193c4a41d3d5c09e6c021cc664a6a3101a2213635f03f29');
  assert.equal((await readdir(new URL('../../src/framework/sdk/', import.meta.url))).includes('vendor'), false);
  await assert.rejects(getFingerprint(), error => error.code === 'E_RESOURCE_UNAVAILABLE' && error.stage === 'lookup');
});
