// One-shot, unprivileged Side Panel locator. This selects an installed UI only;
// package identity, enablement, draft guards and permissions remain with Host.
import {validToolId} from '../../tool-document-url.js';

export const PANEL_TOOL_INTENT_PREFIX='opendesk.sidebar.tool-intent.v1.';
export const PANEL_TOOL_INTENT_TTL_MS=30000;
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const validId=value=>Number.isSafeInteger(value)&&value>=0;

export function panelToolIntentKey(windowId){
  if(!validId(windowId))throw new TypeError('Invalid window ID');
  return PANEL_TOOL_INTENT_PREFIX+windowId;
}

export function createPanelToolIntent({windowId,tabId,toolId,
  requestId=globalThis.crypto?.randomUUID?.(),issuedAt=Date.now()}={}){
  if(!validId(windowId)||!validId(tabId)||!validToolId(toolId)||
    typeof requestId!=='string'||!UUID.test(requestId)||
    !Number.isSafeInteger(issuedAt)||issuedAt<0)
    throw new TypeError('Invalid Side Panel tool intent');
  return {version:1,windowId,tabId,toolId,requestId,issuedAt};
}

export function validPanelToolIntent(value,{windowId,now=Date.now()}={}){
  return value?.version===1&&validId(windowId)&&value.windowId===windowId&&
    validId(value.tabId)&&validToolId(value.toolId)&&
    typeof value.requestId==='string'&&UUID.test(value.requestId)&&
    Number.isSafeInteger(value.issuedAt)&&
    value.issuedAt<=now&&now-value.issuedAt<=PANEL_TOOL_INTENT_TTL_MS;
}

// Register only on the actual native Side Panel, never on an extension tool tab.
// The change listener covers an already-open panel; the initial read covers
// a new panel whose listener was not yet registered when the user clicked.
export function createPanelToolIntentReceiver({api,onOpen,now=Date.now,
  onError=error=>console.warn('Side Panel tool navigation',error)}={}){
  if(typeof api?.storage?.session?.get!=='function'||
     typeof api.storage.session.remove!=='function'||
     typeof api.storage.onChanged?.addListener!=='function'||
     typeof onOpen!=='function')throw new TypeError('Side Panel route receiver unavailable');
  let key=null,windowId=null,disposed=false,running=false,recheck=false,lastRequestId=null;
  async function deliver(){
    if(disposed||!key)return;
    if(running){recheck=true;return;}
    running=true;
    try{
      const record=(await api.storage.session.get(key))?.[key];
      if(disposed||!record)return;
      if(validPanelToolIntent(record,{windowId,now:now()})&&
         lastRequestId!==record.requestId){
        lastRequestId=record.requestId;
        try{await onOpen(record.toolId);}
        catch(error){if(!disposed)onError(error);}
      }
      // Never clear a newer request written while a previous one was opening.
      const current=(await api.storage.session.get(key))?.[key];
      if(!disposed&&current?.requestId===record.requestId)
        await api.storage.session.remove(key);
    }catch(error){if(!disposed)onError(error);}
    finally{
      running=false;
      if(recheck&&!disposed){recheck=false;void deliver();}
    }
  }
  const onChanged=(changes,area)=>{
    if(area==='session'&&key&&Object.hasOwn(changes,key))void deliver();
  };
  return Object.freeze({
    start(id){
      if(disposed||key)throw new TypeError('Side Panel route already started');
      key=panelToolIntentKey(id);windowId=id;
      api.storage.onChanged.addListener(onChanged);
      void deliver();
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      if(key)api.storage.onChanged.removeListener?.(onChanged);
      key=null;
    }
  });
}
