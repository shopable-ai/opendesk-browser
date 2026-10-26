// R1.3 targeted Node proof: real model + fixture, FAKE Chrome API / FAKE model replies.
// These tests NEVER claim a real Provider call, installed Chrome permission, or native DOM receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../../examples/sidebar-tools/ai-knowledge-answers/src/model.js';
import {createLocalKnowledgeTestRuntime} from '../../examples/sidebar-tools/ai-knowledge-answers/trusted/local-test-runtime.js';
import {createLocalKnowledgeDemoAdapter} from '../../examples/sidebar-tools/ai-knowledge-answers/trusted/local-test-adapter.js';

const base=new URL('../../examples/sidebar-tools/ai-knowledge-answers/fixtures/',import.meta.url);
const library=JSON.parse(readFileSync(new URL('sample-knowledge.json',base),'utf8'));
const cases=JSON.parse(readFileSync(new URL('answer-test-cases.json',base),'utf8')).cases;
const csv=readFileSync(new URL('sample-knowledge.csv',base),'utf8');
const model=globalThis.OpenDeskKnowledgeAnswersModel;
const etag='a'.repeat(64),url='http://127.0.0.1:43111/ai-knowledge-chat-demo.html';
const activeDoc='document-knowledge-r13-test-01';
const customer=(text,scope='',id='kb_msg_00000000-0000-4000-a000-000000000001')=>({
 messageId:id,threadId:'thread_demo_01',direction:'customer',scope,
 createdAt:'2026-10-26T00:00:00.000Z',replyTo:'',text
});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,description,limitMs=4500){
  const start=Date.now();
  while(Date.now()-start<limitMs){if(predicate())return;await wait(40);}
  assert.fail('Timeout waiting for '+description);
}

function lab({failSend=false,changeThread=false}={}){
 const site={threadId:'thread_demo_01',messages:[],sendCalls:0,readCalls:0,failSend,revalidateGate:null};
 const captured={status:'available',url,origin:'http://127.0.0.1:43111',
  tabId:77,windowId:1,frameId:0,documentId:activeDoc};
 const target={
  async refresh(){return captured;},capture(){return captured;},
  async revalidate(row){
   await site.revalidateGate?.();
   if(row.documentId!==activeDoc||row.tabId!==77||row.url!==url)
    throw Object.assign(new Error('old document'),{code:'E_DOCUMENT_STALE'});
   return captured;
  }
 };
 const api={scripting:{async executeScript({target:dest,world,func,args}){
   assert.deepEqual(dest,{tabId:77,documentIds:[activeDoc]});
   assert.equal(world,'ISOLATED');assert.equal(typeof func,'function');
   const request=args[0];
   const respond=result=>[{frameId:0,documentId:activeDoc,result}];
   if(request.operation==='detach')return respond({ok:true,threadId:site.threadId});
   if(request.operation==='read'){
     site.readCalls++;
     return respond({ok:true,threadId:site.threadId,messages:[...site.messages]});
   }
   if(request.operation==='send'){
     site.sendCalls++;
     if(site.failSend)return respond({ok:false,code:'E_KB_DEMO_OUTCOME_UNKNOWN'});
     if(request.threadId!==site.threadId)return respond({ok:false,code:'E_KB_DEMO_STALE'});
     if(site.messages.some(r=>r.direction==='agent'&&r.replyTo===request.replyTo))
       return respond({ok:false,code:'E_KB_DEMO_DUPLICATE'});
     const row={messageId:'kb_msg_00000000-0000-4000-b000-000000000002',
       threadId:site.threadId,direction:'agent',scope:'',text:request.answer,
       replyTo:request.replyTo,createdAt:'2026-10-26T00:00:01.000Z'};
     site.messages.push(row);
     return respond({ok:true,threadId:site.threadId,
       messageId:row.messageId,replyTo:row.replyTo,text:row.text});
   }
   throw Error('unexpected operation '+request.operation);
 }}};
 return {site,api,target};
}

test('R1.3 fixture: JSON/CSV encode identical 14 fictional knowledge entries',()=>{
 const a=model.library(library),b=model.parseCsv(csv);
 assert.equal(a.items.length,14);
 assert.deepEqual(b,a);
 assert.ok(model.size(a)<8192);
 assert.ok(a.items.some(row=>row.enabled===false));
});

test('R1.3 fixture: every lookup-stage case matches actual source IDs and grounded facts',()=>{
 const scenarios=cases.filter(row=>row.stage==='lookup');
 assert.ok(scenarios.length>=30);
 for(const item of scenarios){
   const got=model.lookup(library,{question:item.question,scope:item.scope});
   assert.equal(got.status,item.expectedStatus,item.caseId+' status');
   assert.deepEqual(got.sourceIds,item.expectedSourceIds,item.caseId+' refs');
   const grounded=library.items.filter(row=>got.sourceIds.includes(row.id)).map(row=>row.answer).join('\n');
   for(const fact of item.expectedFacts)
     assert.ok(got.answer.includes(fact)||grounded.includes(fact),item.caseId+' fact '+fact);
 }
 assert.ok(cases.filter(row=>row.stage==='e2e').length>=10);
});

test('R1.3 permission: timer/script without trusted Side Panel approval cannot start',async()=>{
 const {api,target,site}=lab();
 const testRuntime=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 await assert.rejects(testRuntime.start({event:{isTrusted:false}}),{code:'E_USER_GESTURE'});
 assert.equal(site.readCalls,0);
 testRuntime.dispose();
});

test('R1.3 DOM fixture: exact document binding required before reading real message candidates',async()=>{
 const {api,target,site}=lab();
 const adapter=createLocalKnowledgeDemoAdapter({api,currentPageTarget:target});
 await adapter.start();
 site.messages.push(customer('几天内可以退款'));
 const got=await adapter.read();
 assert.equal(got.messages[0].text,'几天内可以退款');
 assert.equal(got.messages[0].messageId,'kb_msg_00000000-0000-4000-a000-000000000001');
 await adapter.stop();
 await assert.rejects(adapter.read(),{code:'E_KB_DEMO_STOPPED'});
});

test('R1.3 inbound: exact fixed answer observed but NOT sent without extra approval',async()=>{
 const {api,target,site}=lab();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:false});
   site.messages.push(customer('几天内可以退款'));
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','fixed lookup');
   assert.equal(rt.snapshot().observed,1);
   const row=rt.snapshot().records[0];
   assert.equal(row.status,'ANSWERED_FIXED');
   assert.deepEqual(row.sourceIds,['qa_demo_refund']);
   assert.equal(site.sendCalls,0);
 }finally{rt.dispose();}
});

test('R1.3 inbound: explicit local fixed auto-send rechecks DOM receipt and prevents duplicates',async()=>{
 const {api,target,site}=lab();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   site.messages.push(customer('几天内可以退款'));
   await until(()=>rt.snapshot().records[0]?.status==='CONFIRMED','confirmed fixed send');
   assert.equal(rt.snapshot().records[0].status,'CONFIRMED');
   assert.equal(site.sendCalls,1);
   assert.equal(rt.snapshot().confirmed,1);
   await wait(920);
   assert.equal(rt.snapshot().observed,1);
   assert.equal(site.sendCalls,1);
 }finally{rt.dispose();}
});

test('R1.3 AI: local preapproved RAG creates a review draft, never silently sends it',async()=>{
 const {api,target,site}=lab();
 let aiCalls=0;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{},
   getProviderGeneration:()=>4,
   callAI:async()=>{
     aiCalls++;
     return {status:'REVIEW_REQUIRED',answer:'演示规则：符合条件的实物订单可在签收后 7 天内申请退款。',
       sourceIds:['qa_demo_refund']};
   }});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   const context=rt.approvalContext();
   rt.approveAI({...context,providerGeneration:4,expiresAt:Date.now()+120000});
   site.messages.push(customer('退款需要几天'));
   await until(()=>rt.snapshot().records[0]?.status==='REVIEW_REQUIRED','review draft');
   assert.equal(aiCalls,1);assert.equal(site.sendCalls,0);
   const row=rt.snapshot().records[0];
   assert.equal(row.status,'REVIEW_REQUIRED');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:row.messageId}),{code:'E_KB_REVIEW'});
   const receipt=await rt.confirm({event:{isTrusted:true},messageId:row.messageId,reviewApproved:true});
   assert.equal(receipt.status,'CONFIRMED');
   assert.equal(site.sendCalls,1);
 }finally{rt.dispose();}
});

test('R1.3 identity: switching thread revokes this local fixture session',async()=>{
 const {api,target,site}=lab();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true}});
   site.threadId='thread_demo_02';
   await until(()=>rt.snapshot().mode==='idle','thread-switch stop');
   assert.equal(rt.snapshot().mode,'idle');
   assert.match(rt.snapshot().message,/切换/);
 }finally{rt.dispose();}
});

test('R1.3 unknown send outcome is terminal, cannot be called again without new review',async()=>{
 const {api,target,site}=lab({failSend:true});
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(customer('几天内可以退款'));
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','sendable fixed answer');
   const id=site.messages[0].messageId;
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id}));
   assert.equal(rt.snapshot().records[0].status,'UNKNOWN');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id}),{code:'E_KB_TEST_NO_ANSWER'});
   assert.equal(site.sendCalls,1);
 }finally{rt.dispose();}
});

test('R1.3 real local page must not hide an AI implementation',()=>{
 const page=readFileSync(new URL('../../examples/tasks/ai-knowledge-chat-demo.js',import.meta.url),'utf8');
 assert.match(page,/MutationObserver/);
 assert.match(page,/\.dataset\.messageId\s*=/);
 assert.match(page,/setInterval\(tick/);
 assert.match(page,/button\.addEventListener/);
 assert.doesNotMatch(page,/OpenDeskKnowledgeAnswersModel|createBusinessConversation|requestStructured/);
});

test('R1.3 send fence: two rapid confirmations cannot click the same reply twice while ETag read is pending',async()=>{
 const {api,target,site}=lab();
 const deferred=[];let holdReads=false;
 const readLibrary=()=>holdReads?new Promise(resolve=>deferred.push(resolve)):{value:library,etag};
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary,assertLive:()=>{}});
 const inbound=customer('几天内可以退款');
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','send fence fixed lookup');
   holdReads=true;
   const first=rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
   const duplicate=rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
   await assert.rejects(duplicate,{code:'E_KB_TEST_SEND_BUSY'});
   assert.equal(deferred.length,1,'the second click must not even start a storage read');
   assert.equal(site.sendCalls,0,'no click before the original storage read resolves');
   deferred.shift()({value:library,etag});
   const receipt=await first;
   assert.equal(receipt.status,'CONFIRMED');
   assert.equal(site.sendCalls,1);
   assert.equal(rt.snapshot().records[0].status,'CONFIRMED');
 }finally{
   for(const unblock of deferred)unblock({value:library,etag});
   rt.dispose();
 }
});

for(const resumeBeforeRead of [false,true]){
 test(`R1.3 pause: pending fixed confirmation cannot send after pause${resumeBeforeRead?' and immediate resume':''}`,async()=>{
  const {api,target,site}=lab();
  let releaseRead,holdReads=false,pending;
  const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
    readLibrary:()=>holdReads?new Promise(resolve=>{releaseRead=resolve;}):{value:library,etag},
    assertLive:()=>{}});
  const inbound=customer('几天内可以退款');
  try{
    await rt.start({event:{isTrusted:true}});
    site.messages.push(inbound);
    await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','pausable fixed answer');
    holdReads=true;
    pending=rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
    const rejected=assert.rejects(pending,{code:'E_KB_TEST_PAUSED'});
    assert.equal(typeof releaseRead,'function');
    assert.equal(site.sendCalls,0);
    rt.pause();
    if(resumeBeforeRead)rt.resume();
    holdReads=false;releaseRead({value:library,etag});
    await rejected;
    assert.equal(site.sendCalls,0,'pausing retires the old confirmation even after resume');
    assert.equal(rt.snapshot().records[0].status,'ANSWERED_FIXED');
    rt.resume();
    const receipt=await rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
    assert.equal(receipt.status,'CONFIRMED','a fresh trusted click can send after resume');
    assert.equal(site.sendCalls,1,'only the fresh confirmation sends');
  }finally{
    holdReads=false;releaseRead?.({value:library,etag});
    await pending?.catch(()=>{});rt.dispose();
  }
 });
}

test('R1.3 pause: automatic AI permission is revoked while fixed permission stays independent',async()=>{
 const {api,target,site}=lab();
 let aiCalls=0,stoppedAI=0;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{},
   onStopAI:()=>{stoppedAI++;},getProviderGeneration:()=>4,
   callAI:async()=>{aiCalls++;return {status:'REVIEW_REQUIRED',answer:'退款到账时长需要人工核查。',
     sourceIds:['qa_demo_refund']};}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   rt.approveAI({...rt.approvalContext(),providerGeneration:4,expiresAt:Date.now()+120000});
   rt.pause();
   assert.equal(rt.snapshot().autoAI,false,'pause clears the automatic AI permission shown to the user');
   assert.equal(stoppedAI,1,'pause invokes existing consumer cancellation and grant revocation');
   assert.equal(rt.snapshot().autoSendFixed,true,'fixed reply consent is a separate permission');
   rt.resume();
   site.messages.push(customer('退款需要几天'));
   await until(()=>['RETRIEVED_ONLY','REVIEW_REQUIRED'].includes(rt.snapshot().records[0]?.status),
     'post-resume non-exact question');
   assert.equal(aiCalls,0,'resume must not reuse the old automatic AI grant');
   assert.equal(rt.snapshot().records[0].status,'RETRIEVED_ONLY');
   rt.approveAI({...rt.approvalContext(),providerGeneration:4,expiresAt:Date.now()+120000});
   site.messages.push(customer('退款需要几天','','kb_msg_00000000-0000-4000-a000-000000000003'));
   await until(()=>rt.snapshot().records[1]?.status==='REVIEW_REQUIRED','newly approved AI draft');
   assert.equal(aiCalls,1);assert.equal(site.sendCalls,0,'new AI drafts still require human review');
 }finally{rt.dispose();}
});

test('R1.3 pause: delayed retrieval cannot start AI using a new post-resume grant',async()=>{
 const {api,target,site}=lab();
 let releaseRead,holdReads=false,aiCalls=0;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:()=>holdReads?new Promise(resolve=>{releaseRead=resolve;}):{value:library,etag},
   assertLive:()=>{},callAI:async()=>{aiCalls++;return {status:'REVIEW_REQUIRED',
     answer:'退款到账时长需要人工核查。',sourceIds:['qa_demo_refund']};}});
 try{
   await rt.start({event:{isTrusted:true}});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   holdReads=true;site.messages.push(customer('退款需要几天'));
   await until(()=>typeof releaseRead==='function','pending inbound knowledge read');
   rt.pause();rt.resume();
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   holdReads=false;releaseRead({value:library,etag});
   await wait(80);
   assert.equal(aiCalls,0,'a resumed grant does not revive pre-pause analysis');
   assert.equal(rt.snapshot().records[0].status,'STALE');
   assert.equal(site.sendCalls,0);
 }finally{holdReads=false;releaseRead?.({value:library,etag});rt.dispose();}
});

test('R1.3 pause: an in-flight AI response is discarded after pause and resume',async()=>{
 const {api,target,site}=lab();
 let releaseAI;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{},
   callAI:()=>new Promise(resolve=>{releaseAI=resolve;})});
 try{
   await rt.start({event:{isTrusted:true}});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   site.messages.push(customer('退款需要几天'));
   await until(()=>typeof releaseAI==='function','in-flight AI request');
   rt.pause();rt.resume();
   releaseAI({status:'REVIEW_REQUIRED',answer:'退款到账时长需要人工核查。',sourceIds:['qa_demo_refund']});
   await wait(80);
   assert.equal(rt.snapshot().records[0].status,'STALE','a retired AI request cannot deliver a late draft');
   assert.equal(rt.snapshot().records[0].answer,'');
   assert.equal(site.sendCalls,0);
 }finally{releaseAI?.({status:'INVALID_AI'});rt.dispose();}
});

test('R1.3 pause: a send already started still confirms its independent receipt',async()=>{
 const {api,target,site}=lab();
 const execute=api.scripting.executeScript;
 let releaseReceipt,pending;
 api.scripting.executeScript=async options=>{
   const result=await execute(options);
   if(options.args[0].operation==='send')
     await new Promise(resolve=>{releaseReceipt=resolve;});
   return result;
 };
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 const inbound=customer('几天内可以退款');
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','fixed answer before send');
   pending=rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
   await until(()=>typeof releaseReceipt==='function','send started before pause');
   rt.pause();
   assert.equal(site.sendCalls,1);assert.equal(rt.snapshot().records[0].status,'SENDING');
   releaseReceipt();
   const receipt=await pending;
   assert.equal(receipt.status,'CONFIRMED');
   assert.equal(rt.snapshot().records[0].status,'CONFIRMED');
   assert.equal(rt.snapshot().mode,'paused');
   assert.equal(site.sendCalls,1);
   rt.resume();
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:inbound.messageId}),
     {code:'E_KB_TEST_NO_ANSWER'});
 }finally{releaseReceipt?.();await pending?.catch(()=>{});rt.dispose();}
});

test('R1.4 pause: pre-click revalidation cannot dispatch a new website send after pause',async()=>{
 const {api,target,site}=lab();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 const inbound=customer('几天内可以退款');
 let releaseGate,pending;
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','fixed result before delayed page dispatch');
   let entered=false;
   const gate=new Promise(resolve=>{releaseGate=resolve;});
   site.revalidateGate=()=>{entered=true;return gate;};
   pending=rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
   await until(()=>entered,'document revalidation before a website click');
   assert.equal(site.sendCalls,0);
   rt.pause();
   site.revalidateGate=null;releaseGate();
   await assert.rejects(pending,{code:'E_KB_TEST_PAUSED'});
   assert.equal(site.sendCalls,0,'the pending click must never be dispatched');
   assert.equal(rt.snapshot().records[0].status,'ANSWERED_FIXED','pre-click pause is known not to have sent');
   rt.resume();
   const receipt=await rt.confirm({event:{isTrusted:true},messageId:inbound.messageId});
   assert.equal(receipt.status,'CONFIRMED');
   assert.equal(site.sendCalls,1,'only the newly approved send clicked');
 }finally{
   site.revalidateGate=null;releaseGate?.();
   await pending?.catch(()=>{});rt.dispose();
 }
});

test('R1.4 manual AI: attached draft must match original customer, session, ETag and candidate source',async()=>{
 const {api,target,site}=lab();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{},getProviderGeneration:()=>2});
 const inbound=customer('退款需要几天');
 const proposal={status:'REVIEW_REQUIRED',answer:'演示规则：签收后 7 天内可以申请退款。',
   sourceIds:['qa_demo_refund']};
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='RETRIEVED_ONLY','candidate for manual AI');
   const original=rt.select(inbound.messageId);
   assert.throws(()=>rt.attach(inbound.messageId,proposal,'b'.repeat(64),original.testIdentity),
     {code:'E_KB_TEST_ATTACH'},'different ETag cannot attach');
   assert.throws(()=>rt.attach(inbound.messageId,{...proposal,sourceIds:['qa_forged']},etag,original.testIdentity),
     {code:'E_KB_TEST_ATTACH'},'a fabricated candidate cannot attach');
   assert.throws(()=>rt.attach(inbound.messageId,proposal,etag,
     {...original.testIdentity,documentId:'old-document'}),{code:'E_KB_TEST_ATTACH'});
   rt.pause();rt.resume();
   assert.throws(()=>rt.attach(inbound.messageId,proposal,etag,original.testIdentity),
     {code:'E_KB_TEST_ATTACH'},'a prior pause generation cannot attach an old manual result');
   const fresh=rt.select(inbound.messageId);
   rt.attach(inbound.messageId,proposal,etag,fresh.testIdentity);
   assert.equal(rt.snapshot().records[0].status,'REVIEW_REQUIRED');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:inbound.messageId}),
     {code:'E_KB_REVIEW'});
   assert.equal(site.sendCalls,0);
   const receipt=await rt.confirm({event:{isTrusted:true},messageId:inbound.messageId,reviewApproved:true});
   assert.equal(receipt.status,'CONFIRMED');
   assert.equal(receipt.replyTo,inbound.messageId);
   assert.equal(site.sendCalls,1);
 }finally{rt.dispose();}
});

test('R1.4 trusted UI: full actual answer and the linked website receipt must be visible',()=>{
 const workspace=readFileSync(new URL('../../examples/sidebar-tools/ai-knowledge-answers/trusted/Workspace.jsx',
   import.meta.url),'utf8');
 assert.match(workspace,/state\.result\.answer/,'show answer, not a field named question');
 assert.doesNotMatch(workspace,/<p>\{state\.result\.question\}<\/p>/);
 assert.match(workspace,/row\.replyMessageId/);
 assert.match(workspace,/row\.sourceIds\.join/);
});

test('R1.5 adapter: a retired start failure cannot clear the replacement document binding',async()=>{
 const {api,target,site}=lab();
 const execute=api.scripting.executeScript;
 let releaseOld,first=true,pending;
 api.scripting.executeScript=async options=>{
   if(options.args[0].operation==='read'&&first){
     first=false;
     await new Promise(resolve=>{releaseOld=resolve;});
     throw Error('retired read failed');
   }
   return execute(options);
 };
 const adapter=createLocalKnowledgeDemoAdapter({api,currentPageTarget:target});
 try{
   pending=adapter.start();
   const rejected=assert.rejects(pending,{code:'E_KB_DEMO_INJECT'});
   await until(()=>typeof releaseOld==='function','first pending document read');
   await adapter.stop();
   await adapter.start();
   releaseOld();await rejected;
   assert.equal(adapter.target?.documentId,activeDoc,'old cleanup must not retire the new start');
   const current=await adapter.read();
   assert.equal(current.threadId,'thread_demo_01');
   assert.equal(site.sendCalls,0);
 }finally{releaseOld?.();await pending?.catch(()=>{});await adapter.stop();}
});

test('R1.5 adapter: stop during target refresh cannot resurrect the retired binding',async()=>{
 const {api,target,site}=lab();
 let releaseRefresh,pending;
 const refresh=target.refresh;
 target.refresh=()=>new Promise(resolve=>{releaseRefresh=resolve;});
 const adapter=createLocalKnowledgeDemoAdapter({api,currentPageTarget:target});
 try{
   pending=adapter.start();
   const rejected=assert.rejects(pending,{code:'E_KB_DEMO_STOPPED'});
   await adapter.stop();
   target.refresh=refresh;releaseRefresh();await rejected;
   assert.equal(adapter.target,null);
   assert.equal(site.readCalls,0,'a retired start cannot even read the page');
   await adapter.start();
   assert.equal(adapter.target.documentId,activeDoc);
 }finally{releaseRefresh?.();await pending?.catch(()=>{});await adapter.stop();}
});

for(const changedKnowledge of [false,true]){
 test(`R1.5 fixed auto-send: ${changedKnowledge?'changed knowledge is stale':'failed pre-send read is visible'}`,async()=>{
   const {api,target,site}=lab();
   let reads=0;
   const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
     readLibrary:async()=>{
       reads++;
       if(reads>=3){
         if(changedKnowledge)return {value:library,etag:'b'.repeat(64)};
         throw Object.assign(new Error('knowledge read unavailable'),{code:'E_KB_STORAGE_READ'});
       }
       return {value:library,etag};
     },assertLive:()=>{}});
   try{
     await rt.start({event:{isTrusted:true},autoSendFixed:true});
     site.messages.push(customer('几天内可以退款'));
     await until(()=>reads>=3,'fixed auto-send final knowledge check');
     await wait(40);
     const row=rt.snapshot().records[0];
     assert.equal(row.status,changedKnowledge?'STALE':'ERROR');
     assert.match(row.message,changedKnowledge?/E_KB_STALE/:/E_KB_STORAGE_READ/);
     assert.equal(rt.snapshot().errors,1);
     assert.equal(site.sendCalls,0);
     await wait(920);
     assert.equal(reads,3,'failed auto-send is not retried');
     assert.equal(site.sendCalls,0);
   }finally{rt.dispose();}
 });
}

test('R3.1 UNKNOWN after a real site click can be confirmed by a separate read-only receipt without another send',async()=>{
 const {api,target,site}=lab();
 const execute=api.scripting.executeScript;
 api.scripting.executeScript=async options=>{
   const actual=await execute(options);
   // The site handler DID send; only the executeScript receipt was lost.
   if(options.args[0].operation==='send')
     return [{frameId:0,documentId:activeDoc,
       result:{ok:false,code:'E_KB_DEMO_OUTCOME_UNKNOWN'}}];
   return actual;
 };
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 const inbound=customer('几天内可以退款');
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','recoverable fixed answer');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:inbound.messageId}),
     {code:'E_KB_DEMO_OUTCOME_UNKNOWN'});
   assert.equal(rt.snapshot().records[0].status,'UNKNOWN');
   assert.equal(site.sendCalls,1);
   const reads=site.readCalls;
   const receipt=await rt.reconcile({event:{isTrusted:true},messageId:inbound.messageId});
   assert.equal(receipt.status,'CONFIRMED');
   assert.equal(receipt.readOnly,true);
   assert.equal(receipt.replyTo,inbound.messageId);
   assert.equal(rt.snapshot().records[0].replyMessageId,receipt.messageId);
   assert.equal(rt.snapshot().confirmed,1);
   assert.ok(site.readCalls>reads,'recovery uses another website DOM read');
   assert.equal(site.sendCalls,1,'read-only recovery cannot click Send again');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:inbound.messageId}),
     {code:'E_KB_TEST_NO_ANSWER'});
 }finally{rt.dispose();}
});

test('R3.1 UNKNOWN remains terminal when no receipt or multiple replies are present, including pause',async()=>{
 const {api,target,site}=lab({failSend:true});
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 const inbound=customer('几天内可以退款');
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','unknown fixed answer');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:inbound.messageId}));
   assert.equal(rt.snapshot().records[0].status,'UNKNOWN');
   rt.pause(); // A read-only reconciliation is safe while sending is paused.
   const missing=await rt.reconcile({event:{isTrusted:true},messageId:inbound.messageId});
   assert.equal(missing.status,'UNKNOWN');
   const answer=rt.snapshot().records[0].answer;
   const base={threadId:inbound.threadId,direction:'agent',scope:'',replyTo:inbound.messageId,
     text:answer,createdAt:'2026-10-26T00:01:00.000Z'};
   site.messages.push({...base,messageId:'kb_msg_00000000-0000-4000-b000-000000000003'},
     {...base,messageId:'kb_msg_00000000-0000-4000-b000-000000000004'});
   const duplicate=await rt.reconcile({event:{isTrusted:true},messageId:inbound.messageId});
   assert.equal(duplicate.status,'UNKNOWN');
   assert.equal(rt.snapshot().records[0].status,'UNKNOWN');
   assert.equal(rt.snapshot().errors,1);
   assert.equal(site.sendCalls,1,'neither reconciliation performs a second send');
 }finally{rt.dispose();}
});

test('R3.1 read-only receipt recovery requires trusted click and an UNKNOWN original message',async()=>{
 const {api,target,site}=lab();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:library,etag}),assertLive:()=>{}});
 const inbound=customer('几天内可以退款');
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(inbound);
   await until(()=>rt.snapshot().records[0]?.status==='ANSWERED_FIXED','fixed original');
   assert.throws(()=>rt.reconcile({event:{isTrusted:false},messageId:inbound.messageId}),
     {code:'E_USER_GESTURE'});
   await assert.rejects(rt.reconcile({event:{isTrusted:true},messageId:inbound.messageId}),
     {code:'E_KB_TEST_RECONCILE'});
   rt.stop('explicit stop');
   assert.throws(()=>rt.reconcile({event:{isTrusted:true},messageId:inbound.messageId}),
     {code:'E_KB_TEST_STOPPED'});
   assert.equal(site.sendCalls,0);
 }finally{rt.dispose();}
});

test('R3.1 trusted source owns UNKNOWN read-only UI and Host route; sandbox package cannot send',()=>{
 const trusted=new URL('../../examples/sidebar-tools/ai-knowledge-answers/trusted/',import.meta.url);
 const ui=readFileSync(new URL('Workspace.jsx',trusted),'utf8');
 const host=readFileSync(new URL('host.js',trusted),'utf8');
 const runtime=readFileSync(new URL('local-test-runtime.js',trusted),'utf8');
 assert.match(ui,/只读核对网页回执/);
 assert.match(host,/reconcileLocalPage/);
 assert.match(runtime,/return reconcileUnknown\(session,messageId\)/);
 assert.doesNotMatch(runtime.match(/async function reconcileUnknown[\s\S]*?async function analyze/)?.[0]||'',
   /adapter\.send\(/,'read-only recovery never calls send');
});

