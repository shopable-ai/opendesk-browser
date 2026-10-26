// R3.2. Pure source-bound planner and fake-Chrome contract tests.
// These are not real Chrome, native Provider or third-party website evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../../examples/sidebar-tools/ai-knowledge-answers/src/model.js';
import {planCustomerMessage,splitCustomerIntents,GREETING_REPLY} from
  '../../examples/sidebar-tools/ai-knowledge-answers/trusted/multi-intent.js';
import {createLocalKnowledgeTestRuntime} from
  '../../examples/sidebar-tools/ai-knowledge-answers/trusted/local-test-runtime.js';
import {createKnowledgeAnswerConsumer} from
  '../../examples/sidebar-tools/ai-knowledge-answers/trusted/ai-request.js';

const lib=JSON.parse(readFileSync(new URL(
  '../../examples/sidebar-tools/ai-knowledge-answers/fixtures/sample-knowledge.json',import.meta.url),'utf8'));
const model=globalThis.OpenDeskKnowledgeAnswersModel,etag='a'.repeat(64);
const plan=(q,scope='')=>planCustomerMessage(model,lib,{question:q,scope});
const mixed='你好！退款期限是多少？何时发货？可以上门安装吗？';
const id='kb_msg_00000000-0000-4000-a000-000000000021',threadId='thread_demo_01';
const readOnlyBound={status:'available',url:'http://127.0.0.1:43111/ai-knowledge-chat-demo.html',
 origin:'http://127.0.0.1:43111',tabId:22,windowId:1,frameId:0,documentId:'r32-document-01'};
const customer=text=>({messageId:id,threadId,direction:'customer',scope:'',
 createdAt:'2026-10-26T00:00:00.000Z',replyTo:'',text});
async function until(check,label){
 for(let n=0;n<110;n++){if(check())return;await new Promise(r=>setTimeout(r,35));}
 assert.fail('timeout: '+label);
}
function fakePage(){
 const site={messages:[],sendCalls:0,readCalls:0,threadId};
 const target={async refresh(){return readOnlyBound;},capture(){return readOnlyBound;},
   async revalidate(bound){assert.equal(bound.documentId,readOnlyBound.documentId);return bound;}};
 const api={scripting:{async executeScript({target:dest,world,func,args}){
   assert.equal(world,'ISOLATED');assert.equal(dest.tabId,22);
   assert.deepEqual(dest.documentIds,['r32-document-01']);
   assert.equal(typeof func,'function');
   const request=args[0];
   const reply=receipt=>[{frameId:0,documentId:'r32-document-01',result:receipt}];
   if(request.operation==='detach')return reply({ok:true,threadId});
   if(request.operation==='read'){site.readCalls++;return reply({ok:true,threadId:site.threadId,messages:[...site.messages]});}
   if(request.operation==='send'){
     site.sendCalls++;
     if(site.messages.some(x=>x.direction==='agent'&&x.replyTo===request.replyTo))
       return reply({ok:false,code:'E_KB_DEMO_DUPLICATE'});
     const record={messageId:'kb_msg_00000000-0000-4000-b000-000000000022',
       threadId:site.threadId,direction:'agent',scope:'',createdAt:'',replyTo:request.replyTo,
       text:request.answer};
     site.messages.push(record);
     return reply({ok:true,threadId:site.threadId,messageId:record.messageId,
       replyTo:record.replyTo,text:record.text});
   }
   throw Error('unknown fake script operation');
 }}};
 return {site,api,target};
}

test('R3.2 greeting is safe and never needs Provider or KB sources',()=>{
 const r=plan('你好！');
 assert.equal(r.status,'GREETING_ONLY');
 assert.equal(r.answer,GREETING_REPLY);
 assert.deepEqual(r.sourceIds,[]);
 assert.deepEqual(r.parts,[]);
 assert.equal(r.needsHuman,true);
});
test('R3.2 greeting plus one fixed question is one reviewed reply, not two sends',()=>{
 const r=plan('你好，请问何时发货？');
 assert.equal(r.hasGreeting,true);
 assert.equal(r.parts.length,1);
 assert.equal(r.parts[0].status,'ANSWERED_FIXED');
 assert.deepEqual(r.sourceIds,['qa_demo_delivery']);
 assert.equal(r.status,'COMPOSITE_REVIEW_REQUIRED');
 assert.match(r.answer,/您好/);
 assert.ok(!r.answer.includes(GREETING_REPLY));
});
test('R3.2 two known questions and one unknown have independent proven sources',()=>{
 const r=plan(mixed);
 assert.equal(r.status,'PARTIAL_REVIEW_REQUIRED');
 assert.equal(r.answeredCount,2);assert.equal(r.reviewCount,1);
 assert.deepEqual(r.parts.map(p=>p.question),
   ['退款期限是多少','何时发货','可以上门安装吗']);
 assert.deepEqual(r.parts.map(p=>p.sourceIds),
   [['qa_demo_refund'],['qa_demo_delivery'],[]]);
 assert.deepEqual(r.sourceIds,['qa_demo_refund','qa_demo_delivery']);
 assert.ok(r.answer.includes('7 天'));assert.ok(r.answer.includes('48 小时'));
 assert.match(r.answer,/上门安装/);
 assert.doesNotMatch(r.answer,/提供上门安装|支持上门安装/);
 assert.equal(r.needsHuman,true);
});
test('R3.2 one answer and one unknown never convert retrieval candidates into facts',()=>{
 const r=plan('退款期限是多少？可以上门安装吗？');
 assert.equal(r.answeredCount,1);assert.equal(r.reviewCount,1);
 assert.deepEqual(r.sourceIds,['qa_demo_refund']);
 assert.deepEqual(r.parts[1].sourceIds,[]);
});
test('R3.2 ambiguous refund timeframe asks for dimension, not misleading numeric promise',()=>{
 const r=plan('退款要多久');
 assert.equal(r.status,'CLARIFICATION_REQUIRED');
 assert.equal(r.answer,'');assert.deepEqual(r.sourceIds,[]);
 assert.equal(r.parts[0].reason,'REFUND_TIME_AMBIGUOUS');
 assert.equal(plan('退款期限是多少').status,'ANSWERED_FIXED');
});
test('R3.2 personal order and business operations require actual authorized API',()=>{
 for(const question of ['我的订单现在到哪了？','帮我取消订单','查一下订单状态']){
   const r=plan(question);
   assert.equal(r.status,'HUMAN_REQUIRED',question);
   assert.equal(r.answer,'');assert.deepEqual(r.sourceIds,[]);
 }
 assert.equal(plan('订单通常几天发货').status,'ANSWERED_FIXED');
});
test('R3.2 cautious split deduplicates questions, does not split comma conditions',()=>{
 assert.deepEqual(splitCustomerIntents('退款期限是多少？退款期限是多少？何时发货？').questions,
   ['退款期限是多少','何时发货']);
 assert.deepEqual(splitCustomerIntents('如果我周末申请退款，什么时候到账？').questions,
   ['如果我周末申请退款,什么时候到账']);
 const r=plan('退款期限是多少？何时发货？可以安装吗？发票怎么开？价格多少？');
 assert.equal(r.status,'OVER_LIMIT');assert.equal(r.answer,'');
});
test('R3.2 implicit multi-topic or mixed refund stages require clarification',()=>{
 for(const message of [
   '退款期限是多少，何时发货',
   '退款期限和审核时长都是多少',
   '如果签收后退款，发货流程还能继续吗'
 ]){
   const result=plan(message);
   assert.equal(result.status,'CLARIFICATION_REQUIRED',message);
   assert.equal(result.answer,'',message);
   assert.deepEqual(result.sourceIds,[],message);
 }
});
test('R3.2 semantic candidates never expand beyond original Provider model.lookup IDs',()=>{
 for(const question of ['退款期限需要几天','什么时候发货','订单物流进度多长时间']){
   const result=plan(question);
   const original=model.lookup(lib,{question});
   const allowed=new Set(original.sourceIds);
   for(const id of result.sourceIds)assert.ok(allowed.has(id),question+' '+id);
   assert.deepEqual(result.parts.flatMap(x=>x.sourceIds),[]);
 }
});
test('R3.2 original aliases and semantic candidates remain distinct',()=>{
 assert.equal(plan('几天内可以退款').status,'ANSWERED_FIXED');
 const r=plan('退款期限需要几天');
 assert.equal(r.status,'RETRIEVED_ONLY');
 assert.equal(r.answer,'');
 assert.ok(r.sourceIds.includes('qa_demo_refund'));
 assert.deepEqual(r.parts[0].sourceIds,[]);
});
test('R3.2 changing or disabling knowledge removes its answer and source',()=>{
 const changed=model.remove(lib,'qa_demo_delivery');
 const r=planCustomerMessage(model,changed,{question:mixed});
 assert.equal(r.answeredCount,1);
 assert.ok(!r.sourceIds.includes('qa_demo_delivery'));
 assert.notEqual(r.answer,plan(mixed).answer);
});
test('R3.2 original Shared Provider receives only allowlisted intent sources',async()=>{
 let calls=0,delivered=null;
 const conversation={
   cancel:async()=>{},
   request:async input=>{
     calls++;delivered=input;
     return {authorization:{assertWrite:async()=>{},release:()=>{}},
       proposal:{answer:'演示规则：符合条件的实物订单可在签收后 7 天内申请退款。',
         sourceIds:['qa_demo_refund'],needsHuman:true}};
   }
 };
 const consumer=createKnowledgeAnswerConsumer({
   model,conversation,readLibrary:async()=>({value:lib,etag}),assertIdentity:()=>{}});
 try{
   await consumer.refresh();
   assert.throws(()=>consumer.request({request:'退款期限需要几天',
     event:{isTrusted:true},sourceIdAllowlist:['qa_demo_payment']}),
     {code:'E_KB_REFERENCES'});
   assert.equal(calls,0,'unowned refs may not reach permission or Provider');
   const answer=await consumer.request({request:'退款期限需要几天',
     event:{isTrusted:true},sourceIdAllowlist:['qa_demo_refund']});
   assert.equal(calls,1);
   assert.deepEqual(delivered.context.references.map(x=>x.id),['qa_demo_refund']);
   assert.equal(answer.status,'REVIEW_REQUIRED');
   assert.deepEqual(answer.sourceIds,['qa_demo_refund']);
   assert.equal(answer.needsHuman,true);
 }finally{consumer.dispose();}
});
test('R3.2 fixture customer receives a single reviewed DOM reply; no automatic multi-send',async()=>{
 const {site,api,target}=fakePage();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   site.messages.push(customer(mixed));
   await until(()=>rt.snapshot().records[0]?.status==='PARTIAL_REVIEW_REQUIRED','multi review');
   const row=rt.snapshot().records[0];
   assert.equal(row.answeredCount,2);assert.equal(row.reviewCount,1);
   assert.deepEqual(row.parts.map(x=>x.sourceIds),[['qa_demo_refund'],['qa_demo_delivery'],[]]);
   assert.equal(site.sendCalls,0,'auto fixed permit must not auto-send mixed intent');
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id}),{code:'E_KB_REVIEW'});
   assert.equal(site.sendCalls,0);
   const receipt=await rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true});
   assert.equal(receipt.status,'CONFIRMED');assert.equal(site.sendCalls,1);
   assert.equal(rt.snapshot().records[0].replyMessageId,receipt.messageId);
   assert.equal(site.messages.filter(x=>x.direction==='agent').length,1);
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true}),
     {code:'E_KB_TEST_NO_ANSWER'});
 }finally{rt.dispose();}
});
test('R3.2 polite prefix retains one exact fixed answer and one guarded send',async()=>{
 const {site,api,target}=fakePage();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   site.messages.push(customer('请问退款期限是多少？'));
   await until(()=>rt.snapshot().records[0]?.status==='CONFIRMED','polite fixed send');
   const row=rt.snapshot().records[0];
   assert.equal(row.status,'CONFIRMED');
   assert.deepEqual(row.sourceIds,['qa_demo_refund']);
   assert.equal(site.sendCalls,1);
 }finally{rt.dispose();}
});
test('R3.2 greeting never calls AI or auto-sends; trusted review is required',async()=>{
 const {site,api,target}=fakePage();let aiCalls=0;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{},
   callAI:async()=>{aiCalls++;return null;}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   site.messages.push(customer('你好！'));
   await until(()=>rt.snapshot().records[0]?.status==='GREETING_ONLY','greeting');
   assert.equal(aiCalls,0);assert.equal(site.sendCalls,0);
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id}),{code:'E_KB_REVIEW'});
   const receipt=await rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true});
   assert.equal(receipt.status,'CONFIRMED');assert.equal(site.sendCalls,1);
   assert.equal(site.messages[1].text,GREETING_REPLY);
 }finally{rt.dispose();}
});
test('R3.2 two semantic questions use bounded per-question AI and one human-reviewed reply',async()=>{
 const {site,api,target}=fakePage();const calls=[];
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{},
   getProviderGeneration:()=>9,
   callAI:async({question})=>{
     calls.push(question);
     if(question.includes('发票'))return {status:'REVIEW_REQUIRED',
       answer:'演示规则：订单完成后可在订单详情申请电子发票。',
       sourceIds:['qa_demo_invoice']};
     return {status:'REVIEW_REQUIRED',
       answer:'演示规则：发货后可在订单详情查看物流单号和进度。',
       sourceIds:['qa_demo_tracking']};
   }});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   site.messages.push(customer('如何申请电子发票？我能在哪看物流？'));
   await until(()=>rt.snapshot().records[0]?.status==='MULTI_REVIEW_REQUIRED',
     'two AI-grounded separate question drafts');
   const row=rt.snapshot().records[0];
   assert.deepEqual(calls,['如何申请电子发票','我能在哪看物流']);
   assert.deepEqual(row.parts.map(p=>p.sourceIds),[['qa_demo_invoice'],['qa_demo_tracking']]);
   assert.equal(row.answeredCount,2);
   assert.equal(row.reviewCount,0);
   assert.equal(site.sendCalls,0);
   assert.match(row.answer,/发票/);assert.match(row.answer,/物流/);
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id}),
     {code:'E_KB_REVIEW'});
   await rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true});
   assert.equal(site.sendCalls,1,'both AI drafts must share a single webpage reply');
 }finally{rt.dispose();}
});
test('R3.2 cross-topic AI citations cannot be attached to another question',async()=>{
 const {site,api,target}=fakePage();let aiCalls=0;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{},
   callAI:async()=>{aiCalls++;return {status:'REVIEW_REQUIRED',
     answer:'编造的错误政策',sourceIds:['qa_demo_payment']};}});
 try{
   await rt.start({event:{isTrusted:true}});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   site.messages.push(customer('如何申请电子发票？我能在哪看物流？'));
   await until(()=>aiCalls===2&&rt.snapshot().records[0]?.status==='PARTIAL_REVIEW_REQUIRED',
     'both invalid citations checked');
   assert.equal(aiCalls,2);
   const row=rt.snapshot().records[0];
   assert.equal(row.answer,'');
   assert.deepEqual(row.sourceIds,[]);
   assert.equal(site.sendCalls,0);
 }finally{rt.dispose();}
});
for(const code of ['E_KB_STALE','E_CANCELLED','E_MODEL_GRANT_REVOKED',
 'E_AI_PERMISSION','E_KB_AUTH','E_TOOL_CHANGED','E_MODEL_STALE','E_PERMISSION']){
 test('R3.2 '+code+' aborts remaining intents and queued customers without a sendable draft',async()=>{
   const {site,api,target}=fakePage();let calls=0,stops=0;
   const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
     readLibrary:async()=>({value:lib,etag}),assertLive:()=>{},
     onStopAI:()=>{stops++;},
     callAI:async()=>{calls++;throw Object.assign(new Error('失效证据'),{code,
       authorization:{secret:'must not be retained'}});}});
   try{
     await rt.start({event:{isTrusted:true},autoSendFixed:true});
     rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
     site.messages.push(customer('如何申请电子发票？我能在哪看物流？'),
       {...customer('如何申请电子发票？我能在哪看物流？'),
         messageId:'kb_msg_00000000-0000-4000-a000-000000000023'});
     await until(()=>rt.snapshot().mode==='idle','terminal AI failure');
     const state=rt.snapshot(),row=state.records[0];
     assert.equal(calls,1,'no next intent or queued customer AI request');
     assert.equal(stops,1);assert.equal(state.autoAI,false);
     assert.equal(row.status,'STALE');assert.equal(row.answer,'');
     assert.deepEqual(row.sourceIds,[]);
     assert.deepEqual(row.failure,{code,message:'失效证据'});
     assert.deepEqual(row.parts[0].failure,row.failure);
     assert.match(row.message,new RegExp(code));
     assert.equal(site.sendCalls,0);
     assert.throws(()=>rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true}),
       {code:'E_KB_TEST_PAUSED'});
     assert.throws(()=>rt.approvalContext(),{code:'E_KB_TEST_STOPPED'});
     assert.equal(calls,1);assert.equal(site.sendCalls,0);
   }finally{rt.dispose();}
 });
}
test('R3.2 ETag loss after an AI result discards earlier draft and stops the next intent',async()=>{
 const {site,api,target}=fakePage();let calls=0,readEtag=etag;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag:readEtag}),assertLive:()=>{},
   callAI:async()=>{calls++;readEtag='b'.repeat(64);return {
     status:'REVIEW_REQUIRED',answer:'must be discarded',sourceIds:['qa_demo_invoice']};}});
 try{
   await rt.start({event:{isTrusted:true}});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   site.messages.push(customer('退款期限是多少？如何申请电子发票？我能在哪看物流？'));
   await until(()=>rt.snapshot().mode==='idle','ETag invalidation');
   const row=rt.snapshot().records[0];
   assert.equal(calls,1);assert.equal(row.failure.code,'E_KB_STALE');
   assert.equal(row.answer,'');assert.deepEqual(row.sourceIds,[]);
   assert.ok(row.parts.every(p=>!p.answer&&p.sourceIds.length===0));
   assert.equal(site.sendCalls,0);
 }finally{rt.dispose();}
});
test('R3.2 ordinary AI failure preserves bounded evidence and permits only reviewed partial draft',async()=>{
 const {site,api,target}=fakePage();let calls=0;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{},
   callAI:async()=>{
     if(++calls===1)throw Object.assign(new Error('x'.repeat(600)),{code:'E_AI_NETWORK',
       authorization:{secret:'must not be retained'}});
     return {status:'REVIEW_REQUIRED',answer:'演示规则：发货后可查看物流。',
       sourceIds:['qa_demo_tracking']};
   }});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   site.messages.push(customer('如何申请电子发票？我能在哪看物流？'));
   await until(()=>rt.snapshot().records[0]?.status==='PARTIAL_REVIEW_REQUIRED','partial AI failure');
   const row=rt.snapshot().records[0];
   assert.equal(calls,2);assert.equal(rt.snapshot().mode,'running');
   assert.deepEqual(row.parts[0].failure,{code:'E_AI_NETWORK',message:'x'.repeat(256)});
   assert.equal(row.parts[0].reason,'AI_FAILED');
   assert.deepEqual(row.sourceIds,['qa_demo_tracking']);
   assert.equal(row.answeredCount,1);assert.equal(row.reviewCount,1);
   assert.equal(site.sendCalls,0);
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id}),{code:'E_KB_REVIEW'});
   await rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true});
   assert.equal(site.sendCalls,1);
 }finally{rt.dispose();}
});
test('R3.2 permission loss during post-AI validation clears previously accepted AI parts',async()=>{
 const {site,api,target}=fakePage();let calls=0,live=true;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),
   assertLive:()=>{if(!live)throw Object.assign(new Error('权限已撤销'),{code:'E_PERMISSION'});},
   callAI:async()=>{
     calls++;if(calls===2)live=false;
     return {status:'REVIEW_REQUIRED',answer:'旧 AI 草稿',
       sourceIds:[calls===1?'qa_demo_invoice':'qa_demo_tracking']};
   }});
 try{
   await rt.start({event:{isTrusted:true}});
   rt.approveAI({...rt.approvalContext(),expiresAt:Date.now()+120000});
   site.messages.push(customer('如何申请电子发票？我能在哪看物流？'));
   await until(()=>rt.snapshot().mode==='idle','post-AI permission loss');
   const row=rt.snapshot().records[0];
   assert.equal(calls,2);assert.equal(row.failure.code,'E_PERMISSION');
   assert.equal(row.parts[0].status,'REVIEW_REQUIRED','first AI result was accepted before revocation');
   assert.ok(row.parts.every(p=>!p.answer&&p.sourceIds.length===0));
   assert.equal(row.answer,'');assert.deepEqual(row.sourceIds,[]);
   assert.equal(site.sendCalls,0);
 }finally{rt.dispose();}
});
test('R3.2 real-time order has no sendable response even if fixed auto permit enabled',async()=>{
 const {site,api,target}=fakePage();
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true},autoSendFixed:true});
   site.messages.push(customer('我的订单现在到哪了'));
   await until(()=>rt.snapshot().records[0]?.status==='HUMAN_REQUIRED','real-time order');
   assert.equal(site.sendCalls,0);
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true}),
     {code:'E_KB_TEST_NO_ANSWER'});
 }finally{rt.dispose();}
});
test('R3.2 multi send respects ETag and pause; never clicks with stale knowledge',async()=>{
 const {site,api,target}=fakePage();let readEtag=etag;
 const rt=createLocalKnowledgeTestRuntime({api,currentPageTarget:target,model,
   readLibrary:async()=>({value:lib,etag:readEtag}),assertLive:()=>{}});
 try{
   await rt.start({event:{isTrusted:true}});
   site.messages.push(customer(mixed));
   await until(()=>rt.snapshot().records[0]?.status==='PARTIAL_REVIEW_REQUIRED','etag case');
   rt.pause();
   assert.throws(()=>rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true}),
     {code:'E_KB_TEST_PAUSED'});
   rt.resume();readEtag='b'.repeat(64);
   await assert.rejects(rt.confirm({event:{isTrusted:true},messageId:id,reviewApproved:true}),
     {code:'E_KB_STALE'});
   assert.equal(site.sendCalls,0);
 }finally{rt.dispose();}
});
