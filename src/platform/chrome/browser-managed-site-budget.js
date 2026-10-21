// One precompiled finite site-budget capability in the existing MV3 Service Worker.
// The original Sidebar Tool registry/epoch is authoritative. This is only a
// native-resource ledger, not another app installer, scheduler or JS runtime.
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash,MAX_INSTALLED_TOOLS}
  from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../sidebar-tools/official-reading-toc.js';
import {readManagedSiteToolAuthority,assertManagedSiteToolLease}
  from '../host/managed-site-authority.js';
import {MANAGED_SITE_RUNTIME_CONTRACT,MANAGED_SITE_BUDGET_CAPABILITY,MANAGED_SITE_BUDGET_PROTOCOL}
  from '../host/managed-site-runtime-contract.js';
import {normalizeManagedSiteBudgetSettings,SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2}
  from '../../ui/sidebar-tools/background-policy.js';
import {writeVerifiedLocalValue,sameStorageValue} from '../../ui/sidebar-tools/storage-state.js';
import {isSidebarToolHostSender} from '../../sidebar-tools/sender.js';
import {observeManagedForeground,settleManagedSiteBudget,reconcileManagedDynamicRules}
  from './browser-managed-site-policy.js';
import {subscribeManagedSiteActivity} from './managed-site-lifecycle.js';

export const MANAGED_SITE_BUDGET_STORE='opendesk.browser.site-budget.resources.v1';
export const MANAGED_SITE_BUDGET_ALARM='opendesk.browser.site-budget.tick.v1';
const SESSION_KEY='opendesk.browser.site-budget.session.v1';
export const MANAGED_SITE_BUDGET_RULE_FIRST=752000;
export const MANAGED_SITE_BUDGET_RULES_PER_OWNER=40;
const CAPACITY=MAX_INSTALLED_TOOLS, PERIOD=0.5;
const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const defaultSettings=()=>({enabled:false,dailyMinutes:60,sites:[],
  schedule:{enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020}});
const dayAt=at=>{const date=new Date(at),part=value=>String(value).padStart(2,'0');
  return date.getFullYear()+'-'+part(date.getMonth()+1)+'-'+part(date.getDate());};
const sourceId=(saved,id)=>{
  const sources=saved[MARKET_PROVENANCE_STORE];
  if(sources!==undefined&&!plain(sources))fail('E_STORAGE_CORRUPT','安装来源记录损坏');
  const row=sources?.[id];
  if(row===undefined)return null;
  if(!plain(row)||typeof row.marketId!=='string'||
     !/^opendesk\/[a-z][a-z0-9-]{1,39}$/.test(row.marketId)||
     row.marketId!=='opendesk/'+id||!/^[a-f0-9]{64}$/.test(row.sha256))
    fail('E_STORAGE_CORRUPT','安装来源身份损坏');
  return row;
};
const ruleRange=slot=>({
  first:MANAGED_SITE_BUDGET_RULE_FIRST+slot*MANAGED_SITE_BUDGET_RULES_PER_OWNER,
  last:MANAGED_SITE_BUDGET_RULE_FIRST+(slot+1)*MANAGED_SITE_BUDGET_RULES_PER_OWNER-1
});
const owns=(slot,id)=>Number.isInteger(id)&&id>=ruleRange(slot).first&&id<=ruleRange(slot).last;
const signature=rule=>{
  const condition={...(rule.condition||{})};
  if(condition.isUrlFilterCaseSensitive===false)delete condition.isUrlFilterCaseSensitive;
  return JSON.stringify([rule.id,rule.priority,rule.action,condition]);
};
function readLedger(value){
  if(value===undefined)return {};
  if(!plain(value)||Object.keys(value).length>CAPACITY)fail('E_STORAGE_CORRUPT','受管资源账本损坏');
  const used=new Set();
  for(const [id,row] of Object.entries(value)){
    if(!idPattern.test(id)||!plain(row)||!Number.isInteger(row.slot)||row.slot<0||
       row.slot>=CAPACITY||used.has(row.slot)||
       !(row.source===null||typeof row.source==='string'&&/^opendesk\/[a-z][a-z0-9-]+$/.test(row.source))||
       !(row.epoch===null||typeof row.epoch==='string'&&row.epoch.length<=100)||
       typeof row.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(row.packageHash)||
       !Number.isSafeInteger(row.desiredPolicyRev)||row.desiredPolicyRev<0||
       !Number.isSafeInteger(row.appliedPolicyRev)||row.appliedPolicyRev<0||
       row.appliedPolicyRev>row.desiredPolicyRev||
       !['inactive','applied','missing-permission','reconciling','cleanup-pending','unknown'].includes(row.status)||
       typeof row.day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(row.day)||
       !Number.isSafeInteger(row.clockHighWater)||row.clockHighWater<0||
       !plain(row.usage)||Object.keys(row.usage).some(key=>key!=='daily')||
       (row.usage.daily!==undefined&&(!Number.isFinite(row.usage.daily)||row.usage.daily<0||row.usage.daily>86400000))||
       !(row.checkpoint===null||plain(row.checkpoint)&&
         Object.keys(row.checkpoint).sort().join(',')==='at,day,host,offset,pool,session,tabId,windowId'&&
         typeof row.checkpoint.host==='string'&&row.checkpoint.host.length<=253&&
         Number.isInteger(row.checkpoint.tabId)&&row.checkpoint.tabId>=0&&
         Number.isInteger(row.checkpoint.windowId)&&row.checkpoint.windowId>=0&&
         row.checkpoint.pool==='daily'&&typeof row.checkpoint.day==='string'&&
         /^\d{4}-\d\d-\d\d$/.test(row.checkpoint.day)&&
         Number.isSafeInteger(row.checkpoint.at)&&row.checkpoint.at>=0&&
         Number.isInteger(row.checkpoint.offset)&&Math.abs(row.checkpoint.offset)<=840&&
         typeof row.checkpoint.session==='string'&&row.checkpoint.session.length<=100))
      fail('E_STORAGE_CORRUPT','受管应用资源记录无效；没有自动覆盖');
    normalizeManagedSiteBudgetSettings(row.settings);
    used.add(row.slot);
  }
  return value;
}
const initial=(slot,epoch,source,packageHash,at)=>({slot,epoch,source,packageHash,settings:defaultSettings(),
  desiredPolicyRev:0,appliedPolicyRev:0,status:'inactive',day:dayAt(at),
  clockHighWater:0,usage:{},checkpoint:null});
const hostFromUrl=url=>{
  try{const value=new URL(url);return ['http:','https:'].includes(value.protocol)?
    value.hostname.toLowerCase():null;}catch{return null;}
};
const selectedSite=(settings,host)=>settings.sites.find(site=>host===site||host?.endsWith('.'+site))||null;
const scheduleActive=(schedule,at)=>{
  if(!schedule.enabled)return false;
  const date=new Date(at),day=date.getDay(),minute=date.getHours()*60+date.getMinutes();
  if(schedule.startMinute<schedule.endMinute)
    return schedule.days.includes(day)&&minute>=schedule.startMinute&&minute<schedule.endMinute;
  return schedule.days.includes(day)&&minute>=schedule.startMinute||
    schedule.days.includes((day+6)%7)&&minute<schedule.endMinute;
};
const blocked=(row,at)=>scheduleActive(row.settings.schedule,at)||
  (row.usage.daily||0)>=row.settings.dailyMinutes*60000;
const desiredRules=(row,at)=>row.settings.enabled&&blocked(row,at)?
  row.settings.sites.map((host,index)=>({id:ruleRange(row.slot).first+index,priority:10,
    action:{type:'block'},condition:{requestDomains:[host],resourceTypes:['main_frame']}})):[];
const currentPermission=api=>Promise.all([
  api.permissions.contains({permissions:['idle']}),
  api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']})
]).then(([idle,dnr])=>({idle,dnr,ready:idle&&dnr}));
const safeStatus=(row,permission)=>({contract:MANAGED_SITE_RUNTIME_CONTRACT,
  kind:SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2,desiredPolicyRev:row?.desiredPolicyRev??0,
  appliedPolicyRev:row?.appliedPolicyRev??0,status:row?.status??'inactive',
  settings:row?.settings??defaultSettings(),usedMs:row?.usage.daily||0,
  remainingMs:Math.max(0,(row?.settings.dailyMinutes||60)*60000-(row?.usage.daily||0)),
  permissions:permission});

export function createManagedSiteBudgetService({
  api=globalThis.chrome,lockManager=globalThis.navigator?.locks,now=Date.now
}={}){
  let session=null,generation=0,settledGeneration=-1,permissionRevoked=false;
  if(!lockManager?.request)fail('E_TOOL_LOCK','受管后台需要 Chrome Web Locks');
  const ownerLock=(id,work)=>lockManager.request('opendesk.sidebar-tools:tool:'+id,work);
  const resourceLock=work=>lockManager.request('opendesk.browser:managed-site-budget',work);
  const sessionId=async()=>{
    if(session)return session;
    const value=(await api.storage.session.get(SESSION_KEY))[SESSION_KEY];
    session=typeof value==='string'&&value.length<100?value:crypto.randomUUID();
    if(session!==value)await api.storage.session.set({[SESSION_KEY]:session});
    return session;
  };
  async function resourceRead(){
    const raw=(await api.storage.local.get(MANAGED_SITE_BUDGET_STORE))[MANAGED_SITE_BUDGET_STORE];
    return {raw,ledger:readLedger(raw)};
  }
  async function save(next,raw){
    await writeVerifiedLocalValue(api,MANAGED_SITE_BUDGET_STORE,next,raw,'受管后台资源');
  }
  async function nativeRules(slot,wanted){
    // No caller, manifest or policy can choose rule IDs, priorities or actions.
    return reconcileManagedDynamicRules(api,{wanted,ownsRule:id=>owns(slot,id),signature});
  }
  async function nativeAlarm(ledger,permission){
    const active=permission.ready&&Object.values(ledger).some(row=>
      row.settings.enabled&&row.status==='applied'&&row.appliedPolicyRev===row.desiredPolicyRev);
    const old=await api.alarms.get(MANAGED_SITE_BUDGET_ALARM);
    if(active){
      if(old?.periodInMinutes!==PERIOD)
        await api.alarms.create(MANAGED_SITE_BUDGET_ALARM,{periodInMinutes:PERIOD});
      if((await api.alarms.get(MANAGED_SITE_BUDGET_ALARM))?.periodInMinutes!==PERIOD)
        fail('E_MANAGED_ALARM_UNVERIFIED','网站预算闹钟尚未通过 Chrome 回读');
    }else if(old){
      await api.alarms.clear(MANAGED_SITE_BUDGET_ALARM);
      if(await api.alarms.get(MANAGED_SITE_BUDGET_ALARM))
        fail('E_MANAGED_ALARM_UNVERIFIED','后台闹钟清理未确认');
    }
  }
  async function reconcileLocked(id,{boot=false,settings=null,expectedRev=null,cleanup=false,revoke=false,expectedLease=null}={}){
    return resourceLock(async()=>{
      const at=now(),{raw,ledger}=await resourceRead();
      let workingLedger=ledger,workingRaw=raw;
      const row=ledger[id];
      // Admission always comes from the original installed-tool registry, NOT
      // from this resource ledger, which may retain a removed owner's cleanup.
      const auth=await readManagedSiteToolAuthority(api,{toolId:id,
        capability:MANAGED_SITE_BUDGET_CAPABILITY,extraStoreKeys:[MARKET_PROVENANCE_STORE]});
      const provenance=sourceId(auth.saved,id);
      const packageHash=auth.tool?await sidebarToolPackageHash(auth.tool):null;
      const supports=auth.tool?.backgroundPolicy?.kind===SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2;
      const source=provenance?.marketId??null;
      const provenanceValid=!provenance||provenance.sha256===packageHash;
      const valid=Boolean(supports&&provenanceValid&&auth.enabled&&!cleanup);
      if(expectedLease&&(expectedLease.epoch!==auth.epoch||expectedLease.hash!==packageHash||!valid))
        fail('E_TOOL_CHANGED','安装包或撤权代际已改变');
      const permission=await currentPermission(api);
      let nextRow=row?structuredClone(row):null;
      if(nextRow&&!cleanup&&nextRow.source!==source){
        // The preceding publisher must relinquish verified native resources
        // before a same-ID newcomer can allocate its own slot.
        if(!permission.dnr)fail('E_CLEANUP_PENDING','来源变更，原生 DNR 资源尚不能核验清理');
        await nativeRules(nextRow.slot,[]);
        workingLedger={...ledger};delete workingLedger[id];
        await save(workingLedger,raw);
        workingRaw=workingLedger;
        nextRow=null;
      }
      if(!nextRow&&valid){
        if(settings===null){
          await nativeAlarm(workingLedger,permission);
          // A template alone is not consent to start blocking websites.
          return {receipt:safeStatus(null,permission)};
        }
        let slot=-1;
        const used=new Set(Object.values(workingLedger).map(other=>other.slot));
        const native=permission.dnr?await api.declarativeNetRequest.getDynamicRules():[];
        for(let candidate=0;candidate<CAPACITY;candidate++)
          if(!used.has(candidate)&&!native.some(rule=>owns(candidate,rule.id))){slot=candidate;break;}
        if(slot<0)fail('E_TOOL_CAPACITY','受管网站规则资源已满或待清理');
        nextRow=initial(slot,auth.epoch,source,packageHash,at);
      }
      if(!nextRow){await nativeAlarm(workingLedger,permission);return {receipt:safeStatus(null,permission)};}
      if(cleanup){
        if(!permission.dnr)fail('E_CLEANUP_PENDING','DNR 许可缺失，无法确认卸载清理');
        await nativeRules(nextRow.slot,[]);
        const updated={...workingLedger};delete updated[id];
        await save(updated,workingRaw);
        await nativeAlarm(updated,permission);
        return {receipt:{cleaned:true,verified:true}};
      }
      if(!permission.dnr&&!auth.enabled)
        fail('E_CLEANUP_PENDING','Chrome DNR 权限不可用，无法证明停用后旧原生规则已清除');
      if(expectedRev!==null){
        if(!valid)fail('E_TOOL_CHANGED','受管网站能力已撤销');
        if(nextRow.epoch!==auth.epoch)fail('E_TOOL_CHANGED','旧授权已失效，请先刷新预算状态');
        if(settings.enabled&&!permission.ready)fail('E_CHROME_PERMISSION_REQUIRED','需要 Chrome 空闲检测与 DNR 权限');
        if(nextRow.desiredPolicyRev!==expectedRev)
          fail('E_STORAGE_CONFLICT','预算策略版本已变化，请刷新后重试');
        // Sites are a bounded, already reviewed manifest declaration; a
        // sandbox cannot silently start filtering an arbitrary host.
        const allowed=new Set(auth.tool.backgroundPolicy.suggestions.filter(item=>item.suggestLimit).map(item=>item.host));
        if(settings.sites.some(host=>!allowed.has(host)))
          fail('E_SITE_SCOPE','只能设置安装时审阅的网站清单');
        if(!sameStorageValue(settings,nextRow.settings)){
          nextRow.settings=settings;nextRow.desiredPolicyRev++;
          nextRow.status='reconciling';nextRow.checkpoint=null;
        }
      }
      // Stop/revocation, permission loss or install-epoch changes cannot silently
      // restore an old enabled flag or a previously approved native rule.
      const revokedLease=nextRow.epoch!==auth.epoch;
      const allowedSites=new Set(auth.tool?.backgroundPolicy?.suggestions
        ?.filter(site=>site.suggestLimit).map(site=>site.host)||[]);
      const scopeWithdrawn=nextRow.settings.sites.some(host=>!allowedSites.has(host));
      if((revoke||permissionRevoked||revokedLease||!auth.enabled||!permission.ready||
          !supports||scopeWithdrawn)&&nextRow.settings.enabled){
        nextRow.settings={...nextRow.settings,enabled:false};
        nextRow.desiredPolicyRev++;nextRow.checkpoint=null;
      }
      nextRow.epoch=auth.epoch;
      if(valid)nextRow.packageHash=packageHash; // Same-source reviewed upgrade.
      let current=null;
      if(valid&&permission.ready&&nextRow.settings.enabled)
        try{current=await observeManagedForeground(api,{ready:true,
          hostFromUrl,siteForHost:host=>selectedSite(nextRow.settings,host)});}catch{}
      const settled=settleManagedSiteBudget(nextRow,{at,session:await sessionId(),current,
        boot:boot||generation!==settledGeneration},{dayFor:dayAt,poolFor:()=> 'daily',
        matchSite:state=>selectedSite(state.settings,current?.host),
        blockedAt:(state,_site,checkpointAt)=>blocked(state,checkpointAt),
        maxGapMs:90000});
      if(settled.clockRollback)nextRow.status='reconciling';
      if(!valid||!permission.ready||!nextRow.settings.enabled)nextRow.checkpoint=null;
      // Save intent/checkpoint BEFORE any effect. A lost native acknowledgement
      // is resolved by DNR readback, never blind replay.
      nextRow.status=!permission.dnr?'missing-permission':'reconciling';
      let updated={...workingLedger,[id]:nextRow};
      await save(updated,workingRaw);
      if(permission.dnr){
        const wanted=valid&&permission.ready?desiredRules(nextRow,at):[];
        try{
          await nativeRules(nextRow.slot,wanted);
          nextRow.appliedPolicyRev=nextRow.desiredPolicyRev;
          nextRow.status=!provenanceValid?'unknown':valid&&nextRow.settings.enabled?
            permission.ready?'applied':'missing-permission':'inactive';
        }catch(error){
          nextRow.status='unknown';
          const currentRaw=(await resourceRead()).raw;
          await save({...updated,[id]:nextRow},currentRaw);
          throw error;
        }
        const observed=(await resourceRead()).raw;
        updated={...updated,[id]:nextRow};
        await save(updated,observed);
      }
      try{await nativeAlarm(updated,permission);}
      catch(error){
        // Native DNR may already be applied, but a failed Alarm readback
        // cannot leave the durable owner marked fully applied.
        nextRow.status='unknown';
        const currentRaw=(await resourceRead()).raw;
        await save({...updated,[id]:nextRow},currentRaw);
        throw error;
      }
      settledGeneration=generation;
      return {receipt:safeStatus(nextRow,permission)};
    });
  }
  async function sync(id,opts={}){return ownerLock(id,()=>reconcileLocked(id,opts));}
  async function run({boot=false}={}){
    const installed=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
    if(installed!==undefined&&(!Array.isArray(installed)||installed.length>CAPACITY||
       installed.some(row=>{try{validateSidebarToolPackage(row);return false;}catch{return true;}})))
      fail('E_STORAGE_CORRUPT','安装目录损坏，不能猜测后台所有者');
    const {ledger}=await resourceRead();
    const ids=new Set([...Object.keys(ledger),
      ...(installed||[]).filter(row=>row.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY))
        .map(row=>row.id)]);
    // One owner's failure must never skip cleanup/revocation for later owners.
    const failed=[];
    for(const id of ids)try{await sync(id,{boot});}
      catch(error){failed.push({id,code:error?.code||'E_SITE_BUDGET'});}
    if(failed.length)fail('E_SITE_BUDGET_RECONCILE',
      '部分后台所有者仍需核对：'+failed.map(item=>item.id+'('+item.code+')').join('、'));
    permissionRevoked=false;
  }
  async function senderDocument(sender){
    if(!isSidebarToolHostSender(api,sender)||sender.tab?.incognito||
       sender.frameId!==0&&sender.frameId!==undefined||
       sender.documentLifecycle&&sender.documentLifecycle!=='active'||
       !sender.documentId)fail('E_TOOL_SENDER','仅可信侧边栏可访问后台预算');
    const context=await api.runtime.getContexts({contextTypes:[sender.tab?'TAB':'SIDE_PANEL'],
      documentUrls:[sender.url],...(sender.tab?{tabIds:[sender.tab.id]}:{})});
    if(context.length!==1||context[0].documentId!==sender.documentId||
       context[0].documentUrl!==sender.url||context[0].frameId!==0||
       context[0].incognito)fail('E_TOOL_SENDER','可信应用宿主文档已经关闭');
    return sender.documentId;
  }
  async function probeDocument(sender){
    try{return await senderDocument(sender);}catch{}
    // Original extension-owned Marketplace TAB may inspect compatibility
    // before committing an installation; it never gains mutation authority.
    let url,market;
    try{url=new URL(sender?.url);market=new URL(api.runtime.getURL('ui/marketplace.html'));}
    catch{fail('E_TOOL_SENDER','无效的安装审阅来源');}
    if(sender?.id!==api.runtime.id||!sender.tab||
       !Number.isInteger(sender.tab.id)||sender.tab.incognito||sender.frameId!==0||
       !sender.documentId||sender.documentLifecycle&&sender.documentLifecycle!=='active'||
       url.origin!==market.origin||url.pathname!==market.pathname)
      fail('E_TOOL_SENDER','后台兼容检查仅限可信应用商店');
    const context=await api.runtime.getContexts({contextTypes:['TAB'],
      documentUrls:[sender.url],tabIds:[sender.tab.id]});
    if(context.length!==1||context[0].documentId!==sender.documentId||
       context[0].documentUrl!==sender.url||context[0].tabId!==sender.tab.id||
       context[0].frameId!==0||context[0].incognito)
      fail('E_TOOL_SENDER','兼容检查文档已失效');
    return sender.documentId;
  }
  async function dispatch(message,sender){
    if(!idPattern.test(message?.toolId)||!['probe','getStatus','setPolicy'].includes(message.operation))
      fail('E_SCHEMA','不支持的预算操作');
    await (message.operation==='probe'?probeDocument(sender):senderDocument(sender));
    if(message.operation==='probe'){
      if(Object.keys(message).sort().join(',')!=='operation,protocol,toolId')
        fail('E_SCHEMA','探测报文不合法');
      return {managedSiteRuntime:{contract:MANAGED_SITE_RUNTIME_CONTRACT,
        policyKinds:[SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2],privilegedJs:false}};
    }
    if(Object.keys(message).sort().join(',')!=='args,installEpoch,operation,packageHash,protocol,toolId'||
       !/^[a-f0-9]{64}$/.test(message.packageHash))
      fail('E_SCHEMA','受管预算请求缺少受审阅的身份');
    return ownerLock(message.toolId,async()=>{
      const auth=await assertManagedSiteToolLease(api,{toolId:message.toolId,
        capability:MANAGED_SITE_BUDGET_CAPABILITY,packageHash:message.packageHash,
        installEpoch:message.installEpoch,hashPackage:sidebarToolPackageHash});
      if(auth.tool.backgroundPolicy?.kind!==SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2)
        fail('E_TOOL_RUNTIME_POLICY_UNSUPPORTED','当前应用没有受支持的预算合同');
      const settings=message.operation==='setPolicy'?normalizeManagedSiteBudgetSettings(message.args):null;
      const expectedRev=message.operation==='setPolicy'?message.args.expectedRev:null;
      if(message.operation==='getStatus'&&!plain(message.args)||message.operation==='getStatus'&&Object.keys(message.args).length)
        fail('E_SCHEMA','状态查询参数无效');
      const result=await reconcileLocked(message.toolId,{settings,expectedRev,
        expectedLease:{epoch:auth.epoch,hash:message.packageHash}});
      try{await senderDocument(sender);}catch{
        fail(message.operation==='setPolicy'?'E_OUTCOME_UNKNOWN':'E_TOOL_SENDER',
          '运行结果可能已经生效；请重新打开真实侧边栏读取后台状态');
      }
      return result.receipt;
    });
  }
  return {dispatch,run,invalidate({revoke=false}={}){generation++;if(revoke)permissionRevoked=true;},
    stopForToolLocked:id=>reconcileLocked(id,{boot:true}),
    cleanupForToolLocked:id=>reconcileLocked(id,{boot:true,cleanup:true})};
}
export function installManagedSiteBudgetService({api=globalThis.chrome,...options}={}){
  const service=createManagedSiteBudgetService({api,...options});
  const listener=(message,sender,respond)=>{
    if(message?.protocol!==MANAGED_SITE_BUDGET_PROTOCOL)return false;
    void service.dispatch(message,sender).then(data=>respond({ok:true,data}),
      error=>respond({ok:false,error:{code:error?.code||'E_SITE_BUDGET',
        message:String(error?.message||error).slice(0,240)}}));
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  const unsubscribe=subscribeManagedSiteActivity(api,{
    alarmName:MANAGED_SITE_BUDGET_ALARM,
    run:opts=>void service.run(opts).catch(error=>
      console.warn('E_SITE_BUDGET_RECONCILE',error?.code||'E_SITE_BUDGET')),
    invalidate:()=>service.invalidate(),
    onPermissionRemoved:change=>{
      if(!change?.permissions?.some(name=>['idle','declarativeNetRequestWithHostAccess'].includes(name))&&
         !change?.origins?.length)return;
      service.invalidate({revoke:true});
      void service.run({boot:true}).catch(error=>
        console.warn('E_SITE_BUDGET_REVOKE',error?.code||'E_SITE_BUDGET'));
    },
    onStorageChanged:(changes,area)=>{
      if(area==='local'&&[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,
        MARKET_PROVENANCE_STORE].some(key=>Object.hasOwn(changes,key))){
        service.invalidate();void service.run({boot:true}).catch(error=>
          console.warn('E_SITE_BUDGET_CHANGE',error?.code||'E_SITE_BUDGET'));
      }
    }
  });
  return {service,dispose(){unsubscribe();api.runtime.onMessage.removeListener(listener);}};
}
// Called under the EXISTING Installer's per-tool lock. Never reacquire that
// lock here; the same shared resource lock fences racing native owner writes.
export async function stopManagedSiteBudgetForTool(api,id,{cleanup=false,lockManager=globalThis.navigator?.locks}={}){
  const raw=(await api.storage.local.get(MANAGED_SITE_BUDGET_STORE))[MANAGED_SITE_BUDGET_STORE];
  const ledger=readLedger(raw);
  // Legacy applications never acquired public-budget resources. Do not require
  // this optional service for their unchanged installer stop/uninstall path.
  if(!Object.hasOwn(ledger,id))return {receipt:{cleaned:true,verified:true,notOwned:true}};
  const service=createManagedSiteBudgetService({api,lockManager});
  // The Installer already holds the original per-tool + catalog locks.
  return cleanup?service.cleanupForToolLocked(id):service.stopForToolLocked(id);
}
