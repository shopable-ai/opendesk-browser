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

test('R2.4 official optional registration replaces all legacy host/UI/CI paths',async()=>{
  const catalog=JSON.parse(await readFile('official-tools/catalog.json','utf8'));
  const release=catalog.tools.filter(row=>row.id==='bookmark-manager');
  assert.equal(release.length,1);
  assert.equal(release[0].installationPolicy,'optional');
  assert.equal(release[0].project,'examples/sidebar-tools/bookmark-manager');
  for(const old of ['src/bookmark-manager/model.js','src/bookmark-manager/service.js',
    'src/bookmark-manager/trusted-ui.js','src/ui/bookmark-manager.css',
    '.github/workflows/bookmark-manager-r13.yml',
    'tests/environment/bookmark-manager-r1.test.mjs'])
    await assert.rejects(readFile(old,'utf8'),{code:'ENOENT'},old+' must be removed');
  const html=await readFile('src/ui/tool.html','utf8');
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  const packer=await readFile('scripts/prepare-public.mjs','utf8');
  const verifier=await readFile('scripts/verify-package.mjs','utf8');
  for(const source of [html,host,packer,verifier])
    assert.doesNotMatch(source,/bookmark-manager\.css|bookmark-manager-(?:open|panel)|src\/bookmark-manager\//);
  assert.doesNotMatch(host,/createBookmarkManager|openBookmarks/);
});

test('R11.2 builds with v2 packer and independently declares Full Bookmark permission',async()=>{
  const pkg=await createSidebarToolPackage(root);
  assert.equal(pkg.id,'bookmark-manager');
  assert.equal(pkg.version,'0.3.8');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(pkg.capabilities,['browser.bookmarks.full','currentPage.read']);
  assert.equal(pkg.scripts.length,2);
  assert.ok(pkg.js.includes('OpenDeskSDK'));
  // Production UI must never inherit offline preview lab controls or Mock IPC.
  assert.doesNotMatch(pkg.html,/od-preview-bookmark-lab|data-bookmark-diagnostic|预览测试辅助工具/);
  assert.doesNotMatch(pkg.js,/__opendeskBookmarkMockDiagnostic|opendesk\.preview\.bookmark\.command/);
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
      {operation:'browser.bookmarks.createOwned',requiredCapabilities:['browser.bookmarks'],status:{callableNow:true}},
      {operation:'browser.bookmarks.removeOwned',requiredCapabilities:['browser.bookmarks'],status:{callableNow:true}}
    ],getStatus:async()=>({callableNow:true})},
    bookmarks:{createOwned:async()=>{ownedCalls++},removeOwned:async()=>{ownedCalls++}}
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
  const now=()=>ctx.Date?.now()??Date.now();
  const methods=ctx.BookmarkR2Service.METHODS;
  const list=async()=>{calls.push(['capabilities.list']);return Array.from(methods,operation=>({
    operation:'browser.bookmarks.'+operation,
    requiredCapabilities:['browser.bookmarks.full'],status:{callableNow:true}
  }))};
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
        sessionRef:'abcdefghijklmnopqrstuvwxyz',cursor:'0',expiresAt:now()+30000}},
      read:async input=>{calls.push(['observe.read',input]);return {
        events:[],nextCursor:'1',expiresAt:now()+30000,gapCount:0,droppedCount:0}},
      stop:async input=>{calls.push(['observe.stop',input]);return {stopped:true}}
    }
  };
  return {calls,sdk:{capabilities:{list,getStatus:async input=>{
    calls.push(['capabilities.getStatus',input]);
    return {callableNow:true,requiredCapabilities:['browser.bookmarks.full']};
  }},bookmarks}};
}
const sample=()=>[{id:'0',title:'root',children:[
  {id:'1',title:'书签栏',parentId:'0',children:[
    {id:'2',title:'folder',parentId:'1',children:[
      {id:'3',parentId:'2',title:'leaf',url:'https://example.com/'}
    ]},
    {id:'4',parentId:'1',title:'other',url:'https://example.org/'}
  ]}
]}];

test('R2.4 allows authorized tree reads while separate write/observer operations remain click-gated',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()});
  const original=data.sdk.capabilities.list;
  data.sdk.capabilities.list=async()=>(await original()).map(row=>({
    ...row,status:{callableNow:['getTree','get','search'].some(name=>
      row.operation==='browser.bookmarks.'+name),
      reasonCode:'E_USER_GESTURE_REQUIRED'}
  }));
  const service=ctx.BookmarkR2Service.create(data.sdk);
  const result=await service.probe();
  assert.equal(result.ready,true);
  assert.ok(result.unapproved.length>0);
  assert.equal((await service.load()).byId.size>1,true);
});

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

test('R2.2 revoked Full capability blocks tree/write preflight and SDK event reads fail closed',async()=>{
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
  data.sdk.bookmarks.observe.read=async input=>{
    data.calls.push(['observe.read',input]);
    throw Object.assign(new Error('Host denied revoked Full authority'),{code:'E_BOOKMARK_PERMISSION'});
  };
  await assert.rejects(service.watchRead({sessionRef:'abcdefghijklmnop',cursor:'0'}),
    {code:'E_BOOKMARK_PERMISSION'});
  assert.equal(data.calls.filter(([op])=>['getTree','create'].includes(op)).length,0);
  assert.equal(data.calls.filter(([op])=>op==='observe.read').length,1);
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
    events:[],nextCursor:'2',expiresAt:Date.now()+10000,gapCount:0,droppedCount:1});
  await assert.rejects(service.watchRead(watch),{code:'E_BOOKMARK_EVENT_GAP'});
});


test('R2.3 unavailable capability/status transports fail closed regardless of error code',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()});
  const service=ctx.BookmarkR2Service.create(data.sdk);
  const originalList=data.sdk.capabilities.list;
  data.sdk.capabilities.list=async()=>{
    throw Object.assign(new Error('transport'),{code:'E_HOST_TIMEOUT'});
  };
  const probe=await service.probe();
  assert.equal(probe.ready,false);
  assert.equal(probe.code,'E_SDK_STATUS');
  await assert.rejects(service.load(),{code:'E_SDK_STATUS'});
  data.sdk.capabilities.list=originalList;
  data.sdk.capabilities.getStatus=async()=>{
    throw Object.assign(new Error('transport'),{code:'E_HOST_TIMEOUT'});
  };
  await assert.rejects(service.load(),{code:'E_SDK_STATUS'});
  assert.equal(data.calls.filter(([op])=>op==='getTree').length,0);
});

test('R2.5 event polling uses one SDK RPC and preserves Host authorization failures',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()}),
    service=ctx.BookmarkR2Service.create(data.sdk);
  data.sdk.capabilities.list=async()=>{throw Error('discovery is not an event-read preflight')};
  data.sdk.capabilities.getStatus=async()=>{throw Error('status is not an event-read preflight')};
  const session={sessionRef:'abcdefghijklmnop',cursor:'0'};
  await service.watchRead(session);
  assert.deepEqual(data.calls.map(([op])=>op),['observe.read']);
  data.sdk.bookmarks.observe.read=async()=>{throw failure('E_GRANT_REVOKED')};
  await assert.rejects(service.watchRead(session),{code:'E_GRANT_REVOKED'});
});

test('R2.5 pagination checks Full authority at both ends and propagates mid-page Host revocation',async()=>{
  const ctx=await sandbox(),flat=[{id:'0',title:'root'},{id:'1',parentId:'0',title:'bar'}];
  const data=fullSdk(ctx,{read:({cursor})=>({nodes:[flat[cursor?1:0]],
    snapshotRef:'abcdefghijklmnop',nextCursor:cursor?null:'next'})});
  const service=ctx.BookmarkR2Service.create(data.sdk);
  await service.load();
  assert.deepEqual(data.calls.map(([op])=>op),[
    'capabilities.list','capabilities.getStatus','getTree','getTree',
    'capabilities.list','capabilities.getStatus'
  ]);
  data.sdk.bookmarks.getTree=async({cursor})=>{
    if(cursor)throw failure('E_GRANT_REVOKED');
    return {nodes:[flat[0]],snapshotRef:'abcdefghijklmnop',nextCursor:'next'};
  };
  await assert.rejects(service.load(),{code:'E_GRANT_REVOKED'});
  const list=data.sdk.capabilities.list;
  let probes=0;
  data.sdk.capabilities.list=async()=>{
    if(++probes===2)throw failure('E_HOST_TIMEOUT');return list();
  };
  data.sdk.bookmarks.getTree=async()=>({nodes:flat,snapshotRef:'abcdefghijklmnop',nextCursor:null});
  await assert.rejects(service.load(),{code:'E_SDK_STATUS'},'final preflight is still mandatory');
});

test('R2.3 rejects missing, negative or malformed event gap counters',async()=>{
  const ctx=await sandbox(),data=fullSdk(ctx,{roots:sample()}),
    service=ctx.BookmarkR2Service.create(data.sdk);
  const session={sessionRef:'abcdefghijklmnop',cursor:'0'};
  for(const bad of [
    {droppedCount:0},
    {gapCount:0},
    {gapCount:-1,droppedCount:0},
    {gapCount:0,droppedCount:'0'},
    {gapCount:0,droppedCount:0.5}
  ]){
    data.sdk.bookmarks.observe.read=async()=>({events:[],nextCursor:'0',
      expiresAt:Date.now()+10000,...bad});
    await assert.rejects(service.watchRead(session),{code:'E_BOOKMARK_EVENT'});
  }
});

test('R2.3 revoked UI gate rejects a late tree load and unlocks pending writes',async()=>{
  const ui=await src('src/main.js');
  const marker='void refresh();'+String.fromCharCode(10)+'})();'+String.fromCharCode(10);
  assert.ok(ui.endsWith(marker));
  const dom=new Map();
  const element=()=>({dataset:{},style:{},value:'',hidden:false,disabled:false,
    textContent:'',addEventListener(){},setAttribute(){},replaceChildren(){},
    append(){},focus(){}});
  const rootNode={querySelector(selector){
    if(!dom.has(selector))dom.set(selector,element());
    return dom.get(selector);
  },querySelectorAll(){return []},addEventListener(){}};
  let startLoad,finishLoad;
  const started=new Promise(resolve=>{startLoad=resolve});
  const delayed=new Promise(resolve=>{finishLoad=resolve});
  const service={probe:async()=>({ready:true}),load:()=>{startLoad();return delayed},
    watchStop:async()=>{},watchStart:async()=>{throw new Error('not needed')}};
  const ctx=createContext({URL,OpenDeskTool:{root:rootNode},
    OpenDeskSDK:{browser:{}},BookmarkR2Service:{create:()=>service},
    BookmarkR2Model:{isFolder:()=>false,
      projectBookmarkRows:()=>({rows:[],total:0})},
    document:{createDocumentFragment:element,createElement:element},
    setTimeout,clearTimeout});
  const instrumented=ui.slice(0,-marker.length)+
    'globalThis.__r2Test={gate,mutation,state:s};'+String.fromCharCode(10)+marker;
  runInContext(instrumented,ctx);
  await started;
  ctx.__r2Test.gate('授权已失效');
  const tree={byId:new Map(),children:new Map(),roots:new Set()};
  finishLoad(tree);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.__r2Test.state.tree,null);
  assert.equal(rootNode.querySelector('#bm-gate').hidden,false);
  assert.equal(rootNode.querySelector('#bm-workspace').hidden,true);
  assert.equal(rootNode.querySelector('#bm-refresh').disabled,false);

  ctx.__r2Test.state.tree=tree;
  let complete;
  const pending=new Promise(resolve=>{complete=resolve});
  const writing=ctx.__r2Test.mutation(()=>pending);
  assert.equal(ctx.__r2Test.state.busy,true);
  ctx.__r2Test.gate('授权已失效');
  complete();await writing;
  assert.equal(ctx.__r2Test.state.busy,false);
  for(const code of ['E_BOOKMARK_FULL_CONSENT_REQUIRED','E_TOOL_CHANGED','E_OWNER']){
    ctx.__r2Test.state.tree=tree;
    await ctx.__r2Test.mutation(async()=>{
      throw Object.assign(new Error('Authority revoked'),{code});
    });
    assert.equal(ctx.__r2Test.state.tree,null,'lost Full authority must hide tree: '+code);
    assert.equal(rootNode.querySelector('#bm-gate').hidden,false);
    assert.equal(rootNode.querySelector('#bm-workspace').hidden,true);
    assert.equal(ctx.__r2Test.state.busy,false);
  }
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

// Run the actual UI, model and service against the public SDK boundary. Timers
// advance explicitly so recovery/teardown assertions cannot pass by timing luck.
async function bookmarkUi(configure=()=>{},Clock=Date){
  const dom=new Map(),timers=new Map(),lifecycle=new Map();let timerId=0;
  const element=tag=>({tag,children:[],listeners:new Map(),dataset:{},style:{},
    classList:{add(){},contains(){return false}},
    value:'',hidden:false,disabled:false,textContent:'',attributes:{},
    // HTML URL constraints run before submit; an ancestor's hidden attribute
    // does not bar validation. Model that gate separately from event dispatch.
    get willValidate(){return this.tag==='input'&&!this.disabled&&!this.readOnly&&this.type!=='hidden'},
    checkValidity(){
      if(!this.willValidate)return true;
      if(!this.value)return !this.required;
      if(this.type==='url'){try{new URL(this.value)}catch{return false}}
      return true;
    },
    addEventListener(type,handler){this.listeners.set(type,handler)},
    setAttribute(name,value){this.attributes[name]=value},
    getAttribute(name){return this.attributes[name]},focus(){},
    append(...children){this.children.push(...children.flatMap(child=>
      child.tag==='fragment'?child.children:[child]))},
    replaceChildren(...children){this.children=[];this.append(...children)},
    fire(type,event={}){return this.listeners.get(type)?.({preventDefault(){},target:this,...event})}
  });
  for(const [,tag,attrs,id] of (await src('src/index.html')).matchAll(
    /<(button|input|select|form)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const el=element(tag);el.type=/\btype="([^"]+)"/.exec(attrs)?.[1]||'text';
    el.required=/\brequired\b/.test(attrs);dom.set('#'+id,el);
  }
  const descendants=el=>el.children.flatMap(child=>[child,...descendants(child)]);
  const rootNode={querySelector(selector){
    if(!dom.has(selector))dom.set(selector,element('div'));
    return dom.get(selector);
  },querySelectorAll(tag){return [...dom.values()].flatMap(el=>[el,...descendants(el)])
    .filter(el=>el.tag===tag)},addEventListener(){}};
  const ctx=createContext({URL,Date:Clock,document:{createElement:element,
    createElementNS:(namespace,tag)=>{
      assert.equal(namespace,'http://www.w3.org/2000/svg');
      return element(tag);
    },
    createDocumentFragment:()=>element('fragment')},OpenDeskTool:{root:rootNode},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},
    clearTimeout(id){timers.delete(id)},
    addEventListener(type,handler){lifecycle.set(type,handler)}});
  for(const file of sources.slice(0,2))runInContext(await src(file),ctx);
  const data=fullSdk(ctx,{roots:sample()});configure(data);
  ctx.OpenDeskSDK={browser:data.sdk};
  runInContext(await src('src/main.js'),ctx);
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  await settle();
  const get=id=>rootNode.querySelector('#'+id);
  const text=el=>el.textContent+el.children.map(text).join('');
  return {data,get,timers,settle,text,
    async click(id){get(id).fire('click');await settle()},
    async action(label){
      const button=rootNode.querySelectorAll('button').find(el=>
        el.getAttribute('aria-label')===label||el.textContent===label);
      assert.ok(button,label);button.fire('click');await settle();
    },
    async submit(){
      if(![...dom.values()].every(el=>el.checkValidity()))return false;
      get('bm-form').fire('submit');await settle();return true;
    },
    async tick(){
      assert.equal(timers.size,1,'one polling/recovery timer must own the epoch');
      const [id,{fn}]=timers.entries().next().value;timers.delete(id);fn();await settle();
    },close(){lifecycle.get('pagehide')?.()}};
}
const failure=code=>Object.assign(new Error(code),{code});

test('R2.5 hidden URL never blocks new-folder submission',async()=>{
  const ui=await bookmarkUi();await ui.click('bm-new-folder');
  ui.get('bm-name').value='Native folder';ui.get('bm-parent').value='1';
  assert.equal(ui.get('bm-url-row').hidden,true);
  assert.equal(await ui.submit(),true,'HTML constraints must permit the folder submit');
  const writes=ui.data.calls.filter(([op])=>op==='create');
  assert.equal(writes.length,1);assert.equal(writes[0][1].title,'Native folder');
  assert.equal(writes[0][1].url,undefined);ui.close();
});

test('R2.5 folder edit and moves exclude hidden URL constraints',async()=>{
  for(const [title,action,operation] of [
    ['folder','编辑','update'],['folder','移动','move'],['other','移动','move']
  ]){
    const ui=await bookmarkUi();await ui.action('管理 '+title);await ui.action(action);
    assert.equal(ui.get('bm-url-row').hidden,true);
    ui.get('bm-url').value='https://';ui.get('bm-name').value='Updated folder';
    ui.get('bm-parent').value='1';
    assert.equal(await ui.submit(),true,title+' '+action);
    assert.equal(ui.data.calls.filter(([op])=>op===operation).length,1);
    ui.close();
  }
});

test('R2.5 busy reset preserves hidden URL exclusion and visible URL validation',async()=>{
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.create=async()=>{throw failure('E_SCHEMA')};
  });
  await ui.click('bm-new-folder');ui.get('bm-name').value='Retry folder';
  ui.get('bm-parent').value='1';ui.get('bm-url').value='https://';
  assert.equal(await ui.submit(),true);
  assert.equal(ui.get('bm-save').disabled,false,'failed write has left busy state');
  assert.equal(ui.get('bm-url').disabled,true,'busy(false) must not enable hidden URL');
  assert.equal(ui.get('bm-url').checkValidity(),true);
  await ui.click('bm-cancel');await ui.click('bm-new-bookmark');
  ui.get('bm-name').value='Bookmark';ui.get('bm-parent').value='1';
  assert.equal(ui.get('bm-url-row').hidden,false);
  assert.equal(ui.get('bm-url').disabled,false);
  assert.equal(ui.get('bm-url').type,'url');
  assert.equal(await ui.submit(),false,'visible https:// still fails URL constraints');
  assert.equal(ui.get('bm-notice').textContent,'','invalid URL never reached submit handler');
  ui.get('bm-url').value='https://example.net/';
  assert.equal(await ui.submit(),true);
  assert.match(ui.get('bm-notice').textContent,/E_SCHEMA/);
  await ui.click('bm-cancel');await ui.action('管理 other');await ui.action('编辑');
  assert.equal(ui.get('bm-url-row').hidden,false);
  assert.equal(ui.get('bm-url').disabled,false);
  ui.get('bm-url').value='https://';
  assert.equal(await ui.submit(),false,'editing a bookmark retains native URL constraints');
  ui.close();
});

test('R2.5 2159-node tree plus one quiet minute stays within 120 total SDK RPCs',async t=>{
  let now=Date.now(),rpcs=0,treeReads=0,started=0;
  const firstTime=now,sessions=new Map(),limits=[],visited=new Set();
  class Clock extends Date {static now(){return now}}
  const flat=[{id:'0',title:'root'},{id:'1',parentId:'0',title:'bar'},
    {id:'2',parentId:'1',title:'Native test'},{id:'7',parentId:'0',title:'other'}];
  let index=0;
  for(const [group,count] of [100,500,550,1001].entries()){
    const parentId=String(group+3);flat.push({id:parentId,parentId:'2',title:'Group '+count});
    for(let n=0;n<count;n++,index++)flat.push({id:String(index+100),parentId,
      title:'URL '+index+' 原生预算验证'.repeat(3),
      url:'https://example.org/native-budget/'+index+'?source=100-500-550-1001'});
  }
  assert.equal(flat.length,2159);
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.getTree=async({cursor,limit})=>{
      treeReads++;limits.push(limit);
      const offset=Number(cursor||0),nodes=[];
      for(let i=offset;i<flat.length&&nodes.length<Math.min(limit,100);i++){
        const candidate={nodes:[...nodes,flat[i]],snapshotRef:'abcdefghijklmnop',
          nextCursor:i+1<flat.length?String(i+1):null};
        if(Buffer.byteLength(JSON.stringify(candidate))>10500)break;
        nodes.push(flat[i]);visited.add(flat[i].id);
      }
      assert.ok(nodes.length);
      return {nodes,snapshotRef:'abcdefghijklmnop',
        nextCursor:offset+nodes.length<flat.length?String(offset+nodes.length):null};
    };
    sdk.bookmarks.observe.start=async()=>{
      const row={sessionRef:'budget-session-'+String(++started).padStart(4,'0'),
        cursor:'0',expiresAt:now+30000};sessions.set(row.sessionRef,row);return row;
    };
    sdk.bookmarks.observe.read=async({sessionRef})=>{
      const row=sessions.get(sessionRef);
      if(!row||row.expiresAt<=now)throw failure('E_SESSION_EXPIRED');
      return {events:[],nextCursor:'0',expiresAt:row.expiresAt,gapCount:0,droppedCount:0};
    };
    sdk.bookmarks.observe.stop=async({sessionRef})=>{sessions.delete(sessionRef);return {stopped:true}};
    for(const api of [sdk.capabilities,sdk.bookmarks,sdk.bookmarks.observe]){
      for(const [name,fn] of Object.entries(api))if(typeof fn==='function')api[name]=async input=>{
        if(++rpcs>120)throw failure('E_TOOL');return fn(input);
      };
    }
  },Clock);
  assert.equal(ui.get('bm-workspace').hidden,false,'first full tree must fit the unchanged Host quota');
  assert.equal(visited.size,2159);
  assert.ok(limits.every(limit=>limit===100));
  assert.ok(treeReads>22,'the byte ceiling, not just the node ceiling, determines page count');
  const initialReads=treeReads;
  for(let ticks=0;ticks<100;ticks++){
    assert.equal(ui.timers.size,1);
    const {delay}=[...ui.timers.values()][0];
    if(now-firstTime+delay>=60000)break;
    now+=delay;await ui.tick();
  }
  assert.ok(started>=3,'the minute must include two session rotations');
  assert.equal(treeReads,initialReads,'quiet rotations must not reload the 2159-node tree');
  ui.get('bm-search').value='URL 2150';ui.get('bm-search').fire('input');
  assert.match(ui.text(ui.get('bm-list')),/URL 2150/,'the final URL remains searchable');
  ui.close();await ui.settle();
  assert.ok(rpcs<=120,'all capability, snapshot, observer and cleanup RPCs count');
  t.diagnostic(treeReads+' snapshot pages; '+rpcs+' total RPCs including two quiet rotations');
});

test('R2.5 watch-start transport failure schedules recovery before a fresh snapshot',async()=>{
  let attempts=0;
  const ui=await bookmarkUi(({sdk})=>{
    const start=sdk.bookmarks.observe.start;
    sdk.bookmarks.observe.start=async args=>{
      if(!attempts++)throw failure('E_HOST_TIMEOUT');
      return start(args);
    };
  });
  assert.equal(ui.get('bm-workspace').hidden,false);
  assert.equal(ui.timers.size,1,'transient start failure must arrange recovery');
  assert.equal([...ui.timers.values()][0].delay,7000);
  await ui.tick();
  assert.equal(attempts,2);
  assert.equal(ui.data.calls.filter(([op])=>op==='getTree').length,2);
  assert.equal([...ui.timers.values()][0].delay,0,'reconcile the new snapshot immediately');
  ui.close();
});

test('R2.5 repeated transport failure stops after three automatic retries; click can retry',async()=>{
  let attempts=0;
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.observe.start=async()=>{attempts++;throw failure('E_HOST_TIMEOUT')};
  });
  for(let i=0;i<3;i++)await ui.tick();
  assert.equal(attempts,4);
  assert.equal(ui.timers.size,0);
  assert.match(ui.get('bm-notice').textContent,/手动刷新/);
  await ui.click('bm-refresh');
  assert.equal(attempts,5);assert.equal(ui.timers.size,1);
  ui.close();assert.equal(ui.timers.size,0);
});

test('R2.5 a real-click denial is never retried by timers',async()=>{
  let attempts=0;
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.observe.start=async()=>{attempts++;throw failure('E_USER_GESTURE_REQUIRED')};
  });
  assert.equal(attempts,1);assert.equal(ui.timers.size,0);
  assert.match(ui.get('bm-notice').textContent,/手动刷新/);
  await ui.click('bm-refresh');assert.equal(attempts,2);
  ui.close();
});

test('R2.5 recovery budget spans restarted sessions until a successful event read',async()=>{
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.observe.read=async()=>{throw failure('E_HOST_TIMEOUT')};
  });
  await ui.tick();
  for(let i=0;i<3;i++){await ui.tick();await ui.tick()}
  assert.equal(ui.data.calls.filter(([op])=>op==='observe.start').length,4);
  assert.equal(ui.timers.size,0,'restarting observation must not replenish the retry budget');
  await ui.click('bm-refresh');await ui.tick();
  assert.equal(ui.timers.size,1,'manual refresh replenishes the retry budget');
  ui.close();
});

test('R2.5 manual refresh and pagehide fence already-queued recovery callbacks',async()=>{
  let attempts=0;
  const ui=await bookmarkUi(({sdk})=>{
    const start=sdk.bookmarks.observe.start;
    sdk.bookmarks.observe.start=async args=>{
      if(!attempts++)throw failure('E_HOST_TIMEOUT');return start(args);
    };
  });
  assert.equal(ui.timers.size,1);
  const stale=[...ui.timers.values()][0].fn;
  await ui.click('bm-refresh');
  assert.equal(attempts,2);assert.equal(ui.timers.size,1);
  stale();await ui.settle();
  assert.equal(attempts,2,'old recovery must not start a replacement session');
  assert.equal(ui.timers.size,1);
  ui.close();assert.equal(ui.timers.size,0,'stale callback must not erase the active timer handle');
  stale();await ui.settle();
  assert.equal(attempts,2);assert.equal(ui.timers.size,0);
});

test('R2.5 pagehide cancels pending probe, observation and snapshot continuations',async()=>{
  for(const stage of ['probe','start','snapshot']){
    let finish,entered=false;
    const pending=new Promise(resolve=>{finish=resolve});
    const ui=await bookmarkUi(({sdk})=>{
      const target=stage==='probe'?sdk.capabilities:
        stage==='start'?sdk.bookmarks.observe:sdk.bookmarks;
      const method=stage==='probe'?'list':stage==='start'?'start':'getTree';
      const original=target[method];
      target[method]=async args=>{
        if(!entered){entered=true;await pending}
        return original(args);
      };
    });
    assert.equal(entered,true,stage);
    ui.close();finish();await ui.settle();
    assert.equal(ui.timers.size,0,stage+' must not resume polling after pagehide');
    assert.equal(ui.text(ui.get('bm-list')),'',stage+' must not render late private data');
    assert.equal(ui.data.calls.filter(([op])=>op==='getTree').length,
      stage==='snapshot'?1:0,stage);
    if(stage==='start')assert.equal(ui.data.calls.filter(([op])=>op==='observe.stop').length,1);
  }
});

test('R2.5 observer permission failures clear authority and never schedule recovery',async()=>{
  for(const stage of ['start','read']){
    const ui=await bookmarkUi(({sdk})=>{
      sdk.bookmarks.observe[stage]=async()=>{throw failure('E_CHROME_PERMISSION_REQUIRED')};
    });
    if(stage==='read')await ui.tick();
    assert.equal(ui.get('bm-workspace').hidden,true,stage);
    assert.equal(ui.get('bm-gate').hidden,false,stage);
    assert.equal(ui.timers.size,0,stage);
    ui.close();
  }
});

test('R2.5 revoke while polling clears rendered private data and cancels recovery',async()=>{
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.observe.read=async()=>{throw failure('E_GRANT_REVOKED')};
  });
  assert.match(ui.text(ui.get('bm-list')),/other/);
  await ui.click('bm-new-bookmark');
  ui.get('bm-name').value='Private draft';ui.get('bm-url').value='https://private.example/';
  ui.get('bm-detail-url').textContent='https://private.example/';
  ui.get('bm-delete-desc').textContent='Private folder';
  await ui.tick();
  assert.equal(ui.get('bm-workspace').hidden,true);
  assert.equal(ui.get('bm-gate').hidden,false);
  assert.equal(ui.text(ui.get('bm-list')),'');
  for(const id of ['bm-name','bm-url','bm-parent','bm-search'])assert.equal(ui.get(id).value,'',id);
  for(const id of ['bm-detail-url','bm-delete-desc','bm-counter'])assert.equal(ui.get(id).textContent,'',id);
  assert.equal(ui.get('bm-parent').children.length,0);
  assert.equal(ui.timers.size,0);
});

test('R2.5 unknown mutation outcome is not replayed by observation recovery',async()=>{
  let writes=0,reads=0;
  const ui=await bookmarkUi(({sdk})=>{
    const read=sdk.bookmarks.observe.read;
    sdk.bookmarks.observe.read=async args=>{
      if(!reads++)throw failure('E_HOST_TIMEOUT');return read(args);
    };
    sdk.bookmarks.create=async()=>{writes++;throw failure('E_OUTCOME_UNKNOWN')};
  });
  await ui.click('bm-new-folder');ui.get('bm-name').value='Uncertain';
  ui.get('bm-parent').value='1';ui.get('bm-form').fire('submit');await ui.settle();
  assert.equal(writes,1);assert.match(ui.get('bm-notice').textContent,/写入结果未知/);
  await ui.tick();await ui.tick();
  assert.equal(writes,1,'recovery only reads and observes; it must not resubmit the form');
  assert.equal(ui.get('bm-name').value,'Uncertain');
  ui.close();
});


test('R2.5 delete confirmation binds the originally reviewed descendants across external refresh',async()=>{
  let changed=false;
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.getTree=async()=>{
      const tree=sample();
      if(changed)tree[0].children[0].children[0].children[0].title='externally changed';
      return tree;
    };
  });
  await ui.action('管理 folder');await ui.action('删除');
  changed=true;await ui.click('bm-refresh');
  ui.get('bm-delete-children').checked=true;
  await ui.click('bm-delete-confirm');
  assert.match(ui.get('bm-notice').textContent,/子项发生变化|外部修改/);
  assert.equal(ui.data.calls.filter(([name])=>['remove','prepareRemoveTree','removeTree'].includes(name)).length,0);
  ui.close();
});

test('R2.5 foreground editing survives a refresh that finishes after further typing',async()=>{
  let delay=false,release=null;
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.getTree=async()=>{
      if(delay)return new Promise(resolve=>{release=()=>resolve(sample())});
      return sample();
    };
  });
  await ui.action('管理 other');await ui.action('编辑');
  ui.get('bm-name').value='Draft A';ui.get('bm-name').fire('input');
  delay=true;await ui.click('bm-refresh');
  assert.equal(typeof release,'function');
  ui.get('bm-name').value='Draft B';ui.get('bm-name').fire('input');
  delay=false;release();await ui.settle();await ui.settle();
  assert.equal(ui.get('bm-name').value,'Draft B','the latest draft must win over the earlier refresh');
  ui.close();
});

test('R2.5 a resolved create RPC without a changed native tree is not shown as saved',async()=>{
  const ui=await bookmarkUi();
  await ui.click('bm-new-folder');
  ui.get('bm-name').value='Unconfirmed folder';
  ui.get('bm-parent').value='1';
  assert.equal(await ui.submit(),true);
  assert.match(ui.get('bm-notice').textContent,/未能核实目标变化/);
  assert.equal(ui.get('bm-name').value,'Unconfirmed folder','unverified write keeps the draft');
  assert.equal(ui.get('bm-save').disabled,true,'unverified write blocks repeat submission');
  ui.get('bm-form').fire('submit');
  await ui.settle();
  assert.equal(ui.data.calls.filter(([op])=>op==='create').length,1,
    'no implicit or repeated hazardous write');
  ui.close();
});

test('R2.5 confirms a folder save only after a fresh tree read contains the created node',async()=>{
  const roots=sample();
  const ui=await bookmarkUi(({sdk})=>{
    sdk.bookmarks.getTree=async()=>roots;
    sdk.bookmarks.create=async args=>{
      const created={id:'50',title:args.title,parentId:args.parentId,children:[]};
      roots[0].children[0].children.push(created);
      return {id:created.id,title:created.title,parentId:created.parentId};
    };
  });
  await ui.click('bm-new-folder');
  ui.get('bm-name').value='Verified native-like folder';
  ui.get('bm-parent').value='1';
  assert.equal(await ui.submit(),true);
  assert.match(ui.get('bm-notice').textContent,/已更新并重新读取/);
  assert.equal(ui.get('bm-form-view').hidden,true);
  assert.equal(ui.get('bm-save').disabled,false);
  ui.close();
});
