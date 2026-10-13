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
  // These two existing methods use approved legacy UI operations, not Browser Host RPC.
  const legacy=(name,alias)=>args=>{
    normalizeBrowserOperation(name,args);
    if(typeof request!=='function')return Promise.reject(fail('E_CONTEXT','This browser operation needs an installed tool'));
    return request(alias,args);
  };
  return Object.freeze({apiVersion:'1.0.0',capabilities,
    contextMenu:Object.freeze({getStatus:()=>ask('browser.contextMenu.getStatus'),
      register:method('browser.contextMenu.register'),unregister:()=>ask('browser.contextMenu.unregister')}),
    launch:Object.freeze({consume:()=>ask('browser.launch.consume')}),
    page:Object.freeze({getContext:()=>ask('browser.page.getContext'),getSelection:()=>ask('browser.page.getSelection')}),
    clipboard:Object.freeze({writeText:text=>legacy('browser.clipboard.writeText','clipboard.writeText')({text})}),
    downloads:Object.freeze({text:legacy('browser.downloads.text','file.download')}),
    tabs:Object.freeze({create:method('browser.tabs.create'),activateOwned:method('browser.tabs.activateOwned'),
      getOwned:method('browser.tabs.getOwned'),listOwned:method('browser.tabs.listOwned'),
      pinOwned:method('browser.tabs.pinOwned'),
      removeOwned:method('browser.tabs.removeOwned')}),
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
