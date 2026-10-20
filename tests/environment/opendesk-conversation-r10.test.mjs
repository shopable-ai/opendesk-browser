import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBookmarkPlan,executeBookmarkPlan,bookmarkConversationContext} from '../../src/ui/conversation/bookmark-actions.js';

// In-memory contract fixture. It tests intent validation and the existing
// Service-shaped readback protocol, NEVER claims a Native/Chrome PASS.
function fixture(){
 const nodes=[{id:'0',title:'root',parentId:null},
  {id:'1',title:'书签栏',parentId:'0'},
  {id:'2',title:'其他',parentId:'0'}];
 const calls=[];let next=3,ambiguous=false;
 const service={
  async load(){calls.push('load');return {byId:new Map(nodes.map(n=>[n.id,{...n}]))}},
  async createFolder({title,parentId}){
   calls.push('folder.create');const item={id:String(next++),title,parentId};
   nodes.push(item);return {...item};
  },
  async createBookmark({title,url,parentId}){
   calls.push('bookmark.create');const item={id:String(next++),title,url,parentId};
   nodes.push(item);return {...item};
  },
  async move({expected,parentId}){
   calls.push('bookmark.move');const found=nodes.find(n=>n.id===expected.id);
   found.parentId=parentId;return {...found};
  },
  async update({expected,title,url}){
   calls.push('bookmark.update');const found=nodes.find(n=>n.id===expected.id);
   found.title=title;if(typeof url==='string')found.url=url;return {...found};
  }
 };
 return {nodes,calls,service};
}
const context={currentFolderId:'1',selectedId:null};
test('R1.0 real readback boundary: create folder, bookmark, rename and follow-up reference',async()=>{
 const f=fixture();
 const first=await executeBookmarkPlan({
  plan:{actions:[{type:'folder.create',title:'AI 工具'},
   {type:'bookmark.create',title:'Example',url:'https://example.com',parent:'$lastFolder'}]},
  service:f.service,context});
 assert.equal(first.messages.length,2);
 assert.equal(first.refs.folderId,'3');
 assert.equal(first.refs.bookmarkId,'4');
 assert.equal(f.calls.filter(x=>x==='load').length,3,'each mutation must read back Chrome');
 const second=await executeBookmarkPlan({
  plan:{actions:[{type:'bookmark.update',target:'$lastBookmark',title:'测试网站'}]},
  service:f.service,context,refs:first.refs});
 assert.equal(f.nodes.find(n=>n.id==='4').title,'测试网站');
 assert.equal(second.refs.bookmarkId,'4');
 assert.equal(second.messages.length,1);
});
test('R1.0 search result references resolve into single existing move target',async()=>{
 const f=fixture();
 f.nodes.push({id:'r1',title:'React 资料',url:'https://react.dev',parentId:'1'});
 let result=await executeBookmarkPlan({plan:{actions:[{type:'bookmark.search',query:'React'}]},
  service:f.service,context});
 assert.equal(result.refs.matches[0],'r1');
 result=await executeBookmarkPlan({
  plan:{actions:[{type:'bookmark.move',target:'$search:1',parent:'其他'}]},
  service:f.service,context,refs:result.refs
 });
 assert.equal(f.nodes.find(n=>n.id==='r1').parentId,'2');
 assert.equal(result.messages.length,1);
});
test('R1.0 fail closed for hallucinated operations, ambiguous parents and unknown writes',async()=>{
 const f=fixture();
 assert.throws(()=>validateBookmarkPlan({actions:[{type:'bookmark.delete',target:'$selected'}]}),
  e=>e.code==='E_CONVERSATION_SCHEMA');
 assert.throws(()=>validateBookmarkPlan({actions:[{type:'folder.create',title:'X',permission:'full'}]}),
  e=>e.code==='E_CONVERSATION_SCHEMA');
 assert.throws(()=>validateBookmarkPlan({actions:[{type:'bookmark.create',title:'X',url:'javascript:alert(1)'}]}),
  e=>e.code==='E_CONVERSATION_SCHEMA');
 f.nodes.push({id:'k1',title:'同名',parentId:'1'}, {id:'k2',title:'同名',parentId:'2'});
 await assert.rejects(executeBookmarkPlan({plan:{actions:[{
  type:'bookmark.create',title:'X',url:'https://x.example',parent:'同名'}]},
  service:f.service,context}),e=>e.code==='E_BOOKMARK_AMBIGUOUS');
 assert.equal(f.calls.includes('bookmark.create'),false);
 const original=f.service.load;
 let unreadable=false;
 f.service.load=async()=>unreadable?{byId:new Map()}:original();
 f.service.createFolder=async opts=>{f.calls.push('folder.create');unreadable=true;return {id:'unknown'};};
 await assert.rejects(executeBookmarkPlan({plan:{actions:[
  {type:'folder.create',title:'不确定'},
  {type:'folder.create',title:'不得执行'}
 ]},service:f.service,context}),e=>e.code==='E_OUTCOME_UNKNOWN');
 assert.equal(f.calls.filter(x=>x==='folder.create').length,1,'never auto replay after UNKNOWN');
});
test('R1.0 current-page token stays local and does not upload private URL parameters',async()=>{
 const f=fixture();
 const page={status:'available',title:'当前文档',url:'https://example.com/?secret=never-upload',
  tabRef:'123456789abcdef',documentRef:'987654321abcdef'};
 const safe=bookmarkConversationContext((await f.service.load()),{currentFolderId:'1'});
 assert.equal(JSON.stringify(safe).includes('never-upload'),false);
 const original=f.service.createBookmark;
 f.service.createBookmark=async args=>{
  assert.equal(args.url,page.url);
  assert.equal(args.sourcePage.documentRef,page.documentRef);
  return original(args);
 };
 const result=await executeBookmarkPlan({plan:{actions:[
  {type:'bookmark.create',title:'$pageTitle',url:'$currentPage'}
 ]},service:f.service,context:{...context,pageContext:page}});
 assert.equal(result.messages.length,1);
 assert.equal(f.nodes.find(n=>n.id===result.refs.bookmarkId).title,'当前文档');
});

test('R1.1 a verified folder is retained when a subsequent write is unknown',async()=>{
 const f=fixture();let issued=0;
 f.service.createBookmark=async()=>{issued++;throw Object.assign(Error('lost acknowledgement'),{code:'E_OUTCOME_UNKNOWN'});};
 await assert.rejects(executeBookmarkPlan({
  plan:{actions:[{type:'folder.create',title:'AI 工具'},
   {type:'bookmark.create',title:'Example',url:'https://example.com',parent:'$lastFolder'}]},
  context,service:f.service
 }),error=>{
  assert.equal(error.code,'E_OUTCOME_UNKNOWN');
  assert.equal(error.refs.folderId,'3');
  assert.equal(error.refs.bookmarkId,null);
  assert.equal(error.partial.length,1);
  assert.match(error.partial[0],/已创建文件夹/);
  return true;
 });
 assert.equal(issued,1);
 assert.equal(f.nodes.some(n=>n.id==='3'&&n.title==='AI 工具'),true);
});

test('R1.1 Stop after confirmed first step preserves references and issues no second write',async()=>{
 const f=fixture(),controller=new AbortController();
 await assert.rejects(executeBookmarkPlan({
  plan:{actions:[{type:'folder.create',title:'已确认'},
   {type:'folder.create',title:'不得执行'}]},
  context,service:f.service,signal:controller.signal,
  onStep:step=>{if(step.id)controller.abort()}
 }),error=>{
  assert.equal(error.code,'E_CANCELLED');
  assert.equal(error.refs.folderId,'3');
  assert.equal(error.partial.length,1);
  assert.equal(error.writeIssued,false);
  return true;
 });
 assert.equal(f.calls.filter(x=>x==='folder.create').length,1);
});

test('R1.1 preview uses the production App but distinctly labels offline AI',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../../examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx',import.meta.url),'utf8');
 assert.match(source,/import App from '\.\.\/\.\.\/\.\.\/src\/react\/App\.jsx'/);
 assert.match(source,/离线演示（非真实 AI）/);
 assert.match(source,/root\.render\(<App runtime=\{\{conversation\}\} mode="preview"\/>\)/);
 assert.doesNotMatch(source,/fetch\(|chrome\.bookmarks/);
});

test('R1.2 an external rename after Send blocks a selected bookmark write before SDK dispatch',async()=>{
 const f=fixture();
 f.nodes.push({id:'selected',title:'原书签',url:'https://example.com/old',parentId:'1'});
 const seen=await f.service.load();
 f.nodes.find(node=>node.id==='selected').title='其他窗口已改名';
 await assert.rejects(executeBookmarkPlan({
  plan:{actions:[{type:'bookmark.update',target:'$selected',title:'AI 新名称'}]},
  context:{...context,selectedId:'selected'},expectedTree:seen,service:f.service
 }),error=>error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
 assert.equal(f.calls.includes('bookmark.update'),false);
 assert.equal(f.nodes.find(node=>node.id==='selected').title,'其他窗口已改名');
});

test('R1.2 confirmed first mutation can be followed by another action in the same turn',async()=>{
 const f=fixture();
 f.nodes.push({id:'existing',title:'旧名称',url:'https://example.com',parentId:'1'});
 const seen=await f.service.load();
 const result=await executeBookmarkPlan({
  plan:{actions:[{type:'bookmark.update',target:'$selected',title:'新名称'},
   {type:'bookmark.move',target:'$lastBookmark',parent:'其他'}]},
  context:{...context,selectedId:'existing'},expectedTree:seen,service:f.service
 });
 assert.equal(result.messages.length,2);
 assert.equal(result.refs.bookmarkId,'existing');
 assert.equal(f.nodes.find(node=>node.id==='existing').title,'新名称');
 assert.equal(f.nodes.find(node=>node.id==='existing').parentId,'2');
 assert.equal(f.calls.filter(call=>call==='bookmark.update'||call==='bookmark.move').length,2);
});
