// Fixed-source user-gesture bridge for the ChatGPT OD brand button.
import {createPanelToolIntent,panelToolIntentKey} from '../../../../src/ui/sidebar-tools/panel-tool-intent.js';
// This reuses OpenDesk's existing native Chrome Side Panel, not a second Host.
// No storage request, timer or promise is allowed before sidePanel.open.
export const PROMPT_RAIL_OPEN_PROTOCOL='opendesk.prompt-shortcuts.rail-open.v1';
const validChatgptUrl=value=>{
  if(typeof value!=='string'||value.length>2048)return false;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&url.hostname==='chatgpt.com'&&
      !url.username&&!url.password;
  }catch{return false;}
};
export function handlePromptRailOpen({api=globalThis.chrome,message,sender,respond}={}){
  if(message?.protocol!==PROMPT_RAIL_OPEN_PROTOCOL)return false;
  const answer=typeof respond==='function'?respond:()=>{};
  // Bind the request to an extension-owned, top-frame, non-incognito tab.
  // Untrusted websites cannot invoke this privileged browser operation.
  if(sender?.id!==api?.runtime?.id||sender?.frameId!==0||
     sender?.documentLifecycle&&sender.documentLifecycle!=='active'||
     !Number.isSafeInteger(sender?.tab?.id)||sender.tab.id<0||
     !Number.isSafeInteger(sender?.tab?.windowId)||sender.tab.windowId<0||
     sender.tab.incognito||!validChatgptUrl(sender.url)||
     !validChatgptUrl(sender.tab.url)||!validChatgptUrl(message.expectedUrl)||
     new URL(sender.url).origin!==new URL(message.expectedUrl).origin){
    answer({ok:false,error:{code:'E_SENDER'}});return true;
  }
  if(typeof api?.sidePanel?.open!=='function'){
    answer({ok:false,error:{code:'E_CHROME_UNSUPPORTED'}});return true;
  }
  if(typeof api?.storage?.session?.set!=='function'){
    answer({ok:false,error:{code:'E_ROUTE_UNAVAILABLE'}});return true;
  }
  // Chrome's transient gesture is consumed synchronously, before any await.
  // The one-shot session locator is UI navigation only, not tool authority.
  let opening;
  try{opening=api.sidePanel.open({windowId:sender.tab.windowId});}
  catch{answer({ok:false,error:{code:'E_SIDE_PANEL'}});return true;}
  // Publish the one-shot locator only when Chrome confirms its native panel
  // opened. A rejected gesture must not leave a stale route in session storage.
  // sidePanel.open itself remains synchronous above (Chrome user activation).
  Promise.resolve(opening).then(()=>{
    try{
      const route=createPanelToolIntent({
        windowId:sender.tab.windowId,tabId:sender.tab.id,toolId:'prompt-shortcuts'
      });
      return Promise.resolve(api.storage.session.set({
        [panelToolIntentKey(sender.tab.windowId)]:route
      })).then(
        ()=>answer({ok:true,data:{opened:true}}),
        ()=>answer({ok:false,error:{code:'E_ROUTE_UNAVAILABLE'}}));
    }catch{
      answer({ok:false,error:{code:'E_ROUTE_UNAVAILABLE'}});
    }
  },()=>answer({ok:false,error:{code:'E_SIDE_PANEL'}}));
  return true;
}
