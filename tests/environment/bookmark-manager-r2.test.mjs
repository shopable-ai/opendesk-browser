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
  assert.equal(pkg.version,'0.1.0');
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
    move:()=>{},remove:()=>{},removeTree:()=>{},
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
      removeTree:async()=>{deletes++},
      observe:{start:async()=>{},read:async()=>{},stop:async()=>{}}}};
  const service=ctx.BookmarkR2Service.create(sdk);
  assert.equal((await service.probe()).ready,true);
  const tree=await service.load();
  const item=tree.byId.get('2'),sig=ctx.BookmarkR2Model.descendantSignatures(tree,item.id);
  await assert.rejects(service.remove({expected:item,confirmed:true,expectedDescendantSignatures:sig}),
    /Host 端并发校验/);
  assert.equal(deletes,0);
});
