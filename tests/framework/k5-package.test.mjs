import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, readFile, writeFile, rm, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyPackage, CONTROL_WORKER, SANDBOX_HTML, FIXED_ASSETS, SDK_MAIN_WAR, inspectScript, PACKAGE_ENTRIES} from '../../scripts/verify-package.mjs';
import {PINNED_USER_SCRIPT_LIBRARIES} from '../../scripts/build-contract.mjs';

async function mutate(change, expectation, mode = 'production') {
  await verifyPackage(`dist/${mode}`);
  const root = await mkdtemp(join(tmpdir(), 'opendesk-k5-package-'));
  try { await cp(`dist/${mode}`, root, {recursive: true}); await change(root); await assert.rejects(verifyPackage(root), expectation); }
  finally { await rm(root, {recursive: true, force: true}); }
}
async function append(root, file, text) { const path = join(root, file); await writeFile(path, (await readFile(path, 'utf8')) + '\n' + text); }
async function manifest(root, change) { const path = join(root, 'manifest.json'), value = JSON.parse(await readFile(path, 'utf8')); change(value); await writeFile(path, JSON.stringify(value)); }

test('K5 exact Worker constructor capability parameters and destructured shadow bindings', () => {
  const source = `const n=Object.getPrototypeOf(async function(){}).constructor;
    function proxy({identity:n}) { return n; }
    new n('page','params','axiosx','AppStorage','AppLocal','storage',data.body);`;
  assert.doesNotThrow(() => inspectScript(source, CONTROL_WORKER));
  assert.throws(() => inspectScript(source.replace("'axiosx'", "'chrome'"), CONTROL_WORKER), /Unapproved dynamic constructor/);
  assert.throws(() => inspectScript(source + ';const alias=n;', CONTROL_WORKER), /Unapproved dynamic constructor/);
});

for (const mode of ['production', 'development']) {
  test(`K5 fixed SDK/control and resource closure validates actual ${mode} package`, async () => {
    const report = await verifyPackage(`dist/${mode}`);
    assert.deepEqual(report.sdkEntries, {MAIN: 'framework/sdk-main.js', ISOLATED: 'agents/page-relay.js'});
    const vendors = Object.values(PINNED_USER_SCRIPT_LIBRARIES);
    assert.equal(report.classicEntries.length, Object.keys(PACKAGE_ENTRIES).length + vendors.length);
    assert.deepEqual(report.classicEntries.filter(file => file.startsWith('vendor/')), vendors.map(row => row.output));
    assert.ok(report.classicEntries.includes('scripting/packaged/page-session.js'));
    assert.deepEqual(report.htmlChecked, ['ui/tool.html', 'ui/target-bootstrap.html', SANDBOX_HTML]);
    assert.equal(report.privilegedDynamicExecutionFound, false);
    assert.equal(report.approvedDynamicExecution.length, 1);
    assert.equal(report.approvedDynamicExecution[0].file, CONTROL_WORKER);
    assert.equal(report.approvedDynamicExecution[0].approvedAsyncBodyConstructors, 1);
    for (const [path, expected] of Object.entries(FIXED_ASSETS)) {
      const asset = report.files.find(file => file.path === path); assert.ok(asset); assert.equal(asset.bytes, expected.bytes); assert.equal(asset.sha256, expected.sha256);
    }
    assert.equal(report.files.filter(file => file.path.endsWith('.map')).length, mode === 'development' ? 11 : 0);
    // R3 allows only exactly pinned vendor code; legacy or compatibility assets stay forbidden.
    assert.equal(report.files.some(file => /compat|legacy/.test(file.path)), false);
    for (const vendor of vendors) assert.deepEqual(report.files.find(file => file.path === vendor.output),
      {path: vendor.output, bytes: vendor.bytes, sha256: vendor.sha256});
  });
  test(`K5 ${mode} Worker exception rejects eval/Function aliases and reflective extra constructors`, async () => {
    for (const addition of [';const alias=eval;', ';const Other=Function;', ';const Other=AsyncFunction;', ';const Other=Object.getPrototypeOf(async function(){}).constructor;', ';(()=>{}).constructor("return 1")();']) {
      await mutate(root => append(root, CONTROL_WORKER, addition), /Dynamic execution|dynamic constructor|dynamic execution boundary/, mode);
    }
  });
}
test('K5 fixed SDK files remain subject to privileged dynamic-execution scanner', async () => {
  for (const file of ['framework/sdk-main.js', 'agents/page-relay.js', 'scripting/packaged/page-session.js', 'scripting/sandbox/sandbox.js', 'sw.js']) {
    await mutate(root => append(root, file, ';const execute=eval;'), /Dynamic execution reference/);
    await mutate(root => append(root, file, ';const C=Object.getPrototypeOf(async function(){}).constructor;'), /dynamic execution boundary/);
  }
});
test('K5 privileged and opaque CSP mutations cannot broaden execution', async () => {
  for (const update of [
    m => { m.content_security_policy.extension_pages += "; script-src 'unsafe-eval'"; },
    m => { m.content_security_policy.sandbox += '; connect-src *'; },
    m => { m.content_security_policy.sandbox = m.content_security_policy.sandbox.replace('sandbox allow-scripts', 'sandbox allow-scripts allow-same-origin'); },
    m => { m.sandbox.pages.push('ui/tool.html'); },
    m => { m.optional_host_permissions.push('<all_urls>'); }
  ]) await mutate(root => manifest(root, update), /CSP|sandbox boundary|broad exposure|host permissions/);
});
test('K5 manifest exposes only SDK MAIN as an exact web accessible resource', async () => {
  await verifyPackage('dist/production');
  assert.deepEqual(JSON.parse(await readFile('dist/production/manifest.json', 'utf8')).web_accessible_resources, SDK_MAIN_WAR);
  for (const update of [
    m => { delete m.web_accessible_resources; },
    m => { m.web_accessible_resources = []; },
    m => { m.web_accessible_resources = [{resources: ['framework/sdk-main.js', CONTROL_WORKER], matches: ['http://*/*', 'https://*/*']}]; },
    m => { m.web_accessible_resources = [{resources: ['agents/page-relay.js'], matches: ['http://*/*', 'https://*/*']}]; },
    m => { m.web_accessible_resources = [{resources: ['framework/sdk-main.js'], matches: ['<all_urls>']}]; },
    m => { m.web_accessible_resources = [{resources: ['framework/*'], matches: ['http://*/*', 'https://*/*']}]; }
  ]) await mutate(root => manifest(root, update), /web accessible resources/);
});
test('K5 every HTML is scanned and Worker cannot become a privileged script entry', async () => {
  for (const file of ['ui/tool.html', 'ui/target-bootstrap.html', SANDBOX_HTML]) {
    await mutate(root => append(root, file, '<script src="https://example.com/runtime.js"></script>'), /Unsafe HTML/);
    await mutate(root => append(root, file, '<script>eval("1")</script>'), /Unsafe HTML/);
    await mutate(root => append(root, file, '<button onclick="run()">run</button>'), /Unsafe HTML/);
  }
  await mutate(root => append(root, 'ui/tool.html', `<script src="../${CONTROL_WORKER}"></script>`), /Unapproved HTML resource/);
  await mutate(async root => {const file = join(root, SANDBOX_HTML); await writeFile(file, (await readFile(file, 'utf8')).replace("connect-src 'none'", 'connect-src *'));}, /HTML CSP/);
  await mutate(root => append(root, SANDBOX_HTML, '<script src=sandbox.js></script>'), /Unsafe HTML/);
});
test('K5 required sandbox/Worker/icon/MIT and unknown assets fail closed', async () => {
  for (const file of [SANDBOX_HTML, CONTROL_WORKER, 'scripting/packaged/page-session.js', 'scripting/sandbox/sandbox.js', ...Object.keys(FIXED_ASSETS)]) await mutate(root => rm(join(root, file)), /Missing required resource/);
  for (const file of Object.keys(FIXED_ASSETS)) await mutate(root => append(root, file, 'tampered'), /Asset integrity mismatch/);
  await mutate(root => writeFile(join(root, 'unknown.html'), '<p>unapproved</p>'), /Unexpected packaged asset/);
  await mutate(root => append(root, 'ui/tool-shell.css', '@import "https://example.com/site.css";'), /Unsafe CSS/);
  await mutate(root => writeFile(join(root, 'lazy.js'), 'void 0;'), /Unexpected JS/);
});
test('K5 remote JS scanner distinguishes data URLs ending json/jsp without accepting scripts', () => {
  assert.doesNotThrow(() => inspectScript('const schema="https://example.com/schema.json";const info="https://example.com/info.jsp?json=true";', 'sw.js'));
  for (const value of ['https://example.com/runtime.js', 'https://example.com/runtime.js?cache=1', 'https://example.com/runtime.js#x']) assert.throws(() => inspectScript(`const remote=${JSON.stringify(value)};`, 'sw.js'), /Remote\/lazy/);
  assert.doesNotThrow(() => inspectScript('Function.prototype.toString.call(function(){});', 'sw.js'));
  assert.throws(() => inspectScript('Function.call.bind(Promise.prototype.then);', 'sw.js'), /Dynamic execution reference/);
});

test('K5 WXT shell regressions still reject ESM and lazy chunk loading', () => {
  for (const source of [
    'import "./chunk.js";',
    'export const value = 1;',
    'import("./chunk.js");',
    '__webpack_require__.e("chunk");'
  ]) assert.throws(() => inspectScript(source, 'sw.js'), /Non-classic syntax|Remote\/lazy/);
});

test('K5 additional manifest resources, CSS script consumers and remote maps are rejected', async () => {
  await mutate(root => manifest(root, m => { m.icons = {'128': 'missing.png'}; }), /manifest entry/);
  await mutate(async root => {const file = join(root, 'ui/tool.html'); await writeFile(file, (await readFile(file, 'utf8')).replace('<link rel="stylesheet" href="tool-shell.css">', '<script src="tool-shell.css"></script>'));}, /Unsafe HTML script/);
  await mutate(async root => {const file = join(root, 'sw.js'); await writeFile(file, (await readFile(file, 'utf8')).replace('sourceMappingURL=sw.js.map', 'sourceMappingURL=https://example.com/sw.js.map'));}, /source map/, 'development');
});
