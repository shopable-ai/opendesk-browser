import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: [new URL('../src/domain/config.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { priorityForSiteQuickRule } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const parent = { id: 'parent', domain: 'example.com', includeSubdomains: true, enabled: true, priority: 0, action: 'direct' };

test('editing a quick rule preserves priority 500 even with a priority-zero parent', () => {
  assert.equal(priorityForSiteQuickRule('app.example.com', [], 'edit', 500), 500);
  assert.equal(priorityForSiteQuickRule('app.example.com', [parent], 'edit', 500), 500);
  assert.equal(priorityForSiteQuickRule('app.example.com', [{ ...parent, id: 'edit', priority: 500 }], 'edit'), 500);
});

test('only new quick rules compute precedence and refuse priority-zero conflicts', () => {
  assert.equal(priorityForSiteQuickRule('app.example.com', []), 100);
  assert.equal(priorityForSiteQuickRule('app.example.com', [{ ...parent, priority: 50 }]), 49);
  assert.throws(() => priorityForSiteQuickRule('app.example.com', [parent]));
});
