// Fixed SW owner of the AdBlock state and Chrome DNR namespace.
// Installed iframe bytes are NEVER imported/executed in the privileged worker.
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {requireCompleteInstalledSidebarTools} from '../../../../src/ui/sidebar-tools/installation.js';
import {writeVerifiedLocalValue,sameStorageValue} from '../../../../src/ui/sidebar-tools/storage-state.js';
import {isSidebarToolHostSender} from '../../../../src/sidebar-tools/sender.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PROTOCOL,ADBLOCK_SERVICE_VERSION,
  ADBLOCK_STORE,ADBLOCK_PERMISSION,ADBLOCK_MAX_EXCEPTIONS,ADBLOCK_OPERATIONS,
  adblockError,adblockHost,readAdblockState} from './policy.js';
import {wantedAdblockRules,reconcileAdblockRules,clearAdblockRules} from './rules.js';
import {adblockDnrSessionReady,adblockDnrCleanupPending,confirmAdblockDnrCleanup} from './dnr-session.js';
import {ADBLOCK_RULE_VERSION,ADBLOCK_REQUEST_DOMAINS} from '../rules/domains.js';

const PROBE='adblock.probe';
const own=(value,names)=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===names.slice().sort().join(',');
const fail=(code,message)=>{throw adblockError(code,message);};

export function createAdblockService({
  api=globalThis.chrome,lockManager=globalThis.navigator?.locks,fetcher=globalThis.fetch
}={}){
  let compiled=null,generation=0,revoked=false;
  const lock=fn=>{
    if(!lockManager?.request)fail('E_ADBLOCK_LOCK','当前浏览器缺少跨窗口规则互斥锁');
    return lockManager.request('opendesk.sidebar-tools:tool:'+ADBLOCK_ID,fn);
  };
  const invalidate=(nativeRevoked=false)=>{generation++;if(nativeRevoked)revoked=true;};
  async function compiledPackage(){
    if(compiled)return compiled;
    const uri=api.runtime.getURL('official-tools/adblock/adblock.opendesk-tool.json');
    // The package is an immutable, fixed extension resource included in the
    // release. A same-ID uploaded package MUST NOT enable privileged DNR.
    const result=await fetcher(uri,{cache:'no-store',redirect:'error',credentials:'omit'});
    if(!result?.ok||(result.url&&result.url!==uri))
      fail('E_ADBLOCK_PACKAGE','未找到本扩展固定编译的 AdBlock 官方工具包');
    const bytes=new Uint8Array(await result.arrayBuffer());
    if(!bytes.length||bytes.length>320000)
      fail('E_ADBLOCK_PACKAGE','内置工具包无效或超过产品容量');
    let pkg;
    try{pkg=validateSidebarToolPackage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}
    catch{fail('E_ADBLOCK_PACKAGE','本扩展内置 AdBlock 工具包无效');}
    if(pkg.id!==ADBLOCK_ID||!pkg.capabilities.includes(ADBLOCK_CAPABILITY))
      fail('E_ADBLOCK_PACKAGE','内置 AdBlock 工具身份不匹配');
    compiled=await sidebarToolPackageHash(pkg);
    return compiled;
  }
  async function authority({beforeWrite,dnrReady=true}={}){
    try{
    const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,
      TOOL_REVOCATION_EPOCHS_STORE,ADBLOCK_STORE]);
    const rows=requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]);
    const tool=rows.find(x=>x.id===ADBLOCK_ID)||null;
    const records=requireToolEnableRecords(saved[SIDEBAR_TOOL_ENABLE_STORE]);
    const epochs=saved[TOOL_REVOCATION_EPOCHS_STORE];
    if(epochs!==undefined&&(!epochs||typeof epochs!=='object'||Array.isArray(epochs)||
       (Object.hasOwn(epochs,ADBLOCK_ID)&&
        (typeof epochs[ADBLOCK_ID]!=='string'||epochs[ADBLOCK_ID].length>100))))
      fail('E_ADBLOCK_EPOCH','工具安装生命周期记录无效');
    return {tool:tool?.capabilities.includes(ADBLOCK_CAPABILITY)?tool:null,
      enabled:records[ADBLOCK_ID]!==false,
      epoch:epochs?.[ADBLOCK_ID]??null,raw:saved[ADBLOCK_STORE]};
    }catch(error){
      // Preserve malformed records for recovery, but never keep filtering on
      // an authority we cannot parse. Cleanup itself must have native readback.
      try{
        if(!dnrReady)fail('E_OUTCOME_UNKNOWN','Chrome DNR 会话尚未初始化，无法确认规则清理');
        await clearAdblockRules(api,{beforeWrite});
      }catch{fail('E_OUTCOME_UNKNOWN','AdBlock 安装授权记录无法读取，且无法确认自有规则已清理；原始存储保留');}
      throw error;
    }
  }
  async function hostDocument(sender,expected=sender?.documentId){
    if(!isSidebarToolHostSender(api,sender,ADBLOCK_ID)||sender.tab?.incognito||
       sender.frameId!==undefined&&sender.frameId!==0||
       sender.documentLifecycle&&sender.documentLifecycle!=='active'||
       sender.tab&&!sender.documentId)
      fail('E_ADBLOCK_SENDER','仅当前可信扩展宿主可以操作广告规则');
    const type=sender.tab?'TAB':'SIDE_PANEL';
    const contexts=await api.runtime.getContexts({contextTypes:[type],
      documentUrls:[sender.url],...(sender.tab?{tabIds:[sender.tab.id]}:{})});
    const matches=contexts.filter(row=>row.contextType===type&&row.documentUrl===sender.url&&
      typeof row.documentId==='string'&&row.documentId&&
      (!expected||row.documentId===expected)&&row.frameId===0&&!row.incognito&&
      (!sender.tab||row.tabId===sender.tab.id));
    if(matches.length!==1)fail('E_ADBLOCK_SENDER','工具宿主窗口或文档已切换');
    return matches[0];
  }
  async function hostWindow(context,sender,hostWindowId){
    // Chrome may omit Side Panel window metadata (-1). Only its authenticated
    // trusted document may supply the native owning window; never use SW focus.
    const windowId=Number.isSafeInteger(context.windowId)&&context.windowId>=0
      ?context.windowId:context.contextType==='SIDE_PANEL'&&context.windowId===-1
        ?hostWindowId:null;
    if(!Number.isSafeInteger(windowId)||windowId<0||
      hostWindowId!==undefined&&hostWindowId!==windowId||
      sender.tab&&sender.tab.windowId!==windowId)
      fail('E_ADBLOCK_SENDER','可信工具所属窗口无效或不一致');
    let window;
    try{window=await api.windows.get(windowId);}
    catch{fail('E_ADBLOCK_SENDER','可信工具所属窗口已关闭或不可用');}
    if(window?.id!==windowId||window.incognito!==false)
      fail('E_ADBLOCK_SENDER','可信工具所属窗口已改变或为隐身窗口');
    return windowId;
  }
  async function probeDocument(sender){
    if(isSidebarToolHostSender(api,sender,ADBLOCK_ID))return (await hostDocument(sender)).documentId;
    try{
      const url=new URL(sender?.url),market=new URL(api.runtime.getURL('ui/marketplace.html'));
      if(sender?.id!==api.runtime.id||!sender.tab||sender.tab.incognito||
         !Number.isInteger(sender.tab.id)||sender.frameId!==0||
         !sender.documentId||sender.documentLifecycle&&sender.documentLifecycle!=='active'||
         url.origin!==market.origin||url.pathname!==market.pathname||url.search||url.hash)
        throw Error('invalid marketplace');
      const results=await api.runtime.getContexts({contextTypes:['TAB'],
        documentUrls:[sender.url],tabIds:[sender.tab.id]});
      if(results.length!==1||results[0].documentId!==sender.documentId||
         results[0].frameId!==0||results[0].contextType!=='TAB'||
         results[0].tabId!==sender.tab.id||results[0].incognito)
        throw Error('stale marketplace');
      return sender.documentId;
    }catch{fail('E_ADBLOCK_SENDER','仅当前可信扩展工具页可以探测服务');}
  }
  const permission=async()=>api.permissions.contains({permissions:[ADBLOCK_PERMISSION]});
  // The installer and SW share the same first-grant/revocation fence.
  const dnrSessionReady=()=>adblockDnrSessionReady(api);
  async function activeSite(windowId){
    const unavailable=(status,reason)=>({currentHost:null,currentSite:{status,reason}});
    // A panel belongs to its verified Chrome context, not whichever window
    // happens to have focus (including a detached DevTools window).
    if(!Number.isInteger(windowId)||windowId<0)
      return unavailable('unavailable','window-unavailable');
    let tabs;
    try{tabs=await api.tabs.query({active:true,windowId});}
    catch{return unavailable('unavailable','tab-query-failed');}
    const tab=Array.isArray(tabs)&&tabs.length===1?tabs[0]:null;
    if(!tab||!Number.isInteger(tab.id)||tab.active!==true||tab.windowId!==windowId)
      return unavailable('unavailable','no-active-tab');
    if(tab.incognito)return unavailable('incognito','private-tab');
    if(tab.pendingUrl)return unavailable('navigating','navigation-pending');
    if(typeof tab.url!=='string'||!tab.url)
      return unavailable('unavailable','missing-url');
    const host=adblockHost(tab.url,{asUrl:true});
    return host?{currentHost:host,currentSite:{status:'ready'}}:
      unavailable('unsupported','unsupported-url');
  }
  // Called only under the same per-tool Web Lock as the existing installer.
  async function reconcileLocked({operation='adblock.status',payload={},windowId=null,validateHost=null,beforeWrite=async()=>{}}={}){
    const epoch=generation;
    const dnrReady=await dnrSessionReady();
    const auth=await authority({beforeWrite,dnrReady});
    const persist=async(next,previous,scope)=>{
      await beforeWrite();
      // No authority/window awaits between this site read and the policy write.
      if(operation==='adblock.site.set'&&scope==='广告过滤策略'&&
         (await activeSite(windowId)).currentHost!==payload.host)
        fail('E_ADBLOCK_SITE_CHANGED','当前激活网站已改变，请重新核对网站');
      return writeVerifiedLocalValue(api,ADBLOCK_STORE,next,previous,scope);
    };
    const hasPermission=await permission().catch(()=>
      fail('E_OUTCOME_UNKNOWN','Chrome DNR 授权读取失败'));
    if(typeof hasPermission!=='boolean')fail('E_OUTCOME_UNKNOWN','Chrome DNR 授权状态未知');
    let cleanupPending=await adblockDnrCleanupPending(api,{ready:dnrReady,granted:hasPermission,beforeWrite});
    let validPackage=false;
    try{validPackage=Boolean(auth.tool&&await sidebarToolPackageHash(auth.tool)===await compiledPackage());}
    catch(error){
      // Missing/corrupt compiled official bytes MUST NOT leave stale DNR active.
      if(hasPermission){
        if(!dnrReady)fail('E_OUTCOME_UNKNOWN','固定工具包无效且原生 DNR 未初始化，无法确认清理');
        await clearAdblockRules(api,{beforeWrite});
      }
      throw error;
    }
    if(!validPackage||!auth.enabled){
      // Extension update, uninstallation, disable and same-ID impostor all
      // retire ONLY AdBlock-owned rules. No silent startup filtering.
      if(hasPermission&&dnrReady){
        await clearAdblockRules(api,{beforeWrite});
        await confirmAdblockDnrCleanup(api,beforeWrite);
      }
      return {installed:validPackage,toolEnabled:validPackage&&auth.enabled,
        enabled:false,permissions:{dnr:hasPermission},exceptions:[],
        ...await activeSite(windowId),rules:{verified:hasPermission&&dnrReady,ruleIds:[]},
        restartRequired:hasPermission!==dnrReady||!hasPermission&&cleanupPending,
        version:ADBLOCK_RULE_VERSION,domainCount:ADBLOCK_REQUEST_DOMAINS.length};
    }
    let state;
    try{state=readAdblockState(auth.raw);}
    catch(error){
      if(hasPermission){
        if(!dnrReady)fail('E_OUTCOME_UNKNOWN','DNR 尚未初始化，无法确认损坏状态对应的规则清理');
        await clearAdblockRules(api,{beforeWrite});
      }
      throw error;
    }
    const hash=await sidebarToolPackageHash(auth.tool);
    const approvalValid=state.approvedHash===hash&&state.approvedEpoch===auth.epoch;
    if(hasPermission&&!dnrReady){
      if(operation==='adblock.enable')
        fail('E_ADBLOCK_RESTART_REQUIRED','Chrome 广告过滤会话尚未就绪，请保存工作并重新加载 OpenDesk Browser 扩展，然后手动开启过滤');
      if(operation!=='adblock.status')
        fail('E_OUTCOME_UNKNOWN','Chrome DNR 尚未完成会话初始化，无法确认规则变更');
      return {installed:true,toolEnabled:true,enabled:false,
        permissions:{dnr:true},exceptions:state.exceptions,
        ...await activeSite(windowId),
        rules:{verified:false,ruleIds:[],reason:'browser-restart-required'},
        restartRequired:true,version:ADBLOCK_RULE_VERSION,
        domainCount:ADBLOCK_REQUEST_DOMAINS.length};
    }
    if(!hasPermission||!approvalValid||revoked||cleanupPending){
      const next={...state,enabled:false,approvedHash:null,approvedEpoch:null};
      if(!sameStorageValue(state,next)){
        await persist(next,auth.raw,'广告拦截撤权状态');
        state=next;
      }
    }
    if(operation==='adblock.enable'){
      if(!hasPermission)fail('E_ADBLOCK_PERMISSION','扩展必选广告过滤权限不可用，请保存工作并重新加载或启用 OpenDesk Browser 扩展');
      // Only a fresh trusted click can renew a natively revoked approval.
      // A permission-onAdded event alone never clears the revoked fence.
      state={...state,enabled:true,approvedHash:hash,approvedEpoch:auth.epoch};
    }else if(operation==='adblock.disable'){
      state={...state,enabled:false,approvedHash:null,approvedEpoch:null};
    }else if(operation==='adblock.site.set'){
      if(!own(payload,['host','filtering'])||typeof payload.filtering!=='boolean'||
         adblockHost(payload.host)!==payload.host)
        fail('E_ADBLOCK_HOST','当前网站域名无效');
      if(!state.enabled)fail('E_ADBLOCK_DISABLED','请先打开全局广告过滤');
      if((await activeSite(windowId)).currentHost!==payload.host)
        fail('E_ADBLOCK_SITE_CHANGED','当前激活网站已改变，请重新核对网站');
      const set=new Set(state.exceptions);
      if(payload.filtering)set.delete(payload.host);else set.add(payload.host);
      if(set.size>ADBLOCK_MAX_EXCEPTIONS)
        fail('E_ADBLOCK_LIMIT','最多管理 100 个停用广告拦截的网站');
      state={...state,exceptions:[...set].sort()};
    }else if(operation==='adblock.site.restore'){
      if(!own(payload,['host'])||adblockHost(payload.host)!==payload.host||
         !state.exceptions.includes(payload.host))
        fail('E_ADBLOCK_HOST','待恢复网站不在已停用列表中');
      state={...state,exceptions:state.exceptions.filter(x=>x!==payload.host)};
    }else if(operation!=='adblock.status')fail('E_ADBLOCK_OPERATION','未批准的广告操作');
    if(validateHost)await validateHost();
    const final=await authority({beforeWrite,dnrReady});
    if(!final.tool||!final.enabled||final.epoch!==auth.epoch||
       await sidebarToolPackageHash(final.tool)!==hash||
       await compiledPackage()!==hash)
      fail('E_TOOL_CHANGED','AdBlock 安装/启停身份已变化');
    const fresh=await permission().catch(()=>
      fail('E_OUTCOME_UNKNOWN','Chrome DNR 二次授权读取失败'));
    if(typeof fresh!=='boolean')fail('E_OUTCOME_UNKNOWN','Chrome DNR 二次授权状态未知');
    if(!fresh)cleanupPending=await adblockDnrCleanupPending(api,{ready:dnrReady,granted:false,beforeWrite});
    if(!fresh||generation!==epoch){
      if(operation==='adblock.enable'||operation==='adblock.site.set')
        fail('E_ADBLOCK_PERMISSION','操作期间 Chrome 原生授权已变更');
      state={...state,enabled:false,approvedHash:null,approvedEpoch:null};
    }
    // Persist disabled intent BEFORE removing DNR. After a crash the boot
    // reconciliation completes cleanup; it never resurrects a disabled rule.
    if(!sameStorageValue(state,auth.raw))
      await persist(state,auth.raw,'广告过滤策略');
    // A lost native permission makes DNR inaccessible, but Chromium may retain
    // its already-loaded matcher. Worker restarts retain the session fence;
    // a recreated browser/extension session rechecks permission from scratch.
    const rules=fresh?await reconcileAdblockRules(api,state.enabled?wantedAdblockRules(state):[],{
      beforeWrite,onPriorityConflict:async()=>{
        const next={...state,enabled:false,approvedHash:null,approvedEpoch:null};
        await persist(next,state,'广告过滤优先级冲突停用状态');
        state=next;
      }}):
      {verified:false,ruleIds:[],reason:'native-permission-missing'};
    if(fresh&&rules.verified)await confirmAdblockDnrCleanup(api,beforeWrite);
    if(validateHost)await validateHost();
    if(generation===epoch)revoked=false;
    return {installed:true,toolEnabled:true,enabled:state.enabled&&fresh&&rules.verified,
      permissions:{dnr:fresh},exceptions:state.exceptions,
      ...await activeSite(windowId),rules,restartRequired:!fresh&&(dnrReady||cleanupPending),version:ADBLOCK_RULE_VERSION,
      domainCount:ADBLOCK_REQUEST_DOMAINS.length,refreshRequired:operation==='adblock.site.set'||
      operation==='adblock.site.restore'};
  }
  const tick=options=>lock(()=>reconcileLocked(options));
  async function probe(message,sender){
    if(!own(message,['protocol','toolId','operation','payload','packageHash'])||
       message.protocol!==ADBLOCK_PROTOCOL||message.toolId!==ADBLOCK_ID||
       message.operation!==PROBE||!own(message.payload,[])||
       !/^[a-f0-9]{64}$/.test(message.packageHash))
      fail('E_ADBLOCK_REQUEST','后台探测请求无效');
    const doc=await probeDocument(sender);
    await lock(()=>dnrSessionReady());
    if(await compiledPackage()!==message.packageHash)
      fail('E_ADBLOCK_PACKAGE','工具包与本扩展固定发行版本不一致');
    const hasPermission=await permission();
    // Chrome hides an optional API namespace before its permission is granted.
    // Installation must precede the trusted control's native permission prompt.
    if(!api.storage?.local?.get||!api.storage?.local?.set||!api.permissions?.contains||
       hasPermission&&(!api.declarativeNetRequest?.getDynamicRules||!api.declarativeNetRequest?.updateDynamicRules)||
       !lockManager?.request||!api.tabs?.query)
      fail('E_ADBLOCK_RUNTIME','本扩展缺少 DNR 或受控存储运行能力');
    if(await probeDocument(sender)!==doc)
      fail('E_ADBLOCK_SENDER','可信探测文档已改变');
    return {protocol:ADBLOCK_PROTOCOL,serviceVersion:ADBLOCK_SERVICE_VERSION,
      serviceReady:true,permissions:{dnr:hasPermission}};
  }
  async function dispatch(message,sender){
    const fields=['protocol','toolId','operation','payload','packageHash','installEpoch'];
    const hasHostWindow=Object.hasOwn(message||{},'hostWindowId');
    if(hasHostWindow)fields.push('hostWindowId');
    if(!own(message,fields)||
       message.protocol!==ADBLOCK_PROTOCOL||message.toolId!==ADBLOCK_ID||
       !ADBLOCK_OPERATIONS.includes(message.operation)||
      hasHostWindow&&(!Number.isSafeInteger(message.hostWindowId)||message.hostWindowId<0)||
       typeof message.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(message.packageHash)||
       JSON.stringify(message).length>16000||message.payload===null||
       typeof message.payload!=='object'||Array.isArray(message.payload))
      fail('E_ADBLOCK_REQUEST','广告拦截操作或宿主身份无效');
    const context=await hostDocument(sender),doc=context.documentId;
    const hostWindowId=message.hostWindowId,windowId=await hostWindow(context,sender,hostWindowId);
    return lock(async()=>{
      let effectStarted=false;
      const validateHost=async()=>{
        try{
          const live=await hostDocument(sender,doc);
          if(await hostWindow(live,sender,hostWindowId)!==windowId)
            fail('E_ADBLOCK_SENDER','工具宿主所属窗口已改变');
          return live.documentId;
        }
        catch(error){
          if(effectStarted)fail('E_OUTCOME_UNKNOWN','工具文档在持久化或 Chrome 规则写入后已改变；请读取实际状态，不要盲目重试');
          throw error;
        }
      };
      const beforeWrite=async()=>{await validateHost();effectStarted=true;};
      try{
      const dnrReady=await dnrSessionReady();
      const auth=await authority({beforeWrite,dnrReady});
      if(!auth.tool||!auth.enabled||message.installEpoch!==auth.epoch||
         await sidebarToolPackageHash(auth.tool)!==message.packageHash)
        fail('E_TOOL_CHANGED','AdBlock 工具包版本、安装状态或撤权 Epoch 已改变');
      if(await compiledPackage()!==message.packageHash)
        fail('E_ADBLOCK_UPDATE_REQUIRED',
          '已安装的广告拦截与当前扩展内置版本不匹配，请在扩展管理中审阅更新；重启 Chrome 不会更新工具包');
      if(!own(message.payload,message.operation==='adblock.site.set'?['host','filtering']:
         message.operation==='adblock.site.restore'?['host']:[]))
        fail('E_ADBLOCK_REQUEST','不允许的广告操作参数');
      await validateHost();
      const data=await reconcileLocked({operation:message.operation,payload:message.payload,windowId,
        validateHost,beforeWrite});
      await validateHost();
      return data;
      }catch(error){
        if(effectStarted)await validateHost();
        throw error;
      }
    });
  }
  return {tick,dispatch,probe,invalidate};
}
export function installAdblockService({api=globalThis.chrome,...options}={}){
  const service=createAdblockService({api,...options}),removers=[];
  const listen=(event,fn)=>{event?.addListener(fn);removers.push(()=>event?.removeListener(fn));};
  const recover=()=>{void service.tick().catch(e=>console.warn('E_ADBLOCK_RECONCILE',e?.code||'E_ADBLOCK'));};
  listen(api.runtime.onMessage,(message,sender,reply)=>{
    if(message?.protocol!==ADBLOCK_PROTOCOL)return false;
    const work=message.operation===PROBE?service.probe(message,sender):service.dispatch(message,sender);
    void work.then(data=>reply({ok:true,data}),
      e=>reply({ok:false,error:{code:e.code||'E_ADBLOCK',
        message:String(e.message||e).slice(0,240)}}));
    return true;
  });
  listen(api.runtime.onStartup,recover);
  listen(api.runtime.onInstalled,recover);
  listen(api.permissions.onRemoved,removed=>{
    if(removed?.permissions?.includes(ADBLOCK_PERMISSION)||removed?.origins?.length){
      service.invalidate(true);recover();
    }
  });
  // A re-grant never automatically re-enables a revoked or paused tool.
  listen(api.permissions.onAdded,()=>{service.invalidate();recover();});
  listen(api.storage.onChanged,(changes,area)=>{
    if(area==='local'&&[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,
      TOOL_REVOCATION_EPOCHS_STORE,ADBLOCK_STORE].some(key=>Object.hasOwn(changes,key))){
      service.invalidate();recover();
    }
  });
  recover();
  return {service,dispose(){for(const remove of removers)remove();}};
}
