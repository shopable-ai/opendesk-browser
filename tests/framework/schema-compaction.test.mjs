import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import schema from '../../src/platform/schema.js';
import {compactSchemaSource} from '../../scripts/compact-schema.mjs';

test('build factoring preserves every frozen schema byte after JSON serialization', async () => {
  const source = await readFile(new URL('../../src/platform/schema.js', import.meta.url), 'utf8');
  const compact = compactSchemaSource(source);
  const result = vm.runInNewContext(compact.replace('export default ', 'globalThis.result='), {
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    TextDecoder
  });
  assert.equal(JSON.stringify(result), JSON.stringify(schema));
  assert.ok(compact.length < source.length - 3000);
});
