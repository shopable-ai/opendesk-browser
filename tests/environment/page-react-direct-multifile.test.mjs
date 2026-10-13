import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {sha256} from '../../native-agent/local-dev/snapshot.mjs';
import {counter} from '../../examples/programs/page-ui-react-direct/src/counter.js';

test('React Direct local preparation tracks shared imports and reads a saved child module', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opendesk-react-multifile-'));
  for (const file of ['package.json', 'README.md', 'src'])
    await cp(join('examples/programs/page-ui-react-direct', file), join(root, file), {recursive: true});
  const resolver = new LocalDevResolver({allowedPaths: [root]});
  t.after(async () => {
    resolver.close();
    await rm(root, {recursive: true, force: true});
  });
  const {bindingId} = resolver.attach({path: root});
  const first = await resolver.resolve(bindingId);
  const sources = first.files.filter(file => file.path.startsWith('src/'));
  assert.deepEqual(sources.map(file => file.path),
    ['src/counter.js', 'src/demo-config.js', 'src/main.js']);
  assert.equal(first.managedUI, true);
  assert.equal(first.sourceHash, sha256(first.sourceUtf8));
  assert.equal(counter(0, 'increment'), 1);
  assert.equal((await resolver.resolve(bindingId)).cacheHit, true);

  const configPath = join(root, 'src/demo-config.js');
  const originalConfig = await readFile(configPath, 'utf8');
  const savedConfig = originalConfig.replace('OpenDesk - React', 'OpenDesk · 多文件测试')
    .replace('counterStep: 1', 'counterStep: 2');
  await writeFile(configPath, savedConfig);
  const next = await resolver.resolve(bindingId);
  assert.equal(next.cacheHit, false);
  assert.notEqual(next.inputHash, first.inputHash);
  assert.equal(next.sourceRevision, next.inputHash);
  assert.notEqual(next.artifactId, first.artifactId);
  assert.notEqual(next.sourceHash, first.sourceHash);
  assert.equal(next.files.find(file => file.path === 'src/demo-config.js').sha256,
    sha256(savedConfig));
  assert.equal(next.files.find(file => file.path === 'src/main.js').sha256,
    sources.find(file => file.path === 'src/main.js').sha256);
  assert.match(next.sourceUtf8, /OpenDesk · 多文件测试/);
  const changed = await import(pathToFileURL(join(root, 'src/counter.js')).href);
  assert.equal(changed.counter(0, 'increment'), 2, 'transitive import uses the saved configuration');
  assert.equal(changed.counter(4, 'unknown'), 4);
  assert.equal(first.files.find(file => file.path === 'src/demo-config.js').sha256,
    sha256(originalConfig), 'previous prepared source keeps its original identity');
  assert.equal(first.sourceHash, sha256(first.sourceUtf8));
  const hit = await resolver.resolve(bindingId);
  assert.equal(hit.cacheHit, true);
  assert.equal(hit.timings.buildCount, 0);
  assert.deepEqual((await readdir(root)).sort(), ['README.md', 'package.json', 'src']);
});
