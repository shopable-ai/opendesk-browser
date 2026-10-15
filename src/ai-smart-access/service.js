// First-party MV3 worker, never imported by an installed or sandboxed tool.
// All privileged mutations require an exact live extension Host document,
// installed package hash/epoch and a real trusted UI click.
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage}
  from '../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled}
  from '../ui/sidebar-tools/lifecycle.js';
import {isSidebarToolHostSender} from '../sidebar-tools/sender.js';
import {AI_RUNTIME_PROVIDER,AI_LOCAL_TEST_ENABLED,AI_LOCAL_PACKAGE_HASH} from './provider-config.js';
import {AI_ID,LEGACY_AI_ID,AI_CAPABILITY,AI_PROTOCOL,AI_VERSION,AI_STORE,AI_ALARM,LEGACY_AI_ALARM,
  AI_OPERATIONS,aiError,validLease,leaseUsable,desiredAiProxy,matchesAiProxy,controlLevel} from './policy.js';
import {parseAiState,storeAiState,stopAiAccessForTool,
  readAiStates,matchesAiStateProxy,withAiProxyMutation} from './lifecycle.js';
import {sameStorageValue} from '../ui/sidebar-tools/storage-state.js';

const probeOperation='aiAccess.probe';
const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&
  Object.keys(object).sort().join(',')===keys.slice().sort().join(',');
const safeCode=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{6,120}$/.test(value);
function validatedProvider(config){
  if(!config?.activateUrl||!config?.verifyUrl)return null;
  if(AI_LOCAL_TEST_ENABLED&&config.activateUrl===AI_RUNTIME_PROVIDER.activateUrl&&
     config.verifyUrl===AI_RUNTIME_PROVIDER.verifyUrl)
    return {activate:config.activateUrl,verify:config.verifyUrl};
  const valid=url=>{
    if(typeof url!=='string')throw aiError('E_AI_PROVIDER','服务端地址类型无效');
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||
       parsed.search||parsed.hash||parsed.port||parsed.pathname==='/')
      throw aiError('E_AI_PROVIDER','必须使用固定的可信 HTTPS API 路径');
    return parsed;
  };
  const activate=valid(config.activateUrl),verify=valid(config.verifyUrl);
  if(activate.origin!==verify.origin)throw aiError('E_AI_PROVIDER','激活与验证服务来源不一致');
  return {activate:activate.href,verify:verify.href};
}
async function boundedPost(fetcher,url,body){
  let response;
  try{response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',
    ...(AI_LOCAL_TEST_ENABLED&&[AI_RUNTIME_PROVIDER.activateUrl,AI_RUNTIME_PROVIDER.verifyUrl].includes(url)?
      {'X-OpenDesk-Local-Test':'1'}:{})},
    body:JSON.stringify(body),redirect:'error',credentials:'omit',cache:'no-store',
    signal:AbortSignal.timeout(8000)});}
  catch{throw aiError('E_AI_NETWORK','授权服务不可连接；未启用代理');}
  if(!response?.ok)throw aiError('E_AI_AUTH','授权服务拒绝请求；请检查激活状态');
  if(Number(response.headers?.get?.('content-length'))>4096)
    throw aiError('E_AI_AUTH','授权响应超过大小限制');
  let bytes=0,text='',reader=response.body?.getReader?.();
  const decoder=new TextDecoder('utf-8',{fatal:true});
  if(reader){
    try{
      while(true){
        const {done,value}=await reader.read();if(done)break;
        bytes+=value.byteLength;
        if(bytes>4096){await reader.cancel();throw aiError('E_AI_AUTH','授权响应超过大小限制');}
        text+=decoder.decode(value,{stream:true});
      }
      text+=decoder.decode();
    }finally{reader.releaseLock();}
  }else{
    text=await response.text();if(text.length>4096)throw aiError('E_AI_AUTH','授权响应超过大小限制');
  }
  try{return JSON.parse(text)}catch{throw aiError('E_AI_AUTH','授权响应格式无效');}
}
export function createAiAccessService({api=globalThis.chrome,
  lockManager=globalThis.navigator?.locks,provider=AI_RUNTIME_PROVIDER,
  fetcher=globalThis.fetch,now=Date.now}={}){
  let lastError=null,serial=Promise.resolve(),stopGeneration=0;
  const lock=task=>{
    if(!lockManager?.request)throw aiError('E_TOOL_LOCK','后台缺少工具互斥锁');
    return lockManager.request('opendesk.sidebar-tools:tool:'+AI_ID,task);
  };
  const queue=fn=>{
    const run=serial.then(fn,fn);
    serial=run.catch(()=>{});
    return run;
  };
  async function hostDocument(sender,expected=sender?.documentId){
    if(!isSidebarToolHostSender(api,sender,AI_ID)||sender.tab?.incognito||
       sender.frameId!==undefined&&sender.frameId!==0||
       sender.documentLifecycle&&sender.documentLifecycle!=='active'||
       sender.tab&&!sender.documentId)
      throw aiError('E_AI_SENDER','只能由当前可信工具宿主请求代理控制');
    if(!api.runtime?.getContexts)throw aiError('E_AI_SENDER','当前 Chrome 无法验证宿主');
    const type=sender.tab?'TAB':'SIDE_PANEL';
    const contexts=await api.runtime.getContexts({contextTypes:[type],
      documentUrls:[sender.url],...(sender.tab?{tabIds:[sender.tab.id]}:{})});
    const valid=contexts.filter(row=>row.contextType===type&&row.documentUrl===sender.url&&
      typeof row.documentId==='string'&&row.documentId&&
      (!expected||row.documentId===expected)&&row.frameId===0&&!row.incognito&&
      (!sender.tab||row.tabId===sender.tab.id));
    if(valid.length!==1)throw aiError('E_AI_SENDER','工具宿主已经变化');
    return valid[0].documentId;
  }
  async function installed(){
    const saved=await api.storage.local.get([
      SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,AI_STORE]);
    const rows=saved[SIDEBAR_TOOL_STORE];
    if(rows!==undefined&&!Array.isArray(rows))throw aiError('E_TOOL_CHANGED','安装目录无效');
    const same=(rows||[]).filter(row=>row?.id===AI_ID);
    let tool=null;
    if(same.length===1){
      try{tool=validateSidebarToolPackage(same[0]);}catch{}
    }
    if(!tool?.capabilities.includes(AI_CAPABILITY))tool=null;
    if(AI_LOCAL_TEST_ENABLED&&tool&&await sidebarToolPackageHash(tool)!==AI_LOCAL_PACKAGE_HASH)
      tool=null;
    return {tool,enabled:sidebarToolEnabled(saved[SIDEBAR_TOOL_ENABLE_STORE],AI_ID),
      epoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.[AI_ID]??null,
      raw:saved[AI_STORE],state:parseAiState(saved[AI_STORE],AI_ID)};
  }
  async function authorizeRequest(request){
    await hostDocument(request.sender,request.documentId);
    const record=await installed();
    if(!record.tool||!record.enabled||record.epoch!==request.installEpoch||
       await sidebarToolPackageHash(record.tool)!==request.packageHash)
      throw aiError('E_TOOL_CHANGED','工具安装版本或授权已变化');
    await hostDocument(request.sender,request.documentId);
    if(request.stopGeneration!==undefined&&request.stopGeneration!==stopGeneration)
      throw aiError('E_AI_STOPPED','较新的停用请求已取消本次启用或激活');
    return record;
  }
  async function installationOwner(record){
    return record.tool?{toolId:AI_ID,packageHash:await sidebarToolPackageHash(record.tool),
      installEpoch:record.epoch}:null;
  }
  async function ownsInstallation(record){
    return Boolean(record.state.proxyOwner&&
      sameStorageValue(record.state.proxyOwner,await installationOwner(record)));
  }
  async function legacyHold(chromeState){
    const records=await readAiStates(api),old=records[LEGACY_AI_ID].state;
    return old.desired||old.releasePending||matchesAiStateProxy(chromeState?.value,old);
  }
  async function snapshot(){
    if(!api.proxy?.settings?.get)throw aiError('E_AI_RUNTIME','Chrome 代理 API 未接入');
    return api.proxy.settings.get({incognito:false});
  }
  async function availablePermission(){
    return Boolean(await api.permissions.contains({permissions:['proxy']}));
  }
  async function authorizedLease(state,settings){
    if(!settings)throw aiError('E_AI_PROVIDER','可信代理服务尚未配置');
    if(!state.deviceId||!leaseUsable(state.lease,now()))
      throw aiError('E_AI_ACTIVATION','需要有效的设备激活');
    const data=await boundedPost(fetcher,settings.verify,{
      deviceId:state.deviceId,leaseId:state.lease.leaseId});
    if(!exact(data,['active','lease'])||data.active!==true)
      throw aiError('E_AI_REVOKED','激活已被撤销，请重新激活');
    const lease=validLease(data.lease,now());
    if(lease.leaseId!==state.lease.leaseId)
      throw aiError('E_AI_REVOKED','授权标识已变化，请重新激活');
    return lease;
  }
  async function status(){
    const record=await installed(),{tool,enabled,state}=record;
    const configured=Boolean(validatedProvider(provider));
    let permission=false,chromeState=null,control='unknown';
    try{
      permission=await availablePermission();
      if(permission){chromeState=await snapshot();control=controlLevel(chromeState.levelOfControl);}
    }catch{lastError='无法检查 Chrome 代理控制权';}
    let migrationHold=false;
    try{migrationHold=await legacyHold(chromeState);}
    catch{migrationHold=true;lastError='旧代理状态无法核对，已阻止新工具接管';}
    let value='disabled',reason=null;
    if(!tool||!enabled)value='unavailable',reason='工具未安装或已停用';
    else if(migrationHold)value='conflict',reason='旧版 AI 智能访问仍持有代理或停止回执；请在旧工具明确停止后迁移';
    else if(!configured)value='unavailable',reason='可信代理服务尚未接入；保留现有代理规则';
    else if(state.releasePending)value='unavailable',reason=state.pendingApply?
      '代理设置结果尚未确认，保留规则与回执；请明确停止后重试':'停止代理尚未完成，后台将重试';
    else if(!state.lease)value='activation_required';
    else if(!await ownsInstallation(record))value='unavailable',reason='当前安装没有匹配的激活回执，请重新激活';
    else if(!leaseUsable(state.lease,now()))value='activation_required';
    else if(control==='controlled_by_other_extensions'||control==='not_controllable'){
      value='conflict';reason='代理由其他扩展或浏览器策略管理';
    }else if(!state.desired&&control==='controlled_by_this_extension'){
      value='unavailable';reason='当前扩展代理归属需要核对，未自动清理';
    }else if(state.desired){
      value=permission&&control==='controlled_by_this_extension'&&
        matchesAiStateProxy(chromeState?.value,state)?'enabled':'unavailable';
      if(value==='unavailable')reason='Chrome 未确认当前代理规则';
    }
    if(value==='enabled'&&lastError){value='unavailable';reason=lastError;}
    return {state:value,control,permission,
      canStop:state.desired||state.releasePending,
      reason:reason||lastError||null};
  }
  async function stopLocked(state,raw,{dropLease=false,guard}={}){
    await stopAiAccessForTool(api,AI_ID,{dropLease,lockManager,expectedRaw:raw,...(guard?{guard}:{})});
    lastError=null;
    return status();
  }
  async function applyLocked(state,raw,lease,guard=async()=>{}){
    return withAiProxyMutation(lockManager,async()=>{
    await guard();
    const record=await installed();
    if(!record.tool||!record.enabled||!sameStorageValue(raw,record.raw)||
       !await ownsInstallation(record))
      throw aiError('E_TOOL_CHANGED','激活回执或工具安装身份已变化');
    if(!await availablePermission())
      throw aiError('E_AI_PERMISSION','请先授予 Chrome 原生代理权限并更新扩展');
    const before=await snapshot(),level=controlLevel(before?.levelOfControl);
    if(!['controlled_by_this_extension','controllable_by_this_extension'].includes(level))
      throw aiError('E_AI_CONFLICT','代理由其他扩展或系统策略管理，未夺取控制权');
    if(await legacyHold(before))
      throw aiError('E_AI_CONFLICT','旧版 AI 智能访问尚未明确停止，禁止接管代理');
    if(level==='controlled_by_this_extension'&&
       (!state.desired||!matchesAiStateProxy(before.value,state)))
      throw aiError('E_AI_OWNERSHIP','当前扩展代理不属于本安装，未覆盖或清理');
    const desired=desiredAiProxy(lease.endpoint,state.proxyOwner);
    // Journal a release fence BEFORE native changes. An interrupted SW
    // cannot leave our PAC active while durable state says "disabled".
    const pending={...state,lease,desired:false,releasePending:true,pendingApply:true,
      ...(state.desired?{previousEndpoint:state.lease.endpoint}:{})};
    await guard();
    await storeAiState(api,raw,pending);
    try{
      await guard();
      await api.proxy.settings.set({value:desired,scope:'regular'});
      const after=await snapshot();
      if(controlLevel(after?.levelOfControl)!=='controlled_by_this_extension'||
         !matchesAiProxy(after.value,lease.endpoint,state.proxyOwner))
        throw aiError('E_AI_APPLY','Chrome 未确认代理规则与控制权');
      const {previousEndpoint,pendingApply,...settled}=pending;
      await guard();
      await storeAiState(api,pending,{...settled,desired:true,releasePending:false});
      await guard();
      await api.alarms.create(AI_ALARM,{periodInMinutes:5});
      lastError=null;
      return status();
    }catch(error){
      // The native or storage acknowledgement may be lost after installation.
      // Preserve the receipt and PAC instead of silently rolling back to DIRECT.
      lastError='代理设置结果尚未确认，保留规则与回执；请明确停止后重试';
      throw error;
    }
    });
  }
  async function perform(operation,payload,request){
    if(operation==='aiAccess.status'){
      if(!exact(payload,[]))throw aiError('E_AI_REQUEST','状态请求不接受参数');
      return status();
    }
    return lock(async()=>{
      const record=await authorizeRequest(request),{raw,state,tool,enabled}=record;
      const guard=()=>authorizeRequest(request);
      if(!tool||!enabled)throw aiError('E_TOOL_CHANGED','AI 智能访问已停用或卸载');
      if(operation==='aiAccess.disable'){
        if(!exact(payload,[]))throw aiError('E_AI_REQUEST','停用请求不接受参数');
        return stopLocked(state,raw,{guard});
      }
      const settings=validatedProvider(provider);
      if(operation==='aiAccess.activate'){
        if(!exact(payload,['code'])||!safeCode(payload.code))
          throw aiError('E_AI_REQUEST','激活码格式无效');
        if(!settings)throw aiError('E_AI_PROVIDER','可信激活服务尚未配置');
        if(state.desired||state.releasePending)throw aiError('E_AI_ACTIVE','请先确认停止代理，再更换激活');
        const sameInstall=await ownsInstallation(record);
        const deviceId=sameInstall&&state.deviceId||crypto.randomUUID();
        const data=await boundedPost(fetcher,settings.activate,{deviceId,code:payload.code});
        const lease=validLease(data,now());
        const proxyOwner=await installationOwner(record);
        const current=await guard();
        if(!sameStorageValue(current.raw,raw))
          throw aiError('E_TOOL_CHANGED','激活期间代理状态已变化');
        await storeAiState(api,raw,{...state,deviceId,lease,proxyOwner});
        return status();
      }
      if(operation==='aiAccess.enable'){
        if(!exact(payload,[]))throw aiError('E_AI_REQUEST','启用请求不接受参数');
        if(state.desired||state.releasePending)throw aiError('E_AI_ACTIVE','代理正在启用或等待清理，请先检查状态');
        if(await legacyHold(await snapshot()))
          throw aiError('E_AI_CONFLICT','旧版 AI 智能访问尚未明确停止，禁止接管代理');
        if(!settings)throw aiError('E_AI_PROVIDER','可信代理服务尚未接入');
        if(!await ownsInstallation(record))
          throw aiError('E_AI_ACTIVATION','当前安装缺少匹配的激活回执');
        let lease;
        try{lease=await authorizedLease(state,settings);}
        catch(error){
          if(['E_AI_ACTIVATION','E_AI_REVOKED'].includes(error.code)){
            const current=await guard();
            if(!sameStorageValue(current.raw,raw))
              throw aiError('E_TOOL_CHANGED','验证期间代理状态已变化');
            await storeAiState(api,raw,{...state,desired:false,lease:null});
          }
          throw error;
        }
        try{return await applyLocked(state,raw,lease,guard);}
        catch(error){
          // A partially applied preference remains fenced until explicit STOP.
          lastError=error.message;
          throw error;
        }
      }
      throw aiError('E_AI_REQUEST','不支持的代理操作');
    });
  }
  async function probe(message,sender){
    if(!exact(message,['protocol','toolId','operation','payload'])||
       message.protocol!==AI_PROTOCOL||message.toolId!==AI_ID||
       message.operation!==probeOperation||!exact(message.payload,[]))
      throw aiError('E_AI_REQUEST','后台探测格式无效');
    await hostDocument(sender);
    if(!api.storage?.local||!api.permissions?.contains||!api.alarms?.create||
       !api.runtime?.getContexts)
      throw aiError('E_AI_RUNTIME','代理后台服务未完整加载');
    return {protocol:AI_PROTOCOL,serviceVersion:AI_VERSION,ready:true,
      providerConfigured:Boolean(validatedProvider(provider))};
  }
  async function dispatch(message,sender){
    const generationAtStart=stopGeneration;
    if(!exact(message,['protocol','toolId','operation','payload','packageHash','installEpoch'])||
       message.protocol!==AI_PROTOCOL||message.toolId!==AI_ID||
       !AI_OPERATIONS.includes(message.operation)||typeof message.packageHash!=='string'||
       !/^[a-f0-9]{64}$/.test(message.packageHash)||JSON.stringify(message).length>4096)
      throw aiError('E_AI_REQUEST','代理请求格式无效');
    const documentId=await hostDocument(sender);
    const record=await installed();
    if(!record.tool||!record.enabled||record.epoch!==(message.installEpoch??null)||
       await sidebarToolPackageHash(record.tool)!==message.packageHash)
      throw aiError('E_TOOL_CHANGED','工具安装版本或授权已变化');
    await hostDocument(sender,documentId);
    const request={sender,documentId,packageHash:message.packageHash,
      installEpoch:message.installEpoch??null};
    // Accept STOP after sender/install validation but before waiting for the
    // mutation lock. A slow activate/verify/set must not commit past this fence.
    if(message.operation==='aiAccess.disable')stopGeneration++;
    else if(['aiAccess.enable','aiAccess.activate'].includes(message.operation))
      request.stopGeneration=generationAtStart;
    const result=await perform(message.operation,message.payload,request);
    await hostDocument(sender,documentId);
    return result;
  }
  async function reconcile(){
    return lock(async()=>{
      const recoveryGeneration=stopGeneration;
      const recoveryGuard=async()=>{
        if(recoveryGeneration!==stopGeneration)
          throw aiError('E_AI_STOPPED','较新的停用请求已取消后台恢复');
      };
      const records=await readAiStates(api),old=records[LEGACY_AI_ID].state;
      // Only a persisted explicit STOP may release on wake. An uncertain
      // apply is not STOP, and an active legacy installation is never migrated.
      if(old.releasePending&&!old.pendingApply)
        await stopAiAccessForTool(api,LEGACY_AI_ID,{lockManager,expectedRaw:records[LEGACY_AI_ID].raw});
      const record=await installed();
      if(record.state.pendingApply){
        lastError='代理设置结果尚未确认，保留规则与回执；请明确停止后重试';
        return;
      }
      if(record.state.releasePending){
        await stopLocked(record.state,record.raw);return;
      }
      if(record.raw===undefined||!record.state.desired)return;
      if(!record.tool||!record.enabled||!await ownsInstallation(record)){
        lastError='原代理安装身份无法确认，保留规则；请明确停止后重新激活';
        return;
      }
      const settings=validatedProvider(provider);
      if(!settings||!leaseUsable(record.state.lease,now())){
        lastError='代理授权已过期或服务未配置，保留规则以避免静默直连；请明确停止';return;
      }
      if(!await availablePermission()){
        lastError='Chrome 代理权限已撤销，保留回执等待核对；未自动清理';return;
      }
      let lease;
      try{lease=await authorizedLease(record.state,settings);}
      catch(error){
        lastError=['E_AI_REVOKED','E_AI_ACTIVATION'].includes(error.code)?
          '代理授权已撤销，保留原代理规则以避免静默直连；请明确停止':
          '授权服务暂不可用，保留原代理规则以避免静默直连';
        return;
      }
      const chromeState=await snapshot(),control=controlLevel(chromeState.levelOfControl);
      await recoveryGuard();
      if(await legacyHold(chromeState)){
        lastError='旧版代理仍在使用，禁止新工具接管；请先明确停止旧工具';return;
      }
      if(control==='controlled_by_other_extensions'||control==='not_controllable'){
        lastError='代理控制权被其他扩展或策略占用；未强行覆盖';
        return;
      }
      if(control==='controlled_by_this_extension'&&
         matchesAiProxy(chromeState.value,lease.endpoint,record.state.proxyOwner)){
        if(JSON.stringify(lease)!==JSON.stringify(record.state.lease))
          await storeAiState(api,record.raw,{...record.state,lease});
        await api.alarms.create(AI_ALARM,{periodInMinutes:5});
        lastError=null;return;
      }
      await applyLocked(record.state,record.raw,lease,recoveryGuard);
    });
  }
  return {probe,dispatch,status,reconcile:()=>queue(reconcile),
    proxyError:()=>{lastError='代理连接失败；AI 网站不会自动降级直连';}};
}
export function installAiAccessService({api=globalThis.chrome,...options}={}){
  const service=createAiAccessService({api,...options}),removers=[];
  const listen=(event,fn)=>{
    event?.addListener(fn);removers.push(()=>event?.removeListener(fn));
  };
  const recover=()=>{void service.reconcile().catch(error=>
    console.warn('E_AI_RECONCILE',error?.code||'E_AI',String(error?.message||error).slice(0,120)));};
  listen(api.runtime.onMessage,(message,sender,reply)=>{
    if(message?.protocol!==AI_PROTOCOL)return false;
    const request=message.operation===probeOperation?
      service.probe(message,sender):service.dispatch(message,sender);
    void request.then(data=>reply({ok:true,data}),
      error=>reply({ok:false,error:{code:error?.code||'E_AI',
        message:String(error?.message||error).slice(0,180)}}));
    return true;
  });
  listen(api.runtime.onStartup,recover);
  listen(api.runtime.onInstalled,recover);
  listen(api.alarms.onAlarm,alarm=>{if([AI_ALARM,LEGACY_AI_ALARM].includes(alarm?.name))recover();});
  listen(api.permissions.onRemoved,removed=>{
    if(removed?.permissions?.includes('proxy'))recover();
  });
  listen(api.proxy?.onProxyError,()=>service.proxyError());
  listen(api.storage.onChanged,(changes,area)=>{
    if(area==='local'&&[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,
      TOOL_REVOCATION_EPOCHS_STORE].some(name=>Object.hasOwn(changes,name)))recover();
  });
  recover();
  return {service,dispose(){removers.forEach(remove=>remove());}};
}
