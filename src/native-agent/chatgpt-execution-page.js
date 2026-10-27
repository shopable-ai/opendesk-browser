import {verifyControllerTarget} from '../platform/target/index.js';

const fail=message=>Object.assign(new Error(message),{code:'E_BRIDGE_TARGET'});

// Trusted Side Panel only. The caller binds the source request and installation;
// the page never chooses a tab ID. This observes the existing run, not a new run.
export async function showChatGPTExecutionPage({api,client,host,runId,assertActive}){
  const current=async()=>{
    await assertActive();
    if(!runId||host.currentRun!==runId)throw fail('本次运行已结束或已更换，没有可查看的执行页面');
    const snapshot=await client.controller.snapshotControllerRun({runId});
    const run=snapshot?.run,target=run?.target;
    if(run?.runId!==runId||run.state!=='running'||run.retirementId||
      snapshot.resultDeliveryDenied?.includes(runId)||target?.mode!=='owned'||
      target.frameId!==0||!Number.isSafeInteger(target.tabId)||!target.documentId)
      throw fail('本次运行没有仍然有效的自有目标页面');
    return {...target};
  };
  const target=await current();
  let invalidated=false;
  const subscriptions=[];
  const watch=(event,listener)=>{
    if(!event?.addListener||!event?.removeListener)throw fail('浏览器无法核对执行页面的导航生命周期');
    event.addListener(listener);subscriptions.push(()=>event.removeListener(listener));
  };
  const navigation=details=>{if(details.tabId===target.tabId&&details.frameId===0)invalidated=true;};
  const removed=tabId=>{if(tabId===target.tabId)invalidated=true;};
  try{
    // Keep a navigation fence across the asynchronous source/install checks too.
    watch(api.webNavigation.onBeforeNavigate,navigation);
    watch(api.webNavigation.onCommitted,navigation);
    watch(api.tabs.onRemoved,removed);
    watch(api.tabs.onDetached,removed);
    watch(api.tabs.onReplaced,(added,old)=>{if(added===target.tabId||old===target.tabId)invalidated=true;});
    await verifyControllerTarget({api,target});
    const latest=await current();
    if(latest.tabId!==target.tabId||latest.documentId!==target.documentId||
      latest.targetSessionId!==target.targetSessionId||latest.targetVersion!==target.targetVersion)
      throw fail('执行页面已经导航或更换，请重新查看当前运行');
    await assertActive();
    // Observe the document after the last asynchronous authorization check.
    const observed=await verifyControllerTarget({api,target});
    if(invalidated||host.currentRun!==runId)throw fail('执行页面已经导航或运行结束，请重新查看当前运行');
    // Chrome has no atomic documentId-conditioned tab activation. Events fence
    // observed races; an ambiguous activation receipt is never retried.
    const tab=await api.tabs.update(target.tabId,{active:true});
    if(invalidated||tab?.id!==target.tabId||tab.active!==true||tab.incognito||tab.pendingUrl||tab.url!==observed.url)
      throw fail('执行页面切换回执未知，不会重新打开或自动重试');
    return {runId,tabId:target.tabId,shown:true};
  }finally{for(const unsubscribe of subscriptions)unsubscribe();}
}
