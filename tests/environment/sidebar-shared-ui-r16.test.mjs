import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateSidebarToolPackage,serializeSidebarToolPackage,SIDEBAR_TOOL_SHARED_UI_RUNTIME} from '../../src/ui/sidebar-tools/package.js';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const sample={format:'opendesk.sidebar-tool.v1',id:'mini-example',version:'1.0.0',
  title:'Demo',description:'isolated',capabilities:[],html:'<div>OK</div>',css:'',js:'void 0;'};

test('shared UI opt-in leaves all old package bytes unchanged',()=>{
  const legacy=validateSidebarToolPackage(sample);
  assert.equal(Object.hasOwn(legacy,'uiRuntime'),false);
  assert.equal(serializeSidebarToolPackage(legacy).includes('uiRuntime'),false);
  const shared=validateSidebarToolPackage({...sample,uiRuntime:SIDEBAR_TOOL_SHARED_UI_RUNTIME});
  assert.match(serializeSidebarToolPackage(shared),/opendesk\.react-ui\.v1/);
  assert.throws(()=>validateSidebarToolPackage({...sample,uiRuntime:'other'}),/共享 UI Runtime/);
});
test('JSX imports map to fixed sandbox globals and opt-in resource path',async()=>{
  const [app,vite,bridge,entry,tool,contract,preview]=await Promise.all([
    read('examples/sidebar-tools/shared-ui-demo/src/App.jsx'),
    read('examples/sidebar-tools/shared-ui-demo/vite.config.mjs'),
    read('src/sidebar-tools/bridge.js'),read('src/entrypoints/sidebar-shared-ui.js'),
    read('examples/sidebar-tools/shared-ui-demo/tool.config.json').then(JSON.parse),
    read('scripts/build-contract.mjs'),read('examples/sidebar-tools/shared-ui-demo/preview/index.html')]);
  assert.match(app,/from '@opendesk\/ui'/);
  assert.match(vite,/'react\/jsx-runtime':'OpenDeskPageReact'/);
  assert.match(vite,/'react-dom\/client':'OpenDeskPageReact'/);
  assert.match(vite,/'@opendesk\/ui':'OpenDeskSidebarUI'/);
  assert.match(bridge,/await loadSharedUI\(\)/);
  assert.match(bridge,/\.\.\/libs\/page-frameworks\/react-19\.2\.0\.js/);
  assert.match(entry,/tokensCSS\+'\\n'\+componentCSS/);
  assert.match(contract,/'sidebar-shared-ui':/);
  assert.deepEqual(tool.capabilities,[]);
  assert.equal(tool.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.match(preview,/dist\/development\/sidebar-shared-ui\.js/);
  for(const source of [app,vite,entry,preview])
    assert.doesNotMatch(source,/https?:\/\/.*(?:cdn|jsdelivr|unpkg)/i);
});
test('built bundle contains no React runtime bytes',async t=>{
  const project=new URL('../../examples/sidebar-tools/shared-ui-demo/',import.meta.url);
  try{await stat(new URL('dist/tool.js',project));}
  catch{t.skip('requires actual Vite build in repository');return;}
  const pkg=await createSidebarToolPackage(fileURLToPath(project));
  assert.equal(pkg.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.ok(Buffer.byteLength(pkg.js,'utf8')<50000);
  assert.doesNotMatch(pkg.js,/ReactDOMRoot|ReactCurrentDispatcher|react\.production\.js/);
});
