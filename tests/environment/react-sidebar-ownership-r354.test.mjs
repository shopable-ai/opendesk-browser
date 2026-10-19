// Incremental R35.4 anti-drift gate. This does NOT certify five full React
// pages: My/Workflow/Developer/Cloud legacy business panels remain PARTIAL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {load} from 'cheerio';
import {transformWithEsbuild} from 'vite';
const read=path=>readFile(path,'utf8');

async function productionReactFiles(directory){
  const entries=await readdir(directory,{withFileTypes:true}),result=[];
  for(const entry of entries){
    if(entry.name==='preview')continue; // not the production Side Panel
    const path=directory+'/'+entry.name;
    if(entry.isDirectory())result.push(...await productionReactFiles(path));
    else if(/\\.tsx$/.test(entry.name))result.push(path);
  }
  return result;
}

test('R35.4 guards one trusted React root, fixed entry and exact workbench IDs',async()=>{
  const [html,root,entry,host,shell]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/react/main.tsx'),
    read('src/entrypoints/tool-shell.js'),read('src/ui/tool-shell.js'),
    read('src/ui/react/app-shell.tsx')
  ]);
  const $=load(html),ids=$('[id]').map((_,node)=>$(node).attr('id')).get();
  assert.equal(ids.length,new Set(ids).size,'static HTML must have unique IDs');
  for(const name of ['tasks','tools','workflow','develop','cloud']){
    assert.equal($('#workbench-'+name).length,1,name);
    assert.equal($('[data-workbench-tab="'+name+'"]').length,1,name);
    assert.equal($('#workbench-'+name).attr('data-workbench-page'),name);
  }
  assert.equal($('#extension-center').length,1);
  assert.equal($('#cloud-request-samples').length,0,
    'React request history must not regain a second static implementation');
  assert.equal($('#cloud-first-run').length,0,
    'React first-run must not regain a second static implementation');
  assert.match(entry,/initToolShell/);
  assert.match(host,/mountExtensionList\\(document,\\{debugEnabled,appShell:true,/);
  assert.match(root,/createRoot\\(shell\\?\\.mount\\|\\|section\\)/);
  assert.doesNotMatch(shell,/\\bcreateRoot\\s*\\(|\\bcreatePortal\\s*\\(/);
  for(const directory of ['packages/opendesk-ui-react','src/ui-react','src/new-sidebar'])
    assert.equal(existsSync(directory),false,'forbidden duplicate UI source: '+directory);
  const tsx=await productionReactFiles('src/ui/react');
  let roots=0;
  for(const path of tsx){
    const source=path==='src/ui/react/main.tsx'?root:await read(path);
    const parsed=await transformWithEsbuild(source,path,{loader:'tsx',jsx:'transform',target:'es2022'});
    assert.ok(parsed.code.length>0,path+' must compile');
    roots+=(source.match(/\\bcreateRoot\\s*\\(/g)||[]).length;
  }
  assert.equal(roots,1,'exactly one production createRoot in the trusted UI');
});

test('R35.4 tabs and reusable components cannot become a second privileged Host',async()=>{
  const paths=[
    'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/tools.tsx',
    'src/ui/react/tabs/workflow.tsx','src/ui/react/tabs/develop.tsx',
    'src/ui/react/tabs/cloud.tsx',
    ...await productionReactFiles('src/ui/react/components/ui')
  ];
  for(const path of paths){
    const code=await read(path);
    assert.doesNotMatch(code,/(?:\\bchrome|\\bbrowser)\\s*\\.\\s*(?:runtime|tabs|scripting|permissions|storage)|\\bclient\\.request\\s*\\(|\\bnew\\s+Worker\\s*\\(|\\beval\\s*\\(/,
      path+' must stay presentation-only');
  }
  const cloud=await read('src/ui/react/tabs/cloud.tsx');
  const owner=await read('src/ui/cloud-hosting.js');
  assert.match(cloud,/actionsModel\\.onRefresh/);
  assert.match(cloud,/actionsModel\\.onOpenConsole/);
  assert.match(owner,/reactUI\\?\\.cloudActionsMounted/);
  assert.match(owner,/reactUI\\.renderCloudActions\\(/);
});
