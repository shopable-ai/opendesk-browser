import test from 'node:test';
import assert from 'node:assert/strict';
import '../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../examples/sidebar-tools/bookmark-manager/src/service.js';
import {runBookmarkAgentLoop} from '../../src/ui/conversation/bookmark-agent-loop.js';
import {verifyBookmarkCompletion,validateBookmarkPlan} from '../../src/ui/conversation/bookmark-actions.js';
import {requestWorkflowResponse} from '../../src/ui/workflow/responses.js';
import {requestChatCompletionJSON} from '../../src/ui/workflow/ai-plan.js';

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
 nextProposal,signal,beforeWrite=()=>{},service=f.service,retryModel=false,limits,onStep,onPhase}={}){
 return runBookmarkAgentLoop({goal,initialProposal,service,context,
  nextProposal,signal,beforeWrite,retryModel,limits,onStep,onPhase});
}
const created=f=>f.writes.filter(item=>item.method==='create');
const currentIn=(f,parentId)=>f.nodes.filter(node=>node.parentId===parentId&&node.url===page.url);

test('R2.1 invalid kind actions are corrected with the original goal before fresh completion',async()=>{
 const f=fixture(),goal='把当前页面放入测试收藏夹，如果没有，就创建目录';
 const initialProposal={actions:[
  {kind:'folder.ensure',title:'测试收藏夹',parent:'$currentFolder'},
  {kind:'bookmark.create',title:'$pageTitle',url:'$currentPage',parent:'$lastFolder'}
 ]};
 assert.throws(()=>validateBookmarkPlan(initialProposal),{code:'E_CONVERSATION_SCHEMA'});
 let calls=0,grants=0,readsBeforeVerification;
 const result=await run(f,{goal,initialProposal,beforeWrite:()=>{grants++;},
  onPhase:phase=>{if(phase==='verifying')readsBeforeVerification=f.reads.length;},
  nextProposal:async(input,{signal})=>{
   assert.equal(input.goal,goal);assert.equal(signal.aborted,false);
   if(calls++===0){
    assert.equal(f.writes.length,0);
    const observation=input.progress.at(-1).observations[0];
    assert.equal(observation.kind,'validation');assert.equal(observation.status,'INVALID');
    assert.match(observation.title,/E_CONVERSATION_SCHEMA/);
    assert.match(observation.title,/type/);assert.match(observation.title,/kind/);
    assert.equal(input.remainingActions,24);
    return {actions:[ensure,save]};
   }
   return done;
  }});
 assert.equal(result.completed,true);assert.equal(result.modelCalls,3);
 assert.equal(result.actionCount,2);assert.equal(created(f).length,2);
 assert.ok(grants>0);assert.ok(f.reads.length>readsBeforeVerification);
 assert.equal(currentIn(f,result.refs.folderId).length,1);
});

test('R2.1 invalid action after a valid prefix executes nothing and leaks no invalid payload',async()=>{
 const f=fixture(),secret='UNTRUSTED_SCHEMA_PAYLOAD';
 const result=await run(f,{initialProposal:{actions:[ensure,{kind:'bookmark.create',
  title:secret,url:'https://private.example/?token='+secret,parent:'$lastFolder'}]},
  nextProposal:async input=>{
   assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
   assert.ok(!JSON.stringify(input).includes(secret));
   assert.ok(input.progress[0].observations[0].title.length<=256);
   return {question:'请明确目标'};
  }});
 assert.equal(result.question,'请明确目标');assert.equal(result.actionCount,0);
 assert.equal(f.writes.length,0);
});

test('R2.1 repeated invalid plans stop through the existing no-progress guard',async()=>{
 const f=fixture(),invalid={actions:[{kind:'folder.ensure',title:'目录'}]};let calls=0;
 await assert.rejects(run(f,{initialProposal:invalid,nextProposal:async()=>{
  calls++;return invalid;
 }}),{code:'E_AGENT_NO_PROGRESS'});
 assert.equal(calls,1);assert.equal(f.writes.length,0);
});

test('R2.1 invalid plans consume the existing round budget without executing actions',async()=>{
 const f=fixture();let calls=0;
 await assert.rejects(run(f,{initialProposal:{actions:[{kind:'folder.ensure',title:'目录'}]},
  limits:{rounds:1},nextProposal:async()=>{calls++;return {actions:[ensure]};}}),
 {code:'E_AGENT_LIMIT'});
 assert.equal(calls,0);assert.equal(f.writes.length,0);
});

test('R2.1 Provider schema errors are not retried as invalid plans',async()=>{
 const f=fixture();let calls=0;
 await assert.rejects(run(f,{nextProposal:async()=>{
  calls++;throw err('E_CONVERSATION_SCHEMA');
 }}),{code:'E_CONVERSATION_SCHEMA'});
 assert.equal(calls,1);assert.equal(f.writes.length,0);
});

test('R2.1 execution schema errors stay terminal and issued writes remain UNKNOWN',async()=>{
 for(const issued of [false,true]){
  const f=fixture();let calls=0;
  if(issued)f.sdk.onCreate=()=>{throw err('E_CONVERSATION_SCHEMA');};
  const service=issued?f.service:{...f.service,
   load:async()=>{throw err('E_CONVERSATION_SCHEMA');}};
  await assert.rejects(run(f,{service,initialProposal:{actions:[ensure]},retryModel:true,
   nextProposal:async()=>{calls++;return done;}}),error=>{
    assert.equal(error.code,issued?'E_OUTCOME_UNKNOWN':'E_CONVERSATION_SCHEMA');
    if(issued)assert.equal(error.writeIssued,true);
    return true;
   });
  assert.equal(calls,0);assert.equal(f.writes.length,issued?1:0);
 }
});

test('R2.1 schema correction preserves write authorization and parent cancellation',async()=>{
 for(const cancel of [false,true]){
  const f=fixture(),controller=new AbortController();let calls=0;
  await assert.rejects(run(f,{signal:controller.signal,
   initialProposal:{actions:[{kind:'folder.ensure',title:'目录'}]},
   beforeWrite:()=>{throw err('E_MODEL_GRANT_REQUIRED');},
   nextProposal:async(input,{signal})=>{
    calls++;assert.equal(input.progress[0].observations[0].kind,'validation');
    if(cancel){controller.abort();assert.equal(signal.aborted,true);}
    return {actions:[ensure,save]};
   }}),{code:cancel?'E_CANCELLED':'E_MODEL_GRANT_REQUIRED'});
  assert.equal(calls,1);assert.equal(f.writes.length,0);
 }
});

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

test('R2.2.3 polite folder-creation request verifies Chrome state rather than a model claim',async()=>{
 for(const goal of ['帮我创建一个工作资料文件夹。','请帮我创建一个工作资料文件夹。']){
  const f=fixture(),p=proposals([{complete:[{kind:'folder.exists',folder:'工作资料'}]}]);
  const result=await run(f,{goal,
   initialProposal:{actions:[{type:'folder.create',title:'工作资料',parent:'$currentFolder'}]},
   nextProposal:p.nextProposal});
  assert.equal(result.completed,true,goal);
  assert.equal(created(f).length,1,'only one Chrome folder mutation is issued');
  assert.equal(f.nodes.find(node=>node.id===result.refs.folderId)?.title,'工作资料');
  assert.ok(f.reads.length>=2,'writing and completion both require independent Chrome snapshots');
 }
});

test('R2.2.3 polite compound instructions never complete after only the first folder write',async()=>{
 const f=fixture(),p=proposals([{complete:[{kind:'folder.exists',folder:'工作资料'}]},
  {question:'仍需确认其他操作'}]);
 const result=await run(f,{goal:'帮我创建一个工作资料文件夹，并删除其中所有书签。',
  initialProposal:{actions:[{type:'folder.create',title:'工作资料',parent:'$currentFolder'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.match(result.question,/其他操作/);
 assert.equal(created(f).length,1);
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

test('R2.1 T7: production E_CHROME read encoding retries only the read-only plan',async()=>{
 const f=fixture(),getTree=f.sdk.bookmarks.getTree;let reads=0;
 f.sdk.bookmarks.getTree=async(...args)=>{
  if(++reads===1)throw err('E_CHROME','Chrome bookmarks read failed');
  return getTree(...args);
 };
 const p=proposals([{complete:[{kind:'search.observed',query:'React'}]}]);
 const result=await run(f,{goal:'搜索 React 相关书签',
  initialProposal:{actions:[{type:'bookmark.search',query:'React'}]},nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 assert.equal(reads,3);assert.equal(p.contexts.length,1);
 assert.equal(f.writes.length,0);
});

test('R2.1 T7: persistent E_CHROME read failure stops after one retry',async()=>{
 const f=fixture();let reads=0,decisions=0;
 f.sdk.bookmarks.getTree=async()=>{reads++;throw err('E_CHROME');};
 await assert.rejects(run(f,{nextProposal:()=>{decisions++;return done;}}),{code:'E_CHROME'});
 assert.equal(reads,2);assert.equal(decisions,0);assert.equal(f.writes.length,0);
});

test('R2.1 T7: a write plan is never replayed after a preflight read failure',async()=>{
 for(const code of ['E_CHROME','E_NETWORK','E_BOOKMARK_READ_RETRYABLE','E_TIMEOUT']){
  const f=fixture();let reads=0,grants=0;
  f.sdk.bookmarks.getTree=async()=>{reads++;throw err(code);};
  await assert.rejects(run(f,{initialProposal:{actions:[ensure]},
   beforeWrite:()=>{grants++;},nextProposal:()=>done}),{code});
  assert.equal(reads,1,code);assert.equal(grants,0);assert.equal(f.writes.length,0);
 }
});

test('R2.1 T7: a confirmed read step prevents replay of its plan',async()=>{
 const f=fixture();let steps=0;
 await assert.rejects(run(f,{onStep:()=>{steps++;throw err('E_CHROME');},
  nextProposal:()=>done}),error=>error.code==='E_CHROME'&&error.partial.length===1);
 assert.equal(steps,1);assert.equal(f.reads.length,1);assert.equal(f.writes.length,0);
});

test('R2.1 T7: unknown and authorization read errors never become retryable',async()=>{
 for(const code of ['E_OUTCOME_UNKNOWN','E_AI_OUTCOME_UNKNOWN','E_GRANT_REVOKED',
  'E_MODEL_GRANT_REVOKED','E_BOOKMARK_PERMISSION','E_BOOKMARK_STALE','E_TOOL_CHANGED']){
  const f=fixture();let reads=0;
  f.sdk.bookmarks.getTree=async()=>{reads++;throw err(code);};
  await assert.rejects(run(f,{nextProposal:()=>done}),{code});
  assert.equal(reads,1,code);assert.equal(f.writes.length,0);
 }
});

for(const metadata of [{outcome:'OUTCOME_UNKNOWN'},{upstreamTermination:'NOT_CONFIRMED'}]){
 const key=Object.keys(metadata)[0];
 test('R2.1 T7: read retry rejects '+key+' UNKNOWN metadata even with a retryable code',async()=>{
  for(const code of ['E_CHROME','E_NETWORK','E_BOOKMARK_READ_RETRYABLE','E_TIMEOUT']){
   const f=fixture();let reads=0;
   f.sdk.bookmarks.getTree=async()=>{reads++;throw Object.assign(err(code),metadata);};
   await assert.rejects(run(f,{nextProposal:()=>done}),error=>
    error.code===code&&error[key]===metadata[key]);
   assert.equal(reads,1,code);assert.equal(f.writes.length,0);
  }
 });
 test('R2.1 T7: model retry rejects '+key+' UNKNOWN metadata even with a retryable code',async()=>{
  for(const code of ['E_AI_PROVIDER','E_AI_NETWORK','E_NETWORK','E_AI_HTTP_502']){
   const f=fixture();let calls=0;
   await assert.rejects(run(f,{retryModel:true,nextProposal:async()=>{
    calls++;throw Object.assign(err(code),{httpStatus:503},metadata);
   }}),error=>error.code===code&&error[key]===metadata[key]);
   assert.equal(calls,1,code);assert.equal(f.writes.length,0);
  }
 });
}

for(const status of [502,503])test('R2.1 T7: Responses HTTP '+status+' retries one stateless decision with original context',async()=>{
 const f=fixture(),inputs=[],signals=[];let requests=0,grants=0;
 const result=await run(f,{goal:'确保测试收藏夹文件夹存在',retryModel:true,
  beforeWrite:()=>{grants++;},nextProposal:async(input,{signal})=>{
   inputs.push(input);signals.push(signal);
   return requestWorkflowResponse({endpoint:'https://fixture.invalid/v1/responses',
    apiKey:'unit-test-only-key',model:'fixture-model',instructions:'Return a JSON bookmark plan.',
    input:JSON.stringify(input),signal,fetchImpl:async()=>{
     requests++;
     if(requests<=2){assert.equal(f.writes.length,0);assert.equal(grants,0);}
     if(requests===1)return new Response('',{status});
     const proposal=requests===2?{actions:[ensure]}:
      {complete:[{kind:'folder.exists',folder:'测试收藏夹'}]};
     return Response.json({id:'resp_fixture_'+requests,object:'response',status:'completed',
      output:[{type:'message',role:'assistant',status:'completed',
       content:[{type:'output_text',text:JSON.stringify(proposal)}]}]});
    }});
  }});
 assert.equal(result.completed,true);assert.equal(requests,3);
 assert.deepEqual(inputs[0],inputs[1]);assert.equal(signals[0],signals[1]);
 assert.equal(inputs[1].goal,'确保测试收藏夹文件夹存在');
 assert.equal(signals[1].aborted,false);assert.equal(grants>0,true);assert.equal(created(f).length,1);
});

test('R2.1 T7: persistent known HTTP failure stops after one decision retry',async()=>{
 const f=fixture();let calls=0;
 await assert.rejects(run(f,{retryModel:true,nextProposal:async()=>{
  calls++;throw Object.assign(err('E_AI_PROVIDER'),{httpStatus:503});
 }}),error=>error.code==='E_AI_PROVIDER'&&error.httpStatus===503);
 assert.equal(calls,2);assert.equal(f.writes.length,0);
});

for(const status of [502,503])test('R2.1 T7: ChatCompletion HTTP '+status+' retries one stateless decision with original context',async()=>{
 const f=fixture(),inputs=[],signals=[],errors=[];let requests=0;
 const result=await run(f,{goal:'确保测试收藏夹文件夹存在',retryModel:true,
  nextProposal:async(input,{signal})=>{
   inputs.push(input);signals.push(signal);
   try{return await requestChatCompletionJSON({endpoint:'https://fixture.invalid/v1/chat/completions',
    apiKey:'unit-test-only-key',model:'fixture-model',instructions:'Return a JSON bookmark plan.',
    input:JSON.stringify(input),signal,fetchImpl:async()=>{
     requests++;
     if(requests<=2)assert.equal(f.writes.length,0);
     if(requests===1)return new Response('',{status});
     const proposal=requests===2?{actions:[ensure]}:
      {complete:[{kind:'folder.exists',folder:'测试收藏夹'}]};
     return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}]});
    }});
   }catch(error){errors.push({code:error.code,message:error.message,httpStatus:error.httpStatus});throw error;}
  }});
 assert.equal(result.completed,true);assert.equal(requests,3);assert.equal(created(f).length,1);
 assert.deepEqual(inputs[0],inputs[1]);assert.equal(signals[0],signals[1]);
 assert.equal(inputs[1].goal,'确保测试收藏夹文件夹存在');assert.equal(signals[1].aborted,false);
 assert.deepEqual(errors,[{code:'E_AI_PROVIDER',message:'AI 服务请求失败（HTTP '+status+'）',httpStatus:status}]);
});

test('R2.1 T7: ChatCompletion retains other HTTP statuses without retrying',async()=>{
 for(const status of [401,403,429,500]){
  const f=fixture();let requests=0;
  await assert.rejects(run(f,{retryModel:true,nextProposal:(_input,{signal})=>
   requestChatCompletionJSON({endpoint:'https://fixture.invalid/v1/chat/completions',
    apiKey:'unit-test-only-key',model:'fixture-model',instructions:'Return JSON.',input:'{}',signal,
    fetchImpl:async()=>{requests++;return new Response('',{status});}})
  }),error=>error.code==='E_AI_PROVIDER'&&error.httpStatus===status&&
   error.message==='AI 服务请求失败（HTTP '+status+'）');
  assert.equal(requests,1);assert.equal(f.writes.length,0);
 }
});

test('R2.1 T7: ChatCompletion transport failure remains UNKNOWN without retry',async()=>{
 const f=fixture();let requests=0;
 await assert.rejects(run(f,{retryModel:true,nextProposal:(_input,{signal})=>
  requestChatCompletionJSON({endpoint:'https://fixture.invalid/v1/chat/completions',
   apiKey:'unit-test-only-key',model:'fixture-model',instructions:'Return JSON.',input:'{}',signal,
   fetchImpl:async()=>{requests++;throw new TypeError('Failed to fetch');}})
 }),error=>error.code==='E_AI_OUTCOME_UNKNOWN'&&error.httpStatus===undefined);
 assert.equal(requests,1);assert.equal(f.writes.length,0);
});

test('R2.1 T7: HTTP retry rejects unknown status, authorization, issued work and Native mode',async()=>{
 const cases=[
  ...[undefined,'503',401,403,429,500,504].map(httpStatus=>({retryModel:true,
   error:Object.assign(err('E_AI_PROVIDER'),{httpStatus})})),
  ...['E_AI_OUTCOME_UNKNOWN','E_OUTCOME_UNKNOWN','E_MODEL_GRANT_REVOKED',
   'E_AI_PERMISSION','E_AI_DISCONNECTED'].map(code=>({retryModel:true,
   error:Object.assign(err(code),{httpStatus:503})})),
  {retryModel:false,error:Object.assign(err('E_AI_PROVIDER'),{httpStatus:503})},
  {retryModel:false,error:err('E_AI_NETWORK')},
  {retryModel:true,error:Object.assign(err('E_AI_PROVIDER'),{httpStatus:503,writeIssued:true})},
  {retryModel:true,error:Object.assign(err('E_AI_PROVIDER'),{httpStatus:503,partial:['已确认一步']})}
 ];
 for(const row of cases){
  const f=fixture();let calls=0;
  await assert.rejects(run(f,{retryModel:row.retryModel,nextProposal:async()=>{
   calls++;throw row.error;
  }}),error=>error===row.error);
  assert.equal(calls,1,row.error.code);assert.equal(f.writes.length,0);
 }
});

test('R2.1 T7: actual Responses transport error remains UNKNOWN without retry',async()=>{
 const f=fixture();let requests=0;
 await assert.rejects(run(f,{retryModel:true,nextProposal:(_input,{signal})=>
  requestWorkflowResponse({endpoint:'https://fixture.invalid/v1/responses',
   apiKey:'unit-test-only-key',model:'fixture-model',instructions:'Return JSON.',input:'{}',signal,
   fetchImpl:async()=>{requests++;throw new TypeError('Failed to fetch');}})
 }),error=>error.code==='E_AI_OUTCOME_UNKNOWN'&&error.upstreamTermination==='NOT_CONFIRMED');
 assert.equal(requests,1);assert.equal(f.writes.length,0);
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

test('R2.1 keeps the exact original goal in every Provider decision',async()=>{
 const f=fixture(),goal='把当前页面放入测试收藏夹，如果没有，就创建目录';
 const p=proposals([{actions:[ensure]},{actions:[save]},done]);
 assert.equal((await run(f,{goal,nextProposal:p.nextProposal})).completed,true);
 assert.deepEqual(p.contexts.map(row=>row.goal),[goal,goal,goal]);
});

test('R2.1 Provider wait counts against the task deadline and late proposals never write',async()=>{
 const f=fixture();let resolveProposal,taskSignal,decisionAbortReason;
 const pending=run(f,{limits:{durationMs:20},
  nextProposal:(_,{signal}={})=>{
   assert.ok(signal instanceof AbortSignal,'continuation must receive the task signal');
   taskSignal=signal;
   signal.addEventListener('abort',()=>{decisionAbortReason=signal.reason;},{once:true});
   return new Promise(resolve=>{resolveProposal=resolve;});
  }});
 let watchdog;
 try{
  await assert.rejects(Promise.race([pending,new Promise((_,reject)=>{
   watchdog=setTimeout(()=>reject(err('E_TEST_DEADLINE_NOT_ENFORCED')),500);
  })]),{code:'E_AGENT_LIMIT'});
 }finally{
  clearTimeout(watchdog);
  resolveProposal?.({actions:[ensure]});
  await pending.catch(()=>{});
 }
 assert.equal(taskSignal.aborted,true);
 assert.equal(decisionAbortReason?.code,'E_AGENT_LIMIT');
 assert.equal(decisionAbortReason,taskSignal.reason);
 assert.equal(f.writes.length,0);
});

test('R2.1 Stop interrupts a pending Provider decision',async()=>{
 const f=fixture(),controller=new AbortController();let resolveProposal;
 const pending=run(f,{signal:controller.signal,nextProposal:()=>new Promise(resolve=>{
  resolveProposal=resolve;controller.abort();
 })});
 let watchdog;
 try{
  await assert.rejects(Promise.race([pending,new Promise((_,reject)=>{
   watchdog=setTimeout(()=>reject(err('E_TEST_STOP_NOT_ENFORCED')),500);
  })]),{code:'E_CANCELLED'});
 }finally{
  clearTimeout(watchdog);resolveProposal?.({question:'不应等待模型'});
  await pending.catch(()=>{});
 }
 assert.equal(f.writes.length,0);
});

test('R2.1 missing trusted write authorization denies mutation',async()=>{
 const f=fixture();
 await assert.rejects(runBookmarkAgentLoop({goal:'创建资料文件夹',service:f.service,
  context,initialProposal:{actions:[ensure]},nextProposal:()=>done}),
 error=>error.code==='E_MODEL_GRANT_REQUIRED'&&error.writeIssued===false);
 assert.equal(f.writes.length,0);
});

test('R2.1 unrelated folder existence cannot complete the original creation goal',async()=>{
 const f=fixture(),p=proposals([{question:'请确认资料文件夹位置'}]);
 const result=await run(f,{goal:'确保资料文件夹存在',
  initialProposal:{complete:[{kind:'folder.exists',folder:'其他'}]},nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(p.contexts[0].progress[0].observations[0].status,'NOT_MET');
 assert.equal(f.writes.length,0);
});

test('R2.1 independent readback checks the original filing goal even with weak model checks',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
  {id:'book',title:'Example',url:page.url,parentId:'folder'});
 const result=await run(f,{initialProposal:{complete:[{kind:'folder.exists',folder:'测试收藏夹'}]},
  nextProposal:()=>{throw err('E_TEST_GOAL_ALREADY_MET');}});
 assert.equal(result.completed,true);
 assert.match(result.summary,/当前网页.+测试收藏夹/);
 assert.equal(f.writes.length,0);
});

test('R2.1 search completion must cover the original query',async()=>{
 const f=fixture(),p=proposals([
  {complete:[{kind:'search.observed',query:'Vue'}]}, {question:'还需要搜索 React'}]);
 const result=await run(f,{goal:'搜索 React 相关书签',
  initialProposal:{actions:[{type:'bookmark.search',query:'Vue'}]},nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(p.contexts[1].progress.at(-1).observations[0].status,'NOT_MET');
});

test('R2.1 named full destination path is verified against the fresh tree',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
  {id:'book',title:'Example',url:page.url,parentId:'folder'});
 const result=await runBookmarkAgentLoop({goal:'把当前页面放入书签栏 / 测试收藏夹',
  initialProposal:done,nextProposal:()=>{throw err('E_TEST_GOAL_ALREADY_MET');},
  service:f.service,context,refs:{folderId:'folder'}});
 assert.equal(result.completed,true);
 assert.equal(f.writes.length,0);
});

test('R2.1 unchanged observations cannot evade the stall guard by changing plan syntax',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'});
 let calls=0;
 await assert.rejects(run(f,{initialProposal:{actions:[ensure]},nextProposal:()=>{
  calls++;
  return {actions:[calls%2?{type:'folder.ensure',title:ensure.title}:ensure]};
 }}),{code:'E_AGENT_NO_PROGRESS'});
 assert.equal(calls,1);
 assert.equal(f.writes.length,0);
});

test('R2.1 resolution NOT_FOUND preserves confirmed work and continues without replay',async()=>{
 const f=fixture(),p=proposals([{actions:[save]},done]);
 const result=await run(f,{initialProposal:{actions:[ensure,{...save,parent:'缺失目录'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 assert.equal(p.contexts[0].progress[0].observations[0].status,'NOT_FOUND');
 assert.equal(created(f).length,2);
 assert.equal(result.messages.filter(message=>message.startsWith('已创建文件夹')).length,1);
 assert.equal(currentIn(f,result.refs.folderId).length,1);
});

test('R2.1 UNKNOWN in a later round retains the earlier journal and never retries',async()=>{
 const f=fixture();let calls=0;
 f.sdk.onCreate=async args=>{if(args.url)throw err('E_TIMEOUT','lost receipt');};
 await assert.rejects(run(f,{initialProposal:{actions:[ensure]},retryModel:true,
  nextProposal:()=>{calls++;return {actions:[save]};}}),error=>
 error.code==='E_OUTCOME_UNKNOWN'&&error.writeIssued===true&&
 error.partial.length===1&&typeof error.refs.folderId==='string');
 assert.equal(calls,1);
 assert.equal(created(f).length,2);
});

test('R2.1 a compound original goal is not reduced to filing alone',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
  {id:'book',title:'旧标题',url:page.url,parentId:'folder'});
 const p=proposals([{question:'请确认要修改的书签标题'}]);
 const result=await run(f,{goal:'把当前页面放入“测试收藏夹”，并将书签重命名为“新标题”',
  initialProposal:{complete:[{kind:'bookmark.inFolder',folder:'测试收藏夹',url:'$currentPage'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(f.writes.length,0);
});

test('R2.1 deadline expiry during trusted preflight prevents SDK dispatch',async()=>{
 const f=fixture();
 await assert.rejects(run(f,{initialProposal:{actions:[ensure]},nextProposal:()=>done,
  limits:{durationMs:10},beforeWrite:()=>new Promise(resolve=>setTimeout(resolve,30))}),
 error=>error.code==='E_AGENT_LIMIT'&&error.writeIssued===false);
 assert.equal(f.writes.length,0);
});

test('R2.1 task expiry after SDK dispatch never turns UNKNOWN into a retryable timeout',async()=>{
 const f=fixture();let calls=0;
 f.sdk.onCreate=async()=>{await new Promise(resolve=>setTimeout(resolve,30));throw err('E_TIMEOUT');};
 await assert.rejects(run(f,{initialProposal:{actions:[ensure]},limits:{durationMs:10},retryModel:true,
  nextProposal:()=>{calls++;return done;}}),
 error=>error.code==='E_OUTCOME_UNKNOWN'&&error.writeIssued===true);
 assert.equal(f.writes.length,1);assert.equal(calls,0);
});

test('R2.1 an unparsed explicit destination never falls back to the current folder',async()=>{
 const f=fixture();f.nodes.push({id:'book',title:'Example',url:page.url,parentId:'1'});
 const p=proposals([{question:'请明确目标目录'}]);
 const result=await run(f,{goal:'将当前页面收藏至测试收藏夹',
  initialProposal:{complete:[{kind:'bookmark.inFolder',folder:'$currentFolder',url:'$currentPage'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,false);assert.equal(f.writes.length,0);
});

test('R2.1 plain current-page filing still verifies the current folder',async()=>{
 const f=fixture();
 const result=await run(f,{goal:'收藏当前页面',
  initialProposal:{actions:[{...save,parent:'$currentFolder'}]},
  nextProposal:()=>({complete:[{kind:'folder.exists',folder:'$currentFolder'}]})});
 assert.equal(result.completed,true);assert.equal(currentIn(f,'1').length,1);
});

test('R2.1 create a named folder and file the current page completes after independent readback',async()=>{
 const f=fixture(),p=proposals([done]);
 const result=await run(f,{goal:'创建一个名为“测试收藏夹”的文件夹，并将当前页面收藏到该文件夹',
  initialProposal:{actions:[ensure,save]},nextProposal:p.nextProposal});
 assert.equal(result.completed,true);
 assert.equal(created(f).length,2);
 assert.equal(currentIn(f,result.refs.folderId).length,1);
 assert.match(result.summary,/当前网页.+测试收藏夹/);
});

test('R2.1 create-and-file accepts noun-first and explicitly repeated destination names',async()=>{
 for(const goal of ['新建文件夹“测试收藏夹”，然后收藏当前页面。',
  '创建测试收藏夹文件夹，并把当前网页放入“测试收藏夹”。']){
  const f=fixture(),p=proposals([done]);
  const result=await run(f,{goal,initialProposal:{actions:[ensure,save]},nextProposal:p.nextProposal});
  assert.equal(result.completed,true,goal);
  assert.equal(created(f).length,2);
  assert.equal(currentIn(f,result.refs.folderId).length,1);
 }
});

test('R2.1 folder existence alone cannot complete create-and-file',async()=>{
 const f=fixture(),p=proposals([
  {complete:[{kind:'folder.exists',folder:'测试收藏夹'}]},
  {question:'还需要收藏当前页面'}]);
 const result=await run(f,{goal:'创建“测试收藏夹”文件夹，并收藏当前页面',
  initialProposal:{actions:[ensure]},nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(created(f).length,1);
 assert.equal(p.contexts[1].progress.at(-1).observations[0].status,'NOT_MET');
});

test('R2.1 create-and-file cannot substitute another lastFolder for the named destination',async()=>{
 const f=fixture();f.nodes.push({id:'wanted',title:'测试收藏夹',parentId:'1'},
  {id:'other',title:'别的目录',parentId:'1'},
  {id:'book',title:'Example',url:page.url,parentId:'other'});
 const p=proposals([{question:'当前页面尚未放入测试收藏夹'}]);
 const result=await runBookmarkAgentLoop({
  goal:'创建“测试收藏夹”文件夹，并将当前页面收藏到该文件夹',
  initialProposal:done,service:f.service,context,refs:{folderId:'other'},
  nextProposal:p.nextProposal,beforeWrite:()=>{throw err('E_TEST_NO_WRITE');}});
 assert.equal(result.completed,false);
 assert.equal(p.contexts[0].progress[0].observations[0].status,'NOT_MET');
 assert.equal(f.writes.length,0);
});

test('R2.1 create-and-file with additional commands never claims the compound goal is complete',async()=>{
 for(const goal of ['创建“测试收藏夹”文件夹，并将当前页面收藏到该文件夹，再将书签重命名为“新标题”',
  '创建“测试收藏夹”文件夹，并删除旧书签，然后收藏当前页面',
  '创建“测试收藏夹”文件夹，并将当前页面收藏到别的目录']){
  const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
   {id:'book',title:'旧标题',url:page.url,parentId:'folder'});
  const p=proposals([{question:'请明确剩余目标'}]);
  const result=await run(f,{goal,
   initialProposal:{complete:[{kind:'bookmark.inFolder',folder:'测试收藏夹',url:'$currentPage'}]},
   nextProposal:p.nextProposal});
  assert.equal(result.completed,false,goal);
  assert.equal(f.writes.length,0);
 }
});

test('R2.1 create-and-file preserves literal folder names instead of treating them as paths',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
  {id:'book',title:'Example',url:page.url,parentId:'folder'});
 const p=proposals([{question:'请明确包含斜杠的目录名称'}]);
 const result=await run(f,{
  goal:'创建一个名为“书签栏 / 测试收藏夹”的文件夹，并将当前页面收藏到该文件夹',
  initialProposal:{complete:[{kind:'bookmark.inFolder',folder:'书签栏 / 测试收藏夹',url:'$currentPage'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(f.nodes.some(node=>node.title==='书签栏 / 测试收藏夹'),false);
 assert.equal(f.writes.length,0);
});

test('R2.1 multiline create-and-file never falls back to ignoring an additional rename',async()=>{
 const f=fixture();f.nodes.push({id:'folder',title:'测试收藏夹',parentId:'1'},
  {id:'book',title:'旧标题',url:page.url,parentId:'folder'});
 const p=proposals([{question:'请确认剩余改名要求'}]);
 const result=await run(f,{
  goal:'创建一个名为“测试收藏夹”的文件夹，并将当前页面收藏到测试收藏夹。\n并且将书签重命名为“新标题”',
  initialProposal:{complete:[{kind:'bookmark.inFolder',folder:'测试收藏夹',url:'$currentPage'}]},
  nextProposal:p.nextProposal});
 assert.equal(result.completed,false);
 assert.equal(f.nodes.find(node=>node.id==='book').title,'旧标题');
 assert.equal(f.writes.length,0);
});
