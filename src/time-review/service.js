import {prepareTimeReviewDownload,registerTimeReviewFilenameResolver} from './download-naming.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
import {isReadingTocToolSender} from '../reading-toc/page.js';
import {TIME_REVIEW_KEY,readReview,reviewHost,reviewSettings,reviewClassify,reviewDay,localDay,settleReview,reviewSummary,reviewExport,MAX_OBSERVATION_GAP} from './model.js';
import {TIME_REVIEW_ID,TIME_REVIEW_PROTOCOL,TIME_REVIEW_CAPABILITY,TIME_REVIEW_ALARM,TIME_REVIEW_SESSION,TIME_REVIEW_OPERATIONS,timeReviewPackageHash} from './policy.js';
const error=(message,code='E_TIME_AUTHORITY')=>Object.assign(new Error(message),{code});

export function createTimeReviewService({api=globalThis.chrome,lockManager=globalThis.navigator?.locks,now=Date.now}={}){
  let session=null,activityGeneration=0,revocationGeneration=0,pendingRevocation=false;
  function invalidate({revoke=false}={}){activityGeneration++;if(revoke){revocationGeneration++;pendingRevocation=true;}}
  const locked=work=>{
    if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
    return lockManager.request('opendesk.sidebar-tools:tool:'+TIME_REVIEW_ID,work);
  };
  async function browserSession(){
    if(!session){
      const saved=await api.storage.session.get(TIME_REVIEW_SESSION);
      session=saved[TIME_REVIEW_SESSION]||crypto.randomUUID();
      if(!saved[TIME_REVIEW_SESSION])await api.storage.session.set({[TIME_REVIEW_SESSION]:session});
    }
    return session;
  }
  async function authority(){
    const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,TIME_REVIEW_KEY]);
    const rows=saved[SIDEBAR_TOOL_STORE];
    if(!Array.isArray(rows))return {saved,tool:null};
    const matches=rows.filter(tool=>tool?.id===TIME_REVIEW_ID);
    let tool=null;
    if(matches.length===1){try{tool=validateSidebarToolPackage(matches[0]);}catch{}}
    if(!tool?.capabilities.includes(TIME_REVIEW_CAPABILITY))tool=null;
    return {saved,tool,enabled:sidebarToolEnabled(saved[SIDEBAR_TOOL_ENABLE_STORE],TIME_REVIEW_ID),epoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.[TIME_REVIEW_ID]??null};
  }
  async function hostDocument(sender,expectedDocumentId=sender.documentId){
    // Chrome Side Panels may omit sender.documentId; pin the unique native
    // context ID for the whole request. TAB senders must supply their own ID.
    if(!isReadingTocToolSender(api,sender,TIME_REVIEW_ID)||sender.tab?.incognito||
      sender.frameId!==undefined&&sender.frameId!==0||sender.documentLifecycle&&sender.documentLifecycle!=='active'||sender.tab&&!sender.documentId)
      throw error('仅允许当前可信工具宿主访问时间记录');
    const type=sender.tab?'TAB':'SIDE_PANEL';
    const contexts=await api.runtime.getContexts({contextTypes:[type],documentUrls:[sender.url],...(sender.tab?{tabIds:[sender.tab.id]}:{})});
    const matches=contexts.filter(row=>row.contextType===type&&row.documentUrl===sender.url&&typeof row.documentId==='string'&&row.documentId&&
      (!expectedDocumentId||row.documentId===expectedDocumentId)&&row.frameId===0&&!row.incognito&&(!sender.tab||row.tabId===sender.tab.id));
    if(matches.length!==1)
      throw error('工具宿主文档已变化');
    return matches[0].documentId;
  }
  async function observe(state){
    if(!await api.permissions.contains({permissions:['idle']}))return {permitted:false,current:null};
    api.idle.setDetectionInterval(state.settings.idleSeconds);
    if(await api.idle.queryState(state.settings.idleSeconds)!=='active')return {permitted:true,current:null};
    const window=await api.windows.getLastFocused();
    if(!window?.focused||window.incognito||window.type!=='normal')return {permitted:true,current:null};
    const tabs=await api.tabs.query({active:true,windowId:window.id});
    const tab=tabs.length===1?tabs[0]:null,host=reviewHost(tab?.url);
    if(!host||tab.incognito||tab.pendingUrl||state.settings.excludedHosts.some(row=>host===row||host.endsWith('.'+row)))return {permitted:true,current:null};
    if(!await api.permissions.contains({origins:[new URL(tab.url).origin+'/*']}))return {permitted:true,current:null};
    return {permitted:true,current:{host,tabId:tab.id,windowId:window.id}};
  }
  async function reconcileLocked({boot=false,operation=null,payload=null,auth=null,at=now(),validateHost=null}={}){
    const observedGeneration=activityGeneration,observedRevocation=revocationGeneration;
    auth||=await authority();
    if(!auth.tool){await api.alarms.clear(TIME_REVIEW_ALARM);return null;}
    const hash=await timeReviewPackageHash(auth.tool),raw=auth.saved[TIME_REVIEW_KEY];
    let state=readReview(raw);
    const sessionId=await browserSession();
    let observation;
    try{observation=await observe(state);}catch{observation={permitted:false,current:null};}
    const authorized=auth.enabled&&state.authorizedHash===hash&&state.authorizedEpoch===auth.epoch&&observation.permitted;
    const cp=state.checkpoint,current=observation.current;
    const recover=boot&&cp&&(!current||current.host!==cp.host||current.tabId!==cp.tabId||current.windowId!==cp.windowId);
    state=settleReview(state,at,{session:sessionId,recover:!authorized||Boolean(recover)});
    if(!auth.enabled||!observation.permitted||state.authorizedHash&&(state.authorizedHash!==hash||state.authorizedEpoch!==auth.epoch)){state.paused=true;state.authorizedHash=null;state.authorizedEpoch=null;}
    if(operation==='time.start'){
      if(!observation.permitted)throw error('请在工具详情设置中授权浏览器空闲检测','E_TIME_PERMISSION');
      state.authorizedHash=hash;state.authorizedEpoch=auth.epoch;state.paused=false;
    }else if(operation==='time.pause')state.paused=true;
    else if(operation==='time.revoke'){state.paused=true;state.authorizedHash=null;state.authorizedEpoch=null;}
    else if(operation==='time.settings'){
      state.settings=reviewSettings(payload);observation=await observe(state);
    }else if(operation==='time.classify'){
      if(!payload||Object.keys(payload).sort().join(',')!=='category,host')throw error('分类请求参数无效','E_TIME_DATA');
      reviewClassify(state,payload);
    }else if(operation==='time.minuteConsent'){
      if(!payload||Object.keys(payload).join(',')!=='enabled'||typeof payload.enabled!=='boolean')
        throw error('分钟记录授权请求无效','E_TIME_DATA');
      state.minuteConsent=payload.enabled;
      if(!payload.enabled)state.minuteDays={};
    }else if(operation==='time.clear'){
      if(payload?.confirm!==true)throw error('请明确确认清空本机时间记录','E_TIME_CONFIRM');
      state.days={};state.discardedMs=0;state.minuteDays={};state.categories={};
    }
    const checkpointAt=Math.max(at,now());
    if(!state.paused&&state.authorizedHash===hash&&auth.enabled&&observation.current&&checkpointAt>=state.highWater){
      state.checkpoint={...observation.current,at:checkpointAt,session:sessionId,offset:new Date(checkpointAt).getTimezoneOffset()};
    }
    const final=await authority();
    if(!final.tool||!final.enabled||await timeReviewPackageHash(final.tool)!==hash||final.epoch!==auth.epoch){
      state.paused=true;state.authorizedHash=null;state.authorizedEpoch=null;state.checkpoint=null;
      if(!final.tool)return null;
    }
    if(validateHost)await validateHost();
    if(!await api.permissions.contains({permissions:['idle']})||pendingRevocation||observedRevocation!==revocationGeneration){
      state.paused=true;state.authorizedHash=null;state.authorizedEpoch=null;state.checkpoint=null;observation.permitted=false;
      if(operation==='time.start')throw error('观察期间空闲检测权限已撤销，请重新授权和开始','E_TIME_PERMISSION');
    }
    if(observedGeneration!==activityGeneration){
      state.checkpoint=null;
      if(operation==='time.start')throw error('浏览器活动状态已变化，请重新开始','E_TIME_OBSERVATION');
    }
    if(raw!==undefined||operation||state.authorizedHash){
      await writeVerifiedLocalValue(api,TIME_REVIEW_KEY,state,raw,'本机时间记录');
      // An OS event may arrive during a slow durable write. Retire that stale
      // checkpoint before unlocking; the queued event starts a fresh sample.
      if(observedGeneration!==activityGeneration){
        const committed=structuredClone(state);state.checkpoint=null;
        if(observedRevocation!==revocationGeneration){state.paused=true;state.authorizedHash=null;state.authorizedEpoch=null;}
        await writeVerifiedLocalValue(api,TIME_REVIEW_KEY,state,committed,'失效时间检查点');
      }
    }
    if(observedRevocation===revocationGeneration)pendingRevocation=false;
    if(state.authorizedHash&&!state.paused){
      if(!await api.alarms.get(TIME_REVIEW_ALARM))await api.alarms.create(TIME_REVIEW_ALARM,{periodInMinutes:0.5});
    }else await api.alarms.clear(TIME_REVIEW_ALARM);
    return {state,summary:{...reviewSummary(state,at),idlePermission:observation.permitted,maximumObservationGapMs:MAX_OBSERVATION_GAP}};
  }
  const tick=options=>locked(()=>reconcileLocked(options));
  async function dispatch(message,sender){
    if(message?.protocol!==TIME_REVIEW_PROTOCOL||message.toolId!==TIME_REVIEW_ID||!TIME_REVIEW_OPERATIONS.includes(message.operation)||
      typeof message.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(message.packageHash)||new TextEncoder().encode(JSON.stringify(message)).length>32000)
      throw error('时间工具请求无效');
    const documentId=await hostDocument(sender);
    return locked(async()=>{
      const auth=await authority();
      if(!auth.tool||!auth.enabled||await timeReviewPackageHash(auth.tool)!==message.packageHash||auth.epoch!==(message.installEpoch??null))
        throw error('工具已停用、更新、撤权或卸载','E_TOOL_CHANGED');
      await hostDocument(sender,documentId);
      const result=await reconcileLocked({operation:message.operation,payload:message.payload,auth,validateHost:()=>hostDocument(sender,documentId)});
      if(!result)throw error('工具已卸载');
      try{await hostDocument(sender,documentId);}catch(cause){throw error('宿主在提交期间变化；请恢复核对本机记录，不要盲目重试','E_OUTCOME_UNKNOWN');}
      if(message.operation==='time.day'){
        const date=message.payload?.date;
        if(!message.payload||Object.keys(message.payload).join(',')!=='date')
          throw error('按日期查询参数无效','E_TIME_DATA');
        const day=reviewDay(result.state,date);
        const end=new Date(result.summary.today+'T12:00:00'),earliest=new Date(end);
        earliest.setDate(earliest.getDate()-result.state.settings.retentionDays+1);
        if(date<localDay(earliest.getTime())||date>result.summary.today)
          throw error('查询日期超出本机保留范围','E_TIME_DATA');
        return day;
      }
      if(message.operation==='time.export'){
        if(!auth.tool.capabilities.includes('user.export'))throw error('工具没有导出权限');
        const file=reviewExport(result.state,message.payload?.format||'json');
        await hostDocument(sender,documentId);
        // Stage a short-lived, session-only intent before Chrome determines
        // the actual filename. Only this export may receive the filename hint.
        const options=await prepareTimeReviewDownload(api,file);
        const downloadId=await api.downloads.download(options);
        if(!Number.isInteger(downloadId))throw error('下载结果未知，请核对浏览器下载记录','E_OUTCOME_UNKNOWN');
        return {downloadId,name:file.name,state:'requested'};
      }
      return result.summary;
    });
  }
  return {tick,dispatch,invalidate};
}
export function installTimeReviewService({api=globalThis.chrome,...options}={}){
  const service=createTimeReviewService({api,...options}),removers=[];
  const listen=(event,fn)=>{event?.addListener(fn);removers.push(()=>event?.removeListener(fn));};
  removers.push(registerTimeReviewFilenameResolver(api));
  const run=options=>{void service.tick(options).catch(cause=>console.warn('E_TIME_REVIEW',cause.code||'E_TIME_DATA',cause.message));};
  listen(api.runtime.onMessage,(message,sender,reply)=>{
    if(message?.protocol!==TIME_REVIEW_PROTOCOL)return false;
    void service.dispatch(message,sender).then(data=>reply({ok:true,data}),cause=>reply({ok:false,error:{code:cause.code||'E_TIME_REVIEW',message:String(cause.message).slice(0,240)}}));return true;
  });
  listen(api.alarms.onAlarm,alarm=>{if(alarm.name===TIME_REVIEW_ALARM)run();});
  const activity=()=>{const at=options.now?.()??Date.now();service.invalidate();run({at});};
  listen(api.tabs.onActivated,activity);
  listen(api.tabs.onUpdated,(_id,change)=>{if(change.url||change.status==='complete')activity();});
  listen(api.tabs.onRemoved,activity);
  listen(api.windows.onFocusChanged,activity);
  listen(api.idle?.onStateChanged,activity);
  listen(api.permissions.onRemoved,removed=>{
    const at=options.now?.()??Date.now();service.invalidate({revoke:removed?.permissions?.includes('idle')||Boolean(removed?.origins?.length)});run({at});
  });
  listen(api.permissions.onAdded,activity);
  listen(api.runtime.onStartup,()=>run({boot:true}));
  listen(api.storage.onChanged,(changes,area)=>{
    if(area==='local'&&[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE].some(key=>Object.hasOwn(changes,key)))run();
  });
  run({boot:true});
  return {service,dispose(){for(const remove of removers)remove();}};
}
