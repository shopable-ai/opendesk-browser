import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';

const execute = promisify(execFile);
const moduleURL = new URL('../../scripts/wxt-checkpoint.mjs', import.meta.url).href;
const runtimePaths = [
  'tests/prototypes/user-control-v2/profiles/retired/extensions_crx_cache/metadata.json',
  'tests/.cache/chrome/version.json',
  'tests/framework/evidence/old/record.json',
];

async function fixture(t, extraVerification = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-checkpoint-inputs-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  async function put(relative, content) {
    const dest = path.join(root, relative);
    await mkdir(path.dirname(dest), {recursive:true});
    await writeFile(dest, content);
  }
  await mkdir(path.join(root, 'scripts'), {recursive:true});
  await put('src/entry.js', 'export const alive = true;\n');
  await put('wxt.config.mjs', 'export default {};\n');
  await put('tests/regression/source.test.mjs', 'export {};\n');
  // A profiles directory in contract fixtures is source, not a tests runtime.
  await put('contracts/fixtures/profiles/sample.json', '{"contract":true}\n');
  await put('docs/framework/wxt-progress.json', JSON.stringify({baselinePath:'baseline'}));
  await put('baseline/manifest.json', JSON.stringify({
    productInputs:[{path:'src/entry.js'}],
    verificationInputs:[...runtimePaths, 'tests/regression/source.test.mjs',
      ...extraVerification].map(path => ({path})),
  }));
  return {root, put};
}

function identity(root) {
  return execute(process.execPath, ['--input-type=module', '-e',
    `import {inputIdentity} from ${JSON.stringify(moduleURL)}; console.log(JSON.stringify(await inputIdentity()));`],
  {cwd:root}).then(({stdout}) => JSON.parse(stdout));
}

test('retired baseline runtime paths are excluded and reported without reading profiles', async t => {
  const {root, put} = await fixture(t);
  // Existing runtime files are excluded too, not only missing ones.
  await put(runtimePaths[1], '{"volatile":true}\n');
  const result = await identity(root);
  assert.deepEqual(result.verificationInputs.map(row=>row.path), [
    'contracts/fixtures/profiles/sample.json', 'tests/regression/source.test.mjs',
  ]);
  assert.deepEqual(result.excludedHistoricalRuntimeInputs.map(row=>row.path), runtimePaths.toSorted());
  assert(result.excludedHistoricalRuntimeInputs.every(row=>row.reason==='test-runtime-directory'));
  assert.equal(result.productInputs.find(row=>row.path==='src/entry.js').bytes,
    Buffer.byteLength('export const alive = true;\n'));
});

test('missing historical source and fixture inputs remain fatal', async t => {
  for (const missing of ['tests/regression/missing.test.mjs', 'contracts/fixtures/missing.html']) {
    const {root} = await fixture(t, [missing]);
    await assert.rejects(identity(root), error => error.stderr.includes('ENOENT') && error.stderr.includes(missing));
  }
});
