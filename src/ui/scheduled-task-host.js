import {permissionPattern} from '../environment.js';

// The visible trusted tool.html Host is the only execution realm.
// The SW emits wake hints; this module never creates hidden documents.
export function createScheduledTaskHost({client,host,api=globalThis.chrome,clock=()=>Date.now(),
  onStatus=()=>{},onChange=()=>{},onRun=()=>{},pollMs=15000}){
  let disposed=false,busy=false,timer=null,lastStatus='等待计划',pollPending=false;
  const status=message=>{lastStatus=message;onStatus(message);};
  const uncertainFires=new Map();
  async function reconcileOriginal(fire){
    const scheduleId=fire.scheduleId??fire.definition?.scheduleId;
    if(!scheduleId)return false;
    try{
      for(let offset=0;offset<=100000;offset+=50){
        const page=await client.request('listScheduleHistory',{scheduleId,offset,limit:50});
        if(disposed||page?.scheduleId!==scheduleId)return false;
        const row=page.history?.find(row=>row.scheduleId===scheduleId&&row.fireId===fire.fireId);
        if(row){
          const previous=uncertainFires.get(fire.fireId);
          if(typeof row.runId!=='string'||!row.runId||typeof row.resultId!=='string'||!row.resultId||
            (previous?.runId&&previous.runId!==row.runId)||
            (previous?.resultId&&previous.resultId!==row.resultId))return false;
          uncertainFires.set(fire.fireId,{fire,runId:row.runId,resultId:row.resultId});
          if(['SUCCESS','FAILED','STOPPED'].includes(row.status)&&row.retirementState==='released'){
            status('本次任务已结束：'+row.status);
            uncertainFires.delete(fire.fireId);
            return true;
          }
          if(['RUNNING','SETTLING'].includes(row.status)){
            status((row.status==='RUNNING'?'定时任务运行中：':'定时任务结算中：')+row.runId);
            return true;
          }
          return false;
        }
        if(!page.hasMore)return false;
      }
    }catch{ /* Missing authoritative evidence remains ambiguous. */ }
    return false;
  }
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
    // Chrome may hide tab URL/document details immediately after an origin
    // grant is revoked. Classify that as a permission issue before mistaking
    // the invisible target for an ordinary WAITING_TARGET condition.
    const origin=new URL(definition.targetUrl).origin;
    const granted=typeof api.permissions?.contains==='function'&&
      await api.permissions.contains({origins:[permissionPattern(origin)]}).catch(()=>false);
    if(!granted){
      await client.request('setScheduleFireState',{fireId:fire.fireId,status:'NEEDS_ATTENTION'});
      status('目标网站权限不足；请在 Chrome 中明确重新授权');return;
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
    let started;
    try{
      started=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,
        revision:resolved.revision,contentHash:resolved.contentHash},
        params:definition.params,target,deadlineAt:Math.min(fire.deadlineAt,clock()+600000),
        requestId:fire.fireId,scheduledFireId:fire.fireId,
        ...(definition.owner?{expectedScheduleOwner:definition.owner}:{}),
        expectedTaskGeneration:definition.taskGeneration,
        expectedTaskInstallationId:definition.installationId});
      if(typeof started?.runId!=='string'||!started.runId)
        throw new Error('Original Controller RunId was not acknowledged');
    }catch(error){
      if(error?.code==='E_OWNER')throw error; // local/shared slot was denied
      uncertainFires.set(fire.fireId,{fire});
      if(await reconcileOriginal(fire))return;
      // A disconnected Host can conceal durable admission or web page effects.
      // Treat any other error after calling start as ambiguous; the repository
      // alone decides whether the original Fire was already ADMITTED.
      const uncertain=new Error('Controller 准入回执不确定，必须对账原 Run/Result');
      uncertain.code='E_EFFECT_UNKNOWN';
      uncertain.cause=error;
      throw uncertain;
    }
    const original={fire,runId:started.runId,resultId:started.resultId};
    onRun(started.runId);
    status('定时任务运行中：'+started.runId);
    onChange();
    // From this point the original Authority may already have ADMITTED
    // native page effects. A missing completion ack must never flow into
    // the pre-admission WAITING_TARGET/READY retry classification.
    try{
      const result=await host.completion;
      status(result?.pendingSettlement||result?.state==='paused_unknown'?
        '结果未知，禁止自动重试':
        '本次任务已结束：'+(result?.state??'待核对'));
      if(result?.pendingSettlement||result?.state==='paused_unknown'){
        uncertainFires.set(fire.fireId,original);
        await reconcileOriginal(fire);
      }
    }catch(error){
      // Keep the original FireId -> RunId/ResultId binding untouched.
      // Reconciliation queries the authoritative Run/Result; no new Run
      // or synthetic UNKNOWN receipt may be created from this UI.
      status('运行回执丢失；请检查原运行结果，已禁止自动重试');
      uncertainFires.set(fire.fireId,original);
      await reconcileOriginal(fire);
    }finally{
      onRun(null);
      onChange();
    }
  }
  async function poll(){
    if(busy||disposed)return;
    busy=true;
    try{
      for(const {fire} of uncertainFires.values()){
        if(!await reconcileOriginal(fire))status('执行回执不确定；已禁止自动重试');
      }
      const response=await client.request('listDueSchedules',{});
      for(const fire of response.fires||[]){
        if(disposed)break;
        if(uncertainFires.has(fire.fireId))continue;
        if(host.executionPending){status('正在运行其他任务；等待执行槽');break;}
        try{await attempt(fire);}
        catch(error){
          if(disposed)break;
          // A lost acknowledgement could hide a native page effect.
          // Never retry it just because this host lost its answer.
          if(error?.code==='E_OWNER'){status('等待执行槽释放');break;}
          if(error?.code==='E_EFFECT_UNKNOWN'){
            const recorded=await client.request('setScheduleFireState',{fireId:fire.fireId,status:'UNKNOWN'}).catch(()=>null);
            if(recorded?.fireId===fire.fireId&&recorded.status==='ADMITTED'&&await reconcileOriginal(fire))break;
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
