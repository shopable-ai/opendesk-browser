import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const repo=resolve('.');
const root=resolve(repo,'examples/sidebar-tools/cookie-editor');
const candidate=resolve(repo,'artifacts/sidebar-tools/cookie-editor/r56-react-2.0.24-candidate.opendesk-tool.json');
const get=(path)=>readFile(resolve(root,path));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('built React JSX uses one classic chunk and pinned runtime, not bundled React',async()=>{
  const [js,css,ready]=await Promise.all([
    get('dist/tool.js'),get('dist/tool.css'),
    get('dist/build-ready.json').then(bytes=>JSON.parse(bytes.toString('utf8')))
  ]);
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  for(const [name,bytes] of [['tool.js',js],['tool.css',css]]){
    assert.equal(ready.files['dist/'+name].bytes,bytes.length);
    assert.equal(ready.files['dist/'+name].sha256,sha(bytes));
  }
  const script=js.toString('utf8');
  assert.match(script,/OpenDeskPageReact/);
  assert.match(script,/OpenDeskSidebarUI/);
  assert.match(script,/createRoot/);
  assert.doesNotMatch(script,/ReactCurrentDispatcher|react\.production\.js|SECRET_FIXTURE|secret_preview_never_real/);
  assert.ok(js.length<220000,'tool script exceeds official packer limit');
  assert.ok(css.length<120000,'compiled stylesheet exceeds official packer limit');
  assert.match(css.toString('utf8'),/^\/\* @opendesk-shared-design \*\//);
});

test('canonical packer emits independent 2.0.24 candidate without touching formal native',async()=>{
  const [official,config,staged,bytes]=await Promise.all([
    get('cookie-editor.opendesk-tool.json').then(bytes=>JSON.parse(bytes.toString('utf8'))),
    get('tool.config.json').then(bytes=>JSON.parse(bytes.toString('utf8'))),
    readFile(resolve(repo,'artifacts/sidebar-tools/cookie-editor/r56-react-project/tool.config.json')).then(bytes=>JSON.parse(bytes.toString('utf8'))),
    readFile(candidate)
  ]);
  const output=JSON.parse(bytes.toString('utf8'));
  assert.equal(config.version,'2.0.23');
  assert.equal(official.version,'2.0.23');
  assert.equal(staged.id,'cookie-editor');
  assert.equal(staged.version,'2.0.24');
  assert.equal(staged.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(staged.files.js,'dist/tool.js');
  assert.equal(output.id,'cookie-editor');
  assert.equal(output.version,'2.0.24');
  assert.equal(output.uiRuntime,'opendesk.react-ui.v1');
  assert.match(output.css,/^\/\* opendesk\.shared-design\.v1 sha256=[0-9a-f]{64}/);
  assert.match(output.css,/\.od-button\{/);
  assert.match(output.css,/\.od-icon-button\{/);
  assert.match(output.css,/:is\(input,select,textarea\)\.od-field\{/);
  assert.equal(output.js,(await get('dist/tool.js')).toString('utf8'));
  assert.doesNotMatch(output.js,/secret_preview_never_real|sess_demo_only_C18/);
  assert.ok(bytes.length>1000);
});
