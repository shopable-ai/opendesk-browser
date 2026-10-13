// Node evidence only: this minimal root is not Chrome or an opaque-origin frame.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Script, createContext} from 'node:vm';
import {parse} from 'acorn';
import {createSidebarToolPackage, encodeSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';
import max from './vendor/d3-array-3.2.4/max.js';

assert(process.argv[2], 'Pass the formal .opendesk-tool.json path');
const packagePath = resolve(process.argv[2]);
const bytes = await readFile(packagePath);
const pkg = validateSidebarToolPackage(JSON.parse(bytes));
const rebuilt = await createSidebarToolPackage(new URL('.', import.meta.url).pathname);
assert.deepEqual(bytes, encodeSidebarToolPackage(rebuilt));
assert.equal(pkg.format, 'opendesk.sidebar-tool.v1');
assert.deepEqual(pkg.capabilities, []);
assert.equal(pkg.js, await readFile(new URL('build/tool.js', import.meta.url), 'utf8'));
const license = await readFile(new URL('vendor/d3-array-3.2.4/LICENSE', import.meta.url), 'utf8');
assert(pkg.js.includes(license), 'Original notice must travel inside the installed JS');
const ast = parse(pkg.js, {ecmaVersion: 2020, sourceType: 'script'});
assert.equal(ast.body.length, 1);
assert.equal(ast.body[0].expression.type, 'CallExpression');
assert.equal(ast.body[0].expression.callee.type, 'ArrowFunctionExpression');
assert(!/\b(?:fetch|XMLHttpRequest|importScripts)\s*\(/.test(pkg.js));
assert.equal(max([1, 5, 3]), 5);
assert.equal(max([null, undefined, NaN, 5, 1]), 5);
assert.equal(max([{value: 1}, {value: 5}], row => row.value), 5);

const script = new Script(pkg.js);
function open() {
  const nodes = Object.fromEntries(['#import-result', '#import-environment', '#import-executions']
    .map(id => [id, {textContent: ''}]));
  const root = {dataset: {}, querySelector: id => nodes[id]};
  return {nodes, context: createContext({OpenDeskTool: {root}})};
}
const first = open();
script.runInContext(first.context, {timeout: 1000});
assert.equal(first.nodes['#import-result'].textContent, 'Tool D3 max = 5');
assert.equal(first.nodes['#import-environment'].textContent, 'typeof chrome = undefined; typeof chrome.tabs = undefined; typeof page = undefined');
assert.equal(first.nodes['#import-executions'].textContent, 'Executions in this iframe = 1');
script.runInContext(first.context, {timeout: 1000});
assert.equal(first.nodes['#import-executions'].textContent, 'Executions in this iframe = 2');
const reopened = open();
script.runInContext(reopened.context, {timeout: 1000});
assert.equal(reopened.nodes['#import-result'].textContent, 'Tool D3 max = 5');
assert.equal(reopened.nodes['#import-executions'].textContent, 'Executions in this iframe = 1');
const css = pkg.css;
assert(!/(?:min-)?width\s*:\s*\d+px/.test(css), 'No fixed panel width');
assert(css.includes('overflow-wrap: anywhere'));
assert(pkg.html.includes('role="status"'));
assert(pkg.html.includes('<summary>'));
assert(css.includes(':focus-visible'));

console.log(JSON.stringify({status: 'NODE_PASS', packagePath,
  packageSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
  assertions: ['formal package byte identity', 'zero capabilities', 'Classic IIFE parse',
    'original ISC notice embedded', 'real max default/accessor/null cases',
    'actual bundled JS result', 'Node typeof diagnostics', 'same-context execution counter',
    'fresh Node context restart', 'static flexible width/status/focus checks'],
  widths: {360: 'STATIC_ONLY', 400: 'STATIC_ONLY', 600: 'STATIC_ONLY'},
  browser: 'NOT_TESTED', installed: false,
  limitation: 'Node VM root model does not prove sandbox security, layout or Chrome lifecycle'}, null, 2));
