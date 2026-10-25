import {createLocalKnowledgeDemoAdapter} from './local-test-adapter.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const LIMIT=20;
const DURATION_MS=10*60*1000;
const validMessage=msg=>typeof msg?.messageId==='string'&&
  /^kb_msg_[0-9a-f-]{36}$/u.test(msg.messageId)&&
  typeof msg?.text==='string'&&msg.text.trim()&&msg.text.length<=300&&
  typeof msg?.scope==='string'&&msg.scope.length<=60;

export function createLocalKnowledgeTestRuntime({
 api,currentPageTarget,model,readLibrary,assertLive,onChange,
 callAI=null,onStopAI=()=>{},getProviderGeneration=()=>null
}={}){
 const adapter=createLocalKnowledgeDemoAdapter({api,currentPageTarget});
 let session=null,serial=0;
 let snapshot=Object.freeze({mode:'idle',autoSendFixed:false,threadId:'',
   target:null,records:[],observed:0,confirmed:0,errors:0,autoAI:false,
   knowledgeCount:null,message:'未连接本地测试页'});
 const publish=patch=>{
   snapshot=Object.freeze({...snapshot,...patch});
   onChange?.(snapshot);
 };
 const active=s=>session===s&&serial===s.serial&&Date.now()<=s.expiresAt;
 function update(s,id,patch){
   if(!active(s))return;
   const records=snapshot.records.map(row=>row.messageId===id?Object.freeze({...row,...patch}):row);
   publish({records,confirmed:records.filter(x=>x.status==='CONFIRMED').length,
     errors:records.filter(x=>['ERROR','UNKNOWN','STALE'].includes(x.status)).length});
 }
 async function send(s,id,{reviewApproved=false}={}){
   if(!active(s))throw fail('E_KB_TEST_STOPPED','测试会话已失效');
   assertLive();
   if(s.sending.has(id))throw fail('E_KB_TEST_SEND_BUSY','该客户消息正在发送或核对，请勿重复确认');
   const record=snapshot.records.find(x=>x.messageId===id);
   if(!record||!record.answer||!['ANSWERED_FIXED','REVIEW_REQUIRED'].includes(record.status))
     throw fail('E_KB_TEST_NO_ANSWER','当前消息没有可发送的答案');
   if(record.status==='REVIEW_REQUIRED'&&!reviewApproved)
     throw fail('E_KB_REVIEW','AI 草稿必须由用户实际审阅并明确确认');
   if(record.providerGeneration!==null&&record.providerGeneration!==getProviderGeneration())
     throw fail('E_KB_STALE','模型设置已变化，旧 AI 草稿不得发送');
   s.sending.add(id);
   try{
     const read=await readLibrary();assertLive();
     if(!active(s))throw fail('E_KB_TEST_STOPPED','测试会话已停止');
     if(read.etag!==record.etag)throw fail('E_KB_STALE','知识版本已更新，旧答案不得发送');
     const library=model.library(read.value??model.empty());
     const sourceIds=record.sourceIds||[];
     if(!sourceIds.length||sourceIds.some(id=>!library.items.some(x=>x.id===id&&x.enabled&&x.scope===record.scope)))
       throw fail('E_KB_STALE','原知识来源不可用，旧回答不得发送');
     if(record.status==='ANSWERED_FIXED'){
       const current=model.lookup(library,{question:record.question,scope:record.scope});
       if(current.status!=='ANSWERED_FIXED'||current.answer!==record.answer||
         current.sourceIds.join('|')!==sourceIds.join('|'))
         throw fail('E_KB_STALE','固定答案规则已变化');
     }
     update(s,id,{status:'SENDING',message:'已进入真实网页表单'});
     try{
       // Actual website form click + SECOND independent DOM read-back.
       const receipt=await adapter.send({messageId:id,threadId:s.threadId,answer:record.answer});
       if(!active(s))return {status:'UNKNOWN'};
       update(s,id,{status:'CONFIRMED',replyMessageId:receipt.messageId,message:'网页 DOM 已独立读回确认'});
       return receipt;
     }catch(error){
       // A preflight DOM rejection is known not to have clicked Send; transport or
       // missing receipts remain UNKNOWN. Neither case ever retries automatically.
       const notClicked=['E_KB_DEMO_DRAFT_BUSY','E_KB_DEMO_STALE','E_KB_DEMO_INPUT',
         'E_KB_DEMO_SCOPE','E_KB_DEMO_DUPLICATE'].includes(error?.code);
       if(active(s))update(s,id,{status:notClicked?'ERROR':'UNKNOWN',
         message:(notClicked?'发送前被页面拒绝：':'网页发送结果未知：')+(error?.code||'unknown')});
       throw error;
     }
   }finally{s.sending.delete(id);}
 }
 async function analyze(s,message){
   if(!active(s))return;
   update(s,message.messageId,{status:'RETRIEVING',message:'正在读取可信知识'});
   try{
     assertLive();
     const read=await readLibrary();assertLive();
     if(!active(s))return;
     const library=model.library(read.value??model.empty());
     if(read.etag!==s.etag){stop('本轮知识版本已变化，需重新批准');return;}
     const result=model.lookup(library,{question:message.text,scope:message.scope});
     if(!active(s))return;
     update(s,message.messageId,{
       status:result.status,sourceIds:result.sourceIds.slice(),answer:result.answer||'',
       etag:read.etag,providerGeneration:null,
       message:result.status==='ANSWERED_FIXED'?'固定规则匹配，可核对发送':
         result.status==='RETRIEVED_ONLY'?'已有候选来源，需可信点击调用 AI 并人工审核':
         '没有确定依据，禁止发送'
     });
     if(result.status==='RETRIEVED_ONLY'&&s.approvedAI&&typeof callAI==='function'&&!s.paused){
       update(s,message.messageId,{status:'GENERATING_AI',message:'正在使用已批准的共享 AI 生成草稿'});
       try{
         const ai=await callAI({question:message.text,scope:message.scope,
           approvedKnowledgeTest:s.approvedAI,expectedEtag:s.etag});
         if(!active(s))return;
         const check=await readLibrary();assertLive();
         if(!active(s))return;
         if(check.etag!==s.etag)throw fail('E_KB_STALE','知识版本在 AI 处理期间变化');
         if(ai?.status==='REVIEW_REQUIRED'&&ai.answer&&ai.sourceIds?.length){
           update(s,message.messageId,{status:'REVIEW_REQUIRED',answer:ai.answer,
             sourceIds:ai.sourceIds.slice(),etag:s.etag,providerGeneration:getProviderGeneration(),
             message:'真实 AI 草稿，需人工核对后才能发送'});
         }else update(s,message.messageId,{status:ai?.status||'INVALID_AI',answer:'',
           message:'AI 草稿未通过来源校验，禁止发送'});
       }catch(error){
         if(active(s))update(s,message.messageId,{status:'ERROR',answer:'',
           message:'AI 请求失败：'+String(error?.code||error?.message||error)});
       }
     }
     if(result.status==='ANSWERED_FIXED'&&s.autoSendFixed&&!s.paused&&active(s)){
       try{await send(s,message.messageId);}catch{/* Terminal UNKNOWN/STALE, no retry. */}
     }
   }catch(error){
     if(active(s))update(s,message.messageId,{status:'ERROR',message:String(error?.code||error?.message||error)});
   }
 }
 async function drain(s){
   if(s.draining||s.paused||!active(s))return;
   s.draining=true;
   try{
     while(active(s)&&!s.paused&&s.queue.length){
       const next=s.queue.shift();
       await analyze(s,next);
     }
   }finally{s.draining=false;}
 }
 async function poll(s){
   if(!active(s)||s.paused||s.polling)return;
   s.polling=true;
   try{
     assertLive();
     const page=await adapter.read();
     if(!active(s))return;
     if(page.threadId!==s.threadId){
       stop('网站已切换会话；本轮测试停止，旧回复不得发送');return;
     }
     for(const msg of page.messages){
       if(msg.direction!=='customer'||msg.threadId!==s.threadId||!validMessage(msg))continue;
       if(s.seen.has(msg.messageId))continue;
       if(snapshot.observed>=LIMIT){stop('达到 20 条消息上限，已停止监听');return;}
       s.seen.add(msg.messageId);
       s.queue.push(msg);
       const record=Object.freeze({messageId:msg.messageId,threadId:msg.threadId,
         question:msg.text,scope:msg.scope,status:'OBSERVED',message:'真实 DOM 新消息',
         sourceIds:[],answer:'',etag:null,providerGeneration:null,replyMessageId:null});
       publish({observed:snapshot.observed+1,records:[...snapshot.records,record]});
     }
     void drain(s);
   }catch(error){
     stop('监听中止：'+String(error?.code||error?.message||error));
   }finally{s.polling=false;}
 }
 function stop(message='已停止'){
   const old=session;session=null;serial++;
   if(old?.timer)clearInterval(old.timer);
   onStopAI();
   void adapter.stop();
   const records=snapshot.records.map(row=>['RETRIEVING','GENERATING_AI','SENDING'].includes(row.status)
       ?Object.freeze({...row,status:row.status==='SENDING'?'UNKNOWN':'STALE',message:'测试已停止，无法确认后续执行结果'})
       :row);
   publish({mode:'idle',autoAI:false,message,records,
     errors:records.filter(row=>['ERROR','UNKNOWN','STALE'].includes(row.status)).length});
 }
 return Object.freeze({
   snapshot:()=>snapshot,
   async start({event,autoSendFixed=false}={}){
     if(!event?.isTrusted)throw fail('E_USER_GESTURE','必须在可信侧栏点击批准本地测试');
     if(session||snapshot.mode==='connecting')
       throw fail('E_KB_TEST_RUNNING','已经在连接或监听该测试页');
     assertLive();
     const ticket=serial;
     publish({mode:'connecting',message:'正在核对当前窗口和测试页文档…'});
     try{
       const initial=await adapter.start();assertLive();
       if(ticket!==serial)throw fail('E_KB_TEST_STOPPED','测试在准备阶段已被停止');
       const read=await readLibrary();assertLive();
       if(ticket!==serial)throw fail('E_KB_TEST_STOPPED','测试在知识读取阶段已被停止');
       const library=model.library(read.value??model.empty());
       const s={serial:++serial,threadId:initial.threadId,autoSendFixed:Boolean(autoSendFixed),
         etag:read.etag,approvedAI:null,
         expiresAt:Date.now()+DURATION_MS,
         seen:new Set(initial.messages.filter(x=>x.direction==='customer').map(x=>x.messageId)),
         sending:new Set(),
         queue:[],paused:false,polling:false,draining:false,timer:null};
       session=s;
       publish({mode:'running',autoSendFixed:s.autoSendFixed,threadId:s.threadId,target:initial.target,
         records:[],observed:0,confirmed:0,errors:0,autoAI:false,
         knowledgeCount:library.items.length,
         message:'已批准：仅此文档，最长 10 分钟、最多 20 条'});
       s.timer=setInterval(()=>{
         if(!active(s)){stop('测试许可已到期');return;}
         void poll(s);
       },850);
       return snapshot;
     }catch(error){
       if(ticket===serial){adapter.drop();publish({mode:'idle',message:String(error?.message||error)});}
       throw error;
     }
   },
   pause(){
     if(!session)return;
     session.paused=true;publish({mode:'paused',message:'已暂停观察新消息和未开始的发送'});
   },
   resume(){
     if(!session||!session.paused)return;
     session.paused=false;publish({mode:'running',message:'已恢复本地页面监听'});
     void poll(session);void drain(session);
   },
   stop,
   // Preparing the exact inbound question still uses the existing trusted manual Send.
   approvalContext(){
     const s=session;if(!s||!active(s)||s.paused)throw fail('E_KB_TEST_STOPPED','监听未生效');
     const target=adapter.target;
     if(!target||target.documentId!==snapshot.target?.documentId)
       throw fail('E_KB_TEST_STALE','测试文档身份已变化');
     return {origin:'http://127.0.0.1:43111',documentId:target.documentId,etag:s.etag};
   },
   approveAI(grant){
     const s=session;if(!s||!active(s)||s.paused)throw fail('E_KB_TEST_STOPPED','监听未生效');
     const target=adapter.target;
     if(!grant||grant.etag!==s.etag||grant.documentId!==target?.documentId||
        grant.origin!=='http://127.0.0.1:43111'||Date.now()>grant.expiresAt)
       throw fail('E_KB_TEST_CONSENT','测试 Provider 授权不匹配知识版本或网页文档');
     s.approvedAI=grant;
     publish({autoAI:true,message:'已批准在当前文档的测试期内调用共享 AI；生成结果仍需人工审核'});
   },
   select(messageId){
     const record=snapshot.records.find(x=>x.messageId===messageId);
     if(!session||!record||!active(session)||!['RETRIEVED_ONLY','ANSWERED_FIXED','REVIEW_REQUIRED'].includes(record.status))
       throw fail('E_KB_TEST_SELECT','客户消息已失效或不支持回答');
     return {question:record.question,scope:record.scope,messageId:record.messageId};
   },
   attach(messageId,result,etag){
     const s=session,record=snapshot.records.find(x=>x.messageId===messageId);
     if(!s||!active(s)||!record||result?.status!=='REVIEW_REQUIRED'||!result.answer||
        !Array.isArray(result.sourceIds)||!result.sourceIds.length)
       throw fail('E_KB_TEST_ATTACH','AI 草稿身份或状态无效');
     update(s,messageId,{status:'REVIEW_REQUIRED',answer:result.answer,
       sourceIds:result.sourceIds.slice(),etag,providerGeneration:getProviderGeneration(),
       message:'AI 草稿已生成，等待人工核对确认'});
   },
   confirm({event,messageId,reviewApproved=false}={}){
     if(!event?.isTrusted)throw fail('E_USER_GESTURE','必须在可信 Side Panel 点击发送');
     if(!session||session.paused)throw fail('E_KB_TEST_PAUSED','监听已停止或暂停');
     return send(session,messageId,{reviewApproved});
   },
   dispose(){stop('测试会话已关闭');}
 });
}
