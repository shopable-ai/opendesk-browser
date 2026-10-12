import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject, buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {createPageComponentEntry} from '../../scripts/page-component-entry.mjs';

const path = 'examples/programs/page-ui-toc-react-direct';
const cdnURL = 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';

test('TOC React Direct stays runnable offline and renders a local statistics tab', async () => {
  const project = await validateProgramProject(path);
  assert.equal(project.entryMode, 'component');
  assert.equal(project.framework, 'react');
  assert.equal(project.entry, 'src/main.js');
  assert.deepEqual(project.npmDependencies, []);
  assert.deepEqual(project.remoteImports, []);
  assert.deepEqual(project.sources.map(file => file.path).sort(), [
    'src/heading-stats.js', 'src/main.js', 'src/toc-model.js'
  ]);
  assert.deepEqual(project.pageRules.matches, ['http://127.0.0.1:43111/*']);
  const source = await readFile(path + '/src/main.js', 'utf8');
  assert.match(source, /from 'react'/);
  assert.match(source, /export default function App\(/);
  assert.match(source, /\['stats', '统计'\]/);
  assert.match(source, /summarizeHeadingLevels\(items\)/);
  assert.doesNotMatch(source, /\bcreatePageUI\s*\(|\bcreateRoot\s*\(|\bOpenDeskPageReact\b/);
  const built = await buildProgramProjectInMemory(path, {mode: 'production'});
  assert.ok(built.sourceBytes < 100000);
  assert.deepEqual(built.remoteModules, []);
  assert.doesNotMatch(built.sourceUtf8, /https:\/\/cdn\.jsdelivr\.net/);
  const manifest = JSON.parse(await readFile(path + '/package.json', 'utf8'));
  assert.match(createPageComponentEntry(manifest.opendesk), /root\.unmount\(\)/);
  assert.match(built.sourceUtf8, /\/\/ @opendesk-lib react/);
});

test('optional D3 CDN module requires explicit lock, then builds fully offline', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opendesk-toc-cdn-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'src'));
  await copyFile(path + '/package.json', join(root, 'package.json'));
  for (const name of ['main.js', 'toc-model.js', 'heading-stats.js', 'heading-stats-cdn.js']) {
    await copyFile(path + '/src/' + name, join(root, 'src', name));
  }
  const source = await readFile(join(root, 'src/main.js'), 'utf8');
  assert.ok(source.includes("from './heading-stats.js'"), 'known single-line opt-in switch');
  await writeFile(join(root, 'src/main.js'),
    source.replace("from './heading-stats.js'", "from './heading-stats-cdn.js'"));
  const reviewed = await validateProgramProject(root);
  assert.deepEqual(reviewed.remoteImports, [cdnURL]);
  await assert.rejects(buildProgramProjectInMemory(root), {code: 'E_REMOTE_UNLOCKED'});
  let fetches = 0;
  const mockD3Module = [
    '// Controlled test fixture, not proof that the real CDN was fetched.',
    'export default function max(values) { return Math.max(...values); }'
  ].join('\n');
  const pinned = await buildProgramProject(root, {
    lockRemote: true, outputDirectory: join(root, 'built'),
    fetchImpl: async url => {
      assert.equal(url, cdnURL);
      fetches++;
      return new Response(mockD3Module, {status: 200,
        headers: {'content-type': 'text/javascript'}});
    }
  });
  assert.equal(fetches, 1);
  assert.ok(pinned.sourceBytes < 100000);
  assert.equal(pinned.remoteModules.length, 1);
  const offline = await buildProgramProjectInMemory(root, {mode: 'production',
    fetchImpl: () => {throw Error('Ordinary dev.run must never download JavaScript');}});
  assert.equal(offline.sourceHash, pinned.sourceHash);
  assert.equal(offline.remoteModules.length, 1);
  assert.doesNotMatch(offline.sourceUtf8, /https:\/\/cdn\.jsdelivr\.net/);
  const lock = JSON.parse(await readFile(join(root, 'opendesk.remote-lock.json'), 'utf8'));
  assert.equal(lock.format, 'opendesk.remote-lock.v1');
  const hash = lock.modules[cdnURL].sha256;
  await writeFile(join(root, '.opendesk/remote-cache', hash + '.mjs'), 'tampered');
  await assert.rejects(buildProgramProjectInMemory(root), {code: 'E_REMOTE_HASH'});
});
