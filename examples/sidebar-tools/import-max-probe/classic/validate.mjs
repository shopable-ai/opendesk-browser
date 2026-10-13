import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {createSidebarToolPackage, encodeSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';
const bytes = await readFile(process.argv[2]);
const tool = await createSidebarToolPackage(new URL('.', import.meta.url).pathname);
assert.deepEqual(bytes, encodeSidebarToolPackage(tool));
assert.equal(tool.format, 'opendesk.sidebar-tool.v2');
assert.deepEqual(tool.capabilities, []);
assert.deepEqual(tool.scripts.map(row => row.name), ['vendor/mitt-3.0.1/mitt.umd.js', 'src/second.js']);
assert(tool.js.includes(await readFile(new URL('vendor/mitt-3.0.1/LICENSE', import.meta.url), 'utf8')));
for (const row of tool.scripts) assert.equal(createHash('sha256').update(row.code).digest('hex'), row.sha256);
for (let opening = 0; opening < 2; opening++) {
  const nodes = Object.fromEntries(['#import-result', '#import-order', '#import-environment', '#import-executions'].map(id => [id, {textContent: ''}]));
  const context = {OpenDeskTool: {root: {dataset: {}, querySelector: id => nodes[id]}}};
  context.self = context;
  for (const code of [...tool.scripts.map(row => row.code), tool.js]) {
    parse(code, {ecmaVersion: 2020, sourceType: 'script'});
    runInNewContext(code, context, {timeout: 1000});
  }
  assert.equal(nodes['#import-result'].textContent, 'Tool Classic mitt = 5');
  assert.equal(nodes['#import-order'].textContent, 'order = mitt>second>main; emits = 1');
  assert.equal(nodes['#import-executions'].textContent, 'Executions in this iframe = 1');
  assert.equal(nodes['#import-environment'].textContent, 'typeof chrome = undefined; typeof chrome.tabs = undefined; typeof page = undefined');
}
console.log(JSON.stringify({status: 'NODE_PASS', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  scripts: tool.scripts.map(({name, sha256}) => ({name, sha256})),
  result: 'Tool Classic mitt = 5', order: 'mitt>second>main', emits: 1,
  native: 'NOT_TESTED', negativeNative: 'NOT_TESTED', installed: false}, null, 2));
