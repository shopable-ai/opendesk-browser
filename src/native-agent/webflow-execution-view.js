// OD-AI-WORKFLOW-BRIDGE: read-only foreground observation of an existing
// Controller Run. It NEVER creates a tab, Run, Result, or retries an effect.
import {verifyControllerTarget} from '../platform/target/index.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});

const sameTarget=(left,right)=>left?.tabId===right?.tabId&&
  left?.frameId===right?.frameId&&left?.documentId===right?.documentId&&
  left?.targetSessionId===right?.targetSessionId&&left?.targetVersion===right?.targetVersion&&
  left?.allowedOrigin===right?.allowedOrigin;

// Only trusted callers supply readRun/assertAuthorized/reserveActivation. All
// identities are read from original durable records, never from page arguments.
export async function activateWebFlowExecutionTarget({api,runId,readRun,assertAuthorized,
  reserveActivation,verifyTarget=verifyControllerTarget}={}){
  if(typeof readRun!=='function'||typeof assertAuthorized!=='function'||
    typeof reserveActivation!=='function'||typeof runId!=='string'||!runId)
    throw fail('E_WEB_TASK_VIEW','缺少原运行身份或可信验证');
  const first=await readRun(),run=first?.run,target=run?.target;
  if(run?.runId!==runId||run.state!=='running'||run.retirementId||
    first?.slot?.currentRunId!==runId||target?.mode!=='owned'||target.frameId!==0||
    !Number.isSafeInteger(target.tabId)||target.tabId<0||
    typeof target.documentId!=='string'||!target.documentId)
    throw fail('E_WEB_TASK_VIEW','当前没有可查看的原运行目标页面');
  let invalidated=false;
  const subscriptions=[];
  const watch=(event,listener)=>{
    if(!event?.addListener||!event?.removeListener)
      throw fail('E_WEB_TASK_VIEW','无法订阅目标页面的浏览器生命周期');
    event.addListener(listener);subscriptions.push(()=>event.removeListener(listener));
  };
  const navigation=info=>{if(info?.tabId===target.tabId&&info?.frameId===0)invalidated=true;};
  const removed=tabId=>{if(tabId===target.tabId)invalidated=true;};
  try{
    watch(api.webNavigation?.onBeforeNavigate,navigation);
    watch(api.webNavigation?.onCommitted,navigation);
    watch(api.tabs?.onRemoved,removed);
    watch(api.tabs?.onDetached,removed);
    watch(api.tabs?.onReplaced,(added,old)=>{if(added===target.tabId||old===target.tabId)invalidated=true;});
    await assertAuthorized();
    const observed=await verifyTarget({api,target});
    const current=await readRun();
    if(invalidated||current?.run?.runId!==runId||current.run.state!=='running'||
      current?.slot?.currentRunId!==runId||!sameTarget(current.run.target,target))
      throw fail('E_WEB_TASK_VIEW','运行已结束或目标身份改变，未激活');
    await assertAuthorized();
    const checked=await verifyTarget({api,target});
    if(invalidated||checked?.url!==observed?.url)
      throw fail('E_WEB_TASK_VIEW','目标文档已变更，未激活');
    // Durable one-shot fence is saved BEFORE the only Chrome activation. A lost
    // ACK is never retried, including after a worker restart.
    await reserveActivation();
    // Revocation or Run retirement after the durable view fence must cause a
    // no-effect UNKNOWN, never a second attempt on another tab.
    const last=await readRun();
    if(invalidated||last?.run?.runId!==runId||last.run.state!=='running'||
      last?.slot?.currentRunId!==runId||!sameTarget(last.run.target,target))
      throw fail('E_WEB_TASK_VIEW_UNKNOWN','最终运行身份已改变，不再触发标签激活');
    await assertAuthorized();
    const finalTarget=await verifyTarget({api,target});
    if(invalidated||finalTarget?.url!==checked.url)
      throw fail('E_WEB_TASK_VIEW_UNKNOWN','最终网页身份不一致，不再触发标签激活');
    const tab=await api.tabs.update(target.tabId,{active:true});
    if(invalidated||tab?.id!==target.tabId||tab.active!==true||tab.incognito||
      tab.pendingUrl||tab.url!==checked.url)
      throw fail('E_WEB_TASK_VIEW_UNKNOWN','激活结果未知；不会重新激活或重跑任务');
    return {runId,tabId:target.tabId,shown:true};
  }finally{for(const unsubscribe of subscriptions)unsubscribe();}
}
