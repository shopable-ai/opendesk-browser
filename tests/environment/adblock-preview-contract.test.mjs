// React AdBlock R2: production package and historical-preview contract.
// These are source/package tests, NOT Chrome network or native installation tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage,checkSidebarToolProjectPackage}
  from '../../scripts/build-sidebar-tool.mjs';
import {SIDEBAR_TOOL_SHARED_UI_RUNTIME}
  from '../../src/ui/sidebar-tools/package.js';
const project=resolve('examples/sidebar-tools/adblock');
const read=path=>readFile(resolve(project,path),'utf8');

test('AdBlock 1.2.2 candidate uses one compiled React 19 Shared UI tool',async()=>{
  const [pkg,config,jsx,entry,css,compiled]=await Promise.all([
    createSidebarToolPackage(project),read('tool.config.json'),read('src/App.jsx'),
    read('src/main.jsx'),read('dist/tool.css'),read('dist/tool.js')]);
  const meta=JSON.parse(config);
  assert.equal(pkg.id,'adblock');
  assert.equal(pkg.version,'1.2.2');
  assert.deepEqual(pkg.capabilities,['adblock.control']);
  assert.equal(pkg.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.equal(pkg.html,'<div id="tool-app"></div>\n');
  assert.equal(pkg.css,css);
  assert.equal(pkg.js,compiled);
  assert.equal(meta.files.js,'dist/tool.js');
  assert.equal(meta.files.css,'dist/tool.css');
  assert.match(jsx,/from '@opendesk\/ui'/);
  for(const name of ['Card','Switch','Button'])assert.match(jsx,new RegExp('\\b'+name+'\\b'));
  for(const op of ['adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore','adblock.status'])
    assert.ok(jsx.includes(op),'real SDK operation missing: '+op);
  assert.match(entry,/createRoot/);
  assert.match(entry,/root\.unmount/);
  assert.match(compiled,/OpenDeskPageReact,OpenDeskSidebarUI/);
  assert.match(compiled,/adblock\.site\.set/);
  assert.doesNotMatch(compiled,/from ['"]react|from ['"]@opendesk\/ui/);
  assert.doesNotMatch(compiled,/declarativeNetRequest|permissions\.request/);
  const files=(await import('node:fs/promises')).readdir;
  assert.deepEqual((await files(project)).filter(name=>name.endsWith('.opendesk-tool.json')),
    ['adblock.opendesk-tool.json']);
  const published=JSON.parse(await read('adblock.opendesk-tool.json'));
  if(published.version===pkg.version){
    const receipt=await checkSidebarToolProjectPackage(project);
    assert.equal(receipt.status,'PROJECT_PACKAGE_MATCH');
    assert.equal(receipt.installed,false,'package matching is not a Chrome install receipt');
  }else{
    assert.equal(published.version,'1.2.1',
      '1.2.2 source candidate must not silently claim that 1.2.1 was replaced');
  }
});

test('sandbox-owned JSX does not inherit Chrome DNR authority',async()=>{
  const [app,host,router]=await Promise.all([
    read('src/App.jsx'),read('trusted/tool-host.js'),
    readFile(resolve('src/ui/sidebar-tools.js'),'utf8')]);
  assert.match(host,/requestBrowserClick/);
  assert.match(host,/event\?\.isTrusted!==true/);
  assert.match(host,/E_ADBLOCK_STATE_CHANGED/);
  assert.match(host,/await send\('adblock\.status'/);
  assert.match(router,/adblock\.request/);
  assert.match(router,/opendesk\.react-ui\.v1/);
  assert.match(router,/opendesk\.adblock\.ui\.v1/);
  assert.doesNotMatch(app,/chrome\.declarativeNetRequest|chrome\.permissions/);
});

test('approved R1 design preview stays immutable and is never labeled current DNR',async()=>{
  const bytes=await readFile(resolve(project,'preview/index.html'));
  assert.equal(bytes.length,23624);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7');
  assert.match(bytes.toString('utf8'),/非真实广告拦截/);
});
