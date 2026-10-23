// Official Prompt Shortcuts' trusted adapter to the EXISTING SidebarTools Host.
// Never dispatches an AI plan as code, grants iframe privileges, or owns storage.
import {createPromptConversationRequest} from './prompt-controller.js';

export const PROMPT_AI_RECOVERY_KEY='opendesk.prompt-ai-recovery.v1';
const failure=(code,message)=>Object.assign(new Error(message),{code});
const hashValid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function createTrustedPromptHost({
  api,tool,token,epoch,model,conversation,assertIdentity,frameSource,
  guardBlocked,dispatch,etagFor,confirm,sendToFrame,notice=()=>{},
  lockManager=globalThis.navigator?.locks
}={}){
  if(!api?.storage?.local||typeof assertIdentity!=='function'||
     typeof frameSource!=='function'||typeof dispatch!=='function'||
     typeof etagFor!=='function'||typeof confirm!=='function'||
     typeof sendToFrame!=='function'||typeof conversation?.request!=='function')
    throw failure('E_PROMPT_HOST','可信提示词 Host 所需依赖不完整');
  let waiting=null,guardId=null,disposed=false,lastIntent=null;
  // Reuse the Host's cross-document Web Locks. Keep this separate from the
  // tool lock acquired by dispatch: receipt lock -> existing tool lock only.
  const locked=(work,signal)=>{
    if(typeof lockManager?.request!=='function')
      throw failure('E_TOOL_LOCK','当前浏览器无法安全协调提示词写入核对');
    const name='opendesk.sidebar-tools:prompt-ai-recovery';
    return signal?lockManager.request(name,{signal},work):lockManager.request(name,work);
  };
  const ownsIntent=(record,intent)=>Boolean(intent)&&
    record?.toolId===tool.id&&record?.instance===token&&
    record?.installEpoch===epoch&&record?.intentId===intent.intentId&&
    record?.expectedEtag===intent.expectedEtag&&record?.beforeEtag===intent.beforeEtag;
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
  const storage=async(operation,payload,{signal,assertWrite}={})=>{
    if(!['storage.get','storage.set'].includes(operation)||payload?.key!=='library'||
       (operation==='storage.set'&&!hashValid(payload.ifMatch)))
      throw failure('E_PROMPT_SCOPE','仅允许当前工具 library 的条件读写');
    await live();
    if(operation==='storage.get')return dispatch(operation,payload);
    const assertCurrent=async()=>{
      if(signal?.aborted)throw failure('E_CANCELLED','已停止，未发出提示词写入');
      await live();
      if(typeof assertWrite!=='function')throw failure('E_PROMPT_AUTH','缺少本轮写入授权');
      await assertWrite();
      if(signal?.aborted)throw failure('E_CANCELLED','已停止，未发出提示词写入');
    };
    let dispatched=false;
    try{return await locked(async()=>{
      let intent=null;
      try{
        await assertCurrent();
        const expectedEtag=await etagFor(payload.value);
        if(!hashValid(expectedEtag))throw failure('E_PROMPT_HOST','写入预期版本计算失败');
        // Metadata stays under the same receipt lock through dispatch. The
        // actual library still belongs exclusively to the existing tool Host.
        const unresolved=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
        if(unresolved?.toolId===tool.id)
          throw failure('E_OUTCOME_UNKNOWN','存在尚未完成的 AI 写入核对；先读取真实 Host 存储，禁止覆盖恢复记录');
        intent={toolId:tool.id,version:tool.version,instance:token,installEpoch:epoch,
          intentId:crypto.randomUUID(),beforeEtag:payload.ifMatch,expectedEtag,createdAt:Date.now()};
        await api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:intent});
        lastIntent=intent;
        await assertCurrent();
        dispatched=true;
        // The trusted callback is a lexical argument, never iframe payload.
        // Dispatcher calls it after its own tool lock and final async reads.
        return await dispatch(operation,payload,{beforeWrite:assertCurrent});
      }catch(error){
        if(!dispatched||error?.writeIssued===false||
           ['E_STORAGE_CONFLICT','E_TOOL_DATA_LIMIT'].includes(error?.code)){
          const current=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
          if(ownsIntent(current,intent))await api.storage.local.remove(PROMPT_AI_RECOVERY_KEY);
        }
        throw error;
      }
    },signal);}catch(error){
      if(!dispatched){
        if(error?.name==='AbortError')error=failure('E_CANCELLED','已停止等待，未发出提示词写入');
        error.writeIssued=false;
      }
      throw error;
    }
  };
  const summaryRow=row=>(row.name||row.label||row.id)+' ['+row.id+']';
  const review=proposal=>{
    if(proposal.action==='share_private_body'){
     const {recipient,items,instruction}=proposal;
     if(!Array.isArray(items)||!items.length||items.length>12||
        items.some(row=>typeof row?.id!=='string'||typeof row.body!=='string')||
        typeof instruction!=='string'||typeof recipient?.provider!=='string'||
        typeof recipient.endpoint!=='string'||typeof recipient.model!=='string')
       throw failure('E_PROMPT_REVIEW','私人正文披露信息无效');
     const where=recipient.provider==='local_codex'?'本机 Codex':
       recipient.provider+' · '+recipient.endpoint+' · 模型 '+recipient.model;
     const originals=items.map((row,index)=>(index+1)+'. '+summaryRow(row)+
       '\n原始正文（完整）：\n'+row.body).join('\n\n');
     return confirm({
       button:'允许发送 '+items.length+' 条正文',
       message:'私人提示词正文发送审阅（本次编辑专用）\n接收方：'+where+
         '\n编辑要求：'+instruction+'\n\n'+originals+
         '\n\n确认后才会向上述接收方发送这些原始正文。取消则不发送、不修改存储。',
       run:async()=>{await live();return true;}
     });
   }
   const deleting=proposal.action==='delete',editing=proposal.action==='batch_edit';
    const details=proposal.changes.map(({before,after},index)=>{
      const title=(index+1)+'. '+summaryRow(before);
      if(deleting)return title; // Deletion confirmation never displays private bodies.
      if(editing)return title+'\n修改前：\n'+before.body+'\n修改后：\n'+after.body;
      return title+' · '+(before.enabled?'启用':'停用')+' → '+
        (after.enabled?'启用':'停用');
    }).join('\n');
    return confirm({
      button:deleting?'确认删除 '+proposal.count+' 条':
        '确认'+proposal.label+' '+proposal.count+' 条',
      message:(deleting?'确认删除以下 '+proposal.count+' 条提示词？':
        '请核对以下 '+proposal.count+' 条提示词的'+proposal.label+'结果：')+
        '\n匹配条件：'+proposal.query+'\n'+details+
        (deleting?'\n删除后无法撤销。':'\n确认后将保存上述变更。')+
        '\n保存前仍会校验官方安装身份、草稿状态和 ETag。',
      run:async()=>{await live();return true;}
    });
  };
  const notify=async({changed=false,unknown=false,targetId=null,releasedImageAssets=[]}={})=>{
    if(disposed)return;
    if(changed||unknown)try{send('state-changed',{targetId});}catch{}
    if(changed&&lastIntent){
      // A late old completion cannot erase a newer instance's recovery receipt.
      try{
        const intent=lastIntent;
        await locked(async()=>{
          const current=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
          if(ownsIntent(current,intent))await api.storage.local.remove(PROMPT_AI_RECOVERY_KEY);
        });
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
    review,notify
  });
  async function readRecovery(){
    const saved=(await api.storage.local.get(PROMPT_AI_RECOVERY_KEY))[PROMPT_AI_RECOVERY_KEY];
    return saved?.toolId===tool.id&&hashValid(saved.expectedEtag)?saved:null;
  }
  const recovery=()=>locked(readRecovery);
  async function reconcile({acknowledgeEtag=null}={}){
    return locked(async()=>{
    await live();
    const record=await readRecovery();
    // Read through the SAME dispatcher. A successful read alone cannot
    // prove whether a previous write was applied.
    const current=await storage('storage.get',{key:'library',withEtag:true});
    if(!hashValid(current?.etag))
      throw failure('E_OUTCOME_UNKNOWN','独立读回失败，请保留待核对状态');
    model.load(current.value);
    await live();
    if(!record){
      send('state-changed');
      return {verified:true,status:'no_pending',message:'已读取当前提示词库，没有待核对的 AI 写入。'};
    }
    const applied=record.expectedEtag===current.etag;
    const notApplied=hashValid(record.beforeEtag)&&record.beforeEtag===current.etag;
    if(!applied&&!notApplied&&acknowledgeEtag!==current.etag){
      send('state-changed');
      return {verified:false,status:'uncertain',currentEtag:current.etag,
        message:'已读取当前列表，但它与上次写入前后两个版本都不同，不能证明旧操作成功或失败。请查看原工具中的记录，确认没有重复后再选择解除待核对；不会自动重放。'};
    }
    // Before dropping the recovery marker, rule out a newer operation.
    const latest=await readRecovery();
    if(latest?.instance!==record.instance||latest?.expectedEtag!==record.expectedEtag)
      throw failure('E_STORAGE_CONFLICT','新的待核对写入已出现，请重新读取');
    await api.storage.local.remove(PROMPT_AI_RECOVERY_KEY);
    send('state-changed');
    if(applied)return {verified:true,status:'applied',message:'上次写入与当前完整库版本一致，写入已确认；没有再次写入。'};
    if(notApplied)return {verified:true,status:'not_applied',message:'当前数据仍与写入前一致，已确认这次变更未保留；没有自动重试。'};
    return {verified:true,status:'acknowledged',
      message:'你已核对当前列表并解除旧的待核对状态。旧操作仍无法证明成功或失败，且不会自动重放。'};
    });
  }
  return Object.freeze({request,onGuardResponse,recovery,reconcile,dispose(){
    if(disposed)return;
    releaseGuard();disposed=true;
  }});
}
