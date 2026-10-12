import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject, buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {createPageComponentEntry} from '../../scripts/page-component-entry.mjs';

const path = 'examples/programs/page-ui-toc-react-direct';
const remoteURL = 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const lockName = 'opendesk.remote-lock.json';
const hash = '691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const cachePath = '.opendesk/remote-cache/' + hash + '.mjs';
const noNetwork = () => {throw Error('An ordinary build must never download code');};

async function fixture(t, {locked = true} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'opendesk-toc-url-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'src'));
  await copyFile(path + '/package.json', join(root, 'package.json'));
  for (const name of ['main.js', 'toc-model.js', 'heading-stats.js']) {
    await copyFile(path + '/src/' + name, join(root, 'src', name));
  }
  if (locked) {
    await mkdir(join(root, '.opendesk/remote-cache'), {recursive:true});
    await copyFile(join(path, lockName), join(root, lockName));
    await copyFile(join(path, cachePath), join(root, cachePath));
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
  assert.deepEqual(project.remoteImports, [remoteURL]);
  assert.deepEqual(project.sources.map(file => file.path).sort(), [
    'src/heading-stats.js', 'src/main.js', 'src/toc-model.js'
  ]);
  assert.deepEqual(manifest.opendesk.pageRules.matches, ['http://127.0.0.1:43111/*']);
  const source = await readFile(path + '/src/main.js', 'utf8');
  assert.ok(source.includes("import max from '" + remoteURL + "';"));
  assert.match(source, /summarizeHeadingLevels\(items, max\)/);
  assert.match(createPageComponentEntry(manifest.opendesk), /root\.unmount\(\)/);
  const built = await buildProgramProjectInMemory(path, {mode:'production',fetchImpl:noNetwork});
  assert.ok(built.sourceBytes < 100000);
  assert.equal(built.remoteModules.length, 1);
  assert.equal(built.remoteModules[0].url, remoteURL);
  assert.equal(built.remoteModules[0].sha256, hash);
  assert.match(built.sourceUtf8, /\/\/ @opendesk-lib react/);
  assert.ok(!built.sourceUtf8.includes(remoteURL), 'runtime code does not retain a remote loader');
});

test('reviewed upstream cache builds deterministically and exports through the original JSON pipeline', async t => {
  const root = await fixture(t);
  const first = await buildProgramProjectInMemory(root, {fetchImpl:noNetwork});
  const second = await buildProgramProjectInMemory(root, {fetchImpl:noNetwork});
  assert.equal(second.sourceHash, first.sourceHash);
  const outputDirectory = join(root, 'built');
  const artifact = await buildProgramProject(root, {outputDirectory,fetchImpl:noNetwork});
  const draft = JSON.parse(await readFile(join(outputDirectory, 'program.opendesk-draft.json'), 'utf8'));
  assert.equal(artifact.status, 'BUILT_UNVERIFIED');
  assert.equal(artifact.installable, false);
  assert.equal(draft.build.sourceHash, first.sourceHash);
  assert.equal(draft.sourceUtf8, first.sourceUtf8);
  assert.equal(draft.runtimeKind, 'page-userscript');
  assert.equal(draft.project.entryMode, 'component');
});

test('missing lock blocks before downloading; explicit test-only pinning remains separate', async t => {
  const root = await fixture(t, {locked:false});
  let fetches = 0;
  const actualUpstreamBytes = await readFile(join(path, cachePath));
  const fetchImpl = async url => {
    assert.equal(url, remoteURL);
    fetches++;
    // Controlled HTTP fixture containing real upstream bytes, NOT a live CDN receipt.
    return new Response(actualUpstreamBytes, {status:200,headers:{'content-type':'text/javascript'}});
  };
  await assert.rejects(buildProgramProjectInMemory(root, {fetchImpl}), {code:'E_REMOTE_UNLOCKED'});
  assert.equal(fetches, 0);
  await buildProgramProject(root, {lockRemote:true,fetchImpl,outputDirectory:join(root, 'built')});
  assert.equal(fetches, 1);
  const written = JSON.parse(await readFile(join(root, lockName), 'utf8'));
  assert.deepEqual(written.modules[remoteURL], {sha256:hash,bytes:502});
  await buildProgramProjectInMemory(root, {fetchImpl:noNetwork});
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
