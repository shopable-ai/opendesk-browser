// One ergonomic public namespace; methods forward through the existing tool
// request boundary. The website Page SDK exposes only LOCAL status discovery.
import {BROWSER_OPERATIONS,browserCapabilityList,deniedBrowserStatus,normalizeBrowserOperation} from './browser-contract.js';
import {fail} from './registry.js';
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
    tabs:Object.freeze({open:method('browser.tabs.open'),focus:method('browser.tabs.focus')}),
    sidePanel:Object.freeze({openSelf:()=>ask('browser.sidePanel.openSelf')}),
    network:Object.freeze({request:method('browser.network.request'),
      observe:Object.freeze({start:method('browser.network.observe.start'),
        getStatus:method('browser.network.observe.getStatus'),
        stop:method('browser.network.observe.stop'),export:method('browser.network.observe.export')})}),
    events:Object.freeze({read:method('browser.events.read'),close:method('browser.events.close')})
  });
}
