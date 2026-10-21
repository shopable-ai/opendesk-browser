import test from 'node:test';
import assert from 'node:assert/strict';
import '../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../examples/sidebar-tools/bookmark-manager/src/service.js';
import {runBookmarkAgentLoop} from '../../src/ui/conversation/bookmark-agent-loop.js';
import {verifyBookmarkCompletion,validateBookmarkPlan} from '../../src/ui/conversation/bookmark-actions.js';

// R2.1: production Agent / Service / Model logic with deterministic SDK
// receipts. These tests are NOT live Provider, installed Chrome or Native proof.
const page={status:'available',title:'Example',url:'https://example.com/?token=local-only',
 tabRef:'tab_ref_1234567890123456',documentRef:'doc_ref_1234567890123456'};
const context={currentFolderId:'1',selectedId:null,pageContext:page};
const ensure={type:'folder.ensure',title:'测试收藏夹',parent:'$currentFolder'};
const save={type:'bookmark.create',title:'$pageTitle',url:'$currentPage',parent:'$lastFolder'};
const done={complete:[{kind:'bookmark.inFolder',folder:'$lastFolder',url:'$currentPage'}]};
const err=(code,message=code)=>Object.assign(new Error(message),{code});

function fixture(){
 const nodes=[{id:'0',title:'root'},
  {id:'1',title:'书签栏',parentId:'0'},
  {id:'2',title:'其他',parentId:'0'}];
 const writes=[],reads=[],statuses=[];let next=100;
 const sdk={capabilities:{
   list:async()=>globalThis.BookmarkR2Service.METHODS.map(key=>({
    operation:'browser.bookmarks.'+key,requiredCapabilities:['browser.bookmarks.full'],
    status:{callableNow:true}})),
   getStatus:async receipt=>{
    statuses.push(receipt.operation);
    await sdk.onStatus?.(receipt.operation);
    return {callableNow:true};
   }
  },bookmarks:{}};
 for(const key of globalThis.BookmarkR2Service.METHODS){
  const parts=key.split('.');let owner=sdk.bookmarks;
  for(const part of parts.slice(0,-1))owner=owner[part]??={};
  owner[parts.at(-1)]=async()=>({});
 }
 sdk.bookmarks.getTree=async()=>{reads.push('getTree');
  return {snapshotRef:'local_snapshot_123456',nodes:structuredClone(nodes),nextCursor:null};
 };
 sdk.bookmarks.create=async args=>{
  writes.push({method:'create',args:structuredClone(args)});
  const node={id:String(next++),title:args.title,parentId:args.parentId,
   ...(args.url?{url:args.url}:{})};
  nodes.push(node);
  await sdk.onCreate?.(args);
  return {...node};
 };
 sdk.bookmarks.move=async args=>{
  writes.push({method:'move',args:structuredClone(args)});
  const node=nodes.find(row=>row.id===args.id);
  node.parentId=args.destination.parentId;return structuredClone(node);
 };
 sdk.bookmarks.update=async args=>{
  writes.push({method:'update',args:structuredClone(args)});
  const node=nodes.find(row=>row.id===args.id);
  Object.assign(node,args.changes);return structuredClone(node);
 };
 const service=globalThis.BookmarkR2Service.create(sdk);
 return {sdk,service,nodes,writes,reads,statuses};
}
function proposals(rows){
 const queue=[...rows],contexts=[];
 return {contexts,nextProposal:async modelContext=>{
  contexts.push(modelContext);
  if(!queue.length)throw err('E_TEST_EXCESS_MODEL_CALL');
  return queue.shift();
 }};
}
function run(f,{goal='把当前页面放入测试收藏夹，如果没有，就创建目录',
 initialProposal={actions:[{type:'bookmark.search',query:'测试收藏夹'}]},
 nextProposal,signal,beforeWrite,service=f.service,retryModel=false,limits,onStep,onPhase}={}){
 return runBookmarkAgentLoop({goal,initialProposal,service,context,
  nextProposal,signal,beforeWrite,retryModel,limits,onStep,onPhase});
}
const created=f=>f.writes.filter(item=>item.method==='create');
const currentIn=(f,parentId)=>f.nodes.filter(node=>node.parentId===parentId&&node.url===page.url);

test('R2.1 T1 T5 T6: one user request, NOT_FOUND -> ensure -> save -> fresh verification',async()=>{
 const f=fixture(),p=proposals([{actions:[ensure]},{actions:[save]},done]),steps=[],phases=[];
 const result=await run(f,{nextProposal:p.nextProposal,
  onStep:step=>steps.push(step.message),onPhase:phase=>phases.push(phase)});
 assert.equal(result.completed,true);assert.equal(result.modelCalls,4);
 assert.equal(result.actionCount,3);
 assert.equal(p.contexts[0].progress[0].observations[0].status,'NOT_FOUND');
 assert.equal(p.contexts[1].bookmarkState.lastFolder,'测试收藏夹');
 assert.ok(!JSON.stringify(p.contexts).includes('token=local-only'),
  'private current-page URL does not enter Provider context');
 const folder=f.nodes.find(n=>n.title==='测试收藏夹');
 assert.ok(folder);assert.equal(currentIn(f,folder.id).length,1);
 assert.equal(created(f).length,2);
 assert.ok(f.reads.length>=4,'all mutations and completion use fresh snapshots');
 assert.match(result.summary,/已核实.+测试收藏夹/);
 assert.ok(phases.includes('verifying'));
 assert.ok(steps.some(step=>step.includes('没有找到匹配')));
});

test('R2.1 T2: existing unique child is reused, no duplicate folder write',async()=>{
 const f=fixture();f.nodes.push({id:'already-folder',title:'测试收藏夹',parentId:'1'});
 const p=proposals([{actions:[save]},done]);
 const result=await run(f,{initialProposal:{actions:[ensure]},nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 assert.equal(result.refs.folderId,'already-folder');
 assert.equal(created(f).length,1);assert.equal(created(f)[0].args.url,page.url);
 assert.equal(currentIn(f,'already-folder').length,1);
});

test('R2.1 T3: same URL in target folder is not created twice or moved',async()=>{
 const f=fixture();
 f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
  {id:'book',title:'早已收藏',url:page.url,parentId:'folder'});
 const p=proposals([{actions:[save]},done]);
 const result=await run(f,{initialProposal:{actions:[ensure]},nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 assert.equal(created(f).length,0);
 assert.equal(currentIn(f,'folder').length,1);
 assert.equal(result.refs.bookmarkId,'book');
});

test('R2.1 T4: same-name siblings are ambiguous and cause no write',async()=>{
 const f=fixture();
 f.nodes.push({id:'f1',title:'测试收藏夹',parentId:'1'},
  {id:'f2',title:'测试收藏夹',parentId:'1'});
 const result=await run(f,{initialProposal:{actions:[ensure]},
  nextProposal:()=>{throw Error('must not call Provider again')}});
 assert.equal(result.completed,false);
 assert.match(result.question,/多个同名/);
 assert.equal(f.writes.length,0);
});

test('R2.1 name is generic: different folder goal runs without hardcoded title',async()=>{
 const f=fixture(),name='研究资源';
 const p=proposals([{actions:[{type:'bookmark.create',title:'$pageTitle',
  url:'$currentPage',parent:'$lastFolder'}]},
  {complete:[{kind:'bookmark.inFolder',folder:'$lastFolder',url:'$currentPage'}]}]);
 const result=await run(f,{goal:'把当前页面放入'+name+'，若没有就创建',
  initialProposal:{actions:[{type:'folder.ensure',title:name}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 const folder=f.nodes.find(n=>n.title===name);
 assert.equal(currentIn(f,folder.id).length,1);
});

test('R2.1 verifies the user destination, not another successful model check',async()=>{
 const f=fixture();f.nodes.push(
  {id:'other',title:'错误收藏夹',parentId:'1'},
  {id:'book',title:'Example',parentId:'other',url:page.url});
 const p=proposals([{question:'请明确目标文件夹'}]);
 const result=await run(f,{
  initialProposal:{complete:[{kind:'bookmark.inFolder',folder:'错误收藏夹',url:'$currentPage'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(result.question,'请明确目标文件夹');
 assert.equal(p.contexts[0].progress[0].observations[0].status,'NOT_MET');
 assert.equal(f.writes.length,0);
});

test('R2.1 T7: read-only snapshot failure safely retries without duplicate writes',async()=>{
 const f=fixture();let loads=0;
 const service={...f.service,load:async()=>{if(++loads===1)throw err('E_BOOKMARK_READ_RETRYABLE');return f.service.load();}};
 const p=proposals([{complete:[{kind:'search.observed',query:'React'}]}]);
 const result=await run(f,{goal:'搜索 React 相关书签',service,
  initialProposal:{actions:[{type:'bookmark.search',query:'React'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 assert.equal(loads>=3,true);assert.equal(f.writes.length,0);
});

test('R2.1 T7: stateless HTTPS transient inference may retry only that decision',async()=>{
 const f=fixture();let calls=0;
 const result=await run(f,{goal:'确保资料文件夹存在',
  initialProposal:{actions:[{type:'bookmark.search',query:'资料'}]},
  nextProposal:async()=>{
   if(++calls===1)throw err('E_AI_NETWORK');
   if(calls===2)return {actions:[{type:'folder.ensure',title:'资料'}]};
   return {complete:[{kind:'folder.exists',folder:'资料'}]};
  },retryModel:true});
 assert.equal(result.completed,true);
 assert.equal(calls,3);
 assert.equal(created(f).length,1);
});

test('R2.1 T8: lost acknowledgement after SDK dispatch halts, never retries write',async()=>{
 const f=fixture();f.sdk.onCreate=async()=>{throw err('E_TIMEOUT','response lost')};
 let nextCalls=0;
 await assert.rejects(run(f,{
  initialProposal:{actions:[ensure,{type:'folder.ensure',title:'不得创建'}]},
  nextProposal:()=>{nextCalls++;return done;}
 }),error=>error.code==='E_OUTCOME_UNKNOWN'&&error.writeIssued===true);
 assert.equal(created(f).length,1);
 assert.equal(nextCalls,0);
});

test('R2.1 T9: Stop after a confirmed first action preserves journal, no second write',async()=>{
 const f=fixture(),controller=new AbortController();
 await assert.rejects(run(f,{
  initialProposal:{actions:[ensure,{type:'folder.create',title:'不得创建'}]},
  nextProposal:()=>done,signal:controller.signal,
  onStep:step=>{if(step.id)controller.abort();}
 }),error=>error.code==='E_CANCELLED'&&error.partial.length===1&&
  typeof error.refs.folderId==='string');
 assert.equal(created(f).length,1);
});

test('R2.1 T9: grant lost between two confirmed steps denies next SDK dispatch',async()=>{
 const f=fixture();let authorized=true;
 await assert.rejects(run(f,{
  initialProposal:{actions:[ensure,{type:'folder.create',title:'不得创建'}]},
  nextProposal:()=>done,
  beforeWrite:async()=>{if(!authorized)throw err('E_MODEL_GRANT_REVOKED');},
  onStep:step=>{if(step.id)authorized=false;}
 }),error=>error.code==='E_MODEL_GRANT_REVOKED'&&error.writeIssued===false);
 assert.equal(created(f).length,1);
});

test('R2.1 T10: repeated identical search stops with no-progress error',async()=>{
 const f=fixture();
 await assert.rejects(run(f,{goal:'搜索 React 书签',
  initialProposal:{actions:[{type:'bookmark.search',query:'React'}]},
  nextProposal:()=>({actions:[{type:'bookmark.search',query:'React'}]})}),
 error=>error.code==='E_AGENT_NO_PROGRESS');
 assert.equal(f.writes.length,0);
});

test('R2.1 T10: hard decision ceiling stops instead of silently claiming completion',async()=>{
 const f=fixture();
 await assert.rejects(run(f,{goal:'搜索两次关键词',
  limits:{rounds:2,actions:24,durationMs:60000},
  initialProposal:{actions:[{type:'bookmark.search',query:'第一'}]},
  nextProposal:()=>({actions:[{type:'bookmark.search',query:'第二'}]})}),
 error=>error.code==='E_AGENT_LIMIT');
 assert.equal(f.writes.length,0);
});

test('R2.1 rejects malformed completion and unsafe model tool names',()=>{
 assert.throws(()=>validateBookmarkPlan({complete:[{kind:'bookmark.inFolder',
  folder:'X',url:'javascript:alert(1)'}]}),{code:'E_CONVERSATION_SCHEMA'});
 assert.throws(()=>validateBookmarkPlan({actions:[{type:'bookmark.delete',target:'all'}]}),
  {code:'E_CONVERSATION_SCHEMA'});
});

test('R2.1 completion always reloads actual service and rejects missing URLs',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'});
 const result=await verifyBookmarkCompletion({checks:done.complete,
  service:f.service,context:{...context},refs:{folderId:'folder'}});
 assert.equal(result.complete,false);
 assert.match(result.reason,/尚未满足/);
});

test('R2.1 TOCTOU: conflicting folder created during Service preflight blocks duplicate SDK write',async()=>{
 const f=fixture();let injected=false;
 f.sdk.onStatus=async name=>{
  if(name==='browser.bookmarks.create'&&!injected){
   injected=true;f.nodes.push({id:'external',title:'测试收藏夹',parentId:'1'});
  }
 };
 await assert.rejects(run(f,{initialProposal:{actions:[ensure]},
  nextProposal:()=>done}),error=>error.code==='E_BOOKMARK_STALE'&&error.writeIssued===false);
 assert.equal(injected,true);
 assert.equal(created(f).length,0,'pre-dispatch conflict is definite and not issued');
});
