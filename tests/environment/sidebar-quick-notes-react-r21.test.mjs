import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {itemBytes,recoverNotes,validNote,noteLabel,pageInfoFrom,proposedSave,
  proposedDelete,MAX_NOTES,STORAGE_KEY} from '../../examples/sidebar-tools/quick-notes-react/src/model.js';
const repo=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,repo),'utf8');
const ETAG='a'.repeat(64);
const empty={value:null,etag:ETAG};
const create=(data={})=>proposedSave({notes:[],selectedId:null,text:'中文笔记',
  makeId:()=> 'id-1',at:123,...data});
test('native unchanged configuration and independent Shared UI identity',async()=>{
  const [original,react,boot,jsx,vite,html]=await Promise.all([
    read('examples/sidebar-tools/quick-notes/tool.config.json').then(JSON.parse),
    read('examples/sidebar-tools/quick-notes-react/tool.config.json').then(JSON.parse),
    read('examples/sidebar-tools/quick-notes-react/src/main.jsx'),
    read('examples/sidebar-tools/quick-notes-react/src/App.jsx'),
    read('examples/sidebar-tools/quick-notes-react/vite.config.mjs'),
    read('examples/sidebar-tools/quick-notes-react/src/root.html')]);
  assert.equal(original.id,'quick-notes');
  assert.equal(original.version,'1.1.9');
  assert.equal(react.id,'quick-notes-react');
  assert.notEqual(original.id,react.id);
  assert.deepEqual(react.capabilities,original.capabilities);
  assert.equal(react.uiRuntime,'opendesk.react-ui.v1');
  assert.match(jsx,/from '@opendesk\/ui'/);
  for(const name of ['Button','IconButton','Card','CardContent'])
    assert.match(jsx,new RegExp('\\b'+name+'\\b'));
  assert.match(jsx,/ifMatch:state\.etag/);
  assert.match(jsx,/opendesk-page-changed/);
  assert.match(boot,/createRoot\(target\)/);
  assert.match(boot,/root\.unmount\(\)/);
  assert.match(vite,/'react\/jsx-runtime':'OpenDeskPageReact'/);
  assert.match(vite,/'@opendesk\/ui':'OpenDeskSidebarUI'/);
  assert.match(html,/data-mark-url/);
});
test('legacy note restores only inside this tool; authoritative empty notes does not resurrect',()=>{
  const up=recoverNotes(empty,'旧版中文',()=> 'legacy-1');
  assert.equal(up.upgrading,true);
  assert.equal(up.legacyPending,true);
  assert.equal(up.notes[0].text,'旧版中文');
  assert.equal(up.notes[0].id,'legacy-1');
  assert.equal(recoverNotes({etag:ETAG,value:[]},'旧版中文').notes.length,0);
  assert.throws(()=>recoverNotes({etag:null,value:null},null),/安全存储/);
});
test('corrupt stored data fails closed before any mutation',()=>{
  for(const wrong of ['hello',{},Array(17).fill({id:'x',text:'ok'}),[{id:1,text:'bad'}], [{id:'x',text:'太'.repeat(8193)}]])
    assert.throws(()=>recoverNotes({etag:ETAG,value:wrong},null),/数据格式无效/);
  const ok=recoverNotes({etag:ETAG,value:[{id:'x',text:'甲',pageTitle:'a'.repeat(600),
    pageUrl:'a'.repeat(4300),updatedAt:'bad'}]},null);
  assert.equal(ok.notes[0].pageTitle.length,512);
  assert.equal(ok.notes[0].pageUrl.length,4096);
  assert.equal(ok.notes[0].updatedAt,0);
  assert.equal(validNote({id:'x',text:'中文'}),true);
});
test('all writes are proposed with the original 8 KiB whole-item and 16-note contract',()=>{
  const {id,next}=create();
  assert.equal(STORAGE_KEY,'notes');
  assert.equal(MAX_NOTES,16);
  assert.equal(id,'id-1');
  assert.equal(next[0].text,'中文笔记');
  assert.equal(next[0].updatedAt,123);
  assert.equal(noteLabel(next[0]),'中文笔记');
  const edit=proposedSave({notes:next,selectedId:id,text:'已更新',
    include:false,pageInfo:null,at:124});
  assert.equal(edit.next.length,1);
  assert.equal(edit.next[0].text,'已更新');
  assert.deepEqual(proposedDelete(edit.next,id),[]);
  assert.throws(()=>create({text:'  '}),/请输入/);
  assert.throws(()=>create({text:'中'.repeat(3200)}),/8 KiB/);
  assert.throws(()=>create({notes:Array(16).fill({id:'x',text:'y'})}),/最多保存/);
  assert.ok(itemBytes(next)<8192);
});
test('page attachment opt-in, offline preservation and URL classification',()=>{
  assert.equal(pageInfoFrom({status:'available',url:'chrome://extensions'}),null);
  assert.equal(pageInfoFrom({status:'unavailable',url:'https://example.org'}),null);
  const linked=pageInfoFrom({status:'available',url:'https://example.org/page',title:'标题'});
  assert.equal(linked.title,'标题');
  assert.throws(()=>create({include:true,pageInfo:null}),/不可关联/);
  const saved=create({include:true,pageInfo:linked});
  assert.equal(saved.next[0].pageUrl,'https://example.org/page');
  const offline=proposedSave({notes:saved.next,selectedId:'id-1',
    text:'离线改动',include:true,pageInfo:null,at:3});
  assert.equal(offline.next[0].pageTitle,'标题');
  assert.equal(offline.next[0].pageUrl,'https://example.org/page');
});
test('preview SDK cannot be confused with real installed RPC',async()=>{
  const [preview,main,stage]=await Promise.all([
    read('examples/sidebar-tools/quick-notes-react/preview/sdk-preview.js'),
    read('examples/sidebar-tools/quick-notes-react/src/main.jsx'),
    read('examples/sidebar-tools/quick-notes-react/scripts/stage-preview.mjs')]);
  assert.match(preview,/PREVIEW ONLY/);
  assert.match(preview,/store=\{notes:null,note:null\}/);
  assert.doesNotMatch(main,/sdk-preview|localStorage|sessionStorage/);
  assert.match(stage,/createSidebarToolPackage\(original\)/);
});

test('host source cannot import Quick Notes React business or duplicate its runtime',async()=>{
  const source=new URL('../../src/',import.meta.url);
  const all=[];
  async function visit(dir){
    for(const row of await readdir(dir,{withFileTypes:true})){
      if(row.isDirectory()){await visit(new URL(row.name+'/',dir));continue;}
      if(row.isFile()&&/\\.(?:js|jsx|mjs|ts|tsx)$/.test(row.name))
        all.push(new URL(row.name,dir));
    }
  }
  await visit(source);
  assert.ok(all.length>0,'scan all framework sources, not a hand-selected list');
  for(const file of all){
    const code=await readFile(file,'utf8');
    assert.doesNotMatch(code,
      /\\b(?:import|export)\\s+[^;\\n]*?\\bfrom\\s*['"][^'"]*quick-notes-react\\/(?:src|dist)\\//,
      'framework must not import Quick Notes React business: '+file.pathname);
    assert.doesNotMatch(code,
      /\\b(?:import|require)\\s*\\(\\s*['"][^'"]*quick-notes-react\\/(?:src|dist)\\//,
      'framework must not load Quick Notes React business dynamically: '+file.pathname);
  }
  const [app,entry,model]=await Promise.all([
    read('examples/sidebar-tools/quick-notes-react/src/App.jsx'),
    read('examples/sidebar-tools/quick-notes-react/src/main.jsx'),
    read('examples/sidebar-tools/quick-notes-react/src/model.js')
  ]);
  assert.match(entry,/globalThis\\.OpenDeskTool/);
  assert.match(entry,/bridge\\.request/);
  for(const business of [app,entry,model]){
    assert.doesNotMatch(business,/\\bchrome\\.(?:storage|runtime|tabs)\\b|\\blocalStorage\\b|\\bsessionStorage\\b/);
    assert.doesNotMatch(business,/quick-notes\\/src\\//,'must not import native Quick Notes');
  }
});
