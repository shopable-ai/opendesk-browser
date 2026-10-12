import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {createPageProgramURLMatcher} from '../../src/scripting/user-scripts/page-program-rules.js';
import {preparePageUIMount} from '../../src/scripting/user-scripts/page-ui-mount.js';

const root='examples/programs/page-ui-react-direct';

test('React direct uses the existing floating host on unrelated HTTP(S) documents',async()=>{
  const checked=await validateProgramProject(root);
  assert.equal(checked.entryMode,'component');
  assert.equal(checked.entry,'src/main.js');
  const pkg=JSON.parse(await readFile(root+'/package.json','utf8'));
  assert.equal(pkg.opendesk.framework,'react');
  const rules=pkg.opendesk.pageRules;
  assert.deepEqual(rules.matches,['*://*/*']);
  assert.deepEqual(rules.excludeMatches,[]);
  assert.equal(rules.world,'USER_SCRIPT');
  assert.equal(rules.allFrames,false);
  const matches=createPageProgramURLMatcher(rules);
  for(const url of ['https://example.com/article','https://news.example.net/story?q=1',
    'http://127.0.0.1:43111/demo-form.html','https://example.org/without-headings'])
    assert.equal(matches(url),true,'HTTP(S) document should match: '+url);
  for(const url of ['chrome://extensions/','file:///tmp/example.html','about:blank',
    'chrome-extension://test/panel.html'])
    assert.equal(matches(url),false,'restricted scheme should not match: '+url);
  assert.equal(preparePageUIMount({},undefined).strategy,'floating');

  const source=await readFile(root+'/src/main.js','utf8');
  assert.match(source,/from 'react'/);
  assert.match(source,/export default function App/);
  assert.match(source,/useReducer/);
  assert.match(source,/useCallback/);
  assert.match(source,/useEffect/);
  assert.match(source,/已点击 /);
  assert.match(source,/data-opendesk-action/);
  assert.doesNotMatch(source,/#page-ui-demo-target|#sample-text|#lab-text|createPageUI|createDemoEnhancer/);
  const output=await buildProgramProjectInMemory(root,{mode:'production'});
  assert.ok(output.sourceBytes<100000);
  assert.match(output.sourceUtf8,/\/\/ @match \*:\/\/\*\/\*/);
  assert.match(output.sourceUtf8,/\/\/ @opendesk-lib react/);
});
