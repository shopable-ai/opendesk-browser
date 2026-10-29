// Mandatory post-build acceptance. Missing Vite/WXT output is FAIL, not SKIP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const project=resolve(repo,'projects/quick-notes-react');
const original=resolve(repo,'projects/quick-notes');
const preview=resolve(project,'.opendesk-preview');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('two real package encoders preserve identity, parity and no duplicated runtime',async()=>{
  const [native,react]=await Promise.all([
    createSidebarToolPackage(original),createSidebarToolPackage(project)]);
  assert.equal(native.id,'quick-notes');
  assert.equal(react.id,'quick-notes-react');
  assert.deepEqual(native.capabilities,react.capabilities);
  assert.equal(react.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(native.uiRuntime,undefined);
  assert.match(react.html,/data:image\/png;base64,/);
  assert.match(react.js,/OpenDeskPageReact/);
  assert.match(react.js,/OpenDeskSidebarUI/);
  assert.doesNotMatch(react.js,/ReactDOMRoot|ReactCurrentDispatcher|react\.production\.js/);
  assert.ok(Buffer.byteLength(react.js)<60000,'shared tool must not bundle React');
  assert.ok(encodeSidebarToolPackage(react).length<320000);
  assert.ok(encodeSidebarToolPackage(native).length<320000);
});
test('build receipt binds tool JS/CSS to this source revision',async()=>{
  const ready=JSON.parse(await readFile(resolve(project,'dist/build-ready.json')));
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  for(const name of ['tool.js','tool.css']){
    const bytes=await readFile(resolve(project,'dist',name));
    assert.ok(bytes.length>0);
    assert.equal(ready.files['dist/'+name].bytes,bytes.length);
    assert.equal(ready.files['dist/'+name].sha256,hash(bytes));
  }
  for(const name of ['src/App.jsx','src/main.jsx','src/model.js','src/style.css']){
    assert.ok(ready.sources?.[name],'source-bound receipt missing '+name);
  }
  assert.ok(Object.keys(ready.sources).length<=32);
  for(const [name,record] of Object.entries(ready.sources)){
    assert.match(name,/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
    assert.ok(!name.split('/').some(part=>part==='.'||part==='..'));
    const bytes=await readFile(resolve(project,name));
    assert.equal(record.bytes,bytes.length,'stale source bytes: '+name);
    assert.equal(record.sha256,hash(bytes),'stale compiled source: '+name);
  }
});
test('source-bound dual preview matches the native and pinned browser asset bytes',async()=>{
  const receipt=JSON.parse(await readFile(resolve(preview,'receipt.json')));
  assert.equal(receipt.format,'opendesk.quick-notes-react-preview.v1');
  assert.equal(receipt.originalBaseline.id,'quick-notes');
  for(const file of [...receipt.browserAssets,...receipt.nativePreview]){
    const target=receipt.browserAssets.some(x=>x.path===file.path)
      ?resolve(preview,'browser',file.path):resolve(preview,file.path);
    const bytes=await readFile(target);
    assert.equal(bytes.length,file.bytes);
    assert.equal(hash(bytes),file.sha256);
  }
  const packaged=await createSidebarToolPackage(project);
  const builtCSS=await readFile(resolve(project,'dist/tool.css'),'utf8');
  assert.ok(builtCSS.startsWith('/* @opendesk-shared-design */'),
    'Compiled CSS must retain the explicit design opt-in marker');
  assert.ok(packaged.css.startsWith('/* opendesk.shared-design.v1 sha256='),
    'Installed CSS must embed canonical design reset as the native tool');
  assert.match(packaged.css,/\*\{box-sizing:border-box\}/);
  const cssBytes=await readFile(resolve(preview,'react.css'));
  assert.equal(cssBytes.toString('utf8'),packaged.css,
    'React source-bound preview MUST use final canonical install-package CSS, not raw Vite CSS');
  assert.equal(receipt.reactPackageCss.sha256,hash(cssBytes));
  assert.equal(receipt.reactPackageCss.bytes,cssBytes.length);
  const html=await readFile(resolve(project,'preview/index.html'),'utf8');
  assert.match(html,/\.opendesk-preview\/react\.css/);
  const fixed=receipt.browserAssets.find(x=>x.path===PAGE_FRAMEWORK_RUNTIMES.react.output);
  assert.equal(fixed.sha256,PAGE_FRAMEWORK_RUNTIMES.react.sha256);
  assert.equal(fixed.bytes,PAGE_FRAMEWORK_RUNTIMES.react.bytes);
  const staging=await readFile(resolve(project,'preview/compare.html'),'utf8');
  assert.match(staging,/\.opendesk-preview\/native\.html/);
  assert.match(staging,/index\.html/);
});
