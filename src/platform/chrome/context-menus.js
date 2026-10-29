import {isToolSender,resolveToolSender,permissionPattern} from '../../environment.js';
import {SIDEPANEL_DOCUMENT_PATH} from '../../tool-document-url.js';
import {createBrowserTabHost} from './browser-tabs.js';
import {createCurrentPageReferences} from './current-page-refs.js';
import {createPageEnvironmentReader} from './browser-page-environment.js';
import {createFingerprintDriver} from './browser-fingerprint.js';
import {createNetworkService} from './network.js';
import {createBrowserNetworkObserver} from './browser-network-observe.js';
import {createBrowserScreenshotHost} from './browser-screenshot.js';
import {createBrowserScreenshotResources} from './browser-screenshot-resources.js';
import {createBrowserDownloadsHost} from './browser-downloads.js';
import {createBrowserBookmarksHost} from './bookmarks.js';
import {createBrowserFullBookmarksHost} from './bookmarks-full.js';
import {createApprovedBrowserBindings} from '../../framework/sdk/browser-bindings.js';
import {createBrowserManagedProxy} from './browser-managed-proxy.js';
import {REVIEWED_MANAGED_PROXY_PROFILES} from './browser-managed-proxy-profiles.js';
import {APPROVED_BROWSER_DIRECT_BINDINGS} from '../../framework/sdk/browser-direct.generated.js';
import {validateTrustedScheduleIntent,validateTrustedAppServiceScheduleIntent} from '../tasks/schedule-contract.js';
import {createBrowserHistoryHost} from './history.js';
import {executeBrowserToolStorage} from '../../ui/sidebar-tools/storage-state.js';
import {readAppServiceInstallation,assertAppServiceBinding,APP_SERVICE_OPERATIONS} from '../tasks/app-service-installation.js';
import {createTrustedCookieHost} from './browser-cookie-host.js';
import {loadOfficialCatalog,matchesOfficialRelease} from '../../sidebar-tools/official-catalog.js';
import {MARKET_PROVENANCE_STORE} from '../../sidebar-tools/official-reading-toc.js';
import {chromeCall} from './tabs.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,requireToolRevocationEpochs,sidebarToolEnabled} from '../../ui/sidebar-tools/lifecycle.js';
// Trusted Chrome MV3 context-menu driver. No third-party code executes here.
// Listener registration is synchronous; storage and install checks are async.
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT_V2,validateSidebarToolPackage,sidebarToolPackageHash} from '../../ui/sidebar-tools/package.js';
// The installer owns the revocation store. Keep the SW's menu listener small:
 // importing installation.js here would bundle the entire tool installer in SW.
const TOOL_REVOCATION_EPOCHS_STORE='opendesk.sidebar-tools.revocation-epochs.v1';
function requireCompleteInstalledSidebarTools(rows){
  if(rows===undefined)return [];
  if(!Array.isArray(rows))throw failure('E_STORAGE_CORRUPT','Installed tool registry is invalid');
  const seen=new Set();
  return rows.map(row=>{
    const tool=validateSidebarToolPackage(row);
    if(seen.has(tool.id))throw failure('E_STORAGE_CORRUPT','Duplicate installed tool');
    seen.add(tool.id);return tool;
  });
}
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_SOURCE_PROTOCOL,BROWSER_MENU_SELECTION_PROTOCOL,BROWSER_MENU_ROOT,BROWSER_MENU_GRANTS_STORE,
  BROWSER_MENU_MATERIALIZED_STORE,BROWSER_MENU_LAUNCH_STORE,
  BROWSER_API_VERSION,BROWSER_OPERATIONS,browserCapabilityList,browserOperation,
  deniedBrowserStatus,normalizeBrowserOperation} from '../../framework/sdk/browser-contract.js';
const ROOT_OPEN='opendesk.browser.open'; // Pre-R1.1 legacy ID; never create or launch it.
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
// Display-only branding comes from the BUILT extension manifest. It never
// changes tool IDs, package digests, grants, or the Browser SDK protocol.
// Native Chrome owns the grouping label (Manifest "name").
const MENU_BIDI_OR_CONTROL=/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;
function menuText(value,max){
  if(typeof value!=='string')return '';
  const cleaned=value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,' ')
    .replace(/\s+/g,' ').trim();
  const points=[...cleaned];
  return points.length>max?points.slice(0,max-1).join('')+'…':cleaned;
}
export function formatBrowserMenuTitle(actionTitle,manifest={}){
  const raw=manifest?.short_name;
  const short=typeof raw==='string'&&[...raw].length<=12&&!MENU_BIDI_OR_CONTROL.test(raw)
    ?menuText(raw,12):'';
  const prefix=short||menuText(manifest?.name,12);
  let title=menuText(actionTitle,80)||'操作';
  if(!prefix)return title; // No arbitrary hard-coded replacement brand.
  const escaped=[...prefix].map(char=>'\\^$.*+?()[]{}|'.includes(char)?'\\'+char:char).join('');
  const duplicate=new RegExp('^'+escaped+'(?:\\s*[·:|–—-]\\s*|\\s+)','i');
  for(let i=0;i<3;i++){
    const next=title.replace(duplicate,'').trim();
    if(!next||next===title)break;
    title=next;
  }
  return title.toLocaleLowerCase()===prefix.toLocaleLowerCase()?prefix:prefix+' · '+title;
}
export function matchesMenuDocument(action,url){
  const doc=parsedHttp(url);
  if(!doc||!action?.documentUrlPatterns)return false;
  return action.documentUrlPatterns.some(pattern=>{
    // Installation reviews these patterns. Clicks still validate the actual
    // document, Chrome access and any explicit exact-Origin stop.
    if(pattern===doc.protocol+'//*/*')return true;
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
const digestTool=sidebarToolPackageHash;
async function checkedSender(api,sender){
  sender=await resolveToolSender(api,sender);
  if(!isToolSender(api,sender))throw failure('E_OWNER','Untrusted Browser SDK sender');
  if(sender?.id!==api.runtime?.id||(sender?.frameId!==undefined&&sender.frameId!==0)||sender?.tab?.incognito)
    throw failure('E_OWNER','Only the trusted top-level OpenDesk UI may call Browser host');
  const expected=new URL(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH));
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
    row.origins.every(origin=>['http://*','https://*'].includes(origin)||Boolean(parsedHttp(origin))&&new URL(origin).origin===origin)
      ?row.origins:[];
}
// Installed declarations are the basic menu authority. This projection never
// changes Cookie/Full Bookmarks grants stored alongside the menu preferences.
async function effectiveMenuState(grants,tool,epochs){
  const actions=menuActions(tool);
  if(!actions.length)return {origins:[],activeActions:[],disabledOrigins:[]};
  const packageHash=await digestTool(tool),installEpoch=epochs[tool.id]??null;
  const stored=grants[tool.id],row=stored?.contextMenu??stored;
  const current=row?.version===tool.version&&row.packageHash===packageHash&&row.installEpoch===installEpoch;
  const declared=actions.map(action=>action.actionId);
  // Same-install preferences still restrict authority after an interrupted update.
  const previous=!current&&row?.installEpoch===installEpoch?row:null;
  const hasPreferences=Boolean((current||previous)&&
    (Object.hasOwn(row,'activeActions')||Object.hasOwn(row,'origins')));
  if(hasPreferences&&(!Array.isArray(row.activeActions)||!Array.isArray(row.origins)||
     (row.defaults!==undefined&&typeof row.defaults!=='boolean')||
     !row.origins.every(origin=>Boolean(parsedHttp(origin))&&new URL(origin).origin===origin)||
     (row.disabledOrigins!==undefined&&(!Array.isArray(row.disabledOrigins)||
       !row.disabledOrigins.every(origin=>Boolean(parsedHttp(origin))&&new URL(origin).origin===origin)))))
    throw failure('E_STORAGE_CORRUPT','Invalid context menu preferences');
  // A legacy positive allowlist recorded approvals, not explicit site stops.
  // Reuse installation approval there too; retain explicit action shutdowns.
  const defaults=!hasPreferences||row.defaults!==false;
  const origins=defaults?[...new Set(actions.flatMap(action=>action.documentUrlPatterns.map(pattern=>
    pattern==='http://*/*'?'http://*':pattern==='https://*/*'?'https://*':new URL(pattern).origin)))]:row.origins;
  const disabledOrigins=hasPreferences?row.disabledOrigins||[]:[];
  return {version:tool.version,packageHash,installEpoch,defaults,
    origins:defaults?origins:origins.filter(origin=>!disabledOrigins.includes(origin)),disabledOrigins,
    activeActions:hasPreferences?row.activeActions.filter(id=>declared.includes(id)):declared};
}
function menuOriginAllowed(record,origin){
  const site=parsedHttp(origin);
  return Boolean(site&&site.origin===origin&&!record?.disabledOrigins?.includes(origin)&&
    record?.origins?.some(approved=>approved===origin||approved===site.protocol+'//*'||
      record.defaults===true&&parsedHttp(approved)?.protocol===site.protocol&&
        parsedHttp(approved)?.hostname===site.hostname));
}
function storedMenuState(state,changes={}){
  // Wildcards come only from the installed package, never a stored site grant.
  return {...state,origins:state.origins.filter(origin=>!['http://*','https://*'].includes(origin)),...changes};
}
async function readSources(api){
  const r=await api.storage.local.get([SIDEBAR_TOOL_STORE,BROWSER_MENU_GRANTS_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
  const tools=requireCompleteInstalledSidebarTools(r[SIDEBAR_TOOL_STORE]);
  const epochs=requireToolRevocationEpochs(r[TOOL_REVOCATION_EPOCHS_STORE]);
  const grants=r[BROWSER_MENU_GRANTS_STORE]??{};
  if(!grants||typeof grants!=='object'||Array.isArray(grants))throw failure('E_STORAGE_CORRUPT','Invalid browser grants');
  const menus={};
  for(const tool of tools)menus[tool.id]=await effectiveMenuState(grants,tool,epochs);
  return {tools,grants,menus,epochs,enabled:requireToolEnableRecords(r[SIDEBAR_TOOL_ENABLE_STORE])};
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
    if(!cache.has(origin))cache.set(origin,['http://*','https://*'].includes(origin)
      ?Promise.resolve(api.permissions?.contains?.({origins:[origin+'/*']})).catch(()=>false)
      :chromeSitePermitted(api,origin));
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
function launchActionEnabled(row,tool,grants){
  return Array.isArray(grants?.[tool.id]?.activeActions)&&
    grants[tool.id].activeActions.includes(row?.actionId)&&
    menuActions(tool).some(action=>action.actionId===row?.actionId&&matchesMenuDocument(action,row.url));
}
function scopedMenuPatterns(origins,action){
  return [...new Set(origins.flatMap(origin=>{
    if(['http://*','https://*'].includes(origin))return action.documentUrlPatterns.filter(pattern=>pattern.startsWith(origin.split('*')[0]));
    if(!matchesMenuDocument(action,origin))return [];
    const url=new URL(origin);
    // Chrome match patterns have no port; host authorization still checks exact origin.
    return [url.protocol+'//'+url.hostname+'/*'];
  }))];
}
export function createContextMenuHost({api=globalThis.chrome,logger=console,lockManager=globalThis.navigator?.locks,fetchImpl=globalThis.fetch,scheduleService=null,
  reviewedProxyProfiles=REVIEWED_MANAGED_PROXY_PROFILES}={}){
  let chain=Promise.resolve();
  const documentEpochs=new Map();
  const recentSourceContexts=new Map();
  const pendingSourceContexts=new Map();
  let menuActionsAvailable=false;
  const activeMenuStates=[]; // Ephemeral projection of installed menus, never a grant store.
  // Single-use intents are created only by the trusted extension UI after a user click.
  // They do not survive Worker restart and are never supplied by tool script.
  const browserIntents=new Map(),INTENT_TTL=15000;
  // A permission or installed-package change must fence requests that are already in fetch().
  const activeNetworkRequests=new Set();
  // The approved Registry, not a second handwritten Host list, defines which
  // calls require a one-use trusted confirmation. sidePanel.openSelf remains
  // a separate synchronous foreground-gesture path.
  const intentOperations=new Set(Object.values(BROWSER_OPERATIONS)
    .filter(row=>row.requiresUserGesture&&row.operation!=='browser.sidePanel.openSelf')
    .map(row=>row.operation));
  const observationOperations=new Set(['browser.network.observe.getStatus','browser.network.observe.stop',
    'browser.events.read','browser.events.close']);
  const ownedOperationMethods=new Set(['browser.operations.getStatus','browser.operations.cancel']);
  const operationState=state=>({
    running:'running',stopped:'completed',cancelled:'cancelled',
    interrupted:'failed',revoked:'cancelled'})[state]??'unknown';
  const serviceContexts=new WeakMap();
  async function verifyBrowserOwner(identity,operation,origin=null){
    const service=serviceContexts.get(identity);
    if(service){
      if(origin!==null||!APP_SERVICE_OPERATIONS.includes(operation))throw failure('E_CAPABILITY');
      const {tool}=await assertAppServiceBinding(api,service.binding);
      const spec=browserOperation(operation);
      if(!spec?.requiredCapabilities.every(cap=>tool.capabilities.includes(cap)))throw failure('E_TOOL_CAPABILITY_REQUIRED');
      for(const permission of spec.requiredChromePermissions)
        if(!await api.permissions.contains({permissions:[permission]}))throw failure('E_CHROME_PERMISSION_REQUIRED');
      await service.authorize();
      return tool;
    }
    const owned=await readSources(api),tool=admittedTool(owned.tools,identity.toolId);
    if(!sidebarToolEnabled(owned.enabled,tool.id))throw failure('E_TOOL_DISABLED');
    if(tool.version!==identity.toolVersion||(owned.epochs[tool.id]??null)!==(identity.epoch??null)||
       await digestTool(tool)!==identity.packageHash)throw failure('E_TOOL_CHANGED','Tool package or install epoch changed');
    const op=browserOperation(operation);
    if(!op||!op.requiredCapabilities.every(cap=>tool.capabilities.includes(cap)))throw failure('E_TOOL_CAPABILITY_REQUIRED');
    if(op.requiredCapabilities.includes('browser.bookmarks.full')){
      const record=owned.grants[tool.id];
      if(record?.bookmarkFull!==true||record.version!==tool.version||
         record.packageHash!==identity.packageHash||
         record.installEpoch!==(owned.epochs[tool.id]??null))
        throw failure('E_BOOKMARK_FULL_CONSENT_REQUIRED','Independent Full Bookmarks consent required');
    }
    for(const permission of op.requiredChromePermissions){
      // Chrome permission loss must not hide an owned STOP or prevent its
      // durable intent. These two methods cannot mutate native proxy config
      // without the Driver independently checking permission and exact PAC.
      if(permission==='proxy'&&['browser.proxy.managed.getStatus',
        'browser.proxy.managed.requestDisable'].includes(operation))continue;
      if(!api.permissions?.contains||!await api.permissions.contains({permissions:[permission]}))
        throw failure('E_CHROME_PERMISSION_REQUIRED');
    }
    if(origin!==null){
      const site=parsedHttp(origin);
      if(!site||site.origin!==origin||!api.permissions?.contains||
         !await api.permissions.contains({origins:[permissionPattern(origin+'/')]}))
        throw failure('E_SITE_PERMISSION_REVOKED');
    }
    return tool;
  }

  const cookieCapabilities=Object.freeze({
    'browser.cookies.get':'read','browser.cookies.getAll':'read','browser.cookies.getAllPage':'read',
    'browser.cookies.set':'write','browser.cookies.setMany':'write','browser.cookies.remove':'write',
    'browser.cookies.clearSite':'clear','browser.cookies.getCurrentStore':'read',
    'browser.cookies.getPartitionKey':'read','browser.cookies.observe.start':'observe',
    'browser.cookies.observe.getStatus':'observe','browser.cookies.observe.read':'observe',
    'browser.cookies.observe.stop':'observe'
  });
  let cookieOfficialCatalog;
  async function admittedOfficialCookie(tool){
    if(tool.id!=='cookie-editor'||!tool.capabilities.includes('browser.cookies.write'))return false;
    // Reuse the import UI's exact offline release/provenance checks. Neither
    // a claimed ID nor a caller-provided package hash establishes officiality.
    try{
      const catalog=await (cookieOfficialCatalog??=loadOfficialCatalog({api,fetcher:fetchImpl}));
      const release=catalog.apps.find(row=>row.toolId==='cookie-editor');
      const saved=await api.storage.local.get(MARKET_PROVENANCE_STORE);
      const provenance=saved[MARKET_PROVENANCE_STORE]?.[tool.id];
      return Boolean(release&&provenance?.marketId===release.id&&
        provenance.version===release.version&&provenance.sha256===release.sha256&&
        await matchesOfficialRelease(release,tool));
    }catch{cookieOfficialCatalog=undefined;return false;}
  }
  async function authorizedCookie(identity,operation,url,options={}){
    const parsed=parsedHttp(url);
    if(!parsed)throw failure('E_SCHEMA','A specific HTTP(S) Cookie URL is required');
    const origin=parsed.origin,tool=await verifyBrowserOwner(identity,operation,origin);
    const source=await readSources(api),record=source.grants[tool.id];
    if(record?.version!==tool.version||record.packageHash!==identity.packageHash||
       record.installEpoch!==(source.epochs[tool.id]??null))
      throw failure('E_SITE_GRANT_REQUIRED','Cookie site grant invalidated by a package change');
    const cap=cookieCapabilities[operation];
    const allSites=record.cookieAllSites?.[cap]===true&&await admittedOfficialCookie(tool);
    const grant=allSites?record.cookieAllSites:record.cookieSites?.[origin];
    if(!cap||grant?.[cap]!==true||!grant.storeId||!grant.grantEpoch)
      throw failure('E_SITE_GRANT_REQUIRED','Approve this Cookie capability in the installed tool settings');
    if(options.includeValues===true&&
       (!tool.capabilities.includes('browser.cookies.values')||grant.values!==true||
          allSites&&grant.valueConsent!==true))
      throw failure('E_COOKIE_VALUES_REQUIRED','Current trusted Cookie consent does not include sensitive values');
    if(options.storeId!==undefined&&options.storeId!==grant.storeId)
      throw failure('E_COOKIE_STORE');
    let partitionKey=grant.partitionKey??null;
    if(allSites){
      const stores=await chromeCall(api,api.cookies,'getAllCookieStores');
      const regular=Array.isArray(stores)?stores.filter(row=>row.id===grant.storeId&&!row.incognito):[];
      if(regular.length!==1)throw failure('E_COOKIE_STORE');
      partitionKey=null;
      // All-site consent does not authorize a tool-selected foreign Partition.
      // Resolve partitioned access from the real, regular current document.
      if(operation==='browser.cookies.getPartitionKey'||options.partitionKey||
         options.cookies?.some(row=>row.partitionKey)){
        const tabs=await api.tabs.query({active:true,currentWindow:true});
        const tab=Array.isArray(tabs)&&tabs.length===1?tabs[0]:null;
        if(!tab||tab.incognito||tab.pendingUrl||parsedHttp(tab.url)?.origin!==origin||
           !regular[0].tabIds?.includes(tab.id))throw failure('E_COOKIE_PARTITION');
        const frame=await api.webNavigation.getFrame({tabId:tab.id,frameId:0});
        if(!frame?.documentId||frame.url!==tab.url||
           frame.documentLifecycle&&frame.documentLifecycle!=='active')throw failure('E_DOCUMENT_CHANGED');
        const receipt=await chromeCall(api,api.cookies,'getPartitionKey',{tabId:tab.id,frameId:0});
        if(!parsedHttp(receipt?.partitionKey?.topLevelSite))throw failure('E_COOKIE_PARTITION');
        const after=await api.webNavigation.getFrame({tabId:tab.id,frameId:0});
        if(after?.documentId!==frame.documentId||after.url!==frame.url)
          throw failure('E_DOCUMENT_CHANGED');
        partitionKey=receipt.partitionKey;
      }
    }
    if(options.partitionKey&&(!partitionKey||
       options.partitionKey.topLevelSite!==partitionKey.topLevelSite||
       Boolean(options.partitionKey.hasCrossSiteAncestor)!==
         Boolean(partitionKey.hasCrossSiteAncestor)))throw failure('E_COOKIE_PARTITION');
    return {origin,storeId:grant.storeId,partitionKey,grantEpoch:grant.grantEpoch};
  }
  // Only the checked Side Panel can mint the exact Host approval following
  // the official Cookie Editor's real import click. Imported destination
  // origins use Chrome's actual host permissions, not unrelated site grants.
  async function authorizedImportedCookie(identity,operation,url,sourceOrigin,options={}){
    const destination=parsedHttp(url),source=parsedHttp(sourceOrigin);
    if(identity.toolId!=='cookie-editor'||operation!=='browser.cookies.setMany'||
       !destination||!source||source.origin!==sourceOrigin)
      throw failure('E_OWNER','A trusted Cookie Editor import is required');
    // Pin the source tab's existing grant, Store and installation epoch.
    const anchor=await authorizedCookie(identity,operation,sourceOrigin);
    await verifyBrowserOwner(identity,operation,destination.origin);
    if(options.storeId!==undefined&&options.storeId!==anchor.storeId)
      throw failure('E_COOKIE_STORE');
    return {origin:destination.origin,storeId:anchor.storeId,
      partitionKey:options.partitionKey??null,grantEpoch:anchor.grantEpoch};
  }
     // Chrome document binding is checked on approval and before every native write.
   async function verifyCookieImportDocument(document,origin){
     const url=parsedHttp(document?.url);
     if(!url||url.origin!==origin||document.origin!==origin||
       !Number.isSafeInteger(document.tabId)||document.tabId<0||
       !Number.isSafeInteger(document.windowId)||document.windowId<0||
       typeof document.documentId!=='string'||!document.documentId)
       throw failure('E_DOCUMENT_CHANGED','Original Cookie import document is invalid');
     const [tabs,frame]=await Promise.all([
       api.tabs.query({active:true,windowId:document.windowId}),
       api.webNavigation.getFrame({tabId:document.tabId,frameId:0})
     ]);
     const tab=Array.isArray(tabs)&&tabs.length===1?tabs[0]:null;
     if(!tab||tab.id!==document.tabId||tab.windowId!==document.windowId||
       !tab.active||tab.incognito||tab.pendingUrl||tab.url!==document.url||
       ['loading','unloaded'].includes(tab.status)||
       !frame||frame.documentId!==document.documentId||frame.url!==document.url||
       frame.documentLifecycle&&frame.documentLifecycle!=='active')
       throw failure('E_DOCUMENT_CHANGED','Original Cookie import document changed');
     return true;
   }
   const currentPageRefs=createCurrentPageReferences({api});
  const pageEnvironment=createPageEnvironmentReader({api,
    resolveTarget:(args,context)=>currentPageRefs.resolve(args,context),
    authorize:async({origin,context})=>{
      const tool=await verifyBrowserOwner(context,'browser.page.readEnvironment',origin);
      const {grants,epochs}=await readSources(api),record=grants[tool.id];
      if(record?.version!==tool.version||record.packageHash!==context.packageHash||
         record.installEpoch!==(epochs[tool.id]??null)||record.environmentSites?.[origin]!==true)
        throw failure('E_SITE_GRANT_REQUIRED','Current-page environment site consent required');
      return true;
    }});
  // Debugger exists only in an extension installed with Chrome's high-risk
  // permission. Missing native support must not disable all other Browser tools.
  const fingerprintDriver=api.debugger?.attach&&api.debugger?.sendCommand&&
    api.debugger?.detach&&api.scripting?.executeScript?
    createFingerprintDriver({api,
      resolveTarget:(refs,owner)=>currentPageRefs.resolve(refs,owner),
      readPage:(refs,owner)=>pageEnvironment.readEnvironment(refs,owner),
      authorize:async({operation,owner,origin})=>{
        const tool=await verifyBrowserOwner(owner,operation,origin);
        const {grants,epochs}=await readSources(api),grant=grants[tool.id];
        if(grant?.version!==tool.version||grant.packageHash!==owner.packageHash||
           grant.installEpoch!==(epochs[tool.id]??null)||
           grant.fingerprintSites?.[origin]!==true)
          throw failure('E_SITE_GRANT_REQUIRED','Independent fingerprint control consent required');
      }}):null;
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
  const downloadHost=createBrowserDownloadsHost({api,authorize:async({operation,context,origin})=>{
    if(context.approvedOrigin!==null&&context.approvedOrigin!==origin)
      throw failure('E_SITE_GRANT_REQUIRED','Downloaded URL changed Origin');
    await verifyBrowserOwner(context,operation,origin);
    return true;
  }});
  const bookmarkHost=createBrowserBookmarksHost({api,authorize:async({operation,context,origin})=>{
    if(context.approvedOrigin!==null&&context.approvedOrigin!==origin)
      throw failure('E_SITE_GRANT_REQUIRED','Bookmark Origin changed after approval');
    await verifyBrowserOwner(context,operation,origin);
  }});
  const fullBookmarkHost=createBrowserFullBookmarksHost({api,
     authorize:async({operation,context})=>verifyBrowserOwner(context,operation),
     verifySourcePage:async(source,context)=>{
       // Never use an Owned TabRef to authenticate an arbitrary active page.
       await currentPageRefs.verify(source,context);
       await verifyBrowserOwner(context,'browser.bookmarks.create');
     }
   });
   const bookmarkService=Object.freeze(Object.assign(Object.create(null),bookmarkHost,
     Object.fromEntries(Object.entries(fullBookmarkHost).filter(([name])=>
       name!=='revokeAll'&&name!=='observe'))));
   // Finite bindings to EXISTING scoped drivers: Sender, installed identity,
  // one-shot user intent and Origin were checked before this dispatcher runs.
  // No dynamic access to chrome[namespace][method] is permitted.
  // Bind each audited service ONCE. Approved method names are resolved at
  // startup from BROWSER_OPERATIONS and own service methods, not package data.
  // Browser Sender, one-use gesture, tool identity, scope and revoke fencing
  // remain in this existing trusted Host + each scoped Driver.
  const scopedBindings=createApprovedBrowserBindings({
    bookmarks:bookmarkService,
    'bookmarks.observe':fullBookmarkHost.observe,
    tabs:tabHost,
    downloads:downloadHost,
    'proxy.managed':createBrowserManagedProxy({api,lockManager,
      reviewedProfiles:reviewedProxyProfiles,
      authorizeEnable:owner=>verifyBrowserOwner(owner,'browser.proxy.managed.requestEnable')}),
    'storage.local':(input,owner,operation)=>executeBrowserToolStorage({
      api,operation,toolId:owner.toolId,input,
      authorize:()=>verifyBrowserOwner(owner,operation),
      onDispatch:serviceContexts.get(owner)?.onDispatch,
      recordEffect:serviceContexts.get(owner)?.recordEffect
    })
  },{
    // Approved Promise-native DIRECT calls are compiled from the pinned matrix.
    // Existing trusted Host Sender, package, permission and lifetime checks
    // apply exactly as they do for scoped service bindings.
    nativeDirect:{api,descriptors:APPROVED_BROWSER_DIRECT_BINDINGS}
  });
  const dispatchScoped=(operation,input,owner)=>scopedBindings.dispatch(operation,input,owner,{
    authorize:(method,_input,context)=>verifyBrowserOwner(context,method,context.approvedOrigin)
  });
  const trustedCookies=createTrustedCookieHost({api});
  const trustedHistory=createBrowserHistoryHost({api});
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
    trustedCookies.revoke();
    networkObserver.revokeAll();
    screenshotResources.revokeAll();
    downloadHost.revokeAll();
    bookmarkHost.revokeAll();
    fullBookmarkHost.revokeAll();
    currentPageRefs.revokeAll();
    fingerprintDriver?.revokeAll();
    browserIntents.clear();
    for(const controller of activeNetworkRequests)
      controller.abort(failure('E_GRANT_REVOKED','Installed tool authority changed during HTTP request'));
    activeNetworkRequests.clear();
    tabHost.dispose();
  }

  const SOURCE_PROOF_LIFETIME_MS=60000;
  // Source proofs send no selected text: only Chrome's native sender exposes
  // the real tab/frame/document of a trusted right-click gesture.
  function validatedSourceIdentity(message,sender){
    if(!message||!['kind,protocol','kind,protocol,snapshotId'].includes(Object.keys(message).sort().join(','))||
       message.snapshotId!==undefined&&(typeof message.snapshotId!=='string'||!/^[0-9a-f]{32}$/i.test(message.snapshotId))||
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
      at:Date.now(),epoch:captureEpoch(sender.tab.id,sender.frameId),snapshotId:message.snapshotId??null};
  }
  function noteSourceContext(message,sender){
    const source=validatedSourceIdentity(message,sender);
    if(!source||!menuActionsAvailable||!activeMenuStates.some(state=>menuOriginAllowed(state,source.origin)))return false;
    pendingSourceContexts.delete(source.key);
    recentSourceContexts.set(source.key,{
      tabId:source.tabId,frameId:source.frameId,
      documentId:source.documentId,origin:source.origin,at:source.at,snapshotId:source.snapshotId});
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
      const {tools,menus,enabled}=await readSources(api);
      let eligible=false;
      for(const tool of tools){
        if(!sidebarToolEnabled(enabled,tool.id))continue;
        const active=menus[tool.id]?.activeActions;
        if(!Array.isArray(active)||!active.length)continue;
        if(!menuOriginAllowed(menus[tool.id],source.origin))continue;
        if(menuActions(tool).some(action=>active.includes(action.actionId)&&
          matchesMenuDocument(action,source.origin))){eligible=true;break;}
      }
      if(!eligible||!await chromeSitePermitted(api,source.origin))return false;
      if(pendingSourceContexts.get(source.key)!==promise||
         captureEpoch(source.tabId,source.frameId)!==source.epoch)return false;
      recentSourceContexts.set(source.key,{
        tabId:source.tabId,frameId:source.frameId,
        documentId:source.documentId,origin:source.origin,at:source.at,snapshotId:source.snapshotId});
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
    if(frameId===0){networkObserver.invalidateTab(tabId);screenshotResources.revokeTab(tabId);trustedCookies.noteNavigation(tabId);currentPageRefs.invalidateTab(tabId);fingerprintDriver?.invalidateTab(tabId);}
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
    const launchStore=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    const retained=Object.fromEntries(Object.entries(launchStore).filter(([,row])=>validLaunch(row)));
    if(Object.keys(retained).length!==Object.keys(launchStore).length)
      await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,retained);
    if(!await permissionGranted(api)){
      menuActionsAvailable=false;
      recentSourceContexts.clear();pendingSourceContexts.clear();activeMenuStates.length=0;
      return {enabled:false,reason:'E_CHROME_PERMISSION_REQUIRED'};
    }
    const {tools,menus,enabled}=await readSources(api);
    const nextMenuStates=[],sitePermissionCache=new Map();
    const desired=new Map();
    // Synchronous Chrome runtime API: built Standard/Developer branding, not
    // untrusted tool metadata or an async fetch that could lose click gestures.
    const brand=api.runtime?.getManifest?.()||{};
    for(const tool of tools)for(const action of menuActions(tool)){
      if(!sidebarToolEnabled(enabled,tool.id))continue;
      const origins=await permittedOrigins(api,await approvedOrigins(menus,tool),sitePermissionCache);
      const patterns=scopedMenuPatterns(origins,action);
      const active=menus[tool.id]?.activeActions;
      if(!patterns.length||!Array.isArray(active)||!active.includes(action.actionId))continue;
      nextMenuStates.push({...menus[tool.id],origins:origins.filter(origin=>scopedMenuPatterns([origin],action).length)});
      const id=menuId(tool.id,action.actionId);
      desired.set(id,{id,title:formatBrowserMenuTitle(action.title,brand),contexts:action.contexts,
        documentUrlPatterns:patterns});
    }
    const before=(await api.storage.local.get(BROWSER_MENU_MATERIALIZED_STORE))[BROWSER_MENU_MATERIALIZED_STORE];
    // Legacy array = confirmed IDs. A reconciliation journal deliberately does
    // NOT claim that each ID exists. It survives a crashed SW or failed create.
    const tracked=Array.isArray(before)?before:
      before?.phase==='reconciling'&&Array.isArray(before.ids)?before.ids:[];
    const previous=[...new Set(tracked.filter(id=>typeof id==='string'&&
      (id===ROOT_OPEN||id===BROWSER_MENU_ROOT||
       /^opendesk\.tool\.[a-z][a-z0-9-]{1,39}\.[a-z][a-z0-9-]{0,39}$/.test(id))))];
    const untracked=[...desired.keys()].filter(id=>!previous.includes(id));
    if(untracked.length){
      // Durable write-ahead ownership journal, BEFORE native create(). If the
      // Worker stops after creating a menu, the next run can still remove it.
      await confirmedWrite(api.storage.local,BROWSER_MENU_MATERIALIZED_STORE,
        {phase:'reconciling',ids:[...previous,...untracked]});
    }
    const removeOwned=async id=>{
      try{await apiMenu('remove',[id]);}
      catch(error){if(!/not found|cannot find|does not exist/i.test(error.message||''))throw error;}
    };
    // Removing Chrome's old parent cascades to its children. update(id,{...})
    // does NOT safely erase an existing parentId. Never call removeAll(): other
    // trusted extension modules may own their own menu items.
    await removeOwned(BROWSER_MENU_ROOT);
    await removeOwned(ROOT_OPEN);
    for(const id of previous)
      if(id!==BROWSER_MENU_ROOT&&id!==ROOT_OPEN&&!desired.has(id))await removeOwned(id);
    // New items are TOP LEVEL. Multiple VISIBLE items collapse natively under
    // the installed extension's Manifest name, not a hand-built folder.
    for(const item of desired.values())await apiMenu('create',[item]);
    await confirmedWrite(api.storage.local,BROWSER_MENU_MATERIALIZED_STORE,[...desired.keys()]);
    menuActionsAvailable=desired.size>0;
    activeMenuStates.splice(0,activeMenuStates.length,...nextMenuStates);
    for(const [key,context] of recentSourceContexts)
      if(!activeMenuStates.some(state=>menuOriginAllowed(state,context.origin)))recentSourceContexts.delete(key);
    if(!menuActionsAvailable){recentSourceContexts.clear();pendingSourceContexts.clear();}
    return {enabled:true,count:desired.size};
  }
  const sync=()=>serial(synchronize);
  async function menuStatus(tool,owned,origin){
    if(origin!==undefined&&(!parsedHttp(origin)||new URL(origin).origin!==origin))
      throw failure('E_SCHEMA','Exact menu Origin required');
    const state=owned.menus[tool.id];
    const sites=await permittedOrigins(api,await approvedOrigins(owned.menus,tool));
    const browserPermission=await permissionGranted(api);
    const enabled=sidebarToolEnabled(owned.enabled,tool.id)&&browserPermission&&state.activeActions.length>0;
    return {operation:'browser.contextMenu.getStatus',enabled:enabled&&sites.length>0,
      approvedOrigins:sites,activeActions:state.activeActions,browserPermission,
      disabledOrigins:state.disabledOrigins,siteEnabled:origin===undefined?null:
        enabled&&menuOriginAllowed(state,origin)&&await chromeSitePermitted(api,origin)&&
          menuActions(tool).some(action=>state.activeActions.includes(action.actionId)&&matchesMenuDocument(action,origin))};
  }
  async function status(operation,tool,owned=null,identity=null){
    const op=browserOperation(operation);
    if(!op)return deniedBrowserStatus(operation);
    const sources=owned??await readSources(api);
    const origins=await permittedOrigins(api,await approvedOrigins(sources.menus,tool));
    const menu=origins.length>0;
    const isMenu=operation.startsWith('browser.contextMenu')||operation.startsWith('browser.launch')||
      operation==='browser.page.getSelection';
    const menuApiAvailable=Boolean(api.contextMenus?.create&&api.contextMenus?.onClicked);
    const approvedDirect=APPROVED_BROWSER_DIRECT_BINDINGS.find(row=>row.operation===operation);
    const directPresent=!approvedDirect||(()=>{
      const parts=approvedDirect.nativeApi.split('.');
      const namespace=Object.getOwnPropertyDescriptor(api,parts[1])?.value;
      return typeof (namespace&&Object.getOwnPropertyDescriptor(namespace,parts[2])?.value)==='function';
    })();
    const platformSupported=directPresent&&
      (!isMenu||['browser.contextMenu.getStatus','browser.contextMenu.unregister'].includes(operation)||menuApiAvailable)&&(
      operation==='browser.page.readEnvironment'?Boolean(api.scripting?.executeScript&&api.webNavigation?.getFrame&&api.tabs?.query):
      operation.startsWith('browser.fingerprint.')?Boolean(fingerprintDriver&&
        api.debugger?.attach&&api.debugger?.sendCommand&&api.debugger?.detach):
      operation==='browser.tabs.create'?Boolean(api.tabs?.create):
      operation==='browser.tabs.activateOwned'?Boolean(api.tabs?.get&&api.tabs?.update&&api.webNavigation?.getFrame):
      operation==='browser.tabs.getOwned'||operation==='browser.tabs.listOwned'?Boolean(api.tabs?.get&&api.webNavigation?.getFrame):
      operation==='browser.tabs.pinOwned'?Boolean(api.tabs?.get&&api.tabs?.update&&api.webNavigation?.getFrame):
      operation==='browser.tabs.reloadOwned'?Boolean(api.tabs?.get&&api.tabs?.reload&&api.webNavigation?.getFrame):
      operation==='browser.tabs.navigateOwned'?Boolean(api.tabs?.get&&api.tabs?.update&&api.webNavigation?.getFrame):
      operation==='browser.tabs.removeOwned'?Boolean(api.tabs?.get&&api.tabs?.remove&&api.webNavigation?.getFrame):
      operation==='browser.sidePanel.openSelf'?Boolean(api.sidePanel?.open):
      operation.startsWith('browser.scheduler.')?typeof scheduleService==='function':
      operation.startsWith('browser.storage.local.')?Boolean(api.storage?.local?.get&&api.storage?.local?.set):
      operation.startsWith('browser.proxy.managed.')?Boolean(api.proxy?.settings?.get&&api.proxy?.settings?.set&&api.proxy?.settings?.clear&&api.storage?.local?.set):
      operation==='browser.bookmarks.createOwned'?Boolean(api.bookmarks?.create&&api.storage?.local?.set):
      operation==='browser.bookmarks.removeOwned'?Boolean(api.bookmarks?.get&&api.bookmarks?.remove&&api.storage?.local?.set):
      operation.startsWith('browser.bookmarks.')?Boolean(
        api.bookmarks?.getTree&&api.bookmarks?.getSubTree&&api.bookmarks?.get&&
        api.bookmarks?.create&&api.bookmarks?.update&&api.bookmarks?.move&&
        api.bookmarks?.remove&&api.bookmarks?.removeTree&&api.bookmarks?.search):
      operation==='browser.downloads.download'?Boolean(api.downloads?.download):
      operation==='browser.downloads.getOwned'||operation==='browser.downloads.listOwned'?Boolean(api.downloads?.search):
      operation==='browser.downloads.cancelOwned'?Boolean(api.downloads?.search&&api.downloads?.cancel):
      operation.startsWith('browser.cookies.')?Boolean(api.cookies?.getAll&&api.cookies?.getAllCookieStores&&api.permissions?.contains):
      operation==='browser.network.request'?typeof fetchImpl==='function':
      operation==='browser.network.observe.start'?Boolean(api.webRequest?.onBeforeRequest?.addListener&&api.tabs?.get&&api.webNavigation?.getFrame):
      operation.startsWith('browser.network.observe.')?Boolean(api.webRequest?.onBeforeRequest?.addListener):
      operation==='browser.screenshot.captureVisible'?
        Boolean(api.tabs?.query&&api.tabs?.get&&api.webNavigation?.getFrame&&api.tabs?.captureVisibleTab&&api.downloads?.download):true);
    const hasToolCap=op.requiredCapabilities.every(cap=>tool.capabilities.includes(cap));
    const fullBookmark=op.requiredCapabilities.includes('browser.bookmarks.full');
    const fullGrant=sources.grants?.[tool.id];
    const fullBookmarkApproved=!fullBookmark||fullGrant?.bookmarkFull===true&&
      fullGrant.version===tool.version&&fullGrant.packageHash===await digestTool(tool)&&
      fullGrant.installEpoch===(sources.epochs[tool.id]??null);
    const chromium=menuApiAvailable&&await permissionGranted(api);
    const requiredBrowser=operation==='browser.contextMenu.getStatus'||(await Promise.all(op.requiredChromePermissions.map(async id=>
      id==='contextMenus'?chromium:await api.permissions?.contains?.({permissions:[id]}).catch(()=>false)===true))).every(Boolean);
    const exposure=op.supportedContexts.includes('sidebar-tool')&&hasToolCap?'allowed':'not-exposed';
    const consuming=operation==='browser.launch.consume'||operation==='browser.page.getSelection';
    let hasLaunch=true;
    if(consuming&&exposure==='allowed'){
      const rows=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
      const row=rows[tool.id];
      hasLaunch=Boolean(validLaunch(row)&&row.boundTo?.hostInstanceId===identity?.hostInstanceId&&
        row.boundTo?.toolInstance===identity?.toolInstance&&row.packageHash===await digestTool(tool)&&
        row.installEpoch===(sources.epochs[tool.id]??null)&&menuOriginAllowed(sources.menus[tool.id],row.origin)&&
        await chromeSitePermitted(api,row.origin)&&launchActionEnabled(row,tool,sources.menus));
      if(hasLaunch){
        try {
          const current=await api.webNavigation.getFrame({tabId:row.tabId,frameId:row.frameId});
          hasLaunch=Boolean(validLaunch(row)&&current?.documentId===row.documentId&&current?.url===row.url);
        }catch{hasLaunch=false;}
      }
    }
    // Clipboard availability belongs to the actual trusted front-end document;
    // the background must never claim it is callable solely from a permission.
    const frontendOnly=['browser.clipboard.writeText','browser.downloads.text','browser.page.getContext'].includes(operation);
    const needsSite=isMenu&&!['browser.contextMenu.getStatus','browser.contextMenu.unregister'].includes(operation);
    const isCookie=Boolean(cookieCapabilities[operation]);
    const grantRecord=sources.grants?.[tool.id],validGrant=grantRecord?.version===tool.version&&
      grantRecord.installEpoch===(sources.epochs[tool.id]??null)&&
      grantRecord.packageHash===await digestTool(tool);
    const desired=identity?.requestedUrl?parsedHttp(identity.requestedUrl)?.origin:null;
    const environment=operation==='browser.page.readEnvironment';
    const fingerprint=operation.startsWith('browser.fingerprint.');
    const environmentAllowed=!environment||Boolean(desired&&validGrant&&grantRecord.environmentSites?.[desired]===true&&await chromeSitePermitted(api,desired));
    const fingerprintAllowed=!fingerprint||Boolean(desired&&validGrant&&
      grantRecord.fingerprintSites?.[desired]===true&&await chromeSitePermitted(api,desired));
    const downloading=operation==='browser.downloads.download';
    // A site-scoped download cannot be reported callable without the requested
    // exact Origin and currently effective Chrome website permission.
    const downloadSiteAllowed=!downloading||(Boolean(desired)&&await chromeSitePermitted(api,desired));
    const cookieSites=validGrant?grantRecord.cookieSites||{}:{};
    const candidateOrigins=desired?[desired]:Object.keys(cookieSites);
    const cookieAuthorized=isCookie&&(await Promise.all(candidateOrigins.map(async origin=>
      (cookieSites[origin]?.[cookieCapabilities[operation]]===true||
       validGrant&&grantRecord.cookieAllSites?.storeId&&grantRecord.cookieAllSites.grantEpoch&&
       grantRecord.cookieAllSites[cookieCapabilities[operation]]===true&&
       await admittedOfficialCookie(tool))&&await chromeSitePermitted(api,origin)
    ))).some(Boolean);
    const runnable=op.implementation==='IMPLEMENTED'&&exposure==='allowed'&&platformSupported&&
      requiredBrowser&&environmentAllowed&&fingerprintAllowed&&fullBookmarkApproved&&(!needsSite||menu)&&(!isCookie||cookieAuthorized)&&downloadSiteAllowed&&hasLaunch&&!frontendOnly;
    const reasonCode=runnable?null:
      op.implementation!=='IMPLEMENTED'?'E_NOT_IMPLEMENTED':
      !hasToolCap?'E_TOOL_CAPABILITY_REQUIRED':
      !platformSupported?'E_CHROME_UNSUPPORTED':
      !requiredBrowser?'E_CHROME_PERMISSION_REQUIRED':
      !environmentAllowed?'E_SITE_GRANT_REQUIRED':
      !fingerprintAllowed?'E_SITE_GRANT_REQUIRED':
      !fullBookmarkApproved?'E_BOOKMARK_FULL_CONSENT_REQUIRED':
      needsSite&&!menu?'E_SITE_GRANT_REQUIRED':
      isCookie&&!cookieAuthorized?'E_SITE_GRANT_REQUIRED':
      !downloadSiteAllowed?'E_SITE_GRANT_REQUIRED':
      !hasLaunch?'E_LAUNCH_UNAVAILABLE':
      frontendOnly?'E_FRONTEND_CONTEXT_REQUIRED':'E_CONTEXT';
    return {operation,apiVersion:BROWSER_API_VERSION,implementation:op.implementation.toLowerCase().replaceAll('_','-'),
      exposure,platform:platformSupported?'supported':'unsupported',
      authorization:{tool:hasToolCap?'granted':'missing',browser:requiredBrowser?'granted':'missing',
        site:fingerprint?(fingerprintAllowed?'granted':'missing'):environment?(environmentAllowed?'granted':'missing'):isMenu?(menu?'granted':'missing'):isCookie?(cookieAuthorized?'granted':'missing'):
          downloading?(downloadSiteAllowed?'granted':'missing'):'not-required'},
      callableNow:runnable,requiresUserGesture:op.requiresUserGesture,reasonCode,
      nextAction:runnable?null:!hasToolCap?'update-tool-package':!platformSupported?null:
        !requiredBrowser?'enable-in-tool-details':!fullBookmarkApproved?'enable-in-tool-details':
        isCookie&&!cookieAuthorized?'enable-in-tool-details':
          isMenu&&!menu?'enable-in-tool-details':null};
  }
  function ensureToolActions(tool,args){
    const actions=menuActions(tool);
    if(!actions.length)throw failure('E_TOOL_CAPABILITY_REQUIRED','Tool does not declare context menus');
    if(args.actionIds?.some(id=>!actions.some(row=>row.actionId===id)))
      throw failure('E_TOOL_CAPABILITY_REQUIRED','Unapproved menu action ID');
    return actions;
  }
  async function handleTool({operation,args={},toolId,toolVersion,toolInstance,hostInstanceId,installEpoch,packageHash,approvalRef},sender){
    const actualHost=await checkedSender(api,sender);
    if(actualHost!==hostInstanceId||!validId(toolId)||
       typeof toolInstance!=='string'||!/^[0-9a-f-]{36}$/i.test(toolInstance))
      throw failure('E_OWNER','Browser operation is not bound to active tool document');
    return serial(()=>runLocked(toolId,async()=>{
      const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
      if(!sidebarToolEnabled(owned.enabled,toolId))
        throw failure('E_TOOL_DISABLED','Tool was disabled; existing menu and launch authority revoked');
      if(tool.version!==toolVersion||(owned.epochs[toolId]??null)!==(installEpoch??null)||
         packageHash!==await digestTool(tool))
        throw failure('E_TOOL_CHANGED','Old tool version or revoked instance');

      if(operation.startsWith('browser.fingerprint.')){
        if(!fingerprintDriver)throw failure('E_CHROME_UNSUPPORTED','Installed Chrome debugger is unavailable');
        const checked=normalizeBrowserOperation(operation,args);
        const owner={toolId,toolVersion,packageHash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),hostInstanceId,toolInstance};
        const method=operation.slice('browser.fingerprint.'.length);
        return fingerprintDriver[method](checked,owner);
      }
      if(operation==='browser.page.readEnvironment'){
        return pageEnvironment.readEnvironment(normalizeBrowserOperation(operation,args),{
          toolId,toolVersion,packageHash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),hostInstanceId,toolInstance});
      }
      if(cookieCapabilities[operation]){
        const checked=normalizeBrowserOperation(operation,args),hash=await digestTool(tool);
        const owner={toolId,toolVersion,packageHash:hash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null,
          hostInstanceId,toolInstance};
        const needsClick=intentOperations.has(operation)&&
          !(operation==='browser.cookies.clearSite'&&checked.preview===true);
        let intent=null;
        if(needsClick){
          intent=browserIntents.get(approvalRef);
          browserIntents.delete(approvalRef);
          if(!intent||Date.now()>=intent.expiresAt||intent.operation!==operation||
             intent.toolId!==toolId||intent.toolVersion!==toolVersion||
             intent.packageHash!==hash||intent.epoch!==(installEpoch??null)||
             intent.toolInstance!==toolInstance||intent.hostInstanceId!==hostInstanceId||
             intent.args!==canonicalJSON(checked))
            throw failure('E_USER_GESTURE_REQUIRED','Exact Cookie change requires a new trusted click');
        }
        const importSource=intent?.cookieImportSource;
         const importDocument=intent?.cookieImportDocument;
         if(importSource)await verifyCookieImportDocument(importDocument,importSource);
         const importOptions={storeId:checked.cookies?.[0]?.storeId,
          partitionKey:checked.cookies?.[0]?.partitionKey??null};
        const allowed=importSource
          ?await authorizedImportedCookie(owner,operation,checked.url,importSource,importOptions)
          :await authorizedCookie(owner,operation,checked.url,checked);
        if(intent&&intent.cookieGrantEpoch!==allowed.grantEpoch)
          throw failure('E_GRANT_REVOKED','Cookie site consent changed since approval');
        const ownerKey=canonicalJSON([toolId,toolVersion,hash,owner.epoch,toolInstance,hostInstanceId,allowed.grantEpoch]);
        return trustedCookies.executeInstalled(operation,checked,{origin:allowed.origin,
          storeId:allowed.storeId,partitionKey:allowed.partitionKey,ownerKey,
          authorize:async({url,includeValues})=>{
             if(importSource)await verifyCookieImportDocument(importDocument,importSource);
             const now=importSource
              ?await authorizedImportedCookie(owner,operation,url,importSource,{...importOptions,includeValues})
              :await authorizedCookie(owner,operation,url,{...checked,includeValues});
            if(now.grantEpoch!==allowed.grantEpoch||now.storeId!==allowed.storeId||
               canonicalJSON(now.partitionKey)!==canonicalJSON(allowed.partitionKey))
              throw failure('E_GRANT_REVOKED','Cookie site/store/partition grant changed during operation');
          }});
      }
      if(intentOperations.has(operation)||operation==='browser.sidePanel.openSelf'){
        const checked=normalizeBrowserOperation(operation,args),hash=await digestTool(tool);
        const owner={toolId,toolVersion,packageHash:hash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null,
          hostInstanceId,toolInstance};
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
        const approvedOrigin=operation==='browser.scheduler.create'&&checked.service!=='background'?new URL(intent.schedulerIntent.task.targetUrl).origin:
          operation==='browser.network.observe.start'?checked.origins[0]:
          ['browser.tabs.create','browser.tabs.navigateOwned','browser.network.request','browser.downloads.download','browser.bookmarks.createOwned'].includes(operation)
            ?new URL(checked.url).origin:null;
        const context={...owner,approvedOrigin};
        await verifyBrowserOwner(context,operation,approvedOrigin);
        // Clipboard requires a visible trusted extension document; downloads
        // reuse its existing Chrome download service. The Host grants only one
        // exact, user-click-approved call after checking the installed tool,
        // package hash, permission and install epoch. No export effect occurs
        // in the untrusted iframe or in this approval-only Host branch.
        if(operation==='browser.clipboard.writeText'||operation==='browser.downloads.text')
          return {authorized:true};
        if(scopedBindings.has(operation))return dispatchScoped(operation,checked,context);
        if(operation==='browser.scheduler.create'){
          if(typeof scheduleService!=='function')throw failure('E_SERVICE_UNSUPPORTED','Existing Scheduler unavailable');
          const scheduleOwner={kind:'installed-tool-owned',toolId,toolVersion,packageHash:hash,
            epoch:installEpoch??null,installEpoch:String(installEpoch??'initial-install')};
          const result=await scheduleService(operation,checked,scheduleOwner,intent.schedulerIntent);
          await verifyBrowserOwner(context,operation);
          return result;
        }
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
            // The screenshot resourceRef is an internal, consumed handoff token.
            return {status:delivery.status,bytes:photo.bytes,width:photo.width,height:photo.height};
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
          const result=await networkObserver.exportJson(checked,context);
          // The native download may have started before an Origin grant changed.
          try{await verifyBrowserOwner(context,operation,saved.origin)}
          catch{throw failure('E_OUTCOME_UNKNOWN','Download may have started before authority changed; do not retry')}
          return result;
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
      // Never let a newly bound gesture operation bypass exact one-shot
      // approval merely because it appears in the finite Binding table.
      if(scopedBindings.has(operation)){
        if(browserOperation(operation)?.requiresUserGesture)
          throw failure('E_USER_GESTURE_REQUIRED','This Browser action requires a trusted click');
        const hash=await digestTool(tool);
        const context={toolId,toolVersion,packageHash:hash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null,
          hostInstanceId,toolInstance};
        return dispatchScoped(operation,args,context);
      }
      if(operation==='browser.scheduler.listOwn'||operation==='browser.scheduler.cancelOwn'){
        const checked=normalizeBrowserOperation(operation,args),hash=await digestTool(tool);
        const owner={kind:'installed-tool-owned',toolId,toolVersion,packageHash:hash,
          epoch:installEpoch??null,installEpoch:String(installEpoch??'initial-install')};
        await verifyBrowserOwner(owner,operation);
        if(typeof scheduleService!=='function')throw failure('E_SERVICE_UNSUPPORTED','Existing Scheduler unavailable');
        const result=await scheduleService(operation,checked,owner);
        await verifyBrowserOwner(owner,operation);
        return result;
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
        // The full typed discovery list exceeds 12 KB as the Registry grows.
        // Only this read-only operation receives a bounded 32 KB exception.
        if(jsonBytes(values)>browserOperation(operation).maxResponseBytes)
          throw failure('E_LIMIT','Browser capability list exceeds response budget');
        return values;
      }
      if(operation==='browser.capabilities.getStatus'){
        normalizeBrowserOperation(operation,args);return status(args.operation,tool,owned,{hostInstanceId,toolInstance,requestedUrl:args.url});
      }
      if(operation==='browser.contextMenu.getStatus'){
        normalizeBrowserOperation(operation,args);
        ensureToolActions(tool,{});
        return menuStatus(tool,owned);
      }
      if(operation==='browser.contextMenu.register'||operation==='browser.contextMenu.unregister'){
        normalizeBrowserOperation(operation,args);
        ensureToolActions(tool,args);
        const current=owned.grants[toolId];
        const state=owned.menus[toolId];
        const origins=await permittedOrigins(api,await approvedOrigins(owned.menus,tool));
        if(operation==='browser.contextMenu.unregister'){
          // Zero-site unregister still retires old authority. Clear actions first
          // so a ticket deletion with an unknown outcome cannot revive selection.
          await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,
            {...owned.grants,[toolId]:{...current,contextMenu:storedMenuState(state,{activeActions:[]})}});
          const launches=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
          if(Object.hasOwn(launches,toolId)){
            const cleared={...launches};delete cleared[toolId];
            await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,cleared);
          }
          await synchronize();return {registered:false,actionIds:[]};
        }
        if(!origins.length)
          throw failure('E_SITE_GRANT_REQUIRED','Chrome website access is unavailable for the declared menu scope');
        if(!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome context menu permission was revoked');
        const activeActions=args.actionIds;
        const next={...owned.grants,[toolId]:{...current,contextMenu:storedMenuState(state,{activeActions})}};
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
           row.installEpoch!==(installEpoch??null)||!launchActionEnabled(row,tool,owned.menus)||
           !menuOriginAllowed(owned.menus[toolId],row.origin))
          throw failure('E_LAUNCH_EXPIRED','Menu launch expired, unbound or permission changed');
        if(!await chromeSitePermitted(api,row.origin))
          throw failure('E_SITE_PERMISSION_REVOKED','Chrome website access was revoked');
        const current=await api.webNavigation.getFrame({tabId:row.tabId,frameId:row.frameId});
        if(!current?.documentId||current.documentId!==row.documentId||current.url!==row.url)
          throw failure('E_DOCUMENT_CHANGED','Clicked document was replaced; selection discarded');
        if(!validLaunch(row))throw failure('E_LAUNCH_EXPIRED','Menu launch expired during validation');
        const next={...source,[toolId]:{...row,state:'consumed',selection:null,selectionMarkdown:null,consumedAt:Date.now()}};
        await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,next);
        if(!validLaunch(row))throw failure('E_LAUNCH_EXPIRED','Menu launch expired before delivery');
        return {ticketId:row.ticketId,toolId,actionId:row.actionId,source:{
          url:row.url,origin:row.origin,tabRef:row.tabRef},
          selection:row.selection,selectionMarkdown:row.selectionMarkdown??null,linkUrl:row.linkUrl??null,expiresAt:row.expiresAt};
      }
      throw failure('E_SERVICE_UNSUPPORTED','Browser operation is not available to installed tools');
    }));
  }
  async function handleHost({operation,toolId,enabled,scope,origin,document,launchId,toolInstance,hostInstanceId,toolVersion,installEpoch,packageHash,cookieCapability:siteCapability,targetOperation,targetArgs,cookieImportSource,approvalRef,schedulerIntent,args},sender){
    const actualHost=await checkedSender(api,sender);
    if(actualHost!==hostInstanceId)
      throw failure('E_OWNER','Wrong OpenDesk tool host');
    if(operation==='browser.history.searchTrusted')
      return trustedHistory.searchTrusted(args,{sender:await resolveToolSender(api,sender),hostInstanceId});
    // Cookie calls are HOST_ONLY: the existing Chrome sender check authenticates
    // this packaged extension document. Sandbox tool messages never enter here.
    if(operation==='browser.cookies.approve'||operation==='browser.cookies.execute'){
      const trustedSender=await resolveToolSender(api,sender);
      const caller={documentId:trustedSender.documentId,hostInstanceId:actualHost};
      return serial(()=>operation==='browser.cookies.approve'
        ?trustedCookies.approve({targetOperation,targetArgs,document,hostInstanceId},caller)
        :trustedCookies.execute({approvalRef,hostInstanceId},caller));
    }
    if(!validId(toolId))throw failure('E_OWNER','Wrong OpenDesk tool host');
    return serial(()=>runLocked(toolId,async()=>{

      if(operation==='browser.page.getContext'){
        // HOST_ONLY: the approved Side Panel is the only sender that may
        // exchange its verified current-page capture for opaque document refs.
        normalizeBrowserOperation(operation,{});
        if(typeof toolInstance!=='string'||!/^[0-9a-f-]{36}$/i.test(toolInstance))
          throw failure('E_OWNER','Current-page tool instance unavailable');
        const sources=await readSources(api),tool=admittedTool(sources.tools,toolId);
        const hash=await digestTool(tool);
        if(!sidebarToolEnabled(sources.enabled,toolId)||tool.version!==toolVersion||
           hash!==packageHash||(sources.epochs[toolId]??null)!==(installEpoch??null))
          throw failure('E_TOOL_CHANGED','Installed current-page tool changed');
        const ctx={toolId,toolVersion,packageHash:hash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),hostInstanceId,toolInstance};
        await verifyBrowserOwner(ctx,operation);
        const output=await currentPageRefs.issue({document,context:ctx});
        await verifyBrowserOwner(ctx,operation);
        return output;
      }
      // Only the packaged Host can review/revoke a site, never the sandbox RPC.
      if(operation==='browser.fingerprint.controlConsent'){
        if(enabled!==undefined&&typeof enabled!=='boolean')throw failure('E_SCHEMA');
        const site=parsedHttp(origin);
        if(!site||site.origin!==origin)throw failure('E_SCHEMA','Exact target origin required');
        if(typeof toolInstance!=='string'||!/^[0-9a-f-]{36}$/i.test(toolInstance))
          throw failure('E_OWNER','Current tool instance required');
        const source=await readSources(api),tool=admittedTool(source.tools,toolId);
        if(!sidebarToolEnabled(source.enabled,toolId))throw failure('E_TOOL_DISABLED');
        const hash=await digestTool(tool),ctx={toolId,toolVersion,packageHash,
          epoch:installEpoch??null,installEpoch:String(installEpoch??'initial-install'),
          hostInstanceId,toolInstance};
        if(hash!==packageHash||tool.version!==toolVersion||
           (source.epochs[toolId]??null)!==(installEpoch??null))
          throw failure('E_TOOL_CHANGED','Fingerprint tool package changed');
        await verifyBrowserOwner(ctx,'browser.fingerprint.apply',enabled===false?null:origin);
        const old=source.grants[toolId],same=old?.version===tool.version&&old.packageHash===hash&&
          old.installEpoch===(source.epochs[toolId]??null);
        if(enabled===undefined)return {enabled:same&&old.fingerprintSites?.[origin]===true};
        if(enabled){
          // No sandbox-provided tab ID; this Chrome document is independently
          // revalidated against the current active tab before granting.
          const issued=await currentPageRefs.issue({document,context:ctx});
          await currentPageRefs.resolve(issued,ctx);
          if(new URL(document.url).origin!==origin)throw failure('E_DOCUMENT_STALE');
        }
        const record=same?old:{version:tool.version,packageHash:hash,
          installEpoch:source.epochs[toolId]??null,origins:[],activeActions:[]};
        const fingerprintSites={...record.fingerprintSites};
        const environmentSites={...record.environmentSites};
        if(enabled){fingerprintSites[origin]=true;environmentSites[origin]=true;}
        else delete fingerprintSites[origin];
        if(Object.keys(fingerprintSites).length>64||Object.keys(environmentSites).length>64)
          throw failure('E_LIMIT','Too many reviewed fingerprint sites');
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{
          ...source.grants,[toolId]:{...record,fingerprintSites,environmentSites}});
        currentPageRefs.revokeAll();
        fingerprintDriver?.revokeAll();
        return {enabled};
      }
      if(operation==='browser.page.environmentConsent'){
        if(enabled!==undefined&&typeof enabled!=='boolean')throw failure('E_SCHEMA');
        const site=parsedHttp(origin);
        if(!site||site.origin!==origin)throw failure('E_SCHEMA');
        const source=await readSources(api),tool=admittedTool(source.tools,toolId),hash=await digestTool(tool);
        const ctx={toolId,toolVersion,packageHash,epoch:installEpoch??null};
        await verifyBrowserOwner(ctx,'browser.page.readEnvironment',enabled===false?null:origin);
        const old=source.grants[toolId],same=old?.version===tool.version&&old.packageHash===hash&&
          old.installEpoch===(source.epochs[toolId]??null);
        if(enabled===undefined)return {enabled:same&&old.environmentSites?.[origin]===true};
        if(enabled){
          // A grant is for the actual current document shown in trusted UI.
          const issued=await currentPageRefs.issue({document,context:{...ctx,
            installEpoch:String(installEpoch??'initial-install'),hostInstanceId,toolInstance}});
          await currentPageRefs.resolve(issued,{...ctx,
            installEpoch:String(installEpoch??'initial-install'),hostInstanceId,toolInstance});
          if(new URL(document.url).origin!==origin)throw failure('E_DOCUMENT_STALE');
        }
        const record=same?old:{version:tool.version,packageHash:hash,
          installEpoch:source.epochs[toolId]??null,origins:[],activeActions:[]};
        const environmentSites={...record.environmentSites};
        if(enabled)environmentSites[origin]=true;else delete environmentSites[origin];
        if(Object.keys(environmentSites).length>64)throw failure('E_LIMIT');
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{
          ...source.grants,[toolId]:{...record,environmentSites}});
        currentPageRefs.revokeAll();
        return {enabled};
      }
      if(operation==='browser.bookmarks.fullConsent'){
        if(typeof enabled!=='boolean')throw failure('E_SCHEMA','Explicit Full Bookmarks consent decision required');
        const source=await readSources(api),tool=admittedTool(source.tools,toolId);
        if(!sidebarToolEnabled(source.enabled,toolId))throw failure('E_TOOL_DISABLED');
        if(tool.version!==toolVersion||(source.epochs[toolId]??null)!==(installEpoch??null)||
           !tool.capabilities.includes('browser.bookmarks.full'))
          throw failure('E_TOOL_CHANGED','Full bookmark capability or tool version invalid');
        if(enabled&&(!api.permissions?.contains||
           !await api.permissions.contains({permissions:['bookmarks']})))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome bookmarks permission must be approved by trusted click');
        const hash=await digestTool(tool),old=source.grants[toolId];
        if(packageHash!==undefined&&packageHash!==hash)throw failure('E_TOOL_CHANGED');
        const same=old?.version===tool.version&&old.packageHash===hash&&
          old.installEpoch===(source.epochs[toolId]??null);
        const record=same?old:{version:tool.version,packageHash:hash,
          installEpoch:source.epochs[toolId]??null,origins:[],activeActions:[]};
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{
          ...source.grants,[toolId]:{...record,bookmarkFull:enabled}
        });
        fullBookmarkHost.revokeAll();
        currentPageRefs.revokeAll();
        return {enabled};
      }
      if(operation==='browser.cookies.userGrant'){
        const allSites=scope==='all-http-sites';
        if(!['read','values','write','observe','clear','all'].includes(siteCapability)||
           typeof enabled!=='boolean'||(scope!==undefined&&!allSites)||
           (allSites&&!['all','values'].includes(siteCapability)))
          throw failure('E_SCHEMA','Unsupported Cookie capability decision');
        const source=await readSources(api),tool=admittedTool(source.tools,toolId);
        if(!sidebarToolEnabled(source.enabled,toolId)||tool.version!==toolVersion||
           (source.epochs[toolId]??null)!==(installEpoch??null))
          throw failure('E_TOOL_CHANGED');
        const hash=await digestTool(tool);
        if(allSites&&packageHash!==hash)throw failure('E_TOOL_CHANGED');
        if(allSites&&enabled&&!await admittedOfficialCookie(tool))
          throw failure('E_OWNER','All-site Cookie consent requires the exact official release');
        // A custom package claiming the official tool ID cannot invoke the
        // trusted one-click site grant to enable every Cookie capability.
        // Keep explicit, single-capability consent for non-official tools.
        if(siteCapability==='all'&&enabled&&!allSites&&tool.id==='cookie-editor'&&
          !await admittedOfficialCookie(tool))
          throw failure('E_SCHEMA','Complete site Cookie consent requires the exact official release');
        if(siteCapability==='all'
          ?!tool.capabilities.some(name=>name.startsWith('browser.cookies.'))||
            enabled&&!allSites&&tool.id!=='cookie-editor'
          :!tool.capabilities.includes('browser.cookies.'+siteCapability))
          throw failure('E_TOOL_CAPABILITY_REQUIRED');
        const site=enabled?parsedHttp(document?.url)?.origin:parsedHttp(origin)?.origin;
        if((enabled||!allSites)&&(!site||!enabled&&site!==origin))
          throw failure('E_SCHEMA','Exact Cookie site Origin required');
        let storeId,partitionKey;
        if(enabled){
          if(!document||document.origin!==site||!Number.isSafeInteger(document.tabId)||
             !Number.isSafeInteger(document.windowId)||typeof document.documentId!=='string')
            throw failure('E_DOCUMENT_CHANGED');
          const [tabs,frame,perm,sitePerm]=await Promise.all([
            api.tabs.query({active:true,windowId:document.windowId}),
            api.webNavigation.getFrame({tabId:document.tabId,frameId:0}),
            api.permissions.contains({permissions:['cookies']}),chromeSitePermitted(api,site)]);
          if(!perm||!sitePerm)throw failure('E_CHROME_PERMISSION_REQUIRED');
          if(!Array.isArray(tabs)||tabs.length!==1||tabs[0].id!==document.tabId||
             tabs[0].url!==document.url||tabs[0].incognito||tabs[0].pendingUrl||
             frame?.documentId!==document.documentId||frame.url!==document.url||
             frame.documentLifecycle&&frame.documentLifecycle!=='active')
            throw failure('E_DOCUMENT_CHANGED');
          const stores=await chromeCall(api,api.cookies,'getAllCookieStores');
          const candidates=Array.isArray(stores)?stores.filter(row=>
            !row.incognito&&row.tabIds?.includes(document.tabId)):[];
          if(candidates.length!==1||typeof candidates[0].id!=='string')throw failure('E_COOKIE_STORE');
          storeId=candidates[0].id;
          if(!allSites){
            const receipt=await chromeCall(api,api.cookies,'getPartitionKey',{tabId:document.tabId,frameId:0});
            if(!receipt?.partitionKey?.topLevelSite)throw failure('E_COOKIE_PARTITION');
            partitionKey=receipt.partitionKey;
          }
          const after=await api.webNavigation.getFrame({tabId:document.tabId,frameId:0});
          if(after?.documentId!==frame.documentId||after.url!==document.url)
            throw failure('E_DOCUMENT_CHANGED','Cookie site changed while approving');
        }
        const previous=source.grants[toolId];
        const same=previous?.version===tool.version&&previous.packageHash===hash&&
          previous.installEpoch===(source.epochs[toolId]??null);
        const row=same?previous:{version:tool.version,packageHash:hash,
          installEpoch:source.epochs[toolId]??null,origins:[],activeActions:[]};
        if(allSites){
          // Old all-site values=true records without a valueConsent receipt
          // remain denied. A new explicit complete-consent click mints that
          // receipt together with all declared capabilities in one write.
          if(siteCapability==='values'){
            const prior=row.cookieAllSites;
            if(!prior?.read||!prior?.storeId||!prior?.grantEpoch)
              throw failure('E_SITE_GRANT_REQUIRED','Authorize ordinary Cookie management first');
            if(enabled&&prior.storeId!==storeId)throw failure('E_COOKIE_STORE');
            const cookieAllSites={...prior,values:enabled,valueConsent:enabled,
              grantEpoch:crypto.randomUUID()};
            await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{
              ...source.grants,[toolId]:{...row,cookieAllSites}});
            trustedCookies.revoke();
            return {scope,capability:siteCapability,enabled,storeId:cookieAllSites.storeId};
          }
          const cookieAllSites={storeId:enabled?storeId:row.cookieAllSites?.storeId??null,
            grantEpoch:crypto.randomUUID(),
            valueConsent:enabled&&tool.capabilities.includes('browser.cookies.values'),
            ...Object.fromEntries(['read','values','write','observe','clear'].map(cap=>[cap,
              enabled&&tool.capabilities.includes('browser.cookies.'+cap)]))};
          await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{
            ...source.grants,[toolId]:{...row,cookieAllSites,...(!enabled?{cookieSites:{}}:{})}});
          trustedCookies.revoke();
          return {scope,capability:siteCapability,enabled,storeId:cookieAllSites.storeId};
        }
        const sites={...(row.cookieSites||{})},prior=sites[site]||{};
        if(enabled&&Object.keys(sites).length>=20&&!Object.hasOwn(sites,site))
          throw failure('E_LIMIT','Maximum 20 Cookie websites per tool');
        if(enabled&&siteCapability==='values'&&prior.read!==true)
          throw failure('E_SITE_GRANT_REQUIRED','Read permission is required before granting sensitive values');
        // Enabling a second permission must not silently rebind the earlier
        // permission from one Cookie Store or partition to another.
        const earlier=['read','values','write','observe','clear'].some(cap=>prior[cap]===true);
        if(enabled&&earlier&&(prior.storeId!==storeId||
          canonicalJSON(prior.partitionKey??null)!==canonicalJSON(partitionKey??null)))
          throw failure('E_COOKIE_SCOPE','Site rights are bound to another Cookie Store/Partition; revoke all first');
        // A single trusted site decision grants (or revokes) every declared
        // capability in one durable write. Never rebind an earlier site grant to
        // a different Cookie Store/Partition, even for a partial legacy grant.
        const next=siteCapability==='all'
          ?enabled?{...prior,storeId,partitionKey,grantEpoch:crypto.randomUUID(),
              valueConsent:tool.capabilities.includes('browser.cookies.values'),
              ...Object.fromEntries(['read','values','write','observe','clear'].map(cap=>[cap,
                tool.capabilities.includes('browser.cookies.'+cap)]))}
            :{...prior,read:false,values:false,write:false,observe:false,clear:false,
              valueConsent:false,grantEpoch:crypto.randomUUID()}
          :enabled?{...prior,storeId,partitionKey,[siteCapability]:true,
              ...(siteCapability==='values'?{valueConsent:true}:{}),
              grantEpoch:crypto.randomUUID()}
            :{...prior,[siteCapability]:false,
              ...(siteCapability==='values'?{valueConsent:false}:{}),
              grantEpoch:crypto.randomUUID()};
        if(!enabled&&siteCapability==='read'){next.values=false;next.valueConsent=false;}
        sites[site]=next;
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,{
          ...source.grants,[toolId]:{...row,version:tool.version,packageHash:hash,
            installEpoch:source.epochs[toolId]??null,cookieSites:sites}});
        trustedCookies.revoke();
        return {origin:site,capability:siteCapability,enabled,storeId:next.storeId??null};
      }
      if(operation==='browser.intent.confirm'){
        if(!intentOperations.has(targetOperation)||typeof toolInstance!=='string'||
           !/^[0-9a-f-]{36}$/i.test(toolInstance))throw failure('E_SCHEMA','Invalid trusted action');
        const args=normalizeBrowserOperation(targetOperation,targetArgs);
        const source=await readSources(api),tool=admittedTool(source.tools,toolId);
        if(!sidebarToolEnabled(source.enabled,toolId))throw failure('E_TOOL_DISABLED');
        if(tool.version!==toolVersion||(source.epochs[toolId]??null)!==(installEpoch??null))
          throw failure('E_TOOL_CHANGED','Tool updated during approval');
        const packageHash=await digestTool(tool);
        const origin=cookieCapabilities[targetOperation]?new URL(args.url).origin:
          targetOperation==='browser.network.observe.start'?args.origins[0]:
          ['browser.tabs.create','browser.tabs.navigateOwned','browser.network.request','browser.downloads.download','browser.bookmarks.createOwned'].includes(targetOperation)
            ?new URL(args.url).origin:null;
        const identity={toolId,toolVersion,packageHash,epoch:installEpoch??null,
          installEpoch:String(installEpoch??'initial-install'),approvedOrigin:null};
        await verifyBrowserOwner(identity,targetOperation,origin);
        if(cookieImportSource!==undefined){
           if(targetOperation!=='browser.cookies.setMany'||toolId!=='cookie-editor')
             throw failure('E_OWNER','Import scope cannot authorize other Browser operations');
           await verifyCookieImportDocument(document,cookieImportSource);
         }
        const cookieGrant=cookieCapabilities[targetOperation]
          ?cookieImportSource!==undefined
            ?await authorizedImportedCookie(identity,targetOperation,args.url,cookieImportSource,{
              storeId:args.cookies?.[0]?.storeId,
              partitionKey:args.cookies?.[0]?.partitionKey??null})
            :await authorizedCookie(identity,targetOperation,args.url,args):null;
        if(targetOperation==='browser.scheduler.create'&&args.service==='background'){
          validateTrustedAppServiceScheduleIntent(schedulerIntent,args);
          await readAppServiceInstallation(api,identity.toolId);
          await verifyBrowserOwner(identity,targetOperation);
        }
        if(targetOperation==='browser.scheduler.create'&&args.service!=='background'){
          const plan=validateTrustedScheduleIntent(schedulerIntent,args);
          const site=new URL(plan.targetUrl).origin;
          if(!document||document.url!==plan.targetUrl||document.origin!==site||
             !Number.isSafeInteger(document.tabId)||!Number.isSafeInteger(document.windowId)||
             typeof document.documentId!=='string')throw failure('E_DOCUMENT_CHANGED');
          const [tabs,current]=await Promise.all([api.tabs.query({active:true,windowId:document.windowId}),
            api.webNavigation.getFrame({tabId:document.tabId,frameId:0})]);
          if(tabs.length!==1||tabs[0].id!==document.tabId||tabs[0].incognito||tabs[0].pendingUrl||
             tabs[0].url!==plan.targetUrl||current?.documentId!==document.documentId||
             current.url!==plan.targetUrl||current.documentLifecycle&&current.documentLifecycle!=='active')
            throw failure('E_DOCUMENT_CHANGED','Scheduled target document changed during approval');
          await verifyBrowserOwner(identity,targetOperation,site);
        }
        // An approval is not authority by itself. Before minting one for an owned
        // TabRef, resolve its real Chrome document and check the CURRENT website
        // grant, not just the package capability. Revoked or foreign refs must
        // fail now, not only after the user approves a misleading dialog.
        if(typeof args.tabRef==='string'){
          const target=await tabHost.resolve(args.tabRef,identity);
          if(origin!==null&&target.origin!==origin)
            throw failure('E_SITE_GRANT_REQUIRED','Requested observation origin differs from owned tab');
          await verifyBrowserOwner(identity,targetOperation,target.origin);
        }
        // A newer trusted STOP wins over any older, unspent ENABLE approval.
        // The UI may have approved ENABLE before the STOP click; never let a
        // delayed sandbox RPC reuse that consent and re-enable after STOP.
        // Running operations remain serialized by the existing Host/Driver lock.
        if(targetOperation==='browser.proxy.managed.requestDisable'){
          for(const [ref,pending] of browserIntents){
            if(pending.toolId===toolId&&pending.operation==='browser.proxy.managed.requestEnable')
              browserIntents.delete(ref);
          }
        }
        for(const [ref,intent] of browserIntents)if(Date.now()>=intent.expiresAt)browserIntents.delete(ref);
        if(browserIntents.size>=16)throw failure('E_LIMIT','Too many pending approvals');
        if(cookieImportSource!==undefined)
           await verifyCookieImportDocument(document,cookieImportSource);
         const approvalRef=crypto.randomUUID(),expiresAt=Date.now()+INTENT_TTL;
         browserIntents.set(approvalRef,{operation:targetOperation,args:canonicalJSON(args),toolId,toolVersion,
          packageHash,epoch:installEpoch??null,toolInstance,hostInstanceId:actualHost,expiresAt,
          cookieGrantEpoch:cookieGrant?.grantEpoch??null,
          ...(cookieImportSource!==undefined?{cookieImportSource,
             cookieImportDocument:Object.fromEntries(['tabId','windowId','documentId','url','origin']
               .map(key=>[key,document[key]]))}:{}),
          ...(targetOperation==='browser.scheduler.create'?{schedulerIntent:structuredClone(schedulerIntent)}:{})});
        return {approvalRef,expiresAt};
      }
      if(operation==='browser.contextMenu.getStatus'){
        const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
        if(toolVersion!==undefined&&toolVersion!==tool.version||
           packageHash!==undefined&&packageHash!==await digestTool(tool)||
           installEpoch!==undefined&&installEpoch!==(owned.epochs[toolId]??null))
          throw failure('E_TOOL_CHANGED','Menu settings belong to an old installation');
        ensureToolActions(tool,{});
        return menuStatus(tool,owned,origin);
      }
      if(operation==='browser.contextMenu.userToggle'){
        const doc=await api.webNavigation.getFrame({tabId:document?.tabId,frameId:0});
        const url=parsedHttp(document?.url);
        if(!url||doc?.documentId!==document.documentId||doc.url!==url.href||
          url.origin!==origin||typeof enabled!=='boolean')
          throw failure('E_DOCUMENT_CHANGED','Target document changed during menu approval');
        const owned=await readSources(api),tool=admittedTool(owned.tools,toolId);
        if(toolVersion!==undefined&&toolVersion!==tool.version||
           packageHash!==undefined&&packageHash!==await digestTool(tool)||
           installEpoch!==undefined&&installEpoch!==(owned.epochs[toolId]??null))
          throw failure('E_TOOL_CHANGED','Menu settings belong to an old installation');
        if(!sidebarToolEnabled(owned.enabled,toolId))
          throw failure('E_TOOL_DISABLED','Disabled tools cannot enable Chrome menus');
        if(!menuActions(tool).some(action=>matchesMenuDocument(action,url.href)))
          throw failure('E_SITE_GRANT_REQUIRED','Tool does not declare a menu on this website');
        if(enabled&&!await permissionGranted(api))
          throw failure('E_CHROME_PERMISSION_REQUIRED','Chrome menu permission must be approved by user click');
        if(enabled&&!await chromeSitePermitted(api,origin))
          throw failure('E_SITE_PERMISSION_REVOKED','Chrome website access is unavailable');
        const current=owned.grants[toolId];
        const state=owned.menus[toolId];
        const sites=state.origins.filter(site=>!['http://*','https://*'].includes(site));
        const origins=enabled?[...new Set([...sites,origin])]:sites.filter(item=>item!==origin);
        const disabledOrigins=enabled?state.disabledOrigins.filter(site=>site!==origin):[...new Set([...state.disabledOrigins,origin])];
        if(origins.length>20||disabledOrigins.length>20)throw failure('E_LIMIT','Each installed tool may manage at most 20 website exceptions');
        const activeActions=enabled?menuActions(tool).map(action=>action.actionId):
          state.activeActions;
        const next={...owned.grants,[toolId]:{...current,contextMenu:storedMenuState(state,{origins,activeActions,disabledOrigins})}};
        await confirmedWrite(api.storage.local,BROWSER_MENU_GRANTS_STORE,next);
        await synchronize();
        return {enabled,origins,disabledOrigins};
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
           row.installEpoch!==(owned.epochs[toolId]??null)||!launchActionEnabled(row,tool,owned.menus)||
          !menuOriginAllowed(owned.menus[toolId],row.origin))
          throw failure('E_LAUNCH_EXPIRED','No valid matching menu launch');
        if(!await chromeSitePermitted(api,row.origin))
          throw failure('E_SITE_PERMISSION_REVOKED','Chrome website access was revoked');
        if(row.boundTo && (row.boundTo.hostInstanceId!==actualHost||row.boundTo.toolInstance!==toolInstance))
          throw failure('E_OWNER','Launch already belongs to another tool instance');
        if(!validLaunch(row))throw failure('E_LAUNCH_EXPIRED','Menu launch expired during binding');
        const updated={...store,[toolId]:{...row,boundTo:{hostInstanceId:actualHost,toolInstance}}};
        await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,updated);
        return {bound:true,ticketId:launchId};
      }
      throw failure('E_SERVICE_UNSUPPORTED','Unknown trusted host operation');
    }));
  }
  async function clicked(info,tab,clickEpoch,sourceDocument){
    const id=String(info.menuItemId||'');
    const match=/^opendesk\.tool\.([a-z][a-z0-9-]{1,39})\.([a-z][a-z0-9-]{0,39})$/.exec(id);
    if(!match||!tab||tab.incognito||!Number.isInteger(tab.id))return;
    const [ ,toolId,actionId]=match;
    const start=Date.now(),source=await readSources(api),tool=admittedTool(source.tools,toolId);
    if(!sidebarToolEnabled(source.enabled,toolId)||!await permissionGranted(api))return;
    const action=menuActions(tool).find(row=>row.actionId===actionId);
    if(!action||!source.menus[toolId]?.activeActions?.includes(actionId))return;
    const frameId=Number.isInteger(info.frameId)?info.frameId:0;
    if(!sourceDocument||captureEpoch(tab.id,frameId)!==clickEpoch)return;
    const url=String(frameId===0?info.pageUrl||tab.url:info.frameUrl||'');
    const parsed=parsedHttp(url);
    if(!parsed||!await chromeSitePermitted(api,parsed.origin)||
      !menuOriginAllowed(source.menus[toolId],parsed.origin)||
      !matchesMenuDocument(action,url))return;
    const before=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(!before?.documentId||before.documentId!==sourceDocument.documentId||
       before.url!==url||sourceDocument.origin!==parsed.origin||
       (before.documentLifecycle&&before.documentLifecycle!=='active'))return;
    const selection=typeof info.selectionText==='string'&&jsonBytes(info.selectionText)<=MAX_SELECTION?
      info.selectionText:null;
    // Only after menu/site/document admission request the contextmenu-time
    // snapshot from that exact Chrome document, never the now-focused selection.
    let selectionMarkdown=null;
    if(selection&&sourceDocument.snapshotId&&api.tabs?.sendMessage){
      try{
        const rich=await api.tabs.sendMessage(tab.id,{protocol:BROWSER_MENU_SELECTION_PROTOCOL,
          snapshotId:sourceDocument.snapshotId,url,selection},{frameId,documentId:before.documentId});
        if(rich?.snapshotId===sourceDocument.snapshotId&&typeof rich.markdown==='string'&&
          rich.markdown.trim()&&jsonBytes(rich.markdown)<=MAX_SELECTION)selectionMarkdown=rich.markdown;
      }catch{/* Old content script or expired snapshot: retain explicit plain-text fallback. */}
    }
    // A missing / replaced document cannot be treated as the clicked selection.
    const after=await api.webNavigation.getFrame({tabId:tab.id,frameId});
    if(after?.documentId!==before.documentId||after?.url!==before.url||captureEpoch(tab.id,frameId)!==clickEpoch)return;
    const row={ticketId:crypto.randomUUID(),toolId,actionId,issuedAt:start,expiresAt:start+LIFETIME,
      windowId:tab.windowId,tabId:tab.id,tabRef:'clicked:'+crypto.randomUUID(),frameId,
      documentId:sourceDocument.documentId,url,origin:parsed.origin,selection,selectionMarkdown,
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
      !menuOriginAllowed(latest.menus[toolId],row.origin)||
      !launchActionEnabled(row,installed,latest.menus)||
      (latest.epochs[toolId]??null)!==row.installEpoch)return;
    const current=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    if(captureEpoch(tab.id,frameId)!==clickEpoch)return;
    await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{...current,[toolId]:row});
  }
  function onClicked(info,tab){
    const id=String(info.menuItemId||'');
    if(!/^opendesk\.tool\.[a-z][a-z0-9-]{1,39}\.[a-z][a-z0-9-]{0,39}$/.test(id))return;
    // No await, storage read or Broker initialization before the user gesture.
    try{const result=api.sidePanel.open(tab?.id?{tabId:tab.id}:{windowId:tab?.windowId});
      Promise.resolve(result).catch(e=>logger.warn('OpenDesk menu open',e));}
    catch(error){logger.warn('OpenDesk menu open',error);return;}
    {
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
    // Cookie site changes revoke only Cookie sessions and ephemeral approvals.
    // Never dispose unrelated owned Tabs/Network/Screenshot on a Cookie grant.
    if(area==='local'&&Object.hasOwn(changes,BROWSER_MENU_GRANTS_STORE)){
      trustedCookies.revoke();currentPageRefs.revokeAll();fingerprintDriver?.revokeAll();
    }
    if(area==='local'&&Object.hasOwn(changes,SIDEBAR_TOOL_ENABLE_STORE))
      void revokeLaunches().catch(error=>logger.warn('OpenDesk disabled-tool launch cleanup',error));
    if(area==='local'&&(Object.hasOwn(changes,SIDEBAR_TOOL_ENABLE_STORE)||
       Object.hasOwn(changes,SIDEBAR_TOOL_STORE)||
       Object.hasOwn(changes,BROWSER_MENU_GRANTS_STORE)||
       Object.hasOwn(changes,TOOL_REVOCATION_EPOCHS_STORE)))void sync().catch(e=>logger.warn('OpenDesk menu reconcile',e));
  });
  const invalidateTab=(tabId,frameId=0)=>serial(async()=>{
    if(frameId===0){currentPageRefs.invalidateTab(tabId);fingerprintDriver?.invalidateTab(tabId);}
    const rows=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    const next={...rows},invalidated=[];
    for(const [id,row] of Object.entries(rows)){
      if(row.tabId===tabId&&(frameId===0||row.frameId===frameId)){
        next[id]={...row,state:'invalidated',selection:null,selectionMarkdown:null,linkUrl:null};
        invalidated.push(id);
      }
    }
    if(invalidated.length)await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,next);
    return invalidated;
  });
  const revokePermission=()=>serial(async()=>{
    // Permission loss retires tickets, not preferences or unrelated sensitive
    // grants. Every subsequent menu use checks Chrome's live permission again.
    menuActionsAvailable=false;
    recentSourceContexts.clear();pendingSourceContexts.clear();activeMenuStates.length=0;
    await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{});
  });
  const revokeLaunches=()=>serial(async()=>{
    const rows=(await api.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
    if(Object.keys(rows).length)await confirmedWrite(api.storage.session,BROWSER_MENU_LAUNCH_STORE,{});
  });
  // Internal SW caller only. No message/Port route accepts this object or its
  // authorize closure. Reuse the original Host bindings, locks and Driver.
  async function handleService({operation,args={},binding,authorize,onDispatch,recordEffect}){
    if(!APP_SERVICE_OPERATIONS.includes(operation)||typeof authorize!=='function')throw failure('E_CAPABILITY');
    const checked=normalizeBrowserOperation(operation,args);
    return runLocked(binding?.appId,async()=>{
      const owner=Object.freeze({toolId:binding.appId});
      serviceContexts.set(owner,{binding,authorize,onDispatch,recordEffect});
      try{
        await verifyBrowserOwner(owner,operation);
        const serviceStatus=method=>({operation:method,apiVersion:BROWSER_API_VERSION,
          implementation:browserOperation(method)?.implementation.toLowerCase().replaceAll('_','-')??'not-implemented',
          exposure:APP_SERVICE_OPERATIONS.includes(method)?'allowed':'not-exposed',platform:'supported',
          authorization:{tool:APP_SERVICE_OPERATIONS.includes(method)?'granted':'missing',browser:'granted',site:'not-required'},
          callableNow:APP_SERVICE_OPERATIONS.includes(method),requiresUserGesture:false,
          reasonCode:APP_SERVICE_OPERATIONS.includes(method)?null:'E_CONTEXT',nextAction:null});
        if(operation==='browser.capabilities.list')return browserCapabilityList('app-service').filter(row=>APP_SERVICE_OPERATIONS.includes(row.operation)).map(row=>({operation:row.operation,
          implementation:row.implementation,riskLevel:row.riskLevel,requiredCapabilities:row.requiredCapabilities,
          requiredChromePermissions:row.requiredChromePermissions,status:serviceStatus(row.operation)}));
        if(operation==='browser.capabilities.getStatus')return serviceStatus(checked.operation);
        return await dispatchScoped(operation,checked,owner);
      }finally{serviceContexts.delete(owner);}
    });
  }
  return Object.freeze({synchronize:sync,handleTool,handleService,handleHost,onClicked,ensureListener,invalidateTab,revokeLaunches,revokePermission,revokeBrowserOperations,noteNavigation,noteSourceContext,receiveSourceContext});
}
