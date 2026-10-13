// Public contract and discovery metadata, not a grant store or an RPC router.
// Actual admission remains in the trusted Side Panel / Chrome host.
import {fields,fail,jsonValue,normalizeConfig} from './registry.js';
import {operationSchemas,assertBrowserSchemaCoverage,validateExportArguments} from './browser-schemas.js';
export const BROWSER_API_VERSION='1.0.0';
export const BROWSER_HOST_PROTOCOL='opendesk.browser.v1';
export const BROWSER_MENU_SOURCE_PROTOCOL='opendesk.browser.source-context.v1';
export const BROWSER_MENU_GRANTS_STORE='opendesk.browser.context-menu-grants.v1';
export const BROWSER_MENU_MATERIALIZED_STORE='opendesk.browser.context-menu-ids.v1';
export const BROWSER_MENU_LAUNCH_STORE='opendesk.browser.menu-launch.v1';
export const BROWSER_MENU_ROOT='opendesk.browser.root';
const shared={apiVersion:BROWSER_API_VERSION,platform:'chrome>=138',timeout:8000,maxRequestBytes:12000,maxResponseBytes:12000};
const USER_GESTURE_OPERATIONS=new Set([
  'browser.clipboard.writeText','browser.downloads.text','browser.downloads.download','browser.downloads.cancelOwned','browser.tabs.create',
  'browser.tabs.activateOwned','browser.tabs.pinOwned','browser.tabs.reloadOwned','browser.tabs.navigateOwned','browser.tabs.removeOwned','browser.sidePanel.openSelf','browser.network.request','browser.network.observe.start',
  'browser.network.observe.export','browser.screenshot.captureVisible',
  'browser.cookies.set','browser.cookies.remove','browser.cookies.clearSite','browser.cookies.observe.start'
]);
function entry(operation,capability,contexts,chromePermissions,effect,risk,siteScope='none',state='IMPLEMENTED',lifecycle='request'){
  return Object.freeze({...shared,operation,namespace:operation.split('.').slice(0,-1).join('.'),
    maxRequestBytes:['browser.clipboard.writeText','browser.downloads.text'].includes(operation)?170000:shared.maxRequestBytes,
    maxResponseBytes:['browser.launch.consume','browser.page.getSelection'].includes(operation)?65536:shared.maxResponseBytes,
    implementation:state,supportedContexts:Object.freeze(contexts),requiredCapabilities:capability?[capability]:[],
    requiredChromePermissions:chromePermissions,effectClass:effect,riskLevel:risk,siteScope,
    requiresUserGesture:USER_GESTURE_OPERATIONS.has(operation),lifecycle,
    inputSchema:operationSchemas(operation)?.input,outputSchema:operationSchemas(operation)?.output});
}
const tool=['sidebar-tool'],both=['sidebar-tool','page-sdk'];
export const BROWSER_OPERATIONS=Object.freeze({
  'browser.capabilities.list':entry('browser.capabilities.list',null,both,[],'read','low'),
  'browser.capabilities.getStatus':entry('browser.capabilities.getStatus',null,both,[],'read','low'),
  'browser.contextMenu.getStatus':entry('browser.contextMenu.getStatus','browser.contextMenu',tool,['contextMenus'],'read','low','approved-origin'),
  'browser.contextMenu.register':entry('browser.contextMenu.register','browser.contextMenu',tool,['contextMenus'],'write','medium','approved-origin','IMPLEMENTED','tool-install'),
  'browser.contextMenu.unregister':entry('browser.contextMenu.unregister','browser.contextMenu',tool,[],'write','low','approved-origin','IMPLEMENTED','tool-install'),
  'browser.launch.consume':entry('browser.launch.consume','browser.contextMenu',tool,[],'read','high','clicked-document','IMPLEMENTED','single-use-60s'),
  'browser.page.getContext':entry('browser.page.getContext','currentPage.read',tool,[],'read','low','current-page'),
  'browser.page.getSelection':entry('browser.page.getSelection','browser.contextMenu',tool,[],'read','high','clicked-document'),
  'browser.clipboard.writeText':entry('browser.clipboard.writeText','user.export',tool,[],'write','medium'),
  'browser.downloads.text':entry('browser.downloads.text','user.export',tool,['downloads'],'write','medium'),
  'browser.downloads.download':entry('browser.downloads.download','user.export',tool,['downloads'],'write','high','explicit-url'),
  'browser.downloads.getOwned':entry('browser.downloads.getOwned','user.export',tool,['downloads'],'read','medium','download-ref'),
  'browser.downloads.listOwned':entry('browser.downloads.listOwned','user.export',tool,['downloads'],'read','medium','owned-downloads'),
  'browser.downloads.cancelOwned':entry('browser.downloads.cancelOwned','user.export',tool,['downloads'],'write','high','download-ref'),
  'browser.tabs.create':entry('browser.tabs.create','browser.tabs',tool,['tabs'],'write','medium','explicit-url','IMPLEMENTED'),
  'browser.tabs.activateOwned':entry('browser.tabs.activateOwned','browser.tabs',tool,['tabs','webNavigation'],'write','medium','tab-ref','IMPLEMENTED'),
  'browser.tabs.getOwned':entry('browser.tabs.getOwned','browser.tabs',tool,['tabs','webNavigation'],'read','medium','tab-ref','IMPLEMENTED'),
  'browser.tabs.listOwned':entry('browser.tabs.listOwned','browser.tabs',tool,['tabs','webNavigation'],'read','medium','owned-tabs','IMPLEMENTED'),
  'browser.tabs.pinOwned':entry('browser.tabs.pinOwned','browser.tabs',tool,['tabs','webNavigation'],'write','high','tab-ref','IMPLEMENTED'),
  'browser.tabs.reloadOwned':entry('browser.tabs.reloadOwned','browser.tabs',tool,['tabs','webNavigation'],'write','high','tab-ref','IMPLEMENTED'),
  'browser.tabs.navigateOwned':entry('browser.tabs.navigateOwned','browser.tabs',tool,['tabs','webNavigation'],'write','high','same-origin-owned-tab','IMPLEMENTED'),
  'browser.tabs.removeOwned':entry('browser.tabs.removeOwned','browser.tabs',tool,['tabs','webNavigation'],'write','high','tab-ref','IMPLEMENTED'),
  'browser.sidePanel.openSelf':entry('browser.sidePanel.openSelf','browser.sidePanel',tool,['sidePanel'],'write','medium','user-gesture','IMPLEMENTED'),
  'browser.network.request':entry('browser.network.request','network',tool,[],'write','high','target-origin','IMPLEMENTED'),
  'browser.network.observe.start':entry('browser.network.observe.start','browser.network.observe',tool,['tabs','webNavigation','webRequest'],'read','high','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.network.observe.getStatus':entry('browser.network.observe.getStatus','browser.network.observe',tool,['webRequest'],'read','medium','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.network.observe.stop':entry('browser.network.observe.stop','browser.network.observe',tool,['webRequest'],'write','medium','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.network.observe.export':entry('browser.network.observe.export','browser.network.observe',tool,['webRequest','downloads'],'write','high','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.events.read':entry('browser.events.read','browser.events',tool,[],'read','medium','owned-session','IMPLEMENTED'),
  'browser.events.close':entry('browser.events.close','browser.events',tool,[],'write','low','owned-session','IMPLEMENTED'),
  'browser.screenshot.captureVisible':entry('browser.screenshot.captureVisible','browser.screenshot',tool,['tabs','webNavigation','activeTab','downloads'],'write','high','selected-tab','IMPLEMENTED'),
  'browser.operations.getStatus':entry('browser.operations.getStatus','browser.operations',tool,[],'read','low','owned-operation','IMPLEMENTED'),
  'browser.cookies.get':entry('browser.cookies.get','browser.cookies.read',tool,['cookies'],'read','high','approved-cookie-site'),
  'browser.cookies.getAll':entry('browser.cookies.getAll','browser.cookies.read',tool,['cookies'],'read','high','approved-cookie-site'),
  'browser.cookies.set':entry('browser.cookies.set','browser.cookies.write',tool,['cookies'],'write','high','approved-cookie-site'),
  'browser.cookies.remove':entry('browser.cookies.remove','browser.cookies.write',tool,['cookies'],'write','high','approved-cookie-site'),
  'browser.cookies.clearSite':entry('browser.cookies.clearSite','browser.cookies.clear',tool,['cookies'],'write','high','approved-cookie-host-only'),
  'browser.cookies.getCurrentStore':entry('browser.cookies.getCurrentStore','browser.cookies.read',tool,['cookies'],'read','high','approved-cookie-site'),
  'browser.cookies.getPartitionKey':entry('browser.cookies.getPartitionKey','browser.cookies.read',tool,['cookies'],'read','high','approved-cookie-site'),
  'browser.cookies.observe.start':entry('browser.cookies.observe.start','browser.cookies.observe',tool,['cookies'],'read','high','approved-cookie-site','IMPLEMENTED','bounded-session'),
  'browser.cookies.observe.getStatus':entry('browser.cookies.observe.getStatus','browser.cookies.observe',tool,['cookies'],'read','high','approved-cookie-site','IMPLEMENTED','bounded-session'),
  'browser.cookies.observe.read':entry('browser.cookies.observe.read','browser.cookies.observe',tool,['cookies'],'read','high','approved-cookie-site','IMPLEMENTED','bounded-session'),
  'browser.cookies.observe.stop':entry('browser.cookies.observe.stop','browser.cookies.observe',tool,['cookies'],'write','high','approved-cookie-site','IMPLEMENTED','bounded-session'),
  'browser.operations.cancel':entry('browser.operations.cancel','browser.operations',tool,[],'write','medium','owned-operation','IMPLEMENTED')
});
assertBrowserSchemaCoverage(BROWSER_OPERATIONS);
export function browserOperation(name){return Object.hasOwn(BROWSER_OPERATIONS,name)?BROWSER_OPERATIONS[name]:null;}
export function browserCapabilityList(context='sidebar-tool'){
  return Object.values(BROWSER_OPERATIONS).map(op=>({
    ...op,implementation:op.implementation,
    exposure:!op.supportedContexts.includes(context)||op.implementation==='NOT_EXPOSED'?'not-exposed':
      op.implementation==='HOST_ONLY'?'host-only':
      op.implementation==='PLANNED'?'planned':'declared'
  }));
}
export function deniedBrowserStatus(operation,context='page-sdk'){
  const op=browserOperation(operation);
  if(!op)return {operation,apiVersion:BROWSER_API_VERSION,implementation:'UNSUPPORTED',exposure:'not-exposed',platform:'unknown',callableNow:false,reasonCode:'E_SERVICE_UNSUPPORTED',nextAction:null};
  return {operation,apiVersion:BROWSER_API_VERSION,implementation:op.implementation.toLowerCase().replaceAll('_','-'),
    exposure:op.supportedContexts.includes(context)?'declared':'not-exposed',
    platform:'supported',authorization:{tool:'not-applicable',browser:'not-checked',site:'not-checked'},
    callableNow:false,nextAction:null,reasonCode:'E_CONTEXT'};
}
function approvedHttpUrl(value){
 if(typeof value!=='string'||!value||value.trim()!==value||new TextEncoder().encode(value).length>2048)throw fail('E_SCHEMA','Invalid HTTP URL');
 let url;try{url=new URL(value)}catch{throw fail('E_SCHEMA','Invalid HTTP URL')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>2048)throw fail('E_SCHEMA','Only credential-free HTTP(S) URLs');
 return url.href;
}
export function normalizeBrowserOperation(operation,args={}){
  if(!browserOperation(operation))throw fail('E_SERVICE_UNSUPPORTED','Unknown Browser SDK operation');
  switch(operation){
    case 'browser.clipboard.writeText':
    case 'browser.downloads.text': return validateExportArguments(operation,args);
    case 'browser.downloads.download':{
      fields(args,['url','filename','saveAs'],['url']);
      const url=approvedHttpUrl(args.url);
      if(args.filename!==undefined){
        if(typeof args.filename!=='string'||args.filename.length<1||args.filename.length>150||
           args.filename.startsWith('.')||args.filename.startsWith('/')||args.filename.includes('\\\\')||
           args.filename.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))||
           /[\u0000-\u001f\u007f:*?"<>|]/.test(args.filename))
          throw fail('E_SCHEMA','Unsafe relative download filename');
      }
      if(args.saveAs!==undefined&&typeof args.saveAs!=='boolean')throw fail('E_SCHEMA');
      return {url,...(args.filename!==undefined?{filename:args.filename}:{}),
        ...(args.saveAs!==undefined?{saveAs:args.saveAs}:{})};
    }
    case 'browser.downloads.getOwned':
    case 'browser.downloads.cancelOwned':
      fields(args,['downloadRef'],['downloadRef']);
      if(typeof args.downloadRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.downloadRef))
        throw fail('E_SCHEMA','Owned downloadRef required');
      return {downloadRef:args.downloadRef};
    case 'browser.downloads.listOwned':
      fields(args,['cursor','limit']);
      if(args.cursor!==undefined&&(typeof args.cursor!=='string'||
          !/^[A-Za-z0-9_-]{16,160}$/.test(args.cursor))||
         args.limit!==undefined&&(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>50))
        throw fail('E_SCHEMA','Invalid owned download cursor or limit');
      return {cursor:args.cursor,limit:args.limit??20};
    case 'browser.capabilities.list': case 'browser.contextMenu.getStatus':
    case 'browser.contextMenu.unregister': case 'browser.launch.consume':
    case 'browser.page.getContext': case 'browser.page.getSelection':
      fields(args,[]);break;
    case 'browser.capabilities.getStatus':
      fields(args,['operation','url'],['operation']);
      if(args.url!==undefined)approvedHttpUrl(args.url);
      if(typeof args.operation!=='string'||!/^browser\.[A-Za-z.]+$/.test(args.operation))throw fail('E_SCHEMA','Invalid capability name');
      break;
    case 'browser.tabs.create':
      fields(args,['url'],['url']);return {url:approvedHttpUrl(args.url)};
    case 'browser.tabs.activateOwned':
    case 'browser.tabs.getOwned':
    case 'browser.tabs.reloadOwned':
    case 'browser.tabs.removeOwned':
      fields(args,['tabRef'],['tabRef']);
      if(typeof args.tabRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.tabRef))throw fail('E_SCHEMA','Invalid tab reference');
      return {tabRef:args.tabRef};
    case 'browser.tabs.navigateOwned':{
      fields(args,['tabRef','url'],['tabRef','url']);
      if(typeof args.tabRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.tabRef))
        throw fail('E_SCHEMA','Authorized exact TabRef required');
      return {tabRef:args.tabRef,url:approvedHttpUrl(args.url)};
    }
    case 'browser.tabs.pinOwned':
      fields(args,['tabRef','pinned'],['tabRef','pinned']);
      if(typeof args.tabRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.tabRef)||
         typeof args.pinned!=='boolean')throw fail('E_SCHEMA','Owned TabRef and pinned boolean required');
      return {tabRef:args.tabRef,pinned:args.pinned};
    case 'browser.tabs.listOwned':fields(args,[]);break;
    case 'browser.sidePanel.openSelf':fields(args,[]);break;
    case 'browser.network.request': {
      fields(args,['method','url','data','config'],['method','url']);
      if(!['GET','POST','PUT','DELETE'].includes(args.method))throw fail('E_SCHEMA','Unsupported HTTP method');
      const url=approvedHttpUrl(args.url);
      if(args.data!==undefined&&!['POST','PUT'].includes(args.method))throw fail('E_SCHEMA','Body not permitted for this HTTP method');
      if(args.config!==undefined)fields(args.config,['timeout','responseType']);
      const config=normalizeConfig(args.config??{});
      if(args.data!==undefined)jsonValue(args.data);
      const normalized={method:args.method,url,config,...(args.data===undefined?{}:{data:args.data})};
      if(new TextEncoder().encode(JSON.stringify(normalized)).length>12000)throw fail('E_LIMIT','HTTP payload budget exceeded');
      return normalized;
    }
    case 'browser.screenshot.captureVisible':
      fields(args,['tabRef'],['tabRef']);
      if(typeof args.tabRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.tabRef))
        throw fail('E_SCHEMA','Authorized exact TabRef required');
      break;
    case 'browser.network.observe.start':{
      fields(args,['tabRef','origins','durationMs','maxEvents','maxBufferedBytes'],['tabRef','origins']);
      if(typeof args.tabRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.tabRef))
        throw fail('E_SCHEMA','Authorized tabRef required');
      if(!Array.isArray(args.origins)||args.origins.length!==1)
        throw fail('E_SCHEMA','Exactly one HTTP Origin is allowed');
      const verified=approvedHttpUrl(args.origins[0]);
      const origin=new URL(verified).origin;
      // URL.href inserts a slash for bare origins. Compare against the true
      // URL.origin, without permitting path, query or embedded credentials.
      if(args.origins[0]!==origin)
        throw fail('E_SCHEMA','Only exact Origin, no path, query or credentials');
      for(const [key,min,max] of [['durationMs',1,30000],['maxEvents',1,500],
        ['maxBufferedBytes',1024,524288]]){
        if(args[key]!==undefined&&(!Number.isSafeInteger(args[key])||args[key]<min||args[key]>max))
          throw fail('E_SCHEMA','Invalid '+key);
      }
      return {tabRef:args.tabRef,origins:[origin],durationMs:args.durationMs??30000,
        maxEvents:args.maxEvents??500,maxBufferedBytes:args.maxBufferedBytes??524288};
    }
    case 'browser.network.observe.getStatus':
    case 'browser.network.observe.stop':
      fields(args,['observationId'],['observationId']);
      if(typeof args.observationId!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.observationId))
        throw fail('E_SCHEMA','Invalid observation reference');
      break;
    case 'browser.network.observe.export':
      fields(args,['observationId','format'],['observationId','format']);
      if(typeof args.observationId!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.observationId)||
        args.format!=='json')throw fail('E_SCHEMA','Only owned JSON export allowed');
      break;
    case 'browser.events.read':
      fields(args,['sessionRef','cursor','limit'],['sessionRef']);
      if(typeof args.sessionRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.sessionRef)||
         (args.cursor!==undefined&&(typeof args.cursor!=='string'||!/^\d{1,10}$/.test(args.cursor)))||
         (args.limit!==undefined&&(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>100)))
         throw fail('E_SCHEMA','Invalid event cursor or limit');
      return {sessionRef:args.sessionRef,cursor:args.cursor??'0',limit:args.limit??50};
    case 'browser.operations.getStatus':
    case 'browser.operations.cancel':
      fields(args,['operationId'],['operationId']);
      if(typeof args.operationId!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.operationId))
        throw fail('E_SCHEMA','Owned operation reference required');
      break;
    case 'browser.events.close':
      fields(args,['sessionRef'],['sessionRef']);
      if(typeof args.sessionRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.sessionRef))
        throw fail('E_SCHEMA','Invalid event session reference');
      break;

    case 'browser.cookies.get':
    case 'browser.cookies.getAll':
    case 'browser.cookies.set':
    case 'browser.cookies.remove':
    case 'browser.cookies.clearSite':
    case 'browser.cookies.getCurrentStore':
    case 'browser.cookies.getPartitionKey':
    case 'browser.cookies.observe.start':
    case 'browser.cookies.observe.getStatus':
    case 'browser.cookies.observe.read':
    case 'browser.cookies.observe.stop':{
      const tail=operation.slice('browser.cookies.'.length);
      const sessionOp=tail.startsWith('observe.')&&tail!=='observe.start';
      const allowed=sessionOp?['url','sessionRef','cursor','limit']:
        tail==='observe.start'?['url','durationMs','maxEvents']:
        tail==='set'?['url','name','value','domain','path','secure','httpOnly','sameSite','expirationDate','storeId','partitionKey']:
        tail==='remove'?['url','name','domain','path','storeId','partitionKey']:
        tail==='clearSite'?['url','storeId','partitionKey','preview','previewRef','expectedCount','maxCookies']:
        tail==='get'?['url','name','domain','path','storeId','partitionKey','includeValues']:
        tail==='getAll'?['url','name','storeId','partitionKey','includeValues']:
          ['url','storeId','partitionKey'];
      fields(args,allowed,['url',...(sessionOp?['sessionRef']:[]),
        ...(tail==='set'?['name','value']:tail==='remove'?['name','domain','path']:tail==='get'?['name']:[])]);
      const url=approvedHttpUrl(args.url),out={...args,url};
      if(['get','set','remove'].includes(tail)&&
        (typeof args.name!=='string'||!args.name||args.name.length>256||/[;=\s\x00-\x1f\x7f]/.test(args.name)))
        throw fail('E_SCHEMA','Invalid Cookie name');
      if(tail==='getAll'&&args.name!==undefined&&
        (typeof args.name!=='string'||!args.name||args.name.length>256))throw fail('E_SCHEMA');
      if(args.storeId!==undefined&&(typeof args.storeId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(args.storeId)))
        throw fail('E_SCHEMA','Invalid Cookie store');
      if(args.partitionKey!==undefined){
        fields(args.partitionKey,['topLevelSite','hasCrossSiteAncestor'],['topLevelSite']);
        const site=approvedHttpUrl(args.partitionKey.topLevelSite);
        if(!site.startsWith('https://')||new URL(site).origin!==args.partitionKey.topLevelSite||
          args.partitionKey.hasCrossSiteAncestor!==undefined&&typeof args.partitionKey.hasCrossSiteAncestor!=='boolean')
          throw fail('E_SCHEMA','Invalid Cookie partition');
      }
      if(args.includeValues!==undefined&&typeof args.includeValues!=='boolean')throw fail('E_SCHEMA');
      if(tail==='set'){
        if(typeof args.value!=='string'||new TextEncoder().encode(args.value).length>4096)
          throw fail('E_SCHEMA','Invalid Cookie value');
        if(args.domain!==undefined&&(typeof args.domain!=='string'||args.domain.replace(/^\./,'').toLowerCase()!==new URL(url).hostname))
          throw fail('E_COOKIE_SCOPE','Cookie domain cannot expand site authorization');
        if(args.path!==undefined&&(typeof args.path!=='string'||!args.path.startsWith('/')||args.path.length>512||
          /[\r\n;]/.test(args.path)))throw fail('E_SCHEMA','Invalid Cookie path');
        for(const flag of ['secure','httpOnly'])if(args[flag]!==undefined&&typeof args[flag]!=='boolean')throw fail('E_SCHEMA');
        if(args.sameSite!==undefined&&!['unspecified','lax','strict','no_restriction'].includes(args.sameSite))throw fail('E_SCHEMA');
        if(args.expirationDate!==undefined&&(!Number.isFinite(args.expirationDate)||args.expirationDate<=0||args.expirationDate>253402300799))
          throw fail('E_SCHEMA');
        const https=new URL(url).protocol==='https:';
        if(args.secure&&!https||args.sameSite==='no_restriction'&&(!https||args.secure!==true)||
          args.name.startsWith('__Secure-')&&(!https||args.secure!==true)||
          args.name.startsWith('__Host-')&&(!https||args.secure!==true||args.domain!==undefined||args.path!=='/'))
          throw fail('E_COOKIE_SCOPE','Invalid secure Cookie attributes');
      }
      if(tail==='get'&&(args.domain!==undefined||args.path!==undefined)){
        if(typeof args.domain!=='string'||args.domain.length>253||
          typeof args.path!=='string'||!args.path.startsWith('/')||args.path.length>512)
          throw fail('E_SCHEMA','Exact Cookie identity requires both domain and path');
      }
      if(tail==='remove'){
        if(typeof args.domain!=='string'||args.domain.replace(/^\./,'').toLowerCase()!==new URL(url).hostname||
          typeof args.path!=='string'||!args.path.startsWith('/')||args.path.length>512)
          throw fail('E_COOKIE_SCOPE','Exact Cookie domain and path required');
      }
      if(tail==='clearSite'){
        if(args.preview!==undefined&&typeof args.preview!=='boolean')throw fail('E_SCHEMA');
        if(args.previewRef!==undefined&&
          (typeof args.previewRef!=='string'||!/^[0-9a-f-]{36}$/i.test(args.previewRef)))
          throw fail('E_SCHEMA','Clear previewRef must be an opaque Host receipt');
        if(args.expectedCount!==undefined&&(!Number.isSafeInteger(args.expectedCount)||args.expectedCount<0||args.expectedCount>50))
          throw fail('E_SCHEMA');
        if(args.maxCookies!==undefined&&(!Number.isSafeInteger(args.maxCookies)||args.maxCookies<1||args.maxCookies>50))
          throw fail('E_SCHEMA');
        if(args.preview!==true&&(args.expectedCount===undefined||args.previewRef===undefined))
          throw fail('E_SCHEMA','Clear requires the exact unexpired previewRef and expectedCount');
        if(args.preview===true&&(args.expectedCount!==undefined||args.previewRef!==undefined))
          throw fail('E_SCHEMA','Preview cannot import a previous approval');
      }
      if(tail==='observe.start'){
        if(args.durationMs!==undefined&&(!Number.isSafeInteger(args.durationMs)||args.durationMs<1000||args.durationMs>30000)||
          args.maxEvents!==undefined&&(!Number.isSafeInteger(args.maxEvents)||args.maxEvents<1||args.maxEvents>50))
          throw fail('E_SCHEMA');
      }
      if(sessionOp){
        if(typeof args.sessionRef!=='string'||!/^[0-9a-f-]{36}$/i.test(args.sessionRef))throw fail('E_SCHEMA');
        if(args.cursor!==undefined&&(typeof args.cursor!=='string'||!/^(0|[1-9][0-9]{0,9})$/.test(args.cursor))||
          args.limit!==undefined&&(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>50))
          throw fail('E_SCHEMA');
      }
      return out;
    }
    case 'browser.contextMenu.register':
      fields(args,['actionIds'],['actionIds']);
      if(!Array.isArray(args.actionIds)||!args.actionIds.length||args.actionIds.length>3||
         new Set(args.actionIds).size!==args.actionIds.length||
         !args.actionIds.every(id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(id)))
         throw fail('E_SCHEMA','Invalid context menu action IDs');
      break;
    default: throw fail('E_SERVICE_UNSUPPORTED','This Browser SDK operation is not executable');
  }
  return args;
}
