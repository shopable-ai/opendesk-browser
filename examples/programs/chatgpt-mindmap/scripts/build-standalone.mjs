// Local MV3 validation only. Never invokes prepare-local-resources.mjs: that
// script writes assets/xmind-runtime.js, outside this wrapper's write scope.
// Reuse its four-resource verification and exact string-timer guard instead.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, realpath, lstat} from 'node:fs/promises';
import {resolve, join, relative, sep, dirname, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';
import {verifyLicenseReview} from './verify-license-review.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(project, '../../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), {code}); };
export const TIMER_GUARD = '(()=>{throw new Error("E_XMIND_STRING_TIMER_UNSUPPORTED");})()';

export function guardSnowbrush(bytes) {
  const source = bytes.toString('utf8');
  assert.equal(source.split('eval(task)').length, 2, 'Fixed reference timer fallback changed');
  return Buffer.from(source.replace('eval(task)', TIMER_GUARD));
}

async function validationOutput(out) {
  const root = join(repository, 'artifacts'), target = resolve(out);
  const inside = relative(root, target);
  if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside) ||
      /\.(zip|crx)$/i.test(target)) fail('E_STANDALONE_LOCAL_OUTPUT');
  // Refuse symlinks anywhere under artifacts, including an existing target.
  const parts = relative(repository, target).split(sep);
  let cursor = await realpath(repository);
  for (const part of parts) {
    cursor = join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || !info.isDirectory()) fail('E_STANDALONE_LOCAL_OUTPUT');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // The repository's artifacts/ rule is the only output admission here.
  const ignore = await readFile(join(repository, '.gitignore'), 'utf8');
  if (!ignore.split(/\r?\n/).some(line => line === 'artifacts/' || line === '/artifacts/')) {
    fail('E_STANDALONE_ARTIFACTS_NOT_IGNORED');
  }
  return target;
}

export async function buildStandalone({localValidationOnly = false,
  out = join(repository, 'artifacts/chatgpt-mindmap-standalone/local-validation')} = {}) {
  const reviewPath = join(project, 'tests/xmind-license-review-r396.json');
  const reviewBytes = await readFile(reviewPath);
  const review = JSON.parse(reviewBytes);
  // Fail before creating an output directory or loading/copying vendor code.
  if (!localValidationOnly) fail(review.status === 'BLOCKED'
    ? 'E_XMIND_LICENSE_BLOCKED' : 'E_STANDALONE_REDISTRIBUTION_NOT_IMPLEMENTED');
  const output = await validationOutput(out);
  const resources = await verifyFixedXmindAssets();
  assert.equal(resources.size, 4, 'Exactly four fixed XMind resources required');
  const license = await verifyLicenseReview({review, resources,
    provenanceBytes: await readFile(join(project, 'tests/xmind-provenance.json')),
    testsRoot: join(project, 'tests')});
  assert.equal(license.status, 'BLOCKED');
  const manifest = await readFile(join(project, 'standalone/manifest.json'));
  const bundle = async entry => build({
    absWorkingDir: repository, entryPoints: [join(project, 'standalone', entry)],
    bundle: true, format: 'iife', platform: 'browser', write: false,
    sourcemap: false, minify: false, metafile: true, loader: {'.css': 'text'}
  });
  const entries = ['content.js', 'broker.js', 'relay.js', 'sandbox.js'];
  const bundles = await Promise.all(entries.map(bundle));
  const files = new Map([['manifest.json', manifest]]), inputs = new Map();
  for (let index = 0; index < entries.length; index++) {
    const result = bundles[index];
    for (const input of Object.keys(result.metafile.inputs)) {
      assert(!input.includes('node_modules/') && !input.includes('@opendesk/'),
        'Standalone wrapper must have only local static business imports');
      const bytes = await readFile(resolve(repository, input));
      inputs.set(input, {path: input, bytes: bytes.length, sha256: sha256(bytes)});
    }
    if (entries[index] !== 'sandbox.js') files.set(entries[index], result.outputFiles[0].contents);
  }
  for (const name of ['relay.html', 'sandbox.html']) {
    files.set(name, await readFile(join(project, 'standalone', name)));
  }
  const original = [...resources].map(([path, bytes]) => ({path, bytes: bytes.length, sha256: sha256(bytes)}));
  const scripts = [...resources].map(([path, bytes]) => path === '/snowbrush-2c2b5d62b5.js'
    ? guardSnowbrush(bytes) : bytes);
  files.set('xmind-runtime.js', Buffer.concat([
    ...scripts.flatMap(bytes => [bytes, Buffer.from('\n;\n')]),
    Buffer.from(bundles[3].outputFiles[0].text)
  ]));
  const metadata = {
    format: 'chatgpt-mindmap.standalone.local-validation.v1',
    status: 'LOCAL_VALIDATION_ONLY', scope: 'LOCAL_VALIDATION_ONLY',
    redistributionApproved: false, distributable: false, zipProduced: false,
    license: {path: relative(repository, reviewPath), sha256: sha256(reviewBytes), status: license.status},
    browserValidation: 'NOT_TESTED', installationValidation: 'NOT_TESTED',
    originalResources: original,
    localTransforms: [{path: '/snowbrush-2c2b5d62b5.js', from: 'eval(task)', to: TIMER_GUARD, count: 1}],
    inputs: [...inputs.values()],
    files: [...files].map(([path, bytes]) => ({path, bytes: bytes.length, sha256: sha256(bytes)}))
  };
  // Never overwrite a prior candidate or another agent's directory.
  await mkdir(dirname(output), {recursive: true});
  await mkdir(output, {recursive: false});
  // Metadata is written first so even an interrupted build remains labelled.
  await writeFile(join(output, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', {flag: 'wx'});
  for (const [name, bytes] of files) await writeFile(join(output, name), bytes, {flag: 'wx'});
  return {output, ...metadata};
}

export function parseStandaloneArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--local-validation-only' && !options.localValidationOnly) options.localValidationOnly = true;
    else if (args[index] === '--out' && args[index + 1] && !args[index + 1].startsWith('--') && !options.out) {
      options.out = args[++index];
    } else fail('E_STANDALONE_ARGUMENT');
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildStandalone(parseStandaloneArgs(process.argv.slice(2)));
    console.log(JSON.stringify({output: result.output, status: result.status,
      redistributionApproved: result.redistributionApproved, zipProduced: false}));
  } catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
}
