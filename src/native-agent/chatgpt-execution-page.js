import {verifyControllerTarget} from '../platform/target/index.js';

const fail=message=>Object.assign(new Error(message),{code:'E_BRIDGE_TARGET'});

// Trusted Side Panel only. The caller binds the source request and installation;
// the page never chooses a tab ID. This observes the existing run, not a new run.
export async function showChatGPTExecutionPage({api,client,host,runId,assertActive,onActivation=()=>{}}){
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
    onActivation();
    const tab=await api.tabs.update(target.tabId,{active:true});
    if(invalidated||tab?.id!==target.tabId||tab.active!==true||tab.incognito||tab.pendingUrl||tab.url!==observed.url)
      throw fail('执行页面切换回执未知，不会重新打开或自动重试');
    return {runId,tabId:target.tabId,shown:true};
  }finally{for(const unsubscribe of subscriptions)unsubscribe();}
}

// Return is UI cleanup only: never navigate, recreate a closed chat, or retry an
// ambiguous activation. The caller revalidates the original exact document.
export async function returnToChatGPTSourcePage({api,source,windowId,assertSource,assertCurrent=()=>{}}){
  let invalidated=false;
  const subscriptions=[];
  const watch=(event,listener)=>{
    if(!event?.addListener||!event?.removeListener)throw fail('浏览器无法核对原聊天的导航生命周期');
    event.addListener(listener);subscriptions.push(()=>event.removeListener(listener));
  };
  const navigation=details=>{if(details.tabId===source.tabId&&details.frameId===0)invalidated=true;};
  const removed=id=>{if(id===source.tabId)invalidated=true;};
  try{
    watch(api.webNavigation.onBeforeNavigate,navigation);
    watch(api.webNavigation.onCommitted,navigation);
    watch(api.webNavigation.onHistoryStateUpdated,navigation);
    watch(api.webNavigation.onReferenceFragmentUpdated,navigation);
    watch(api.permissions.onRemoved,()=>{invalidated=true;});
    watch(api.tabs.onRemoved,removed);
    watch(api.tabs.onDetached,removed);
    watch(api.tabs.onReplaced,(added,old)=>{if(added===source.tabId||old===source.tabId)invalidated=true;});
    if(!await api.permissions.contains({origins:['https://chatgpt.com/*']}))throw fail('原聊天访问权限已撤销');
    await assertSource();
    const observed=await api.tabs.get(source.tabId);
    assertCurrent();
    if(invalidated||observed?.id!==source.tabId||observed.windowId!==windowId||
      observed.incognito||observed.pendingUrl||observed.url!==source.url)
      throw fail('原聊天已经关闭、导航或移出原窗口');
    const tab=await api.tabs.update(source.tabId,{active:true});
    if(invalidated||tab?.id!==source.tabId||tab.active!==true||tab.windowId!==windowId||
      tab.incognito||tab.pendingUrl||tab.url!==source.url)
      throw fail('返回原聊天的回执未知，不会重试');
    return {tabId:source.tabId,returned:true};
  }finally{for(const unsubscribe of subscriptions)unsubscribe();}
}
