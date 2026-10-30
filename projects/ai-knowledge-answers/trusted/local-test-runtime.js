import {createLocalKnowledgeDemoAdapter} from './local-test-adapter.js';
import {planCustomerMessage,composeCustomerReply,MAX_AI_INTENTS} from './multi-intent.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const LIMIT=20;
const DURATION_MS=10*60*1000;
// These failures invalidate the approved round, rather than just one answer.
const terminalAIFailure=cause=>cause?.name==='AbortError'||[
  'E_KB_STALE','E_KB_TEST_STALE','E_KB_TEST_STOPPED','E_KB_TEST_PAUSED',
  'E_CANCELLED','E_MODEL_STALE','E_MODEL_GRANT_REVOKED','E_AI_PERMISSION',
  'E_PERMISSION','E_KB_AUTH','E_TOOL_CHANGED','E_HOST_CLOSED','E_AI_IDENTITY',
  'E_USER_GESTURE','E_KB_TEST_CONSENT'
].includes(cause?.code);
// Keep bounded diagnostic evidence, never grants or transport payloads.
const aiFailure=cause=>({
  code:typeof cause?.code==='string'?cause.code.slice(0,80):
    cause?.name==='AbortError'?'E_CANCELLED':'E_AI_FAILED',
  message:typeof cause?.message==='string'?cause.message.slice(0,256):'AI 请求失败'
});
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
 const running=(s,epoch)=>active(s)&&!s.paused&&s.pauseEpoch===epoch;
 function update(s,id,patch){
   if(!active(s))return;
   const records=snapshot.records.map(row=>row.messageId===id?Object.freeze({...row,...patch}):row);
   publish({records,confirmed:records.filter(x=>x.status==='CONFIRMED').length,
     errors:records.filter(x=>['ERROR','UNKNOWN','STALE'].includes(x.status)).length});
 }
 async function send(s,id,{reviewApproved=false}={}){
   if(!active(s))throw fail('E_KB_TEST_STOPPED','测试会话已失效');
   const epoch=s.pauseEpoch;
   if(s.paused)throw fail('E_KB_TEST_PAUSED','监听已暂停');
   assertLive();
   if(s.sending.has(id))throw fail('E_KB_TEST_SEND_BUSY','该客户消息正在发送或核对，请勿重复确认');
   const record=snapshot.records.find(x=>x.messageId===id);
   if(!record||record.threadId!==s.threadId||!record.answer||
      !['ANSWERED_FIXED','REVIEW_REQUIRED','GREETING_ONLY',
         'COMPOSITE_REVIEW_REQUIRED','MULTI_REVIEW_REQUIRED','PARTIAL_REVIEW_REQUIRED'].includes(record.status))
     throw fail('E_KB_TEST_NO_ANSWER','当前消息没有可发送的答案');
   if(record.status!=='ANSWERED_FIXED'&&!reviewApproved)
     throw fail('E_KB_REVIEW','问候、多问题或 AI 草稿必须先人工核对并明确确认');
   if(record.providerGeneration!==null&&record.providerGeneration!==getProviderGeneration())
     throw fail('E_KB_STALE','模型设置已变化，旧 AI 草稿不得发送');
   s.sending.add(id);
   try{
     const read=await readLibrary();assertLive();
     if(!active(s))throw fail('E_KB_TEST_STOPPED','测试会话已停止');
     if(!running(s,epoch))throw fail('E_KB_TEST_PAUSED','暂停前的发送已取消，请恢复后重新确认');
     if(read.etag!==record.etag)throw fail('E_KB_STALE','知识版本已更新，旧答案不得发送');
     const library=model.library(read.value??model.empty());
     const sourceIds=record.sourceIds||[];
     if((!sourceIds.length&&record.status!=='GREETING_ONLY')||sourceIds.some(id=>
         !library.items.some(x=>x.id===id&&x.enabled&&x.scope===record.scope)))
       throw fail('E_KB_STALE','原知识来源不可用，旧回答不得发送');
     // Never trust a previously planned question after the library is reread.
     const replanned=planCustomerMessage(model,library,{question:record.question,scope:record.scope});
     const signature=parts=>JSON.stringify(parts.map(p=>[p.question,p.status,p.sourceIds,p.candidateSourceIds]));
     if(signature(replanned.parts)!==signature(record.baselineParts||[]))
       throw fail('E_KB_STALE','逐题问题或知识归属已变化，请重新分析');
     if(record.status==='GREETING_ONLY'&&
        (replanned.status!=='GREETING_ONLY'||replanned.answer!==record.answer))
       throw fail('E_KB_STALE','问候模板已变化，请重新确认');
     if(['MULTI_REVIEW_REQUIRED','PARTIAL_REVIEW_REQUIRED','COMPOSITE_REVIEW_REQUIRED'].includes(record.status)){
       if(!record.parts?.length||record.parts.some(p=>
         p.status==='REVIEW_REQUIRED'&&(!p.sourceIds.length||
           p.sourceIds.some(id=>!p.candidateSourceIds.includes(id)))))
         throw fail('E_KB_STALE','AI 来源与原子问题不匹配');
       if(!record.hasAI&&(replanned.answer!==record.answer||replanned.status!==record.status))
         throw fail('E_KB_STALE','合成草稿已经失效');
     }
     if(record.status==='ANSWERED_FIXED'){
       // The planner strips harmless polite prefixes ("请问") before exact
       // lookup. Revalidate that same verified single intent, not the raw
       // customer sentence, while keeping the original DOM message ID.
       if(replanned.hasGreeting||replanned.parts.length!==1)
         throw fail('E_KB_STALE','原固定问答拆分发生变化');
       const current=model.lookup(library,{question:replanned.parts[0].question,scope:record.scope});
       if(current.status!=='ANSWERED_FIXED'||current.answer!==record.answer||
         current.sourceIds.join('|')!==sourceIds.join('|'))
         throw fail('E_KB_STALE','固定答案规则已变化');
     }
     update(s,id,{status:'SENDING',message:'已进入真实网页表单'});
     try{
       // Actual website form click + SECOND independent DOM read-back.
       const receipt=await adapter.send({messageId:id,threadId:s.threadId,answer:record.answer,
         assertBeforeClick:()=>{
           if(!active(s))throw fail('E_KB_TEST_STOPPED','当前客服会话已停止');
           if(!running(s,epoch))throw fail('E_KB_TEST_PAUSED','暂停阻止了尚未发起的网页点击');
           assertLive();
         }});
       if(!active(s))return {status:'UNKNOWN'};
       update(s,id,{status:'CONFIRMED',replyMessageId:receipt.messageId,message:'网页 DOM 已独立读回确认'});
       return receipt;
     }catch(error){
       // A preflight DOM rejection is known not to have clicked Send; transport or
       // missing receipts remain UNKNOWN. Neither case ever retries automatically.
       const notClicked=['E_KB_DEMO_DRAFT_BUSY','E_KB_DEMO_STALE','E_KB_DEMO_INPUT',
         'E_KB_DEMO_SCOPE','E_KB_DEMO_DUPLICATE'].includes(error?.code);
       if(active(s))update(s,id,error?.code==='E_KB_TEST_PAUSED'
         ?{status:record.status,message:'网页点击尚未开始便被暂停；恢复后需重新确认'}
         :{status:notClicked?'ERROR':'UNKNOWN',
           message:(notClicked?'发送前被页面拒绝：':'网页发送结果未知：')+(error?.code||'unknown')});
       throw error;
     }
   }catch(error){
     // Failures before dispatch must be visible too. Preserve pause recovery and
     // the terminal state already assigned to any dispatched/unknown operation.
     if(running(s,epoch)&&snapshot.records.some(row=>row.messageId===id&&row.status===record.status))
       update(s,id,{status:error?.code==='E_KB_STALE'?'STALE':'ERROR',
         message:'发送前核对失败：'+String(error?.code||error?.message||error)});
     throw error;
   }finally{s.sending.delete(id);}
 }
 // A lost send receipt must never trigger a second click. This independent
 // read-only recovery is permitted while paused: it can confirm what already
 // happened, but cannot initiate any website action.
 async function reconcileUnknown(s,id){
   if(!active(s))throw fail('E_KB_TEST_STOPPED','原测试会话已停止，无法重新绑定旧回执');
   if(s.sending.has(id))throw fail('E_KB_TEST_SEND_BUSY','该消息正在发送或只读核对中');
   assertLive();
   const record=snapshot.records.find(row=>row.messageId===id);
   if(!record||record.threadId!==s.threadId||record.status!=='UNKNOWN'||
      typeof record.answer!=='string'||!record.answer.trim())
     throw fail('E_KB_TEST_RECONCILE','仅允许对有原始答案的未知发送结果执行只读核对');
   s.sending.add(id);
   try{
     // The existing adapter revalidates the exact approved Chrome document.
     const page=await adapter.read();
     if(!active(s))throw fail('E_KB_TEST_STOPPED','只读核对期间原测试会话已停止');
     assertLive();
     if(page.threadId!==s.threadId){
       stop('网页已切换客户会话，旧回执保持未知并停止监听');
       throw fail('E_KB_TEST_STALE','客户会话已切换，不能采用该网页的回执');
     }
     const rows=page.messages;
     const customers=rows.filter(row=>row.direction==='customer'&&
       row.threadId===s.threadId&&row.messageId===id&&
       row.text===record.question&&row.scope===record.scope);
     // Check every agent reply to this customer, not just identical text:
     // duplicate or contradictory replies require manual investigation.
     const replies=rows.filter(row=>row.direction==='agent'&&
       row.threadId===s.threadId&&row.replyTo===id);
     const receipt=replies[0];
     if(customers.length===1&&replies.length===1&&
        receipt.text===record.answer.trim()&&
        /^kb_msg_[0-9a-f-]{36}$/u.test(receipt.messageId)&&
        rows.filter(row=>row.messageId===receipt.messageId).length===1){
       update(s,id,{status:'CONFIRMED',replyMessageId:receipt.messageId,
         message:'只读核对成功：唯一网页回执已匹配，未再次发送'});
       return {status:'CONFIRMED',threadId:s.threadId,
         messageId:receipt.messageId,replyTo:id,readOnly:true};
     }
     update(s,id,{message:'只读核对没有唯一匹配回执；结果仍未知，禁止重新发送，请人工检查网页记录'});
     return {status:'UNKNOWN',code:'E_KB_DEMO_NO_UNIQUE_RECEIPT',readOnly:true};
   }catch(cause){
     if(active(s))update(s,id,{message:'只读核对失败，结果仍未知且禁止重发：'+
       String(cause?.code||cause?.message||cause)});
     throw cause;
   }finally{s.sending.delete(id);}
 }
 async function analyze(s,message){
   const epoch=s.pauseEpoch;
   if(!running(s,epoch))return;
   update(s,message.messageId,{status:'RETRIEVING',message:'正在读取可信知识'});
   try{
     assertLive();
     const read=await readLibrary();assertLive();
     if(!running(s,epoch))return;
     const library=model.library(read.value??model.empty());
     if(read.etag!==s.etag){stop('本轮知识版本已变化，需重新批准');return;}
     const result=planCustomerMessage(model,library,{question:message.text,scope:message.scope});
     if(!running(s,epoch))return;
     const baselineParts=result.parts.map(p=>({...p,sourceIds:[...p.sourceIds],
       candidateSourceIds:[...p.candidateSourceIds]}));
     const explain=plan=>plan.status==='ANSWERED_FIXED'?'固定规则匹配，可核对发送':
       plan.status==='GREETING_ONLY'?'安全问候模板已准备；需要人工确认':
       plan.status==='RETRIEVED_ONLY'?'已有候选来源，需可信点击调用 AI 并人工审核':
       ['PARTIAL_REVIEW_REQUIRED','MULTI_REVIEW_REQUIRED','COMPOSITE_REVIEW_REQUIRED'].includes(plan.status)
         ?plan.answeredCount+' 项有依据，'+plan.reviewCount+' 项需要核实；整条消息仅能人工确认':
       plan.status==='CLARIFICATION_REQUIRED'?'请先明确退款申请期限、审核时长或到账时间':
       plan.status==='HUMAN_REQUIRED'?'涉及实时订单或业务操作，需授权系统或人工处理':
       plan.status==='OVER_LIMIT'?'问题过多或草稿超出安全长度，需人工拆分处理':
       '没有确定依据，禁止自动发送';
     update(s,message.messageId,{
       status:result.status,sourceIds:result.sourceIds.slice(),answer:result.answer||'',
       parts:result.parts,baselineParts,answeredCount:result.answeredCount,
       reviewCount:result.reviewCount,hasAI:false,
       etag:read.etag,providerGeneration:null,message:explain(result)
     });
     if(result.status==='RETRIEVED_ONLY'&&s.approvedAI&&typeof callAI==='function'&&running(s,epoch)){
       update(s,message.messageId,{status:'GENERATING_AI',message:'正在使用已批准的共享 AI 生成草稿'});
       try{
         const ai=await callAI({question:result.parts[0].question,scope:message.scope,
           sourceIdAllowlist:result.parts[0].candidateSourceIds.slice(),
           approvedKnowledgeTest:s.approvedAI,expectedEtag:s.etag});
         if(!running(s,epoch))return;
         const check=await readLibrary();assertLive();
         if(!running(s,epoch))return;
         if(check.etag!==s.etag)throw fail('E_KB_STALE','知识版本在 AI 处理期间变化');
         if(ai?.status==='REVIEW_REQUIRED'&&ai.answer&&ai.sourceIds?.length&&
          ai.sourceIds.every(id=>result.parts[0].candidateSourceIds.includes(id))){
           update(s,message.messageId,{status:'REVIEW_REQUIRED',answer:ai.answer,
             sourceIds:ai.sourceIds.slice(),etag:s.etag,providerGeneration:getProviderGeneration(),
             message:'真实 AI 草稿，需人工核对后才能发送'});
         }else update(s,message.messageId,{status:ai?.status||'INVALID_AI',answer:'',
           message:'AI 草稿未通过来源校验，禁止发送'});
       }catch(error){
         if(running(s,epoch))update(s,message.messageId,{status:'ERROR',answer:'',
           message:'AI 请求失败：'+String(error?.code||error?.message||error)});
       }
     }
     // Every optional multi-intent AI call uses the existing approved Consumer,
     // with a separate evidence fence for each question. Never auto-send.
     const candidates=result.parts.map((p,i)=>p.status==='RETRIEVED_ONLY'?i:-1).filter(i=>i>=0);
     if(result.parts.length>1&&candidates.length&&candidates.length<=MAX_AI_INTENTS&&
        s.approvedAI&&typeof callAI==='function'&&running(s,epoch)){
       update(s,message.messageId,{status:'GENERATING_AI',message:'正在逐项核对候选知识；草稿仍需人工审核'});
       const reviewed=result.parts.map(p=>({...p,sourceIds:p.sourceIds.slice(),
         candidateSourceIds:p.candidateSourceIds.slice()}));
       let hasAI=false;
       for(const index of candidates){
         if(!running(s,epoch))return;
         const part=reviewed[index];
         try{
           const ai=await callAI({question:part.question,scope:message.scope,
             sourceIdAllowlist:part.candidateSourceIds.slice(),
             approvedKnowledgeTest:s.approvedAI,expectedEtag:s.etag});
           if(!running(s,epoch))return;
           const checked=await readLibrary();assertLive();
           if(!running(s,epoch))return;
           if(checked.etag!==s.etag)throw fail('E_KB_STALE','逐题 AI 期间知识已变化');
           if(ai?.status==='REVIEW_REQUIRED'&&typeof ai.answer==='string'&&ai.answer.trim()&&
              Array.isArray(ai.sourceIds)&&ai.sourceIds.length&&
              ai.sourceIds.every(id=>part.candidateSourceIds.includes(id))){
             reviewed[index]={...part,status:'REVIEW_REQUIRED',answer:ai.answer,
               sourceIds:ai.sourceIds.slice(),reason:'SEMANTIC_UNVERIFIED',needsHuman:true};
             hasAI=true;
           }else reviewed[index]={...part,answer:'',sourceIds:[],reason:'AI_SOURCE_INVALID'};
         }catch(cause){
           if(!running(s,epoch))return;
           const failure=aiFailure(cause);
           reviewed[index]={...part,answer:'',sourceIds:[],reason:'AI_FAILED',failure};
           if(terminalAIFailure(cause)){
             update(s,message.messageId,{status:'STALE',answer:'',sourceIds:[],failure,
               parts:reviewed.map(p=>({...p,answer:'',sourceIds:[]})),
               answeredCount:0,reviewCount:reviewed.length,hasAI:false,
               message:'逐题 AI 已中止：'+failure.code});
             stop('逐题 AI 授权或知识已失效：'+failure.code);
             return;
           }
         }
       }
       if(!running(s,epoch))return;
       const draft=composeCustomerReply({hasGreeting:result.hasGreeting,overLimit:false},reviewed);
       update(s,message.messageId,{status:draft.status,answer:draft.answer,
         parts:draft.parts,sourceIds:draft.sourceIds,
         answeredCount:draft.answeredCount,reviewCount:draft.reviewCount,
         hasAI,providerGeneration:hasAI?getProviderGeneration():null,message:explain(draft)});
     }
     if(result.status==='ANSWERED_FIXED'&&s.autoSendFixed&&running(s,epoch)){
       try{await send(s,message.messageId);}catch{/* Terminal UNKNOWN/STALE, no retry. */}
     }
   }catch(error){
     if(running(s,epoch))update(s,message.messageId,{status:'ERROR',message:String(error?.code||error?.message||error)});
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
   const epoch=s.pauseEpoch;
   s.polling=true;
   try{
     assertLive();
     const page=await adapter.read();
     if(!running(s,epoch))return;
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
         sourceIds:[],answer:'',parts:[],baselineParts:[],answeredCount:0,reviewCount:0,
         hasAI:false,etag:null,providerGeneration:null,replyMessageId:null});
       publish({observed:snapshot.observed+1,records:[...snapshot.records,record]});
     }
     void drain(s);
   }catch(error){
     if(running(s,epoch))stop('监听中止：'+String(error?.code||error?.message||error));
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
         queue:[],paused:false,pauseEpoch:0,polling:false,draining:false,timer:null};
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
     const s=session;if(!s||s.paused)return;
     s.paused=true;s.pauseEpoch++;s.approvedAI=null;
     const records=snapshot.records.map(row=>['RETRIEVING','GENERATING_AI'].includes(row.status)
       ?Object.freeze({...row,status:'STALE',answer:'',message:'已暂停，未完成的处理已失效'})
       :row);
     publish({mode:'paused',autoAI:false,records,
       errors:records.filter(row=>['ERROR','UNKNOWN','STALE'].includes(row.status)).length,
       message:'已暂停观察和未开始的发送；自动 AI 需重新批准'});
     onStopAI();
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
     const s=session,record=snapshot.records.find(x=>x.messageId===messageId);
     if(!s||!active(s)||s.paused||!record||record.threadId!==s.threadId||
        record.status!=='RETRIEVED_ONLY')
       throw fail('E_KB_TEST_SELECT','客户消息已失效、暂停或不能生成 AI 草稿');
     const target=adapter.target;
     if(!target||target.documentId!==snapshot.target?.documentId)
       throw fail('E_KB_TEST_STALE','客服网页文档身份已失效');
     // The single semantic intent may be preceded by a greeting. The AI
      // Consumer must receive the parsed question, while the site send and
      // receipt remain bound to the ORIGINAL customer message ID/text.
      const selectedQuestion=record.parts?.length===1?
        record.parts[0].question:record.question;
      return {question:selectedQuestion,scope:record.scope,messageId:record.messageId,
       sourceIdAllowlist:record.sourceIds.slice(),
       testIdentity:{serial:s.serial,pauseEpoch:s.pauseEpoch,threadId:s.threadId,
         documentId:target.documentId}};
   },
   attach(messageId,result,etag,identity){
     const s=session,record=snapshot.records.find(x=>x.messageId===messageId);
     if(!s||!active(s)||s.paused||!record||record.threadId!==s.threadId||
        record.status!=='RETRIEVED_ONLY'||record.etag!==etag||s.etag!==etag||
        identity?.serial!==s.serial||identity?.pauseEpoch!==s.pauseEpoch||
        identity?.threadId!==s.threadId||identity?.documentId!==snapshot.target?.documentId||
        adapter.target?.documentId!==identity.documentId||
        result?.status!=='REVIEW_REQUIRED'||typeof result.answer!=='string'||!result.answer.trim()||
        !Array.isArray(result.sourceIds)||!result.sourceIds.length||
        result.sourceIds.some(id=>!record.sourceIds.includes(id)))
       throw fail('E_KB_TEST_ATTACH','AI 草稿客户、会话、知识来源或授权已失效');
     update(s,messageId,{status:'REVIEW_REQUIRED',answer:result.answer,
       sourceIds:result.sourceIds.slice(),etag,providerGeneration:getProviderGeneration(),
       message:'AI 草稿已生成，等待人工核对确认'});
   },
   confirm({event,messageId,reviewApproved=false}={}){
     if(!event?.isTrusted)throw fail('E_USER_GESTURE','必须在可信 Side Panel 点击发送');
     if(!session||session.paused)throw fail('E_KB_TEST_PAUSED','监听已停止或暂停');
     return send(session,messageId,{reviewApproved});
   },
   reconcile({event,messageId}={}){
     if(!event?.isTrusted)throw fail('E_USER_GESTURE','只读回执核对需要可信侧栏的真实点击');
     if(!session||!active(session))throw fail('E_KB_TEST_STOPPED','原会话已停止，只能人工查看网页记录');
     return reconcileUnknown(session,messageId);
   },
   dispose(){stop('测试会话已关闭');}
 });
}
