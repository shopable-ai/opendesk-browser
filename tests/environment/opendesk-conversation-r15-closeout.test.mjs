import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {executeBookmarkPlan} from '../../src/ui/conversation/bookmark-actions.js';

// Real action executor, deterministic in-memory Service. These tests do not
// claim Chrome/Provider/Native validation; integration evidence is separate.
function fixture(){
 const nodes=[
  {id:'0',title:'root',parentId:null,locked:true},
  {id:'1',title:'书签栏',parentId:'0',locked:true},
  {id:'10',title:'工具',parentId:'1',locked:false}
 ];
 let sequence=20;
 const issued=[];
 const snapshot=()=>{
  const byId=new Map(nodes.map(node=>[node.id,{...node}]));
  const children=new Map();
  for(const node of nodes){
   if(node.parentId===null)continue;
   children.set(node.parentId,[...(children.get(node.parentId)||[]),node.id]);
  }
  return {roots:new Set(['0']),byId,children};
 };
 const service={
  load:async()=>snapshot(),
  async createFolder({title,parentId}){
   issued.push({type:'folder',title,parentId});
   const id=String(++sequence);nodes.push({id,title,parentId,locked:false});return {id};
  },
  async createBookmark({title,url,parentId}){
   issued.push({type:'bookmark',title,url,parentId});
   const id=String(++sequence);nodes.push({id,title,url,parentId,locked:false});return {id};
  }
 };
 return {service,snapshot,issued,nodes};
}
const actions=[
 {type:'folder.create',title:'AI 工具',parent:'$currentFolder'},
 {type:'bookmark.create',title:'当前网页',url:'https://example.com/',parent:'$lastFolder'}
];
const context={selectedId:'10',currentFolderId:'10',pageContext:{status:'available'}};
const refs={folderId:null,bookmarkId:null,matches:[]};
const revoked=()=>Object.assign(Error('模型授权已撤销'),{code:'E_MODEL_GRANT_REVOKED'});

test('R1.5 verified folder then bookmark: only readback IDs enter next turn',async()=>{
 const {service,issued,snapshot}=fixture(),events=[];
 const result=await executeBookmarkPlan({
  plan:{actions},service,context,refs,expectedTree:snapshot(),
  beforeWrite:async({method})=>assert.ok(['createFolder','createBookmark'].includes(method)),
  onStep:step=>events.push(step)
 });
 assert.equal(issued.length,2);
 assert.equal(events.length,2);
 assert.equal(events[0].id,result.refs.folderId);
 assert.equal(events[1].id,result.refs.bookmarkId);
 assert.equal(issued[1].parentId,result.refs.folderId);
 assert.equal(result.tree.byId.get(result.refs.bookmarkId)?.title,'当前网页');
 assert.equal(events[1].tree.byId.get(result.refs.bookmarkId)?.parentId,result.refs.folderId);
});

test('R1.5 current-page URL is canonicalized before the verified write',async()=>{
 const {service,issued,snapshot}=fixture();
 const result=await executeBookmarkPlan({
  plan:{actions:[{type:'bookmark.create',title:'$pageTitle',url:'$currentPage',parent:'$currentFolder'}]},
  service,context:{...context,pageContext:{
   status:'available',title:'示例当前网页',url:'https://example.com',
   tabRef:'verified-tab-0123456789',documentRef:'verified-doc-0123456789'
  }},refs,expectedTree:snapshot()
 });
 assert.equal(issued.length,1);
 assert.equal(issued[0].url,'https://example.com/');
 assert.equal(result.tree.byId.get(result.refs.bookmarkId).url,'https://example.com/');
});

test('R1.5 revoked model grant before first mutation makes zero Chrome writes',async()=>{
 const {service,issued,snapshot}=fixture();
 await assert.rejects(executeBookmarkPlan({
  plan:{actions},service,context,refs,expectedTree:snapshot(),beforeWrite:async()=>{throw revoked();}
 }),error=>error.code==='E_MODEL_GRANT_REVOKED'&&error.writeIssued===false);
 assert.equal(issued.length,0);
});

test('R1.5 revoked after first verified step preserves partial journal and blocks step two',async()=>{
 const {service,issued,snapshot}=fixture(),events=[];
 let granted=true;
 await assert.rejects(executeBookmarkPlan({
  plan:{actions},service,context,refs,expectedTree:snapshot(),
  beforeWrite:async()=>{if(!granted)throw revoked();},
  onStep:step=>{events.push(step);granted=false;}
 }),error=>{
  assert.equal(error.code,'E_MODEL_GRANT_REVOKED');
  assert.equal(error.writeIssued,false);
  assert.equal(error.partial.length,1);
  assert.equal(error.refs.folderId,events[0].id);
  return true;
 });
 assert.equal(issued.length,1);
});

test('R1.5 revocation signal between verified steps prevents second write',async()=>{
 const {service,issued,snapshot}=fixture(),controller=new AbortController();
 await assert.rejects(executeBookmarkPlan({
  plan:{actions},service,context,refs,expectedTree:snapshot(),
  signal:controller.signal,onStep:()=>controller.abort(revoked())
 }),error=>error.code==='E_MODEL_GRANT_REVOKED'&&error.partial?.length===1);
 assert.equal(issued.length,1);
});

test('R1.5 issued write with ambiguous receipt is UNKNOWN, never safe to replay',async()=>{
 const {service,issued,snapshot}=fixture(),write=service.createFolder;
 service.createFolder=async args=>{
  await write(args);throw Object.assign(Error('response lost'),{code:'E_HOST_TIMEOUT'});
 };
 await assert.rejects(executeBookmarkPlan({
  plan:{actions},service,context,refs,expectedTree:snapshot()
 }),error=>error.code==='E_OUTCOME_UNKNOWN'&&error.writeIssued===true&&error.partial.length===0);
 assert.equal(issued.length,1);
});

test('R1.5 React reveal respects filter/manual navigation; Provider lifecycle remains trusted',async()=>{
 const [app,workflow,dock,preview]=await Promise.all([
  readFile('examples/sidebar-tools/bookmark-manager/src/react/App.jsx','utf8'),
  readFile('src/ui/workflow/workflow-view.js','utf8'),
  readFile('src/ui/react/components/conversation.tsx','utf8'),
  readFile('examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx','utf8')
 ]);
 assert.match(app,/pendingAiReveal\.current=mayReveal/);
 assert.match(app,/const mayReveal=interactionEpoch\.current===interactionAtSend&&!queryRef\.current\.trim\(\)/);
 assert.match(app,/function locateAiResult\(\)/);
 assert.match(app,/beforeWrite:authorization\?\.assertWrite/);
 assert.match(app,/authorization\?\.release\?\.\(\)/);
 assert.match(app,/disabled=\{!dock\} onClick=\{dock\?\.toggle\}/);
 assert.match(workflow,/api\.permissions\.onRemoved\?\.addListener\(removedPermissions\)/);
 assert.match(workflow,/invalidateBookmarkConversation\(/);
 assert.match(workflow,/api\.permissions\.contains\(grantPattern\?/);
 assert.match(workflow,/permissions:\['nativeMessaging'\]/);
 assert.match(workflow,/authorization:Object\.freeze\(\{signal:abortController\.signal,assertWrite,release\}\)/);
 assert.doesNotMatch(dock,/\.bookmarks\.|generateStructured\(|createRoot\(/);
 assert.match(preview,/创建\|新建/);
 assert.match(preview,/\$currentPage/);
});
