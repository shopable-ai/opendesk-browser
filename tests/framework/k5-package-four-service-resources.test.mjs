import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_ALIASES, SDK_RESOURCE_MANIFEST} from '../../src/framework/sdk/resource-contract.js';
import {createSdkResourceManifest, verifySdkResourceManifest, verifyPackage, PACKAGE_ENTRIES,
  BUILD_POLICY, CONTROL_WORKER, SANDBOX_HTML, FIXED_ASSETS, SDK_MAIN_WAR} from '../../scripts/verify-package.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = [Buffer.from('MAIN: 组合资源🙂\r\n'), Buffer.from('ISOLATED: relay\n')];
async function put(root, path, value) {
  await mkdir(dirname(join(root, path)), {recursive: true});
  await writeFile(join(root, path), value);
}
async function writeManifest(root, manifest) {
  await put(root, SDK_RESOURCE_MANIFEST, JSON.stringify(manifest ?? await createSdkResourceManifest(root), null, 2) + '\n');
}
async function withResources(run) {
  const root = await mkdtemp(join(tmpdir(), 'opendesk-sdk-resource-component-'));
  try {
    for (const [index, path] of SDK_RESOURCE_PATHS.entries()) await put(root, path, fixtureBytes[index]);
    await writeManifest(root);
    await run(root);
  } finally { await rm(root, {recursive: true, force: true}); }
}
// A complete synthetic artifact exercises package closure without building or reading dist.
async function withPackage(mode, run) {
  const root = await mkdtemp(join(tmpdir(), 'opendesk-sdk-package-component-'));
  try {
    await put(root, 'manifest.json', await readFile(new URL('../../manifest.json', import.meta.url)));
    for (const path of ['ui/tool.html', 'ui/target-bootstrap.html', 'ui/tool-shell.css', SANDBOX_HTML])
      await put(root, path, await readFile(new URL(`../../src/${path}`, import.meta.url)));
    await put(root, 'licenses/todo-user-vue-MIT.txt', await readFile(new URL('../../docs/contracts/licenses/todo-user-vue-MIT.txt', import.meta.url)));
    const build = await readFile(new URL('../../scripts/build.mjs', import.meta.url), 'utf8');
    const icon = /const notificationIcon = '([^']+)';/.exec(build)?.[1];
    assert.ok(icon, 'The build must retain its fixed notification icon');
    await put(root, 'icons/notification.png', Buffer.from(icon, 'base64'));
    for (const name of Object.keys(PACKAGE_ENTRIES)) {
      const path = `${name}.js`;
      const body = path === CONTROL_WORKER
        ? 'const Body=Object.getPrototypeOf(async function(){}).constructor;const execution={body:""};return new Body("page","params",execution.body);'
        : 'return "fixture🙂";';
      let script = `var OpenDeskFixture=(function(){${body}})();\n`;
      if (mode === 'development') {
        script += `//# sourceMappingURL=${name.split('/').at(-1)}.js.map\n`;
        await put(root, `${path}.map`, JSON.stringify({version: 3, sources: [`${name}.js`], sourcesContent: [body]}));
      }
      await put(root, path, script);
    }
    await writeManifest(root);
    await run(root);
  } finally { await rm(root, {recursive: true, force: true}); }
}

test('FOUR_SERVICE_RESOURCE shared frozen contract has two paths and exactly seven MAIN aliases', () => {
  assert.ok(Object.isFrozen(SDK_RESOURCE_PATHS));
  assert.ok(Object.isFrozen(SDK_RESOURCE_ALIASES));
  assert.deepEqual(SDK_RESOURCE_PATHS, ['framework/sdk-main.js', 'agents/page-relay.js']);
  assert.equal(SDK_RESOURCE_MANIFEST, 'framework/sdk-resources.json');
  assert.deepEqual(SDK_RESOURCE_ALIASES, Object.fromEntries([
    'assets/js/core/brige.js', 'assets/js/core/common.js', 'assets/js/core/axiosx.js',
    'assets/js/core/appStorage.js', 'assets/js/core/appLocal.js', 'assets/js/core/utils.js', 'assets/js/Env.js'
  ].map(path => [path, 'framework/sdk-main.js'])));
});
test('FOUR_SERVICE_RESOURCE generation records exact output bytes and SHA256 in contract order', async () => {
  await withResources(async root => {
    await put(root, 'vendor/unapproved.js', 'excluded');
    await put(root, 'assets/js/core/brige.js', 'excluded alias');
    const expected = {schemaVersion: 1, resources: SDK_RESOURCE_PATHS.map((path, index) =>
      ({path, bytes: fixtureBytes[index].length, sha256: digest(fixtureBytes[index])}))};
    assert.notEqual(fixtureBytes[0].length, fixtureBytes[0].toString().length);
    assert.deepEqual(await createSdkResourceManifest(root), expected);
    assert.deepEqual(await verifySdkResourceManifest(root), expected);
    for (const [index, path] of SDK_RESOURCE_PATHS.entries()) {
      await put(root, path, Buffer.from(`new output ${index}: 改包\n`));
      const updated = await createSdkResourceManifest(root);
      assert.notEqual(updated.resources[index].sha256, expected.resources[index].sha256);
      assert.equal(updated.resources[index].bytes, (await readFile(join(root, path))).length);
      await writeManifest(root, updated);
      assert.deepEqual(await verifySdkResourceManifest(root), updated);
    }
  });
});
test('FOUR_SERVICE_RESOURCE valid schema accepts object field order without accepting extra fields', async () => {
  await withResources(async root => {
    const manifest = await createSdkResourceManifest(root);
    await writeManifest(root, {resources: manifest.resources.map(entry =>
      ({sha256: entry.sha256, bytes: entry.bytes, path: entry.path})), schemaVersion: 1});
    assert.deepEqual(await verifySdkResourceManifest(root), manifest);
  });
});
test('FOUR_SERVICE_RESOURCE rejects unknown/missing schema fields and nonfixed resource sets', async t => {
  const mutations = [
    ['null', () => null], ['array', () => []],
    ['extra root key', manifest => ({...manifest, aliases: SDK_RESOURCE_ALIASES})],
    ['missing version', manifest => { delete manifest.schemaVersion; return manifest; }],
    ['wrong version', manifest => ({...manifest, schemaVersion: 2})],
    ['string version', manifest => ({...manifest, schemaVersion: '1'})],
    ['missing resources', manifest => ({schemaVersion: manifest.schemaVersion})],
    ['null resources', manifest => ({...manifest, resources: null})],
    ['empty resources', manifest => ({...manifest, resources: []})],
    ['one resource', manifest => ({...manifest, resources: manifest.resources.slice(0, 1)})],
    ['third resource', manifest => ({...manifest, resources: [...manifest.resources, {...manifest.resources[0], path: 'sw.js'}]})],
    ['reordered resources', manifest => ({...manifest, resources: manifest.resources.reverse()})],
    ['duplicate resource', manifest => ({...manifest, resources: [manifest.resources[0], manifest.resources[0]]})],
    ['null entry', manifest => { manifest.resources[0] = null; return manifest; }],
    ['array entry', manifest => { manifest.resources[0] = []; return manifest; }],
    ['extra entry key', manifest => { manifest.resources[0].url = 'http://example.com'; return manifest; }]
  ];
  for (const [name, mutate] of mutations) await t.test(name, async () => withResources(async root => {
    await put(root, SDK_RESOURCE_MANIFEST, JSON.stringify(mutate(await createSdkResourceManifest(root))));
    await assert.rejects(verifySdkResourceManifest(root), /Invalid SDK resource manifest schema/);
  }));
});
test('FOUR_SERVICE_RESOURCE enforces path, bytes, hash types, bounds and exact entry fields', async t => {
  const mutations = [
    ...['path', 'bytes', 'sha256'].map(field => [`missing ${field}`, entry => { delete entry[field]; }]),
    ...['sw.js', '../framework/sdk-main.js', 'framework/sdk-main.js?x', 'framework/%73dk-main.js',
      'https://example.com/sdk-main.js', 'assets/js/core/brige.js', 'scripting/sandbox/worker-runtime.js']
      .map(path => [`path ${path}`, entry => { entry.path = path; }]),
    ...['1', 0, -1, 1.5, null, Number.MAX_SAFE_INTEGER + 1, BUILD_POLICY.productionBytes + 1]
      .map(bytes => [`bytes ${bytes}`, entry => { entry.bytes = bytes; }]),
    ...['0'.repeat(63), '0'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), '0'.repeat(64) + '\n', null, ['0'.repeat(64)]]
      .map((sha256, index) => [`hash ${index}`, entry => { entry.sha256 = sha256; }])
  ];
  for (const [name, mutate] of mutations) await t.test(name, async () => withResources(async root => {
    const manifest = await createSdkResourceManifest(root);
    mutate(manifest.resources[0]);
    await writeManifest(root, manifest);
    await assert.rejects(verifySdkResourceManifest(root), /Invalid SDK resource manifest schema/);
  }));
});
test('FOUR_SERVICE_RESOURCE rejects malformed JSON and invalid UTF8 manifest bytes', async () => {
  await withResources(async root => {
    for (const bytes of ['{', '{"schemaVersion":1,"resources":[]} trailing', Buffer.from([0xff])]) {
      await put(root, SDK_RESOURCE_MANIFEST, bytes);
      await assert.rejects(verifySdkResourceManifest(root), /Invalid SDK resource manifest JSON/);
    }
  });
});
test('FOUR_SERVICE_RESOURCE recomputes hash even for equal length output changes', async () => {
  for (const [index, path] of SDK_RESOURCE_PATHS.entries()) await withResources(async root => {
    const altered = Buffer.from(fixtureBytes[index]);
    altered[0] ^= 1;
    await put(root, path, altered);
    await assert.rejects(verifySdkResourceManifest(root), /SDK resource integrity mismatch/);
    await put(root, path, Buffer.concat([fixtureBytes[index], Buffer.from('extra')]));
    await assert.rejects(verifySdkResourceManifest(root), /SDK resource integrity mismatch/);
  });
});
test('FOUR_SERVICE_RESOURCE rejects claimed byte/hash mismatches and missing manifest/output files', async () => {
  for (const field of ['bytes', 'sha256']) await withResources(async root => {
    const manifest = await createSdkResourceManifest(root);
    manifest.resources[0][field] = field === 'bytes' ? manifest.resources[0].bytes + 1 : '0'.repeat(64);
    await writeManifest(root, manifest);
    await assert.rejects(verifySdkResourceManifest(root), /SDK resource integrity mismatch/);
  });
  await withResources(async root => {
    await rm(join(root, SDK_RESOURCE_MANIFEST));
    await assert.rejects(verifySdkResourceManifest(root), {code: 'ENOENT'});
  });
  for (const path of SDK_RESOURCE_PATHS) await withResources(async root => {
    await rm(join(root, path));
    await assert.rejects(createSdkResourceManifest(root), {code: 'ENOENT'});
    await assert.rejects(verifySdkResourceManifest(root), {code: 'ENOENT'});
  });
});
for (const mode of ['production', 'development']) {
  test(`FOUR_SERVICE_RESOURCE ${mode} synthetic package requires and fingerprints the one new JSON asset`, async () => {
    await withPackage(mode, async root => {
      const report = await verifyPackage(root);
      assert.equal(report.classicEntries.length, 11);
      assert.equal(report.files.length, mode === 'development' ? 30 : 19);
      assert.ok(report.assetsChecked.includes(SDK_RESOURCE_MANIFEST));
      assert.deepEqual(report.sdkResources, await createSdkResourceManifest(root));
      const manifestFile = report.files.find(file => file.path === SDK_RESOURCE_MANIFEST);
      const bytes = await readFile(join(root, SDK_RESOURCE_MANIFEST));
      assert.deepEqual(manifestFile, {path: SDK_RESOURCE_MANIFEST, bytes: bytes.length, sha256: digest(bytes)});
      for (const [path, expected] of Object.entries(FIXED_ASSETS))
        assert.deepEqual(report.files.find(file => file.path === path), {path, ...expected});
      assert.deepEqual(JSON.parse(await readFile(join(root, 'manifest.json'))).web_accessible_resources, SDK_MAIN_WAR);
      await put(root, SDK_RESOURCE_MANIFEST, JSON.stringify(report.sdkResources));
      assert.notEqual((await verifyPackage(root)).packageHash, report.packageHash);
      await rm(join(root, SDK_RESOURCE_MANIFEST));
      await assert.rejects(verifyPackage(root), /Missing required resource: framework\/sdk-resources.json/);
    });
  });
}
test('FOUR_SERVICE_RESOURCE package closure rejects unknown JSON, alias output, stale hashes and symlinks', async () => {
  await withPackage('production', async root => {
    await put(root, 'framework/extra-resources.json', '{}');
    await assert.rejects(verifyPackage(root), /Unexpected packaged asset/);
    await rm(join(root, 'framework/extra-resources.json'));
    await put(root, 'assets/js/core/brige.js', 'var Alias=(function(){})();');
    await assert.rejects(verifyPackage(root), /Unexpected JS\/chunks/);
    await rm(join(root, 'assets'), {recursive: true});
    const main = SDK_RESOURCE_PATHS[0];
    const old = await readFile(join(root, main), 'utf8');
    await put(root, main, old.replace('fixture', 'changed'));
    await assert.rejects(verifyPackage(root), /SDK resource integrity mismatch/);
    await writeManifest(root);
    await verifyPackage(root);
    await rm(join(root, SDK_RESOURCE_MANIFEST));
    await symlink(join(root, 'manifest.json'), join(root, SDK_RESOURCE_MANIFEST));
    await assert.rejects(verifyPackage(root), /Symlink forbidden in artifact/);
  });
});

test('FOUR_SERVICE_RESOURCE manifest stays within the trusted resource reader limit', async () => {
  await withResources(async root => {
    const bytes = await readFile(join(root, SDK_RESOURCE_MANIFEST));
    await put(root, SDK_RESOURCE_MANIFEST, Buffer.concat([bytes, Buffer.alloc(8193 - bytes.length, 32)]));
    await assert.rejects(verifySdkResourceManifest(root), /SDK resource manifest exceeds reader size limit/);
  });
});
test('FOUR_SERVICE_RESOURCE added manifest preserves strict permissions, CSP, WAR and dynamic execution checks', async () => {
  await withPackage('production', async root => {
    const original = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    for (const [mutate, expected] of [
      [manifest => { manifest.permissions.push('cookies'); }, /Unexpected permissions/],
      [manifest => { manifest.content_security_policy.extension_pages += "; script-src 'unsafe-eval'"; }, /Unexpected CSP/],
      [manifest => { manifest.web_accessible_resources[0].resources.push(SDK_RESOURCE_MANIFEST); }, /Unexpected web accessible resources/]
    ]) {
      const manifest = structuredClone(original);
      mutate(manifest);
      await put(root, 'manifest.json', JSON.stringify(manifest));
      await assert.rejects(verifyPackage(root), expected);
    }
    await put(root, 'manifest.json', JSON.stringify(original));
    const main = SDK_RESOURCE_PATHS[0];
    await put(root, main, (await readFile(join(root, main), 'utf8')) + ';const execute=eval;');
    await assert.rejects(verifyPackage(root), /Dynamic execution reference/);
  });
});
