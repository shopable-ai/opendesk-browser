// Official Prompt Shortcuts' trusted adapter to the EXISTING SidebarTools Host.
// Never dispatches an AI plan as code, grants iframe privileges, or owns storage.
import {createPromptConversationRequest} from './prompt-controller.js';

export const PROMPT_AI_RECOVERY_KEY='opendesk.prompt-ai-recovery.v1';
const failure=(code,message)=>Object.assign(new Error(message),{code});
const hashValid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function createTrustedPromptHost({
  api,tool,token,epoch,model,conversation,assertIdentity,frameSource,
  guardBlocked,dispatch,etagFor,confirm,sendToFrame,notice=()=>{}
}={}){
  if(!api?.storage?.local||typeof assertIdentity!=='function'||
     typeof frameSource!=='function'||typeof dispatch!=='function'||
     typeof etagFor!=='function'||typeof confirm!=='function'||
     typeof sendToFrame!=='function'||typeof conversation?.request!=='function')
    throw failure('E_PROMPT_HOST','可信提示词 Host 所需依赖不完整');
  let waiting=null,guardId=null,disposed=false,lastExpected=null;
  const live=async()=>{
    if(disposed)throw failure('E_TOOL_CHANGED','对话实例已经关闭');
    await assertIdentity();
    if(disposed)throw failure('E_TOOL_CHANGED','对话实例已经关闭');
  };
  const send=(kind,details={})=>sendToFrame({kind,...details});
  const releaseGuard=()=>{
    const pending=waiting;waiting=null;
    if(pending){clearTimeout(pending.timer);
      pending.reject(failure('E_TOOL_CHANGED','提示词草稿租约已失效'));
    }
    for(const id of new Set([pending?.id,guardId].filter(Boolean)))
      try{send('ai-guard-release',{guardId:id});}catch{}
    guardId=null;
  };
  async function acquireGuard(){
    await live();
    if(waiting||guardId||guardBlocked?.())
      throw failure('E_PROMPT_DRAFT','存在未保存草稿、执行中操作或已有草稿租约；零写入');
    const source=frameSource(),id=crypto.randomUUID();
    if(!source)throw failure('E_TOOL_CHANGED','原 iframe 不可用');
    const receipt=new Promise((resolve,reject)=>{
      const pending={source,id,resolve,reject,timer:null};waiting=pending;
      pending.timer=setTimeout(()=>{
        if(waiting!==pending)return;
        waiting=null;
        try{send('ai-guard-release',{guardId:id});}catch{}
        reject(failure('E_PROMPT_GUARD_TIMEOUT','原 iframe 未确认草稿安全，拒绝写入'));
      },4000);
      try{send('ai-guard',{guardId:id});}
      catch(error){waiting=null;clearTimeout(pending.timer);reject(error);}
    });
    try{
      await receipt;
      await live();
      if(guardBlocked?.())throw failure('E_PROMPT_DRAFT','草稿状态在授权期间变化');
    }catch(error){releaseGuard();throw error;}
    return ()=>{if(guardId===id)releaseGuard();};
  }
  function onGuardResponse(message,source){
    if(!waiting||source!==waiting.source||message?.guardId!==waiting.id)return;
    const pending=waiting;waiting=null;clearTimeout(pending.timer);
    if(message.granted===true&&!guardBlocked?.()&&!disposed){
      guardId=pending.id;pending.resolve();
    }else{
      try{send('ai-guard-release',{guardId:pending.id});}catch{}
      pending.reject(failure('E_PROMPT_DRAFT','原 iframe 拒绝草稿租约，未写入'));
    }
  }
  const storage=async(operation,payload)=>{
    if(!['storage.get','storage.set'].includes(operation)||payload?.key!=='library'||
       (operation==='storage.set'&&!hashValid(payload.ifMatch)))
      throw failure('E_PROMPT_SCOPE','仅允许当前工具 library 的条件读写');
    await live();
    if(operation==='storage.set'){
      lastExpected=await etagFor(payload.value);
      if(!hashValid(lastExpected))throw failure('E_PROMPT_HOST','写入预期版本计算失败');
      // Persist only non-sensitive intent metadata *before* issuing a write.
      // The actual library stays exclusively in the tool's storage namespace.
      const unresolved=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
      if(unresolved?.toolId===tool.id&&!(
        unresolved.instance===token&&unresolved.expectedEtag===lastExpected))
        throw failure('E_OUTCOME_UNKNOWN','存在尚未完成的 AI 写入核对；先读取真实 Host 存储，禁止覆盖恢复记录');
      await api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:{
        toolId:tool.id,version:tool.version,instance:token,installEpoch:epoch,
        expectedEtag:lastExpected,createdAt:Date.now()
      }});
      await live();
    }
    return dispatch(operation,payload);
  };
  const summaryRow=row=>(row.name||row.label||row.id)+' ['+row.id+']';
  const review=proposal=>confirm({
    button:'确认'+proposal.label+' '+proposal.count+' 条',
    message:'可信 Host 将'+proposal.label+'以下 '+proposal.count+' 条提示词。\n'+
      '匹配条件：'+proposal.query+'\n操作无法自动撤销。逐项改动：\n'+
      proposal.changes.map(({id,before,after},index)=>
        (index+1)+'. '+summaryRow(before)+'\n'+JSON.stringify({
          id,before:{body:before.body,enabled:before.enabled,order:before.order},
          after:after?{body:after.body,enabled:after.enabled,order:after.order}:null
        },null,2)).join('\n')+
      '\n确认后仍会核对官方安装身份、草稿和 ETag。',
    run:async()=>{await live();return true;}
  });
  const reviewShare=({id,name,body,provider})=>confirm({
    button:'允许本次发送正文',
    message:'将把以下私人提示词正文发送给当前模型 Provider（'+provider+
      '），仅用于这一次明确要求的正文修改。\n记录：'+
      (name||id)+' ['+id+']\n即将发送的完整正文：\n'+body+
      '\n确认前不会向模型发送这段私人正文。',
    run:async()=>{await live();return true;}
  });
  const notify=async({changed=false,unknown=false,targetId=null,releasedImageAssets=[]}={})=>{
    if(disposed)return;
    if(changed||unknown)try{send('state-changed',{targetId});}catch{}
    if(changed&&lastExpected){
      // A late old completion cannot erase a newer instance's recovery receipt.
      try{
        const current=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
        if(current?.instance===token&&current?.expectedEtag===lastExpected)
          await api.storage.local.remove(PROMPT_AI_RECOVERY_KEY);
      }catch{/* Keep recovery receipt rather than claiming durable cleanup. */}
    }
    if(changed&&Array.isArray(releasedImageAssets)){
      let failed=0;
      for(const id of releasedImageAssets){
        if(typeof id!=='string'||!/^psa_[a-f0-9]{32}$/.test(id)){failed++;continue;}
        try{
          await live();
          // Existing asset Host takes the same tool lock, independently checks
          // the now-persisted library for references and verifies the removal.
          await dispatch('prompt.asset.remove',{id});
        }catch{failed++;}
      }
      if(failed)notice('提示词已保存并读回，但 '+failed+' 个不用的图片资源清理未确认，请在原工具核对。',true);
    }
    if(unknown)notice('AI 写入结果未知：已保留只含摘要的核对记录，请勿重试创建。',true);
  };
  const request=createPromptConversationRequest({
    conversation,model,storage,assertIdentity:live,acquireGuard,
    review,reviewShare,notify
  });
  async function recovery(){
    const saved=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
    return saved?.toolId===tool.id&&hashValid(saved.expectedEtag)?saved:null;
  }
  async function reconcile(){
    await live();
    const record=await recovery();
    // Exact same Host Dispatcher, same tool's library, fresh independent ETag.
    const current=await storage('storage.get',{key:'library',withEtag:true});
    if(!hashValid(current?.etag))throw failure('E_OUTCOME_UNKNOWN','独立读回失败，不能解除核对状态');
    model.load(current.value);
    await live();
    const matched=record&&record.expectedEtag===current.etag;
    if(record){
      const latest=await recovery();
      if(latest?.instance!==record.instance||latest?.expectedEtag!==record.expectedEtag)
        throw failure('E_STORAGE_CONFLICT','新的写入核对记录已经出现，请重新核对');
      await api.storage.local.remove(PROMPT_AI_RECOVERY_KEY);
    }
    send('state-changed');
    return {verified:true,message:matched?
      '独立读回与上次预期库版本完全匹配，写入已确认；没有再次写入。':
      '已独立读取最新真实库，但无法证明旧写入成功。请人工检查列表；旧指令不会自动重放，新请求将重新检查 ETag。'};
  }
  return Object.freeze({request,onGuardResponse,recovery,reconcile,dispose(){
    if(disposed)return;
    releaseGuard();disposed=true;
  }});
}
