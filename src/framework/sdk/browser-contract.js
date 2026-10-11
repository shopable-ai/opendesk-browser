// Public contract and discovery metadata, not a grant store or an RPC router.
// Actual admission remains in the trusted Side Panel / Chrome host.
import {fields,fail} from './registry.js';
export const BROWSER_API_VERSION='1.0.0';
export const BROWSER_HOST_PROTOCOL='opendesk.browser.v1';
export const BROWSER_MENU_SOURCE_PROTOCOL='opendesk.browser.source-context.v1';
export const BROWSER_MENU_GRANTS_STORE='opendesk.browser.context-menu-grants.v1';
export const BROWSER_MENU_MATERIALIZED_STORE='opendesk.browser.context-menu-ids.v1';
export const BROWSER_MENU_LAUNCH_STORE='opendesk.browser.menu-launch.v1';
export const BROWSER_MENU_ROOT='opendesk.browser.root';
const shared={apiVersion:BROWSER_API_VERSION,platform:'chrome>=138',timeout:8000,maxRequestBytes:12000,maxResponseBytes:12000};
function entry(operation,capability,contexts,chromePermissions,effect,risk,siteScope='none',state='IMPLEMENTED',lifecycle='request'){
  return Object.freeze({...shared,operation,namespace:operation.split('.').slice(0,-1).join('.'),
    implementation:state,supportedContexts:Object.freeze(contexts),requiredCapabilities:capability?[capability]:[],
    requiredChromePermissions:chromePermissions,effectClass:effect,riskLevel:risk,siteScope,
    requiresUserGesture:false,lifecycle,
    inputSchema:'strict-operation-specific',outputSchema:'versioned-json'});
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
  'browser.tabs.open':entry('browser.tabs.open','browser.tabs',tool,['tabs'],'write','medium','explicit-url','PLANNED'),
  'browser.tabs.focus':entry('browser.tabs.focus','browser.tabs',tool,['tabs'],'write','medium','tab-ref','PLANNED'),
  'browser.sidePanel.openSelf':entry('browser.sidePanel.openSelf','browser.sidePanel',tool,['sidePanel'],'write','medium','user-gesture','PLANNED'),
  'browser.network.request':entry('browser.network.request','network',tool,[],'write','high','target-origin','HOST_ONLY'),
  'browser.network.observe.start':entry('browser.network.observe.start','browser.network.observe',tool,['webRequest'],'read','high','approved-tab','PLANNED','bounded-session'),
  'browser.network.observe.getStatus':entry('browser.network.observe.getStatus','browser.network.observe',tool,['webRequest'],'read','medium','approved-tab','PLANNED','bounded-session'),
  'browser.network.observe.stop':entry('browser.network.observe.stop','browser.network.observe',tool,['webRequest'],'write','medium','approved-tab','PLANNED','bounded-session'),
  'browser.network.observe.export':entry('browser.network.observe.export','browser.network.observe',tool,['webRequest'],'read','high','approved-tab','PLANNED','bounded-session'),
  'browser.events.read':entry('browser.events.read','browser.events',tool,[],'read','medium','owned-session','PLANNED'),
  'browser.events.close':entry('browser.events.close','browser.events',tool,[],'write','low','owned-session','PLANNED'),
  'browser.screenshot.captureVisible':entry('browser.screenshot.captureVisible','browser.screenshot',tool,['activeTab'],'read','high','selected-tab','HOST_ONLY'),
  'browser.media.recording.prepare':entry('browser.media.recording.prepare','browser.media.recording',tool,[],'write','high','visible-user-consent','PLANNED'),
  'browser.media.recording.getStatus':entry('browser.media.recording.getStatus','browser.media.recording',tool,[],'read','medium','owned-session','PLANNED'),
  'browser.media.recording.stop':entry('browser.media.recording.stop','browser.media.recording',tool,[],'write','medium','owned-session','PLANNED'),
  'browser.media.recording.discard':entry('browser.media.recording.discard','browser.media.recording',tool,[],'write','medium','owned-session','PLANNED'),
  'browser.speech.transcribe':entry('browser.speech.transcribe','browser.speech',tool,[],'read','high','explicit-audio','PLANNED'),
  'browser.speech.speak':entry('browser.speech.speak','browser.speech',tool,[],'write','medium','user-output','PLANNED'),
  'browser.speech.stop':entry('browser.speech.stop','browser.speech',tool,[],'write','low','owned-session','PLANNED'),
  'browser.notifications.create':entry('browser.notifications.create','browser.notifications',tool,['notifications'],'write','medium','none','NOT_EXPOSED'),
  'browser.notifications.clear':entry('browser.notifications.clear','browser.notifications',tool,['notifications'],'write','low','none','NOT_EXPOSED'),
  'browser.operations.getStatus':entry('browser.operations.getStatus','browser.operations',tool,[],'read','low','owned-operation','PLANNED'),
  'browser.operations.cancel':entry('browser.operations.cancel','browser.operations',tool,[],'write','medium','owned-operation','PLANNED')
});
export function browserOperation(name){return Object.hasOwn(BROWSER_OPERATIONS,name)?BROWSER_OPERATIONS[name]:null;}
export function browserCapabilityList(context='sidebar-tool'){
  return Object.values(BROWSER_OPERATIONS).map(op=>({
    ...op,implementation:op.implementation,exposure:op.supportedContexts.includes(context)?'declared':'not-exposed'
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
export function normalizeBrowserOperation(operation,args={}){
  if(!browserOperation(operation))throw fail('E_SERVICE_UNSUPPORTED','Unknown Browser SDK operation');
  switch(operation){
    case 'browser.capabilities.list': case 'browser.contextMenu.getStatus':
    case 'browser.contextMenu.unregister': case 'browser.launch.consume':
    case 'browser.page.getContext': case 'browser.page.getSelection':
      fields(args,[]);break;
    case 'browser.capabilities.getStatus':
      fields(args,['operation'],['operation']);
      if(typeof args.operation!=='string'||!/^browser\.[A-Za-z.]+$/.test(args.operation))throw fail('E_SCHEMA','Invalid capability name');
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
