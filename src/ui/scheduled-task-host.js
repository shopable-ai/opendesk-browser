// The visible trusted tool.html Host is the only execution realm.
// The SW emits wake hints; this module never creates hidden documents.
export function createScheduledTaskHost({client,host,api=globalThis.chrome,clock=()=>Date.now(),
  onStatus=()=>{},onChange=()=>{},onRun=()=>{},pollMs=15000}){
  let disposed=false,busy=false,timer=null,lastStatus='等待计划',pollPending=false;
  const status=message=>{lastStatus=message;onStatus(message);};
  async function observeTarget(url){
    const tabs=await api.tabs.query({});
    for(const tab of tabs){
      if(!Number.isSafeInteger(tab.id)||tab.incognito||tab.pendingUrl||
        tab.status!=='complete'||tab.url!==url)continue;
      const frames=await api.webNavigation.getAllFrames({tabId:tab.id});
      const root=frames?.find(row=>row.frameId===0&&row.url===url&&
        (!row.documentLifecycle||row.documentLifecycle==='active')&&typeof row.documentId==='string');
      if(root)return {mode:'borrowed',tabId:tab.id,frameId:0,
        documentId:root.documentId,expectedUrl:url};
    }
    return null;
  }
  async function attempt(fire){
    const definition=fire.definition;
    if(!definition||disposed)return;
    if(host.executionPending){status('执行槽占用；在截止前等待');return;}
    const resolved=await client.request('resolveInstalledTask',{taskId:definition.taskId});
    if(resolved.version!==definition.version||resolved.manifestHash!==definition.manifestHash||
      resolved.contentHash!==definition.sourceHash||
      resolved.installationId!==definition.installationId||
      resolved.generation!==definition.taskGeneration){
      await client.request('setScheduleFireState',{fireId:fire.fireId,status:'NEEDS_ATTENTION'});
      status('安装的任务或权限已经变更；需要处理');return;
    }
    const borrowed=await observeTarget(definition.targetUrl);
    if(!borrowed&&!definition.openIfMissing){
      await client.request('setScheduleFireState',{fireId:fire.fireId,status:'WAITING_TARGET'});
      status('等待符合计划 URL 的网页');return;
    }
    const target=borrowed??{mode:'owned',url:definition.targetUrl};
    status('正在启动已授权的定时任务');
    // Authority verifies the unforgeable persisted FireId in the SAME IDB
    // transaction that pins the revision and claims runs/@slot.
    const started=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,
      revision:resolved.revision,contentHash:resolved.contentHash},
      params:definition.params,target,deadlineAt:Math.min(fire.deadlineAt,clock()+600000),
      requestId:fire.fireId,scheduledFireId:fire.fireId,
      expectedTaskGeneration:definition.taskGeneration,
      expectedTaskInstallationId:definition.installationId});
    onRun(started.runId);
    status('定时任务运行中：'+started.runId);
    onChange();
    const result=await host.completion;
    onRun(null);
    status(result?.pendingSettlement||result?.state==='paused_unknown'?'结果未知，禁止自动重试':
      '本次任务已结束：'+(result?.state??'待核对'));
    onChange();
  }
  async function poll(){
    if(busy||disposed)return;
    busy=true;
    try{
      const response=await client.request('listDueSchedules',{});
      for(const fire of response.fires||[]){
        if(disposed)break;
        if(host.executionPending){status('正在运行其他任务；等待执行槽');break;}
        try{await attempt(fire);}
        catch(error){
          if(disposed)break;
          // A lost acknowledgement could hide a native page effect.
          // Never retry it just because this host lost its answer.
          if(error?.code==='E_OWNER'){status('等待执行槽释放');break;}
          if(error?.code==='E_EFFECT_UNKNOWN'){
            await client.request('setScheduleFireState',{fireId:fire.fireId,status:'UNKNOWN'}).catch(()=>{});
            status('执行回执不确定；已禁止自动重试');break;
          }
          if(['E_PERMISSION','E_REVISION','E_VERIFICATION','E_BUILTIN_VERSION_UNAVAILABLE'].includes(error?.code)){
            await client.request('setScheduleFireState',{fireId:fire.fireId,status:'NEEDS_ATTENTION'}).catch(()=>{});
            status('执行前安全检查未通过：'+error.message);break;
          }
          await client.request('setScheduleFireState',{fireId:fire.fireId,status:'WAITING_TARGET'}).catch(()=>{});
          status('等待目标或运行环境：'+(error?.message||String(error)));break;
        }
      }
    }catch(error){status('计划调度暂不可用：'+(error?.message||String(error)));}
    finally{busy=false;onChange();}
  }
  const unsubscribe=client.subscribeSchedule?.(()=>void poll());
  const connected=client.subscribeConnection?.(state=>{if(state.connected)void poll();});
  void client.ready.then(()=>poll()).catch(error=>status('运行页尚未连接：'+error.message));
  timer=setInterval(()=>void poll(),pollMs);
  return {poll,get status(){return lastStatus;},dispose(){
    disposed=true;clearInterval(timer);unsubscribe?.();connected?.();
  }};
}
