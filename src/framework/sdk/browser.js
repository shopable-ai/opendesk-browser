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
    getStatus:({operation}={})=>page?Promise.resolve(deniedBrowserStatus(operation)):ask('browser.capabilities.getStatus',{operation})
  });
  if(page)return Object.freeze({apiVersion:'1.0.0',capabilities,
    // Explicit denial does not add any browser method to the admitted Page RPC list.
    contextMenu:Object.freeze({register:()=>Promise.reject(fail('E_CONTEXT','Page SDK cannot register context menus'))})});
  const method=(name)=>args=>ask(name,args??{});
  return Object.freeze({apiVersion:'1.0.0',capabilities,
    contextMenu:Object.freeze({getStatus:()=>ask('browser.contextMenu.getStatus'),
      register:method('browser.contextMenu.register'),unregister:()=>ask('browser.contextMenu.unregister')}),
    launch:Object.freeze({consume:()=>ask('browser.launch.consume')}),
    page:Object.freeze({getContext:()=>ask('browser.page.getContext'),getSelection:()=>ask('browser.page.getSelection')}),
    clipboard:Object.freeze({writeText:text=>ask('browser.clipboard.writeText',{text})}),
    downloads:Object.freeze({text:method('browser.downloads.text')})
  });
}
