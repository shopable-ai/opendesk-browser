import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createContext,runInContext,Script} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const root=resolve('examples/sidebar-tools/bookmark-manager');
const sources=['src/model.js','src/service.js','src/main.js'];
const src=path=>readFile(resolve(root,path),'utf8');
const sandbox=async()=>{
  const ctx=createContext({URL});
  runInContext(await src('src/model.js'),ctx);
  runInContext(await src('src/service.js'),ctx);
  return ctx;
};

test('R2 builds with existing v2 packer; does not claim a nonexistent Full capability',async()=>{
  const pkg=await createSidebarToolPackage(root);
  assert.equal(pkg.id,'bookmark-manager');
  assert.equal(pkg.version,'0.2.1');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(pkg.capabilities,[]);
  assert.equal(pkg.scripts.length,2);
  assert.ok(pkg.js.includes('OpenDeskSDK'));
});

test('all R2 sandbox sources remain Classic-only SDK consumers, without Chrome/private Host',async()=>{
  for(const path of sources){
    const code=await src(path);
    assert.doesNotThrow(()=>new Script(code,{filename:path}));
    assert.doesNotMatch(code,/\bchrome\s*\.\s*(?:bookmarks|permissions)\b/);
    assert.doesNotMatch(code,/OpenDeskTool\s*\.\s*request\s*\(/);
    assert.doesNotMatch(code,/\bfetch\s*\(/);
    assert.doesNotMatch(code,/(?:^|\n)\s*(?:import|export)\s+(?:[\w*{]|["'])/);
  }
});

test('invalid or missing tree is an error, not a forged empty bookmark response',async()=>{
  const ctx=await sandbox(),model=ctx.BookmarkR2Model;
  assert.throws(()=>model.bookmarkTree([]),/未返回有效/);
  assert.throws(()=>model.bookmarkTree(null),/未返回有效/);
  assert.throws(()=>model.asHttpUrl('javascript:alert(1)'),/HTTP/);
});

test('R1 tree projection retains complete 550-bookmark search with 200-row initial bound',async()=>{
  const ctx=await sandbox(),model=ctx.BookmarkR2Model;
  const children=Array.from({length:550},(_,i)=>({id:String(i+10),parentId:'1',
    title:'Needle '+i,url:'https://example.org/'+i}));
  const tree=model.bookmarkTree([{id:'0',title:'root',children:[
    {id:'1',title:'书签栏',parentId:'0',children}]}]);
  const projected=model.projectBookmarkRows(tree,{search:'Needle',limit:200});
  assert.equal(projected.total,550);assert.equal(projected.rows.length,200);
  assert.equal(model.projectBookmarkRows(tree,{search:'Needle 549'}).rows.length,1);
  assert.equal(model.projectBookmarkRows(tree,{search:'Needle',limit:600}).rows.length,550);
});

test('R2.2 refuses partial, misparented and multiple-root native trees',async()=>{
  const ctx=await sandbox(),model=ctx.BookmarkR2Model;
  const make=children=>[{id:'0',title:'root',children:[
    {id:'1',title:'bar',parentId:'0',children}]}];
  const partial=make([{id:'2',title:'folder',parentId:'1'}]);
  assert.throws(()=>model.bookmarkTree(partial),/完整子项/);
  assert.throws(()=>model.bookmarkTree(make([{id:'2',title:'leaf',
    parentId:'wrong',url:'https://example.org/'}])),/父目录不一致/);
  assert.throws(()=>model.bookmarkTree(make([{id:'2',title:'leaf',
    parentId:'1',url:'https://example.org/',children:[]}])),/节点类型无效/);
  assert.throws(()=>model.bookmarkTree([...make([]),
    {id:'999',title:'extra',children:[]}]),/唯一根节点/);
  assert.throws(()=>model.bookmarkFlatTree([
    {id:'0',title:'root'},{id:'1',title:'bar',parentId:'0'},
    {id:'2',title:'orphan',url:'https://example.org/'}],
    {snapshotRef:'abcdefghijklmnop'}),/唯一根节点/);
  const data=fullSdk(ctx,{roots:partial});
  await assert.rejects(ctx.BookmarkR2Service.create(data.sdk).load(),/完整子项/);
  assert.equal(data.calls.some(([op])=>['create','update','move','remove','removeTree'].includes(op)),false);
});

test('Owned-only installed SDK cannot cause any Full bookmark reads or writes',async()=>{
  const ctx=await sandbox();let ownedCalls=0;
  const sdk={
    capabilities:{list:async()=>[
      {operation:'browser.bookmarks.create',requiredCapabilities:['browser.bookmarks'],status:{callableNow:true}},
      {operation:'browser.bookmarks.removeOwned',requiredCapabilities:['browser.bookmarks'],status:{callableNow:true}}
    ],getStatus:async()=>({callableNow:true})},
    bookmarks:{create:async()=>{ownedCalls++},removeOwned:async()=>{ownedCalls++}}
  };
  const service=ctx.BookmarkR2Service.create(sdk),result=await service.probe();
  assert.equal(result.ready,false);
  assert.ok(result.missing.length>0);
  await assert.rejects(service.load(),/缺少公开接口/);
  await assert.rejects(service.createFolder({title:'test',parentId:'1'}),/缺少公开接口/);
  assert.equal(ownedCalls,0);
});

test('no Full capability even with matching method names must fail closed',async()=>{
  const ctx=await sandbox();const ops=ctx.BookmarkR2Service.METHODS;
  const sdk={capabilities:{
    list:async()=>Array.from(ops,operation=>({operation:'browser.bookmarks.'+operation,
      requiredCapabilities:['browser.bookmarks'],status:{callableNow:true}})),
    getStatus:async()=>({callableNow:true})
  },bookmarks:{getTree:async()=>[],get:()=>{},search:()=>{},create:()=>{},update:()=>{},
    move:()=>{},remove:()=>{},prepareRemoveTree:()=>{},removeTree:()=>{},
    observe:{start:()=>{},read:()=>{},stop:()=>{}}}};
  const result=await ctx.BookmarkR2Service.create(sdk).probe();
  assert.equal(result.ready,false);
  assert.equal(result.unscoped.length,ops.length);
});

test('folder removeTree is never issued without a trusted atomic precondition',async()=>{
  const ctx=await sandbox(),ops=ctx.BookmarkR2Service.METHODS;
  const roots=[{id:'0',title:'root',children:[{id:'1',title:'书签栏',parentId:'0',children:[
    {id:'2',title:'folder',parentId:'1',children:[{id:'3',title:'link',parentId:'2',url:'https://example.org/'}]}
  ]}]}];
  let deletes=0;
  const list=async()=>Array.from(ops,operation=>({operation:'browser.bookmarks.'+operation,
    requiredCapabilities:['browser.bookmarks.full'],status:{callableNow:true}}));
  const sdk={capabilities:{list,getStatus:async()=>({
    callableNow:true,requiredCapabilities:['browser.bookmarks.full']})},
    bookmarks:{getTree:async()=>roots,get:async()=>[],search:async()=>[],create:async()=>{},
      update:async()=>{},move:async()=>{},remove:async()=>{},
      prepareRemoveTree:async()=>{},removeTree:async()=>{deletes++},
      observe:{start:async()=>{},read:async()=>{},stop:async()=>{}}}};
  const service=ctx.BookmarkR2Service.create(sdk);
  assert.equal((await service.probe()).ready,true);
  const tree=await service.load();
  const item=tree.byId.get('2'),sig=ctx.BookmarkR2Model.descendantSignatures(tree,item.id);
  await assert.rejects(service.remove({expected:item,confirmed:true,expectedDescendantSignatures:sig}),
    /Host 书签快照/);
  assert.equal(deletes,0);
});


function fullSdk(ctx,{roots,read,prepared}={}){
  const calls=[];
  const methods=ctx.BookmarkR2Service.METHODS;
  const list=async()=>Array.from(methods,operation=>({
    operation:'browser.bookmarks.'+operation,
    requiredCapabilities:['browser.bookmarks.full'],status:{callableNow:true}
  }));
  const bookmarks={
    getTree:async input=>{calls.push(['getTree',input]);return read?read(input):roots},
    get:async input=>{calls.push(['get',input]);return []},
    search:async input=>{calls.push(['search',input]);return []},
    create:async input=>{calls.push(['create',input]);return {id:'NEW'}},
    update:async input=>{calls.push(['update',input]);return {id:input.id}},
    move:async input=>{calls.push(['move',input]);return {id:input.id}},
    remove:async input=>{calls.push(['remove',input]);return {removed:true}},
    prepareRemoveTree:async input=>{calls.push(['prepareRemoveTree',input]);return prepared?.(input)||
      {ticket:'abcdefghijklmnopqrstuvwxyz',targetId:input.id,
        descendantCount:input.descendantCount,expiresAt:Date.now()+10000}},
    removeTree:async input=>{calls.push(['removeTree',input]);return {removed:true}},
    observe:{
      start:async input=>{calls.push(['observe.start',input]);return {
        sessionRef:'abcdefghijklmnopqrstuvwxyz',cursor:'0',expiresAt:Date.now()+30000}},
      read:async input=>{calls.push(['observe.read',input]);return {
        events:[],nextCursor:'1',expiresAt:Date.now()+30000,gapCount:0,droppedCount:0}},
      stop:async input=>{calls.push(['observe.stop',input]);return {stopped:true}}
    }
  };
  return {calls,sdk:{capabilities:{list,getStatus:async()=>({
    callableNow:true,requiredCapabilities:['browser.bookmarks.full']})},bookmarks}};
}
const sample=()=>[{id:'0',title:'root',children:[
  {id:'1',title:'书签栏',parentId:'0',children:[
    {id:'2',title:'folder',parentId:'1',children:[
      {id:'3',parentId:'2',title:'leaf',url:'https://example.com/'}
    ]},
    {id:'4',parentId:'1',title:'other',url:'https://example.org/'}
  ]}
]}];

test('R2.1 loads 550 paged native nodes without dropping children or truncating search',async()=>{
  const ctx=await sandbox(),children=Array.from({length:550},(_,i)=>({
    id:String(i+10),parentId:'1',index:i,title:'Needle '+i,url:'https://example.org/'+i
  }));
  const flat=[{id:'0',title:'root'},{id:'1',title:'书签栏',parentId:'0'},...children];
  const data=fullSdk(ctx,{read:({cursor})=>{
    const start=cursor?Number(cursor):0;
    return {nodes:flat.slice(start,start+80),snapshotRef:'abcdefghijklmnopqrstuvwxyz',
      nextCursor:start+80<flat.length?String(start+80):null};
  }});
  const tree=await ctx.BookmarkR2Service.create(data.sdk).load();
  assert.equal(tree.byId.size,552);
  assert.equal(ctx.BookmarkR2Model.projectBookmarkRows(tree,{search:'Needle',limit:200}).total,550);
  assert.equal(tree.snapshotRef,'abcdefghijklmnopqrstuvwxyz');
});

test('R2.1 rejects broken pagination cursors, snapshot substitution and orphan nodes',async()=>{
  const ctx=await sandbox(),root={id:'0',title:'root'};
  const kinds=[
    ()=>( {nodes:[root],snapshotRef:'abcdefghijklmnop',nextCursor:'same'} ),
    ({cursor})=>cursor?{nodes:[{id:'1',title:'bar',parentId:'0'}],
      snapshotRef:'DIFFERENT-SNAPSHOT',nextCursor:null}:
      {nodes:[root],snapshotRef:'abcdefghijklmnop',nextCursor:'next'},
    ()=>( {nodes:[{id:'1',title:'orphan',parentId:'missing'}],
      snapshotRef:'abcdefghijklmnop',nextCursor:null} )
  ];
  for(const read of kinds){
    const data=fullSdk(ctx,{read});
    await assert.rejects(ctx.BookmarkR2Service.create(data.sdk).load());
  }
});

test('R2.1 sends single-object SDK CRUD with exact expected-node preconditions',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()});
  const service=ctx.BookmarkR2Service.create(data.sdk),tree=await service.load();
  await service.createFolder({title:'new',parentId:'1'});
  await service.createBookmark({title:'new',url:'https://example.net/',parentId:'1'});
  await service.update({expected:tree.byId.get('4'),title:'renamed',url:'https://example.org/'});
  await service.move({expected:tree.byId.get('4'),parentId:'2'});
  await service.remove({expected:tree.byId.get('4'),confirmed:true});
  const selected=data.calls.filter(x=>['create','update','move','remove'].includes(x[0]));
  assert.deepEqual(selected.map(x=>x[0]),['create','create','update','move','remove']);
  assert.ok(selected.every(x=>x.length===2));
  assert.equal(selected[0][1].url,undefined);
  assert.equal(selected[1][1].url,'https://example.net/');
  assert.equal(selected[2][1].expected.id,'4');
  assert.equal(selected[3][1].destination.parentId,'2');
  assert.equal(selected[4][1].expected.title,'other');
});

test('R2.1 nonempty folder deletion needs Host snapshot and a validated one-use ticket',async()=>{
  const ctx=await sandbox(),roots=sample(),data=fullSdk(ctx,{roots});
  const service=ctx.BookmarkR2Service.create(data.sdk);
  const tree=await service.load(),expected=tree.byId.get('2'),
    signatures=ctx.BookmarkR2Model.descendantSignatures(tree,'2');
  await assert.rejects(service.remove({expected,confirmed:true,
    expectedDescendantSignatures:signatures}),/Host 书签快照/);
  assert.equal(data.calls.filter(x=>x[0]==='removeTree').length,0);
  const flat=[
    {id:'0',title:'root'},{id:'1',title:'书签栏',parentId:'0'},
    {id:'2',title:'folder',parentId:'1'},{id:'3',title:'leaf',parentId:'2',url:'https://example.com/'}
  ];
  const paged=fullSdk(ctx,{read:()=>({
    nodes:flat,snapshotRef:'abcdefghijklmnopqrstuvwxyz',nextCursor:null
  })});
  const live=ctx.BookmarkR2Service.create(paged.sdk),ready=await live.load();
  await live.remove({expected:ready.byId.get('2'),confirmed:true,
    expectedDescendantSignatures:ctx.BookmarkR2Model.descendantSignatures(ready,'2')});
  assert.deepEqual(paged.calls.filter(x=>x[0].includes('RemoveTree')).map(x=>x[0]),
    ['prepareRemoveTree']);
  assert.equal(paged.calls.filter(x=>x[0]==='removeTree').length,1);
  const rejected=fullSdk(ctx,{read:()=>({
    nodes:flat,snapshotRef:'abcdefghijklmnopqrstuvwxyz',nextCursor:null
  }),prepared:()=>({ticket:'abcdefghijklmnopqrstuvwxyz',targetId:'wrong',
    descendantCount:1,expiresAt:Date.now()+10000})});
  const refusing=ctx.BookmarkR2Service.create(rejected.sdk),t=await refusing.load();
  await assert.rejects(refusing.remove({expected:t.byId.get('2'),confirmed:true,
    expectedDescendantSignatures:ctx.BookmarkR2Model.descendantSignatures(t,'2')}),/删除票据/);
  assert.equal(rejected.calls.filter(x=>x[0]==='removeTree').length,0);
});

test('R2.1 current-page bookmark requires an opaque document and tab binding',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()});
  const service=ctx.BookmarkR2Service.create(data.sdk);
  await assert.rejects(service.createBookmark({title:'page',url:'https://example.org/',parentId:'1',
    sourcePage:{url:'https://example.org/'}}),/Tab\/Document 绑定/);
  assert.equal(data.calls.filter(x=>x[0]==='create').length,0);
  await service.createBookmark({title:'page',url:'https://example.org/',parentId:'1',
    sourcePage:{url:'https://example.org/',tabRef:'abcdefghijklmnop',
      documentRef:'abcdefghijklmnop'}});
  assert.equal(data.calls.find(x=>x[0]==='create')[1].sourcePage.documentRef,
    'abcdefghijklmnop');
});

test('R2.2 revoked Full capability fails closed before native write or event read',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()}),ops=ctx.BookmarkR2Service.METHODS;
  data.sdk.capabilities.list=async()=>Array.from(ops,operation=>({
    operation:'browser.bookmarks.'+operation,
    requiredCapabilities:['browser.bookmarks.full'],
    status:{callableNow:false,reasonCode:'E_CHROME_PERMISSION_REQUIRED'}
  }));
  const service=ctx.BookmarkR2Service.create(data.sdk),status=await service.probe();
  assert.equal(status.ready,false);
  assert.equal(status.code,'E_BOOKMARK_PERMISSION');
  await assert.rejects(service.load(),{code:'E_BOOKMARK_PERMISSION'});
  await assert.rejects(service.createFolder({title:'Blocked',parentId:'1'}),
    {code:'E_BOOKMARK_PERMISSION'});
  await assert.rejects(service.watchRead({sessionRef:'abcdefghijklmnop',cursor:'0'}),
    {code:'E_BOOKMARK_PERMISSION'});
  assert.equal(data.calls.filter(([op])=>['getTree','create','observe.read'].includes(op)).length,0);
});

test('R2.1 event observation is bounded and uses only the public Full SDK',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()}),
    service=ctx.BookmarkR2Service.create(data.sdk);
  const watch=await service.watchStart();
  const next=await service.watchRead(watch);
  assert.equal(next.nextCursor,'1');
  await service.watchStop(watch);
  assert.deepEqual(data.calls.filter(x=>x[0].startsWith('observe.')).map(x=>x[0]),
    ['observe.start','observe.read','observe.stop']);
  data.sdk.bookmarks.observe.read=async()=>({
    events:[],nextCursor:'2',expiresAt:Date.now()+10000,droppedCount:1});
  await assert.rejects(service.watchRead(watch),{code:'E_BOOKMARK_EVENT_GAP'});
});


test('R2.1 UI guards current-page identity and observes SDK events with teardown',async()=>{
  const ui=await src('src/main.js');
  assert.match(ui,/E_DOCUMENT_BINDING_REQUIRED/);
  assert.match(ui,/sourcePage:\{url,tabRef:first\.tabRef,documentRef:first\.documentRef\}/);
  assert.doesNotMatch(ui,/current\?\.documentId!==first\.documentId/);
  assert.match(ui,/service\.watchStart\(\)/);
  assert.match(ui,/service\.watchRead\(s\.watcher\)/);
  assert.match(ui,/E_BOOKMARK_EVENT_GAP/);
  assert.match(ui,/rememberDraft\(\);endWatch\(\)/);
  assert.match(ui,/addEventListener\?\.\('pagehide',endWatch/);
});
