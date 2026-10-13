// One ergonomic public namespace; methods forward through the existing tool
// request boundary. The website Page SDK exposes only LOCAL status discovery.
import {BROWSER_OPERATIONS,browserCapabilityList,deniedBrowserStatus,normalizeBrowserOperation} from './browser-contract.js';
import {fail,fields} from './registry.js';
export function createBrowserSdk({request,context='sidebar-tool'}={}){
  const page=context==='page-sdk';
  const ask=(name,args={})=>{
    normalizeBrowserOperation(name,args);
    if(page||typeof request!=='function')return Promise.reject(fail('E_CONTEXT','This browser operation needs an installed tool'));
    return request(name,args);
  };
  const capabilities=Object.freeze({
    list:()=>page?Promise.resolve(browserCapabilityList('page-sdk')):ask('browser.capabilities.list'),
    getStatus:input=>{
      const args=input??{};
      normalizeBrowserOperation('browser.capabilities.getStatus',args);
      return page?Promise.resolve(deniedBrowserStatus(args.operation)):
        ask('browser.capabilities.getStatus',args);
    }
  });
  if(page)return Object.freeze({apiVersion:'1.0.0',capabilities,
    // Explicit denial does not add any browser method to the admitted Page RPC list.
    contextMenu:Object.freeze({register:()=>Promise.reject(fail('E_CONTEXT','Page SDK cannot register context menus'))})});
  const method=(name)=>args=>ask(name,args??{});
  // Public developer convenience, not a second RPC operation or a new grant.
  // A watch remains an opaque, tool-owned session: each handle method uses the
  // SAME canonical browser.* operation and trusted Host authority as the
  // explicit network.observe.start / events.read / operations.cancel methods.
  const watch=async args=>{
    fields(args,['tabRef','origin','durationMs','maxEvents','maxBufferedBytes'],['tabRef','origin']);
    const {origin,...options}=args;
    const started=await ask('browser.network.observe.start',{...options,origins:[origin]});
    if(typeof started?.observationId!=='string'||
       !/^[A-Za-z0-9_-]{16,160}$/.test(started.observationId)||
       started.operationId!==started.observationId||
       !Number.isFinite(started.expiresAt)||started.status!=='running')
      throw fail('E_OUTCOME_UNKNOWN','Browser Host returned an invalid network observation receipt');
    const observationId=started.observationId,operationId=started.operationId;
    const read=(input={})=>{
      fields(input,['cursor','limit']);
      return ask('browser.events.read',{...input,sessionRef:observationId});
    };
    const exportJson=(input={})=>{
      fields(input,['format']);
      return ask('browser.network.observe.export',{
        observationId,format:input.format??'json'
      });
    };
    return Object.freeze({
      id:observationId,expiresAt:started.expiresAt,
      read,
      status:()=>ask('browser.network.observe.getStatus',{observationId}),
      stop:()=>ask('browser.network.observe.stop',{observationId}),
      export:exportJson,
      cancel:()=>ask('browser.operations.cancel',{operationId}),
      close:()=>ask('browser.events.close',{sessionRef:observationId})
    });
  };
  return Object.freeze({apiVersion:'1.0.0',capabilities,
    contextMenu:Object.freeze({getStatus:()=>ask('browser.contextMenu.getStatus'),
      register:method('browser.contextMenu.register'),unregister:()=>ask('browser.contextMenu.unregister')}),
    launch:Object.freeze({consume:()=>ask('browser.launch.consume')}),
    page:Object.freeze({getContext:()=>ask('browser.page.getContext'),getSelection:()=>ask('browser.page.getSelection')}),
    clipboard:Object.freeze({writeText:text=>ask('browser.clipboard.writeText',{text})}),
    downloads:Object.freeze({text:method('browser.downloads.text'),
      download:method('browser.downloads.download'),getOwned:method('browser.downloads.getOwned'),
      listOwned:method('browser.downloads.listOwned'),cancelOwned:method('browser.downloads.cancelOwned')}),
    bookmarks:Object.freeze({create:method('browser.bookmarks.create'),
      removeOwned:method('browser.bookmarks.removeOwned')}),
    storage:Object.freeze({local:Object.freeze({
      get:method('browser.storage.local.get'),set:method('browser.storage.local.set'),
      remove:method('browser.storage.local.remove'),clear:method('browser.storage.local.clear')})}),
    tabs:Object.freeze({create:method('browser.tabs.create'),activateOwned:method('browser.tabs.activateOwned'),
      getOwned:method('browser.tabs.getOwned'),listOwned:method('browser.tabs.listOwned'),
      pinOwned:method('browser.tabs.pinOwned'),
      reloadOwned:method('browser.tabs.reloadOwned'),
      navigateOwned:method('browser.tabs.navigateOwned'),
      removeOwned:method('browser.tabs.removeOwned')}),
    cookies:Object.freeze({
      get:method('browser.cookies.get'),getAll:method('browser.cookies.getAll'),
      set:method('browser.cookies.set'),remove:method('browser.cookies.remove'),
      clearSite:method('browser.cookies.clearSite'),
      getCurrentStore:method('browser.cookies.getCurrentStore'),
      getPartitionKey:method('browser.cookies.getPartitionKey'),
      observe:Object.freeze({start:method('browser.cookies.observe.start'),
        getStatus:method('browser.cookies.observe.getStatus'),
        read:method('browser.cookies.observe.read'),stop:method('browser.cookies.observe.stop')})
    }),
    sidePanel:Object.freeze({openSelf:()=>ask('browser.sidePanel.openSelf')}),
    network:Object.freeze({request:method('browser.network.request'),watch,
      observe:Object.freeze({start:method('browser.network.observe.start'),
        getStatus:method('browser.network.observe.getStatus'),
        stop:method('browser.network.observe.stop'),export:method('browser.network.observe.export')})}),
    events:Object.freeze({read:method('browser.events.read'),close:method('browser.events.close')}),
    screenshot:Object.freeze({captureVisible:method('browser.screenshot.captureVisible')}),
    operations:Object.freeze({getStatus:method('browser.operations.getStatus'),
      cancel:method('browser.operations.cancel')})
  });
}
