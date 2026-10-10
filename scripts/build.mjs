import {preparePublic} from './prepare-public.mjs';
import {acquireDevelopmentLock} from './development-lock.mjs';
import {prepare,build} from 'wxt';
import {mkdir, readFile, writeFile, rm, mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {collectBundleEvidence} from './bundle-provenance.mjs';
import {PACKAGE_ENTRIES} from './build-contract.mjs';
import {verifyPackage, filesAt, createSdkResourceManifest, SDK_RESOURCE_MANIFEST,
  createBuiltinResourceManifest, BUILTIN_RESOURCE_MANIFEST} from './verify-package.mjs';
const mode = process.argv[2] || 'production';
if (!['production', 'development'].includes(mode)) throw new Error('Invalid build mode');
async function sourceInputs() {
  const paths = [...(await filesAt('src')).map(path => `src/${path}`), ...(await filesAt('scripts')).map(path => `scripts/${path}`), 'manifest.json', 'wxt.config.mjs', 'package.json', 'package-lock.json', 'docs/contracts/licenses/todo-user-vue-MIT.txt'].sort();
  return Promise.all(paths.map(async path => { const bytes = await readFile(path); return {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}; }));
}
const releaseOutput=await acquireDevelopmentLock('build');
let moduleEvidence;
try {
const inputsBefore = await sourceInputs();
await preparePublic();
moduleEvidence = await mkdtemp(resolve('.wxt/module-evidence-'));
process.env.OPENDESK_BUILD_MODE=mode;process.env.OPENDESK_MODULE_EVIDENCE_DIR=moduleEvidence;
// Keep the actual writer in the process owning the output guard, including
// abrupt parent termination: no orphaned WXT subprocess can keep writing.
await prepare({mode,browser:'chrome',manifestVersion:3});
await build({mode,browser:'chrome',manifestVersion:3});
const inputsAfter = await sourceInputs();
const sourceDriftDuringBuild = inputsBefore.filter((input, index) => JSON.stringify(input) !== JSON.stringify(inputsAfter[index]));
if (inputsBefore.length !== inputsAfter.length || sourceDriftDuringBuild.length) throw new Error('Build inputs changed during WXT build; rebuild current candidate');
const outputRoot = resolve('dist', mode);
// Hash the actual WXT output, never source files or a previous package receipt.
await writeFile(resolve(outputRoot, SDK_RESOURCE_MANIFEST), JSON.stringify(await createSdkResourceManifest(outputRoot), null, 2) + '\n');
await writeFile(resolve(outputRoot, BUILTIN_RESOURCE_MANIFEST),
  JSON.stringify(await createBuiltinResourceManifest(outputRoot),null,2)+'\n');
const report = await verifyPackage(outputRoot);
const bundleModules = await collectBundleEvidence(moduleEvidence, Object.keys(PACKAGE_ENTRIES).map(name => name + '.js'), report.files);
const evidence = process.env.OPENDESK_BUILD_EVIDENCE_DIR || 'docs/framework/evidence/wxt/builds';
await mkdir(evidence, {recursive: true});
await writeFile(`${evidence}/build-${mode}.json`, JSON.stringify({mode, builder: 'WXT0.21.4/Vite7.3.6/Rollup', status: 'passed', cwd: process.cwd(), sourceInputs: inputsBefore, sourceDriftDuringBuild, bundleModules, report}, null, 2) + '\n');
console.log(JSON.stringify({mode, builder: 'wxt', status: 'passed', packageHash: report.packageHash, assets: report.files.length}));
} finally {
  try {if(moduleEvidence)await rm(moduleEvidence, {recursive: true, force: true});}
  finally {await releaseOutput();}
}
