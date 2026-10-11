import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {createPageComponentEntry} from '../../scripts/page-component-entry.mjs';

const path = 'examples/programs/page-ui-toc-react-direct';

test('TOC React Direct demo uses the existing managed React component pipeline', async () => {
  const project = await validateProgramProject(path);
  assert.equal(project.entryMode, 'component');
  assert.equal(project.framework, 'react');
  assert.equal(project.entry, 'src/main.js');
  assert.deepEqual(project.npmDependencies, []);
  assert.deepEqual(project.sources.map(file => file.path).sort(), [
    'src/main.js', 'src/toc-model.js'
  ]);
  assert.deepEqual(project.pageRules.matches, ['http://127.0.0.1:43111/*']);
  const source = await readFile(path + '/src/main.js', 'utf8');
  assert.match(source, /from 'react'/);
  assert.match(source, /export default function App\(/);
  assert.doesNotMatch(source, /\bcreatePageUI\s*\(|\bcreateRoot\s*\(|\bOpenDeskPageReact\b/);
  const built = await buildProgramProjectInMemory(path, {mode:'production'});
  assert.ok(built.sourceBytes < 100000);
  const manifest = JSON.parse(await readFile(path + '/package.json', 'utf8'));
  assert.match(createPageComponentEntry(manifest.opendesk), /root\.unmount\(\)/);
  assert.match(built.sourceUtf8, /\/\/ @opendesk-lib react/);
});
