import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject, buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {createPageComponentEntry} from '../../scripts/page-component-entry.mjs';
import {prepareRemoteModules} from '../../scripts/remote-esm-modules.mjs';
import {validatePageSource} from '../../src/scripting/user-scripts/page-bundle.js';
import {validateProgramDraft} from '../../src/ui/program-source.js';

const path = 'examples/programs/page-ui-toc-react-direct';
const remoteURL = 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const lockName = 'opendesk.remote-lock.json';
const hash = '691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const cachePath = '.opendesk/remote-cache/' + hash + '.mjs';
const noNetwork = () => {throw Error('An ordinary build must never download code');};
let reference;
const referenceBuild = () => reference ||= buildProgramProjectInMemory(path, {mode:'production',fetchImpl:noNetwork});

async function fixture(t, {locked = true} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'opendesk-toc-url-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'src'));
  await copyFile(path + '/package.json', join(root, 'package.json'));
  for (const name of ['main.js', 'toc-model.js', 'heading-stats.js', 'heading-chart.js']) {
    await copyFile(path + '/src/' + name, join(root, 'src', name));
  }
  if (locked) {
    await mkdir(join(root, '.opendesk/remote-cache'), {recursive:true});
    await copyFile(join(path, lockName), join(root, lockName));
    await cp(join(path, '.opendesk/remote-cache'), join(root, '.opendesk/remote-cache'), {recursive:true});
  }
  return root;
}

test('default TOC directly imports reviewed HTTPS ESM alongside packaged React', async () => {
  const project = await validateProgramProject(path);
  const manifest = JSON.parse(await readFile(path + '/package.json', 'utf8'));
  assert.equal(project.entryMode, 'component');
  // Framework/pageRules belong to the source manifest, not validator summary fields.
  assert.equal(manifest.opendesk.framework, 'react');
  assert.equal(project.entry, 'src/main.js');
  assert.deepEqual(project.npmDependencies, []);
  assert.equal(project.remoteImports.length, 5);
  assert.ok(project.remoteImports.includes(remoteURL));
  for (const root of ['core.js','lib/chart/bar/install.js','lib/component/grid/install.js','lib/renderer/installSVGRenderer.js'])
    assert.ok(project.remoteImports.includes('https://cdn.jsdelivr.net/npm/echarts@5.6.0/' + root));
  assert.deepEqual(project.sources.map(file => file.path).sort(), [
    'src/heading-chart.js', 'src/heading-stats.js', 'src/main.js', 'src/toc-model.js'
  ]);
  assert.deepEqual(manifest.opendesk.pageRules.matches, ['http://127.0.0.1:43111/*']);
  const source = await readFile(path + '/src/main.js', 'utf8');
  assert.ok(source.includes("import max from '" + remoteURL + "';"));
  assert.match(source, /summarizeHeadingLevels\(items, max\)/);
  assert.match(createPageComponentEntry(manifest.opendesk), /root\.unmount\(\)/);
  const built = await referenceBuild(), bundle = await validatePageSource(built.sourceUtf8);
  assert.ok(built.sourceBytes > 128 * 1024 && built.sourceBytes <= 516 * 1024);
  assert.equal(built.remoteModules.length, 235);
  assert.equal(built.remoteModules.find(row => row.url === remoteURL).sha256, hash);
  assert.equal(bundle.descriptor.dependencies.moduleCount, 235);
  assert.equal(bundle.descriptor.dependencies.sourceBytes, 1744686);
  assert.equal(bundle.descriptor.world, 'USER_SCRIPT');
  assert.match(built.sourceUtf8, /\/\/ @opendesk-lib react/);
  assert.ok(!bundle.linked.includes(remoteURL), 'URL provenance is in the descriptor; executable JS has no remote loader');
  assert.doesNotMatch(bundle.linked, /from ['"]react['"]/);
  assert.match(source, /useECharts\(\[BarChart, GridComponent, SVGRenderer\]\)/);
});

test('reviewed upstream cache builds deterministically and exports through the original JSON pipeline', async t => {
  const root = await fixture(t);
  const first = await referenceBuild();
  const outputDirectory = join(root, 'built');
  const artifact = await buildProgramProject(root, {outputDirectory,fetchImpl:noNetwork});
  const draft = JSON.parse(await readFile(join(outputDirectory, 'program.opendesk-draft.json'), 'utf8'));
  assert.equal(artifact.status, 'BUILT_UNVERIFIED');
  assert.equal(artifact.installable, false);
  assert.equal(draft.build.sourceHash, first.sourceHash);
  assert.equal(draft.sourceUtf8, first.sourceUtf8);
  assert.equal(draft.runtimeKind, 'page-userscript');
  assert.equal(draft.project.entryMode, 'component');
  assert.equal(draft.format, 'opendesk.program-draft.v2');
  assert.equal((await validateProgramDraft(draft)).build.sourceHash, first.sourceHash);
  assert.equal(artifact.sourceHash, first.sourceHash, 'different project/output paths produce the same offline execution bytes');
});

test('missing lock blocks before downloading; explicit test-only pinning remains separate', async t => {
  const root = await fixture(t, {locked:false});
  let fetches = 0;
  const upstreamLock = JSON.parse(await readFile(join(path, lockName), 'utf8'));
  const project = await validateProgramProject(root);
  const fetchImpl = async url => {
    assert.ok(upstreamLock.modules[url]);
    fetches++;
    // Controlled HTTP fixture containing real upstream bytes, NOT a live CDN receipt.
    return new Response(await readFile(join(path, '.opendesk/remote-cache', upstreamLock.modules[url].sha256 + '.mjs')), {status:200,headers:{'content-type':'text/javascript'}});
  };
  await assert.rejects(buildProgramProjectInMemory(root, {fetchImpl}), {code:'E_REMOTE_UNLOCKED'});
  assert.equal(fetches, 0);
  await prepareRemoteModules({root,remoteImports:project.remoteImports,remoteDependencies:project.remoteDependencies,lockRemote:true,fetchImpl,temp:join(root,'prepared')});
  assert.equal(fetches, 235);
  const written = JSON.parse(await readFile(join(root, lockName), 'utf8'));
  assert.deepEqual(written.modules[remoteURL], {sha256:hash,bytes:502});
  await prepareRemoteModules({root,remoteImports:project.remoteImports,remoteDependencies:project.remoteDependencies,fetchImpl:noNetwork,temp:join(root,'offline')});
});

test('missing or tampered cache never falls back to CDN or local math', async t => {
  const root = await fixture(t);
  await writeFile(join(root, cachePath), 'tampered');
  await assert.rejects(buildProgramProjectInMemory(root, {fetchImpl:noNetwork}), {code:'E_REMOTE_HASH'});
  await rm(join(root, cachePath));
  await assert.rejects(buildProgramProjectInMemory(root, {fetchImpl:noNetwork}), {code:'E_REMOTE_CACHE'});
});

test('changing a URL requires a new pin rather than silently reusing another version', async t => {
  const root = await fixture(t);
  const entry = join(root, 'src/main.js');
  const source = await readFile(entry, 'utf8');
  await writeFile(entry, source.replace(remoteURL, remoteURL.replace('v3.2.4', 'v3.2.3')));
  await assert.rejects(buildProgramProjectInMemory(root, {fetchImpl:noNetwork}), {code:'E_REMOTE_UNLOCKED'});
});
