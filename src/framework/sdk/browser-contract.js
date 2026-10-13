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
  'browser.clipboard.writeText','browser.downloads.text','browser.tabs.open',
  'browser.tabs.focus','browser.tabs.closeOwned','browser.sidePanel.openSelf','browser.network.request','browser.network.observe.start',
  'browser.network.observe.export','browser.screenshot.captureVisible'
]);
function entry(operation,capability,contexts,chromePermissions,effect,risk,siteScope='none',state='IMPLEMENTED',lifecycle='request'){
  return Object.freeze({...shared,
    maxRequestBytes:['browser.clipboard.writeText','browser.downloads.text'].includes(operation)?150100:12000,
    maxResponseBytes:['browser.launch.consume','browser.page.getSelection'].includes(operation)?20000:12000,
    operation,namespace:operation.split('.').slice(0,-1).join('.'),
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
  'browser.tabs.open':entry('browser.tabs.open','browser.tabs',tool,['tabs'],'write','medium','explicit-url','IMPLEMENTED'),
  'browser.tabs.focus':entry('browser.tabs.focus','browser.tabs',tool,['tabs'],'write','medium','tab-ref','IMPLEMENTED'),
  'browser.tabs.getOwned':entry('browser.tabs.getOwned','browser.tabs',tool,['tabs','webNavigation'],'read','medium','tab-ref','IMPLEMENTED'),
  'browser.tabs.listOwned':entry('browser.tabs.listOwned','browser.tabs',tool,['tabs','webNavigation'],'read','medium','owned-tabs','IMPLEMENTED'),
  'browser.tabs.closeOwned':entry('browser.tabs.closeOwned','browser.tabs',tool,['tabs','webNavigation'],'write','high','tab-ref','IMPLEMENTED'),
  'browser.sidePanel.openSelf':entry('browser.sidePanel.openSelf','browser.sidePanel',tool,['sidePanel'],'write','medium','user-gesture','IMPLEMENTED'),
  'browser.network.request':entry('browser.network.request','network',tool,[],'write','high','target-origin','IMPLEMENTED'),
  'browser.network.observe.start':entry('browser.network.observe.start','browser.network.observe',tool,['webRequest'],'read','high','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.network.observe.getStatus':entry('browser.network.observe.getStatus','browser.network.observe',tool,['webRequest'],'read','medium','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.network.observe.stop':entry('browser.network.observe.stop','browser.network.observe',tool,['webRequest'],'write','medium','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.network.observe.export':entry('browser.network.observe.export','browser.network.observe',tool,['webRequest','downloads'],'write','high','approved-tab','IMPLEMENTED','bounded-session'),
  'browser.events.read':entry('browser.events.read','browser.events',tool,[],'read','medium','owned-session','IMPLEMENTED'),
  'browser.events.close':entry('browser.events.close','browser.events',tool,[],'write','low','owned-session','IMPLEMENTED'),
  'browser.screenshot.captureVisible':entry('browser.screenshot.captureVisible','browser.screenshot',tool,['activeTab','downloads'],'write','high','selected-tab','IMPLEMENTED'),
  'browser.operations.getStatus':entry('browser.operations.getStatus','browser.operations',tool,[],'read','low','owned-operation','IMPLEMENTED'),
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
    case 'browser.capabilities.list': case 'browser.contextMenu.getStatus':
    case 'browser.contextMenu.unregister': case 'browser.launch.consume':
    case 'browser.page.getContext': case 'browser.page.getSelection':
      fields(args,[]);break;
    case 'browser.capabilities.getStatus':
      fields(args,['operation'],['operation']);
      if(typeof args.operation!=='string'||!/^browser\.[A-Za-z.]+$/.test(args.operation))throw fail('E_SCHEMA','Invalid capability name');
      break;
    case 'browser.tabs.open':
      fields(args,['url'],['url']);return {url:approvedHttpUrl(args.url)};
    case 'browser.tabs.focus':
    case 'browser.tabs.getOwned':
    case 'browser.tabs.closeOwned':
      fields(args,['tabRef'],['tabRef']);
      if(typeof args.tabRef!=='string'||!/^[A-Za-z0-9_-]{16,160}$/.test(args.tabRef))throw fail('E_SCHEMA','Invalid tab reference');
      return {tabRef:args.tabRef};
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
