import {isToolSender,resolveToolSender,permissionPattern} from '../../environment.js';
import {createBrowserTabHost} from './browser-tabs.js';
import {createNetworkService} from './network.js';
import {createBrowserNetworkObserver} from './browser-network-observe.js';
import {createBrowserScreenshotHost} from './browser-screenshot.js';
import {createBrowserScreenshotResources} from './browser-screenshot-resources.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,sidebarToolEnabled} from '../../ui/sidebar-tools/lifecycle.js';
// Trusted Chrome MV3 context-menu driver. No third-party code executes here.
// Listener registration is synchronous; storage and install checks are async.
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT_V2,validateSidebarToolPackage,serializeSidebarToolPackage} from '../../ui/sidebar-tools/package.js';
// The installer owns the revocation store. Keep the SW's menu listener small:
 // importing installation.js here would bundle the entire tool installer in SW.
const TOOL_REVOCATION_EPOCHS_STORE='opendesk.sidebar-tools.revocation-epochs.v1';
function requireCompleteInstalledSidebarTools(rows){
  if(rows===undefined)return [];
  if(!Array.isArray(rows)||rows.length>12)throw failure('E_STORAGE_CORRUPT','Installed tool registry is invalid');
  const seen=new Set();
  return rows.map(row=>{
    const tool=validateSidebarToolPackage(row);
    if(seen.has(tool.id))throw failure('E_STORAGE_CORRUPT','Duplicate installed tool');
    seen.add(tool.id);return tool;
  });
}
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_SOURCE_PROTOCOL,BROWSER_MENU_ROOT,BROWSER_MENU_GRANTS_STORE,
  BROWSER_MENU_MATERIALIZED_STORE,BROWSER_MENU_LAUNCH_STORE,
  BROWSER_API_VERSION,BROWSER_OPERATIONS,browserCapabilityList,browserOperation,
  deniedBrowserStatus,normalizeBrowserOperation} from '../../framework/sdk/browser-contract.js';
const ROOT_OPEN='opendesk.browser.open';
const ID_PREFIX='opendesk.tool.';
const MAX_SELECTION=16384,MAX_CONTEXT=65536,LIFETIME=60000;
const failure=(code,message)=>Object.assign(new Error(message||code),{code});
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(id);
const canonicalJSON=value=>JSON.stringify(value,(_key,row)=>
  row&&typeof row==='object'&&!Array.isArray(row)
    ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const jsonBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function parsedHttp(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url:null;}
  catch{return null;}
}
export function matchesMenuDocument(action,url){
  const doc=parsedHttp(url);
  if(!doc||!action?.documentUrlPatterns)return false;
  return action.documentUrlPatterns.some(pattern=>{
    const rule=parsedHttp(pattern);
    return Boolean(rule&&rule.protocol===doc.protocol&&rule.hostname===doc.hostname&&rule.pathname==='/*');
  });
}
const menuActions=tool=>tool?.format===SIDEBAR_TOOL_FORMAT_V2&&tool.capabilities.includes('browser.contextMenu')
  ?tool.contributes.contextMenus:[];
const menuId=(toolId,actionId)=>ID_PREFIX+toolId+'.'+actionId;
const chromeMenuCall=(api,method,...args)=>new Promise((resolve,reject)=>{
  try{api.contextMenus[method](...args,()=> {
    const last=api.runtime?.lastError;
    if(last)reject(failure('E_CHROME',last.message));else resolve();
  });}catch(error){reject(failure('E_CHROME',error.message));}
});
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),
  b=>b.toString(16).padStart(2,'0')).join('');
const digestTool=tool=>sha(serializeSidebarToolPackage(tool));
async function checkedSender(api,sender){
  sender=await resolveToolSender(api,sender);
  if(!isToolSender(api,sender))throw failure('E_OWNER','Untrusted Browser SDK sender');
  if(sender?.id!==api.runtime?.id||(sender?.frameId!==undefined&&sender.frameId!==0)||sender?.tab?.incognito)
    throw failure('E_OWNER','Only the trusted top-level OpenDesk UI may call Browser host');
  const expected=new URL(api.runtime.getURL('ui/tool.html'));
  let url;
  try{url=new URL(sender.url);}catch{throw failure('E_OWNER','Untrusted browser sender');}
  if(url.protocol!==expected.protocol||url.host!==expected.host||url.pathname!==expected.pathname||
     !/^[0-9a-f-]{36}$/i.test(url.searchParams.get('hostInstanceId')||''))
    throw failure('E_OWNER','Untrusted browser host document');
  return url.searchParams.get('hostInstanceId');
}
function admittedTool(rows,id){
  const value=requireCompleteInstalledSidebarTools(rows).find(tool=>tool.id===id);
  if(!value)throw failure('E_TOOL_CHANGED','Tool uninstalled or unavailable');
  return validateSidebarToolPackage(value);
}
async function approvedOrigins(grants,tool){
  const row=grants?.[tool.id];
  return row?.version===tool.version&&row.packageHash===await digestTool(tool)&&Array.isArray(row.origins)&&
    row.origins.every(origin=>Boolean(parsedHttp(origin))&&new URL(origin).origin===origin)
      ?row.origins:[];
}
async function readSources(api){
  const r=await api.storage.local.get([SIDEBAR_TOOL_STORE,BROWSER_MENU_GRANTS_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
  const tools=requireCompleteInstalledSidebarTools(r[SIDEBAR_TOOL_STORE]);
  const epochs=r[TOOL_REVOCATION_EPOCHS_STORE]||{};
  const grants={...(r[BROWSER_MENU_GRANTS_STORE]||{})};
  // Same package bytes cannot inherit site approval after uninstall/revoke.
  for(const [id,row] of Object.entries(grants))
    if(row?.installEpoch!==(epochs[id]??null))delete grants[id];
  return {tools,grants,epochs,enabled:requireToolEnableRecords(r[SIDEBAR_TOOL_ENABLE_STORE])};
}
async function permissionGranted(api){
  return Boolean(api.contextMenus&&api.permissions?.contains&&
    await api.permissions.contains({permissions:['contextMenus']}));
}
async function chromeSitePermitted(api,origin){
  const url=parsedHttp(origin);
  if(!url||url.origin!==origin||!api.permissions?.contains)return false;
  try{return await api.permissions.contains({origins:[permissionPattern(url.href)]});}
  catch{return false;}
}
async function permittedOrigins(api,origins,cache=new Map()){
  const results=await Promise.all(origins.map(async origin=>{
    if(!cache.has(origin))cache.set(origin,chromeSitePermitted(api,origin));
    return await cache.get(origin)?origin:null;
  }));
  return results.filter(Boolean);
}
async function confirmedWrite(area,key,value){
  await area.set({[key]:value});
  const row=await area.get(key);
  if(canonicalJSON(row[key])!==canonicalJSON(value))
    throw failure('E_OUTCOME_UNKNOWN','Browser state write was not confirmed; refresh to reconcile');
}
function validLaunch(row){
  return row&&row.state==='pending'&&Date.now()<row.expiresAt&&validId(row.toolId)&&
    typeof row.ticketId==='string'&&row.ticketId.length===36;
}
function scopedMenuPatterns(origins,action){
  return [...new Set(origins.filter(origin=>matchesMenuDocument(action,origin)).map(origin=>{
    const url=new URL(origin);
    // Chrome match patterns have no port; host authorization still checks exact origin.
    return url.protocol+'//'+url.hostname+'/*';
  }))];
}
export function createContextMenuHost({api=globalThis.chrome,logger=console,lockManager=globalThis.navigator?.locks,fetchImpl=globalThis.fetch}={}){
  let chain=Promise.resolve();
  const documentEpochs=new Map();
  const recentSourceContexts=new Map();
  const pendingSourceContexts=new Map();
  let menuActionsAvailable=false;
  const activeMenuOrigins=new Set(); // Ephemeral projection of approved menus, never a grant store.
  // Single-use intents are created only by the trusted extension UI after a user click.
  // They do not survive Worker restart and are never supplied by tool script.
  const browserIntents=new Map(),INTENT_TTL=15000;
  // A permission or installed-package change must fence requests that are already in fetch().
  const activeNetworkRequests=new Set();
  const intentOperations=new Set(['browser.tabs.open','browser.tabs.focus','browser.tabs.closeOwned','browser.network.request',
    'browser.network.observe.start','browser.network.observe.export','browser.screenshot.captureVisible']);
  const observationOperations=new Set(['browser.network.observe.getStatus','browser.network.observe.stop',
    'browser.events.read','browser.events.close']);
  const ownedOperationMethods=new Set(['browser.operations.getStatus','browser.operations.cancel']);
  const operationState=state=>({
    running:'running',stopped:'completed',cancelled:'cancelled',
    interrupted:'failed',revoked:'cancelled'})[state]??'unknown';
  async function verifyBrowserOwner(identity,operation,origin=null){
    const owned=await readSources(api),tool=admittedTool(owned.tools,identity.toolId);
    if(!sidebarToolEnabled(owned.enabled,tool.id))throw failure('E_TOOL_DISABLED');
    if(tool.version!==identity.toolVersion||(owned.epochs[tool.id]??null)!==(identity.epoch??null)||
       await digestTool(tool)!==identity.packageHash)throw failure('E_TOOL_CHANGED','Tool package or install epoch changed');
    const op=browserOperation(operation);
    if(!op||!op.requiredCapabilities.every(cap=>tool.capabilities.includes(cap)))throw failure('E_TOOL_CAPABILITY_REQUIRED');
    for(const permission of op.requiredChromePermissions)
      if(!api.permissions?.contains||!await api.permissions.contains({permissions:[permission]}))
        throw failure('E_CHROME_PERMISSION_REQUIRED');
    if(origin!==null){
      const site=parsedHttp(origin);
      if(!site||site.origin!==origin||!api.permissions?.contains||
         !await api.permissions.contains({origins:[permissionPattern(origin+'/')]}))
        throw failure('E_SITE_PERMISSION_REVOKED');
    }
    return tool;
  }
  const tabHost=createBrowserTabHost({api,authorize:async({operation,origin,context})=>{
    if(context.approvedOrigin!==null&&context.approvedOrigin!==origin)throw failure('E_SITE_GRANT_REQUIRED','Tab origin changed');
    await verifyBrowserOwner(context,operation,origin);
    return true;
  }});
  const networkHost=createNetworkService({fetchImpl,maxResponseBytes:8192,
    authorize:async({url},context)=>{
      const origin=new URL(url).origin;
      if(origin!==context.approvedOrigin)throw failure('E_SITE_GRANT_REQUIRED','HTTP request Origin changed');
      await verifyBrowserOwner(context,'browser.network.request',origin);
    }});
  const networkObserver=createBrowserNetworkObserver({api});
  const screenshotResources=createBrowserScreenshotResources({api});
  const screenshotHost=createBrowserScreenshotHost({api,
    resolveTarget:(ref,context)=>tabHost.resolve(ref,context),
    authorize:async({origin,context})=>{
      await verifyBrowserOwner(context,'browser.screenshot.captureVisible',origin);
      return true;
    },
    createResource:row=>screenshotResources.createResource(row),
    discardResource:ref=>screenshotResources.discardResource(ref)
  });
  function revokeBrowserOperations(){
    networkObserver.revokeAll();
    screenshotResources.revokeAll();
    browserIntents.clear();
    for(const controller of activeNetworkRequests)
      controller.abort(failure('E_GRANT_REVOKED','Installed tool authority changed during HTTP request'));
    activeNetworkRequests.clear();
    tabHost.dispose();
  }

  const SOURCE_PROOF_LIFETIME_MS=60000;
  // Content scripts send no selected text: only Chrome's native sender exposes
  // the real tab/frame/document of a trusted right-click gesture.
  function validatedSourceIdentity(message,sender){
    if(!message||Object.keys(message).sort().join(',')!=='kind,protocol'||
       message.protocol!==BROWSER_MENU_SOURCE_PROTOCOL||message.kind!=='contextmenu'||
       sender?.id!==api.runtime?.id||sender?.tab?.incognito||
       !Number.isSafeInteger(sender?.tab?.id)||sender.tab.id<0||
       !Number.isSafeInteger(sender.frameId)||sender.frameId<0||
       typeof sender.documentId!=='string'||!sender.documentId||
       sender.documentLifecycle&&sender.documentLifecycle!=='active')return null;
    const url=parsedHttp(sender.url);
    if(!url)return null;
    return {key:epochKey(sender.tab.id,sender.frameId),origin:url.origin,
      tabId:sender.tab.id,frameId:sender.frameId,documentId:sender.documentId,
      at:Date.now(),epoch:captureEpoch(sender.tab.id,sender.frameId)};
  }
  function noteSourceContext(message,sender){
    const source=validatedSourceIdentity(message,sender);
    if(!source||!menuActionsAvailable||!activeMenuOrigins.has(source.origin))return false;
    pendingSourceContexts.delete(source.key);
    recentSourceContexts.set(source.key,{
      tabId:source.tabId,frameId:source.frameId,
      documentId:source.documentId,origin:source.origin,at:source.at});
    if(recentSourceContexts.size>128)
      recentSourceContexts.delete(recentSourceContexts.keys().next().value);
    return true;
  }
  // When Chrome resumes an MV3 worker for the FIRST right-click event,
  // synchronous source listeners run before asynchronous storage rehydration.
  // Resolve just that sender's site permission from the existing installed
  // tool authority. Never save selection/text or grant permission here.
  function receiveSourceContext(message,sender){
    const source=validatedSourceIdentity(message,sender);
    if(!source)return false;
    if(noteSourceContext(message,sender))return true;
    if(menuActionsAvailable)return false; // cached approved origin does not match
    const promise=(async()=>{
      if(!await permissionGranted(api))return false;
      const {tools,grants,enabled}=await readSources(api);
      let eligible=false;
      for(const tool of tools){
        if(!sidebarToolEnabled(enabled,tool.id))continue;
        const active=grants[tool.id]?.activeActions;
        if(!Array.isArray(active)||!active.length)continue;
        if(!(await approvedOrigins(grants,tool)).includes(source.origin))continue;
        if(menuActions(tool).some(action=>active.includes(action.actionId)&&
          matchesMenuDocument(action,source.origin))){eligible=true;break;}
      }
      if(!eligible||!await chromeSitePermitted(api,source.origin))return false;
      if(pendingSourceContexts.get(source.key)!==promise||
         captureEpoch(source.tabId,source.frameId)!==source.epoch)return false;
      recentSourceContexts.set(source.key,{
        tabId:source.tabId,frameId:source.frameId,
        documentId:source.documentId,origin:source.origin,at:source.at});
      return true;
    })();
    pendingSourceContexts.set(source.key,promise);
    if(pendingSourceContexts.size>128)
      pendingSourceContexts.delete(pendingSourceContexts.keys().next().value);
    void promise.catch(error=>logger.warn('OpenDesk menu source rehydration',error))
      .finally(()=>{if(pendingSourceContexts.get(source.key)===promise)pendingSourceContexts.delete(source.key);});
    return true;
  }
  const epochKey=(tabId,frameId)=>String(tabId)+':'+String(frameId);
  function noteNavigation(tabId,frameId=0){
    if(frameId===0){networkObserver.invalidateTab(tabId);screenshotResources.revokeTab(tabId);}
    const key=epochKey(tabId,frameId);
    documentEpochs.set(key,(documentEpochs.get(key)||0)+1);
    if(frameId===0){
      for(const entry of [...recentSourceContexts.keys(),...pendingSourceContexts.keys()])
        if(entry.startsWith(String(tabId)+':')){
          recentSourceContexts.delete(entry);pendingSourceContexts.delete(entry);
        }
    }else{recentSourceContexts.delete(key);pendingSourceContexts.delete(key);}
  }
  const captureEpoch=(tabId,frameId)=>documentEpochs.get(epochKey(tabId,frameId))||0;
  const serial=work=>{const result=chain.catch(()=>{}).then(work);chain=result.catch(()=>{});return result;};
  const runLocked=(id,work)=>{
    const locks=lockManager;
    if(!locks?.request)throw failure('E_TOOL_LOCK','Web Locks unavailable for installed tool identity');
    return locks.request('opendesk.sidebar-tools:tool:'+id,()=>locks.request('opendesk.sidebar-tools:catalog',work));
  };
  const apiMenu=async(type,args)=>{
    try{return await chromeMenuCall(api,type,...args);}
    catch(error){
      if(type==='create'&&/duplicate id|duplicate context menu/i.test(error.message||'')){
        const {id,...update}=args[0];
        return chromeMenuCall(api,'update',id,update);
      }
      throw error;
    }
  };
  async function synchronize(){
    if(!await permissionGranted(api)){
      menuActionsAvailable=false;
      recentSourceContexts.clear();pendingSourceContexts.clear();activeMenuOrigins.clear();
      return {enabled:false,reason:'E_CHROME_PERMISSION_REQUIRED'};
    }
    const {tools,grants,enabled}=await readSources(api);
    const nextMenuOrigins=new Set(),sitePermissionCache=new Map();
    const desired=new Map([
      [BROWSER_MENU_ROOT,{id:BROWSER_MENU_ROOT,title:'OpenDesk Browser',contexts:['page','selection','link']}],
      [ROOT_OPEN,{id:ROOT_OPEN,parentId:BROWSER_MENU_ROOT,title:'打开 OpenDesk Browser',contexts:['page','selection','link']}]
    ]);
    for(const tool of tools)for(const action of menuActions(tool)){
      if(!sidebarToolEnabled(enabled,tool.id))continue;
      const origins=await permittedOrigins(api,await approvedOrigins(grants,tool),sitePermissionCache);
      const patterns=scopedMenuPatterns(origins,action);
      const active=grants[tool.id]?.activeActions;
      if(!patterns.length||!Array.isArray(active)||!active.includes(action.actionId))continue;
      for(const origin of origins)if(matchesMenuDocument(action,origin))nextMenuOrigins.add(origin);
      const id=menuId(tool.id,action.actionId);
      desired.set(id,{id,parentId:BROWSER_MENU_ROOT,title:action.title,contexts:action.contexts,
        documentUrlPatterns:patterns});
    }
    const before=(await api.storage.local.get(BROWSER_MENU_MATERIALIZED_STORE))[BROWSER_MENU_MATERIALIZED_STORE];
    const previous=Array.isArray(before)?before.filter(id=>typeof id==='string'&&
      (id===ROOT_OPEN||id===BROWSER_MENU_ROOT||id.startsWith(ID_PREFIX))):[];
    // Always reconcile IDs: Chrome does not provide a general list/read menu API.
    // Create-or-update handles service-worker resurrection without removeAll().
    for(const item of desired.values())await apiMenu('create',[item]);
    for(const id of previous.filter(id=>!desired.has(id)).reverse()){
      try{await apiMenu('remove',[id]);}
      catch(error){if(!/not found|cannot find|does not exist/i.test(error.message||''))throw error;}
    }
    await confirmedWrite(api.storage.local,BROWSER_MENU_MATERIALIZED_STORE,[...desired.keys()]);
    menuActionsAvailable=desired.size>2;
    activeMenuOrigins.clear();
    for(const origin of nextMenuOrigins)activeMenuOrigins.add(origin);
    for(const [key,context] of recentSourceContexts)
      if(!activeMenuOrigins.has(context.origin))recentSourceContexts.delete(key);
    if(!menuActionsAvailable){recentSourceContexts.clear();pendingSourceContexts.clear();}
    return {enabled:true,count:desired.size};
  }
  const sync=()=>serial(synchronize);
  async function status(operation,tool,owned=null,identity=null){
    const op=browserOperation(operation);
    if(!op)return deniedBrowserStatus(operation);
    const sources=owned??await readSources(api);
    const menu=(await permittedOrigins(api,await approvedOrigins(sources.grants,tool))).length>0;
    const isMenu=operation.startsWith('browser.contextMenu')||operation.startsWith('browser.launch')||
      operation==='browser.page.getSelection';
    const menuApiAvailable=Boolean(api.contextMenus?.create&&api.contextMenus?.onClicked);
    const platformSupported=(!isMenu||menuApiAvailable)&&(
      operation==='browser.tabs.open'?Boolean(api.tabs?.create):
      operation==='browser.tabs.focus'?Boolean(api.tabs?.get&&api.tabs?.update):
      operation==='browser.tabs.getOwned'||operation==='browser.tabs.listOwned'?Boolean(api.tabs?.get&&api.webNavigation?.getFrame):
      operation==='browser.tabs.closeOwned'?Boolean(api.tabs?.get&&api.tabs?.remove&&api.webNavigation?.getFrame):
      operation==='browser.sidePanel.openSelf'?Boolean(api.sidePanel?.open):
      operation==='browser.network.request'?typeof fetchImpl==='function':
      operation.startsWith('browser.network.observe.')?Boolean(api.webRequest?.onBeforeRequest?.addListener):
      operation==='browser.screenshot.captureVisible'?
        Boolean(api.tabs?.query&&api.tabs?.captureVisibleTab&&api.downloads?.download):true);
    const hasToolCap=op.requiredCapabilities.every(cap=>tool.capabilities.includes(cap));
    const chromium=menuApiAvailable&&await permissionGranted(api);
    const requiredBrowser=(await Promise.all(op.requiredChromePermissions.map(async id=>
      id==='contextMenus'?chromium:await api.permissions?.contains?.({permissions:[id]}).catch(()=>false)===true))).every(Boolean);
    const exposure=op.supportedContexts.includes('sidebar-tool')&&hasToolCap?'allowed':'not-exposed';
    const consuming=operation==='browser.launch.consume'||operation==='browser.page.getSelection';
    let hasLaunch=true;
    if(consuming&&exposure==='allowed'){
      const rows=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
      const row=rows[tool.id];
      hasLaunch=Boolean(validLaunch(row)&&row.boundTo?.hostInstanceId===identity?.hostInstanceId&&
        row.boundTo?.toolInstance===identity?.toolInstance&&row.packageHash===await digestTool(tool)&&
        row.installEpoch===(sources.epochs[tool.id]??null));
    }
    // Clipboard availability belongs to the actual trusted front-end document;
    // the background must never claim it is callable solely from a permission.
    const frontendOnly=operation==='browser.clipboard.writeText';
    const runnable=op.implementation==='IMPLEMENTED'&&exposure==='allowed'&&platformSupported&&
      requiredBrowser&&(!isMenu||menu)&&hasLaunch&&!frontendOnly;
    const reasonCode=runnable?null:
      op.implementation!=='IMPLEMENTED'?'E_NOT_IMPLEMENTED':
      !hasToolCap?'E_TOOL_CAPABILITY_REQUIRED':
      !platformSupported?'E_CHROME_UNSUPPORTED':
      !requiredBrowser?'E_CHROME_PERMISSION_REQUIRED':
      isMenu&&!menu?'E_SITE_GRANT_REQUIRED':
      !hasLaunch?'E_LAUNCH_UNAVAILABLE':
      frontendOnly?'E_FRONTEND_CONTEXT_REQUIRED':'E_CONTEXT';
    return {operation,apiVersion:BROWSER_API_VERSION,implementation:op.implementation.toLowerCase().replaceAll('_','-'),
      exposure,platform:platformSupported?'supported':'unsupported',
      authorization:{tool:hasToolCap?'granted':'missing',browser:requiredBrowser?'granted':'missing',
        site:isMenu?(menu?'granted':'missing'):'not-required'},
      callableNow:runnable,requiresUserGesture:op.requiresUserGesture,reasonCode,
      nextAction:runnable?null:!hasToolCap?'update-tool-package':!platformSupported?null:
        !requiredBrowser?'enable-in-tool-details':isMenu&&!menu?'enable-in-tool-details':null};
  }
  function ensureToolActions(tool,args){
    const actions=menuActions(tool);
    if(!actions.length)throw failure('E_TOOL_CAPABILITY_REQUIRED','Tool does not declare context menus');
    if(args.actionIds?.some(id=>!actions.some(row=>row.actionId===id)))
      throw failure('E_TOOL_CAPABILITY_REQUIRED','Unapproved menu action ID');
    return actions;
  }
  async function handleTool({operation,args={},toolId,toolVersion,toolInstance,hostInstanceId,installEpoch,approvalRef},sender){
    const actualHost=await checkedSender(api,sender);
    if(actualHost!==hostInstanceId||!validId(toolId)||
       typeof toolInstance!=='string'||!/^[0-9a-f-]{36}$/i.test(toolInstance))
      throw failure('E_OWNER','Browser operation is not bound to active tool document');
    return serial(()=>runLocked(toolId,async()=>{
      const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
      if(!sidebarToolEnabled(owned.enabled,toolId))
        throw failure('E_TOOL_DISABLED','Tool was disabled; existing menu and launch authority revoked');
      if(tool.version!==toolVersion||(owned.epochs[toolId]??null)!==(installEpoch??null))
        throw failure('E_TOOL_CHANGED','Old tool version or revoked instance');
      if(intentOperations.has(operation)||operation==='browser.sidePanel.openSelf'){
        const checked=normalizeBrowserOperation(operation,args),hash=await digestTool(tool);
        const owner={toolId,toolVersion,packageHash:hash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null};
        if(operation==='browser.sidePanel.openSelf'){
          await verifyBrowserOwner(owner,operation);
          return {requiresVisibleUserClick:true};
        }
        const intent=browserIntents.get(approvalRef);
        browserIntents.delete(approvalRef);
        if(!intent||Date.now()>=intent.expiresAt||intent.operation!==operation||
           intent.toolId!==toolId||intent.toolVersion!==toolVersion||
           intent.packageHash!==hash||intent.epoch!==(installEpoch??null)||
           intent.toolInstance!==toolInstance||intent.hostInstanceId!==hostInstanceId||
           intent.args!==canonicalJSON(checked))
          throw failure('E_USER_GESTURE_REQUIRED','New explicit approval required for this exact action');
        const approvedOrigin=operation==='browser.network.observe.start'?checked.origins[0]:
          ['browser.tabs.open','browser.network.request'].includes(operation)
            ?new URL(checked.url).origin:null;
        const context={...owner,approvedOrigin};
        await verifyBrowserOwner(context,operation,approvedOrigin);
        if(operation==='browser.tabs.open')return tabHost.open(checked,context);
        if(operation==='browser.tabs.focus')return tabHost.focus(checked,context);
        if(operation==='browser.tabs.closeOwned')return tabHost.closeOwned(checked,context);
        if(operation==='browser.screenshot.captureVisible'){
          // One-use approval was spent above; only the trusted Host may assert
          // that it came from the visible extension UI's verified click.
          const selected=await tabHost.resolve(checked.tabRef,context);
          await verifyBrowserOwner(context,operation,selected.origin);
          const photo=await screenshotHost.captureVisible(checked,{
            ...context,trustedUserActivation:true});
          try{
            // The private PNG remains in SW memory only until final identity and
            // Chrome site permission are rechecked, then a Save As begins.
            const delivery=await screenshotResources.deliver(photo.resourceRef,context,async stored=>{
              const latest=await tabHost.resolve(checked.tabRef,context).catch(()=>null);
              if(!latest||latest.tabId!==stored.tabId||
                 latest.documentId!==stored.documentId||latest.url!==stored.url)
                return false;
              await verifyBrowserOwner(context,operation,latest.origin);
              return true;
            });
            return {...photo,...delivery};
          }finally{await screenshotResources.discardResource(photo.resourceRef)}
        }
        if(operation==='browser.network.observe.start'){
          const target=await tabHost.resolve(checked.tabRef,context);
          if(target.origin!==approvedOrigin)
            throw failure('E_SITE_GRANT_REQUIRED','Only the owned tab Origin is observable');
          await verifyBrowserOwner(context,operation,target.origin);
          const result=await networkObserver.start(checked,context,target);
          try{await verifyBrowserOwner(context,operation,target.origin)}
          catch(error){networkObserver.revokeAll();throw error}
          return result;
        }
        if(operation==='browser.network.observe.export'){
          const saved=await networkObserver.inspect(checked.observationId,context);
          await verifyBrowserOwner(context,operation,saved.origin);
          return networkObserver.exportJson(checked,context);
        }
        const controller=new AbortController();
        activeNetworkRequests.add(controller);
        try{
          const response=await networkHost.request(checked,{...context,signal:controller.signal,
            deadlineAt:Date.now()+15000});
          const result={status:response.status,data:response.data};
          if(jsonBytes(result)>12000)throw failure('E_LIMIT','HTTP response exceeds IPC budget');
          return result;
        }finally{activeNetworkRequests.delete(controller)}
      }
      if(operation==='browser.tabs.getOwned'||operation==='browser.tabs.listOwned'){
        const checked=normalizeBrowserOperation(operation,args),packageHash=await digestTool(tool);
        const context={toolId,toolVersion,packageHash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null};
        await verifyBrowserOwner(context,operation);
        const value=operation==='browser.tabs.getOwned'
          ?await tabHost.getOwned(checked,context):await tabHost.listOwned(checked,context);
        await verifyBrowserOwner(context,operation);
        return value;
      }
      if(observationOperations.has(operation)||ownedOperationMethods.has(operation)){
        const checked=normalizeBrowserOperation(operation,args),packageHash=await digestTool(tool);
        const context={toolId,toolVersion,packageHash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null};
        const ref=checked.observationId??checked.sessionRef??checked.operationId;
        const saved=await networkObserver.inspect(ref,context);
        await verifyBrowserOwner(context,operation,saved.origin);
        if(operation==='browser.operations.getStatus'){
          const result=await networkObserver.getStatus({observationId:ref},context);
          return {state:operationState(result.state)};
        }
        if(operation==='browser.operations.cancel'){
          const result=await networkObserver.cancel({observationId:ref},context);
          return {state:operationState(result.state),cancelRequested:result.cancelRequested};
        }
        if(operation==='browser.network.observe.getStatus')
          return networkObserver.getStatus(checked,context);
        if(operation==='browser.network.observe.stop')
          return networkObserver.stop(checked,context);
        if(operation==='browser.events.read'){
          const result=await networkObserver.read(checked,context);
          if(jsonBytes(result)>12000)throw failure('E_LIMIT','Event page exceeds IPC budget');
          return result;
        }
        return networkObserver.close(checked,context);
      }
      if(operation==='browser.capabilities.list'){
        normalizeBrowserOperation(operation,args);
        const values=await Promise.all(browserCapabilityList().map(async row=>{
          const state=await status(row.operation,tool,owned,{hostInstanceId,toolInstance});
          return {operation:row.operation,implementation:row.implementation,
            riskLevel:row.riskLevel,requiredCapabilities:row.requiredCapabilities,
            requiredChromePermissions:row.requiredChromePermissions,
            status:{callableNow:state.callableNow,reasonCode:state.reasonCode,
              exposure:state.exposure}};
        }));
        // Discovery is bounded; verbose schemas belong to the source contract
        // and getStatus() rather than oversized sandbox IPC messages.
        if(jsonBytes(values)>12000)throw failure('E_LIMIT','Browser capability list exceeds response budget');
        return values;
      }
      if(operation==='browser.capabilities.getStatus'){
        normalizeBrowserOperation(operation,args);return status(args.operation,tool,owned,{hostInstanceId,toolInstance});
      }
      if(operation==='browser.contextMenu.getStatus'){
        normalizeBrowserOperation(operation,args);
        ensureToolActions(tool,{});
        const sites=await permittedOrigins(api,await approvedOrigins(owned.grants,tool));
        const activeActions=owned.grants[toolId]?.activeActions||[];
        const browserPermission=await permissionGranted(api);
        return {operation,enabled:sites.length>0&&browserPermission&&
          activeActions.some(id=>menuActions(tool).some(action=>action.actionId===id)),
          approvedOrigins:sites,activeActions,browserPermission};
      }
      if(operation==='browser.contextMenu.register'||operation==='browser.contextMenu.unregister'){
        normalizeBrowserOperation(operation,args);
        ensureToolActions(tool,args);
        const current=owned.grants[toolId];
        const origins=await permittedOrigins(api,await approvedOrigins(owned.grants,tool));
        // An explicit unregister is idempotent even after the user revoked
        // website scope. It must never recreate a stale grant row.
        if(operation==='browser.contextMenu.unregister'&&!origins.length)
          return {registered:false,actionIds:[]};
        if(!origins.length)
          throw failure('E_SITE_GRANT_REQUIRED','Enable this tool on a specific site in its details first');
        if(operation==='browser.contextMenu.register'&&!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome context menu permission was revoked');
        const activeActions=operation.endsWith('unregister')?[]:args.actionIds;
        const next={...owned.grants,[toolId]:{...current,activeActions}};
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,next);
        await synchronize();
        return {registered:activeActions.length>0,actionIds:activeActions};
      }
      if(operation==='browser.launch.consume'||operation==='browser.page.getSelection'){
        normalizeBrowserOperation(operation,args);ensureToolActions(tool,{});
        if(!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome context menu permission is no longer present');
        const source=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
        const row=source[toolId];
        if(!validLaunch(row)||row.boundTo?.hostInstanceId!==actualHost||
          row.boundTo?.toolInstance!==toolInstance||row.packageHash!==await digestTool(tool)||
          row.installEpoch!==(installEpoch??null)||!(await approvedOrigins(owned.grants,tool)).includes(row.origin))
          throw failure('E_LAUNCH_EXPIRED','Menu launch expired, unbound or permission changed');
        if(!await chromeSitePermitted(api,row.origin))
          throw failure('E_SITE_PERMISSION_REVOKED','Chrome website access was revoked');
        const current=await api.webNavigation.getFrame({tabId:row.tabId,frameId:row.frameId});
        if(!current?.documentId||current.documentId!==row.documentId||current.url!==row.url)
          throw failure('E_DOCUMENT_CHANGED','Clicked document was replaced; selection discarded');
        const next={...source,[toolId]:{...row,state:'consumed',selection:null,consumedAt:Date.now()}};
        await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,next);
        return {ticketId:row.ticketId,toolId,actionId:row.actionId,source:{
          url:row.url,origin:row.origin,tabRef:row.tabRef},
          selection:row.selection,linkUrl:row.linkUrl??null,expiresAt:row.expiresAt};
      }
      throw failure('E_SERVICE_UNSUPPORTED','Browser operation is not available to installed tools');
    }));
  }
  async function handleHost({operation,toolId,enabled,origin,document,launchId,toolInstance,hostInstanceId,toolVersion,installEpoch,targetOperation,targetArgs},sender){
    const actualHost=await checkedSender(api,sender);
    if(actualHost!==hostInstanceId||!validId(toolId))
      throw failure('E_OWNER','Wrong OpenDesk tool host');
    return serial(()=>runLocked(toolId,async()=>{
      if(operation==='browser.intent.confirm'){
        if(!intentOperations.has(targetOperation)||typeof toolInstance!=='string'||
           !/^[0-9a-f-]{36}$/i.test(toolInstance))throw failure('E_SCHEMA','Invalid trusted action');
        const args=normalizeBrowserOperation(targetOperation,targetArgs);
        const source=await readSources(api),tool=admittedTool(source.tools,toolId);
        if(!sidebarToolEnabled(source.enabled,toolId))throw failure('E_TOOL_DISABLED');
        if(tool.version!==toolVersion||(source.epochs[toolId]??null)!==(installEpoch??null))
          throw failure('E_TOOL_CHANGED','Tool updated during approval');
        const packageHash=await digestTool(tool);
        const origin=targetOperation==='browser.network.observe.start'?args.origins[0]:
          ['browser.tabs.open','browser.network.request'].includes(targetOperation)
            ?new URL(args.url).origin:null;
        await verifyBrowserOwner({toolId,toolVersion,packageHash,epoch:installEpoch??null},targetOperation,origin);
        for(const [ref,intent] of browserIntents)if(Date.now()>=intent.expiresAt)browserIntents.delete(ref);
        if(browserIntents.size>=16)throw failure('E_LIMIT','Too many pending approvals');
        const approvalRef=crypto.randomUUID(),expiresAt=Date.now()+INTENT_TTL;
        browserIntents.set(approvalRef,{operation:targetOperation,args:canonicalJSON(args),toolId,toolVersion,
          packageHash,epoch:installEpoch??null,toolInstance,hostInstanceId:actualHost,expiresAt});
        return {approvalRef,expiresAt};
      }
      if(operation==='browser.contextMenu.userToggle'){
        const doc=await api.webNavigation.getFrame({tabId:document?.tabId,frameId:0});
        const url=parsedHttp(document?.url);
        if(!url||doc?.documentId!==document.documentId||doc.url!==url.href||
          url.origin!==origin||typeof enabled!=='boolean')
          throw failure('E_DOCUMENT_CHANGED','Target document changed during menu approval');
        const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
        if(!sidebarToolEnabled(owned.enabled,toolId))
          throw failure('E_TOOL_DISABLED','Disabled tools cannot enable Chrome menus');
        if(!menuActions(tool).some(action=>matchesMenuDocument(action,url.href)))
          throw failure('E_SITE_GRANT_REQUIRED','Tool does not declare a menu on this website');
        if(enabled&&!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome menu permission must be approved by user click');
        if(enabled&&!await chromeSitePermitted(api,origin))
          throw failure('E_SITE_PERMISSION_REVOKED','Chrome website access is unavailable');
        const current=owned.grants[toolId];
        const sites=await approvedOrigins(owned.grants,tool);
        const origins=enabled?[...new Set([...sites,origin])]:sites.filter(item=>item!==origin);
        if(origins.length>20)throw failure('E_LIMIT','Each installed tool may approve at most 20 website Origins');
        const activeActions=enabled?menuActions(tool).map(action=>action.actionId):
          (Array.isArray(current?.activeActions)?current.activeActions:[]);
        const next={...owned.grants,[toolId]:{version:tool.version,packageHash:await digestTool(tool),installEpoch:owned.epochs[toolId]??null,origins,activeActions}};
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,next);
        await synchronize();
        return {enabled:origins.includes(origin),origins};
      }
      if(operation==='browser.launch.bind'){
        if(typeof launchId!=='string'||typeof toolInstance!=='string'||
          !/^[0-9a-f-]{36}$/i.test(toolInstance))throw failure('E_SCHEMA','Invalid launch binding');
        const store=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
        const row=store[toolId], owned=await readSources(api), tool=admittedTool(owned.tools,toolId);
        if(!sidebarToolEnabled(owned.enabled,toolId))
          throw failure('E_TOOL_DISABLED','Disabled tool cannot bind an old launch');
        if(!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome context menu permission is no longer present');
        if(!validLaunch(row)||row.ticketId!==launchId||row.packageHash!==await digestTool(tool)||
          row.installEpoch!==(owned.epochs[toolId]??null)||
          !(await approvedOrigins(owned.grants,tool)).includes(row.origin))
          throw failure('E_LAUNCH_EXPIRED','No valid matching menu launch');
        if(!await chromeSitePermitted(api,row.origin))
          throw failure('E_SITE_PERMISSION_REVOKED','Chrome website access was revoked');
        if(row.boundTo && (row.boundTo.hostInstanceId!==actualHost||row.boundTo.toolInstance!==toolInstance))
          throw failure('E_OWNER','Launch already belongs to another tool instance');
        const updated={...store,[toolId]:{...row,boundTo:{hostInstanceId:actualHost,toolInstance}}};
        await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,updated);
        return {bound:true,ticketId:launchId};
      }
      throw failure('E_SERVICE_UNSUPPORTED','Unknown trusted host operation');
    }));
  }
  async function clicked(info,tab,clickEpoch,sourceDocument){
    const id=String(info.menuItemId||'');
    if(id===ROOT_OPEN)return;
    const match=/^opendesk\.tool\.([a-z][a-z0-9-]{1,39})\.([a-z][a-z0-9-]{0,39})$/.exec(id);
    if(!match||!tab||tab.incognito||!Number.isInteger(tab.id))return;
    const [ ,toolId,actionId]=match;
    const start=Date.now(),source=await readSources(api),tool=admittedTool(source.tools,toolId);
    if(!sidebarToolEnabled(source.enabled,toolId)||!await permissionGranted(api))return;
    const action=menuActions(tool).find(row=>row.actionId===actionId);
    if(!action||!source.grants[toolId]?.activeActions?.includes(actionId))return;
    const frameId=Number.isInteger(info.frameId)?info.frameId:0;
    if(!sourceDocument||captureEpoch(tab.id,frameId)!==clickEpoch)return;
    const url=String(frameId===0?info.pageUrl||tab.url:info.frameUrl||'');
    const parsed=parsedHttp(url);
    if(!parsed||!await chromeSitePermitted(api,parsed.origin)||
      !(await approvedOrigins(source.grants,tool)).includes(parsed.origin)||
      !matchesMenuDocument(action,url))return;
    const before=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(!before?.documentId||before.documentId!==sourceDocument.documentId||
       before.url!==url||sourceDocument.origin!==parsed.origin||
       (before.documentLifecycle&&before.documentLifecycle!=='active'))return;
    const selection=typeof info.selectionText==='string'&&jsonBytes(info.selectionText)<=MAX_SELECTION?
      info.selectionText:null;
    // A missing / replaced document cannot be treated as the clicked selection.
    const after=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(after?.documentId!==before.documentId||after?.url!==before.url||captureEpoch(tab.id,frameId)!==clickEpoch)return;
    const row={ticketId:crypto.randomUUID(),toolId,actionId,issuedAt:start,expiresAt:start+LIFETIME,
      windowId:tab.windowId,tabId:tab.id,tabRef:'clicked:'+crypto.randomUUID(),frameId,
      documentId:sourceDocument.documentId,url,origin:parsed.origin,selection,
      linkUrl:parsedHttp(info.linkUrl)?.href||null,
      packageHash:await digestTool(tool),version:tool.version,
      installEpoch:source.epochs[toolId]??null,state:'pending',boundTo:null};
    if(jsonBytes(row)>MAX_CONTEXT)return;
    // Recheck after digest work: navigation and package updates fail closed.
    const last=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(last?.documentId!==before.documentId||last?.url!==url||Date.now()>=row.expiresAt||captureEpoch(tab.id,frameId)!==clickEpoch)return;
    const latest=await readSources(api),installed=latest.tools.find(value=>value.id===toolId);
    if(!sidebarToolEnabled(latest.enabled,toolId)||!await permissionGranted(api)||
      !await chromeSitePermitted(api,row.origin))return;
    if(!installed||await digestTool(installed)!==row.packageHash||
      !(await approvedOrigins(latest.grants,installed)).includes(row.origin)||
      (latest.epochs[toolId]??null)!==row.installEpoch)return;
    const current=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    if(captureEpoch(tab.id,frameId)!==clickEpoch)return;
    await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{...current,[toolId]:row});
  }
  function onClicked(info,tab){
    const id=String(info.menuItemId||'');
    if(id!==ROOT_OPEN&&!/^opendesk\.tool\./.test(id))return;
    // No await, storage read or Broker initialization before the user gesture.
    try{const result=api.sidePanel.open(tab?.id?{tabId:tab.id}:{windowId:tab?.windowId});
      Promise.resolve(result).catch(e=>logger.warn('OpenDesk menu open',e));}
    catch(error){logger.warn('OpenDesk menu open',error);return;}
    if(id!==ROOT_OPEN){
      const frameId=Number.isInteger(info.frameId)?info.frameId:0;
      const clickEpoch=captureEpoch(tab?.id,frameId);
      const key=epochKey(tab?.id,frameId),pending=pendingSourceContexts.get(key);
      // Chrome's native user-gesture open happened synchronously above; only
      // origin/document verification can await the cold-Worker site read.
      void serial(async()=>{
        if(pending)await pending.catch(()=>false);
        const proof=recentSourceContexts.get(key);
        recentSourceContexts.delete(key);pendingSourceContexts.delete(key);
        const verified=proof&&proof.tabId===tab?.id&&proof.frameId===frameId&&
          Date.now()-proof.at>=0&&Date.now()-proof.at<=SOURCE_PROOF_LIFETIME_MS?proof:null;
        if(!verified){
          logger.warn('OpenDesk menu document proof unavailable; selection discarded');
          return;
        }
        await clicked(info,tab,clickEpoch,verified);
      }).catch(error=>logger.warn('OpenDesk menu launch',error));
    }
  }
  let registered=false;
  function ensureListener(){
    if(registered||!api.contextMenus?.onClicked?.addListener)return;
    api.contextMenus.onClicked.addListener(onClicked);registered=true;
  }
  ensureListener();
  api.storage?.onChanged?.addListener((changes,area)=>{
    if(area==='local'&&[SIDEBAR_TOOL_ENABLE_STORE,SIDEBAR_TOOL_STORE,TOOL_REVOCATION_EPOCHS_STORE].some(key=>Object.hasOwn(changes,key)))
      revokeBrowserOperations();
    if(area==='local'&&Object.hasOwn(changes,SIDEBAR_TOOL_ENABLE_STORE))
      void revokeLaunches().catch(error=>logger.warn('OpenDesk disabled-tool launch cleanup',error));
    if(area==='local'&&(Object.hasOwn(changes,SIDEBAR_TOOL_ENABLE_STORE)||
       Object.hasOwn(changes,SIDEBAR_TOOL_STORE)||
       Object.hasOwn(changes,BROWSER_MENU_GRANTS_STORE)||
       Object.hasOwn(changes,TOOL_REVOCATION_EPOCHS_STORE)))void sync().catch(e=>logger.warn('OpenDesk menu reconcile',e));
  });
  const invalidateTab=(tabId,frameId=0)=>serial(async()=>{
    const rows=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    const next={...rows},invalidated=[];
    for(const [id,row] of Object.entries(rows)){
      if(row.tabId===tabId&&(frameId===0||row.frameId===frameId)){
        next[id]={...row,state:'invalidated',selection:null,linkUrl:null};
        invalidated.push(id);
      }
    }
    if(invalidated.length)await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,next);
    return invalidated;
  });
  const revokePermission=()=>serial(async()=>{
    // Chrome permission reapproval must never restore an old tool site grant.
    menuActionsAvailable=false;
    recentSourceContexts.clear();pendingSourceContexts.clear();activeMenuOrigins.clear();
    await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{});
    await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{});
  });
  const revokeLaunches=()=>serial(async()=>{
    const rows=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    if(Object.keys(rows).length)await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{});
  });
  return Object.freeze({synchronize:sync,handleTool,handleHost,onClicked,ensureListener,invalidateTab,revokeLaunches,revokePermission,revokeBrowserOperations,noteNavigation,noteSourceContext,receiveSourceContext});
}
