// Orchestration only: reuses WorkflowView's sole Provider authorization and
// SidebarTools' sole storage dispatcher. No runtime, keyspace or permissions.
import {executePromptPlan,validatePromptPlan} from './prompt-actions.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const refsOnly=refs=>({matches:Array.isArray(refs?.matches)?
 refs.matches.slice(0,12).filter(id=>typeof id==='string'&&id.length<=160):[],
 etag:typeof refs?.etag==='string'&&/^[a-f0-9]{64}$/.test(refs.etag)?refs.etag:null});
const changedProvider=(source,initial)=>source?.provider!==initial;
export function createPromptConversationRequest({
 conversation,model,storage,assertIdentity,acquireGuard,review,notify
}={}){
 if(typeof conversation?.request!=='function'||typeof conversation?.cancel!=='function'||
  !model?.load||typeof storage!=='function'||typeof assertIdentity!=='function'||
  typeof acquireGuard!=='function'||typeof review!=='function'||
  typeof notify!=='function')
  throw fail('E_PROMPT_HOST','官方提示词对话依赖未就绪');
 return async function requestPrompt({request,refs={},signal,event,onStep=()=>{},onPhase=()=>{}}={}){
  if(typeof request!=='string'||!request.trim()||request.length>4000)
   throw fail('E_AI_REQUEST','请输入有效的提示词管理请求');
  if(event?.isTrusted!==true)
   throw fail('E_USER_GESTURE','请从可信 AI 对话输入框主动发送请求');
  const initialSource=conversation.source()?.provider;
  const initialGeneration=conversation.providerGeneration?.()??null;
  // Do NOT await reads here: the first permission.request must start in the
  // original trusted Send gesture, exactly like Bookmark Manager's controller.
  const first=conversation.request({request,context:{previousSearch:refsOnly(refs)},
   scope:'prompt',event,signal});
  let authority=null,releaseGuard=null,outcome=null,unknown=false;
  const live=async()=>{
   if(signal?.aborted)throw fail('E_CANCELLED','已停止后续操作');
   if(changedProvider(conversation.source(),initialSource)||
      initialGeneration!==null&&conversation.providerGeneration?.()!==initialGeneration)
    throw fail('E_MODEL_GRANT_REVOKED','模型接收方或配置已切换，旧计划失效');
   await assertIdentity();
   if(signal?.aborted)throw fail('E_CANCELLED','已停止后续操作');
  };
  const read=async()=>{
   await live();
   return storage('storage.get',{key:'library',withEtag:true});
  };
  try{
   const answer=await first;
   authority=answer.authorization;
   if(typeof authority?.assertWrite!=='function'||typeof authority?.release!=='function')
    throw fail('E_PROMPT_AUTH','未取得可核实的模型授权，未执行存储操作');
   await live();
   const plan=validatePromptPlan(answer.proposal);
   const onVerifiedStep=step=>onStep(step);
   outcome=await executePromptPlan({plan,model,read,refs:refsOnly(refs),signal,
    onStep:onVerifiedStep,
     reviewPrivateSend:async disclosure=>{
      await live();
      // A revoked model grant must not display a stale private-body review,
      // even though no body has been sent to the Provider yet.
      await authority.assertWrite();
      const recipient=conversation.recipient?.();
      if(!recipient||typeof recipient.provider!=='string'||
         typeof recipient.endpoint!=='string'||!recipient.endpoint||
         typeof recipient.model!=='string'||!recipient.model)
        throw fail('E_PROMPT_AUTH','无法核实私人正文接收方，拒绝发送');
      const frozen=JSON.stringify(recipient);
      const approved=await review({...disclosure,action:'share_private_body',recipient});
      await live();
      // Review may remain open while the user revokes the Provider grant.
      // Never carry an approval across that permission boundary.
      await authority.assertWrite();
      if(JSON.stringify(conversation.recipient?.())!==frozen)
        throw fail('E_MODEL_GRANT_REVOKED','私人正文接收方已变化，请重新审阅');
      return approved;
     },
    write:async({value,ifMatch})=>{
     onPhase('writing');
     return storage('storage.set',{key:'library',value,ifMatch},{signal,
      assertWrite:async()=>{await live();await authority?.assertWrite();}});
    },
    beforeWrite:async context=>{
     await live();
     if(!releaseGuard)releaseGuard=await acquireGuard();
     await live();
     // A Provider proposal is not a persistent write permission: revalidate
     // the same trusted model grant at the exact write boundary.
     await authority?.assertWrite();
    },
    review:async proposal=>{
     await live();
     return review({...proposal,provider:initialSource});
    },
    providerEdit:async({item,instruction,expectedEtag})=>{
     authority?.release?.();authority=null;
     await live();
     // The classifier never sees saved bodies. Only the Host-resolved,
     // unchanged record is sent for this explicit trusted Send.
     const latest=await read();
     if(latest.etag!==expectedEtag||
       !latest.value?.items?.some(row=>row.id===item.id&&row.body===item.body))
      throw fail('E_STORAGE_CONFLICT','准备发送的正文或库版本已变化，请重新发出操作');
     await live();
     // Continuation reuses the configured Provider and its existing permission.
     const edited=await conversation.request({request:instruction,
      context:{originalBody:item.body},scope:'prompt-edit',continuation:true,event,signal});
     authority=edited.authorization;
     if(typeof authority?.assertWrite!=='function'||typeof authority?.release!=='function')
      throw fail('E_PROMPT_AUTH','正文处理未取得有效模型授权');
     await live();await authority.assertWrite();
     const body=edited.proposal;
     if(!obj(body)||Object.keys(body).sort().join(',')!=='body'||
       typeof body.body!=='string'||!body.body.trim()||body.body.length>6000)
      throw fail('E_PROMPT_EDIT','模型没有返回完整有效的修改后正文');
     return body.body;
    }
   });
   return outcome;
  }catch(error){
   unknown=error?.code==='E_OUTCOME_UNKNOWN'||error?.writeIssued===true;
   throw error;
  }finally{
   authority?.release?.();
   try{releaseGuard?.();}catch{/* Closing the iframe always invalidates its guard. */}
   if(outcome?.writeIssued===true||outcome?.total!==undefined){
    try{await notify({targetId:outcome.refs?.matches?.[0]||null,
     changed:outcome.writeIssued===true,releasedImageAssets:outcome.releasedImageAssets||[]});}catch{/* UI refresh does not change saved truth. */}
   }
   if(unknown)try{await notify({unknown:true});}catch{}
  }
 };
}


// Prompt-only UNKNOWN review handshake. The neutral React Dock must never
// store a library ETag or manufacture a Host acknowledgement.
export function createPromptReconciliationAdapter(reconcile){
 if(typeof reconcile!=='function')throw fail('E_PROMPT_HOST','提示词恢复入口不可用');
 let pendingEtag=null,disposed=false,busy=false;
 return Object.freeze({
  async reconcile(){
   if(disposed)throw fail('E_TOOL_CHANGED','提示词实例已关闭');
   if(busy)throw fail('E_PROMPT_BUSY','正在核对提示词存储，请勿重复提交');
   busy=true;
   // Acknowledgement can only come from a preceding explicit review click.
   // Consume it before the Host call; failures never silently retry it.
   const reviewedEtag=pendingEtag;
   pendingEtag=null;
   try{
    const result=await reconcile(reviewedEtag?{acknowledgeEtag:reviewedEtag}:{});
    if(disposed)throw fail('E_TOOL_CHANGED','提示词实例已关闭');
    if(result?.verified===true)return result;
    if(result?.status==='uncertain'&&/^[a-f0-9]{64}$/.test(result.currentEtag||'')){
     if(reviewedEtag){
      // A changed library invalidates the prior review and user decision.
      return {...result,
       message:(result.message||'提示词库版本已变化。')+
        ' 上次人工核对已失效，请重新读取并检查当前列表。',
       nextActionLabel:'重新读取提示词库并核对'};
     }
     pendingEtag=result.currentEtag;
     return {...result,nextActionLabel:'我已检查当前列表，解除阻止'};
    }
    return result;
   }finally{busy=false;}
  },
  dispose(){disposed=true;pendingEtag=null;}
 });
}
