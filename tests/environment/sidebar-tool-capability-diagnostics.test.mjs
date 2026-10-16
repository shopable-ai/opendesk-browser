import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

const formal = JSON.parse(await readFile(new URL('../../examples/sidebar-tools/ai-vip-share/ai-vip-share.opendesk-tool.json', import.meta.url), 'utf8'));

test('current importer accepts every declared AI VIP Share capability', () => {
  const tool = validateSidebarToolPackage(formal);
  assert.deepEqual(tool.capabilities, ['storage.local', 'network', 'browser.tabs', 'browser.proxy.managed']);
});

test('unsupported capability names the rejected item and an actionable host update', () => {
  assert.throws(() => validateSidebarToolPackage({...formal, capabilities: ['storage.local', 'browser.proxy.unrestricted']}), error => {
    assert.equal(error.code, 'E_TOOL_SCHEMA');
    assert.match(error.message, /browser\.proxy\.unrestricted/);
    assert.match(error.message, /更新.*OpenDesk Browser/);
    assert.doesNotMatch(error.message, /storage\.local/);
    return true;
  });
});

test('v1 cannot acquire v2 capabilities through import diagnostics', () => {
  const {requires, contributes, scripts, ...legacy} = formal;
  assert.throws(() => validateSidebarToolPackage({...legacy, format: 'opendesk.sidebar-tool.v1', capabilities: ['browser.proxy.managed']}), /browser\.proxy\.managed/);
});

test('duplicate and malformed declarations remain schema failures with distinct reasons', () => {
  for (const [capabilities, reason] of [
    [['storage.local', 'storage.local'], /重复/],
    [['storage.local', null], /字符串/],
    ['storage.local', /数组/],
  ]) {
    assert.throws(() => validateSidebarToolPackage({...formal, capabilities}), error => {
      assert.equal(error.code, 'E_TOOL_SCHEMA');
      assert.match(error.message, reason);
      return true;
    });
  }
});

test('untrusted capability text cannot produce an unbounded diagnostic', () => {
  assert.throws(() => validateSidebarToolPackage({...formal, capabilities: ['x'.repeat(10000)]}), error => {
    assert.equal(error.code, 'E_TOOL_SCHEMA');
    assert(error.message.length < 500);
    return true;
  });
});
