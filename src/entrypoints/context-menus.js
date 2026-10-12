// Reviewed fixed same-extension classic MV3 worker sidecar. All Chrome
// event listeners are registered synchronously during importScripts.
// The Side Panel and installed tool still use the existing host identity.
import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {createContextMenuHost} from '../platform/chrome/context-menus.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_SOURCE_PROTOCOL} from '../framework/sdk/browser-contract.js';
import {reportBrowserCleanupError} from '../platform/chrome/lifecycle-errors.js';
export default defineUnlistedScript(() => {
  const api=chrome,host=createContextMenuHost({api});
  const observe=(promise,label)=>void Promise.resolve(promise).catch(error=>
    console.error('Browser menu '+label,error));
  observe(host.synchronize(),'startup sync');
  api.webNavigation.onCommitted.addListener(details=>{
    host.noteNavigation(details.tabId,details.frameId);
    observe(host.invalidateTab(details.tabId,details.frameId),'document invalidation');
  });
  api.tabs.onRemoved.addListener(tabId=>{
    host.noteNavigation(tabId,0);
    void host.invalidateTab(tabId).catch(error=>reportBrowserCleanupError(error,{
      phase:'context-menu-tab-removed',label:'Browser menu tab removal'}));
  });
  api.permissions.onRemoved.addListener(removed=>{
    if(removed.permissions?.includes('contextMenus'))observe(host.revokePermission(),'Chrome menu permission revoke');
    else if(removed.origins?.length)observe(host.revokeLaunches(),'site permission revoke');
    observe(host.synchronize(),'permissions removed');
  });
  api.permissions.onAdded?.addListener(()=>{
    // The API may not exist at SW startup while optional permission is absent.
    // Register the real Chrome native click listener synchronously once the
    // user grants it; then reconcile menus asynchronously.
    host.ensureListener();
    observe(host.synchronize(),'permissions added');
  });
  api.runtime.onInstalled?.addListener(()=>observe(host.synchronize(),'extension installed/updated'));
  api.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.protocol===BROWSER_MENU_SOURCE_PROTOCOL){
      host.receiveSourceContext(message,sender); // no site text or permission action
      return false;
    }
    if(message?.protocol!==BROWSER_HOST_PROTOCOL)return false;
    const method=message.kind==='tool'?'handleTool':message.kind==='host'?'handleHost':null;
    if(!method){sendResponse({ok:false,error:{code:'E_SERVICE_UNSUPPORTED',
      message:'Unknown Browser host route'}});return false;}
    host[method](message,sender).then(data=>sendResponse({ok:true,data}),
      error=>sendResponse({ok:false,error:{
        code:String(error?.code||'E_BROWSER').slice(0,60),
        message:String(error?.message||error).slice(0,250)}}));
    return true;
  });
});
