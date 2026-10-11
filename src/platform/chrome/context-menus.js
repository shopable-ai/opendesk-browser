// Trusted Chrome MV3 context-menu driver. No third-party code executes here.
// Listener registration is synchronous; storage and install checks are async.
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT_V2,validateSidebarToolPackage,serializeSidebarToolPackage} from '../../ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,requireCompleteInstalledSidebarTools} from '../../ui/sidebar-tools/installation.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_ROOT,BROWSER_MENU_GRANTS_STORE,
  BROWSER_MENU_MATERIALIZED_STORE,BROWSER_MENU_LAUNCH_STORE,
  BROWSER_API_VERSION,BROWSER_OPERATIONS,browserCapabilityList,browserOperation,
  deniedBrowserStatus,normalizeBrowserOperation} from '../../framework/sdk/browser-contract.js';
const ROOT_OPEN='opendesk.browser.open';
const ID_PREFIX='opendesk.tool.';
const MAX_SELECTION=16384,MAX_CONTEXT=65536,LIFETIME=60000;
const failure=(code,message)=>Object.assign(new Error(message||code),{code});
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(id);
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
function checkedSender(api,sender){
  if(sender?.id!==api.runtime?.id||sender?.frameId!==0||sender?.tab?.incognito)
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
function approvedOrigins(grants,tool){
  const row=grants?.[tool.id];
  return row?.version===tool.version&&Array.isArray(row.origins)&&
    row.origins.every(origin=>Boolean(parsedHttp(origin))&&new URL(origin).origin===origin)
      ?row.origins:[];
}
async function readSources(api){
  const r=await api.storage.local.get([SIDEBAR_TOOL_STORE,BROWSER_MENU_GRANTS_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
  return {tools:requireCompleteInstalledSidebarTools(r[SIDEBAR_TOOL_STORE]),
    grants:r[BROWSER_MENU_GRANTS_STORE]||{},epochs:r[TOOL_REVOCATION_EPOCHS_STORE]||{}};
}
async function permissionGranted(api){
  return Boolean(api.contextMenus&&api.permissions?.contains&&
    await api.permissions.contains({permissions:['contextMenus']}));
}
async function confirmedWrite(area,key,value){
  await area.set({[key]:value});
  const row=await area.get(key);
  if(JSON.stringify(row[key])!==JSON.stringify(value))
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
export function createContextMenuHost({api=globalThis.chrome,logger=console}={}){
  let chain=Promise.resolve();
  const serial=work=>{const result=chain.catch(()=>{}).then(work);chain=result.catch(()=>{});return result;};
  const runLocked=(id,work)=>{
    const locks=globalThis.navigator?.locks;
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
    if(!await permissionGranted(api))return {enabled:false,reason:'E_CHROME_PERMISSION_REQUIRED'};
    const {tools,grants}=await readSources(api);
    const desired=new Map([
      [BROWSER_MENU_ROOT,{id:BROWSER_MENU_ROOT,title:'OpenDesk Browser',contexts:['page','selection','link']}],
      [ROOT_OPEN,{id:ROOT_OPEN,parentId:BROWSER_MENU_ROOT,title:'打开 OpenDesk Browser',contexts:['page','selection','link']}]
    ]);
    for(const tool of tools)for(const action of menuActions(tool)){
      const origins=approvedOrigins(grants,tool),patterns=scopedMenuPatterns(origins,action);
      const active=grants[tool.id]?.activeActions;
      if(!patterns.length||!Array.isArray(active)||!active.includes(action.actionId))continue;
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
    return {enabled:true,count:desired.size};
  }
  const sync=()=>serial(synchronize);
  async function status(operation,tool){
    const op=browserOperation(operation);
    if(!op)return deniedBrowserStatus(operation);
    const {grants}=await readSources(api), menu=approvedOrigins(grants,tool).length>0;
    const isMenu=operation.startsWith('browser.contextMenu')||operation.startsWith('browser.launch')||
      operation==='browser.page.getSelection';
    const hasToolCap=op.requiredCapabilities.every(cap=>tool.capabilities.includes(cap));
    const chromium=await permissionGranted(api);
    const requiredBrowser=op.requiredChromePermissions.length?op.requiredChromePermissions.every(id=>
      id!=='contextMenus'||chromium):true;
    const exposure=op.supportedContexts.includes('sidebar-tool')&&hasToolCap?'allowed':'not-exposed';
    const runnable=op.implementation==='IMPLEMENTED'&&exposure==='allowed'&&requiredBrowser&&
      (!isMenu||menu);
    return {operation,apiVersion:BROWSER_API_VERSION,implementation:op.implementation.toLowerCase().replaceAll('_','-'),
      exposure,platform:api.runtime?'supported':'unsupported',
      authorization:{tool:hasToolCap?'granted':'missing',browser:requiredBrowser?'granted':'missing',
        site:isMenu?(menu?'granted':'missing'):'not-required'},
      callableNow:runnable,reasonCode:runnable?null:op.implementation!=='IMPLEMENTED'?'E_NOT_IMPLEMENTED':
        !hasToolCap?'E_TOOL_CAPABILITY_REQUIRED':!requiredBrowser?'E_CHROME_PERMISSION_REQUIRED':
        isMenu&&!menu?'E_SITE_GRANT_REQUIRED':'E_CONTEXT',
      nextAction:runnable?null:!hasToolCap?'update-tool-package':!requiredBrowser?'enable-in-tool-details':
        isMenu&&!menu?'enable-in-tool-details':null};
  }
  function ensureToolActions(tool,args){
    const actions=menuActions(tool);
    if(!actions.length)throw failure('E_TOOL_CAPABILITY_REQUIRED','Tool does not declare context menus');
    if(args.actionIds?.some(id=>!actions.some(row=>row.actionId===id)))
      throw failure('E_TOOL_CAPABILITY_REQUIRED','Unapproved menu action ID');
    return actions;
  }
  async function handleTool({operation,args={},toolId,toolVersion,toolInstance,hostInstanceId,installEpoch},sender){
    const actualHost=checkedSender(api,sender);
    if(actualHost!==hostInstanceId||!validId(toolId)||
       typeof toolInstance!=='string'||!/^[0-9a-f-]{36}$/i.test(toolInstance))
      throw failure('E_OWNER','Browser operation is not bound to active tool document');
    return serial(async()=>{
      const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
      if(tool.version!==toolVersion||(owned.epochs[toolId]??null)!==(installEpoch??null))
        throw failure('E_TOOL_CHANGED','Old tool version or revoked instance');
      if(operation==='browser.capabilities.list')return Promise.all(
        browserCapabilityList().map(async row=>({...row,status:await status(row.operation,tool)})));
      if(operation==='browser.capabilities.getStatus'){
        normalizeBrowserOperation(operation,args);return status(args.operation,tool);
      }
      if(operation==='browser.contextMenu.getStatus'){
        normalizeBrowserOperation(operation,args);
        ensureToolActions(tool,{});
        return {operation,enabled:approvedOrigins(owned.grants,tool).length>0,
          approvedOrigins:approvedOrigins(owned.grants,tool),
          activeActions:owned.grants[toolId]?.activeActions||[],
          browserPermission:await permissionGranted(api)};
      }
      if(operation==='browser.contextMenu.register'||operation==='browser.contextMenu.unregister'){
        normalizeBrowserOperation(operation,args);
        ensureToolActions(tool,args);
        const current=owned.grants[toolId];
        if(!approvedOrigins(owned.grants,tool).length)
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
        const source=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
        const row=source[toolId];
        if(!validLaunch(row)||row.boundTo?.hostInstanceId!==actualHost||
          row.boundTo?.toolInstance!==toolInstance||row.packageHash!==await digestTool(tool)||
          row.installEpoch!==(installEpoch??null)||!approvedOrigins(owned.grants,tool).includes(row.origin))
          throw failure('E_LAUNCH_EXPIRED','Menu launch expired, unbound or permission changed');
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
    });
  }
  async function handleHost({operation,toolId,enabled,origin,document,launchId,toolInstance,hostInstanceId},sender){
    const actualHost=checkedSender(api,sender);
    if(actualHost!==hostInstanceId||!validId(toolId))
      throw failure('E_OWNER','Wrong OpenDesk tool host');
    return serial(async()=>{
      if(operation==='browser.contextMenu.userToggle'){
        const doc=await api.webNavigation.getFrame({tabId:document?.tabId,frameId:0});
        const url=parsedHttp(document?.url);
        if(!url||doc?.documentId!==document.documentId||doc.url!==url.href||
          url.origin!==origin||typeof enabled!=='boolean')
          throw failure('E_DOCUMENT_CHANGED','Target document changed during menu approval');
        const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
        if(!menuActions(tool).some(action=>matchesMenuDocument(action,url.href)))
          throw failure('E_SITE_GRANT_REQUIRED','Tool does not declare a menu on this website');
        if(enabled&&!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome menu permission must be approved by user click');
        const current=owned.grants[toolId];
        const sites=approvedOrigins(owned.grants,tool);
        const origins=enabled?[...new Set([...sites,origin])]:sites.filter(item=>item!==origin);
        const activeActions=enabled?menuActions(tool).map(action=>action.actionId):
          (Array.isArray(current?.activeActions)?current.activeActions:[]);
        const next={...owned.grants,[toolId]:{version:tool.version,origins,activeActions}};
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,next);
        await synchronize();
        return {enabled:origins.includes(origin),origins};
      }
      if(operation==='browser.launch.bind'){
        if(typeof launchId!=='string'||typeof toolInstance!=='string'||
          !/^[0-9a-f-]{36}$/i.test(toolInstance))throw failure('E_SCHEMA','Invalid launch binding');
        const store=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
        const row=store[toolId], owned=await readSources(api), tool=admittedTool(owned.tools,toolId);
        if(!validLaunch(row)||row.ticketId!==launchId||row.packageHash!==await digestTool(tool)||
          row.installEpoch!==(owned.epochs[toolId]??null)||
          !approvedOrigins(owned.grants,tool).includes(row.origin))
          throw failure('E_LAUNCH_EXPIRED','No valid matching menu launch');
        if(row.boundTo && (row.boundTo.hostInstanceId!==actualHost||row.boundTo.toolInstance!==toolInstance))
          throw failure('E_OWNER','Launch already belongs to another tool instance');
        const updated={...store,[toolId]:{...row,boundTo:{hostInstanceId:actualHost,toolInstance}}};
        await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,updated);
        return {bound:true,ticketId:launchId};
      }
      throw failure('E_SERVICE_UNSUPPORTED','Unknown trusted host operation');
    });
  }
  async function clicked(info,tab){
    const id=String(info.menuItemId||'');
    if(id===ROOT_OPEN)return;
    const match=/^opendesk\.tool\.([a-z][a-z0-9-]{1,39})\.([a-z][a-z0-9-]{0,39})$/.exec(id);
    if(!match||!tab||tab.incognito||!Number.isInteger(tab.id))return;
    const [ ,toolId,actionId]=match;
    const start=Date.now(),source=await readSources(api),tool=admittedTool(source.tools,toolId);
    const action=menuActions(tool).find(row=>row.actionId===actionId);
    if(!action||!source.grants[toolId]?.activeActions?.includes(actionId))return;
    const frameId=Number.isInteger(info.frameId)?info.frameId:0;
    const url=String(frameId===0?info.pageUrl||tab.url:info.frameUrl||'');
    const parsed=parsedHttp(url);
    if(!parsed||!approvedOrigins(source.grants,tool).includes(parsed.origin)||
      !matchesMenuDocument(action,url))return;
    const before=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(!before?.documentId||before.url!==url||(before.documentLifecycle&&before.documentLifecycle!=='active'))return;
    const selection=typeof info.selectionText==='string'&&jsonBytes(info.selectionText)<=MAX_SELECTION?
      info.selectionText:null;
    // A missing / replaced document cannot be treated as the clicked selection.
    const after=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(after?.documentId!==before.documentId||after?.url!==before.url)return;
    const row={ticketId:crypto.randomUUID(),toolId,actionId,issuedAt:start,expiresAt:start+LIFETIME,
      windowId:tab.windowId,tabId:tab.id,tabRef:'clicked:'+crypto.randomUUID(),frameId,
      documentId:before.documentId,url,origin:parsed.origin,selection,
      linkUrl:parsedHttp(info.linkUrl)?.href||null,
      packageHash:await digestTool(tool),version:tool.version,
      installEpoch:source.epochs[toolId]??null,state:'pending',boundTo:null};
    if(jsonBytes(row)>MAX_CONTEXT)return;
    // Recheck after digest work: navigation and package updates fail closed.
    const last=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(last?.documentId!==before.documentId||last?.url!==url||Date.now()>=row.expiresAt)return;
    const latest=await readSources(api),installed=latest.tools.find(value=>value.id===toolId);
    if(!installed||await digestTool(installed)!==row.packageHash||
      !approvedOrigins(latest.grants,installed).includes(row.origin)||
      (latest.epochs[toolId]??null)!==row.installEpoch)return;
    const current=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{...current,[toolId]:row});
  }
  function onClicked(info,tab){
    const id=String(info.menuItemId||'');
    if(id!==ROOT_OPEN&&!/^opendesk\.tool\./.test(id))return;
    // No await, storage read or Broker initialization before the user gesture.
    try{const result=api.sidePanel.open(tab?.id?{tabId:tab.id}:{windowId:tab?.windowId});
      Promise.resolve(result).catch(e=>logger.warn('OpenDesk menu open',e));}
    catch(error){logger.warn('OpenDesk menu open',error);return;}
    if(id!==ROOT_OPEN)void serial(()=>clicked(info,tab)).catch(e=>logger.warn('OpenDesk menu launch',e));
  }
  api.contextMenus?.onClicked?.addListener(onClicked);
  api.storage?.onChanged?.addListener((changes,area)=>{
    if(area==='local'&&(Object.hasOwn(changes,SIDEBAR_TOOL_STORE)||
       Object.hasOwn(changes,BROWSER_MENU_GRANTS_STORE)||
       Object.hasOwn(changes,TOOL_REVOCATION_EPOCHS_STORE)))void sync().catch(e=>logger.warn('OpenDesk menu reconcile',e));
  });
  return Object.freeze({synchronize:sync,handleTool,handleHost,onClicked});
}
