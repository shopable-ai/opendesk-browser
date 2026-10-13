// Trusted MV3 worker service. No sandbox may call Chrome DNR, idle or tabs.
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled}
  from '../ui/sidebar-tools/lifecycle.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
import {isReadingTocToolSender} from '../reading-toc/page.js';
import {FOCUS_ID,FOCUS_STORE,FOCUS_PROTOCOL,FOCUS_CAPABILITY,FOCUS_ALARM,FOCUS_SESSION,
  FOCUS_OPERATIONS,FOCUS_MAX_SITES,FOCUS_PAGE_NOTICE_PROTOCOL,focusPackageHash,focusHost,focusNextMidnight,focusRemovedOriginAffectsSite,focusError} from './policy.js';
import {readFocus,emptyFocus,focusSite,focusSiteScopesValid,focusSchedule,focusMatchingSite,focusReason,
  focusSummary,settleFocus,focusPool,focusDueReminder} from './model.js';
import {FOCUS_DEFAULT_GROUP,FOCUS_DEFAULT_MINUTES,focusDefaultSites} from './catalog.js';
import {wantedFocusRules,reconcileFocusRules,clearFocusRules} from './rule-host.js';

const hasOnly=(payload,names)=>payload&&typeof payload==='object'&&!Array.isArray(payload)&&
  Object.keys(payload).sort().join(',')===names.slice().sort().join(',');
const requirePayload=(value,names)=>{if(!hasOnly(value,names))throw focusError('专注设置参数不完整或无效');};
async function clearPageNotices(api){
  if(!api.tabs?.sendMessage)return;
  let tabs;
  try{tabs=await api.tabs.query({});}catch{return;}
  await Promise.all(tabs.filter(tab=>Number.isInteger(tab?.id)&&!tab.incognito).slice(0,200)
    .map(tab=>Promise.resolve().then(()=>api.tabs.sendMessage(tab.id,
      {protocol:FOCUS_PAGE_NOTICE_PROTOCOL,kind:'clear'},{frameId:0})).catch(()=>{})));
}
export function createStayFocusService({api=globalThis.chrome,lockManager=globalThis.navigator?.locks,now=Date.now}={}){
  let session=null,generation=0,settledGeneration=-1,revoked=false;
  // Browser events invalidate any previous foreground checkpoint even when
  // two focus/tab transitions are processed after Chrome has returned to the
  // original tab. The next observation starts a fresh conservative interval.
  const lock=work=>{
    if(!lockManager?.request)throw focusError('缺少可信存储互斥锁','E_TOOL_LOCK');
    return lockManager.request('opendesk.sidebar-tools:tool:'+FOCUS_ID,work);
  };
  const invalidate=({revoke=false}={})=>{generation++;if(revoke)revoked=true;};
  async function browserSession(){
    if(session)return session;
    const saved=(await api.storage.session.get(FOCUS_SESSION))[FOCUS_SESSION];
    session=typeof saved==='string'&&saved.length<100?saved:crypto.randomUUID();
    if(session!==saved)await api.storage.session.set({[FOCUS_SESSION]:session});
    return session;
  }
  async function authority(){
    const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,
      TOOL_REVOCATION_EPOCHS_STORE,FOCUS_STORE]);
    const rows=saved[SIDEBAR_TOOL_STORE],matches=Array.isArray(rows)?rows.filter(row=>row?.id===FOCUS_ID):[];
    let tool=null;
    if(matches.length===1){try{tool=validateSidebarToolPackage(matches[0]);}catch{}}
    if(!tool?.capabilities.includes(FOCUS_CAPABILITY))tool=null;
    return {tool,saved,enabled:sidebarToolEnabled(saved[SIDEBAR_TOOL_ENABLE_STORE],FOCUS_ID),
      epoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.[FOCUS_ID]??null};
  }
  async function hostDocument(sender,expectedDocumentId=sender?.documentId){
    if(!isReadingTocToolSender(api,sender,FOCUS_ID)||sender.tab?.incognito||
       sender.frameId!==undefined&&sender.frameId!==0||
       sender.documentLifecycle&&sender.documentLifecycle!=='active'||
       sender.tab&&!sender.documentId)
      throw focusError('仅受信任的当前工具宿主可更改专注策略','E_FOCUS_SENDER');
    const type=sender.tab?'TAB':'SIDE_PANEL';
    const contexts=await api.runtime.getContexts({contextTypes:[type],documentUrls:[sender.url],
      ...(sender.tab?{tabIds:[sender.tab.id]}:{})});
    const matches=contexts.filter(row=>row.contextType===type&&row.documentUrl===sender.url&&
      typeof row.documentId==='string'&&row.documentId&&(!expectedDocumentId||row.documentId===expectedDocumentId)&&
      row.frameId===0&&!row.incognito&&(!sender.tab||row.tabId===sender.tab.id));
    if(matches.length!==1)throw focusError('可信工具文档已经变化','E_FOCUS_SENDER');
    return matches[0].documentId;
  }
  async function permissionStatus(){
    const [idle,dnr]=await Promise.all([
      api.permissions.contains({permissions:['idle']}),
      api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']})
    ]);
    return {idle,dnr,ready:Boolean(idle&&dnr)};
  }
  async function observe(state,permissions){
    if(!permissions.ready)return null;
    if(await api.idle.queryState(60)!=='active')return null;
    const win=await api.windows.getLastFocused();
    if(!win?.focused||win.incognito||win.type!=='normal')return null;
    const tabs=await api.tabs.query({active:true,windowId:win.id}),tab=tabs.length===1?tabs[0]:null;
    if(!tab?.url||tab.incognito||tab.pendingUrl)return null;
    const host=focusHost(tab.url),site=focusMatchingSite(state,host);
    if(!site)return null;
    const address=new URL(tab.url),originPattern=address.protocol+'//'+address.hostname+'/*';
    if(!await api.permissions.contains({origins:[originPattern]}))return null;
    return {host,site,tabId:tab.id,windowId:win.id};
  }
  function mutate(state,operation,payload,at){
    if(operation==='focus.enable'){
      requirePayload(payload,[]);
      state.enabled=true;
    }else if(operation==='focus.disable'){
      requirePayload(payload,[]);
      state.enabled=false;state.checkpoint=null;state.authorizedHash=null;state.authorizedEpoch=null;
    }else if(operation==='focus.site.put'){
      requirePayload(payload,['site']);
      const raw=payload.site;if(!raw||typeof raw.host!=='string')throw focusError('请提供域名和额度');
      const site=focusSite({...raw,host:focusHost(raw.host)});
      if(site.group===FOCUS_DEFAULT_GROUP&&!Object.hasOwn(state.groups,FOCUS_DEFAULT_GROUP))
        state.groups[FOCUS_DEFAULT_GROUP]=FOCUS_DEFAULT_MINUTES;
      if(site.group&&!Object.hasOwn(state.groups,site.group))throw focusError('请先创建共享额度组');
      const index=state.sites.findIndex(row=>row.host===site.host);
      if(index<0){if(state.sites.length>=FOCUS_MAX_SITES)throw focusError('最多可添加 60 个网站');state.sites.push(site);}
      else state.sites[index]=site;
      if(!focusSiteScopesValid(state.sites))
        throw focusError('包含子域名的父网站覆盖了精确子网站：请将子网站设为“包含子域名”，再保存','E_FOCUS_SCOPE_OVERLAP');
    }else if(operation==='focus.site.remove'){
      requirePayload(payload,['host']);
      const host=focusHost(payload.host);
      if(!host)throw focusError('域名无效');
      state.sites=state.sites.filter(row=>row.host!==host);
      delete state.usage['s:'+host];
    }else if(operation==='focus.group.put'){
      requirePayload(payload,['id','minutes']);
      const {id,minutes}=payload;
      if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,23}$/.test(id)||
        !Number.isInteger(minutes)||minutes<1||minutes>1440||
        (!Object.hasOwn(state.groups,id)&&Object.keys(state.groups).length>=20))
        throw focusError('共享额度组 ID 或分钟数无效');
      state.groups[id]=minutes;
    }else if(operation==='focus.group.remove'){
      requirePayload(payload,['id']);
      if(typeof payload.id!=='string'||!/^[a-z][a-z0-9-]{0,23}$/.test(payload.id)||
         state.sites.some(row=>row.group===payload.id))
        throw focusError('先解除网站与额度组的关联');
      delete state.groups[payload.id];delete state.usage['g:'+payload.id];
    }else if(operation==='focus.schedule.set'){
      requirePayload(payload,['schedule']);
      state.schedule=focusSchedule(payload.schedule);
    }else if(operation==='focus.whitelist.set'){
      requirePayload(payload,['hosts']);
      if(!Array.isArray(payload.hosts)||payload.hosts.length>50)
        throw focusError('白名单最多 50 个域名');
      const hosts=payload.hosts.map(focusHost);
      if(hosts.some(host=>!host)||new Set(hosts).size!==hosts.length)
        throw focusError('白名单域名重复或无效');
      state.whitelist=hosts;
    }else if(operation==='focus.session.start'){
      requirePayload(payload,['minutes']);
      if(!state.enabled)throw focusError('请先从可信设置开启网站限制','E_FOCUS_NOT_ENABLED');
      if(!Number.isInteger(payload.minutes)||payload.minutes<1||payload.minutes>240)
        throw focusError('专注时长必须在 1–240 分钟之间');
      state.focusUntil=at+payload.minutes*60000;
    }else if(operation==='focus.session.stop'){
      requirePayload(payload,[]);
      state.focusUntil=null;
    }else if(operation==='focus.clear'){
      requirePayload(payload,['confirm']);
      if(payload.confirm!==true)throw focusError('清空本机专注数据需要确认','E_FOCUS_CONFIRM');
      return emptyFocus(at);
    }else if(operation!=='focus.status')throw focusError('不支持的专注操作');
    if(!['focus.status','focus.enable','focus.disable'].includes(operation)){
      state.notices.revision++;
      state.notices.budgetMs=null;state.notices.thresholds=[];
    }
    return state;
  }
  async function updateBlockedTabs(state,at){
    let moved=0,failed=0;
    if(!state.enabled)return {moved,failed};
    // Existing tabs are not automatically retroactively redirected by DNR.
    // On any transition to a new block state, move them to a fixed internal page.
    const all=await api.tabs.query({});
    for(const tab of all){
      if(!tab?.url||tab.incognito||!Number.isInteger(tab.id))continue;
      const host=focusHost(tab.url),site=focusMatchingSite(state,host),reason=focusReason(state,site,at);
      if(!reason)continue;
      try{
        await api.tabs.update(tab.id,{url:api.runtime.getURL('stay-focus/blocked-'+reason+'.html')});
        moved++;
      }catch{failed++;}
    }
    return {moved,failed};
  }
  async function reconcileLocked({boot=false,operation='focus.status',payload={},auth=null,validateHost=null,removedOrigins=[]}={}){
    const at=now(),startGeneration=generation,wasRevoked=revoked;
    auth??=await authority();
    if(!auth.tool){
      await api.alarms.clear(FOCUS_ALARM);
      // A removed tool must not leave an orphan in-page reminder. On every
      // lifecycle boot/revocation, clear displays without touching other tools.
      if(boot||wasRevoked)await clearPageNotices(api);
      // A never-installed tool must not require the optional DNR permission.
      // Chrome removes associated rules on a native permission revocation.
      if(await api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']}))
        await clearFocusRules(api);
      // A retired tool should not broadcast a clear to every tab forever.
      // Retire this observation epoch after the lifecycle cleanup succeeded.
      if(startGeneration===generation){revoked=false;settledGeneration=startGeneration;}
      return null;
    }
    const hash=await focusPackageHash(auth.tool),raw=auth.saved[FOCUS_STORE];
    let state;
    try{state=readFocus(raw,at);}
    catch(cause){
      // Invalid durable data is preserved, but cannot keep websites blocked
      // or retain an outdated in-page reminder.
      await api.alarms.clear(FOCUS_ALARM);
      await clearPageNotices(api);
      if(await api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']}))
        await clearFocusRules(api);
      throw cause;
    }
    // Only genuinely new, never-configured installations receive automatic
    // enrollment. A pre-existing custom/empty policy is never silently widened.
    if(operation==='focus.enable'&&raw===undefined){
      state.groups[FOCUS_DEFAULT_GROUP]=FOCUS_DEFAULT_MINUTES;
      state.sites=focusDefaultSites();
    }
    // A Chrome site-access revocation applies only to intersecting restrictions.
    // Keep other sites and Time Review completely independent. Regranting Chrome
    // host access must not silently re-enable previously revoked restrictions.
    if(Array.isArray(removedOrigins)&&removedOrigins.length){
      let affected=false;
      for(const site of state.sites){
        if(site.enabled&&removedOrigins.some(origin=>focusRemovedOriginAffectsSite(origin,site))){
          site.enabled=false;affected=true;
        }
      }
      if(affected)state.checkpoint=null;
    }
    let permissions;
    try{permissions=await permissionStatus();}
    catch{permissions={idle:false,dnr:false,ready:false};}
    const authorized=state.authorizedHash===hash&&state.authorizedEpoch===auth.epoch;
    const allowFreshEnable=operation==='focus.enable'&&permissions.ready;
    if(!auth.enabled||!permissions.ready||!authorized||(wasRevoked&&!allowFreshEnable)){
      state.enabled=false;state.checkpoint=null;
      if(!auth.enabled||!permissions.ready||!authorized){
        state.authorizedHash=null;state.authorizedEpoch=null;
      }
    }
    let current=null;
    try{current=await observe(state,permissions);}catch{current=null;}
    const session=await browserSession();
    // Event delivery and lock acquisition may lag behind a fast blur/re-focus
    // or tab switch and return. Never bill an old checkpoint across an event.
    const chargedPool=current?.site?focusPool(current.site):null;
    const usedBefore=chargedPool?(state.usage[chargedPool]||0):0,dayBefore=state.day;
    settleFocus(state,{at,session,current,boot:boot||startGeneration!==settledGeneration});
    if(operation!=='focus.status'){
      if(!auth.enabled)throw focusError('工具已停用','E_TOOL_DISABLED');
      if(operation==='focus.enable'){
        if(!permissions.ready)throw focusError('需在可信设置中批准 DNR 和空闲检测','E_FOCUS_PERMISSION');
        state.authorizedHash=hash;state.authorizedEpoch=auth.epoch;
      }
      state=mutate(state,operation,payload,at);
      // A newly enabled tool starts a clean checkpoint, never borrows idle time.
      if(operation==='focus.enable')state.checkpoint=null;
    }
    if(state.focusUntil!==null&&at>=state.focusUntil)state.focusUntil=null;
    const final=await authority();
    if(!final.tool||!final.enabled||await focusPackageHash(final.tool)!==hash||final.epoch!==auth.epoch){
      state.enabled=false;state.checkpoint=null;state.authorizedHash=null;state.authorizedEpoch=null;
    }
    if(validateHost)await validateHost();
    let fresh;
    try{fresh=await permissionStatus();}catch{fresh={ready:false,idle:false,dnr:false};}
    if(!fresh.ready||startGeneration!==generation||(revoked&&!allowFreshEnable)){
      state.checkpoint=null;
      if(!fresh.ready||(revoked&&!allowFreshEnable)){
        state.enabled=false;state.authorizedHash=null;state.authorizedEpoch=null;
      }
      if(operation==='focus.enable'&&!fresh.ready)
        throw focusError('Chrome 权限在操作期间被撤销','E_FOCUS_PERMISSION');
    }
    const usedAfter=chargedPool?(state.usage[chargedPool]||0):0;
    const reminder=operation==='focus.status'&&state.enabled&&fresh.ready&&
      current&&dayBefore===state.day&&usedAfter>usedBefore?
      focusDueReminder(state,current.site,usedBefore,usedAfter):null;
    if(raw!==undefined||operation!=='focus.status'){
      await writeVerifiedLocalValue(api,FOCUS_STORE,state,raw,'本机专注策略');
    }
    // Durable policy is authoritative; DNR is a materialized, reconcilable view.
    const desired=state.enabled&&fresh.ready?wantedFocusRules(state,at):[];
    // Without the optional native permission even read-only DNR calls may be
    // rejected. The tool must still display a permission-needed state.
    // Chrome automatically invalidates rules when native permission is removed.
    const ruleReceipt=fresh.dnr?await reconcileFocusRules(api,desired):
      {changed:false,ruleIds:[],verified:false,reason:'native-permission-missing'};
    if(state.enabled&&fresh.ready){
      if(!await api.alarms.get(FOCUS_ALARM))await api.alarms.create(FOCUS_ALARM,{periodInMinutes:0.5});
    }else await api.alarms.clear(FOCUS_ALARM);
    // Avoid tab churn on every heartbeat: only act if the matching set changed.
    let tabs={moved:0,failed:0};
    if(ruleReceipt.changed&&desired.length)tabs=await updateBlockedTabs(state,at);
    // A page is only a display target. At-most-once is committed with the
    // authoritative ledger BEFORE attempting delivery; an unreachable page
    // cannot create a duplicate alert after the worker or browser restarts.
    if(reminder&&api.tabs?.get&&api.tabs?.sendMessage){
      try{
        const tab=await api.tabs.get(current.tabId);
        if(tab?.active&&!tab.incognito&&tab.windowId===current.windowId&&
           focusHost(tab.url)===current.host){
          await api.tabs.sendMessage(current.tabId,
            {protocol:FOCUS_PAGE_NOTICE_PROTOCOL,kind:'threshold',...reminder},{frameId:0});
        }
      }catch{/* Content script may be unavailable; never weaken DNR. */}
    }
    if(['focus.disable','focus.clear'].includes(operation)||removedOrigins.length||
       (raw?.enabled===true&&!state.enabled))await clearPageNotices(api);
    // Advance this epoch only after durable policy and native rule reconciliation
    // succeed. A failure must not make a stale checkpoint billable on retry.
    if(startGeneration===generation){
      revoked=false;settledGeneration=startGeneration;
    }
    return {...focusSummary(state,at),permissions:fresh,ruleReceipt,tabs};
  }
  const tick=options=>lock(()=>reconcileLocked(options));
  async function dispatch(message,sender){
    if(message?.protocol!==FOCUS_PROTOCOL||message.toolId!==FOCUS_ID||
       !FOCUS_OPERATIONS.includes(message.operation)||typeof message.packageHash!=='string'||
       !/^[a-f0-9]{64}$/.test(message.packageHash)||
       JSON.stringify(message).length>32000)
      throw focusError('Stay Focus 请求格式无效','E_FOCUS_REQUEST');
    const documentId=await hostDocument(sender);
    return lock(async()=>{
      const auth=await authority();
      if(!auth.tool||!auth.enabled||await focusPackageHash(auth.tool)!==message.packageHash||
         auth.epoch!==(message.installEpoch??null))throw focusError('工具已经更新、撤权、停用或卸载','E_TOOL_CHANGED');
      await hostDocument(sender,documentId);
      const result=await reconcileLocked({operation:message.operation,payload:message.payload,auth,
        validateHost:()=>hostDocument(sender,documentId)});
      if(!result)throw focusError('工具已卸载','E_TOOL_CHANGED');
      await hostDocument(sender,documentId);
      return result;
    });
  }
  return {tick,dispatch,invalidate};
}
export function installStayFocusService({api=globalThis.chrome,...options}={}){
  const service=createStayFocusService({api,...options}),removers=[];
  const listen=(event,fn)=>{event?.addListener(fn);removers.push(()=>event?.removeListener(fn));};
  const run=opts=>{void service.tick(opts).catch(error=>console.warn('E_FOCUS_RECONCILE',
    error?.code||'E_FOCUS',String(error?.message||error).slice(0,200)));};
  listen(api.runtime.onMessage,(message,sender,reply)=>{
    if(message?.protocol!==FOCUS_PROTOCOL)return false;
    void service.dispatch(message,sender).then(data=>reply({ok:true,data}),
      error=>reply({ok:false,error:{code:error?.code||'E_FOCUS',message:String(error?.message||error).slice(0,240)}}));
    return true;
  });
  listen(api.alarms.onAlarm,alarm=>{if(alarm.name===FOCUS_ALARM)run();});
  const activity=()=>{service.invalidate();run();};
  listen(api.tabs.onActivated,activity);
  listen(api.tabs.onUpdated,(_id,change)=>{if(change.url||change.status==='complete')activity();});
  listen(api.tabs.onRemoved,activity);
  listen(api.windows.onFocusChanged,activity);
  listen(api.idle?.onStateChanged,activity);
  listen(api.permissions.onRemoved,removed=>{
    const nativeRevoked=Boolean(removed?.permissions?.some(name=>
      ['idle','declarativeNetRequestWithHostAccess'].includes(name)));
    const removedOrigins=Array.isArray(removed?.origins)?removed.origins.slice(0,128):[];
    service.invalidate({revoke:nativeRevoked});
    run({removedOrigins});
  });
  listen(api.permissions.onAdded,activity);
  listen(api.runtime.onStartup,()=>run({boot:true}));
  listen(api.storage.onChanged,(changes,area)=>{
    // A tool uninstall may remove its entire business record before reconcile
    // observes it. Clear the short-lived page notice from that event directly.
    if(area==='local'&&changes[SIDEBAR_TOOL_STORE]){
      const oldRows=changes[SIDEBAR_TOOL_STORE].oldValue;
      const newRows=changes[SIDEBAR_TOOL_STORE].newValue;
      if(Array.isArray(oldRows)&&oldRows.some(row=>row?.id===FOCUS_ID)&&
         !(Array.isArray(newRows)&&newRows.some(row=>row?.id===FOCUS_ID)))
        void clearPageNotices(api);
    }
    if(area==='local'&&[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]
      .some(key=>Object.hasOwn(changes,key))){service.invalidate({revoke:true});run({boot:true});}
  });
  run({boot:true});
  return {service,dispose(){for(const remove of removers)remove();}};
}
