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
 const site={threadId:'thread_demo_01',messages:[],sendCalls:0,readCalls:0,failSend};
 const captured={status:'available',url,origin:'http://127.0.0.1:43111',
  tabId:77,windowId:1,frameId:0,documentId:activeDoc};
 const target={
  async refresh(){return captured;},capture(){return captured;},
  async revalidate(row){
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
 assert.match(page,/data\.messageId/);
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
