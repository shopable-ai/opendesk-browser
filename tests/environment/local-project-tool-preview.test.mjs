import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createLocalProjectView} from '../../src/ui/local-project.js';
import {SIDEBAR_TOOL_STORE,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {developerTestFields} from './develop-view-fixture.mjs';

const KEY='opendesk.local-project.selection.v1';
const base='chrome-extension://test/native-agent/workspace.html';
const source='source-'+'a'.repeat(24),otherSource='source-'+'b'.repeat(24);
const workspace={workspaceId:'workspace-00000000-0000-0000-0000-000000000001',name:'same name',sourceId:source,access:'read-write'};
const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',sourceId:otherSource};
const tool={format:'opendesk.sidebar-tool.v1',id:'react-notes-starter',title:'React notes',version:'1.1.0',description:'Local preview fixture',capabilities:[],html:'<div></div>',css:'',js:'void 0;'};
const packageHash=await sha256Utf8(serializeSidebarToolPackage(tool));
const pointer={toolId:tool.id,installedPackageHash:packageHash};
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function fixture(t,{files=[workspace],saved={},sessionGate,installed=[tool]}={}){
  const model=createDeveloperView(),find=developerTestFields(model),writes=[],effects=[],calls=[],storageListeners=new Set();
  find('local-project-mode').checked=true;
  let nativeConnected=true;
  const session={},sessionWrites=[];
  const store={[KEY]:saved,[SIDEBAR_TOOL_STORE]:structuredClone(installed)};
  const api={runtime:{getURL:()=>base},windows:{getCurrent:async()=>({id:12})},tabs:{
    create:async value=>{effects.push(['create',value]);},
    query:()=>assert.fail('must not query or navigate an existing workspace'),
    update:()=>assert.fail('must not navigate an existing workspace')},
    storage:{local:{get:async key=>({[key]:structuredClone(store[key])}),set:async value=>{
      writes.push(structuredClone(value));Object.assign(store,structuredClone(value));
    }},session:{set:async value=>{sessionWrites.push(structuredClone(value));if(sessionGate)await sessionGate.promise;Object.assign(session,value);},remove:async key=>{delete session[key];}},onChanged:{addListener:fn=>storageListeners.add(fn),removeListener:fn=>storageListeners.delete(fn)}}};
  const client={requestLocalProject:async method=>{
    calls.push(method);
    if(method==='status')return {connected:false,nativeConnected};
    if(method==='workspaces.list')return {sessionId:'session-1234567890123456',workspaces:files};
    assert.fail('preview must not resolve/compile/run: '+method);
  }};
  const owner=createLocalProjectView({client,api,view:model});
  t.after(()=>{owner.dispose();model.dispose();});
  const choose=(id,value)=>{find(id).value=value;find(id).fire('change');};
  return {model,find,owner,api,store,session,sessionWrites,writes,effects,calls,storageListeners,choose,
    refresh:()=>find('local-project-refresh').fire('click'),
    setFiles:value=>{files=value;},disconnect:()=>{nativeConnected=false;},
    notify:()=>{for(const fn of storageListeners)fn({[SIDEBAR_TOOL_STORE]:{}},'local');}};
}

test('file-only Develop preview uses the existing catalog and installed metadata, never business storage or execution',async t=>{
  const f=fixture(t);await settle();
  assert.equal(f.owner.canAttemptRun(),false);
  assert.equal(f.find('local-project-preview').disabled,false);
  assert.match(f.find('local-project-status').textContent,/可打开文件工作区.*实时开发预览/);
  assert.deepEqual(f.find('local-project-tool').options.map(row=>row.value),['',tool.id]);
  assert.equal(f.find('local-project-tool').options[1].label,tool.title+' · v'+tool.version);
  assert.deepEqual(f.effects,[]);
  f.find('local-project-preview').fire('click',{isTrusted:false});await settle();assert.deepEqual(f.effects,[]);
  f.find('local-project-preview').fire('click');await settle();
  assertPreview(f,0,null);
  f.choose('local-project-tool',tool.id);await settle();
  assert.deepEqual(f.store[KEY].toolPointers,{},'selection alone does not save a source binding');
  f.find('local-project-tool-bind').fire('click',{isTrusted:false});await settle();
  assert.deepEqual(f.store[KEY].toolPointers,{});
  f.find('local-project-tool-bind').fire('click');await settle();
  assert.deepEqual(f.store[KEY].toolPointers,{[source]:pointer});
  assert.equal(f.find('local-project-tool-pointer').textContent,'源码关联已保存，下次将打开所选目录。');
  f.find('local-project-preview').fire('click');await settle();
  assertPreview(f,1,tool.id);
  assert.match(f.find('local-project-tool-pointer').textContent,/已关联目录：same name/);
  assert.doesNotMatch(f.find('local-project-tool-pointer').textContent,/source-[a-f0-9]{24}|[a-f0-9]{64}/);
  assert.deepEqual(f.store[SIDEBAR_TOOL_STORE],[tool]);
  assert.ok(f.writes.every(value=>Object.keys(value).length===1&&Object.hasOwn(value,KEY)));
  assert.ok(f.calls.every(method=>['status','workspaces.list'].includes(method)));
});

function assertPreview(f,index,toolId,expectedSource=source){
  const [effect,{url}]=f.effects[index];assert.equal(effect,'create');
  const target=new URL(url);assert.equal(target.origin,new URL(base).origin);
  assert.equal(target.pathname,new URL(base).pathname);assert.equal(target.searchParams.get('sourceId'),expectedSource);
  const id=target.searchParams.get('previewIntent');assert.match(id,/^[a-f0-9-]{36}$/);
  assert.equal(target.searchParams.has('previewTool'),false);
  const value=f.session['opendesk.tool-workspace-preview.intent.v1:'+id];
  assert.equal(value.sourceId,expectedSource);assert.equal(value.toolId,toolId);
  assert.equal(value.surface,'sidepanel');assert.equal(value.windowId,12);
  assert.ok(value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+60000);
}

test('real helper opens a new workspace with one bounded intent and never queries or navigates old drafts',async t=>{
  const f=fixture(t);await settle();f.find('local-project-preview').fire('click');await settle();
  assert.equal(f.effects.length,1);assert.equal(f.sessionWrites.length,1);assertPreview(f,0,null);
});

test('saved pointer restores the exact source after a new Native lease, and offline same-name sources never substitute',async t=>{
  const saved={bindingId:'file-workspace:old-lease',name:workspace.name,sourceId:source,localMode:true,
    toolId:tool.id,toolPointers:{[source]:pointer}};
  const f=fixture(t,{files:[other],saved});await settle();
  assert.equal(f.find('local-project-preview').disabled,true);
  assert.equal(f.owner.selectedProject().sourceId,source);
  assert.match(f.find('local-project-tool-pointer').textContent,/原关联目录未连接.*不会改用其他目录/);
  assert.doesNotMatch(f.find('local-project-tool-pointer').textContent,/source-[a-f0-9]{24}|[a-f0-9]{64}/);
  f.find('local-project-preview').fire('click');await settle();assert.deepEqual(f.effects,[]);
  f.setFiles([other,{...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'3'}]);f.refresh();await settle();
  assert.equal(f.find('local-project-preview').disabled,false);
  assert.equal(f.owner.selectedProject().sourceId,source);
  f.find('local-project-preview').fire('click');await settle();
  assertPreview(f,0,tool.id);
});

test('choosing an installed tool restores its unique pointer; no pointer guesses no directory name',async t=>{
  const f=fixture(t,{files:[other],saved:{bindingId:'file-workspace:'+other.workspaceId,
    sourceId:otherSource,toolPointers:{[source]:pointer}}});await settle();
  f.choose('local-project-tool',tool.id);await settle();
  assert.equal(f.owner.selectedProject().sourceId,source);
  assert.equal(f.find('local-project-preview').disabled,true);
  f.setFiles([workspace,other]);f.refresh();await settle();
  assert.equal(f.owner.selectedProject().sourceId,source);
  f.choose('local-project-tool','');f.find('local-project-tool-bind').fire('click');await settle();
  assert.deepEqual(f.store[KEY].toolPointers,{});
  const unbound=fixture(t,{files:[workspace,other]});await settle();
  unbound.choose('local-project-tool',tool.id);await settle();
  assert.equal(unbound.find('local-project-preview').disabled,true);
  assert.equal(unbound.owner.selectedProject(),null,'same labels are not identity');
});

test('a source without sourceId cannot request auto preview, while file workspace opening is retained',async t=>{
  const {sourceId,...file}=workspace;
  const f=fixture(t,{files:[file]});await settle();
  assert.equal(f.owner.canOpenWorkspace(),true);
  assert.equal(f.find('local-project-preview').disabled,true);
  f.find('local-project-preview').fire('click');await settle();assert.deepEqual(f.effects,[]);
});

test('double click creates one intent; a later selection cannot retarget the captured source',async t=>{
  const gate=deferred(),f=fixture(t,{sessionGate:gate});await settle();
  f.find('local-project-preview').fire('click');f.find('local-project-preview').fire('click');
  assert.equal(f.sessionWrites.length,1);
  f.choose('local-project-tool',tool.id);gate.resolve();await settle();
  assert.equal(f.effects.length,1);assertPreview(f,0,null);
});

test('installed update invalidates the saved package hash until explicitly rebound',async t=>{
  const f=fixture(t);await settle();f.choose('local-project-tool',tool.id);
  f.find('local-project-tool-bind').fire('click');await settle();
  assert.deepEqual(f.store[KEY].toolPointers,{[source]:pointer});
  const updated={...tool,js:'void 1;'};f.store[SIDEBAR_TOOL_STORE]=[updated];f.notify();await settle();
  assert.equal(f.find('local-project-preview').disabled,true);
  assert.match(f.find('local-project-tool-pointer').textContent,/已安装工具包已更新.*保存源码关联.*重新确认目录/);
  f.find('local-project-preview').fire('click');await settle();assert.deepEqual(f.effects,[]);
  assert.equal(f.find('local-project-tool-bind').disabled,false);
  f.find('local-project-tool-bind').fire('click');await settle();
  assert.equal(f.find('local-project-preview').disabled,false);
  assert.equal(f.store[KEY].toolPointers[source].installedPackageHash,await sha256Utf8(serializeSidebarToolPackage(updated)));
});

test('installed metadata updates are read only, removed tools fail closed, and dispose removes listener',async t=>{
  const f=fixture(t);await settle();f.choose('local-project-tool',tool.id);await settle();
  f.store[SIDEBAR_TOOL_STORE]=[];f.notify();await settle();
  assert.equal(f.find('local-project-tool').value,tool.id);
  assert.equal(f.find('local-project-preview').disabled,true);
  f.find('local-project-preview').fire('click');await settle();assert.deepEqual(f.effects,[]);
  assert.equal(f.storageListeners.size,1);f.owner.dispose();assert.equal(f.storageListeners.size,0);
});

test('existing React Develop fragment renders preview fields and starter guidance with its current provider',async()=>{
  const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  const compile=async path=>(await transform(await readFile(new URL(path,import.meta.url),'utf8'),{loader:'tsx',format:'esm',jsx:'transform'}))
    .code.replaceAll('"react"',JSON.stringify(import.meta.resolve('react')));
  const controls=moduleURL(await compile('../../src/ui/react/tabs/develop-controls.tsx'));
  const {DevelopProvider}=await import(controls);
  const {DevelopLocalProject}=await import(moduleURL((await compile('../../src/ui/react/tabs/develop-local.tsx'))
    .replace('"./develop-controls.tsx"',JSON.stringify(controls))));
  const model=createDeveloperView();model.patch('local-project-tools',{hidden:false});
  try{
    const html=renderToStaticMarkup(React.createElement(DevelopProvider,{view:model},React.createElement(DevelopLocalProject)));
    for(const id of ['local-project-tool','local-project-tool-bind','local-project-preview','local-project-tool-pointer'])assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(html,/独立本地项目/);assert.match(html,/在侧栏调试 ↗/);
    assert.match(html,/保存源码关联/);assert.doesNotMatch(html,/保存显示关联/);
    assert.match(html,/关联只记住此工具要打开的目录，不证明它是正式安装包的源码，也不授予安装权限/);
    assert.match(html,/react-starter\/README.md/);assert.match(html,/npm run build:watch/);assert.match(html,/scripts\/watch-sidebar-tool.mjs/);
  }finally{model.dispose();}
});
